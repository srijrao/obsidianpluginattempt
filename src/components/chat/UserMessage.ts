import { App, Component, MarkdownRenderer } from 'obsidian';
import MyPlugin from '../../main';
import { Buttons } from './Buttons';

/**
 * UserMessage represents a single user message in the chat UI.
 * Handles rendering, editing, copying, deleting, and triggering regeneration
 * of the subsequent assistant response.
 */
export class UserMessage extends Component {
    private app: App;
    private plugin: MyPlugin;
    private content: string;
    private element: HTMLElement;
    private contentEl: HTMLElement;

    /**
     * Constructs a UserMessage instance.
     * @param app Obsidian App instance
     * @param plugin Plugin instance (for settings, logging, etc.)
     * @param content The message content (markdown)
     */
    constructor(app: App, plugin: MyPlugin, content: string) {
        super();
        this.app = app;
        this.plugin = plugin;
        this.content = content;
        this.element = this.createMessageElement();
    }

    /**
     * Returns the root element for this message.
     */
    getElement(): HTMLElement {
        return this.element;
    }

    /**
     * Returns the current message content.
     */
    getContent(): string {
        return this.content;
    }

    /**
     * Updates the message content and re-renders the markdown.
     * @param content The new message content
     */
    async setContent(content: string): Promise<void> {
        this.content = content;
        this.element.dataset.rawContent = content;
        // Clear and re-render markdown
        this.contentEl.empty();
        await MarkdownRenderer.render(
            this.app,
            content,
            this.contentEl,
            '',
            this
        );
    }

    /**
     * Creates the message DOM element, including content and action buttons.
     * @returns The root message element
     */
    private createMessageElement(): HTMLElement {
        const messageEl = document.createElement('div');
        messageEl.addClass('ai-chat-message', 'user');
        messageEl.dataset.rawContent = this.content;

        // Message container for content and actions
        const messageContainer = messageEl.createDiv('message-container');

        // Content element for markdown rendering
        this.contentEl = messageContainer.createDiv('message-content');
        MarkdownRenderer.render(
            this.app,
            this.content,
            this.contentEl,
            '',
            this
        );

        // Action buttons (Copy, Edit, Delete, Regenerate)
        const buttons = new Buttons();
        const actions = buttons.createMessageActions([
            {
                label: 'Copy',
                tooltip: 'Copy message',
                onClick: async () => {
                    const content = messageEl.dataset.rawContent || '';
                    if (content.trim() === '') return;
                    await navigator.clipboard.writeText(content);
                }
            },
            {
                label: 'Edit',
                tooltip: 'Edit message',
                onClick: () => {
                    const wasEditing = this.contentEl.hasClass('editing');
                    if (!wasEditing) {
                        // Enter edit mode: replace content with textarea
                        const textarea = document.createElement('textarea');
                        textarea.value = messageEl.dataset.rawContent || '';
                        this.contentEl.empty();
                        this.contentEl.appendChild(textarea);
                        textarea.focus();
                        this.contentEl.addClass('editing');
                    } else {
                        // Exit edit mode: save textarea value as new content
                        const textarea = this.contentEl.querySelector('textarea');
                        if (textarea) {
                            this.setContent(textarea.value);
                            this.contentEl.removeClass('editing');
                        }
                    }
                }
            },
            {
                label: 'Delete',
                tooltip: 'Delete message',
                onClick: () => {
                    messageEl.remove();
                }
            },
            {
                label: 'Regenerate',
                tooltip: 'Regenerate the AI response',
                onClick: () => {
                    // Trigger a custom event for regeneration
                    const event = new CustomEvent('ai-assistant:regenerate-response', {
                        detail: { messageEl }
                    });
                    this.app.workspace.trigger('ai-assistant:regenerate-response', messageEl);
                }
            }
        ]);

        // Optionally, add hover effects or other UI logic here
        messageEl.addEventListener('mouseenter', () => {
            // ...existing code...
        });
        messageEl.addEventListener('mouseleave', () => {
            // ...existing code...
        });

        messageContainer.appendChild(actions);

        return messageEl;
    }
}
