/**
 * @file chat.ts
 *
 * This file implements the main chat interface for the AI Assistant plugin in Obsidian.
 * It defines the ChatView class, which manages the chat UI, message flow, streaming responses,
 * tool/agent integration, and persistent chat history. The view supports advanced features such as
 * agent mode (tool use), reference note context, message regeneration, and real-time tool result display.
 *
 * Key responsibilities:
 * - Rendering and updating the chat UI
 * - Handling user input and assistant responses (including streaming)
 * - Integrating with tools/agents for advanced AI actions
 * - Persisting and restoring chat history
 * - Managing context (system prompt, reference note, etc.)
 * - Supporting message regeneration and error handling
 */

import { ItemView, WorkspaceLeaf, Notice } from 'obsidian';
import MyPlugin from './main';
import { Message, ToolCommand, ToolResult, ToolExecutionResult } from './types';
import { ChatHistoryManager, ChatMessage } from './components/chat/ChatHistoryManager';
import { createMessageElement } from './components/chat/Message';
import { createChatUI, ChatUIElements } from './components/chat/ui';
import { handleCopyAll, handleSaveNote, handleClearChat, handleSettings, handleHelp } from './components/chat/eventHandlers';
import { loadChatYamlAndApplySettings } from './components/chat/chatPersistence';
import { renderChatHistory } from './components/chat/chatHistoryUtils';
import { AgentResponseHandler } from './components/agent/AgentResponseHandler';
import { buildContextMessages, truncateMessagesForContext } from './utils/contextBuilder';
import { MessageRegenerator } from './components/chat/MessageRegenerator';
import { showNotice } from './utils/generalUtils';
import { ResponseStreamer } from './components/chat/ResponseStreamer';
import { StreamCoordinator } from './services/chat/StreamCoordinator';
import { IEventBus } from './services/interfaces';
import { MessageRenderer } from './components/agent/MessageRenderer';
import { ToolRichDisplay } from './components/agent/ToolRichDisplay';
import { SourceModeRenderer } from './components/chat/SourceModeRenderer';
import { MessageContextPool, WeakCache, PreAllocatedArrays } from './utils/objectPool';
import { DOMBatcher } from './utils/domBatcher';
import { handleChatError, withErrorHandling } from './utils/errorHandler';
import { AsyncDebouncer, AsyncOptimizerFactory } from './utils/asyncOptimizer';
import { calculateTotalTokenCount, formatTokenCount, getTokenCountColorClass, calculateTokenBreakdown, formatTokenBreakdown, TokenBreakdown, createColoredBreakdownElements } from './utils/tokenCounter';
import { enableClickableLinksInMessage } from './utils/linkHandler';
export const VIEW_TYPE_CHAT = 'chat-view';
export class ChatView extends ItemView {
    private plugin: MyPlugin;
    private chatHistoryManager: ChatHistoryManager;
    private messagesContainer!: HTMLElement;
    private inputContainer!: HTMLElement;
    private activeStream: AbortController | null = null;
    private referenceNoteIndicator!: HTMLElement;
    private referenceAllOpenNotesIndicator!: HTMLElement;
    private obsidianLinksIndicator!: HTMLElement;
    private contextNotesIndicator!: HTMLElement;
    private expandedLinkDisplay!: HTMLElement;
    private modelNameDisplay!: HTMLElement;
    private agentResponseHandler: AgentResponseHandler | null = null;
    private messageRegenerator: MessageRegenerator | null = null;
    private responseStreamer: ResponseStreamer | null = null; // Keep for backward compatibility during transition
    private streamCoordinator: StreamCoordinator | null = null;
    private deferredStreamCoordinatorInit: (() => void) | null = null;
    private messageRenderer: MessageRenderer;
    private messagePool: MessageContextPool;
    private domCache: WeakCache<HTMLElement, any>;
    private arrayManager: PreAllocatedArrays;
    private cachedMessageElements: HTMLElement[] = [];
    private lastScrollHeight: number = 0;
    private sourceModeRenderer: SourceModeRenderer;
    private domElementCache: {
        textarea?: HTMLTextAreaElement;
        sendButton?: HTMLButtonElement;
        stopButton?: HTMLButtonElement;
        copyAllButton?: HTMLButtonElement;
        clearButton?: HTMLButtonElement;
        settingsButton?: HTMLButtonElement;
        helpButton?: HTMLButtonElement;
        saveNoteButton?: HTMLButtonElement;
        referenceNoteButton?: HTMLButtonElement;
        referenceAllOpenNotesButton?: HTMLButtonElement;
        agentModeButton?: HTMLButtonElement;
        toolContinuationContainer?: HTMLElement;
        obsidianLinksButton?: HTMLButtonElement;
        contextNotesButton?: HTMLButtonElement;
    } = {};
    private eventListeners: Array<{
        element: HTMLElement;
        event: string;
        handler: EventListener;
    }> = [];
    private settingsChangeCallback: (() => void) | null = null;
    private domBatcher: DOMBatcher;
    
    // Context messages cache for token calculation optimization
    private contextMessagesCache: {
        messages: Message[] | null;
        resolved: string[] | null;
        unresolved: string[] | null;
        cacheKey: string;
        timestamp: number;
        ttl: number; // Time to live in milliseconds
    } = {
        messages: null,
        resolved: null,
        unresolved: null,
        cacheKey: '',
        timestamp: 0,
        ttl: 5000 // 5 second cache
    };
    
    // Priority 2 Optimization: Async optimization
    private scrollDebouncer: AsyncDebouncer<void>;
    private updateDebouncer: AsyncDebouncer<void>;
    private tokenCountDebouncer: AsyncDebouncer<void>;
    // Centralized stream state management
    private centralStreamState: {
        isStreaming: boolean;
        streamSource: 'coordinator' | 'legacy' | null;
        lastUpdate: number;
    } = {
        isStreaming: false,
        streamSource: null,
        lastUpdate: 0
    };
    constructor(leaf: WorkspaceLeaf, plugin: MyPlugin) {
        super(leaf);
        this.plugin = plugin;
        this.chatHistoryManager = new ChatHistoryManager(this.app.vault, this.plugin.manifest.id, "chat-history.json");
        this.messageRenderer = new MessageRenderer(this.app);
        this.sourceModeRenderer = new SourceModeRenderer(this.app);
        this.messagePool = MessageContextPool.getInstance();
        this.domCache = new WeakCache();
        this.arrayManager = PreAllocatedArrays.getInstance();
        this.domBatcher = new DOMBatcher();
        
        // Priority 2 Optimization: Initialize async optimizers
        this.scrollDebouncer = AsyncOptimizerFactory.createInputDebouncer();
        this.updateDebouncer = AsyncOptimizerFactory.createInputDebouncer();
        this.tokenCountDebouncer = new AsyncDebouncer<void>(500); // 500ms debounce for token counter
        
        // Initialize centralized stream state management
        this.initializeCentralizedStreamState();
    }
    private addEventListenerWithCleanup(element: HTMLElement, event: string, handler: EventListener): void {
        element.addEventListener(event, handler);
        this.eventListeners.push({ element, event, handler });
    }
    private cacheUIElements(ui: any): void {
        this.domElementCache.textarea = ui.textarea;
        this.domElementCache.sendButton = ui.sendButton;
        this.domElementCache.stopButton = ui.stopButton;
        this.domElementCache.copyAllButton = ui.copyAllButton;
        this.domElementCache.clearButton = ui.clearButton;
        this.domElementCache.settingsButton = ui.settingsButton;
        this.domElementCache.helpButton = ui.helpButton;
        this.domElementCache.saveNoteButton = ui.saveNoteButton;
        this.domElementCache.referenceNoteButton = ui.referenceNoteButton;
        this.domElementCache.referenceAllOpenNotesButton = ui.referenceAllOpenNotesButton;
        this.domElementCache.agentModeButton = ui.agentModeButton;
        this.domElementCache.toolContinuationContainer = ui.toolContinuationContainer;
        // Cache new buttons
        this.domElementCache.obsidianLinksButton = ui.obsidianLinksButton;
        this.domElementCache.contextNotesButton = ui.contextNotesButton;
        (this.domElementCache as any).renderModeButton = ui.renderModeButton;
        // New context action buttons
        (this.domElementCache as any).contextClearButton = ui.contextClearButton;
        (this.domElementCache as any).contextAddCurrentButton = ui.contextAddCurrentButton;
        (this.domElementCache as any).contextAddAllOpenButton = ui.contextAddAllOpenButton;
    }
    getViewType(): string {
        return VIEW_TYPE_CHAT;
    }
    getDisplayText(): string {
        return 'AI Chat';
    }
    getIcon(): string {
        return 'message-square';
    }
    async onOpen() {
        const { contentEl } = this;
        this.prepareChatView(contentEl);
        const loadedHistory = await this.loadChatHistory();
        const ui: ChatUIElements = createChatUI(this.app, contentEl);
        await this.initializeUIElements(ui);
        this.setupEventHandlers(ui);
        this.setupAgentResponseHandler();
        this.setupResponseStreamerAndRegenerator();
        this.initializeStreamCoordinatorIfReady(); // Initialize StreamCoordinator if aiDispatcher is ready
        this.setupAgentModeButton();
        this.setupSendAndStopButtons();
        this.setupInputHandler(ui);
        this.setupTokenCounterUpdates(); // Setup real-time token counter
        await this.loadAndRenderHistory(loadedHistory);
        this.updateReferenceNoteIndicator();
        this.registerWorkspaceAndSettingsEvents();
    }

    private prepareChatView(contentEl: HTMLElement) {
        contentEl.empty();
        contentEl.addClass('ai-chat-view');
    }

    private async loadChatHistory(): Promise<ChatMessage[]> {
        return await withErrorHandling(
            () => this.chatHistoryManager.getHistory(),
            'ChatView',
            'loadChatHistory',
            { fallbackMessage: 'Failed to load chat history' }
        ) || [];
    }

