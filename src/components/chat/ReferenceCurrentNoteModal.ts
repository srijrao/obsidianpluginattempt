import { Modal, App, Setting } from 'obsidian';
import MyPlugin from '../../main';

/**
 * Modal dialog for configuring the "Reference Current Note" feature.
 * Allows the user to toggle the feature and provides information about its usage.
 */
export class ReferenceCurrentNoteModal extends Modal {
    private plugin: MyPlugin;

    /**
     * Constructs a ReferenceCurrentNoteModal.
     * @param app Obsidian App instance
     * @param plugin Plugin instance (for accessing/saving settings)
     */
    constructor(app: App, plugin: MyPlugin) {
        super(app);
        this.plugin = plugin;
    }

    /**
     * Called when the modal is opened.
     * Populates the modal with settings and information about the feature.
     */
    onOpen() {
        this.titleEl.setText('Reference Current Note Settings');
        this.contentEl.empty();
        this.contentEl.addClass('ai-reference-note-modal');

        // Setting to toggle the feature
        new Setting(this.contentEl)
            .setName('Reference current note')
            .setDesc('When enabled, the AI will have access to the content of the currently active note in your conversations. This helps the AI understand the context of what you\'re working on.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.referenceCurrentNote)
                .onChange(async (value) => {
                    this.plugin.settings.referenceCurrentNote = value;
                    await this.plugin.saveSettings();
                }));

        // Information section
        const infoContainer = this.contentEl.createDiv('reference-note-info');
        infoContainer.createEl('h3', { text: 'How it works:' });
        
        const infoList = infoContainer.createEl('ul');
        infoList.createEl('li', { text: 'When enabled, the current note\'s content is automatically included in AI conversations' });
        infoList.createEl('li', { text: 'The AI can reference, analyze, and help you work with your note content' });
        infoList.createEl('li', { text: 'This feature respects your privacy - only the currently active note is shared' });
        infoList.createEl('li', { text: 'You can toggle this on/off at any time without affecting existing conversations' });

        // Current note status display
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

        // Quick actions section (Enable/Disable button)
        const actionsContainer = this.contentEl.createDiv('reference-note-actions');
        actionsContainer.createEl('h3', { text: 'Quick Actions:' });

        const buttonContainer = actionsContainer.createDiv('modal-button-container');

        // Toggle button
        const toggleButton = buttonContainer.createEl('button', {
            text: this.plugin.settings.referenceCurrentNote ? 'Disable' : 'Enable',
            cls: this.plugin.settings.referenceCurrentNote ? 'mod-warning' : 'mod-cta'
        });
        toggleButton.addEventListener('click', async () => {
            this.plugin.settings.referenceCurrentNote = !this.plugin.settings.referenceCurrentNote;
            await this.plugin.saveSettings();
            // Update button text and class
            toggleButton.textContent = this.plugin.settings.referenceCurrentNote ? 'Disable' : 'Enable';
            toggleButton.className = this.plugin.settings.referenceCurrentNote ? 'mod-warning' : 'mod-cta';
            // Re-render the modal content to update status display
            this.onOpen(); 
        });

        // Close button
        const closeButton = buttonContainer.createEl('button', {
            text: 'Close'
        });
        closeButton.addEventListener('click', () => this.close());
    }

    /**
     * Called when the modal is closed.
     * Cleans up the modal content.
     */
    onClose() {
        this.contentEl.empty();
    }
}

/**
 * Chat Help Modal
 *
 * Reference Current Note:
 * - Use the "📝" button at the top of the chat to toggle referencing the current note.
 * - You can also use the slash command "/ref" or the keyboard shortcut Ctrl+Shift+R.
 * - When enabled, the note name appears below the button.
 * - Other context (system prompt, context notes, chat history) may also be sent.
 */
