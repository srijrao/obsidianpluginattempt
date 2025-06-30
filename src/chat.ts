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

export class ChatView extends ItemView {
    private plugin: MyPlugin;
    private chatHistoryManager: ChatHistoryManager;
    private messagesContainer: HTMLElement;
    private inputContainer: HTMLElement;
    private activeStream: AbortController | null = null;
    private referenceNoteIndicator: HTMLElement; 
    private modelNameDisplay: HTMLElement; 
    private agentResponseHandler: AgentResponseHandler | null = null;
    
    
    private contextBuilder: ContextBuilder;
    private messageRegenerator: MessageRegenerator | null = null;
    private responseStreamer: ResponseStreamer | null = null;
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

    async onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('ai-chat-view');

        
        let loadedHistory: ChatMessage[] = [];
        try {
            loadedHistory = await this.chatHistoryManager.getHistory();
        } catch (e) {
            new Notice("Failed to load chat history.");
            loadedHistory = [];
        }        
        const ui: ChatUIElements = createChatUI(this.app, contentEl);
        this.messagesContainer = ui.messagesContainer;
        this.inputContainer = ui.inputContainer;
        this.referenceNoteIndicator = ui.referenceNoteIndicator;
        this.modelNameDisplay = ui.modelNameDisplay;
        
        
        this.updateReferenceNoteIndicator();
        this.updateModelNameDisplay();
        const textarea = ui.textarea;
        const sendButton = ui.sendButton;
        const stopButton = ui.stopButton;        
        ui.copyAllButton.addEventListener('click', handleCopyAll(this.messagesContainer, this.plugin));
        ui.clearButton.addEventListener('click', handleClearChat(this.messagesContainer, this.chatHistoryManager));
        ui.settingsButton.addEventListener('click', handleSettings(this.app, this.plugin));
        ui.helpButton.addEventListener('click', handleHelp(this.app));
        
        ui.referenceNoteButton.addEventListener('click', () => {
            this.plugin.settings.referenceCurrentNote = !this.plugin.settings.referenceCurrentNote;
            this.plugin.saveSettings();
            this.updateReferenceNoteIndicator();
        });
        
