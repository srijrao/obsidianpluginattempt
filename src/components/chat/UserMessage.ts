import { App, Component, MarkdownRenderer } from 'obsidian';
import MyPlugin from '../../main';
import { Buttons } from './Buttons';

export class UserMessage extends Component {
    private app: App;
    private plugin: MyPlugin;
    private content: string;
    private element: HTMLElement;
    private contentEl: HTMLElement;

    constructor(app: App, plugin: MyPlugin, content: string) {
        super();
        this.app = app;
        this.plugin = plugin;
        this.content = content;
        this.element = this.createMessageElement();
    }

    getElement(): HTMLElement {
        return this.element;
    }

    getContent(): string {
        return this.content;
    }

    async setContent(content: string): Promise<void> {
        this.content = content;
        this.element.dataset.rawContent = content;
        
        // Re-render markdown
        this.contentEl.empty();
        await MarkdownRenderer.render(
            this.app,
            content,
            this.contentEl,
            '',
            this
        );
    }

    private createMessageElement(): HTMLElement {
        const messageEl = document.createElement('div');
        messageEl.addClass('ai-chat-message', 'user');
        messageEl.dataset.rawContent = this.content;

        // Create message container with content and actions
        const messageContainer = messageEl.createDiv('message-container');

        // Create content element
        this.contentEl = messageContainer.createDiv('message-content');
        
        // Render initial content
        MarkdownRenderer.render(
            this.app,
            this.content,
            this.contentEl,
            '',
            this
        );

        // Create action buttons
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
                        // Switch to edit mode
                        const textarea = document.createElement('textarea');
                        textarea.value = messageEl.dataset.rawContent || '';
                        this.contentEl.empty();
                        this.contentEl.appendChild(textarea);
                        textarea.focus();
                        this.contentEl.addClass('editing');
                    } else {
                        // Save edits
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
                    const event = new CustomEvent('ai-assistant:regenerate-response', {
                        detail: { messageEl }
                    });
                    this.app.workspace.trigger('ai-assistant:regenerate-response', messageEl);
                }
            }
        ]);

        // Add hover behavior
        messageEl.addEventListener('mouseenter', () => {
            // Rely on CSS for display
        });
        messageEl.addEventListener('mouseleave', () => {
            // Rely on CSS for display
        });

        messageContainer.appendChild(actions);
        
        return messageEl;
    }
}