    private async initializeUIElements(ui: ChatUIElements) {
        this.messagesContainer = ui.messagesContainer;
        this.inputContainer = ui.inputContainer;
        this.referenceNoteIndicator = ui.referenceNoteIndicator;
        this.referenceAllOpenNotesIndicator = ui.referenceAllOpenNotesIndicator;
        this.obsidianLinksIndicator = ui.obsidianLinksIndicator;
        this.contextNotesIndicator = ui.contextNotesIndicator;
        this.expandedLinkDisplay = ui.expandedLinkDisplay;
        this.modelNameDisplay = ui.modelNameDisplay;
        this.cacheUIElements(ui);
        this.updateReferenceNoteIndicator();
        this.updateReferenceAllOpenNotesIndicator();
        this.updateObsidianLinksIndicator();
        this.updateContextNotesIndicator();
        this.updateExpandedLinkDisplay();
        await this.updateModelNameDisplay();
        this.updateRenderModeIndicator();
    }

    private setupEventHandlers(ui: ChatUIElements) {
        this.addEventListenerWithCleanup(this.domElementCache.copyAllButton!, 'click', handleCopyAll(this.messagesContainer, this.plugin));
        this.addEventListenerWithCleanup(this.domElementCache.clearButton!, 'click', async () => {
            handleClearChat(this.messagesContainer, this.chatHistoryManager)();
            // Update token count after clearing chat
            if (this.plugin.settings.showTokenCounter !== false) {
                await this.updateModelNameDisplay();
            }
        });
        this.addEventListenerWithCleanup(this.domElementCache.settingsButton!, 'click', handleSettings(this.app, this.plugin));
        this.addEventListenerWithCleanup(this.domElementCache.helpButton!, 'click', handleHelp(this.app));
        this.addEventListenerWithCleanup(this.domElementCache.referenceNoteButton!, 'click', () => {
            this.plugin.settings.referenceCurrentNote = !this.plugin.settings.referenceCurrentNote;
            this.plugin.saveSettings();
            this.updateReferenceNoteIndicator();
            // Debounced token count update for reference note changes
            this.tokenCountDebouncer.debounce(async () => {
                if (this.plugin.settings.showTokenCounter !== false) {
                    await this.updateModelNameDisplay();
                }
            });
        });
        if (this.domElementCache.referenceAllOpenNotesButton) {
            this.addEventListenerWithCleanup(this.domElementCache.referenceAllOpenNotesButton, 'click', () => {
                this.plugin.settings.referenceAllOpenNotes = !this.plugin.settings.referenceAllOpenNotes;
                this.plugin.saveSettings();
                this.updateReferenceAllOpenNotesIndicator();
                // Debounced token count update for reference all open notes changes
                this.tokenCountDebouncer.debounce(async () => {
                    if (this.plugin.settings.showTokenCounter !== false) {
                        await this.updateModelNameDisplay();
                    }
                });
            });
        }
        this.addEventListenerWithCleanup(this.domElementCache.saveNoteButton!, 'click', handleSaveNote(this.messagesContainer, this.plugin, this.app, this.agentResponseHandler, this.chatHistoryManager));
        
        // Obsidian Links button
        this.addEventListenerWithCleanup(this.domElementCache.obsidianLinksButton!, 'click', () => {
            this.plugin.settings.enableObsidianLinks = !this.plugin.settings.enableObsidianLinks;
            this.plugin.saveSettings();
            this.updateObsidianLinksIndicator();
        });
        
        // Context Notes button
        this.addEventListenerWithCleanup(this.domElementCache.contextNotesButton!, 'click', () => {
            this.plugin.settings.enableContextNotes = !this.plugin.settings.enableContextNotes;
            this.plugin.saveSettings();
            this.updateContextNotesIndicator();
            // Debounced token count update for context notes changes
            this.tokenCountDebouncer.debounce(async () => {
                if (this.plugin.settings.showTokenCounter !== false) {
                    await this.updateModelNameDisplay();
                }
            });
        });

        // Render Mode button
        this.addEventListenerWithCleanup((this.domElementCache as any).renderModeButton!, 'click', () => {
            const currentMode = this.plugin.settings.uiBehavior?.chatRenderMode || 'live';
            const newMode = currentMode === 'live' ? 'source' : 'live';
            
            if (!this.plugin.settings.uiBehavior) {
                this.plugin.settings.uiBehavior = {};
            }
            this.plugin.settings.uiBehavior.chatRenderMode = newMode;
            this.plugin.saveSettings();
            
            this.updateRenderModeIndicator();
            this.reRenderAllMessages();
        });

        // NEW: Context notes quick actions
        const clearBtn = (this.domElementCache as any).contextClearButton as HTMLButtonElement;
        const addCurrentBtn = (this.domElementCache as any).contextAddCurrentButton as HTMLButtonElement;
        const addAllBtn = (this.domElementCache as any).contextAddAllOpenButton as HTMLButtonElement;

        if (clearBtn) {
            this.addEventListenerWithCleanup(clearBtn, 'click', async () => {
                this.plugin.settings.contextNotes = '';
                this.plugin.settings.enableContextNotes = false;
                await this.plugin.saveSettings();
                new Notice('Context notes cleared');
                this.updateContextNotesIndicator();
                // Update token count immediately when context is cleared
                this.updateModelNameDisplay();
            });
        }
        if (addCurrentBtn) {
            this.addEventListenerWithCleanup(addCurrentBtn, 'click', async () => {
                const file = this.app.workspace.getActiveFile();
                if (!file) {
                    new Notice('No active note to add');
                    return;
                }
                const link = `[[${file.path}]]`;
                const existing = this.plugin.settings.contextNotes || '';
                // Avoid duplicate links
                const alreadyHas = new RegExp(`\\[\\[${escapeRegExp(file.path)}\\]\\]`).test(existing);
                const updated = alreadyHas ? existing : (existing ? `${existing}\n${link}` : link);
                this.plugin.settings.contextNotes = updated;
                this.plugin.settings.enableContextNotes = true;
                await this.plugin.saveSettings();
                new Notice('Added current note to context');
                this.updateContextNotesIndicator();
                // Update token count immediately when context note is added
                this.updateModelNameDisplay();
            });
        }
        if (addAllBtn) {
            this.addEventListenerWithCleanup(addAllBtn, 'click', async () => {
                const leaves = this.app.workspace.getLeavesOfType('markdown');
                if (!leaves.length) {
                    new Notice('No open notes found');
                    return;
                }
                const paths = leaves
                    .map(l => (l as any).view?.file?.path)
                    .filter((p: string | undefined): p is string => !!p);
                if (!paths.length) {
                    new Notice('No open notes found');
                    return;
                }
                const existing = this.plugin.settings.contextNotes || '';
                const lines = existing ? existing.split(/\r?\n/).filter(Boolean) : [];
                const set = new Set(lines);
                for (const p of paths) {
                    set.add(`[[${p}]]`);
                }
                const updated = Array.from(set).join('\n');
                this.plugin.settings.contextNotes = updated;
                this.plugin.settings.enableContextNotes = true;
                await this.plugin.saveSettings();
                new Notice('Added all open notes to context');
                this.updateContextNotesIndicator();
                // Update token count immediately when context notes are added
                this.updateModelNameDisplay();
            });
        }
    }

    private setupAgentResponseHandler() {
        this.agentResponseHandler = new AgentResponseHandler({
            app: this.app,
            plugin: this.plugin,
            messagesContainer: this.messagesContainer,
            toolContinuationContainer: this.domElementCache.toolContinuationContainer!,
            onToolResult: (toolResult: ToolResult, command: ToolCommand) => {
                if (toolResult.success) {
                    this.plugin.debugLog('info', `[chat.ts] Tool ${command.action} completed successfully`, toolResult.data);
                } else {
                    this.plugin.debugLog('error', `[chat.ts] Tool ${command.action} failed:`, toolResult.error);
                }
            },
            onToolDisplay: (display: ToolRichDisplay) => {
                // Render tool display immediately during execution
                const toolDisplayElement = display.getElement();
                if (toolDisplayElement) {
                    // Insert the tool display before the current assistant message
                    const assistantMessages = this.messagesContainer.querySelectorAll('.ai-chat-message.assistant');
                    const lastAssistantMessage = assistantMessages[assistantMessages.length - 1];
                    
                    if (lastAssistantMessage) {
                        // Insert after the last assistant message
                        lastAssistantMessage.insertAdjacentElement('afterend', toolDisplayElement);
                        this.debouncedScrollToBottom();
                        this.plugin.debugLog('debug', '[chat.ts] Tool display rendered immediately during execution');
                    } else {
                        // Fallback: append to messages container
                        this.messagesContainer.appendChild(toolDisplayElement);
                        this.debouncedScrollToBottom();
                        this.plugin.debugLog('debug', '[chat.ts] Tool display appended to messages container (fallback)');
                    }
                }
            }
        });
    }

