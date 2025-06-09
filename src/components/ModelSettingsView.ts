import { App, WorkspaceLeaf, ItemView, Setting, Notice, TFile } from 'obsidian';
import MyPlugin from '../main'; // Import MyPlugin
import { createProvider, getAllAvailableModels, getProviderFromUnifiedModel } from '../../providers';
import { CollapsibleSectionRenderer } from './chat/CollapsibleSection';

const VIEW_TYPE_MODEL_SETTINGS = 'model-settings-view';

/**
 * AI Model Settings View
 *
 * This view provides a user interface for configuring AI model settings.
 * It allows users to:
 * - Select their preferred AI provider (OpenAI, Anthropic, Gemini, Ollama)
 * - Configure provider-specific settings like API keys and models
 * - Adjust common settings like temperature and token limits
 * - Test API connections and refresh available models
 */
export class ModelSettingsView extends ItemView {
    plugin: MyPlugin;
    private _onSettingsChange = () => {
        this.onOpen();
    };

    constructor(leaf: WorkspaceLeaf, plugin: MyPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType(): string {
        return VIEW_TYPE_MODEL_SETTINGS;
    }

    getDisplayText(): string {
        return 'AI Model Settings';
    }

    getIcon(): string {
        return 'file-sliders';
    }

    async onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        // Register settings change listener (avoid duplicate listeners)
        this.plugin.offSettingsChange(this._onSettingsChange);
        this.plugin.onSettingsChange(this._onSettingsChange);
        const settingsSections = new (await import('./chat/SettingsSections')).SettingsSections(this.plugin);
        await settingsSections.renderAllSettings(contentEl, { onRefresh: () => this.onOpen() });
    }

    async onClose() {
        this.plugin.offSettingsChange(this._onSettingsChange);
        // Clean up any resources if needed
    }

}
