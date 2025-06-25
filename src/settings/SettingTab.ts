import { App, PluginSettingTab, Setting, Notice } from 'obsidian';
import MyPlugin from '../main';
import { VIEW_TYPE_MODEL_SETTINGS } from '../main'; // Import the constant
import { SettingsSections } from '../components/chat/SettingsSections'; // This might need to be refactored or removed
import { CollapsibleSectionRenderer } from '../components/chat/CollapsibleSection';


// Import the new section classes
import { SettingCreators } from './components/SettingCreators';
import { ApiKeysSection } from './sections/ApiKeysSection';
import { ModelManagementSection } from './sections/ModelManagementSection';
import { AgentConfigSection } from './sections/AgentConfigSection';
import { ContentChatSection } from './sections/ContentChatSection';
import { DataHandlingSection } from './sections/DataHandlingSection';
import { PluginBehaviorSection } from './sections/PluginBehaviorSection';
import { BackupManagementSection } from './sections/BackupManagementSection';

/**
 * Plugin Settings Tab
 *
 * This tab provides a user interface for configuring the plugin settings.
 */
export class MyPluginSettingTab extends PluginSettingTab {
    plugin: MyPlugin;
    private settingsSections: SettingsSections; // This might need to be refactored or removed
    private settingCreators: SettingCreators;

    // Section instances
    private apiKeysSection: ApiKeysSection;
    private modelManagementSection: ModelManagementSection;
    private agentConfigSection: AgentConfigSection;
    private contentChatSection: ContentChatSection;
    private dataHandlingSection: DataHandlingSection;
    private pluginBehaviorSection: PluginBehaviorSection;
    private backupManagementSection: BackupManagementSection;

    constructor(app: App, plugin: MyPlugin) {
        super(app, plugin);
        this.plugin = plugin;
        this.settingsSections = new SettingsSections(this.plugin); // This might need to be refactored or removed
        this.settingCreators = new SettingCreators(this.plugin);
        if (this.plugin && typeof this.plugin.debugLog === 'function') {
            this.plugin.debugLog('debug', '[MyPluginSettingTab] constructor called');
        }

        // Initialize section instances
        this.apiKeysSection = new ApiKeysSection(this.plugin, this.settingCreators);
        this.modelManagementSection = new ModelManagementSection(this.plugin, this.settingCreators);
        this.agentConfigSection = new AgentConfigSection(this.app, this.plugin, this.settingCreators); // Pass this.app
        this.contentChatSection = new ContentChatSection(this.plugin, this.settingCreators);
        this.dataHandlingSection = new DataHandlingSection(this.plugin, this.settingCreators);
        this.pluginBehaviorSection = new PluginBehaviorSection(this.plugin, this.settingCreators);
        this.backupManagementSection = new BackupManagementSection(this.plugin, this.settingCreators);
    }

    /**
     * Display the settings tab.
     * This method orchestrates the rendering of all setting sections.
     */
    display(): void {
        if (this.plugin && typeof this.plugin.debugLog === 'function') {
            this.plugin.debugLog('info', '[MyPluginSettingTab] display called');
        }
        const { containerEl } = this;
        containerEl.empty();

        containerEl.createEl('h2', { text: 'AI Assistant Settings' });

        // Render sections
        this.apiKeysSection.render(containerEl);
        this.modelManagementSection.render(containerEl);

        // Section 3: Core AI Settings (Default Model Settings)
        CollapsibleSectionRenderer.createCollapsibleSection(
            containerEl,
            'Default AI Model Settings',
            async (sectionEl: HTMLElement) => {
                await this.settingsSections.renderAIModelSettings(sectionEl, () => this.display());
            },
            this.plugin,
            'generalSectionsExpanded'
        );

        this.agentConfigSection.render(containerEl);
        this.contentChatSection.render(containerEl);
        this.dataHandlingSection.render(containerEl);
        this.pluginBehaviorSection.render(containerEl);
        this.backupManagementSection.render(containerEl);


        // Reset All Settings to Default (remains at the bottom, not collapsible)
        new Setting(containerEl)
            .setName('Reset All Settings to Default')
            .setDesc('Reset all plugin settings (except API keys) to their original default values.')
            .addButton(button => button
                .setButtonText('Reset')
                .onClick(async () => {
                    const { DEFAULT_SETTINGS } = await import('../types');
                    const { DEFAULT_TITLE_PROMPT } = await import('../promptConstants');

                    // Preserve API keys
                    const preservedApiKeys = {
                        openai: this.plugin.settings.openaiSettings.apiKey,
                        anthropic: this.plugin.settings.anthropicSettings.apiKey,
                        gemini: this.plugin.settings.geminiSettings.apiKey,
                    };

                    // Reset all settings to default, then restore preserved API keys
                    this.plugin.settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
                    this.plugin.settings.openaiSettings.apiKey = preservedApiKeys.openai;
                    this.plugin.settings.anthropicSettings.apiKey = preservedApiKeys.anthropic;
                    this.plugin.settings.geminiSettings.apiKey = preservedApiKeys.gemini;
                    this.plugin.settings.titlePrompt = DEFAULT_TITLE_PROMPT;

                    await this.plugin.saveSettings();
                    this.display(); // Re-render the settings to show updated values

                    // Force ModelSettingsView to refresh if open
                    if (typeof this.plugin.activateView === 'function') {
                        setTimeout(() => {
                            this.plugin.activateView(VIEW_TYPE_MODEL_SETTINGS);
                        }, 100);
                    }
                    new Notice('All settings (except API keys) reset to default.');
                }));
    }
}