    private setupResponseStreamerAndRegenerator() {
        // Create simple event bus for StreamCoordinator
        const eventBus: IEventBus = {
            publish: async (event: string, data: any) => {
                console.debug(`[EventBus] ${event}:`, data);
            },
            subscribe: (event: string, handler: (data: any) => void) => {
                return () => {}; // unsubscribe function
            },
            subscribeOnce: (event: string, handler: (data: any) => void) => {
                return () => {}; // unsubscribe function
            },
            unsubscribe: (event: string, handler?: (data: any) => void) => {
                // Simple implementation
            },
            clear: () => {
                // Simple implementation
            },
            getSubscriptionCount: (event?: string) => {
                return 0; // Simple implementation
            }
        };

        // Create minimal AI service wrapper using existing AIDispatcher
        // FIX: Bind `this` properly and handle the aiDispatcher reference correctly
        const self = this; // Capture `this` reference for closure
        const aiService = {
            async getCompletion(request: any): Promise<string> {
                // DIAGNOSTIC: Add comprehensive logging to debug aiDispatcher issue
                self.plugin.debugLog('debug', '[ChatView] aiService.getCompletion called', {
                    hasPlugin: !!self.plugin,
                    hasAiDispatcher: !!self.plugin?.aiDispatcher,
                    aiDispatcherType: typeof self.plugin?.aiDispatcher,
                    requestMessages: request?.messages?.length || 0,
                    requestOptions: !!request?.options
                });
                
                // Enhanced safety check with detailed error information
                if (!self.plugin) {
                    const error = new Error('Plugin instance is null/undefined in aiService.getCompletion');
                    console.error('[ChatView] Plugin instance missing', error);
                    throw error;
                }
                
                if (!self.plugin.aiDispatcher) {
                    const error = new Error('AIDispatcher not initialized yet - this is the root cause of the stop button issue');
                    self.plugin.debugLog('error', '[ChatView] AIDispatcher missing when getCompletion called', {
                        error,
                        pluginExists: !!self.plugin,
                        aiDispatcherExists: !!self.plugin.aiDispatcher,
                        stackTrace: new Error().stack
                    });
                    throw error;
                }
                
                self.plugin.debugLog('debug', '[ChatView] About to call aiDispatcher.getCompletion', {
                    aiDispatcherMethods: Object.getOwnPropertyNames(self.plugin.aiDispatcher),
                    messagesCount: request.messages?.length
                });
                
                // FIX: The aiDispatcher.getCompletion returns Promise<void>, but we need to return the response
                // We need to capture the response from the streamCallback using a Promise-based approach
                return new Promise<string>((resolve, reject) => {
                    let fullResponse = '';
                    let hasResolved = false;
                    const originalStreamCallback = request.options?.streamCallback;
                    
                    // Wrap the stream callback to capture the full response
                    const wrappedOptions = {
                        ...request.options,
                        streamCallback: (chunk: string) => {
                            fullResponse += chunk;
                            if (originalStreamCallback) {
                                originalStreamCallback(chunk);
                            }
                        },
                        // Add completion callback to properly resolve the Promise
                        onComplete: () => {
                            if (!hasResolved) {
                                hasResolved = true;
                                self.plugin.debugLog('debug', '[ChatView] aiService.getCompletion completed', {
                                    responseLength: fullResponse.length,
                                    responsePreview: fullResponse.substring(0, 100)
                                });
                                resolve(fullResponse);
                            }
                        },
                        onError: (error: Error) => {
                            if (!hasResolved) {
                                hasResolved = true;
                                self.plugin.debugLog('error', '[ChatView] aiService.getCompletion failed', error);
                                reject(error);
                            }
                        }
                    };
                    
                    // Call aiDispatcher.getCompletion with wrapped options
                    // We already validated aiDispatcher exists above, so this is safe
                    self.plugin.aiDispatcher!.getCompletion(request.messages, wrappedOptions)
                        .then(() => {
                            // If aiDispatcher completes but onComplete wasn't called, resolve with what we have
                            if (!hasResolved) {
                                hasResolved = true;
                                self.plugin.debugLog('debug', '[ChatView] aiDispatcher completed without onComplete callback', {
                                    responseLength: fullResponse.length
                                });
                                resolve(fullResponse);
                            }
                        })
                        .catch((error) => {
                            if (!hasResolved) {
                                hasResolved = true;
                                self.plugin.debugLog('error', '[ChatView] aiDispatcher.getCompletion rejected', error);
                                reject(error);
                            }
                        });
                });
            }
        };

        // Initialize StreamCoordinator with dependency validation and retry mechanism
        this.initializeStreamCoordinatorWithRetry(eventBus, aiService);

        // Keep ResponseStreamer for backward compatibility during transition
        this.responseStreamer = new ResponseStreamer(
            this.plugin,
            this.agentResponseHandler,
            this.messagesContainer,
            this.activeStream,
            this
        );
        this.messageRegenerator = new MessageRegenerator(
            this.plugin,
            this.messagesContainer,
            this.inputContainer,
            this.chatHistoryManager,
            this.agentResponseHandler,
            this.activeStream,
            this, // Pass ChatView reference for StreamCoordinator integration
            this // Pass ChatView as component for Markdown rendering context
        );
    }

