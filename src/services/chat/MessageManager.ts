/**
 * @file MessageManager.ts
 * 
 * Message Manager service for handling chat message operations.
 * Extracted from ChatView to follow single responsibility principle.
 */

import { App } from 'obsidian';
import { IMessageManager, IEventBus } from '../interfaces';
import { ChatMessage, ChatHistoryManager } from '../../components/chat/ChatHistoryManager';
import { createMessageElement } from '../../components/chat/Message';
import { Message } from '../../types';
import type MyPlugin from '../../main';

export interface MessageDisplayOptions {
    animate?: boolean;
    scrollToView?: boolean;
    highlight?: boolean;
}

export interface MessageMetadata {
    toolResults?: any[];
    reasoning?: any;
    taskStatus?: any;
    isRegenerated?: boolean;
    originalTimestamp?: string;
}

/**
 * Manages chat messages, history, and display
 */
export class MessageManager implements IMessageManager {
    private messagesContainer: HTMLElement | null = null;
    private chatHistoryManager: ChatHistoryManager;

    constructor(
        private app: App,
        private plugin: MyPlugin,
        private eventBus: IEventBus,
        private regenerateCallback?: (messageElement: HTMLElement) => Promise<void>
    ) {
        this.chatHistoryManager = new ChatHistoryManager(
            this.app.vault,
            this.plugin.manifest.id,
            "chat-history.json"
        );
    }

    /**
     * Sets the messages container element
     */
    setMessagesContainer(container: HTMLElement): void {
        this.messagesContainer = container;
    }

    /**
     * Adds a new message to the chat
     */
    async addMessage(
        message: ChatMessage,
        options: MessageDisplayOptions = {}
    ): Promise<void> {
        try {
            // Add to history
            await this.chatHistoryManager.addMessage(message);

            // Create and display message element if container is available
            if (this.messagesContainer) {
                await this.displayMessage(message, options);
            }

            this.eventBus.publish('chat.message.added', {
                messageId: message.timestamp,
                sender: message.sender,
                contentLength: message.content.length,
                hasMetadata: !!(message as any).toolResults || !!(message as any).reasoning,
                timestamp: Date.now()
            });

        } catch (error: any) {
            this.eventBus.publish('chat.message.add_failed', {
                error: error.message,
                messageData: {
                    sender: message.sender,
                    contentLength: message.content.length
                },
                timestamp: Date.now()
            });
            throw error;
        }
    }

    /**
     * Regenerates a message by its ID
     */
    async regenerateMessage(messageId: string): Promise<void> {
        try {
            if (!this.messagesContainer) {
                throw new Error('Messages container not set');
            }

            // Find the message element
            const messageElement = this.messagesContainer.querySelector(
                `[data-timestamp="${messageId}"]`
            ) as HTMLElement;

            if (!messageElement) {
                throw new Error(`Message with ID ${messageId} not found`);
            }

            // Only allow regeneration of assistant messages
            if (!messageElement.classList.contains('assistant')) {
                throw new Error('Only assistant messages can be regenerated');
            }

            this.eventBus.publish('chat.message.regenerate_started', {
                messageId,
                timestamp: Date.now()
            });

            // Call the regeneration callback if available
            if (this.regenerateCallback) {
                await this.regenerateCallback(messageElement);
            }

            this.eventBus.publish('chat.message.regenerate_completed', {
                messageId,
                timestamp: Date.now()
            });

        } catch (error: any) {
            this.eventBus.publish('chat.message.regenerate_failed', {
                messageId,
                error: error.message,
                timestamp: Date.now()
            });
            throw error;
        }
    }

    /**
     * Gets the message history
     */
    getMessageHistory(): ChatMessage[] {
        // For now, return empty array - this will be enhanced to work with cached history
        const history: ChatMessage[] = [];
        
        this.eventBus.publish('chat.history.retrieved', {
            messageCount: history.length,
            timestamp: Date.now()
        });

        return history;
    }

