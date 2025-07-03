import { App, Modal } from 'obsidian';

/**
 * ConfirmationModal is a simple modal dialog for confirming or cancelling an action.
 * Used for actions like file deletion or other destructive operations.
 */
export class ConfirmationModal extends Modal {
    private onConfirm: (confirmed: boolean) => void;
    private message: string;

    /**
     * Constructs a ConfirmationModal.
     * @param app Obsidian App instance
     * @param title Modal title text
     * @param message Message to display in the modal
     * @param onConfirm Callback invoked with true (confirmed) or false (cancelled)
     */
    constructor(app: App, title: string, message: string, onConfirm: (confirmed: boolean) => void) {
        super(app);
        this.titleEl.setText(title);
        this.message = message;
        this.onConfirm = onConfirm;
    }

    /**
     * Called when the modal is opened.
     * Renders the message and Cancel/Delete buttons.
     */
    onOpen() {
        const { contentEl } = this;
        contentEl.addClass('ai-assistant-modal');
        contentEl.createEl('p', { text: this.message });

        // Button container
        const buttonContainer = contentEl.createDiv('modal-button-container');

        // Cancel button
        buttonContainer.createEl('button', { text: 'Cancel' })
            .addEventListener('click', () => {
                this.onConfirm(false);
                this.close();
            });

        // Confirm/Delete button (styled as warning)
        const confirmButton = buttonContainer.createEl('button', {
            text: 'Delete',
            cls: 'mod-warning'
        });
        confirmButton.addEventListener('click', () => {
            this.onConfirm(true);
            this.close();
        });
    }

    /**
     * Called when the modal is closed.
     * Cleans up the modal content.
     */
    onClose() {
        this.contentEl.empty();
    }
}