    /**
     * Initialize StreamCoordinator with dependency validation and retry mechanism
     */
    private async initializeStreamCoordinatorWithRetry(eventBus: any, aiService: any, maxRetries: number = 3): Promise<void> {
        let retryCount = 0;
        
        while (retryCount < maxRetries && !this.streamCoordinator) {
            try {
                // Validate dependencies
                if (!this.plugin.aiDispatcher) {
                    throw new Error('AIDispatcher not available');
                }
                
                this.plugin.debugLog('info', `[ChatView] Initializing StreamCoordinator (attempt ${retryCount + 1}/${maxRetries}) - aiDispatcher available`);
                
                this.streamCoordinator = new StreamCoordinator(
                    this.plugin,
                    eventBus,
                    aiService as any
                );

                // Set up UI state callback
                this.streamCoordinator.onUIStateChange((isStreaming: boolean) => {
                    this.onStreamCoordinatorStateChange(isStreaming);
                });
                
                this.plugin.debugLog('info', '[ChatView] StreamCoordinator initialized successfully');
                return; // Success, exit retry loop
                
            } catch (error) {
                retryCount++;
                this.plugin.debugLog('warn', `[ChatView] StreamCoordinator initialization failed (attempt ${retryCount}/${maxRetries}):`, error);
                
                if (retryCount < maxRetries) {
                    // Wait before retrying (exponential backoff)
                    const delay = Math.min(100 * Math.pow(2, retryCount - 1), 1000);
                    this.plugin.debugLog('info', `[ChatView] Retrying StreamCoordinator initialization in ${delay}ms`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                } else {
                    this.plugin.debugLog('error', '[ChatView] StreamCoordinator initialization failed after all retries, setting up deferred initialization');
                    // Set up deferred initialization as fallback
                    this.deferredStreamCoordinatorInit = () => {
                        this.initializeStreamCoordinatorWithRetry(eventBus, aiService, 1); // Single retry for deferred
                    };
                }
            }
        }
    }

    private initializeStreamCoordinatorIfReady() {
        // If StreamCoordinator is not yet initialized and aiDispatcher is now ready
        if (!this.streamCoordinator && this.plugin.aiDispatcher && this.deferredStreamCoordinatorInit) {
            this.plugin.debugLog('info', '[ChatView] Initializing StreamCoordinator - aiDispatcher is now ready');
            this.deferredStreamCoordinatorInit();
            this.deferredStreamCoordinatorInit = null; // Clear the deferred init
        } else if (!this.streamCoordinator) {
            this.plugin.debugLog('debug', '[ChatView] StreamCoordinator not ready yet', {
                hasAiDispatcher: !!this.plugin.aiDispatcher,
                hasDeferredInit: !!this.deferredStreamCoordinatorInit
            });
        }
    }

    private setupAgentModeButton() {
        this.addEventListenerWithCleanup(this.domElementCache.agentModeButton!, 'click', async () => {
            const isCurrentlyEnabled = this.plugin.agentModeManager.isAgentModeEnabled();
            await this.plugin.agentModeManager.setAgentModeEnabled(!isCurrentlyEnabled);
            const agentButton = this.domElementCache.agentModeButton!;
            if (this.plugin.agentModeManager.isAgentModeEnabled()) {
                agentButton.classList.add('active');
                agentButton.setAttribute('title', 'Agent Mode: ON - AI can use tools');
                new Notice('Agent Mode enabled - AI can now use tools');
                if (this.agentResponseHandler) {
                    this.agentResponseHandler.resetExecutionCount();
                }
            } else {
                agentButton.classList.remove('active');
                agentButton.setAttribute('title', 'Agent Mode: OFF - Regular chat');
                new Notice('Agent Mode disabled');
            }
            // Debounced token count update for agent mode changes
            this.tokenCountDebouncer.debounce(async () => {
                if (this.plugin.settings.showTokenCounter !== false) {
                    await this.updateModelNameDisplay();
                }
            });
        });
        const agentButton = this.domElementCache.agentModeButton!;
        if (this.plugin.agentModeManager.isAgentModeEnabled()) {
            agentButton.classList.add('active');
            agentButton.setAttribute('title', 'Agent Mode: ON - AI can use tools');
        } else {
            agentButton.classList.remove('active');
            agentButton.setAttribute('title', 'Agent Mode: OFF - Regular chat');
        }
    }

    private setupSendAndStopButtons() {
        const textarea = this.domElementCache.textarea!;
        const sendButton = this.domElementCache.sendButton!;
        const stopButton = this.domElementCache.stopButton!;
        const sendMessage = async () => {
            const content = textarea.value.trim();
            if (!content) return;
            
            // DIAGNOSTIC: Log send message attempt
            this.plugin.debugLog('info', '[ChatView] Send message attempt', {
                contentLength: content.length,
                centralStreamState: this.centralStreamState,
                hasStreamCoordinator: !!this.streamCoordinator,
                streamCoordinatorIsStreaming: this.streamCoordinator?.isStreaming(),
                textareaDisabled: textarea.disabled,
                sendButtonHidden: sendButton.classList.contains('hidden')
            });
            
            if (this.agentResponseHandler) {
                this.agentResponseHandler.resetExecutionCount();
            }
            textarea.disabled = true;
            sendButton.classList.add('hidden');
            stopButton.classList.remove('hidden');
            
            this.plugin.debugLog('debug', '[ChatView] UI state set for sending', {
                textareaDisabled: textarea.disabled,
                sendButtonHidden: sendButton.classList.contains('hidden'),
                stopButtonHidden: stopButton.classList.contains('hidden')
            });
            const userMessageEl = await createMessageElement(this.app, 'user', content, this.chatHistoryManager, this.plugin, (el: HTMLElement) => this.regenerateResponse(el), this);
            // FIX: Ensure rawContent is stored in dataset for proper context building
            userMessageEl.dataset.rawContent = content;
            this.messagesContainer.appendChild(userMessageEl);
            await this.applyRenderModeToElement(userMessageEl);
            this.debouncedScrollToBottom();
            textarea.value = '';
            
            // FIX: Invalidate message cache to ensure fresh DOM reads include this new message
            this.invalidateMessageCache();
            await withErrorHandling(
                () => this.chatHistoryManager.addMessage({
                    timestamp: userMessageEl.dataset.timestamp || new Date().toISOString(),
                    sender: 'user',
                    role: 'user',
                    content: content
                }),
                'ChatView',
                'saveUserMessage',
                { fallbackMessage: 'Failed to save user message' }
            );
            try {
                // Small delay to ensure DOM is updated after user message is appended
                await new Promise(resolve => setTimeout(resolve, 10));
                
                // Clear cache to ensure fresh DOM query
                this.cachedMessageElements = [];
                this.lastScrollHeight = 0;
                
                let contextMessages = await this.buildContextMessages();
                this.plugin.debugLog('debug', '[ChatView] Context messages built', {
                    contextMessageCount: contextMessages.length
                });
                
                // Add visible chat messages to context
                this.addVisibleMessagesToContext(contextMessages);
                contextMessages = this.prepareMessagesForSend(contextMessages);
                
                this.plugin.debugLog('debug', '[ChatView] Final message array for AI call', {
                    totalMessages: contextMessages.length,
                    messageRoles: contextMessages.map(m => m.role),
                    lastUserMessage: contextMessages.filter(m => m.role === 'user').slice(-1)[0]?.content?.substring(0, 100)
                });
                
                const messages = contextMessages;
                const tempContainer = document.createElement('div');
                tempContainer.addClass('ai-chat-message', 'assistant');
                tempContainer.createDiv('message-content');
                this.messagesContainer.appendChild(tempContainer);
                this.debouncedScrollToBottom();
                const responseContent = await this.streamAssistantResponse(messages, tempContainer);
                
                // FIX: Capture actual system message sent to AI (for accurate chat exports)
                // Check both streaming systems since we have fallback logic
                let actualSystemMessage: string | undefined = undefined;
                if (this.streamCoordinator) {
                    actualSystemMessage = this.streamCoordinator.getActualSystemMessage();
                } else if (this.responseStreamer) {
                    actualSystemMessage = this.responseStreamer.getActualSystemMessage();
                }
                if (actualSystemMessage) {
                    this.plugin.debugLog('debug', '[chat.ts] Captured actual system message', {
                        length: actualSystemMessage.length,
                        source: this.streamCoordinator ? 'StreamCoordinator' : 'ResponseStreamer'
                    });
                }
                
                let enhancedMessageData: any = undefined;
                this.plugin.debugLog('debug', '[chat.ts] tempContainer.dataset.messageData exists:', !!tempContainer.dataset.messageData);
                if (tempContainer.dataset.messageData) {
                    try {
                        enhancedMessageData = JSON.parse(tempContainer.dataset.messageData);
                        this.plugin.debugLog('debug', '[chat.ts] enhancedMessageData parsed, toolResults count:', enhancedMessageData.toolResults?.length || 0);
                    } catch (e) {
                        this.plugin.debugLog('warn', '[chat.ts] Failed to parse enhanced message data:', e);
                    }
                }
                this.plugin.debugLog('debug', '[chat.ts] responseContent length:', responseContent.length, 'trimmed length:', responseContent.trim().length);
                tempContainer.remove();
                if (responseContent.trim() !== "" || (enhancedMessageData && enhancedMessageData.toolResults && enhancedMessageData.toolResults.length > 0)) {
                    // FIX: For new architecture, embed tool data in markdown content instead of storing separately
                    let contentToSave = responseContent;
                    if (enhancedMessageData && enhancedMessageData.toolResults && enhancedMessageData.toolResults.length > 0) {
                        // Embed tool data in the markdown content
                        const { embedToolDataInMarkdown } = await import('./utils/messageContentParser');
                        contentToSave = embedToolDataInMarkdown(
                            responseContent,
                            enhancedMessageData.toolResults,
                            enhancedMessageData.reasoning,
                            enhancedMessageData.taskStatus
                        );
                        this.plugin.debugLog('debug', '[chat.ts] Embedded tool data in message content for history', {
                            originalLength: responseContent.length,
                            embeddedLength: contentToSave.length,
                            toolResultsCount: enhancedMessageData.toolResults.length
                        });
                    }

                    const messageEl = await createMessageElement(
                        this.app,
                        'assistant',
                        responseContent, // Use cleaned content for UI display
                        this.chatHistoryManager,
                        this.plugin,
                        (el) => this.regenerateResponse(el),
                        this,
                        enhancedMessageData
                    );
                    // FIX: Store embedded content in dataset for proper context building and history
                    messageEl.dataset.rawContent = contentToSave;
                    this.messagesContainer.appendChild(messageEl);
                    await this.applyRenderModeToElement(messageEl);
                    
                    // FIX: Invalidate message cache to ensure fresh DOM reads include this new message
                    this.invalidateMessageCache();
                    this.plugin.debugLog('debug', '[chat.ts] About to save message to history with embedded tool data');
                    await this.chatHistoryManager.addMessage({
                        timestamp: messageEl.dataset.timestamp || new Date().toISOString(),
                        sender: 'assistant',
                        role: 'assistant',
                        content: contentToSave, // Save content with embedded tool data
                        ...(actualSystemMessage && { actualSystemMessage }),  // FIX: Store actual system message for debugging
                        // Tool data is now embedded in content, no need for separate fields
                    });
                    this.plugin.debugLog('debug', '[chat.ts] Message saved to history successfully');
                } else {
                    this.plugin.debugLog('debug', '[chat.ts] responseContent is empty and no toolResults, not saving message');
                }
            } catch (error) {
                if ((error as Error).name !== 'AbortError') {
                    handleChatError(error, 'sendMessage', {
                        messageLength: content.length,
                        agentMode: this.plugin.agentModeManager.isAgentModeEnabled()
                    });
                    await createMessageElement(this.app, 'assistant', `Error: ${(error as Error).message}`, this.chatHistoryManager, this.plugin, (el: HTMLElement) => this.regenerateResponse(el), this);
                }
            } finally {
                // DIAGNOSTIC: Log finally block execution
                this.plugin.debugLog('debug', '[ChatView] Send message finally block', {
                    textareaDisabledBefore: textarea.disabled,
                    sendButtonHiddenBefore: sendButton.classList.contains('hidden'),
                    stopButtonHiddenBefore: stopButton.classList.contains('hidden'),
                    centralStreamStateBefore: this.centralStreamState
                });
                
                textarea.disabled = false;
                textarea.focus();
                stopButton.classList.add('hidden');
                sendButton.classList.remove('hidden');
                this.activeStream = null;
                
                // DIAGNOSTIC: Log final UI state
                this.plugin.debugLog('info', '[ChatView] Send message complete - UI restored', {
                    textareaDisabledAfter: textarea.disabled,
                    sendButtonHiddenAfter: sendButton.classList.contains('hidden'),
                    stopButtonHiddenAfter: stopButton.classList.contains('hidden'),
                    centralStreamStateAfter: this.centralStreamState
                });
            }
        };
        this.addEventListenerWithCleanup(sendButton, 'click', sendMessage);
        this.addEventListenerWithCleanup(stopButton, 'click', () => {
            this.handleStopButtonClick();
        });
    }

    private setupInputHandler(ui: ChatUIElements) {
        const textarea = this.domElementCache.textarea!;
        const sendButton = this.domElementCache.sendButton!;
        const stopButton = this.domElementCache.stopButton!;
        import('./components/chat/inputHandler').then(({ setupInputHandler }) => {
            setupInputHandler(
                textarea,
                this.messagesContainer,
                async () => sendButton.click(),
                async (cmd: string) => {
                    switch (cmd) {
                        case '/clear':
                            ui.clearButton.click();
                            break;
                        case '/copy':
                            ui.copyAllButton.click();
                            break;
                        case '/save':
                            ui.saveNoteButton.click();
                            break;
                        case '/settings':
                            ui.settingsButton.click();
                            break;
                        case '/help':
                            ui.helpButton.click();
                            break;
                        case '/ref':
                            ui.referenceNoteButton.click();
                            break;
                    }
                },
                this.app,
                this.plugin,
                sendButton,
                stopButton
            );
        });
    }

    /**
     * Setup real-time token counter updates.
     * Adds debounced listener to textarea for updates as user types.
     * Only active when showTokenCounter setting is enabled.
     */
    private setupTokenCounterUpdates() {
        // Only setup listeners if token counter is enabled
        if (this.plugin.settings.showTokenCounter === false) {
            return;
        }

        const textarea = this.domElementCache.textarea;
        if (!textarea) return;

        // Add input listener with debouncing
        const inputHandler = () => {
            // Use debouncer to avoid excessive recalculations
            this.tokenCountDebouncer.debounce(async () => {
                if (this.plugin.settings.showTokenCounter !== false) {
                    await this.updateModelNameDisplay();
                }
            });
        };

        this.addEventListenerWithCleanup(textarea, 'input', inputHandler);
    }

    private async loadAndRenderHistory(loadedHistory: ChatMessage[]) {
        if (loadedHistory.length > 0) {
            this.messagesContainer.empty();
            const file = this.app.workspace.getActiveFile();
            if (file) {
                await loadChatYamlAndApplySettings({
                    app: this.app,
                    plugin: this.plugin,
                    settings: this.plugin.settings,
                    file
                });
                
                // Update agent mode button state after loading YAML settings
                this.updateAgentModeButtonState();
            }
            await renderChatHistory({
                messagesContainer: this.messagesContainer,
                loadedHistory,
                chatHistoryManager: this.chatHistoryManager,
                plugin: this.plugin,
                regenerateResponse: (el: HTMLElement) => this.regenerateResponse(el),
                scrollToBottom: true
            });

            const currentMode = this.plugin.settings.uiBehavior?.chatRenderMode || 'live';
            if (currentMode === 'source') {
                this.reRenderAllMessages();
            } else {
                const renderedMessages = this.messagesContainer.querySelectorAll('.ai-chat-message');
                await Promise.all(Array.from(renderedMessages).map((messageEl) => this.applyRenderModeToElement(messageEl as HTMLElement)));
            }
        }
    }

    private registerWorkspaceAndSettingsEvents() {
        this.registerEvent(this.app.workspace.on('active-leaf-change', () => {
            this.updateReferenceNoteIndicator();
            // Update token count when active note changes
            this.tokenCountDebouncer.debounce(async () => {
                if (this.plugin.settings.showTokenCounter !== false) {
                    await this.updateModelNameDisplay();
                }
            });
        }));
        // When a message is edited, ensure the current render mode is applied to that element
        this.registerEvent((this.app.workspace as any).on('ai-assistant:message-edited', async (el: HTMLElement) => {
            if (el && el.classList && el.classList.contains('ai-chat-message')) {
                try {
                    await this.applyRenderModeToElement(el);
                    // Invalidate cache so downstream context building uses fresh content
                    this.invalidateMessageCache();
                } catch (e) {
                    this.plugin.debugLog('warn', '[ChatView] Failed to apply render mode after message edit', e as any);
                }
            }
        }));
        
        // Store the settings change callback so we can clean it up later
        this.settingsChangeCallback = async () => {
            this.updateReferenceNoteIndicator();
            this.updateObsidianLinksIndicator();
            this.updateContextNotesIndicator();
            await this.updateModelNameDisplay();
            this.updateRenderModeIndicator();
        };
        this.plugin.onSettingsChange(this.settingsChangeCallback);
    }
    private async addMessage(role: 'user' | 'assistant', content: string, isError: boolean = false, enhancedData?: Partial<Pick<Message, 'reasoning' | 'taskStatus' | 'toolResults'>>): Promise<void> {
        // For new architecture: embed tool data in content if provided
        let contentToSave = content;
        let contentForUI = content;

        if (enhancedData && enhancedData.toolResults && enhancedData.toolResults.length > 0) {
            const { embedToolDataInMarkdown } = await import('./utils/messageContentParser');
            contentToSave = embedToolDataInMarkdown(
                content,
                enhancedData.toolResults,
                enhancedData.reasoning,
                enhancedData.taskStatus
            );
            this.plugin.debugLog('debug', '[ChatView] Embedded tool data in addMessage content', {
                originalLength: content.length,
                embeddedLength: contentToSave.length,
                toolResultsCount: enhancedData.toolResults.length
            });
        }

        const messageEl = await createMessageElement(this.app, role, contentForUI, this.chatHistoryManager, this.plugin, (el: HTMLElement) => this.regenerateResponse(el), this, enhancedData ? { role, content: contentForUI, ...enhancedData } : undefined);
        const uiTimestamp = messageEl.dataset.timestamp || new Date().toISOString();
        // FIX: Store embedded content in dataset for proper context building and history
        messageEl.dataset.rawContent = contentToSave;
        this.messagesContainer.appendChild(messageEl);
        await this.applyRenderModeToElement(messageEl);
        this.debouncedScrollToBottom();

        // FIX: Invalidate message cache to ensure fresh DOM reads include this new message
        this.invalidateMessageCache();
        await withErrorHandling(
            () => this.chatHistoryManager.addMessage({
                timestamp: uiTimestamp,
                sender: role,
                role: role,
                content: contentToSave, // Save content with embedded tool data
                ...(enhancedData || {})
            }),
            'ChatView',
            'addMessage',
            { fallbackMessage: 'Failed to save chat message' }
        );

        // Update token count after adding message
        if (this.plugin.settings.showTokenCounter !== false) {
            await this.updateModelNameDisplay();
        }
    }
    async onClose() {
        if (this.activeStream) {
            this.activeStream.abort();
            this.activeStream = null;
        }
        this.cleanupEventListeners();
        this.cleanupMemoryResources();
    }
    private cleanupEventListeners(): void {
        for (const { element, event, handler } of this.eventListeners) {
            element.removeEventListener(event, handler);
        }
        this.eventListeners.length = 0;
        
        // Clean up settings change listener
        if (this.settingsChangeCallback) {
            this.plugin.offSettingsChange(this.settingsChangeCallback);
            this.settingsChangeCallback = null;
        }
    }
    private cleanupMemoryResources(): void {
        this.cachedMessageElements.length = 0;
        this.lastScrollHeight = 0;
        this.domElementCache = {};
        if (this.domBatcher) {
            this.domBatcher.clear();
        }
    }
    private async regenerateResponse(messageEl: HTMLElement) {
        if (this.messageRegenerator) {
            await this.messageRegenerator.regenerateResponse(messageEl, () => this.buildContextMessages());
        }
    }
    private updateReferenceNoteIndicator() {
        this.updateDebouncer.debounce(async () => {
            const currentFile = this.app.workspace.getActiveFile();
            const isReferenceEnabled = this.plugin.settings.referenceCurrentNote;
            const button = this.domElementCache.referenceNoteButton;
            if (isReferenceEnabled && currentFile) {
                this.referenceNoteIndicator.setText(`📝 Referencing: ${currentFile.basename}`);
                this.referenceNoteIndicator.style.display = 'block';
                if (button) {
                    button.classList.add('active');
                }
            } else {
                this.referenceNoteIndicator.style.display = 'none';
                if (button) {
                    button.classList.remove('active');
                }
            }
        });
    }
    private updateReferenceAllOpenNotesIndicator() {
        this.updateDebouncer.debounce(async () => {
            if (!this.referenceAllOpenNotesIndicator) return;
            
            const isReferenceEnabled = this.plugin.settings.referenceAllOpenNotes;
            const button = this.domElementCache.referenceAllOpenNotesButton;
            
            if (isReferenceEnabled) {
                // Get all open markdown files (including non-focused tabs)
                const { getAllOpenMarkdownFiles } = require('./utils/workspaceUtils');
                const openFiles = getAllOpenMarkdownFiles(this.app);
                const fileNames = openFiles.map((file: any) => file.basename);
                
                if (fileNames.length > 0) {
                    const fileList = fileNames.slice(0, 3).join(', ') + (fileNames.length > 3 ? ` +${fileNames.length - 3} more` : '');
                    this.referenceAllOpenNotesIndicator.setText(`📖 Referencing: ${fileList}`);
                    this.referenceAllOpenNotesIndicator.style.display = 'block';
                } else {
                    this.referenceAllOpenNotesIndicator.setText(`📖 Referencing: No open notes`);
                    this.referenceAllOpenNotesIndicator.style.display = 'block';
                }
                
                if (button) {
                    button.classList.add('active');
                }
            } else {
                this.referenceAllOpenNotesIndicator.style.display = 'none';
                if (button) {
                    button.classList.remove('active');
                }
            }
        });
    }
    private updateExpandedLinkDisplay() {
        this.updateDebouncer.debounce(async () => {
            if (!this.expandedLinkDisplay) return;
            
            const resolved = this.contextMessagesCache.resolved || [];
            const unresolved = this.contextMessagesCache.unresolved || [];
            
            if (resolved.length > 0 || unresolved.length > 0) {
                let displayText = '';
                
                if (resolved.length > 0) {
                    const resolvedList = resolved.slice(0, 3).join(', ') + (resolved.length > 3 ? ` +${resolved.length - 3} more` : '');
                    displayText += `✓ ${resolvedList}`;
                }
                
                if (unresolved.length > 0) {
                    if (displayText) displayText += ' | ';
                    const unresolvedList = unresolved.slice(0, 3).join(', ') + (unresolved.length > 3 ? ` +${unresolved.length - 3} more` : '');
                    displayText += `✗ ${unresolvedList}`;
                }
                
                this.expandedLinkDisplay.setText(displayText);
                this.expandedLinkDisplay.style.display = 'block';
            } else {
                this.expandedLinkDisplay.style.display = 'none';
            }
        });
    }
    private async updateModelNameDisplay() {
        if (!this.modelNameDisplay) return;

        const settings = this.plugin.settings;
        let modelName = 'Unknown Model';
        let maxTokens = this.getCurrentModelContextLimit();

        if (settings.selectedModel && settings.availableModels) {
            const found = settings.availableModels.find((m: any) => m.id === settings.selectedModel);
            if (found) {
                modelName = found.name;
                const contextLength = (found as any).context_length;
                if (contextLength) {
                    maxTokens = contextLength;
                }
            } else {
                modelName = settings.selectedModel;
            }
        } else if (settings.selectedModel) {
            modelName = settings.selectedModel;
        }

        // Clear display
        this.modelNameDisplay.empty();

        // Always show model name
        const modelSpan = document.createElement('span');
        modelSpan.textContent = `Model: ${modelName}`;
        this.modelNameDisplay.appendChild(modelSpan);

        // Only calculate and show token count if setting is enabled
        if (settings.showTokenCounter !== false) {
            try {
                const baseContext = await this.buildContextMessages();
                const chatMessages = this.collectChatMessages();
                
                // Include current textarea content as a temporary user message
                const textareaContent = this.domElementCache.textarea?.value?.trim() || '';
                const allMessages = [...baseContext, ...chatMessages];
                if (textareaContent) {
                    allMessages.push({ role: 'user', content: textareaContent });
                }
                
                const truncated = truncateMessagesForContext(allMessages, maxTokens, this.plugin);
                
                // Calculate breakdown
                const breakdown = calculateTokenBreakdown(truncated, maxTokens);

                // Display total tokens
                const totalColorClass = getTokenCountColorClass(breakdown.total, maxTokens);
                const tokenSpan = document.createElement('span');
                tokenSpan.className = `ai-token-count-display ${totalColorClass}`;
                tokenSpan.textContent = `${formatTokenCount(breakdown.total)} tokens`;
                this.modelNameDisplay.appendChild(tokenSpan);
                
                // Display breakdown with badge styling - using same color as total with different saturations
                const breakdownContainer = document.createElement('span');
                breakdownContainer.className = 'ai-token-breakdown-display';
                
                const coloredElements = createColoredBreakdownElements(breakdown, totalColorClass);
                coloredElements.forEach(el => breakdownContainer.appendChild(el));
                
                this.modelNameDisplay.appendChild(breakdownContainer);
            } catch (error) {
                console.error('Failed to calculate token count:', error);
            }
        }
    }
    private updateObsidianLinksIndicator() {
        if (!this.obsidianLinksIndicator) return;
        
        const isObsidianLinksEnabled = this.plugin.settings.enableObsidianLinks;
        const button = this.domElementCache.obsidianLinksButton;
        
        if (isObsidianLinksEnabled) {
            this.obsidianLinksIndicator.setText('🔗 Obsidian Links: ON');
            this.obsidianLinksIndicator.style.display = 'block';
            this.obsidianLinksIndicator.classList.add('active');
            if (button) {
                button.classList.add('active');
            }
        } else {
            this.obsidianLinksIndicator.style.display = 'none';
            this.obsidianLinksIndicator.classList.remove('active');
            if (button) {
                button.classList.remove('active');
            }
        }
    }
    private updateContextNotesIndicator() {
        if (!this.contextNotesIndicator) return;
        
        const isContextNotesEnabled = this.plugin.settings.enableContextNotes;
        const contextNotesText = this.plugin.settings.contextNotes || '';
        const button = this.domElementCache.contextNotesButton;
        
        if (isContextNotesEnabled) {
            // Show button as active when setting is enabled, regardless of content
            if (button) {
                button.classList.add('active');
            }
            
            // Show indicator only if there's actual content
            if (contextNotesText.trim()) {
                // Extract note names from the context notes text using regex
                const linkRegex = /\[\[([^\]]+)\]\]/g;
                const noteNames: string[] = [];
                let match;
                
                while ((match = linkRegex.exec(contextNotesText)) !== null) {
                    const noteName = match[1];
                    // Extract just the note name from paths
                    const displayName = noteName.split('/').pop() || noteName;
                    noteNames.push(displayName);
                }
                
                if (noteNames.length > 0) {
                    const notesList = noteNames.join(', ');
                    const displayText = `📚 Context: ${notesList}`;
                    this.contextNotesIndicator.setText(displayText);
                    this.contextNotesIndicator.style.display = 'block';
                    this.contextNotesIndicator.classList.add('active');
                } else {
                    this.contextNotesIndicator.setText('📚 Context Notes: ON');
                    this.contextNotesIndicator.style.display = 'block';
                    this.contextNotesIndicator.classList.add('active');
                }
            } else {
                this.contextNotesIndicator.setText('📚 Context Notes: ON');
                this.contextNotesIndicator.style.display = 'block';
                this.contextNotesIndicator.classList.add('active');
            }
        } else {
            this.contextNotesIndicator.style.display = 'none';
            this.contextNotesIndicator.classList.remove('active');
            if (button) {
                button.classList.remove('active');
            }
        }
    }

