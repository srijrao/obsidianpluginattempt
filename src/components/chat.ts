import { ItemView, WorkspaceLeaf, Notice, MarkdownRenderer } from 'obsidian';
import MyPlugin from '../main';
import { Message } from '../types';
import { createProvider } from '../../providers';
import { ChatHistoryManager, ChatMessage } from '../ChatHistoryManager';
import { SettingsModal } from './chat/SettingsModal';
import { ConfirmationModal } from './chat/ConfirmationModal';
import { createMessageElement } from './chat/Message';
import { createActionButton, copyToClipboard } from './chat/Buttons';
import { saveChatAsNote, loadChatYamlAndApplySettings } from './chat/chatPersistence';
import { renderChatHistory } from './chat/chatHistoryUtils';

export const VIEW_TYPE_CHAT = 'chat-view';

export class ChatView extends ItemView {
    plugin: MyPlugin;
    messagesContainer: HTMLElement;
    inputContainer: HTMLElement;
    activeStream: AbortController | null = null;
    private chatHistoryManager: ChatHistoryManager;

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

        // Load persistent chat history before UI setup
        let loadedHistory: ChatMessage[] = [];
        try {
            loadedHistory = await this.chatHistoryManager.getHistory();
        } catch (e) {
            new Notice("Failed to load chat history.");
            loadedHistory = [];
        }

        // Create main container with flex layout
        contentEl.addClass('ai-chat-view');

        // Create settings button in the button container (will be added later)
        const settingsButton = document.createElement('button');
        settingsButton.setText('Settings');
        settingsButton.setAttribute('aria-label', 'Toggle model settings');
        
        // We'll add this button to the button container later
        
        // Messages container
        this.messagesContainer = contentEl.createDiv('ai-chat-messages');
        // All styling for messagesContainer is now handled by .ai-chat-messages in styles.css

        // Input container at bottom
        this.inputContainer = contentEl.createDiv('ai-chat-input-container');
        // All styling for inputContainer is now handled by .ai-chat-input-container in styles.css

        // Textarea for input
        const textarea = this.inputContainer.createEl('textarea', {
            cls: 'ai-chat-input',
            attr: {
                placeholder: 'Type your message...',
                rows: '3'
            }
        });
        // All styling for textarea is now handled by .ai-chat-input in styles.css

        // Button container
        const buttonContainer = this.inputContainer.createDiv('ai-chat-buttons');
        // All styling for buttonContainer is now handled by .ai-chat-buttons in styles.css

        // Send button
        const sendButton = buttonContainer.createEl('button', {
            text: 'Send',
            cls: 'mod-cta'
        });

        // Stop button (hidden initially)
        const stopButton = buttonContainer.createEl('button', {
            text: 'Stop',
        });
        stopButton.classList.add('hidden');

        // Copy All button
        const copyAllButton = buttonContainer.createEl('button', {
            text: 'Copy All'
        });
        copyAllButton.addEventListener('click', async () => {
            const messages = this.messagesContainer.querySelectorAll('.ai-chat-message');
            let chatContent = '';
            messages.forEach((el, index) => {
                const content = el.querySelector('.message-content')?.textContent || '';
                chatContent += content;
                if (index < messages.length - 1) {
                    chatContent += '\n\n' + this.plugin.settings.chatSeparator + '\n\n';
                }
            });
            await copyToClipboard(chatContent);
        });

        // Save as Note button
        const saveNoteButton = buttonContainer.createEl('button', {
            text: 'Save as Note'
        });
        saveNoteButton.addEventListener('click', async () => {
            const provider = this.plugin.settings.provider;
            let model = '';
            if (provider === 'openai') model = this.plugin.settings.openaiSettings.model;
            else if (provider === 'anthropic') model = this.plugin.settings.anthropicSettings.model;
            else if (provider === 'gemini') model = this.plugin.settings.geminiSettings.model;
            else if (provider === 'ollama') model = this.plugin.settings.ollamaSettings.model;
            await saveChatAsNote({
                app: this.app,
                messages: this.messagesContainer.querySelectorAll('.ai-chat-message'),
                settings: this.plugin.settings,
                provider,
                model,
                chatSeparator: this.plugin.settings.chatSeparator,
                chatNoteFolder: this.plugin.settings.chatNoteFolder
            });
        });

        // Clear button
        const clearButton = buttonContainer.createEl('button', {
            text: 'Clear Chat'
        });

