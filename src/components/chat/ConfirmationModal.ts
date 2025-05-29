import { App, Modal } from 'obsidian';

export class ConfirmationModal extends Modal {
    private onConfirm: (confirmed: boolean) => void;
    private message: string;
    constructor(app: App, title: string, message: string, onConfirm: (confirmed: boolean) => void) {
        super(app);
        this.titleEl.setText(title);
        this.message = message;
        this.onConfirm = onConfirm;
    }
    onOpen() {
        const { contentEl } = this;
        contentEl.createEl('p', { text: this.message });
        const buttonContainer = contentEl.createDiv('modal-button-container');
        buttonContainer.createEl('button', { text: 'Cancel' })
            .addEventListener('click', () => {
                this.onConfirm(false);
                this.close();
            });
        const confirmButton = buttonContainer.createEl('button', {
            text: 'Delete',
            cls: 'mod-warning'
        });
        confirmButton.addEventListener('click', () => {
            this.onConfirm(true);
            this.close();
        });
    }
    onClose() {
        this.contentEl.empty();
    }
}