    private collectChatMessages(): Message[] {
        const messageElements = this.messagesContainer.querySelectorAll('.ai-chat-message');
        const collected: Message[] = [];

        for (let i = 0; i < messageElements.length; i++) {
            const el = messageElements[i] as HTMLElement;
            const role = el.classList.contains('user') ? 'user' : 'assistant';
            let content = el.dataset.rawContent;

            if (!content) {
                const contentEl = el.querySelector('.message-content');
                content = contentEl?.textContent || '';
            }

            if (content && content.trim()) {
                collected.push({ role, content });
            }
        }

        return collected;
    }

    private prepareMessagesForSend(messages: Message[]): Message[] {
        const maxTokens = this.getCurrentModelContextLimit();
        const truncated = truncateMessagesForContext(messages, maxTokens, this.plugin);

        if (truncated !== messages) {
            const retained = new Set(truncated);
            for (const message of messages) {
                if (!retained.has(message)) {
                    this.messagePool.releaseMessage(message as any);
                }
            }
        }

        return truncated;
    }

    public async applyRenderModeToElement(messageEl: HTMLElement): Promise<void> {
        const mode = this.plugin.settings.uiBehavior?.chatRenderMode || 'live';
        const contentEl = messageEl.querySelector('.message-content') as HTMLElement;
        if (!contentEl) {
            return;
        }

        const rawContent = messageEl.dataset.rawContent || contentEl.textContent || '';
        
        if (mode === 'source') {
            this.sourceModeRenderer.renderSourceMode(rawContent, contentEl);
        } else {
            // Live mode: Parse tool data from markdown content and render appropriately
            contentEl.empty();
            
            // Parse tool data from markdown content
            const { parseToolDataFromMarkdown, cleanMarkdownFromToolData } = await import('./utils/messageContentParser');
            const toolData = parseToolDataFromMarkdown(rawContent);
            const cleanContent = cleanMarkdownFromToolData(rawContent);
            
            if (toolData && toolData.toolResults && toolData.toolResults.length > 0) {
                // FIX: Use MessageRenderer for messages with embedded tool data
                this.plugin.debugLog('debug', '[ChatView] Re-rendering message with embedded tool data using MessageRenderer');
                const messageRenderer = new MessageRenderer(this.app);
                messageRenderer.renderMessage({
                    role: messageEl.classList.contains('user') ? 'user' : 'assistant',
                    content: cleanContent,
                    toolResults: toolData.toolResults,
                    reasoning: toolData.reasoning,
                    taskStatus: toolData.taskStatus
                } as any, messageEl, this).catch((error) => {
                    this.plugin.debugLog('error', '[ChatView] MessageRenderer failed, falling back to MarkdownRenderer', error);
                    // Fallback to basic markdown rendering
                    contentEl.empty();
                    import('obsidian')
                        .then(({ MarkdownRenderer }) =>
                            MarkdownRenderer.render(this.app, cleanContent, contentEl, '', this)
                        )
                        .then(() => import('./utils/linkHandler'))
                        .then(({ enableClickableLinksInMessage }) => {
                            enableClickableLinksInMessage(messageEl, this.app);
                        })
                        .catch((error) => {
                            console.error('Markdown rendering error:', error);
                            contentEl.textContent = cleanContent;
                        });
                });
            } else {
                // Regular message without tool data - use standard MarkdownRenderer
                import('obsidian')
                    .then(({ MarkdownRenderer }) =>
                        MarkdownRenderer.render(this.app, rawContent, contentEl, '', this)
                    )
                    .then(() => import('./utils/linkHandler'))
                    .then(({ enableClickableLinksInMessage }) => {
                        enableClickableLinksInMessage(messageEl, this.app);
                    })
                    .catch((error) => {
                        console.error('Markdown rendering error:', error);
                        contentEl.textContent = rawContent;
                    });
            }
        }
    }