        this.agentResponseHandler = new AgentResponseHandler({
            app: this.app,
            plugin: this.plugin,
            messagesContainer: this.messagesContainer,
            toolContinuationContainer: ui.toolContinuationContainer,
            onToolResult: (toolResult: ToolResult, command: ToolCommand) => {
                
                if (toolResult.success) {
                    console.log(`Tool ${command.action} completed successfully`, toolResult.data);
                } else {
                    console.error(`Tool ${command.action} failed:`, toolResult.error);
                }
            },
            onToolDisplay: (display: ToolRichDisplay) => {
                
                const toolWrapper = document.createElement('div');
                toolWrapper.className = 'real-time-tool-display';
                toolWrapper.appendChild(display.getElement());
                
                
                const tempContainer = this.messagesContainer.querySelector('.ai-chat-message.assistant:last-child');
                if (tempContainer) {
                    const messageContent = tempContainer.querySelector('.message-content');
                    if (messageContent) {
                        messageContent.appendChild(toolWrapper);
                        
                        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
                    }
                }
            }
        });
        
        
        ui.saveNoteButton.addEventListener('click', handleSaveNote(this.messagesContainer, this.plugin, this.app, this.agentResponseHandler));
        
        
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

        
        ui.agentModeButton.addEventListener('click', async () => {
            const isCurrentlyEnabled = this.plugin.isAgentModeEnabled();
            await this.plugin.setAgentModeEnabled(!isCurrentlyEnabled);
            
            if (this.plugin.isAgentModeEnabled()) {
                ui.agentModeButton.classList.add('active');
                ui.agentModeButton.setAttribute('title', 'Agent Mode: ON - AI can use tools');
                new Notice('Agent Mode enabled - AI can now use tools');
                
                
                if (this.agentResponseHandler) {
                    this.agentResponseHandler.resetExecutionCount();
                }
            } else {
                ui.agentModeButton.classList.remove('active');
                ui.agentModeButton.setAttribute('title', 'Agent Mode: OFF - Regular chat');
                new Notice('Agent Mode disabled');
            }
        });

        
        if (this.plugin.isAgentModeEnabled()) {
            ui.agentModeButton.classList.add('active');
            ui.agentModeButton.setAttribute('title', 'Agent Mode: ON - AI can use tools');
        } else {
            ui.agentModeButton.classList.remove('active');
            ui.agentModeButton.setAttribute('title', 'Agent Mode: OFF - Regular chat');
        }
        

        
        const sendMessage = async () => {
            const content = textarea.value.trim();
            if (!content) return;

            
            if (this.agentResponseHandler) {
                this.agentResponseHandler.resetExecutionCount();
            }

            
            textarea.disabled = true;
            sendButton.classList.add('hidden');
            stopButton.classList.remove('hidden');

            
            const userMessageEl = await createMessageElement(this.app, 'user', content, this.chatHistoryManager, this.plugin, (el: HTMLElement) => this.regenerateResponse(el), this);
            this.messagesContainer.appendChild(userMessageEl);
            this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
            textarea.value = '';

            
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
                
                const messages = await this.buildContextMessages();

                
                const messageElements = this.messagesContainer.querySelectorAll('.ai-chat-message');
                messageElements.forEach(el => {
                    const role = el.classList.contains('user') ? 'user' : 'assistant';
                    const content = el.querySelector('.message-content')?.textContent || '';
                    messages.push({ role, content });
                });

                
                const tempContainer = document.createElement('div');
                tempContainer.addClass('ai-chat-message', 'assistant');
                tempContainer.createDiv('message-content');
                this.messagesContainer.appendChild(tempContainer);
                this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;                const responseContent = await this.streamAssistantResponse(messages, tempContainer);

                
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
                if (error.name !== 'AbortError') {
                    new Notice(`Error: ${error.message}`);
                    await createMessageElement(this.app, 'assistant', `Error: ${error.message}`, this.chatHistoryManager, this.plugin, (el: HTMLElement) => this.regenerateResponse(el), this);
                }            } finally {
                
                textarea.disabled = false;
                textarea.focus();
                stopButton.classList.add('hidden');
                sendButton.classList.remove('hidden');
                this.activeStream = null;
                
            }
        };

        
        sendButton.addEventListener('click', sendMessage);
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

        
        
        import('./components/chat/inputHandler').then(({ setupInputHandler }) => {
            setupInputHandler(
                textarea,
                this.messagesContainer, 
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
            });        }

        this.updateReferenceNoteIndicator(); 
        
        
        this.registerEvent(this.app.workspace.on('active-leaf-change', () => {
            this.updateReferenceNoteIndicator();
        }));
        
        
        this.plugin.onSettingsChange(() => {
            this.updateReferenceNoteIndicator();
            this.updateModelNameDisplay();
        });
    }

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

    private async buildContextMessages(): Promise<Message[]> {
        return await this.contextBuilder.buildContextMessages();
    }

    
    private async streamAssistantResponse(
        messages: Message[],
        container: HTMLElement,
        originalTimestamp?: string,
        originalContent?: string
    ): Promise<string> {
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
        
        if (this.agentResponseHandler) {
            this.agentResponseHandler.resetExecutionCount();
        }
    }

    public scrollMessagesToBottom() {
        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    }    /**
     * Insert a rich tool display into the messages container
     */
    private insertToolDisplay(display: ToolRichDisplay): void {
        
        const toolDisplayWrapper = document.createElement('div');
        toolDisplayWrapper.className = 'ai-chat-message tool-display-message';
        
        
        const messageContainer = toolDisplayWrapper.createDiv('message-container');
        messageContainer.appendChild(display.getElement());
        
        
        toolDisplayWrapper.dataset.timestamp = new Date().toISOString();
        toolDisplayWrapper.dataset.rawContent = display.toMarkdown();
        
        
        const actionsEl = messageContainer.createDiv('message-actions');
        actionsEl.classList.add('hidden');

        
        toolDisplayWrapper.addEventListener('mouseenter', () => {
            actionsEl.classList.remove('hidden');
            actionsEl.classList.add('visible');
        });
        toolDisplayWrapper.addEventListener('mouseleave', () => {
            actionsEl.classList.remove('visible');
            actionsEl.classList.add('hidden');
        });

        
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

        
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'ai-chat-action-button';
        deleteBtn.setAttribute('aria-label', 'Delete tool display');
        deleteBtn.innerHTML = '<span>Delete</span>';
        deleteBtn.addEventListener('click', () => {
            toolDisplayWrapper.remove();
        });
        actionsEl.appendChild(deleteBtn);
        
        
        this.messagesContainer.appendChild(toolDisplayWrapper);
        
        
        this.scrollMessagesToBottom();
    }

    

    
}

