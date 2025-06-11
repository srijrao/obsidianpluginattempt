import { ItemView, WorkspaceLeaf, Notice, MarkdownRenderer, App } from 'obsidian';
import MyPlugin from '../main';
import { Message, TaskStatus } from '../types';
import { createProvider, createProviderFromUnifiedModel } from '../../providers';
import { ChatHistoryManager, ChatMessage } from './chat/ChatHistoryManager';
import { createMessageElement } from './chat/Message';
import { createChatUI, ChatUIElements } from './chat/ui';
import { handleCopyAll, handleSaveNote, handleClearChat, handleSettings, handleHelp, handleReferenceNote } from './chat/eventHandlers';
import { saveChatAsNote, loadChatYamlAndApplySettings } from './chat/chatPersistence';
import { renderChatHistory } from './chat/chatHistoryUtils';
import { ChatHelpModal } from './chat/ChatHelpModal';
import { AgentResponseHandler, AgentContext } from './chat/AgentResponseHandler';
import { ToolCommand, ToolResult } from '../types';
import { ContextBuilder } from './chat/ContextBuilder';
import { MessageRegenerator } from './chat/MessageRegenerator';
import { ResponseStreamer } from './chat/ResponseStreamer';
import { MessageRenderer } from './chat/MessageRenderer';

export const VIEW_TYPE_CHAT = 'chat-view';

export class ChatView extends ItemView {
    private plugin: MyPlugin;
    private chatHistoryManager: ChatHistoryManager;
    private messagesContainer: HTMLElement;
    private inputContainer: HTMLElement;
    private activeStream: AbortController | null = null;
    private referenceNoteIndicator: HTMLElement; // Add this property
    private agentResponseHandler: AgentResponseHandler | null = null;
    
    // Helper classes for refactoring
    private contextBuilder: ContextBuilder;
    private messageRegenerator: MessageRegenerator | null = null;
    private responseStreamer: ResponseStreamer | null = null;
    private messageRenderer: MessageRenderer;