    public getCurrentModelContextLimit(): number {
        const settings = this.plugin.settings;

        if (settings.selectedModel && settings.availableModels) {
            const found = settings.availableModels.find((m: any) => m.id === settings.selectedModel);
            if (found && (found as any).context_length) {
                return (found as any).context_length;
            }
        }

        // Fallback to a conservative default if not specified
        return 8192;
    }


    private updateAgentModeButtonState() {
        const agentButton = this.domElementCache.agentModeButton;
        if (agentButton) {
            if (this.plugin.agentModeManager.isAgentModeEnabled()) {
                agentButton.classList.add('active');
                agentButton.setAttribute('title', 'Agent Mode: ON - AI can use tools');
            } else {
                agentButton.classList.remove('active');
                agentButton.setAttribute('title', 'Agent Mode: OFF - Regular chat');
            }
        }
    }

    private updateRenderModeIndicator() {
        const button = (this.domElementCache as any).renderModeButton as HTMLButtonElement;
        const currentMode = this.plugin.settings.uiBehavior?.chatRenderMode || 'live';
        
        if (button) {
            if (currentMode === 'live') {
                button.setText('👁️');
                button.setAttribute('aria-label', 'Switch to source mode');
                button.setAttribute('title', 'Live mode: Formatted markdown (click for source)');
                button.classList.remove('source-mode');
            } else {
                button.setText('📝');
                button.setAttribute('aria-label', 'Switch to live mode');
                button.setAttribute('title', 'Source mode: Raw markdown (click for live)');
                button.classList.add('source-mode');
            }
        }
    }

    private readonly RENDER_BATCH_SIZE = 10;
    private async reRenderAllMessages(): Promise<void> {
        const messageElements = this.getCachedMessageElements();
        const currentMode = this.plugin.settings.uiBehavior?.chatRenderMode || 'live';
        this.plugin.debugLog('info', '[ChatView] Starting batched re-render', {
            totalMessages: messageElements.length,
            batchSize: this.RENDER_BATCH_SIZE,
            mode: currentMode
        });
        for (let i = 0; i < messageElements.length; i += this.RENDER_BATCH_SIZE) {
            const batch = messageElements.slice(i, i + this.RENDER_BATCH_SIZE);
            await new Promise<void>(resolve => {
                requestAnimationFrame(() => {
                    batch.forEach((messageEl: HTMLElement) => {
                        const htmlElement = messageEl as HTMLElement;
                        const contentElement = htmlElement.querySelector('.message-content') as HTMLElement;
                        let rawContent = htmlElement.dataset.rawContent;
                        if (!contentElement) {
                            return;
                        }
                        if (!rawContent || rawContent.trim() === '') {
                            const pre = contentElement.querySelector('pre');
                            const recovered = (pre?.textContent || contentElement.textContent || '').trim();
                            if (recovered) {
                                rawContent = recovered;
                                htmlElement.dataset.rawContent = recovered;
                            }
                        }
                        if (rawContent && rawContent.length > 0) {
                            if (currentMode === 'source') {
                                this.sourceModeRenderer.renderSourceMode(rawContent, contentElement);
                            } else {
                                this.applyRenderModeToElement(htmlElement).catch(() => {
                                    contentElement.empty();
                                    import('obsidian')
                                        .then(({ MarkdownRenderer }) =>
                                            MarkdownRenderer.render(this.app, rawContent!, contentElement, '', this)
                                        )
                                        .then(() => import('./utils/linkHandler'))
                                        .then(({ enableClickableLinksInMessage }) => {
                                            enableClickableLinksInMessage(htmlElement, this.app);
                                        })
                                        .catch((fallbackError) => {
                                            contentElement.textContent = rawContent!;
                                        });
                                });
                            }
                        }
                    });
                    resolve();
                });
            });
            if (messageElements.length > 50 && i % 50 === 0) {
                this.plugin.debugLog('debug', '[ChatView] Render progress', {
                    processed: Math.min(i + this.RENDER_BATCH_SIZE, messageElements.length),
                    total: messageElements.length,
                    percentComplete: Math.round((i / messageElements.length) * 100)
                });
            }
        }
    }

