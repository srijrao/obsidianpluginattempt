import { Modal, App, Setting } from 'obsidian';
import MyPlugin from '../../main';

export class ReferenceCurrentNoteModal extends Modal {
    private plugin: MyPlugin;

    constructor(app: App, plugin: MyPlugin) {
        super(app);
        this.plugin = plugin;
    }

    onOpen() {
        this.titleEl.setText('Reference Current Note Settings');
        this.contentEl.empty();
        this.contentEl.addClass('ai-reference-note-modal');

        
        new Setting(this.contentEl)
            .setName('Reference current note')
            .setDesc('When enabled, the AI will have access to the content of the currently active note in your conversations. This helps the AI understand the context of what you\'re working on.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.referenceCurrentNote)
                .onChange(async (value) => {
                    this.plugin.settings.referenceCurrentNote = value;
                    await this.plugin.saveSettings();
                }));

        
        const infoContainer = this.contentEl.createDiv('reference-note-info');
        infoContainer.createEl('h3', { text: 'How it works:' });
        
        const infoList = infoContainer.createEl('ul');
        infoList.createEl('li', { text: 'When enabled, the current note\'s content is automatically included in AI conversations' });
        infoList.createEl('li', { text: 'The AI can reference, analyze, and help you work with your note content' });
        infoList.createEl('li', { text: 'This feature respects your privacy - only the currently active note is shared' });
        infoList.createEl('li', { text: 'You can toggle this on/off at any time without affecting existing conversations' });

        
        const statusContainer = this.contentEl.createDiv('reference-note-status');
        const currentFile = this.app.workspace.getActiveFile();
        if (currentFile) {
            statusContainer.createEl('p', { 
                text: `Current active note: ${currentFile.basename}`,
                cls: 'setting-item-description'
            });
        } else {
            statusContainer.createEl('p', { 
                text: 'No active note currently open',
                cls: 'setting-item-description'
            });
        }

        
        const actionsContainer = this.contentEl.createDiv('reference-note-actions');
        actionsContainer.createEl('h3', { text: 'Quick Actions:' });
        
        const buttonContainer = actionsContainer.createDiv('modal-button-container');
        
        
        const toggleButton = buttonContainer.createEl('button', {
            text: this.plugin.settings.referenceCurrentNote ? 'Disable' : 'Enable',
            cls: this.plugin.settings.referenceCurrentNote ? 'mod-warning' : 'mod-cta'
        });
        toggleButton.addEventListener('click', async () => {
            this.plugin.settings.referenceCurrentNote = !this.plugin.settings.referenceCurrentNote;
            await this.plugin.saveSettings();
            
            
            toggleButton.textContent = this.plugin.settings.referenceCurrentNote ? 'Disable' : 'Enable';
            toggleButton.className = this.plugin.settings.referenceCurrentNote ? 'mod-warning' : 'mod-cta';
            
            
            this.onOpen(); 
        });

        
        const closeButton = buttonContainer.createEl('button', {
            text: 'Close'
        });
        closeButton.addEventListener('click', () => this.close());
    }

    onClose() {
        this.contentEl.empty();
    }
}
