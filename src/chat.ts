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
import { Message, ToolCommand, ToolResult } from './types';
import { ChatHistoryManager, ChatMessage } from './components/chat/ChatHistoryManager';
import { createMessageElement } from './components/chat/Message';
import { createChatUI, ChatUIElements } from './components/chat/ui';
import { handleCopyAll, handleSaveNote, handleClearChat, handleSettings, handleHelp } from './components/chat/eventHandlers';import { loadChatYamlAndApplySettings } from './components/chat/chatPersistence';
import { renderChatHistory } from './components/chat/chatHistoryUtils';
import { AgentResponseHandler } from './components/chat/agent/AgentResponseHandler';
import { buildContextMessages } from './utils/contextBuilder';
import { MessageRegenerator } from './components/chat/MessageRegenerator';
import { ResponseStreamer } from './components/chat/ResponseStreamer';
import { MessageRenderer } from './components/chat/MessageRenderer';
import { ToolRichDisplay } from './components/chat/agent/ToolRichDisplay';
import { MessageContextPool, WeakCache, PreAllocatedArrays } from './utils/objectPool';
import { DOMBatcher } from './utils/domBatcher';

export const VIEW_TYPE_CHAT = 'chat-view';

/**
 * ChatView is the main Obsidian ItemView for the AI chat interface.
 * Handles UI, message flow, streaming, tool integration, and chat history.
 *
 * Major features:
 * - User/assistant message rendering and persistence
 * - Streaming assistant responses with real-time UI updates
 * - Agent/tool execution and result display
 * - Reference note and model indicator management
 * - Message regeneration (retry/modify)
 * - Slash command support in input
 * - Error handling and abortable streaming
 */
export class ChatView extends ItemView {
    // Plugin instance
    private plugin: MyPlugin;
    // Manages persistent chat history
    private chatHistoryManager: ChatHistoryManager;
    // Container for chat messages
    private messagesContainer: HTMLElement;
    // Container for input area
    private inputContainer: HTMLElement;
    // Tracks the current streaming response (for aborting)
    private activeStream: AbortController | null = null;
    // UI element indicating reference note status
    private referenceNoteIndicator: HTMLElement;
    // UI element displaying current model name
    private modelNameDisplay: HTMLElement;
    // Handles agent/tool responses and tool result display
    private agentResponseHandler: AgentResponseHandler | null = null;
    // Handles message regeneration (retry/modify)
    private messageRegenerator: MessageRegenerator | null = null;
    // Handles streaming of assistant responses
    private responseStreamer: ResponseStreamer | null = null;
    // Renders messages (markdown, etc.)
    private messageRenderer: MessageRenderer;
    
    // Memory optimization: Object pools and caches
    private messagePool: MessageContextPool;
    private domCache: WeakCache<HTMLElement, any>;
    private arrayManager: PreAllocatedArrays;
    
    // Cached DOM references to avoid repeated queries
    private cachedMessageElements: HTMLElement[] = [];
    private lastScrollHeight: number = 0;
    
