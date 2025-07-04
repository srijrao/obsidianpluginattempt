import { App, Modal, Setting, Notice } from 'obsidian';
import MyPlugin from '../../main';
// All provider logic is now handled by AIDispatcher; direct provider imports removed.
import { SettingsSections } from './SettingsSections';
import { CollapsibleSectionRenderer } from './CollapsibleSection';

/**
 * SettingsModal is a modal dialog for configuring the plugin's settings.
 * It uses SettingsSections to render different categories of settings.
 */
export class SettingsModal extends Modal {
    plugin: MyPlugin;
    private settingsSections: SettingsSections;

    /**
     * Constructs a SettingsModal instance.
     * @param app The Obsidian App instance.
     * @param plugin The plugin instance (for accessing/saving settings and event handling).
     */
    constructor(app: App, plugin: MyPlugin) {
        super(app);
        this.plugin = plugin;
        this.settingsSections = new SettingsSections(plugin);
        this.titleEl.setText('AI Model Settings');

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
     * Clears existing content and renders all settings sections.
     */
    async onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('ai-settings-modal');
        // Render all settings sections, providing a callback to refresh the modal
        await this.settingsSections.renderAllSettings(contentEl, { onRefresh: () => this.onOpen() });
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