    constructor(leaf: WorkspaceLeaf, plugin: MyPlugin) {
        super(leaf);
        this.plugin = plugin;
        this.chatHistoryManager = new ChatHistoryManager(this.app.vault, this.plugin.manifest.id, "chat-history.json");
        
        // Initialize helper classes
        this.contextBuilder = new ContextBuilder(this.app, this.plugin);
        this.messageRenderer = new MessageRenderer(this.app);
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
        contentEl.empty();
        contentEl.addClass('ai-chat-view');

        // Load persistent chat history before UI setup
        let loadedHistory: ChatMessage[] = [];
        try {
            loadedHistory = await this.chatHistoryManager.getHistory();
        } catch (e) {
            new Notice("Failed to load chat history.");
            loadedHistory = [];
        }        // Modular UI creation
        const ui: ChatUIElements = createChatUI(this.app, contentEl);
        this.messagesContainer = ui.messagesContainer;
        this.inputContainer = ui.inputContainer;
        this.referenceNoteIndicator = ui.referenceNoteIndicator;
        
        // Update reference note indicator
        this.updateReferenceNoteIndicator();
        const textarea = ui.textarea;
        const sendButton = ui.sendButton;
        const stopButton = ui.stopButton;
        // Attach event handlers
        ui.copyAllButton.addEventListener('click', handleCopyAll(this.messagesContainer, this.plugin));
        ui.saveNoteButton.addEventListener('click', handleSaveNote(this.messagesContainer, this.plugin, this.app));        ui.clearButton.addEventListener('click', handleClearChat(this.messagesContainer, this.chatHistoryManager));
        ui.settingsButton.addEventListener('click', handleSettings(this.app, this.plugin));
        ui.helpButton.addEventListener('click', handleHelp(this.app));
        // ui.referenceNoteButton.addEventListener('click', handleReferenceNote(this.app, this.plugin));
        ui.referenceNoteButton.addEventListener('click', () => {
            this.plugin.settings.referenceCurrentNote = !this.plugin.settings.referenceCurrentNote;
            this.plugin.saveSettings();
            this.updateReferenceNoteIndicator();
        });
        // --- AGENT MODE INTEGRATION ---
        // Initialize agent response handler
        this.agentResponseHandler = new AgentResponseHandler({
            app: this.app,
            plugin: this.plugin,
            messagesContainer: this.messagesContainer,
            onToolResult: (toolResult: ToolResult, command: ToolCommand) => {
                // Handle tool results (could display inline notifications, etc.)
                if (toolResult.success) {
                    console.log(`Tool ${command.action} completed successfully`, toolResult.data);
                } else {
                    console.error(`Tool ${command.action} failed:`, toolResult.error);
                }
            }
        });
        
        // Initialize helper classes that depend on agentResponseHandler
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

        // Agent mode button handler
        ui.agentModeButton.addEventListener('click', async () => {
            const isCurrentlyEnabled = this.plugin.isAgentModeEnabled();
            await this.plugin.setAgentModeEnabled(!isCurrentlyEnabled);
            
            if (this.plugin.isAgentModeEnabled()) {
                ui.agentModeButton.classList.add('active');
                ui.agentModeButton.setAttribute('title', 'Agent Mode: ON - AI can use tools');
                new Notice('Agent Mode enabled - AI can now use tools');
                
                // Reset execution count for new session
                if (this.agentResponseHandler) {
                    this.agentResponseHandler.resetExecutionCount();
                }
            } else {
                ui.agentModeButton.classList.remove('active');
                ui.agentModeButton.setAttribute('title', 'Agent Mode: OFF - Regular chat');
                new Notice('Agent Mode disabled');
            }
        });

        // Initialize button state
        if (this.plugin.isAgentModeEnabled()) {
            ui.agentModeButton.classList.add('active');
            ui.agentModeButton.setAttribute('title', 'Agent Mode: ON - AI can use tools');
        } else {
            ui.agentModeButton.classList.remove('active');
            ui.agentModeButton.setAttribute('title', 'Agent Mode: OFF - Regular chat');
        }
        // All styling for messagesContainer and textarea is handled by CSS

        // --- HANDLE SEND MESSAGE ---
        const sendMessage = async () => {
            const content = textarea.value.trim();
            if (!content) return;

            // Reset tool execution count for new user message
            if (this.agentResponseHandler) {
                this.agentResponseHandler.resetExecutionCount();
            }

            // Disable input and show stop button
            textarea.disabled = true;
            sendButton.classList.add('hidden');
            stopButton.classList.remove('hidden');

            // Add user message
            const userMessageEl = await createMessageElement(this.app, 'user', content, this.chatHistoryManager, this.plugin, (el) => this.regenerateResponse(el), this);
            this.messagesContainer.appendChild(userMessageEl);
            this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
            textarea.value = '';

            // --- Save user message to chat history ---
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
                // Build context and get chat history
                const messages = await this.buildContextMessages();

                // Get all existing messages
                const messageElements = this.messagesContainer.querySelectorAll('.ai-chat-message');
                messageElements.forEach(el => {
                    const role = el.classList.contains('user') ? 'user' : 'assistant';
                    const content = el.querySelector('.message-content')?.textContent || '';
                    messages.push({ role, content });
                });

                // Create temporary container for streaming display
                const tempContainer = document.createElement('div');
                tempContainer.addClass('ai-chat-message', 'assistant');
                tempContainer.createDiv('message-content');
                this.messagesContainer.appendChild(tempContainer);
                this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;

                const responseContent = await this.streamAssistantResponse(messages, tempContainer);

                // Remove temporary container and create permanent message
                tempContainer.remove();
                if (responseContent.trim() !== "") {
                    const messageEl = await createMessageElement(this.app, 'assistant', responseContent, this.chatHistoryManager, this.plugin, (el) => this.regenerateResponse(el), this);
                    this.messagesContainer.appendChild(messageEl);
                    await this.chatHistoryManager.addMessage({
                        timestamp: messageEl.dataset.timestamp || new Date().toISOString(),
                        sender: 'assistant',
                        content: responseContent
                    });
                }
            } catch (error) {
                if (error.name !== 'AbortError') {
                    new Notice(`Error: ${error.message}`);
                    await createMessageElement(this.app, 'assistant', `Error: ${error.message}`, this.chatHistoryManager, this.plugin, (el) => this.regenerateResponse(el), this);
                }
            } finally {
                // Re-enable input and hide stop button
                textarea.disabled = false;
                textarea.focus();
                stopButton.classList.add('hidden');
                sendButton.classList.remove('hidden');
                this.activeStream = null;
            }
        };