    // Priority 1 Optimization: Cache frequently accessed DOM elements
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
        agentModeButton?: HTMLButtonElement;
        toolContinuationContainer?: HTMLElement;
    } = {};
    
    // Event listener cleanup tracking
    private eventListeners: Array<{
        element: HTMLElement;
        event: string;
        handler: EventListener;
    }> = [];
    
    // Priority 1 Optimization: DOM batching for efficient bulk operations
    private domBatcher: DOMBatcher;

    constructor(leaf: WorkspaceLeaf, plugin: MyPlugin) {
        super(leaf);
        this.plugin = plugin;
        // Initializes chat history manager for persistent storage
        this.chatHistoryManager = new ChatHistoryManager(this.app.vault, this.plugin.manifest.id, "chat-history.json");
        // Renders markdown and message content
        this.messageRenderer = new MessageRenderer(this.app);
        
        // Initialize memory optimization components
        this.messagePool = MessageContextPool.getInstance();
        this.domCache = new WeakCache();
        this.arrayManager = PreAllocatedArrays.getInstance();
        
        // Priority 1 Optimization: Initialize DOM batcher
        this.domBatcher = new DOMBatcher();
    }

    /**
     * Priority 1 Optimization: Helper method to add event listener with cleanup tracking
     */
    private addEventListenerWithCleanup(element: HTMLElement, event: string, handler: EventListener): void {
        element.addEventListener(event, handler);
        this.eventListeners.push({ element, event, handler });
    }

    /**
     * Priority 1 Optimization: Cache DOM elements for reuse
     */
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
        this.domElementCache.agentModeButton = ui.agentModeButton;
        this.domElementCache.toolContinuationContainer = ui.toolContinuationContainer;
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

    /**
     * Called when the view is opened. Sets up UI, loads history, and wires up events.
     *
     * - Loads chat history from disk
     * - Builds and wires up all UI elements
     * - Sets up event handlers for chat controls, agent mode, and input
     * - Handles streaming, message regeneration, and tool result display
     * - Applies YAML settings from the current note if available
     */
    async onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('ai-chat-view');

        // Load chat history from disk
        let loadedHistory: ChatMessage[] = [];
        try {
            loadedHistory = await this.chatHistoryManager.getHistory();
        } catch (e) {
            new Notice("Failed to load chat history.");
            loadedHistory = [];
        }        

        // Build UI elements and store references
        const ui: ChatUIElements = createChatUI(this.app, contentEl);
        this.messagesContainer = ui.messagesContainer;
        this.inputContainer = ui.inputContainer;
        this.referenceNoteIndicator = ui.referenceNoteIndicator;
        this.modelNameDisplay = ui.modelNameDisplay;

        // Priority 1 Optimization: Cache UI elements for reuse
        this.cacheUIElements(ui);

        // Update indicators for reference note and model
        this.updateReferenceNoteIndicator();
        this.updateModelNameDisplay();

        // Input and control buttons - use cached references
        const textarea = this.domElementCache.textarea!;
        const sendButton = this.domElementCache.sendButton!;
        const stopButton = this.domElementCache.stopButton!;

        // Wire up chat control buttons to their handlers with cleanup tracking
        this.addEventListenerWithCleanup(this.domElementCache.copyAllButton!, 'click', handleCopyAll(this.messagesContainer, this.plugin));
        this.addEventListenerWithCleanup(this.domElementCache.clearButton!, 'click', handleClearChat(this.messagesContainer, this.chatHistoryManager));
        this.addEventListenerWithCleanup(this.domElementCache.settingsButton!, 'click', handleSettings(this.app, this.plugin));
        this.addEventListenerWithCleanup(this.domElementCache.helpButton!, 'click', handleHelp(this.app));
        
        // Toggle reference note mode
        this.addEventListenerWithCleanup(this.domElementCache.referenceNoteButton!, 'click', () => {
            this.plugin.settings.referenceCurrentNote = !this.plugin.settings.referenceCurrentNote;
            this.plugin.saveSettings();
            this.updateReferenceNoteIndicator();
        });
        
        // Initialize agent/tool response handler
        this.agentResponseHandler = new AgentResponseHandler({
            app: this.app,
            plugin: this.plugin,
            messagesContainer: this.messagesContainer,
            toolContinuationContainer: this.domElementCache.toolContinuationContainer!,
            onToolResult: (toolResult: ToolResult, command: ToolCommand) => {
                // Log tool result for debugging
                if (toolResult.success) {
                    this.plugin.debugLog('info', '[chat.ts] Tool ${command.action} completed successfully', toolResult.data);
                } else {
                    this.plugin.debugLog('error', '[chat.ts] Tool ${command.action} failed:', toolResult.error);
                }
            },
            onToolDisplay: (display: ToolRichDisplay) => {
                // Insert real-time tool result display into the latest assistant message
                const toolWrapper = document.createElement('div');
                toolWrapper.className = 'real-time-tool-display';
                toolWrapper.appendChild(display.getElement());
                // Attach to the last assistant message's content
                const tempContainer = this.messagesContainer.querySelector('.ai-chat-message.assistant:last-child');
                if (tempContainer) {
                    const messageContent = tempContainer.querySelector('.message-content');
                    if (messageContent) {
                        messageContent.appendChild(toolWrapper);
                        // Scroll to bottom to show new tool result
                        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
                    }
                }
            }
        });
        
        // Save chat as note
        this.addEventListenerWithCleanup(this.domElementCache.saveNoteButton!, 'click', handleSaveNote(this.messagesContainer, this.plugin, this.app, this.agentResponseHandler));
        
        // Set up response streaming and regeneration
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
            this.activeStream
        );

        // Toggle agent mode (tool use)
        this.addEventListenerWithCleanup(this.domElementCache.agentModeButton!, 'click', async () => {
            const isCurrentlyEnabled = this.plugin.agentModeManager.isAgentModeEnabled();
            await this.plugin.agentModeManager.setAgentModeEnabled(!isCurrentlyEnabled);
            const agentButton = this.domElementCache.agentModeButton!;
            if (this.plugin.agentModeManager.isAgentModeEnabled()) {
                agentButton.classList.add('active');
                agentButton.setAttribute('title', 'Agent Mode: ON - AI can use tools');
                new Notice('Agent Mode enabled - AI can now use tools');
                // Reset tool execution count for new session
                if (this.agentResponseHandler) {
                    this.agentResponseHandler.resetExecutionCount();
                }
            } else {
                agentButton.classList.remove('active');
                agentButton.setAttribute('title', 'Agent Mode: OFF - Regular chat');
                new Notice('Agent Mode disabled');
            }
        });

        // Set initial agent mode button state
        const agentButton = this.domElementCache.agentModeButton!;
        if (this.plugin.agentModeManager.isAgentModeEnabled()) {
            agentButton.classList.add('active');
            agentButton.setAttribute('title', 'Agent Mode: ON - AI can use tools');
        } else {
            agentButton.classList.remove('active');
            agentButton.setAttribute('title', 'Agent Mode: OFF - Regular chat');
        }
        
        /**
         * Sends a user message and handles assistant response.
         * Handles UI state, message persistence, streaming, and error handling.
         *
         * Steps:
         * 1. Renders user message and saves to history
         * 2. Builds context and streams assistant response
         * 3. Handles tool/agent results and enhanced message data
         * 4. Persists assistant message if content or tool results exist
         * 5. Handles errors and restores UI state
         */
        const sendMessage = async () => {
            const content = textarea.value.trim();
            if (!content) return;

            // Reset agent execution count for new message
            if (this.agentResponseHandler) {
                this.agentResponseHandler.resetExecutionCount();
            }

            // Disable input and show stop button
            textarea.disabled = true;
            sendButton.classList.add('hidden');
            stopButton.classList.remove('hidden');

            // Render user message in UI
            const userMessageEl = await createMessageElement(this.app, 'user', content, this.chatHistoryManager, this.plugin, (el: HTMLElement) => this.regenerateResponse(el), this);
            this.messagesContainer.appendChild(userMessageEl);
            this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
            textarea.value = '';

            // Persist user message to history
            try {
                await this.chatHistoryManager.addMessage({
                    timestamp: userMessageEl.dataset.timestamp || new Date().toISOString(),
                    sender: 'user',
                    content: content
                });
            } catch (e) {
                new Notice('Failed to save user message: ' + e.message);
            }
            try {
                // Build context for assistant (system prompt, reference note, etc.)
                const messages = await this.buildContextMessages();

                // Add all visible messages to context (for streaming) - optimized version
                this.addVisibleMessagesToContext(messages);

                // Create a temporary container for streaming assistant response
                const tempContainer = document.createElement('div');
                tempContainer.addClass('ai-chat-message', 'assistant');
                tempContainer.createDiv('message-content');
                this.messagesContainer.appendChild(tempContainer);
                this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
                const responseContent = await this.streamAssistantResponse(messages, tempContainer);

                // Parse enhanced message data (tool results, reasoning, etc.)
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
                // Only save assistant message if there is content or tool results
                if (responseContent.trim() !== "" || (enhancedMessageData && enhancedMessageData.toolResults && enhancedMessageData.toolResults.length > 0)) {
                    // Create and render assistant message element
                    const messageEl = await createMessageElement(
                        this.app,
                        'assistant',
                        responseContent,
                        this.chatHistoryManager,
                        this.plugin,
                        (el) => this.regenerateResponse(el),
                        this,
                        enhancedMessageData
                    );

                    this.messagesContainer.appendChild(messageEl);

                    // Persist assistant message to history
                    this.plugin.debugLog('debug', '[chat.ts] About to save message to history with toolResults:', !!enhancedMessageData?.toolResults);
                    await this.chatHistoryManager.addMessage({
                        timestamp: messageEl.dataset.timestamp || new Date().toISOString(),
                        sender: 'assistant',
                        content: responseContent,
                        ...(enhancedMessageData && {
                            toolResults: enhancedMessageData.toolResults,
                            reasoning: enhancedMessageData.reasoning,
                            taskStatus: enhancedMessageData.taskStatus
                        })
                    });
                    this.plugin.debugLog('debug', '[chat.ts] Message saved to history successfully');
                } else {
                    // If no content or tool results, do not save
                    this.plugin.debugLog('debug', '[chat.ts] responseContent is empty and no toolResults, not saving message');
                }
            } catch (error) {
                // Handle errors except for user-initiated aborts
                if (error.name !== 'AbortError') {
                    new Notice(`Error: ${error.message}`);
                    await createMessageElement(this.app, 'assistant', `Error: ${error.message}`, this.chatHistoryManager, this.plugin, (el: HTMLElement) => this.regenerateResponse(el), this);
                }
            } finally {
                // Restore input state
                textarea.disabled = false;
                textarea.focus();
                stopButton.classList.add('hidden');
                sendButton.classList.remove('hidden');
                this.activeStream = null;
            }
        };

        // Send button triggers sendMessage
        this.addEventListenerWithCleanup(sendButton, 'click', sendMessage);
        // Stop button aborts streaming response
        this.addEventListenerWithCleanup(stopButton, 'click', () => {
            // Use the plugin's centralized stop method
            const myPlugin = this.plugin as any;
            if (myPlugin.stopAllAIStreams && typeof myPlugin.stopAllAIStreams === 'function') {
                myPlugin.stopAllAIStreams();
            }
            
            // Stop local stream as fallback/backup
            if (this.activeStream) {
                this.activeStream.abort();
                this.activeStream = null;
            }
            
            // Reset UI state
            textarea.disabled = false;
            textarea.focus();
            stopButton.classList.add('hidden');
            sendButton.classList.remove('hidden');
        });

        // Set up input handler for textarea (handles Enter, slash commands, etc.)
        import('./components/chat/inputHandler').then(({ setupInputHandler }) => {
            setupInputHandler(
                textarea,
                this.messagesContainer, 
                sendMessage,
                async (cmd: string) => {
                    // Handle slash commands in input
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

        // If there is chat history, render it and apply YAML settings from current note
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
            }
            await renderChatHistory({
                messagesContainer: this.messagesContainer,
                loadedHistory,
                chatHistoryManager: this.chatHistoryManager,
                plugin: this.plugin,
                regenerateResponse: (el: HTMLElement) => this.regenerateResponse(el),
                scrollToBottom: true
            });        
        }

        this.updateReferenceNoteIndicator(); 
        
        // Update reference note indicator on active note change
        this.registerEvent(this.app.workspace.on('active-leaf-change', () => {
            this.updateReferenceNoteIndicator();
        }));
        
        // Update indicators when plugin settings change
        this.plugin.onSettingsChange(() => {
            this.updateReferenceNoteIndicator();
            this.updateModelNameDisplay();
        });
    }

    /**
     * Adds a message to the UI and persists it to history.
     * Optionally includes enhanced data (tool results, reasoning, etc.).
     *
     * @param role 'user' or 'assistant'
     * @param content Message content
     * @param isError Whether this is an error message
     * @param enhancedData Optional enhanced data (toolResults, reasoning, taskStatus)
     */
    private async addMessage(role: 'user' | 'assistant', content: string, isError: boolean = false, enhancedData?: Partial<Pick<Message, 'reasoning' | 'taskStatus' | 'toolResults'>>): Promise<void> {
        const messageEl = await createMessageElement(this.app, role, content, this.chatHistoryManager, this.plugin, (el: HTMLElement) => this.regenerateResponse(el), this, enhancedData ? { role, content, ...enhancedData } : undefined);
        const uiTimestamp = messageEl.dataset.timestamp || new Date().toISOString();
        this.messagesContainer.appendChild(messageEl);
        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
        try {
            await this.chatHistoryManager.addMessage({
                timestamp: uiTimestamp,
                sender: role,
                content,
                ...(enhancedData || {})
            });
        } catch (e) {
            new Notice("Failed to save chat message: " + e.message);
        }
    }

    /**
     * Called when the view is closed. Aborts any active streaming response.
     */
    async onClose() {
        if (this.activeStream) {
            this.activeStream.abort();
            this.activeStream = null;
        }
        
        // Priority 1 Optimization: Clean up event listeners
        this.cleanupEventListeners();
        
        // Clean up memory optimization resources
        this.cleanupMemoryResources();
    }

    /**
     * Priority 1 Optimization: Clean up all tracked event listeners
     */
    private cleanupEventListeners(): void {
        for (const { element, event, handler } of this.eventListeners) {
            element.removeEventListener(event, handler);
        }
        this.eventListeners.length = 0;
    }

    /**
     * Clean up pooled objects and cached resources
     */
    private cleanupMemoryResources(): void {
        // Clear cached DOM elements
        this.cachedMessageElements.length = 0;
        this.lastScrollHeight = 0;
        
        // Clear DOM element cache
        this.domElementCache = {};
        
        // Priority 1 Optimization: Clean up DOM batcher
        if (this.domBatcher) {
            this.domBatcher.clear();
        }
        
        // Note: We don't clear the singleton pools as they may be used by other instances
        // The pools will be cleaned up when the plugin is unloaded
    }

    /**
     * Regenerates an assistant response for a given message element.
     * Used for retrying or modifying previous responses.
     * @param messageEl The message element to regenerate
     */
    private async regenerateResponse(messageEl: HTMLElement) {
        if (this.messageRegenerator) {
            await this.messageRegenerator.regenerateResponse(messageEl, () => this.buildContextMessages());
        }
    }

    /**
     * Updates the reference note indicator UI to reflect current state.
     */
    private updateReferenceNoteIndicator() {
        // Optionally update the reference note indicator here if needed
        const currentFile = this.app.workspace.getActiveFile();
        const isReferenceEnabled = this.plugin.settings.referenceCurrentNote;
        const button = this.referenceNoteIndicator.previousElementSibling as HTMLButtonElement;

        if (isReferenceEnabled && currentFile) {
            this.referenceNoteIndicator.setText(`📝 Referencing: ${currentFile.basename}`);
            this.referenceNoteIndicator.style.display = 'block';
            if (button && button.getAttribute('aria-label') === 'Toggle referencing current note') {
                button.setText('📝');
                button.classList.add('active');
            }
        } else {
            this.referenceNoteIndicator.style.display = 'none';
            if (button && button.getAttribute('aria-label') === 'Toggle referencing current note') {
                button.setText('📝');
                button.classList.remove('active');
            }
        }
    }

    /**
     * Updates the model name display UI to show the current model.
     */
    private updateModelNameDisplay() {
        if (!this.modelNameDisplay) return;
        let modelName = 'Unknown Model';
        const settings = this.plugin.settings;
        if (settings.selectedModel && settings.availableModels) {
            const found = settings.availableModels.find((m: any) => m.id === settings.selectedModel);
            if (found) modelName = found.name;
            else modelName = settings.selectedModel;
        } else if (settings.selectedModel) {
            modelName = settings.selectedModel;
        }
        this.modelNameDisplay.textContent = `Model: ${modelName}`;
    }

    /**
     * Builds the context messages for the assistant (system prompt, reference note, etc.).
     * @returns Array of context messages
     */
    private async buildContextMessages(): Promise<Message[]> {        return await buildContextMessages({ app: this.app, plugin: this.plugin });
    }

    /**
     * Optimized method to add visible messages to context using object pooling
     * @param messages Array to add messages to
     */
    private addVisibleMessagesToContext(messages: Message[]): void {
        // Use cached elements if available and DOM hasn't changed
        const currentScrollHeight = this.messagesContainer.scrollHeight;
        let messageElements: NodeListOf<Element>;
        
        if (this.lastScrollHeight === currentScrollHeight && this.cachedMessageElements.length > 0) {
            // Use cached elements
            messageElements = this.cachedMessageElements as any;
        } else {
            // Query DOM and cache results
            messageElements = this.messagesContainer.querySelectorAll('.ai-chat-message');
            this.cachedMessageElements = Array.from(messageElements) as HTMLElement[];
            this.lastScrollHeight = currentScrollHeight;
        }

        // Use object pool for message objects
        for (let i = 0; i < messageElements.length; i++) {
            const el = messageElements[i] as HTMLElement;
            const role = el.classList.contains('user') ? 'user' : 'assistant';
            const contentEl = el.querySelector('.message-content');
            const content = contentEl?.textContent || '';
            
            // Use pooled message object
            const messageObj = this.messagePool.acquireMessage();
            messageObj.role = role;
            messageObj.content = content;
            
            messages.push(messageObj as Message);
        }
    }

    /**
     * Streams the assistant response and updates the UI in real time.
     * Optionally updates an existing message in history.
     *
     * @param messages Array of context and chat messages
     * @param container The DOM element to stream response into
     * @param originalTimestamp (Optional) Timestamp if updating an existing message
     * @param originalContent (Optional) Original content if updating
     * @returns The streamed assistant response content
     */
    private async streamAssistantResponse(
        messages: Message[],
        container: HTMLElement,
        originalTimestamp?: string,
        originalContent?: string
    ): Promise<string> {
        if (!this.responseStreamer) {
            throw new Error("ResponseStreamer not initialized");
        }
        // Get current chat history for context
        const chatHistory = await this.chatHistoryManager.getHistory();
        // Stream response and update UI
        const responseContent = await this.responseStreamer.streamAssistantResponse(
            messages,
            container,
            originalTimestamp,
            originalContent,
            chatHistory
        );
        // If updating an existing message, persist the new content
        if (originalTimestamp && responseContent.trim() !== "") {
            let messageData: any = undefined;
            if (container.dataset.messageData) {
                try {
                    messageData = JSON.parse(container.dataset.messageData);
                } catch {}
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
     * Clears all messages from the UI and resets agent execution count.
     */
    public clearMessages() {
        this.messagesContainer.empty();
        if (this.agentResponseHandler) {
            this.agentResponseHandler.resetExecutionCount();
        }
    }

    /**
     * Scrolls the messages container to the bottom.
     */
    public scrollMessagesToBottom() {
        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    }
    
    /**
     * Stop the active AI stream in this chat view.
     */
    stopActiveStream(): void {
        if (this.activeStream) {
            this.activeStream.abort();
            this.activeStream = null;
        }
        
        // Also stop all plugin streams if available
        const myPlugin = this.plugin as any;
        if (myPlugin.aiDispatcher && typeof myPlugin.aiDispatcher.abortAllStreams === 'function') {
            myPlugin.aiDispatcher.abortAllStreams();
        }
    }

    /**
     * Check if this chat view has an active AI stream.
     */
    hasActiveStream(): boolean {
        // Check local stream
        if (this.activeStream !== null) {
            return true;
        }
        
        // Check dispatcher streams if available
        const myPlugin = this.plugin as any;
        if (myPlugin.aiDispatcher && typeof myPlugin.aiDispatcher.hasActiveStreams === 'function') {
            return myPlugin.aiDispatcher.hasActiveStreams();
        }
        
        return false;
    }
}

