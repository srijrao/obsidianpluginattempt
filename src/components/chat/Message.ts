import { App, MarkdownRenderer, Notice, Component } from 'obsidian';
import { Message as MessageType } from '../../types';
import { createActionButton, copyToClipboard } from './Buttons';
import { ConfirmationModal } from './ConfirmationModal';

/**
 * Base Message interface for chat messages
 */
export interface IMessage {
    role: MessageType['role'];
    content: string;
    render(): Promise<void>;
    setContent(content: string): void;
    getContent(): string;
    delete(): void;
    edit(): void;
    copy(): Promise<void>;
    regenerate(): Promise<void>;
}

/**
 * Base Message class implementing shared functionality
 */
export abstract class Message extends Component implements IMessage {
    protected element: HTMLElement;
    protected contentElement: HTMLElement;
    protected actionsElement: HTMLElement;
    protected rawContent: string;
    protected app: App;
    public role: MessageType['role'];
    public content: string;

    constructor(
        app: App,
        role: MessageType['role'],
        content: string
    ) {
        super();
        this.app = app;
        this.role = role;
        this.content = content;
        this.rawContent = content;
        
        // Create base message structure
        this.element = document.createElement('div');
        this.element.addClass('ai-chat-message', role);
        
        // Create container for content and actions
        const container = this.element.createDiv('message-container');
        
        // Create content element
        this.contentElement = container.createDiv('message-content');
        
        // Create actions container
        this.actionsElement = container.createDiv('message-actions');
        
        // Add hover behavior
        this.element.addEventListener('mouseenter', () => {
            this.actionsElement.removeClass('hidden');
            this.actionsElement.addClass('visible');
        });
        this.element.addEventListener('mouseleave', () => {
            this.actionsElement.removeClass('visible');
            this.actionsElement.addClass('hidden');
        });
    }

    abstract regenerate(): Promise<void>;

    /**
     * Get the DOM element for this message
     */
    getElement(): HTMLElement {
        return this.element;
    }

    /**
     * Get the raw content of the message
     */
    getContent(): string {
        return this.rawContent;
    }

    /**
     * Update the message content
     */
    setContent(content: string): void {
        this.rawContent = content;
        this.render();
    }

    /**
     * Render the message content with Markdown
     */
    async render(): Promise<void> {
        this.contentElement.empty();
        await MarkdownRenderer.render(
            this.app,
            this.rawContent,
            this.contentElement,
            '',
            this
        ).catch((error) => {
            console.error('Markdown rendering error:', error);
            this.contentElement.textContent = this.rawContent;
        });
    }

    /**
     * Delete this message
     */
    delete(): void {
        this.element.remove();
    }

    /**
     * Enable editing of the message
     */
    edit(): void {
        if (this.contentElement.hasClass('editing')) {
            // Save edits
            const textarea = this.contentElement.querySelector('textarea');
            if (textarea) {
                this.setContent(textarea.value);
                this.contentElement.removeClass('editing');
            }
        } else {
            // Switch to edit mode
            const textarea = document.createElement('textarea');
            textarea.value = this.rawContent;
            this.contentElement.empty();
            this.contentElement.appendChild(textarea);
            textarea.focus();
            this.contentElement.addClass('editing');
        }
    }

    /**
     * Copy message content to clipboard
     */
    async copy(): Promise<void> {
        if (this.rawContent.trim() === '') {
            new Notice('No content to copy');
            return;
        }
        try {
            await navigator.clipboard.writeText(this.rawContent);
            new Notice('Copied to clipboard');
        } catch (error) {
            new Notice('Failed to copy to clipboard');
            console.error('Clipboard error:', error);
        }
    }
}

/**
 * Create a message element for the chat
 */
export function createMessageElement(
    app: App,
    role: 'user' | 'assistant',
    content: string,
    chatHistoryManager: any,
    plugin: any,
    regenerateCallback: (messageEl: HTMLElement) => void,
    parentComponent: Component
): HTMLElement {
    const messageEl = document.createElement('div');
    messageEl.addClass('ai-chat-message', role);
    const messageContainer = messageEl.createDiv('message-container');
    const contentEl = messageContainer.createDiv('message-content');
    messageEl.dataset.rawContent = content;
    messageEl.dataset.timestamp = new Date().toISOString();
    MarkdownRenderer.render(app, content, contentEl, '', parentComponent).catch((error) => {
        contentEl.textContent = content;
    });
    const actionsEl = messageContainer.createDiv('message-actions');
    actionsEl.classList.add('hidden');
    messageEl.addEventListener('mouseenter', () => {
        actionsEl.classList.remove('hidden');
        actionsEl.classList.add('visible');
    });
    messageEl.addEventListener('mouseleave', () => {
        actionsEl.classList.remove('visible');
        actionsEl.classList.add('hidden');
    });
    // Copy button
    actionsEl.appendChild(createActionButton('Copy', 'Copy message', () => {
        const currentContent = messageEl.dataset.rawContent || '';
        if (currentContent.trim() === '') {
            new Notice('No content to copy');
            return;
        }
        copyToClipboard(currentContent);
    }));
    // Edit button
    actionsEl.appendChild(createActionButton('Edit', 'Edit message', async () => {
        if (!contentEl.hasClass('editing')) {
            const textarea = document.createElement('textarea');
            textarea.value = messageEl.dataset.rawContent || '';
            textarea.className = 'message-content editing';
            contentEl.empty();
            contentEl.appendChild(textarea);
            textarea.focus();
            contentEl.addClass('editing');
            textarea.addEventListener('keydown', async (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    textarea.blur();
                }
            });
            textarea.addEventListener('blur', async () => {
                const oldContent = messageEl.dataset.rawContent;
                const newContent = textarea.value;
                try {
                    await chatHistoryManager.updateMessage(
                        messageEl.dataset.timestamp || new Date().toISOString(),
                        messageEl.classList.contains('user') ? 'user' : 'assistant',
                        oldContent || '',
                        newContent
                    );
                    messageEl.dataset.rawContent = newContent;
                    contentEl.empty();
                    await MarkdownRenderer.render(app, newContent, contentEl, '', parentComponent);
                    contentEl.removeClass('editing');
                } catch (e) {
                    new Notice('Failed to save edited message.');
                    messageEl.dataset.rawContent = oldContent || '';
                    contentEl.empty();
                    await MarkdownRenderer.render(app, oldContent || '', contentEl, '', parentComponent);
                    contentEl.removeClass('editing');
                }
            });
        }
    }));
    // Delete button
    actionsEl.appendChild(createActionButton('Delete', 'Delete message', () => {
        const modal = new ConfirmationModal(app, 'Delete message', 'Are you sure you want to delete this message?', (confirmed: boolean) => {
            if (confirmed) {
                chatHistoryManager.deleteMessage(
                    messageEl.dataset.timestamp || new Date().toISOString(),
                    messageEl.classList.contains('user') ? 'user' : 'assistant',
                    messageEl.dataset.rawContent || ''
                ).then(() => {
                    messageEl.remove();
                }).catch(() => {
                    new Notice('Failed to delete message from history.');
                });
            }
        });
        modal.open();
    }));
    // Regenerate button
    actionsEl.appendChild(createActionButton('Regenerate', 'Regenerate this response', () => {
        regenerateCallback(messageEl);
    }));
    
    messageContainer.appendChild(actionsEl);
    return messageEl;
}
