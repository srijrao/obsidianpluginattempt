import { App, MarkdownRenderer, Notice, Component } from 'obsidian';
import { Message as MessageType } from '../../types';
import { createActionButton, copyToClipboard } from './Buttons';
import { ConfirmationModal } from './ConfirmationModal';
import { MessageRenderer } from './MessageRenderer';
import { 
    handleCopyMessage, 
    handleEditMessage, 
    handleDeleteMessage, 
    handleRegenerateMessage 
} from './eventHandlers';

/**
 * Interface for a chat message.
 * Provides methods for rendering, editing, copying, deleting, and regenerating.
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
 * Abstract base class for chat messages.
 * Implements shared UI and logic for user/assistant messages.
 */
export abstract class Message extends Component implements IMessage {
    protected element: HTMLElement;
    protected contentElement: HTMLElement;
    protected actionsElement: HTMLElement;
    protected rawContent: string;
    protected app: App;
    public role: MessageType['role'];
    public content: string;

    /**
     * @param app Obsidian App instance
     * @param role Message role ('user' or 'assistant')
     * @param content Message content (markdown or plain)
     */
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
        // Debug logging if available
        if ((window as any).aiAssistantPlugin && typeof (window as any).aiAssistantPlugin.debugLog === 'function') {
            (window as any).aiAssistantPlugin.debugLog('debug', '[Message] constructor called', { role, content });
        }
        // Create main message element
        this.element = document.createElement('div');
        this.element.addClass('ai-chat-message', role);

        // Create container for content and actions
        const container = this.element.createDiv('message-container');
        this.contentElement = container.createDiv('message-content');
        this.actionsElement = container.createDiv('message-actions');

        // Show/hide actions on hover
        this.element.addEventListener('mouseenter', () => {
            this.actionsElement.removeClass('hidden');
            this.actionsElement.addClass('visible');
        });
        this.element.addEventListener('mouseleave', () => {
            this.actionsElement.removeClass('visible');
            this.actionsElement.addClass('hidden');
        });
    }

    // Abstract method for regenerating a message (to be implemented by subclasses)
    abstract regenerate(): Promise<void>;

    /**
     * Get the DOM element for this message.
     */
    getElement(): HTMLElement {
        return this.element;
    }

    /**
     * Get the raw content of the message.
     */
    getContent(): string {
        return this.rawContent;
    }

    /**
     * Update the message content and re-render.
     */
    setContent(content: string): void {
        this.rawContent = content;
        this.render();
    }

    /**
     * Render the message content with Markdown.
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
     * Delete this message from the DOM.
     */
    delete(): void {
        this.element.remove();
    }

    /**
     * Enable editing of the message.
     * Toggles between edit mode (textarea) and display mode.
     */
    edit(): void {
        if (this.contentElement.hasClass('editing')) {
            // Save edit: update content from textarea
            const textarea = this.contentElement.querySelector('textarea');
            if (textarea) {
                this.setContent(textarea.value);
                this.contentElement.removeClass('editing');
            }
        } else {
            // Enter edit mode: replace content with textarea
            const textarea = document.createElement('textarea');
            textarea.value = this.rawContent;
            this.contentElement.empty();
            this.contentElement.appendChild(textarea);
            textarea.focus();
            this.contentElement.addClass('editing');
        }
    }

    /**
     * Copy message content to clipboard.
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
 * Create a message element for the chat with enhanced reasoning and status support.
 * Uses MessageRenderer for all reasoning/task status rendering.
 * Adds action buttons for copy, edit, delete, and regenerate (assistant only).
 * 
 * @param app Obsidian App instance
 * @param role 'user' or 'assistant'
 * @param content Message content
 * @param chatHistoryManager Chat history manager instance
 * @param plugin Plugin instance
 * @param regenerateCallback Callback for regenerating a message
 * @param parentComponent Parent component for Markdown rendering context
 * @param messageData Optional enhanced message data (reasoning, toolResults, etc.)
 * @returns Promise resolving to the message HTMLElement
 */
export async function createMessageElement(
    app: App,
    role: 'user' | 'assistant',
    content: string,
    chatHistoryManager: any,
    plugin: any,
    regenerateCallback: (messageEl: HTMLElement) => void,
    parentComponent: Component,
    messageData?: MessageType
): Promise<HTMLElement> {
    const messageEl = document.createElement('div');
    messageEl.addClass('ai-chat-message', role);
    const messageContainer = messageEl.createDiv('message-container');
    messageEl.dataset.rawContent = content;
    messageEl.dataset.timestamp = new Date().toISOString();
    if (messageData) {
        messageEl.dataset.messageData = JSON.stringify(messageData);
    }
    const messageRenderer = new MessageRenderer(app);
    let contentEl: HTMLElement | null = null;

    // Render assistant messages with enhanced data if present
    if (role === 'assistant') {
        if (messageData && (messageData.reasoning || messageData.taskStatus)) {
            messageRenderer.updateMessageWithEnhancedData(messageEl, {
                ...messageData,
                role: 'assistant',
                content
            }, parentComponent);
        }
        if (messageData && messageData.toolResults && messageData.toolResults.length > 0) {
            contentEl = messageEl.querySelector('.message-content') as HTMLElement;
            if (!contentEl) {
                contentEl = messageContainer.createDiv('message-content');
            }
            await messageRenderer.renderMessage({
                ...messageData,
                role: 'assistant',
                content
            }, messageEl, parentComponent);
        } else if (!messageData?.reasoning && !messageData?.taskStatus) {
            contentEl = messageEl.querySelector('.message-content') as HTMLElement;
            if (!contentEl) {
                contentEl = messageContainer.createDiv('message-content');
            }
            await MarkdownRenderer.render(app, content, contentEl, '', parentComponent);
        }
    } else {
        // Render user messages
        contentEl = messageEl.querySelector('.message-content') as HTMLElement;
        if (!contentEl) {
            contentEl = messageContainer.createDiv('message-content');
        }
        await MarkdownRenderer.render(app, content, contentEl, '', parentComponent);
    }

    // Ensure contentEl is set
    if (!contentEl) {
        contentEl = messageEl.querySelector('.message-content') as HTMLElement;
        if (!contentEl) {
            contentEl = messageContainer.createDiv('message-content');
        }
    }

    // Create actions container and add action buttons
    const actionsEl = messageContainer.createDiv('message-actions');
    actionsEl.classList.add('hidden');

    // Show/hide actions on hover
    messageEl.addEventListener('mouseenter', () => {
        actionsEl.classList.remove('hidden');
        actionsEl.classList.add('visible');
    });
    messageEl.addEventListener('mouseleave', () => {
        actionsEl.classList.remove('visible');
        actionsEl.classList.add('hidden');
    });

    // Copy button
    actionsEl.appendChild(createActionButton('Copy', 'Copy message (including tool results)', handleCopyMessage(messageEl, plugin)));
    // Edit button
    actionsEl.appendChild(createActionButton('Edit', 'Edit message', handleEditMessage(messageEl, chatHistoryManager, plugin)));
    // Delete button
    actionsEl.appendChild(createActionButton('Delete', 'Delete message', handleDeleteMessage(messageEl, chatHistoryManager, app)));
    // Regenerate button (assistant only)
    if (role === 'assistant') {
        actionsEl.appendChild(createActionButton('Regenerate', 'Regenerate this response', handleRegenerateMessage(messageEl, regenerateCallback)));
    }

    messageContainer.appendChild(actionsEl);
    return messageEl;
}