    /**
     * Updates an existing message
     */
    async updateMessage(messageId: string, content: string): Promise<void> {
        try {
            // Find the message in history
            const history = await this.chatHistoryManager.getHistory();
            const messageIndex = history.findIndex(msg => msg.timestamp === messageId);
            
            if (messageIndex === -1) {
                throw new Error(`Message with ID ${messageId} not found in history`);
            }

            const message = history[messageIndex];
            const oldContent = message.content;

            // Update in history
            await this.chatHistoryManager.updateMessage(
                messageId,
                message.sender,
                oldContent,
                content
            );

            // Update display if container is available
            if (this.messagesContainer) {
                const messageElement = this.messagesContainer.querySelector(
                    `[data-timestamp="${messageId}"]`
                ) as HTMLElement;
                
                if (messageElement) {
                    const contentElement = messageElement.querySelector('.message-content');
                    if (contentElement) {
                        contentElement.textContent = content;
                    }
                }
            }

            this.eventBus.publish('chat.message.updated', {
                messageId,
                oldContentLength: oldContent.length,
                newContentLength: content.length,
                timestamp: Date.now()
            });

        } catch (error: any) {
            this.eventBus.publish('chat.message.update_failed', {
                messageId,
                error: error.message,
                timestamp: Date.now()
            });
            throw error;
        }
    }

    /**
     * Deletes a message
     */
    async deleteMessage(messageId: string): Promise<void> {
        try {
            // Remove from display
            if (this.messagesContainer) {
                const messageElement = this.messagesContainer.querySelector(
                    `[data-timestamp="${messageId}"]`
                ) as HTMLElement;
                
                if (messageElement) {
                    messageElement.remove();
                }
            }

            // Note: ChatHistoryManager doesn't have a delete method,
            // so we'll need to implement this by rewriting the history
            const history = await this.chatHistoryManager.getHistory();
            const filteredHistory = history.filter(msg => msg.timestamp !== messageId);
            
            // Clear and rebuild history
            await this.clearHistory();
            for (const message of filteredHistory) {
                await this.chatHistoryManager.addMessage(message);
            }

            this.eventBus.publish('chat.message.deleted', {
                messageId,
                timestamp: Date.now()
            });

        } catch (error: any) {
            this.eventBus.publish('chat.message.delete_failed', {
                messageId,
                error: error.message,
                timestamp: Date.now()
            });
            throw error;
        }
    }

    /**
     * Clears all messages
     */
    async clearHistory(): Promise<void> {
        try {
            // Clear display
            if (this.messagesContainer) {
                this.messagesContainer.empty();
            }

            // Clear history
            await this.chatHistoryManager.clearHistory();

            this.eventBus.publish('chat.history.cleared', {
                timestamp: Date.now()
            });

        } catch (error: any) {
            this.eventBus.publish('chat.history.clear_failed', {
                error: error.message,
                timestamp: Date.now()
            });
            throw error;
        }
    }

    /**
     * Gets message statistics
     */
    getMessageStats(): {
        totalMessages: number;
        userMessages: number;
        assistantMessages: number;
        averageMessageLength: number;
        totalCharacters: number;
    } {
        if (!this.messagesContainer) {
            return {
                totalMessages: 0,
                userMessages: 0,
                assistantMessages: 0,
                averageMessageLength: 0,
                totalCharacters: 0
            };
        }

        const messageElements = this.messagesContainer.querySelectorAll('.ai-chat-message');
        let userMessages = 0;
        let assistantMessages = 0;
        let totalCharacters = 0;

        messageElements.forEach(element => {
            const contentElement = element.querySelector('.message-content');
            const content = contentElement?.textContent || '';
            totalCharacters += content.length;

            if (element.classList.contains('user')) {
                userMessages++;
            } else if (element.classList.contains('assistant')) {
                assistantMessages++;
            }
        });

        const totalMessages = messageElements.length;
        const averageMessageLength = totalMessages > 0 ? totalCharacters / totalMessages : 0;

        return {
            totalMessages,
            userMessages,
            assistantMessages,
            averageMessageLength: Math.round(averageMessageLength),
            totalCharacters
        };
    }

