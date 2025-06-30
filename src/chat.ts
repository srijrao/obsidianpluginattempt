import { ItemView, WorkspaceLeaf, Notice, MarkdownRenderer, App } from 'obsidian';
import MyPlugin from './main';
import { Message, TaskStatus, ToolCommand, ToolResult } from './types';
import { createProvider, createProviderFromUnifiedModel } from '../providers';
import { ChatHistoryManager, ChatMessage } from './components/chat/ChatHistoryManager';
import { createMessageElement } from './components/chat/Message';
import { createChatUI, ChatUIElements } from './components/chat/ui';
import { handleCopyAll, handleSaveNote, handleClearChat, handleSettings, handleHelp, handleReferenceNote } from './components/chat/eventHandlers';
import { saveChatAsNote, loadChatYamlAndApplySettings } from './components/chat/chatPersistence';
import { renderChatHistory } from './components/chat/chatHistoryUtils';
import { ChatHelpModal } from './components/chat/ChatHelpModal';
import { AgentResponseHandler, AgentContext } from './components/chat/agent/AgentResponseHandler';
import { ContextBuilder } from './components/chat/agent/ContextBuilder';
import { MessageRegenerator } from './components/chat/MessageRegenerator';
import { ResponseStreamer } from './components/chat/ResponseStreamer';
import { MessageRenderer } from './components/chat/MessageRenderer';
import { ToolRichDisplay } from './components/chat/agent/ToolRichDisplay';

export const VIEW_TYPE_CHAT = 'chat-view';

