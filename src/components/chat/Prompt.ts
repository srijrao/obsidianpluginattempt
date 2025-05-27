import { Component, App } from 'obsidian';
import { Buttons } from './Buttons';
import { Commands } from './Commands';

interface IPromptState {
    isDisabled: boolean;
    isSending: boolean;
}

export class Prompt extends Component {
    private app: App;
    private buttons: Buttons;
    private commands: Commands;
    private container: HTMLElement;
    private textarea: HTMLTextAreaElement;
    private state: IPromptState = {
        isDisabled: false,
        isSending: false
    };

    constructor(app: App, buttons: Buttons, commands: Commands) {
        super();
        this.app = app;
        this.buttons = buttons;
        this.commands = commands;

        this.container = document.createElement('div');
        this.container.addClass('ai-chat-input-container');

        // Create textarea
        this.textarea = this.container.createEl('textarea', {
            cls: 'ai-chat-input',
            attr: {
                placeholder: 'Type your message...',
                rows: '3'
            }
        });

        // Styling is handled by CSS class 'ai-chat-input'

        // Add button container
        const buttonContainer = this.container.createDiv('ai-chat-buttons');
        buttonContainer.appendChild(this.buttons.getContainer());

        // Configure buttons
        const sendButton = this.buttons.getSendButton();
        sendButton.setDisabled(false);
        sendButton.onClick(() => this.handleSend());

        const stopButton = this.buttons.getStopButton();
        stopButton.setDisabled(true); // Initially hidden
        stopButton.onClick(() => this.handleStop());

        const clearButton = this.buttons.getClearButton();
        clearButton.setDisabled(false);
        clearButton.onClick(() => this.handleClear());

        const settingsButton = this.buttons.getSettingsButton();
        settingsButton.setDisabled(false);
        settingsButton.onClick(() => this.handleSettings());

        // Add event listeners
        this.textarea.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.handleSend();
            }
        });

        this.updateUI();
    }

    getContainer(): HTMLElement {
        return this.container;
    }

    setState(state: Partial<IPromptState>): void {
        this.state = { ...this.state, ...state };
        this.updateUI();
    }

    private async handleSend(): Promise<void> {
        const content = this.textarea.value.trim();
        if (!content || this.state.isDisabled) return;

        this.setState({ isDisabled: true, isSending: true });
        this.textarea.value = '';

        await this.commands.sendMessage(content);

        this.setState({ isDisabled: false, isSending: false });
        this.textarea.focus();
    }

    private handleStop(): void {
        this.commands.stopGeneration();
        this.setState({ isDisabled: false, isSending: false });
        this.textarea.focus();
    }

    private handleClear(): void {
        this.commands.clearChat();
    }

    private handleSettings(): void {
        this.app.workspace.trigger('ai-assistant:open-settings');
    }

    private updateUI(): void {
        this.textarea.disabled = this.state.isDisabled;
        this.buttons.getSendButton().setDisabled(this.state.isDisabled || this.state.isSending);
        this.buttons.getStopButton().setDisabled(!this.state.isSending);
        this.buttons.getClearButton().setDisabled(this.state.isDisabled);
        this.buttons.getSettingsButton().setDisabled(this.state.isDisabled);
    }
}
