import { App, MarkdownRenderer, Notice, Component } from 'obsidian';
import { Message as MessageType } from '../../types';

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
            // Rely on CSS for display
        });
        this.element.addEventListener('mouseleave', () => {
            // Rely on CSS for display
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
