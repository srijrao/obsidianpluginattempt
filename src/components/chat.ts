import { ItemView, WorkspaceLeaf, Notice, MarkdownRenderer, App } from 'obsidian';
import MyPlugin from '../main';
import { Message } from '../types';
import { createProvider, createProviderFromUnifiedModel } from '../../providers';
import { ChatHistoryManager, ChatMessage } from './chat/ChatHistoryManager';
import { createMessageElement } from './chat/Message';
import { createChatUI, ChatUIElements } from './chat/ui';
import { handleCopyAll, handleSaveNote, handleClearChat, handleSettings, handleHelp, handleReferenceNote } from './chat/eventHandlers';
import { saveChatAsNote, loadChatYamlAndApplySettings } from './chat/chatPersistence';
import { renderChatHistory } from './chat/chatHistoryUtils';
import { ChatHelpModal } from './chat/ChatHelpModal';

export const VIEW_TYPE_CHAT = 'chat-view';

export class ChatView extends ItemView {
    private plugin: MyPlugin;
    private chatHistoryManager: ChatHistoryManager;
    private messagesContainer: HTMLElement;
    private inputContainer: HTMLElement;
    private activeStream: AbortController | null = null;
    private referenceNoteIndicator: HTMLElement; // Add this property

    constructor(leaf: WorkspaceLeaf, plugin: MyPlugin) {
        super(leaf);
        this.plugin = plugin;
        this.chatHistoryManager = new ChatHistoryManager(this.app.vault, this.plugin.manifest.id, "chat-history.json");
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
        // All styling for messagesContainer and textarea is handled by CSS

        // --- HANDLE SEND MESSAGE ---
        const sendMessage = async () => {
            const content = textarea.value.trim();
            if (!content) return;

            // Disable input and show stop button
            textarea.disabled = true;
            sendButton.classList.add('hidden');
            stopButton.classList.remove('hidden');

            // Add user message
            const userMessageEl = await createMessageElement(this.app, 'user', content, this.chatHistoryManager, this.plugin, (el) => this.regenerateResponse(el), this);
            this.messagesContainer.appendChild(userMessageEl);
            this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
            textarea.value = '';

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
            }
        });

        // Modular input handler for slash commands and keyboard shortcuts
        // (setupInputHandler will be imported from './chat/inputHandler')
        // @ts-ignore
        import('./chat/inputHandler').then(({ setupInputHandler }) => {
            setupInputHandler(
                textarea,
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

    private async addMessage(role: 'user' | 'assistant', content: string, isError: boolean = false) {
        const messageEl = await createMessageElement(this.app, role, content, this.chatHistoryManager, this.plugin, (el) => this.regenerateResponse(el), this);
        // The timestamp for the UI element is set within createMessageElement
        const uiTimestamp = messageEl.dataset.timestamp || new Date().toISOString(); // Fallback, though createMessageElement should set it
        
        this.messagesContainer.appendChild(messageEl);
        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;

        // Persist the message, using the timestamp from the UI element for consistency
        // unless it's an error message that shouldn't be persisted as a regular chat entry.
        // However, the current requirement is to persist error messages too.
        try {
            await this.chatHistoryManager.addMessage({
                timestamp: uiTimestamp, 
                sender: role,
                content
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
        // Disable input during regeneration
        const textarea = this.inputContainer.querySelector('textarea');
        if (textarea) textarea.disabled = true;

        // Find all message elements
        const allMessages = Array.from(this.messagesContainer.querySelectorAll('.ai-chat-message'));
        const currentIndex = allMessages.indexOf(messageEl);
        const isUserClicked = messageEl.classList.contains('user');

        // Find the target AI message to overwrite
        let targetIndex = -1;
        if (isUserClicked) {
            // If user message: find the next AI message after this user message
            for (let i = currentIndex + 1; i < allMessages.length; i++) {
                if (allMessages[i].classList.contains('assistant')) {
                    targetIndex = i;
                    break;
                }
                if (allMessages[i].classList.contains('user')) {
                    break; // Stop if another user message is found first
                }
            }
        } else {
            // If AI message: target is this message
            targetIndex = currentIndex;
        }

        // Gather context up to and including the relevant user message
        let userMsgIndex = currentIndex;
        if (!isUserClicked) {
            userMsgIndex = currentIndex - 1;
            while (userMsgIndex >= 0 && !allMessages[userMsgIndex].classList.contains('user')) {
                userMsgIndex--;
            }
        }

        // Build context messages and include prior chat history
        const messages = await this.buildContextMessages();
        for (let i = 0; i <= userMsgIndex; i++) {
            const el = allMessages[i];
            const role = el.classList.contains('user') ? 'user' : 'assistant';
            const content = (el as HTMLElement).dataset.rawContent || '';
            messages.push({ role, content });
        }

        // Remove the old AI message if overwriting
        let originalTimestamp = new Date().toISOString();
        let originalContent = '';
        let insertAfterNode: HTMLElement | null = null;
        if (targetIndex !== -1) {
            const targetEl = allMessages[targetIndex] as HTMLElement;
            originalTimestamp = targetEl.dataset.timestamp || originalTimestamp;
            originalContent = targetEl.dataset.rawContent || '';
            insertAfterNode = targetEl.previousElementSibling as HTMLElement;
            targetEl.remove();
        } else if (isUserClicked) {
            // No AI message to overwrite, insert after user message
            insertAfterNode = messageEl;
        } else {
            // No user message found, insert at top
            insertAfterNode = null;
        }

        // Create new assistant message container for streaming
        const assistantContainer = await createMessageElement(this.app, 'assistant', '', this.chatHistoryManager, this.plugin, (el) => this.regenerateResponse(el), this);
        assistantContainer.dataset.timestamp = originalTimestamp;
        if (insertAfterNode && insertAfterNode.nextSibling) {
            this.messagesContainer.insertBefore(assistantContainer, insertAfterNode.nextSibling);
        } else {
            this.messagesContainer.appendChild(assistantContainer);
        }
        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;

        try {
            await this.streamAssistantResponse(messages, assistantContainer, originalTimestamp, originalContent);
        } catch (error) {
            if (error.name !== 'AbortError') {
                new Notice(`Error: ${error.message}`);
                assistantContainer.remove();
            }
        } finally {
            if (textarea) {
                textarea.disabled = false;
                textarea.focus();
            }
            this.activeStream = null;
        }
    }

    private updateReferenceNoteIndicator() {
        if (!this.referenceNoteIndicator) return;
        
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

    private async buildContextMessages(): Promise<Message[]> {
        const messages: Message[] = [
            { role: 'system', content: this.plugin.getSystemMessage() }
        ];

        // Add context notes if enabled
        if (this.plugin.settings.enableContextNotes && this.plugin.settings.contextNotes) {
            const contextContent = await this.plugin.getContextNotesContent(this.plugin.settings.contextNotes);
            messages[0].content += `\n\nContext Notes:\n${contextContent}`;
        }

        // Add current note content if enabled
        if (this.plugin.settings.referenceCurrentNote) {
            const currentFile = this.app.workspace.getActiveFile();
            if (currentFile) {
                const currentNoteContent = await this.app.vault.cachedRead(currentFile);
                messages.push({
                    role: 'system',
                    content: `Here is the content of the current note:\n\n${currentNoteContent}`
                });
            }
        }

        return messages;
    }

    private async streamAssistantResponse(
        messages: Message[],
        container: HTMLElement,
        originalTimestamp?: string,
        originalContent?: string
    ): Promise<string> {
        let responseContent = '';
        this.activeStream = new AbortController();        try {
            // Use unified model if available, fallback to legacy provider selection
            const provider = this.plugin.settings.selectedModel 
                ? createProviderFromUnifiedModel(this.plugin.settings, this.plugin.settings.selectedModel)
                : createProvider(this.plugin.settings);
            await provider.getCompletion(
                messages,
                {
                    temperature: this.plugin.settings.temperature,
                    maxTokens: this.plugin.settings.maxTokens,
                    streamCallback: async (chunk: string) => {
                        responseContent += chunk;
                        const contentEl = container.querySelector('.message-content') as HTMLElement;
                        if (contentEl) {
                            container.dataset.rawContent = responseContent;
                            contentEl.empty();
                            await MarkdownRenderer.render(
                                this.app,
                                responseContent,
                                contentEl,
                                '',
                                this
                            );
                            this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
                        }
                    },
                    abortController: this.activeStream
                }
            );

            // Update chat history if we have a timestamp
            if (originalTimestamp && responseContent.trim() !== "") {
                await this.chatHistoryManager.updateMessage(
                    originalTimestamp,
                    'assistant',
                    originalContent || '',
                    responseContent
                );
            }

            return responseContent;
        } catch (error) {
            if (error.name !== 'AbortError') {
                throw error;
            }
            return '';
        }
    }

    public clearMessages() {
        this.messagesContainer.empty();
    }

    public scrollMessagesToBottom() {
        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    }
}

// --- HELP MODAL --- // This class is now in a separate file: ChatHelpModal.ts