    private async buildContextMessages(): Promise<Message[]> {
        // Create cache key based on settings that affect context building
        const settings = this.plugin.settings;
        const currentFile = this.app.workspace.getActiveFile();
        
        // Get all open note paths for cache key (including non-focused tabs)
        const { getOpenMarkdownFilePaths } = require('./utils/workspaceUtils');
        const openNotePaths = getOpenMarkdownFilePaths(this.app);
        
        const cacheKey = JSON.stringify({
            systemMessage: settings.systemMessage,
            includeRecentlyOpenedNotes: settings.includeRecentlyOpenedNotes,
            enableContextNotes: settings.enableContextNotes,
            contextNotes: settings.contextNotes,
            referenceCurrentNote: settings.referenceCurrentNote,
            referenceAllOpenNotes: settings.referenceAllOpenNotes,
            openNotePaths: openNotePaths, // Include open notes in cache key
            currentFilePath: currentFile?.path,
            currentFileMtime: currentFile?.stat?.mtime
        });

        // Check if cache is valid
        const now = Date.now();
        if (this.contextMessagesCache.messages &&
            this.contextMessagesCache.cacheKey === cacheKey &&
            (now - this.contextMessagesCache.timestamp) < this.contextMessagesCache.ttl) {
            return this.contextMessagesCache.messages;
        }

        // Cache miss - rebuild context messages
        const { messages, resolved, unresolved } = await buildContextMessages({ app: this.app, plugin: this.plugin });

        // Update cache
        this.contextMessagesCache.messages = messages;
        this.contextMessagesCache.resolved = resolved;
        this.contextMessagesCache.unresolved = unresolved;
        this.contextMessagesCache.cacheKey = cacheKey;
        this.contextMessagesCache.timestamp = now;

        return messages;
    }
    private addVisibleMessagesToContext(messages: Message[]): void {
        // Use cached message elements for context building
        const messageElements = this.getCachedMessageElements();
        this.plugin.debugLog('debug', '[ChatView] Using cached message elements for context building', {
            messageCount: messageElements.length
        });
        for (let i = 0; i < messageElements.length; i++) {
            const el = messageElements[i] as HTMLElement;
            const role = el.classList.contains('user') ? 'user' : 'assistant';
            let content = '';
            if (el.dataset.rawContent) {
                content = el.dataset.rawContent;
                this.plugin.debugLog('debug', '[ChatView] Using rawContent from dataset for context', {
                    role,
                    contentLength: content.length,
                    hasRawContent: true,
                    messageIndex: i
                });
            } else {
                const contentEl = el.querySelector('.message-content');
                content = contentEl?.textContent || '';
                this.plugin.debugLog('debug', '[ChatView] Using textContent from DOM for context (fallback)', {
                    role,
                    contentLength: content.length,
                    hasRawContent: false,
                    messageIndex: i
                });
            }
            if (!content.trim()) {
                this.plugin.debugLog('warn', '[ChatView] Skipping empty message in context', {
                    role,
                    messageIndex: i
                });
                continue;
            }
            const messageObj = this.messagePool.acquireMessage();
            messageObj.role = role;
            messageObj.content = content;
            messages.push(messageObj as Message);
        }
        
        this.plugin.debugLog('info', '[ChatView] Context messages built from DOM', {
            totalMessages: messages.length,
            domElements: messageElements.length
        });
    }
    public async streamAssistantResponse(
        messages: Message[],
        container: HTMLElement,
        originalTimestamp?: string,
        originalContent?: string
    ): Promise<string> {
        // Try to initialize StreamCoordinator if it's not ready yet
        this.initializeStreamCoordinatorIfReady();
        
        // Try to use StreamCoordinator first (new system)
        if (this.streamCoordinator) {
            try {
                return await this.streamCoordinatorResponse(messages, container);
            } catch (error) {
                this.plugin.debugLog('warn', '[ChatView] StreamCoordinator failed, falling back to ResponseStreamer:', error);
            }
        }

        // Fallback to existing ResponseStreamer (legacy system)
        if (!this.responseStreamer) {
            throw new Error("ResponseStreamer not initialized");
        }
        const chatHistory = await this.chatHistoryManager.getHistory();
        const responseContent = await this.responseStreamer.streamAssistantResponse(
            messages,
            container,
            originalTimestamp,
            originalContent,
            chatHistory
        );
        if (originalTimestamp && responseContent.trim() !== "") {
            let messageData: any = undefined;
            if (container.dataset.messageData) {
                try {
                    messageData = JSON.parse(container.dataset.messageData);
                } catch { }
            }
            await this.chatHistoryManager.updateMessage(
                originalTimestamp,
                'assistant',
                originalContent || '',
                responseContent,
                messageData
            );
        }
        return responseContent;
    }

    /**
     * New streaming method using StreamCoordinator
     */
    private async streamCoordinatorResponse(
        messages: Message[],
        container: HTMLElement
    ): Promise<string> {
        if (!this.streamCoordinator) {
            throw new Error("StreamCoordinator not initialized");
        }

        // Set the active container for UI updates
        this.streamCoordinator.setActiveContainer(container);

        // Set up chunk callback for real-time UI updates
        const onChunk = async (chunk: string, fullContent: string) => {
            // Update the message content in the container
            const messageDiv = container.querySelector('.message-content');
            if (messageDiv) {
                messageDiv.textContent = fullContent;
                container.dataset.rawContent = fullContent;  // ✅ FIX: Preserve partial responses for chat history
                // Scroll to bottom
                this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
            }
        };

        // Start streaming with UI integration
        let responseContent = await this.streamCoordinator.startStream(messages, {
            temperature: this.plugin.settings.temperature,
            uiContainer: container,
            onChunk
        });

        // FIX: Process agent response if agent mode is enabled (execute tools)
        if (this.plugin.agentModeManager.isAgentModeEnabled() && this.agentResponseHandler) {
            this.plugin.debugLog('info', '[ChatView] Agent mode enabled - processing response for tools', {
                responseLength: responseContent.length,
                responsePreview: responseContent.substring(0, 200)
            });
            
            try {
                // CRITICAL: Save the original raw response before processing
                // This is needed for task continuation to build proper message history
                const originalRawResponse = responseContent;
                
                const chatHistory = await this.chatHistoryManager.getHistory();
                const agentResult = await this.agentResponseHandler.processResponseWithUI(
                    responseContent, 
                    'streamCoordinator', 
                    chatHistory
                );
                
                // For new architecture: Embed tool data in markdown content instead of dataset
                if (agentResult.toolResults && agentResult.toolResults.length > 0) {
                    const { embedToolDataInMarkdown } = await import('./utils/messageContentParser');
                    
                    // Convert agent result format to ToolExecutionResult[] by adding timestamps
                    const toolExecutionResults: ToolExecutionResult[] = agentResult.toolResults.map(toolResult => ({
                        command: toolResult.command,
                        result: toolResult.result,
                        timestamp: new Date().toISOString()
                    }));
                    
                    responseContent = embedToolDataInMarkdown(
                        responseContent,
                        toolExecutionResults,
                        agentResult.reasoning,
                        agentResult.taskStatus
                    );
                    
                    // Store in dataset for backward compatibility during transition
                    const messageData = {
                        content: responseContent, // Include the processed content
                        toolResults: toolExecutionResults,
                        reasoning: agentResult.reasoning,
                        taskStatus: agentResult.taskStatus
                    };
                    container.dataset.messageData = JSON.stringify(messageData);
                    
                    this.plugin.debugLog('debug', '[ChatView] Embedded tool data in streaming response content', {
                        toolResultsCount: agentResult.toolResults.length,
                        originalLength: originalRawResponse.length,
                        embeddedLength: responseContent.length
                    });
                }
                
                // Update UI with final processed content
                const messageDiv = container.querySelector('.message-content');
                if (messageDiv) {
                    messageDiv.textContent = responseContent;
                    container.dataset.rawContent = responseContent;
                }
                
                this.plugin.debugLog('info', '[ChatView] Agent response processed successfully', {
                    hasToolResults: agentResult.toolResults && agentResult.toolResults.length > 0,
                    processedTextLength: responseContent.length
                });

                // FIX: Add task continuation logic that was missing!
                if (agentResult.hasTools && agentResult.toolResults && agentResult.toolResults.length > 0) {
                    // Import TaskContinuation dynamically
                    const { TaskContinuation } = await import('./components/agent/TaskContinuation');
                    
                    // Check if we should continue (not at limit and not completed)
                    const shouldContinue = 
                        agentResult.taskStatus.status === 'running' && 
                        !this.agentResponseHandler.isToolLimitReached();
                    
                    if (shouldContinue) {
                        this.plugin.debugLog('info', '[ChatView] Starting task continuation', {
                            toolExecutionCount: agentResult.taskStatus.toolExecutionCount,
                            maxExecutions: agentResult.taskStatus.maxToolExecutions
                        });

                        // Create TaskContinuation instance
                        const taskContinuation = new TaskContinuation(
                            this.plugin,
                            this.agentResponseHandler,
                            this.messagesContainer,
                            this // Component for markdown rendering
                        );

                        // Continue task until finished
                        // CRITICAL: Pass originalRawResponse (with tool commands) for message history
                        // Pass responseContent (cleaned) for UI display
                        const continuationResult = await taskContinuation.continueTaskUntilFinished(
                            messages,
                            container,
                            originalRawResponse, // initial response (raw with tool commands)
                            responseContent, // current content (cleaned for display)
                            agentResult.toolResults,
                            chatHistory
                        );

                        // Update with final content from continuation
                        responseContent = continuationResult.content;
                        
                        // Update UI
                        const updatedMessageDiv = container.querySelector('.message-content');
                        if (updatedMessageDiv) {
                            updatedMessageDiv.textContent = responseContent;
                            container.dataset.rawContent = responseContent;
                        }

                        this.plugin.debugLog('info', '[ChatView] Task continuation completed', {
                            finalContentLength: responseContent.length,
                            limitReached: continuationResult.limitReachedDuringContinuation
                        });
                    } else if (agentResult.shouldShowLimitWarning || this.agentResponseHandler.isToolLimitReached()) {
                        this.plugin.debugLog('info', '[ChatView] Tool limit reached - showing warning');
                        // Show tool limit warning UI
                        const warning = this.agentResponseHandler.createToolLimitWarning();
                        this.messagesContainer.appendChild(warning);
                    }
                }
                
            } catch (error) {
                this.plugin.debugLog('error', '[ChatView] Failed to process agent response:', error);
                // Continue with unprocessed response on error
            }
        }

        return responseContent;
    }

