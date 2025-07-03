import { App, WorkspaceLeaf, ItemView, Setting, Notice, TFile } from 'obsidian';
import MyPlugin from '../main'; 
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
        // Unsubscribe from previous settings change listener to prevent duplicates
        this.plugin.offSettingsChange(this._onSettingsChange);
        // Subscribe to settings changes to refresh the view when settings are updated
        this.plugin.onSettingsChange(this._onSettingsChange);
        // Dynamically import SettingsSections to avoid circular dependency
        const settingsSections = new (await import('./chat/SettingsSections')).SettingsSections(this.plugin);
        // Render all settings sections into the view's content element
        await settingsSections.renderAllSettings(contentEl, { onRefresh: () => this.onOpen() });
    }

    async onClose() {
        // Unsubscribe from settings change listener when the view is closed
        this.plugin.offSettingsChange(this._onSettingsChange);
        // Clear the content element
        this.contentEl.empty();
    }
}
