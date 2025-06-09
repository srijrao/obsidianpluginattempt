import { App, Modal, Setting, Notice } from 'obsidian';
import MyPlugin from '../../main';
import { createProvider, createProviderFromUnifiedModel, getAllAvailableModels, getProviderFromUnifiedModel } from '../../../providers';
import { SettingsSections } from './SettingsSections';
import { CollapsibleSectionRenderer } from './CollapsibleSection';

export class SettingsModal extends Modal {
    plugin: MyPlugin;
    private settingsSections: SettingsSections;

    constructor(app: App, plugin: MyPlugin) {
        super(app);
        this.plugin = plugin;
        this.settingsSections = new SettingsSections(plugin);
        this.titleEl.setText('AI Model Settings');
        // Listen for settings changes and refresh UI
        this.plugin.onSettingsChange(this._onSettingsChange);
    }

    private _onSettingsChange = () => {
        this.onOpen();
    }

    async onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('ai-settings-modal');
        await this.settingsSections.renderAllSettings(contentEl, { onRefresh: () => this.onOpen() });
    }

    onClose() {
        this.plugin.offSettingsChange(this._onSettingsChange);
        this.contentEl.empty();
    }
}