        // Handle send message
        const sendMessage = async () => {
            const content = textarea.value.trim();
            if (!content) return;

            // Disable input and show stop button
            textarea.disabled = true;
            sendButton.classList.add('hidden');
            stopButton.classList.remove('hidden');

    // Add user message
    await createMessageElement(this.app, 'user', content, this.chatHistoryManager, this.plugin, (el) => this.regenerateResponse(el), this);
    textarea.value = '';

            // Create abort controller for streaming
            this.activeStream = new AbortController();

            try {
                const provider = createProvider(this.plugin.settings);
                let systemMessage = this.plugin.getSystemMessage();
        
                // Process context notes to get the latest version
                if (this.plugin.settings.enableContextNotes && this.plugin.settings.contextNotes) {
                    const contextContent = await this.plugin.getContextNotesContent(this.plugin.settings.contextNotes);
                    systemMessage += `\n\nContext Notes:\n${contextContent}`;
                }
        
                const messages: Message[] = [
                    { role: 'system', content: systemMessage }
                ];

                // Include the current note's content if the toggle is enabled
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
                // All styling for tempContainer is now handled by .ai-chat-message.assistant in styles.css
                const contentEl = tempContainer.createDiv('message-content');
                this.messagesContainer.appendChild(tempContainer);
                this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;

                let responseContent = '';
                await provider.getCompletion(
                    messages,
                    {
                        temperature: this.plugin.settings.temperature,
                        maxTokens: this.plugin.settings.maxTokens,
                        streamCallback: async (chunk: string) => {
                            responseContent += chunk;
                            // Update display only during streaming
                            contentEl.empty();
                            await MarkdownRenderer.render(
                                this.app,
                                responseContent,
                                contentEl,
                                '',
                                this
                            );
                            this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
                        },
                        abortController: this.activeStream
                    }
                );

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

        // Event listeners
        textarea.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });

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

        clearButton.addEventListener('click', async () => {
            this.messagesContainer.empty();
            try {
                await this.chatHistoryManager.clearHistory();
                // Show initial system message after clearing (UI only, do not persist)
                const messageEl = await createMessageElement(this.app, 'assistant', this.plugin.settings.systemMessage || 'Hello! How can I help you today?', this.chatHistoryManager, this.plugin, (el) => this.regenerateResponse(el), this);
                this.messagesContainer.appendChild(messageEl);
                this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
            } catch (e) {
                new Notice("Failed to clear chat history.");
            }
        });

        // Add settings button to the button container
        buttonContainer.insertBefore(settingsButton, clearButton);
        
        // Settings button click handler
        settingsButton.addEventListener('click', () => {
            const settingsModal = new SettingsModal(this.app, this.plugin);
            settingsModal.open();
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
            });
        }
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
            // For AI message, find the previous user message
            userMsgIndex = currentIndex - 1;
            while (userMsgIndex >= 0 && !allMessages[userMsgIndex].classList.contains('user')) {
                userMsgIndex--;
            }
        }

        // Build context messages
        const contextMessages: Message[] = [
            { role: 'system', content: this.plugin.getSystemMessage() }
        ];
        if (this.plugin.settings.enableContextNotes && this.plugin.settings.contextNotes) {
            const contextContent = await this.plugin.getContextNotesContent(this.plugin.settings.contextNotes);
            contextMessages[0].content += `\n\nContext Notes:\n${contextContent}`;
        }
        if (this.plugin.settings.referenceCurrentNote) {
            const currentFile = this.app.workspace.getActiveFile();
            if (currentFile) {
                const currentNoteContent = await this.app.vault.cachedRead(currentFile);
                contextMessages.push({
                    role: 'system',
                    content: `Here is the content of the current note:\n\n${currentNoteContent}`
                });
            }
        }
        for (let i = 0; i <= userMsgIndex; i++) {
            const el = allMessages[i];
            const role = el.classList.contains('user') ? 'user' : 'assistant';
            const content = (el as HTMLElement).dataset.rawContent || '';
            contextMessages.push({ role, content });
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

        // Generate new response
        this.activeStream = new AbortController();
        let responseContent = '';
        try {
            const provider = createProvider(this.plugin.settings);
            await provider.getCompletion(
                contextMessages,
                {
                    temperature: this.plugin.settings.temperature,
                    maxTokens: this.plugin.settings.maxTokens,
                    streamCallback: async (chunk: string) => {
                        responseContent += chunk;
                        const contentEl = assistantContainer.querySelector('.message-content') as HTMLElement;
                        if (contentEl) {
                            assistantContainer.dataset.rawContent = responseContent;
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
        } catch (error) {
            if (error.name !== 'AbortError') {
                new Notice(`Error: ${error.message}`);
                assistantContainer.remove();
            }
        }
        // Update the message in persistent history
        try {
            if (responseContent.trim() !== "") {
                await this.chatHistoryManager.updateMessage(
                    originalTimestamp,
                    'assistant',
                    originalContent,
                    responseContent
                );
            }
        } finally {
            if (textarea) {
                textarea.disabled = false;
                textarea.focus();
            }
            this.activeStream = null;
        }
    }
}