    public clearMessages() {
        this.messagesContainer.empty();
        if (this.agentResponseHandler) {
            this.agentResponseHandler.resetExecutionCount();
        }
    }
    public scrollMessagesToBottom() {
        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    }
    /**
     * Consolidated stop button click handler
     */
    private handleStopButtonClick(): void {
        this.plugin.debugLog('info', '[ChatView] Stop button clicked - stopping all active streams', {
            centralStreamState: this.centralStreamState,
            hasStreamCoordinator: !!this.streamCoordinator,
            streamCoordinatorIsStreaming: this.streamCoordinator?.isStreaming(),
            hasActiveStream: !!this.activeStream
        });
        
        // Use centralized stop logic
        this.stopAllActiveStreams();
        
        // Always restore UI state when stop is pressed
        this.restoreUIAfterStop();
        
        this.plugin.debugLog('info', '[ChatView] Stop button clicked - UI state restored', {
            finalCentralState: this.centralStreamState,
            textareaDisabled: this.domElementCache.textarea?.disabled,
            sendButtonHidden: this.domElementCache.sendButton?.classList.contains('hidden'),
            stopButtonHidden: this.domElementCache.stopButton?.classList.contains('hidden')
        });
    }

    /**
     * Centralized method to stop all active streams
     */
    private stopAllActiveStreams(): void {
        let streamsStopped = false;
        
        // Try StreamCoordinator first (preferred system)
        if (this.streamCoordinator && this.streamCoordinator.isStreaming()) {
            this.plugin.debugLog('info', '[ChatView] Stopping StreamCoordinator stream');
            this.streamCoordinator.stopStream();
            streamsStopped = true;
        }
        
        // Stop legacy streams
        if (this.activeStream) {
            this.plugin.debugLog('info', '[ChatView] Stopping legacy activeStream');
            this.activeStream.abort();
            this.activeStream = null;
            streamsStopped = true;
        }
        
        // Stop global plugin streams
        const myPlugin = this.plugin as any;
        if (myPlugin.hasActiveAIStreams && myPlugin.hasActiveAIStreams()) {
            this.plugin.debugLog('info', '[ChatView] Stopping global plugin streams');
            myPlugin.stopAllAIStreams();
            streamsStopped = true;
        }
        
        // Update central state immediately
        this.centralStreamState = {
            isStreaming: false,
            streamSource: null,
            lastUpdate: Date.now()
        };
        
        if (!streamsStopped) {
            this.plugin.debugLog('info', '[ChatView] No active streams found to stop');
            showNotice('No active AI stream to end');
        }
    }

    /**
     * Restore UI state after stopping streams
     */
    private restoreUIAfterStop(): void {
        const textarea = this.domElementCache.textarea;
        const sendButton = this.domElementCache.sendButton;
        const stopButton = this.domElementCache.stopButton;
        
        // DIAGNOSTIC: Log UI restoration process
        this.plugin.debugLog('debug', '[ChatView] Restoring UI after stop', {
            hasTextarea: !!textarea,
            hasSendButton: !!sendButton,
            hasStopButton: !!stopButton,
            textareaDisabledBefore: textarea?.disabled,
            sendButtonHiddenBefore: sendButton?.classList.contains('hidden'),
            stopButtonHiddenBefore: stopButton?.classList.contains('hidden')
        });
        
        if (textarea) {
            textarea.disabled = false;
            textarea.focus();
            this.plugin.debugLog('debug', '[ChatView] Textarea re-enabled and focused');
        }
        
        if (stopButton && sendButton) {
            stopButton.classList.add('hidden');
            sendButton.classList.remove('hidden');
            this.plugin.debugLog('debug', '[ChatView] Button visibility restored - stop hidden, send visible');
        }
        
        // Force UI sync with central state
        this.syncUIWithCentralState();
        
        // DIAGNOSTIC: Log final UI state
        this.plugin.debugLog('debug', '[ChatView] UI restoration complete', {
            textareaDisabledAfter: textarea?.disabled,
            sendButtonHiddenAfter: sendButton?.classList.contains('hidden'),
            stopButtonHiddenAfter: stopButton?.classList.contains('hidden'),
            centralStreamState: this.centralStreamState
        });
    }

    stopActiveStream(): void {
        // Use the consolidated stop logic
        this.stopAllActiveStreams();
    }
    hasActiveStream(): boolean {
        // Use centralized stream state as single source of truth
        return this.centralStreamState.isStreaming;
    }

    /**
     * Priority 2 Optimization: Debounced scroll to bottom
     */
    private debouncedScrollToBottom(): void {
        this.scrollDebouncer.debounce(async () => {
            this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
        });
    }

    /**
     * Priority 2 Optimization: Batch DOM updates for better performance
     */
    private batchDOMUpdates(elements: HTMLElement[], parent: HTMLElement): void {
        // Use the existing DOMBatcher API to add elements efficiently
        const operations = elements.map(element => ({
            element,
            parent
        }));
        this.domBatcher.addElements(operations);
    }

    /**
     * Initialize centralized stream state management
     */
    private initializeCentralizedStreamState(): void {
        this.plugin.debugLog('info', '[ChatView] Initializing centralized stream state management');
        
        // Set up periodic state synchronization (less frequent, more efficient)
        setInterval(() => {
            this.updateCentralStreamState();
        }, 250); // Reduced from 500ms for better responsiveness
    }

    /**
     * Update central stream state from all sources
     */
    private updateCentralStreamState(): void {
        const previousState = { ...this.centralStreamState };
        let isStreaming = false;
        let streamSource: 'coordinator' | 'legacy' | null = null;

        // Check StreamCoordinator first (preferred)
        if (this.streamCoordinator && this.streamCoordinator.isStreaming()) {
            isStreaming = true;
            streamSource = 'coordinator';
        }
        // Check legacy systems as fallback
        else if (this.hasLegacyActiveStreams()) {
            isStreaming = true;
            streamSource = 'legacy';
        }

        // Update state if changed
        if (isStreaming !== previousState.isStreaming || streamSource !== previousState.streamSource) {
            this.centralStreamState = {
                isStreaming,
                streamSource,
                lastUpdate: Date.now()
            };

            this.plugin.debugLog('debug', '[ChatView] Central stream state updated', {
                isStreaming,
                streamSource,
                previousState: previousState.isStreaming
            });

            // Update UI based on new state
            this.syncUIWithCentralState();
        }
    }

    /**
     * Check for legacy active streams
     */
    private hasLegacyActiveStreams(): boolean {
        // Check legacy activeStream
        if (this.activeStream) {
            return true;
        }
        
        // Check global plugin streams
        const hasGlobalStreams = (this.plugin as any).hasActiveAIStreams && (this.plugin as any).hasActiveAIStreams();
        return hasGlobalStreams;
    }

    /**
     * Sync UI with central stream state (single source of truth)
     */
    private syncUIWithCentralState(): void {
        const stopButton = this.domElementCache.stopButton;
        const sendButton = this.domElementCache.sendButton;
        
        if (!stopButton || !sendButton) {
            return; // UI not initialized yet
        }

        const { isStreaming, streamSource } = this.centralStreamState;
        
        if (isStreaming) {
            // Show stop button, hide send button
            if (stopButton.classList.contains('hidden')) {
                stopButton.classList.remove('hidden');
                sendButton.classList.add('hidden');
                this.plugin.debugLog('debug', `[ChatView] Central state - showing stop button (source: ${streamSource})`);
            }
        } else {
            // Show send button, hide stop button
            if (!stopButton.classList.contains('hidden')) {
                stopButton.classList.add('hidden');
                sendButton.classList.remove('hidden');
                this.plugin.debugLog('debug', '[ChatView] Central state - showing send button (no active streams)');
            }
        }
    }

    /**
     * Simplified callback for StreamCoordinator state changes
     */
    private onStreamCoordinatorStateChange(isStreaming: boolean): void {
        // Force immediate state update when StreamCoordinator changes
        this.centralStreamState = {
            isStreaming,
            streamSource: isStreaming ? 'coordinator' : null,
            lastUpdate: Date.now()
        };
        
        this.plugin.debugLog('debug', '[ChatView] StreamCoordinator state change', { isStreaming });
        this.syncUIWithCentralState();
    }

    /**
     * Invalidate the message cache to force fresh DOM reads
     * Called after message regeneration to ensure updated content is read
     */
    public invalidateMessageCache(): void {
        this.cachedMessageElements = [];
        this.lastScrollHeight = 0;
        
        // FIX: Also invalidate AIDispatcher cache to prevent stale responses
        if (this.plugin.aiDispatcher) {
            this.plugin.aiDispatcher.invalidateMessageCache();
            this.plugin.debugLog('debug', '[ChatView] AIDispatcher message cache invalidated');
        }
        
        this.plugin.debugLog('debug', '[ChatView] Message cache invalidated - will force fresh DOM reads');
    }

    /**
     * Get cached message elements, populating cache if empty
     */
    private getCachedMessageElements(): HTMLElement[] {
        if (this.cachedMessageElements.length === 0) {
            this.cachedMessageElements = Array.from(this.messagesContainer.querySelectorAll('.ai-chat-message')) as HTMLElement[];
            this.plugin.debugLog('debug', '[ChatView] Message cache populated', {
                messageCount: this.cachedMessageElements.length
            });
        }
        return this.cachedMessageElements;
    }
}

// Utility: escape regex special chars
function escapeRegExp(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