        // --- BUTTON EVENT LISTENERS ---
        sendButton.addEventListener('click', sendMessage);
        stopButton.addEventListener('click', () => {
            if (this.activeStream) {
                this.activeStream.abort();
                this.activeStream = null;
                textarea.disabled = false;
                textarea.focus();
                stopButton.classList.add('hidden');
                sendButton.classList.remove('hidden');
                // Hide progress indicator if present
                if (this.agentResponseHandler) {
                    this.agentResponseHandler.hideTaskProgress();
                }
            }
        });

        // Modular input handler for slash commands and keyboard shortcuts
        // (setupInputHandler will be imported from './chat/inputHandler')
        // @ts-ignore
        import('./chat/inputHandler').then(({ setupInputHandler }) => {
            setupInputHandler(
                textarea,
                this.messagesContainer, // Pass messagesContainer for keyboard shortcuts
                sendMessage,
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

        // Render loaded chat history
        if (loadedHistory.length > 0) {
            this.messagesContainer.empty();
            // If loading from a note, check for YAML frontmatter and update settings
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
                regenerateResponse: (el) => this.regenerateResponse(el),
                scrollToBottom: true
            });        }

        this.updateReferenceNoteIndicator(); // Update indicator on open
        
        // Listen for active file changes to update the indicator
        this.registerEvent(this.app.workspace.on('active-leaf-change', () => {
            this.updateReferenceNoteIndicator();
        }));
        
        // Listen for settings changes to update the indicator  
        this.plugin.onSettingsChange(() => {
            this.updateReferenceNoteIndicator();
        });
    }

    private async addMessage(role: 'user' | 'assistant', content: string, isError: boolean = false, enhancedData?: Partial<Pick<Message, 'reasoning' | 'taskStatus' | 'toolResults'>>): Promise<void> {
        const messageEl = await createMessageElement(this.app, role, content, this.chatHistoryManager, this.plugin, (el) => this.regenerateResponse(el), this, enhancedData ? { role, content, ...enhancedData } : undefined);
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

    async onClose() {
        if (this.activeStream) {
            this.activeStream.abort();
            this.activeStream = null;
        }
    }

    private async regenerateResponse(messageEl: HTMLElement) {
        if (this.messageRegenerator) {
            await this.messageRegenerator.regenerateResponse(messageEl, () => this.buildContextMessages());
        }
    }

    private updateReferenceNoteIndicator() {
        this.contextBuilder.updateReferenceNoteIndicator(this.referenceNoteIndicator);
    }

    private async buildContextMessages(): Promise<Message[]> {
        return await this.contextBuilder.buildContextMessages();
    }

    // Delegated to ResponseStreamer for DRY and clarity
    private async streamAssistantResponse(
        messages: Message[],
        container: HTMLElement,
        originalTimestamp?: string,
        originalContent?: string
    ): Promise<string> {
        if (!this.responseStreamer) {
            throw new Error("ResponseStreamer not initialized");
        }
        const responseContent = await this.responseStreamer.streamAssistantResponse(
            messages,
            container,
            originalTimestamp,
            originalContent
        );
        // Update chat history if we have a timestamp
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

    public clearMessages() {
        this.messagesContainer.empty();
        // Reset tool execution count when chat is cleared
        if (this.agentResponseHandler) {
            this.agentResponseHandler.resetExecutionCount();
        }
    }

    public scrollMessagesToBottom() {
        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    }

    // Task continuation logic is now delegated to TaskContinuation and ResponseStreamer

    // All reasoning/task status rendering and helpers are now handled by MessageRenderer
}

// --- HELP MODAL --- // This class is now in a separate file: ChatHelpModal.ts