/**
 * ChatView is the main Obsidian ItemView for the AI chat interface.
 * Handles UI, message flow, streaming, tool integration, and chat history.
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
    // Builds context for chat (e.g., reference note, system prompt)
    private contextBuilder: ContextBuilder;
    // Handles message regeneration (retry/modify)
    private messageRegenerator: MessageRegenerator | null = null;
    // Handles streaming of assistant responses
    private responseStreamer: ResponseStreamer | null = null;
    // Renders messages (markdown, etc.)
    private messageRenderer: MessageRenderer;

    constructor(leaf: WorkspaceLeaf, plugin: MyPlugin) {
        super(leaf);
        this.plugin = plugin;
        this.chatHistoryManager = new ChatHistoryManager(this.app.vault, this.plugin.manifest.id, "chat-history.json");
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

    /**
     * Called when the view is opened. Sets up UI, loads history, and wires up events.
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

        // Update indicators for reference note and model
        this.updateReferenceNoteIndicator();
        this.updateModelNameDisplay();

        // Input and control buttons
        const textarea = ui.textarea;
        const sendButton = ui.sendButton;
        const stopButton = ui.stopButton;        

        // Wire up chat control buttons to their handlers
        ui.copyAllButton.addEventListener('click', handleCopyAll(this.messagesContainer, this.plugin));
        ui.clearButton.addEventListener('click', handleClearChat(this.messagesContainer, this.chatHistoryManager));
        ui.settingsButton.addEventListener('click', handleSettings(this.app, this.plugin));
        ui.helpButton.addEventListener('click', handleHelp(this.app));
        
        // Toggle reference note mode
        ui.referenceNoteButton.addEventListener('click', () => {
            this.plugin.settings.referenceCurrentNote = !this.plugin.settings.referenceCurrentNote;
            this.plugin.saveSettings();
            this.updateReferenceNoteIndicator();
        });
        
        // Initialize agent/tool response handler
        this.agentResponseHandler = new AgentResponseHandler({
            app: this.app,
            plugin: this.plugin,
            messagesContainer: this.messagesContainer,
            toolContinuationContainer: ui.toolContinuationContainer,
            onToolResult: (toolResult: ToolResult, command: ToolCommand) => {
                // Log tool result for debugging
                if (toolResult.success) {
                    console.log(`Tool ${command.action} completed successfully`, toolResult.data);
                } else {
                    console.error(`Tool ${command.action} failed:`, toolResult.error);
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
        ui.saveNoteButton.addEventListener('click', handleSaveNote(this.messagesContainer, this.plugin, this.app, this.agentResponseHandler));
        
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
        ui.agentModeButton.addEventListener('click', async () => {
            const isCurrentlyEnabled = this.plugin.isAgentModeEnabled();
            await this.plugin.setAgentModeEnabled(!isCurrentlyEnabled);
            if (this.plugin.isAgentModeEnabled()) {
                ui.agentModeButton.classList.add('active');
                ui.agentModeButton.setAttribute('title', 'Agent Mode: ON - AI can use tools');
                new Notice('Agent Mode enabled - AI can now use tools');
                // Reset tool execution count for new session
                if (this.agentResponseHandler) {
                    this.agentResponseHandler.resetExecutionCount();
                }
            } else {
                ui.agentModeButton.classList.remove('active');
                ui.agentModeButton.setAttribute('title', 'Agent Mode: OFF - Regular chat');
                new Notice('Agent Mode disabled');
            }
        });

        // Set initial agent mode button state
        if (this.plugin.isAgentModeEnabled()) {
            ui.agentModeButton.classList.add('active');
            ui.agentModeButton.setAttribute('title', 'Agent Mode: ON - AI can use tools');
        } else {
            ui.agentModeButton.classList.remove('active');
            ui.agentModeButton.setAttribute('title', 'Agent Mode: OFF - Regular chat');
        }
        
        /**
         * Sends a user message and handles assistant response.
         * Handles UI state, message persistence, streaming, and error handling.
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

                // Add all visible messages to context (for streaming)
                const messageElements = this.messagesContainer.querySelectorAll('.ai-chat-message');
                messageElements.forEach(el => {
                    const role = el.classList.contains('user') ? 'user' : 'assistant';
                    const content = el.querySelector('.message-content')?.textContent || '';
                    messages.push({ role, content });
                });

                // Create a temporary container for streaming assistant response
                const tempContainer = document.createElement('div');
                tempContainer.addClass('ai-chat-message', 'assistant');
                tempContainer.createDiv('message-content');
                this.messagesContainer.appendChild(tempContainer);
                this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;                
                const responseContent = await this.streamAssistantResponse(messages, tempContainer);

                // Parse enhanced message data (tool results, reasoning, etc.)
                let enhancedMessageData: any = undefined;
                console.log('DEBUG: tempContainer.dataset.messageData exists:', !!tempContainer.dataset.messageData);
                if (tempContainer.dataset.messageData) {
                    try {
                        enhancedMessageData = JSON.parse(tempContainer.dataset.messageData);
                        console.log('DEBUG: enhancedMessageData parsed, toolResults count:', enhancedMessageData.toolResults?.length || 0);
                    } catch (e) {
                        console.warn("Failed to parse enhanced message data:", e);
                    }
                }

                console.log('DEBUG: responseContent length:', responseContent.length, 'trimmed length:', responseContent.trim().length);                
                tempContainer.remove();
                // Only save assistant message if there is content or tool results
                if (responseContent.trim() !== "" || (enhancedMessageData && enhancedMessageData.toolResults && enhancedMessageData.toolResults.length > 0)) {
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
                    console.log('DEBUG: About to save message to history with toolResults:', !!enhancedMessageData?.toolResults);
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
                    console.log('DEBUG: Message saved to history successfully');
                } else {
                    console.log('DEBUG: responseContent is empty and no toolResults, not saving message');
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
        sendButton.addEventListener('click', sendMessage);
        // Stop button aborts streaming response
        stopButton.addEventListener('click', () => {
            if (this.activeStream) {
                this.activeStream.abort();
                this.activeStream = null;
                textarea.disabled = false;
                textarea.focus();
                stopButton.classList.add('hidden');
                sendButton.classList.remove('hidden');
            }
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
    }

    /**
     * Regenerates an assistant response for a given message element.
     */
    private async regenerateResponse(messageEl: HTMLElement) {
        if (this.messageRegenerator) {
            await this.messageRegenerator.regenerateResponse(messageEl, () => this.buildContextMessages());
        }
    }

    /**
     * Updates the reference note indicator UI.
     */
    private updateReferenceNoteIndicator() {
        this.contextBuilder.updateReferenceNoteIndicator(this.referenceNoteIndicator);
    }

    /**
     * Updates the model name display UI.
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
     */
    private async buildContextMessages(): Promise<Message[]> {
        return await this.contextBuilder.buildContextMessages();
    }

    /**
     * Streams the assistant response and updates the UI in real time.
     * Optionally updates an existing message in history.
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
     * Insert a rich tool display into the messages container.
     * Used for displaying tool results outside of normal chat flow.
     */
    private insertToolDisplay(display: ToolRichDisplay): void {
        // Create wrapper for tool display
        const toolDisplayWrapper = document.createElement('div');
        toolDisplayWrapper.className = 'ai-chat-message tool-display-message';
        // Message container for tool result
        const messageContainer = toolDisplayWrapper.createDiv('message-container');
        messageContainer.appendChild(display.getElement());
        // Store timestamp and raw markdown for reference
        toolDisplayWrapper.dataset.timestamp = new Date().toISOString();
        toolDisplayWrapper.dataset.rawContent = display.toMarkdown();
        // Actions (copy/delete) for tool result
        const actionsEl = messageContainer.createDiv('message-actions');
        actionsEl.classList.add('hidden');
        // Show actions on hover
        toolDisplayWrapper.addEventListener('mouseenter', () => {
            actionsEl.classList.remove('hidden');
            actionsEl.classList.add('visible');
        });
        toolDisplayWrapper.addEventListener('mouseleave', () => {
            actionsEl.classList.remove('visible');
            actionsEl.classList.add('hidden');
        });
        // Copy button for tool result
        const copyBtn = document.createElement('button');
        copyBtn.className = 'ai-chat-action-button';
        copyBtn.setAttribute('aria-label', 'Copy tool result');
        copyBtn.innerHTML = '<span>Copy</span>';
        copyBtn.addEventListener('click', async () => {
            const content = display.toMarkdown();
            try {
                await navigator.clipboard.writeText(content);
                new Notice('Tool result copied to clipboard');
            } catch (error) {
                new Notice('Failed to copy to clipboard');
                console.error('Clipboard error:', error);
            }
        });
        actionsEl.appendChild(copyBtn);
        // Delete button for tool result
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'ai-chat-action-button';
        deleteBtn.setAttribute('aria-label', 'Delete tool display');
        deleteBtn.innerHTML = '<span>Delete</span>';
        deleteBtn.addEventListener('click', () => {
            toolDisplayWrapper.remove();
        });
        actionsEl.appendChild(deleteBtn);
        // Add tool display to messages container
        this.messagesContainer.appendChild(toolDisplayWrapper);
        // Scroll to bottom to show new tool result
        this.scrollMessagesToBottom();
    }
    
}

