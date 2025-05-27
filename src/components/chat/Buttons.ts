import { Component, ButtonComponent } from 'obsidian';

export interface IButtonConfig {
    label: string;
    tooltip: string;
    onClick: () => void;
    className?: string;
    isHidden?: boolean;
}

/**
 * Buttons component for handling all button creation and styling
 */
export class Buttons extends Component {
    private container: HTMLElement;
    private sendButton: ButtonComponent;
    private stopButton: ButtonComponent;
    private clearButton: ButtonComponent;
    private settingsButton: ButtonComponent;

    constructor() {
        super();
        this.container = document.createElement('div');
        this.container.addClass('ai-chat-buttons');
        this.sendButton = new ButtonComponent(this.container)
            .setButtonText('Send')
            .setClass('mod-cta');
        this.sendButton.buttonEl.addClass('hidden-button');

        this.stopButton = new ButtonComponent(this.container)
            .setButtonText('Stop');
        this.stopButton.buttonEl.addClass('hidden-button');

        this.clearButton = new ButtonComponent(this.container)
            .setButtonText('Clear');
        this.clearButton.buttonEl.addClass('hidden-button');

        this.settingsButton = new ButtonComponent(this.container)
            .setButtonText('Settings');
        this.settingsButton.buttonEl.addClass('hidden-button');
    }

    /**
     * Get the button container element
     */
    getContainer(): HTMLElement {
        return this.container;
    }

    getSendButton(): ButtonComponent {
        return this.sendButton;
    }

    getStopButton(): ButtonComponent {
        return this.stopButton;
    }

    getClearButton(): ButtonComponent {
        return this.clearButton;
    }

    getSettingsButton(): ButtonComponent {
        return this.settingsButton;
    }

    showSendButton(): void {
        this.sendButton.buttonEl.removeClass('hidden-button');
    }

    hideSendButton(): void {
        this.sendButton.buttonEl.addClass('hidden-button');
    }

    showStopButton(): void {
        this.stopButton.buttonEl.removeClass('hidden-button');
    }

    hideStopButton(): void {
        this.stopButton.buttonEl.addClass('hidden-button');
    }

    showClearButton(): void {
        this.clearButton.buttonEl.removeClass('hidden-button');
    }

    hideClearButton(): void {
        this.clearButton.buttonEl.addClass('hidden-button');
    }

    showSettingsButton(): void {
        this.settingsButton.buttonEl.removeClass('hidden-button');
    }

    hideSettingsButton(): void {
        this.settingsButton.buttonEl.addClass('hidden-button');
    }

    /**
     * Create action buttons for messages (copy, edit, delete, regenerate)
     */
    createMessageActions(buttons: IButtonConfig[]): HTMLElement {
        const actionsContainer = document.createElement('div');
        actionsContainer.addClass('message-actions');
        // Rely on CSS for display and hover behavior

        buttons.forEach(config => {
            const button = this.createButton(config);
            actionsContainer.appendChild(button);
        });

        return actionsContainer;
    }

    /**
     * Create the main chat control buttons (send, stop, copy all, clear, settings)
     */
    createChatControls(buttons: IButtonConfig[]): HTMLElement {
        const controlsContainer = document.createElement('div');
        controlsContainer.addClass('ai-chat-buttons');

        buttons.forEach(config => {
            const button = this.createButton(config);
            if (config.isHidden) {
                button.addClass('hidden-button');
            }
            controlsContainer.appendChild(button);
        });

        return controlsContainer;
    }

    /**
     * Create a single button with the given configuration
     */
    private createButton(config: IButtonConfig): HTMLElement {
        const button = document.createElement('button');
        button.addClass('ai-chat-action-button');
        if (config.className) {
            button.addClass(config.className);
        }
        button.setAttribute('aria-label', config.tooltip);

        const labelEl = document.createElement('span');
        labelEl.textContent = config.label;
        button.appendChild(labelEl);

        button.addEventListener('click', config.onClick);
        return button;
    }

    /**
     * Show or hide a specific button in a container
     */
    toggleButton(container: HTMLElement, label: string, show: boolean): void {
        const button = container.querySelector(`[aria-label="${label}"]`);
        if (button instanceof HTMLElement) {
            show ? button.removeClass('hidden-button') : button.addClass('hidden-button');
        }
    }
}