    /**
     * Exports chat history in various formats
     */
    async exportHistory(format: 'json' | 'markdown' | 'text' = 'json'): Promise<string> {
        const history = await this.getMessageHistory();

        switch (format) {
            case 'json':
                return JSON.stringify(history, null, 2);

            case 'markdown':
                return this.exportAsMarkdown(history);

            case 'text':
                return this.exportAsText(history);

            default:
                throw new Error(`Unsupported export format: ${format}`);
        }
    }

    /**
     * Imports chat history from JSON
     */
    async importHistory(data: string): Promise<void> {
        try {
            const history = JSON.parse(data) as ChatMessage[];
            
            // Validate the data structure
            if (!Array.isArray(history)) {
                throw new Error('Invalid history format: expected array');
            }

            // Clear current history
            await this.clearHistory();

            // Import messages
            for (const message of history) {
                await this.addMessage(message);
            }

            this.eventBus.publish('chat.history.imported', {
                messageCount: history.length,
                timestamp: Date.now()
            });

        } catch (error: any) {
            this.eventBus.publish('chat.history.import_failed', {
                error: error.message,
                timestamp: Date.now()
            });
            throw error;
        }
    }

    /**
     * Displays a message in the UI
     */
    private async displayMessage(
        message: ChatMessage,
        options: MessageDisplayOptions
    ): Promise<void> {
        if (!this.messagesContainer) return;

        const messageElement = await createMessageElement(
            this.app,
            message.sender as 'user' | 'assistant',
            message.content,
            this.chatHistoryManager,
            this.plugin,
            this.regenerateCallback ? (el: HTMLElement) => { this.regenerateCallback!(el); } : (el: HTMLElement) => {},
            this.plugin as any, // chatView reference - will need to be handled differently
            message as any // Enhanced message data
        );

        // Set timestamp for identification
        messageElement.dataset.timestamp = message.timestamp;

        // Add animation if requested
        if (options.animate) {
            messageElement.style.opacity = '0';
            messageElement.style.transform = 'translateY(20px)';
        }

        this.messagesContainer.appendChild(messageElement);

        // Animate in if requested
        if (options.animate) {
            requestAnimationFrame(() => {
                messageElement.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
                messageElement.style.opacity = '1';
                messageElement.style.transform = 'translateY(0)';
            });
        }

        // Scroll to view if requested
        if (options.scrollToView) {
            messageElement.scrollIntoView({ behavior: 'smooth', block: 'end' });
        }

        // Highlight if requested
        if (options.highlight) {
            messageElement.classList.add('highlighted');
            setTimeout(() => {
                messageElement.classList.remove('highlighted');
            }, 2000);
        }
    }

    /**
     * Exports history as markdown
     */
    private exportAsMarkdown(history: ChatMessage[]): string {
        const lines = ['# Chat History', ''];
        
        for (const message of history) {
            const timestamp = new Date(message.timestamp).toLocaleString();
            const role = message.sender === 'user' ? 'User' : 'Assistant';
            
            lines.push(`## ${role} - ${timestamp}`);
            lines.push('');
            lines.push(message.content);
            lines.push('');
        }

        return lines.join('\n');
    }

    /**
     * Exports history as plain text
     */
    private exportAsText(history: ChatMessage[]): string {
        const lines: string[] = [];
        
        for (const message of history) {
            const timestamp = new Date(message.timestamp).toLocaleString();
            const role = message.sender === 'user' ? 'User' : 'Assistant';
            
            lines.push(`[${timestamp}] ${role}: ${message.content}`);
            lines.push('');
        }

        return lines.join('\n');
    }

    /**
     * Cleanup method for disposing the service
     */
    dispose(): void {
        this.messagesContainer = null;
    }
}