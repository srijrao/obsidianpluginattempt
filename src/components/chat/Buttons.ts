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
        this.container.style.display = 'flex';
        this.container.style.gap = '8px';
        this.container.style.flexWrap = 'wrap';
        this.container.style.marginTop = '8px';

        this.sendButton = new ButtonComponent(this.container)
            .setButtonText('Send')
            .setClass('mod-cta');
        this.sendButton.buttonEl.style.display = 'none';

        this.stopButton = new ButtonComponent(this.container)
            .setButtonText('Stop');
        this.stopButton.buttonEl.style.display = 'none';

        this.clearButton = new ButtonComponent(this.container)
            .setButtonText('Clear');
        this.clearButton.buttonEl.style.display = 'none';

        this.settingsButton = new ButtonComponent(this.container)
            .setButtonText('Settings');
        this.settingsButton.buttonEl.style.display = 'none';
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
        this.sendButton.buttonEl.style.display = 'block';
    }

    hideSendButton(): void {
        this.sendButton.buttonEl.style.display = 'none';
    }

    showStopButton(): void {
        this.stopButton.buttonEl.style.display = 'block';
    }

    hideStopButton(): void {
        this.stopButton.buttonEl.style.display = 'none';
    }

    showClearButton(): void {
        this.clearButton.buttonEl.style.display = 'block';
    }

    hideClearButton(): void {
        this.clearButton.buttonEl.style.display = 'none';
    }

    showSettingsButton(): void {
        this.settingsButton.buttonEl.style.display = 'block';
    }

    hideSettingsButton(): void {
        this.settingsButton.buttonEl.style.display = 'none';
    }

    /**
     * Create action buttons for messages (copy, edit, delete, regenerate)
     */
    createMessageActions(buttons: IButtonConfig[]): HTMLElement {
        const actionsContainer = document.createElement('div');
        actionsContainer.addClass('message-actions');
        actionsContainer.style.display = 'none';
        actionsContainer.style.flexWrap = 'wrap';
        actionsContainer.style.gap = '8px';
        actionsContainer.style.marginTop = '8px';

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
        controlsContainer.style.display = 'flex';
        controlsContainer.style.gap = '8px';
        controlsContainer.style.justifyContent = 'flex-end';
        controlsContainer.style.marginTop = '8px';

        buttons.forEach(config => {
            const button = this.createButton(config);
            if (config.isHidden) {
                button.style.display = 'none';
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
            button.style.display = show ? 'block' : 'none';
        }
    }
}