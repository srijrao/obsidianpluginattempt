import { Component, App } from 'obsidian';
import { Buttons } from '../Buttons';
import { Commands } from '../Commands';

/**
 * State interface for the ChatInput/Prompt component.
 * - isDisabled: disables input and buttons when true.
 * - isSending: indicates if a message is being sent.
 */
interface IChatInputState {
    isDisabled: boolean;
    isSending: boolean;
}

/**
 * ChatInput/Prompt component for the AI chat interface.
 * Handles user input, button actions, and UI state.
 */
export class ChatInput extends Component {
    private app: App;
    private buttons: Buttons;
    private commands: Commands;
    private container: HTMLElement;
    private textarea: HTMLTextAreaElement;
    private state: IChatInputState = {
        isDisabled: false,
        isSending: false
    };

    /**
     * Constructs the ChatInput/Prompt component.
     * @param app Obsidian App instance
     * @param buttons Buttons manager instance
     * @param commands Commands handler instance
     */
    constructor(app: App, buttons: Buttons, commands: Commands) {
        super();
        this.app = app;
        this.buttons = buttons;
        this.commands = commands;

        // Create the main container element
        this.container = document.createElement('div');
        this.container.addClass('ai-chat-input-container');

        // Create the textarea for user input
        this.textarea = this.container.createEl('textarea', {
            cls: 'ai-chat-input',
            attr: {
                placeholder: 'Type your message...',
                rows: '3'
            }
        });

        // Create and append the button container
        const buttonContainer = this.container.createDiv('ai-chat-buttons');
        buttonContainer.appendChild(this.buttons.getContainer());

        // Configure Send button
        const sendButton = this.buttons.getSendButton();
        sendButton.setDisabled(false);
        sendButton.onClick(() => this.handleSend());

        // Configure Stop button
        const stopButton = this.buttons.getStopButton();
        stopButton.setDisabled(true); // Initially disabled
        stopButton.onClick(() => this.handleStop());

        // Configure Clear button
        const clearButton = this.buttons.getClearButton();
        clearButton.setDisabled(false);
        clearButton.onClick(() => this.handleClear());

        // Configure Settings button
        const settingsButton = this.buttons.getSettingsButton();
        settingsButton.setDisabled(false);
        settingsButton.onClick(() => this.handleSettings());

        // Handle Enter key for sending messages (Shift+Enter for newline)
        this.textarea.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.handleSend();
            }
        });

        this.updateUI();
    }

    /**
     * Returns the main container element for insertion into the DOM.
     */
    getContainer(): HTMLElement {
        return this.container;
    }

    /**
     * Updates the component state and refreshes the UI.
     * @param state Partial state to merge with the current state.
     */
    setState(state: Partial<IChatInputState>): void {
        this.state = { ...this.state, ...state };
        this.updateUI();
    }

    /**
     * Handles sending a message.
     * Disables input, clears textarea, sends the message, and re-enables input.
     */
    private async handleSend(): Promise<void> {
        const content = this.textarea.value.trim();
        if (!content || this.state.isDisabled) return;

        this.setState({ isDisabled: true, isSending: true });
        this.textarea.value = '';

        await this.commands.sendMessage(content);

        this.setState({ isDisabled: false, isSending: false });
        this.textarea.focus();
    }

    /**
     * Handles stopping the current generation.
     * Re-enables input and focuses the textarea.
     */
    private handleStop(): void {
        this.commands.stopGeneration();
        this.setState({ isDisabled: false, isSending: false });
        this.textarea.focus();
    }

    /**
     * Handles clearing the chat.
     */
    private handleClear(): void {
        this.commands.clearChat();
    }

    /**
     * Handles opening the settings panel.
     */
    private handleSettings(): void {
        this.app.workspace.trigger('ai-assistant:open-settings');
    }

    /**
     * Updates the UI based on the current state.
     * Disables/enables buttons and textarea as appropriate.
     */
    private updateUI(): void {
        this.textarea.disabled = this.state.isDisabled;
        this.buttons.getSendButton().setDisabled(this.state.isDisabled || this.state.isSending);
        this.buttons.getStopButton().setDisabled(!this.state.isSending);
        this.buttons.getClearButton().setDisabled(this.state.isDisabled);
        this.buttons.getSettingsButton().setDisabled(this.state.isDisabled);
    }
}
