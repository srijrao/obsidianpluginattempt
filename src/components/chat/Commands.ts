import { Component, Notice, App } from 'obsidian';
import { Message } from '../../types';
import { createProvider, createProviderFromUnifiedModel } from '../../../providers';
import MyPlugin from '../../main';
import { BotMessage } from './BotMessage';
import { UserMessage } from './UserMessage';
import { MessageRenderer } from './MessageRenderer';

export interface IChatCommands {
    sendMessage(content: string): Promise<void>;
    stopGeneration(): void;
    clearChat(): void;
    copyAllMessages(): Promise<void>;
    regenerateResponse(messageEl: HTMLElement): Promise<void>;
}

/**
 * Commands component for handling chat operations
 */
export class Commands extends Component implements IChatCommands {
    private plugin: MyPlugin;
    private app: App;
    private messagesContainer: HTMLElement;
    private activeStream: AbortController | null = null;
    private onMessageSent?: () => void;

    constructor(
        app: App,
        plugin: MyPlugin,
        messagesContainer: HTMLElement,
        onMessageSent?: () => void
    ) {
        super();
        this.app = app;
        this.plugin = plugin;
        this.messagesContainer = messagesContainer;
        this.onMessageSent = onMessageSent;
    }

    /**
     * Send a new message and get AI response
     */
    async sendMessage(content: string): Promise<void> {
        if (!content.trim()) return;

        // Create user message
        const userMessage = new UserMessage(this.app, this.plugin, content);
        this.messagesContainer.appendChild(userMessage.getElement());
        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;

        // Create abort controller for streaming
        this.activeStream = new AbortController();        try {
            // Use unified model if available, fallback to legacy provider selection
            const provider = this.plugin.settings.selectedModel 
                ? createProviderFromUnifiedModel(this.plugin.settings, this.plugin.settings.selectedModel)
                : createProvider(this.plugin.settings);
            let systemMessage = this.plugin.getSystemMessage();

            // Process context notes
            if (this.plugin.settings.enableContextNotes && this.plugin.settings.contextNotes) {
                const contextContent = await this.plugin.getContextNotesContent(this.plugin.settings.contextNotes);
                systemMessage += `\n\nContext Notes:\n${contextContent}`;
            }

            // Prepare messages array
            const messages: Message[] = [{ role: 'system', content: systemMessage }];

            // Include current note content if enabled
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

            // Add user message
            messages.push({ role: 'user', content });

            // Create bot message for streaming
            const botMessage = new BotMessage(this.app, this.plugin, '');
            this.messagesContainer.appendChild(botMessage.getElement());
            this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;

            // Get completion from provider
            await provider.getCompletion(
                messages,
                {
                    temperature: this.plugin.settings.temperature,
                    maxTokens: this.plugin.settings.maxTokens,
                    streamCallback: async (chunk: string) => {
                        botMessage.setContent(botMessage.getContent() + chunk);
                        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
                    },
                    abortController: this.activeStream
                }
            );

            // Notify completion
            if (this.onMessageSent) {
                this.onMessageSent();
            }
        } catch (error) {
            if (error.name !== 'AbortError') {
                new Notice(`Error: ${error.message}`);
                const errorMessage = new BotMessage(this.app, this.plugin, `Error: ${error.message}`);
                this.messagesContainer.appendChild(errorMessage.getElement());
            }
        } finally {
            this.activeStream = null;
        }
    }

    /**
     * Stop the current message generation
     */
    stopGeneration(): void {
        if (this.activeStream) {
            this.activeStream.abort();
            this.activeStream = null;
        }
    }

    /**
     * Clear all messages from the chat
     */
    clearChat(): void {
        this.messagesContainer.empty();
    }    /**
     * Copy all messages to clipboard
     */
    async copyAllMessages(): Promise<void> {
        const messages = this.messagesContainer.querySelectorAll('.ai-chat-message');
        let chatContent = '';
          messages.forEach((el, index) => {
            const htmlElement = el as HTMLElement;
            
            // Skip tool display messages as they're handled inline now
            if (htmlElement.classList.contains('tool-display-message')) {
                return;
            }
            
            // Get the message data from the element's dataset
            let messageData = null;
            const messageDataStr = htmlElement.dataset.messageData;
            if (messageDataStr) {
                try {
                    messageData = JSON.parse(messageDataStr);
                } catch (e) {
                    // Fallback to textContent if parsing fails
                }
            }
            
            if (messageData && messageData.toolResults && messageData.toolResults.length > 0) {
                // Use MessageRenderer to get properly formatted content with tool results
                const renderer = new MessageRenderer(this.plugin.app);
                chatContent += renderer.getMessageContentForCopy(messageData);
            } else {
                // For regular messages, use raw content if available, otherwise text content
                const rawContent = htmlElement.dataset.rawContent;
                const content = rawContent !== undefined ? rawContent : el.querySelector('.message-content')?.textContent || '';
                chatContent += content;
            }
            
            if (index < messages.length - 1) {
                chatContent += '\n\n' + this.plugin.settings.chatSeparator + '\n\n';
            }
        });

        try {
            await navigator.clipboard.writeText(chatContent);
            new Notice('Copied to clipboard');
        } catch (error) {
            new Notice('Failed to copy to clipboard');
            console.error('Clipboard error:', error);
        }
    }

    /**
     * Regenerate an AI response
     */
    async regenerateResponse(messageEl: HTMLElement): Promise<void> {
        // Get all messages up to this point for context
        const messages: Message[] = [
            { role: 'system', content: this.plugin.getSystemMessage() }
        ];

        // Add context notes if enabled
        if (this.plugin.settings.enableContextNotes && this.plugin.settings.contextNotes) {
            const contextContent = await this.plugin.getContextNotesContent(this.plugin.settings.contextNotes);
            messages[0].content += `\n\nContext Notes:\n${contextContent}`;
        }

        const allMessages = Array.from(this.messagesContainer.querySelectorAll('.ai-chat-message'));
        const currentIndex = allMessages.indexOf(messageEl);

        // Get all messages up to current message
        for (let i = 0; i <= currentIndex; i++) {
            const el = allMessages[i];
            const role = el.classList.contains('user') ? 'user' : 'assistant';
            const content = (el as HTMLElement).dataset.rawContent || '';
            messages.push({ role, content });
        }

        // Determine which message to replace
        let messageToReplace: HTMLElement;
        if (messageEl.classList.contains('assistant')) {
            messageToReplace = messageEl;
        } else {
            messageToReplace = messageEl.nextElementSibling as HTMLElement;
            if (!messageToReplace?.classList.contains('assistant')) {
                return; // No assistant message to replace
            }
        }

        // Remove the message to be replaced
        messageToReplace.remove();

        // Create new bot message
        const botMessage = new BotMessage(this.app, this.plugin, '');
        this.messagesContainer.insertBefore(
            botMessage.getElement(),
            messageEl.classList.contains('assistant') ? messageEl.nextSibling : messageToReplace?.nextSibling || null
        );

        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;

        // Generate new response
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
                        botMessage.setContent(botMessage.getContent() + chunk);
                        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
                    },
                    abortController: this.activeStream
                }
            );
        } catch (error) {
            if (error.name !== 'AbortError') {
                new Notice(`Error: ${error.message}`);
                botMessage.getElement().remove();
            }
        } finally {
            this.activeStream = null;
        }
    }
}
