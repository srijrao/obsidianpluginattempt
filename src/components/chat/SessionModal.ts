import { App, Modal, Setting } from 'obsidian';

/**
 * SessionModal is a modal dialog for naming a chat session.
 * It provides a text input for the session name and buttons to submit or cancel.
 */
export class SessionModal extends Modal {
    private onSubmit: (name: string) => void;
    private initialName: string;

    /**
     * Constructs a SessionModal.
     * @param app Obsidian App instance
     * @param initialName The initial name to pre-fill in the input
     * @param onSubmit Callback invoked with the entered name when the user submits
     */
    constructor(app: App, initialName: string, onSubmit: (name: string) => void) {
        super(app);
        this.initialName = initialName;
        this.onSubmit = onSubmit;
        this.titleEl.setText('Name Chat Session');
    }

    /**
     * Called when the modal is opened.
     * Sets up the modal UI with the input field and buttons.
     */
    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('ai-assistant-modal');

        // Add the setting for the session name input
        new Setting(contentEl)
            .setName('Session Name')
            .setDesc('Enter a name for this chat session')
            .addText(text => text
                .setValue(this.initialName)
                .onChange(async (value) => {
                    // Update the initialName property as the user types
                    this.initialName = value;
                }));

        // Add button container
        const buttonContainer = contentEl.createDiv('modal-button-container');

        // Add Cancel button
        const cancelButton = buttonContainer.createEl('button', {
            text: 'Cancel'
        });
        cancelButton.addEventListener('click', () => this.close());

        // Add Submit button
        const submitButton = buttonContainer.createEl('button', {
            text: 'Create',
            cls: 'mod-cta'
        });
        submitButton.addEventListener('click', () => {
            this.onSubmit(this.initialName);
            this.close();
        });
    }

    /**
     * Called when the modal is closed.
     * Cleans up the modal content.
     */
    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}