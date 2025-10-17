import { App, Modal, Setting, Notice } from 'obsidian';
import MyPlugin from '../../main';
// All provider logic is now handled by AIDispatcher; direct provider imports removed.
import { SettingsSections } from './SettingsSections';
import { AIModelConfigurationSection } from '../../settings/sections/AIModelConfigurationSection';
import { SettingCreators } from '../../settings/components/SettingCreators';

/**
 * SettingsModal is a modal dialog for configuring the plugin's settings.
 * It uses AIModelConfigurationSection for AI model settings and SettingsSections for other settings.
 */
export class SettingsModal extends Modal {
    plugin: MyPlugin;
    private settingsSections: SettingsSections;
    private aiModelConfigSection: AIModelConfigurationSection;
    private settingCreators: SettingCreators;

    /**
     * Constructs a SettingsModal instance.
     * @param app The Obsidian App instance.
     * @param plugin The plugin instance (for accessing/saving settings and event handling).
     */
    constructor(app: App, plugin: MyPlugin) {
        super(app);
        this.plugin = plugin;
        this.settingsSections = new SettingsSections(plugin);
        this.settingCreators = new SettingCreators(plugin, () => this.onOpen());
        this.aiModelConfigSection = new AIModelConfigurationSection(plugin, this.settingCreators);
        // No title needed - "Current Model Settings" header is shown in content

        // Subscribe to settings changes to refresh the modal if needed
        this.plugin.onSettingsChange(this._onSettingsChange);
    }

    /**
     * Handler for settings change events. Refreshes the modal content.
     */
    private _onSettingsChange = () => {
        this.onOpen();
    }

    /**
     * Called when the modal is opened.
     * Renders only the current model settings (streamlined for quick access).
     */
    async onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('ai-settings-modal');
        
        // Add a header
        contentEl.createEl('h2', { text: 'Current Model Settings' });
        contentEl.createEl('p', { 
            text: 'Quick access to frequently used settings. For advanced configuration (API keys, model management, etc.), use the button below.',
            cls: 'setting-item-description'
        });
        
        // Render only current model settings (without the full AI configuration)
        await this.aiModelConfigSection.renderCurrentModelSettingsOnly(contentEl);
        
        // Add button to open full plugin settings
        const buttonContainer = contentEl.createDiv({ cls: 'modal-button-container' });
        buttonContainer.style.marginTop = '2em';
        buttonContainer.style.textAlign = 'center';
        
        new Setting(buttonContainer)
            .addButton(button => button
                .setButtonText('Open Full Plugin Settings')
                .setCta()
                .onClick(() => {
                    // Close this modal
                    this.close();
                    // Open the plugin settings tab
                    // @ts-ignore - app.setting is available in Obsidian
                    this.app.setting.open();
                    // @ts-ignore - app.setting.openTabById is available in Obsidian
                    this.app.setting.openTabById(this.plugin.manifest.id);
                }));
    }

    /**
     * Called when the modal is closed.
     * Cleans up the modal content and unsubscribes from settings changes.
     */
    onClose() {
        // Unsubscribe from settings changes to prevent memory leaks
        this.plugin.offSettingsChange(this._onSettingsChange);
        this.contentEl.empty();
    }
}
