import { Component, ButtonComponent } from 'obsidian';

/**
 * Configuration for a single action button.
 */
export interface IButtonConfig {
    label: string;            // Button label text
    tooltip: string;          // Tooltip for accessibility
    onClick: () => void;      // Click handler
    className?: string;       // Optional extra CSS class
    isHidden?: boolean;       // Whether the button is initially hidden
}

/**
 * Buttons component for handling all button creation and styling.
 * Provides main chat controls and message action buttons.
 */
export class Buttons extends Component {
    private container: HTMLElement;
    private sendButton: ButtonComponent;
    private stopButton: ButtonComponent;
    private clearButton: ButtonComponent;
    private settingsButton: ButtonComponent;

    /**
     * Constructs the Buttons component and initializes all main chat buttons.
     */
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
     * Get the button container element.
     */
    getContainer(): HTMLElement {
        return this.container;
    }

    /**
     * Get the main Send button.
     */
    getSendButton(): ButtonComponent {
        return this.sendButton;
    }

    /**
     * Get the main Stop button.
     */
    getStopButton(): ButtonComponent {
        return this.stopButton;
    }

    /**
     * Get the main Clear button.
     */
    getClearButton(): ButtonComponent {
        return this.clearButton;
    }

    /**
     * Get the main Settings button.
     */
    getSettingsButton(): ButtonComponent {
        return this.settingsButton;
    }

    /**
     * Show the Send button.
     */
    showSendButton(): void {
        this.sendButton.buttonEl.removeClass('hidden-button');
    }

    /**
     * Hide the Send button.
     */
    hideSendButton(): void {
        this.sendButton.buttonEl.addClass('hidden-button');
    }

    /**
     * Show the Stop button.
     */
    showStopButton(): void {
        this.stopButton.buttonEl.removeClass('hidden-button');
    }

    /**
     * Hide the Stop button.
     */
    hideStopButton(): void {
        this.stopButton.buttonEl.addClass('hidden-button');
    }

    /**
     * Show the Clear button.
     */
    showClearButton(): void {
        this.clearButton.buttonEl.removeClass('hidden-button');
    }

    /**
     * Hide the Clear button.
     */
    hideClearButton(): void {
        this.clearButton.buttonEl.addClass('hidden-button');
    }

    /**
     * Show the Settings button.
     */
    showSettingsButton(): void {
        this.settingsButton.buttonEl.removeClass('hidden-button');
    }

    /**
     * Hide the Settings button.
     */
    hideSettingsButton(): void {
        this.settingsButton.buttonEl.addClass('hidden-button');
    }

    /**
     * Create action buttons for messages (e.g., copy, edit, delete, regenerate).
     * @param buttons Array of button configs
     * @returns HTMLElement containing all action buttons
     */
    createMessageActions(buttons: IButtonConfig[]): HTMLElement {
        const actionsContainer = document.createElement('div');
        actionsContainer.addClass('message-actions');
        buttons.forEach(config => {
            const button = this.createButton(config);
            actionsContainer.appendChild(button);
        });
        return actionsContainer;
    }

    /**
     * Create the main chat control buttons (send, stop, clear, settings).
     * @param buttons Array of button configs
     * @returns HTMLElement containing all control buttons
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
     * Create a single button with the given configuration.
     * @param config Button configuration
     * @returns The created button element
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
     * Show or hide a specific button in a container by label.
     * @param container The container element
     * @param label The aria-label of the button
     * @param show Whether to show or hide the button
     */
    toggleButton(container: HTMLElement, label: string, show: boolean): void {
        const button = container.querySelector(`[aria-label="${label}"]`);
        if (button instanceof HTMLElement) {
            show ? button.removeClass('hidden-button') : button.addClass('hidden-button');
        }
    }

    /**
     * Set the send button state (enabled/disabled and visible/hidden).
     */
    setSendButtonState(enabled: boolean, visible: boolean = true): void {
        this.sendButton.setDisabled(!enabled);
        if (visible) {
            this.sendButton.buttonEl.removeClass('hidden-button');
        } else {
            this.sendButton.buttonEl.addClass('hidden-button');
        }
    }

    /**
     * Set the stop button state (enabled/disabled and visible/hidden).
     */
    setStopButtonState(enabled: boolean, visible: boolean = true): void {
        this.stopButton.setDisabled(!enabled);
        if (visible) {
            this.stopButton.buttonEl.removeClass('hidden-button');
        } else {
            this.stopButton.buttonEl.addClass('hidden-button');
        }
    }
}

/**
 * Utility function to create a single action button.
 * @param label Button label
 * @param tooltip Button tooltip
 * @param callback Click handler
 * @returns The created button element
 */
export function createActionButton(label: string, tooltip: string, callback: () => void): HTMLElement {
    const button = document.createElement('button');
    button.addClass('ai-chat-action-button');
    button.setAttribute('aria-label', tooltip);
    const labelEl = document.createElement('span');
    labelEl.textContent = label;
    button.appendChild(labelEl);
    button.addEventListener('click', callback);
    return button;
}

/**
 * Utility function to copy text to the clipboard.
 * @param text The text to copy
 */
export async function copyToClipboard(text: string): Promise<void> {
    try {
        await navigator.clipboard.writeText(text);
    } catch (error) {
        // Silently ignore clipboard errors
    }
}
