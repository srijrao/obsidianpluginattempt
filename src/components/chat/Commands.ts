import { Component, Notice, App } from 'obsidian';
import { Message } from '../../types';
import { createProvider, createProviderFromUnifiedModel } from '../../../providers';
import MyPlugin from '../../main';
import { BotMessage } from './BotMessage';
import { UserMessage } from './UserMessage';
import { MessageRenderer } from './MessageRenderer';
import { getSystemMessage } from '../../utils/systemMessage';
import { getContextNotesContent } from '../../utils/noteUtils';

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

        
        const userMessage = new UserMessage(this.app, this.plugin, content);
        this.messagesContainer.appendChild(userMessage.getElement());
        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;

        
        this.activeStream = new AbortController();        try {
            
            const provider = this.plugin.settings.selectedModel 
                ? createProviderFromUnifiedModel(this.plugin.settings, this.plugin.settings.selectedModel)
                : createProvider(this.plugin.settings);
            let systemMessage = getSystemMessage(this.plugin.settings);

            
            if (this.plugin.settings.enableContextNotes && this.plugin.settings.contextNotes) {
                const contextContent = await getContextNotesContent(this.plugin.settings.contextNotes, this.plugin.app);
                systemMessage += `\n\nContext Notes:\n${contextContent}`;
            }

            
            const messages: Message[] = [{ role: 'system', content: systemMessage }];

            
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

            
            messages.push({ role: 'user', content });

            
            const botMessage = new BotMessage(this.app, this.plugin, '');
            this.messagesContainer.appendChild(botMessage.getElement());
            this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;

            
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
            
            
            if (htmlElement.classList.contains('tool-display-message')) {
                return;
            }
            
            
            let messageData = null;
            const messageDataStr = htmlElement.dataset.messageData;
            if (messageDataStr) {
                try {
                    messageData = JSON.parse(messageDataStr);
                } catch (e) {
                    
                }
            }
              
            
            if (messageData && messageData.toolResults && messageData.toolResults.length > 0) {
                
                const renderer = new MessageRenderer(this.plugin.app);
                chatContent += renderer.getMessageContentForCopy(messageData);
            } else {
                
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
        
        const messages: Message[] = [
            { role: 'system', content: getSystemMessage(this.plugin.settings) }
        ];

        
        if (this.plugin.settings.enableContextNotes && this.plugin.settings.contextNotes) {
            const contextContent = await getContextNotesContent(this.plugin.settings.contextNotes, this.plugin.app);
            messages[0].content += `\n\nContext Notes:\n${contextContent}`;
        }

        const allMessages = Array.from(this.messagesContainer.querySelectorAll('.ai-chat-message'));
        const currentIndex = allMessages.indexOf(messageEl);

        
        for (let i = 0; i <= currentIndex; i++) {
            const el = allMessages[i];
            const role = el.classList.contains('user') ? 'user' : 'assistant';
            const content = (el as HTMLElement).dataset.rawContent || '';
            messages.push({ role, content });
        }

        
        let messageToReplace: HTMLElement;
        if (messageEl.classList.contains('assistant')) {
            messageToReplace = messageEl;
        } else {
            messageToReplace = messageEl.nextElementSibling as HTMLElement;
            if (!messageToReplace?.classList.contains('assistant')) {
                return; 
            }
        }

        
        messageToReplace.remove();

        
        const botMessage = new BotMessage(this.app, this.plugin, '');
        this.messagesContainer.insertBefore(
            botMessage.getElement(),
            messageEl.classList.contains('assistant') ? messageEl.nextSibling : messageToReplace?.nextSibling || null
        );

        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;

        
        this.activeStream = new AbortController();        try {
            
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
