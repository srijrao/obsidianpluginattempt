import { Component, Notice, App } from 'obsidian';
import { Message } from '../../types';
import { AIDispatcher } from '../../utils/aiDispatcher';
import MyPlugin from '../../main';
import { BotMessage } from './BotMessage';
import { UserMessage } from './UserMessage';
import { MessageRenderer } from '../agent/MessageRenderer';
import { buildContextMessages } from '../../utils/contextBuilder';

/**
 * Interface for chat command handlers.
 */
export interface IChatCommands {
    sendMessage(content: string): Promise<void>;
    stopGeneration(): void;
    clearChat(): void;
    copyAllMessages(): Promise<void>;
    regenerateResponse(messageEl: HTMLElement): Promise<void>;
}

/**
 * Commands component for handling chat operations.
 * Manages sending messages, stopping generation, clearing chat, copying, and regenerating responses.
 */
export class Commands extends Component implements IChatCommands {
    private plugin: MyPlugin;
    private app: App;
    private messagesContainer: HTMLElement;
    private activeStream: AbortController | null = null;
    private onMessageSent?: () => void;

    /**
     * @param app Obsidian App instance
     * @param plugin Plugin instance
     * @param messagesContainer The container element for chat messages
     * @param onMessageSent Optional callback after a message is sent
     */
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
     * Send a new message and get AI response.
     * Renders user and assistant messages, streams response, and handles errors.
     * @param content The user message content
     */
    async sendMessage(content: string): Promise<void> {
        if (!content.trim()) return;

        // Render user message
        const userMessage = new UserMessage(this.app, this.plugin, content);
        this.messagesContainer.appendChild(userMessage.getElement());
        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;

        // Prepare for streaming AI response
        this.activeStream = new AbortController();
        try {
            // Use the plugin's central AI dispatcher if available, otherwise create one
            const myPlugin = this.plugin as any;
            const aiDispatcher = myPlugin.aiDispatcher || new AIDispatcher(this.app.vault, this.plugin);

            // Build context messages (system, context notes, current note)
            const contextMessages = await buildContextMessages({
                app: this.app,
                plugin: this.plugin
            });

            // Add the user message
            const messages: Message[] = [...contextMessages, { role: 'user', content }];

            // Render assistant message (empty, to be filled by streaming)
            const botMessage = new BotMessage(this.app, this.plugin, '');
            this.messagesContainer.appendChild(botMessage.getElement());
            this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;

            // Stream the AI response and update the bot message
            await aiDispatcher.getCompletion(
                messages,
                {
                    temperature: this.plugin.settings.temperature,
                    streamCallback: async (chunk: string) => {
                        botMessage.setContent(botMessage.getContent() + chunk);
                        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
                    },
                    abortController: this.activeStream
                }
            );

            // Call the optional callback after sending
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
     * Stop the current message generation (abort streaming).
     */
    stopGeneration(): void {
        // Stop local stream
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
     * Clear all messages from the chat.
     */
    clearChat(): void {
        this.messagesContainer.empty();
    }

    /**
     * Copy all messages to clipboard.
     * Handles both plain and tool-rich messages.
     */
    async copyAllMessages(): Promise<void> {
        const messages = this.messagesContainer.querySelectorAll('.ai-chat-message');
        let chatContent = '';
        messages.forEach((el, index) => {
            const htmlElement = el as HTMLElement;
            // Skip tool display messages
            if (htmlElement.classList.contains('tool-display-message')) {
                return;
            }
            // Try to parse enhanced message data if present
            let messageData = null;
            const messageDataStr = htmlElement.dataset.messageData;
            if (messageDataStr) {
                try {
                    messageData = JSON.parse(messageDataStr);
                } catch (e) {
                    // Ignore parse errors
                }
            }
            // If toolResults are present, use formatted content
            if (messageData && messageData.toolResults && messageData.toolResults.length > 0) {
                const renderer = new MessageRenderer(this.plugin.app);
                chatContent += renderer.getMessageContentForCopy(messageData);
            } else {
                // Otherwise, use raw content or fallback to text content
                const rawContent = htmlElement.dataset.rawContent;
                const content = rawContent !== undefined ? rawContent : el.querySelector('.message-content')?.textContent || '';
                chatContent += content;
            }
            // Add separator between messages
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
     * Regenerate an AI response for a given message element.
     * Rebuilds the message history up to the selected message and replaces the assistant response.
     * @param messageEl The message element to regenerate
     */
    async regenerateResponse(messageEl: HTMLElement): Promise<void> {
        // Build context messages (system, context notes, current note)
        const contextMessages = await buildContextMessages({
            app: this.app,
            plugin: this.plugin
        });

        // Build message history up to the selected message
        const allMessages = Array.from(this.messagesContainer.querySelectorAll('.ai-chat-message'));
        const currentIndex = allMessages.indexOf(messageEl);

        const messages: Message[] = [...contextMessages];
        for (let i = 0; i <= currentIndex; i++) {
            const el = allMessages[i];
            const role = el.classList.contains('user') ? 'user' : 'assistant';
            const content = (el as HTMLElement).dataset.rawContent || '';
            messages.push({ role, content });
        }

        // Determine which message to replace (assistant message after user message)
        let messageToReplace: HTMLElement;
        if (messageEl.classList.contains('assistant')) {
            messageToReplace = messageEl;
        } else {
            messageToReplace = messageEl.nextElementSibling as HTMLElement;
            if (!messageToReplace?.classList.contains('assistant')) {
                return; 
            }
        }

        // Remove the old assistant message
        messageToReplace.remove();

        // Insert a new bot message for the regenerated response
        const botMessage = new BotMessage(this.app, this.plugin, '');
        this.messagesContainer.insertBefore(
            botMessage.getElement(),
            messageEl.classList.contains('assistant') ? messageEl.nextSibling : messageToReplace?.nextSibling || null
        );

        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;

        // Stream the regenerated response
        this.activeStream = new AbortController();
        try {
            // Use the plugin's central AI dispatcher if available, otherwise create one
            const myPlugin = this.plugin as any;
            const aiDispatcher = myPlugin.aiDispatcher || new AIDispatcher(this.app.vault, this.plugin);
            
            await aiDispatcher.getCompletion(
                messages,
                {
                    temperature: this.plugin.settings.temperature,
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
