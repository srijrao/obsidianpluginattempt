import { ItemView, WorkspaceLeaf, Notice, MarkdownRenderer, Modal, App } from 'obsidian';
import MyPlugin from '../main';
import { Message } from '../types';
import { createProvider } from '../../providers';
import { ChatHistoryManager, ChatMessage } from './chat/ChatHistoryManager';
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

        // --- FADED HELP MESSAGE NEAR TOP ---
        const fadedHelp = contentEl.createDiv();
        fadedHelp.setText('Tip: Type /help or press Ctrl+Shift+H for chat commands and shortcuts.');
        fadedHelp.style.textAlign = 'center';
        fadedHelp.style.opacity = '0.6';
        fadedHelp.style.fontSize = '0.95em';
        fadedHelp.style.margin = '0.5em 0 0.2em 0';

        // --- BUTTONS ABOVE CHAT WINDOW ---
        const topButtonContainer = contentEl.createDiv('ai-chat-buttons');
        // Settings button
        const settingsButton = document.createElement('button');
        settingsButton.setText('Settings');
        settingsButton.setAttribute('aria-label', 'Toggle model settings');
        topButtonContainer.appendChild(settingsButton);
        // Copy All button
        const copyAllButton = document.createElement('button');
        copyAllButton.textContent = 'Copy All';
        topButtonContainer.appendChild(copyAllButton);
        // Save as Note button
        const saveNoteButton = document.createElement('button');
        saveNoteButton.textContent = 'Save as Note';
        topButtonContainer.appendChild(saveNoteButton);
        // Clear button
        const clearButton = document.createElement('button');
        clearButton.textContent = 'Clear Chat';
        topButtonContainer.appendChild(clearButton);

        // Messages container
        this.messagesContainer = contentEl.createDiv('ai-chat-messages');
        // All styling for messagesContainer is now handled by .ai-chat-messages in styles.css

        // --- INPUT CONTAINER AT BOTTOM ---
        this.inputContainer = contentEl.createDiv('ai-chat-input-container');
        // Textarea for input
        const textarea = this.inputContainer.createEl('textarea', {
            cls: 'ai-chat-input',
            attr: {
                placeholder: 'Type your message...',
                rows: '3'
            }
        });
        // All styling for textarea is now handled by .ai-chat-input in styles.css

        // Send button (now next to textarea)
        const sendButton = this.inputContainer.createEl('button', {
            text: 'Send',
            cls: 'mod-cta'
        });
        // Stop button (now next to textarea, hidden initially)
        const stopButton = this.inputContainer.createEl('button', {
            text: 'Stop',
        });
        stopButton.classList.add('hidden');

        // --- TINY HELP BUTTON ABOVE SEND BUTTON ---
        const helpButton = this.inputContainer.createEl('button', {
            text: '?',
        });
        helpButton.setAttr('aria-label', 'Show chat help');
        helpButton.style.fontSize = '0.9em';
        helpButton.style.width = '1.8em';
        helpButton.style.height = '1.8em';
        helpButton.style.marginBottom = '0.2em';
        helpButton.style.opacity = '0.7';
        helpButton.style.position = 'absolute';
        helpButton.style.right = '0.5em';
        helpButton.style.top = '-2.2em';
        helpButton.style.zIndex = '2';
        helpButton.addEventListener('click', () => {
            new ChatHelpModal(this.app).open();
        });
        this.inputContainer.style.position = 'relative';

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
        clearButton.addEventListener('click', async () => {
            this.messagesContainer.empty();
            try {
                await this.chatHistoryManager.clearHistory();
                // Do not show any message after clearing.
            } catch (e) {
                new Notice("Failed to clear chat history.");
            }
        });
        settingsButton.addEventListener('click', () => {
            const settingsModal = new SettingsModal(this.app, this.plugin);
            settingsModal.open();
        });

        // --- SLASH COMMANDS AND KEYBOARD SHORTCUTS ---
        async function handleSlashCommand(cmd: string) {
            switch (cmd) {
                case '/clear':
                    await clearButton.click();
                    break;
                case '/copy':
                    await copyAllButton.click();
                    break;
                case '/save':
                    await saveNoteButton.click();
                    break;
                case '/settings':
                    settingsButton.click();
                    break;
                case '/help':
                    new ChatHelpModal(this.app).open();
                    break;
            }
        }

        textarea.addEventListener('keydown', async (e) => {
            // Keyboard shortcuts: Ctrl+Shift+C (Clear), Y (Copy), S (Save), O (Settings), H (Help)
            if (e.ctrlKey && e.shiftKey) {
                if (e.key.toLowerCase() === 'c') { e.preventDefault(); await clearButton.click(); return; }
                if (e.key.toLowerCase() === 'y') { e.preventDefault(); await copyAllButton.click(); return; }
                if (e.key.toLowerCase() === 's') { e.preventDefault(); await saveNoteButton.click(); return; }
                if (e.key.toLowerCase() === 'o') { e.preventDefault(); settingsButton.click(); return; }
                if (e.key.toLowerCase() === 'h') { e.preventDefault(); new ChatHelpModal(this.app).open(); return; }
            }
            // Slash commands
            if (e.key === 'Enter' && !e.shiftKey) {
                const val = textarea.value.trim();
                if (val === '/clear' || val === '/copy' || val === '/save' || val === '/settings' || val === '/help') {
                    e.preventDefault();
                    await handleSlashCommand.call(this, val);
                    textarea.value = '';
                    return;
                }
                sendMessage();
                e.preventDefault();
            }
            // Shift+Enter will fall through and act as a normal Enter (newline)
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
        this.activeStream = new AbortController();

        try {
            const provider = createProvider(this.plugin.settings);
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
}

// --- HELP MODAL ---
class ChatHelpModal extends Modal {
    constructor(app: App) {
        super(app);
    }
    onOpen() {
        this.titleEl.setText('AI Chat Help');
        this.contentEl.innerHTML = `
            <div style="line-height:1.7;font-size:1em;">
                <b>Slash Commands:</b><br>
                <code>/clear</code> – Clear the chat<br>
                <code>/copy</code> – Copy all chat<br>
                <code>/save</code> – Save chat as note<br>
                <code>/settings</code> – Open settings<br>
                <code>/help</code> – Show this help<br>
                <br>
                <b>Keyboard Shortcuts (when input is focused):</b><br>
                <code>Ctrl+Shift+C</code> – Clear chat<br>
                <code>Ctrl+Shift+Y</code> – Copy all chat<br>
                <code>Ctrl+Shift+S</code> – Save as note<br>
                <code>Ctrl+Shift+O</code> – Open settings<br>
                <code>Ctrl+Shift+H</code> – Show this help<br>
                <br>
                <b>Other:</b><br>
                <code>Enter</code> – Send message<br>
                <code>Shift+Enter</code> – Newline<br>
                <br>
                You can also use the buttons at the top of the chat window.
            </div>
        `;
    }
}
