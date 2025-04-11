import { ItemView, WorkspaceLeaf, Notice } from 'obsidian';
import MyPlugin from './main';
import { Message } from './types';
import { createProvider } from './providers';

export const VIEW_TYPE_CHAT = 'chat-view';

export class ChatView extends ItemView {
    plugin: MyPlugin;
    messagesContainer: HTMLElement;
    inputContainer: HTMLElement;
    activeStream: AbortController | null = null;

    constructor(leaf: WorkspaceLeaf, plugin: MyPlugin) {
        super(leaf);
        this.plugin = plugin;
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

        // Create main container with flex layout
        contentEl.addClass('ai-chat-view');
        
        // Messages container
        this.messagesContainer = contentEl.createDiv('ai-chat-messages');
        this.messagesContainer.style.flex = '1';
        this.messagesContainer.style.overflow = 'auto';
        this.messagesContainer.style.padding = '16px';

        // Input container at bottom
        this.inputContainer = contentEl.createDiv('ai-chat-input-container');
        this.inputContainer.style.borderTop = '1px solid var(--background-modifier-border)';
        this.inputContainer.style.padding = '16px';

        // Textarea for input
        const textarea = this.inputContainer.createEl('textarea', {
            cls: 'ai-chat-input',
            attr: {
                placeholder: 'Type your message...',
                rows: '3'
            }
        });

        // Style the textarea
        textarea.style.width = '100%';
        textarea.style.resize = 'none';
        textarea.style.border = '1px solid var(--background-modifier-border)';
        textarea.style.borderRadius = '4px';
        textarea.style.padding = '8px';
        textarea.style.backgroundColor = 'var(--background-primary)';
        textarea.style.color = 'var(--text-normal)';

        // Button container
        const buttonContainer = this.inputContainer.createDiv('ai-chat-buttons');
        buttonContainer.style.marginTop = '8px';
        buttonContainer.style.display = 'flex';
        buttonContainer.style.gap = '8px';
        buttonContainer.style.justifyContent = 'flex-end';

        // Send button
        const sendButton = buttonContainer.createEl('button', {
            text: 'Send',
            cls: 'mod-cta'
        });

        // Stop button (hidden initially)
        const stopButton = buttonContainer.createEl('button', {
            text: 'Stop',
        });
        stopButton.style.display = 'none';

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
            sendButton.style.display = 'none';
            stopButton.style.display = 'block';

            // Add user message
            this.addMessage('user', content);
            textarea.value = '';

            // Create abort controller for streaming
            this.activeStream = new AbortController();

            try {
                const provider = createProvider(this.plugin.settings);
                const messages: Message[] = [
                    { role: 'system', content: this.plugin.getSystemMessage() }
                ];

                // Get all existing messages
                const messageElements = this.messagesContainer.querySelectorAll('.ai-chat-message');
                messageElements.forEach(el => {
                    const role = el.classList.contains('user') ? 'user' : 'assistant';
                    const content = el.querySelector('.message-content')?.textContent || '';
                    messages.push({ role, content });
                });

                // Create assistant message container for streaming
                const assistantContainer = this.createMessageElement('assistant', '');
                this.messagesContainer.appendChild(assistantContainer);
                this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;

                let responseContent = '';
                await provider.getCompletion(
                    messages,
                    {
                        temperature: this.plugin.settings.temperature,
                        maxTokens: this.plugin.settings.maxTokens,
                        streamCallback: (chunk: string) => {
                            responseContent += chunk;
                            const contentEl = assistantContainer.querySelector('.message-content');
                            if (contentEl) {
                                contentEl.textContent = responseContent;
                                this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
                            }
                        },
                        abortController: this.activeStream
                    }
                );
            } catch (error) {
                if (error.name !== 'AbortError') {
                    new Notice(`Error: ${error.message}`);
                    this.addMessage('assistant', `Error: ${error.message}`);
                }
            } finally {
                // Re-enable input and hide stop button
                textarea.disabled = false;
                textarea.focus();
                stopButton.style.display = 'none';
                sendButton.style.display = 'block';
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
                stopButton.style.display = 'none';
                sendButton.style.display = 'block';
            }
        });

        clearButton.addEventListener('click', () => {
            this.messagesContainer.empty();
        });

        // Add initial system message
        this.addMessage('assistant', 'Hello! How can I help you today?');
    }

    private createMessageElement(role: 'user' | 'assistant', content: string): HTMLElement {
        const messageEl = document.createElement('div');
        messageEl.addClass('ai-chat-message', role);
        messageEl.style.marginBottom = '16px';
        messageEl.style.padding = '12px';
        messageEl.style.borderRadius = '8px';
        messageEl.style.backgroundColor = role === 'user' 
            ? 'var(--background-modifier-hover)'
            : 'var(--background-secondary)';

        const contentEl = messageEl.createDiv('message-content');
        contentEl.style.whiteSpace = 'pre-wrap';
        contentEl.textContent = content;

        return messageEl;
    }

    private addMessage(role: 'user' | 'assistant', content: string) {
        const messageEl = this.createMessageElement(role, content);
        this.messagesContainer.appendChild(messageEl);
        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    }

    async onClose() {
        if (this.activeStream) {
            this.activeStream.abort();
            this.activeStream = null;
        }
    }
}
