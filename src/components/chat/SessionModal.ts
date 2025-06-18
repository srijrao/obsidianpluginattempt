import { App, Modal, Setting } from 'obsidian';

export class SessionModal extends Modal {
    private onSubmit: (name: string) => void;
    private initialName: string;

    constructor(app: App, initialName: string, onSubmit: (name: string) => void) {
        super(app);
        this.initialName = initialName;
        this.onSubmit = onSubmit;
        this.titleEl.setText('Name Chat Session');
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('ai-assistant-modal');

        new Setting(contentEl)
            .setName('Session Name')
            .setDesc('Enter a name for this chat session')
            .addText(text => text
                .setValue(this.initialName)
                .onChange(async (value) => {
                    // Store the value for use in the submit handler
                    this.initialName = value;
                }));

        const buttonContainer = contentEl.createDiv('modal-button-container');
        
        const cancelButton = buttonContainer.createEl('button', {
            text: 'Cancel'
        });
        cancelButton.addEventListener('click', () => this.close());

        const submitButton = buttonContainer.createEl('button', {
            text: 'Create',
            cls: 'mod-cta'
        });
        submitButton.addEventListener('click', () => {
            this.onSubmit(this.initialName);
            this.close();
        });
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}