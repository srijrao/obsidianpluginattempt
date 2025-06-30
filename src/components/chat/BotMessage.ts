import { App, Component, MarkdownRenderer } from 'obsidian';
import MyPlugin from '../../main';
import { Buttons } from './Buttons';

export class BotMessage extends Component {
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
        messageEl.addClass('ai-chat-message', 'assistant');
        messageEl.dataset.rawContent = this.content;

        
        const messageContainer = messageEl.createDiv('message-container');

        
        this.contentEl = messageContainer.createDiv('message-content');
        
        
        MarkdownRenderer.render(
            this.app,
            this.content,
            this.contentEl,
            '',
            this
        );

        
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
                        
                        const textarea = document.createElement('textarea');
                        textarea.value = messageEl.dataset.rawContent || '';
                        this.contentEl.empty();
                        this.contentEl.appendChild(textarea);
                        textarea.focus();
                        this.contentEl.addClass('editing');
                    } else {
                        
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
                tooltip: 'Regenerate this response',
                onClick: () => {
                    const event = new CustomEvent('ai-assistant:regenerate-response', {
                        detail: { messageEl }
                    });
                    this.app.workspace.trigger('ai-assistant:regenerate-response', messageEl);
                }
            }
        ]);

        
        messageEl.addEventListener('mouseenter', () => {
            
        });
        messageEl.addEventListener('mouseleave', () => {
            
        });

        messageContainer.appendChild(actions);
        
        return messageEl;
    }
}
