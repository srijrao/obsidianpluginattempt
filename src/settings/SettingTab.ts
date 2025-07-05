import { App, PluginSettingTab, Setting, Notice } from 'obsidian';
import MyPlugin from '../main';
import { VIEW_TYPE_MODEL_SETTINGS } from '../components/commands/viewCommands'; // Corrected import path
import { CollapsibleSectionRenderer } from '../utils/CollapsibleSection';
import { activateView } from '../utils/viewManager';
import { debugLog } from '../utils/logger'; // Import debugLog

import { SettingCreators } from './components/SettingCreators';
import { GeneralSettingsSection } from './sections/GeneralSettingsSection';
import { AIModelConfigurationSection } from './sections/AIModelConfigurationSection';
import { AgentSettingsSection } from './sections/AgentSettingsSection';
import { ContentNoteHandlingSection } from './sections/ContentNoteHandlingSection';
import { BackupManagementSection } from './sections/BackupManagementSection';
import { ChatHistorySettingsSection } from './sections/ChatHistorySettingsSection';
import { DEFAULT_TITLE_PROMPT } from '../promptConstants'; // Import DEFAULT_TITLE_PROMPT


/**
 * Main settings tab for the AI Assistant for Obsidian plugin.
 *
 * This class is responsible for rendering and managing the plugin's settings UI in Obsidian's settings panel.
 * It organizes all settings into collapsible sections, handles settings changes, and provides a reset-to-defaults option.
 *
 * @extends PluginSettingTab
 */
export class MyPluginSettingTab extends PluginSettingTab {
    /** Reference to the plugin instance. */
    plugin: MyPlugin;
    /** Helper for creating settings UI elements. */
    private settingCreators: SettingCreators;

    // Section managers for each logical group of settings
    /** General plugin settings section. */
    private generalSettingsSection: GeneralSettingsSection;
    /** AI model configuration section. */
    private aiModelConfigurationSection: AIModelConfigurationSection;
    /** Agent settings section. */
    private agentSettingsSection: AgentSettingsSection;
    /** Content and note handling section. */
    private contentNoteHandlingSection: ContentNoteHandlingSection;
    /** Backup and trash management section. */
    private backupManagementSection: BackupManagementSection;
    /** Chat history and UI section. */
    private chatHistorySettingsSection: ChatHistorySettingsSection;

    /** Listener for settings changes, used to refresh the UI when settings are updated elsewhere. */
    private settingsChangeListener: (() => void) | null = null;


    /**
     * Constructs the settings tab and initializes all settings sections.
     *
     * @param app - The Obsidian app instance.
     * @param plugin - The plugin instance.
     */
    constructor(app: App, plugin: MyPlugin) {
        super(app, plugin);
        this.plugin = plugin;
        debugLog(this.plugin.settings.debugMode ?? false, 'debug', '[MyPluginSettingTab] constructor called'); // Use debugLog

        // Helper for creating settings UI elements, with a callback to refresh the display
        this.settingCreators = new SettingCreators(this.plugin, () => this.display()); 

        // Initialize each settings section
        this.generalSettingsSection = new GeneralSettingsSection(this.plugin, this.settingCreators);
        this.aiModelConfigurationSection = new AIModelConfigurationSection(this.plugin, this.settingCreators);
        this.agentSettingsSection = new AgentSettingsSection(this.app, this.plugin, this.settingCreators);
        this.contentNoteHandlingSection = new ContentNoteHandlingSection(this.plugin, this.settingCreators);
        this.backupManagementSection = new BackupManagementSection(this.plugin, this.settingCreators);
        this.chatHistorySettingsSection = new ChatHistorySettingsSection(this.plugin, this.settingCreators);

        // Listener to refresh the settings UI when settings are changed elsewhere
        this.settingsChangeListener = () => {
            // Only refresh if the settings tab is still attached to the DOM
            if (this.containerEl.isConnected) {
                this.display();
            }
        };
        this.plugin.onSettingsChange(this.settingsChangeListener);
    }


    /**
     * Called when the settings tab is hidden.
     * Cleans up the settings change listener to avoid memory leaks.
     */
    hide(): void {
        if (this.settingsChangeListener) {
            this.plugin.offSettingsChange(this.settingsChangeListener);
            this.settingsChangeListener = null;
        }
        super.hide();
    }


    /**
     * Renders the settings tab UI.
     *
     * This method orchestrates the rendering of all collapsible settings sections and the reset-to-defaults button.
     * It is called automatically when the tab is shown, and can be called to refresh the UI after changes.
     */
    display(): void {
        const { containerEl } = this;
        containerEl.empty();
        debugLog(this.plugin.settings.debugMode ?? false, 'info', '[MyPluginSettingTab] display called'); // Use debugLog

        // Main heading for the settings tab
        containerEl.createEl('h2', { text: 'AI Assistant Settings' });

        // Render each settings section as a collapsible section
        CollapsibleSectionRenderer.createCollapsibleSection(
            containerEl,
            'General Settings',
            (sectionEl: HTMLElement) => this.generalSettingsSection.render(sectionEl),
            this.plugin,
            'generalSectionsExpanded'
        );

        CollapsibleSectionRenderer.createCollapsibleSection(
            containerEl,
            'AI Model Configuration',
            (sectionEl: HTMLElement) => this.aiModelConfigurationSection.render(sectionEl),
            this.plugin,
            'generalSectionsExpanded'
        );

        CollapsibleSectionRenderer.createCollapsibleSection(
            containerEl,
            'Agent Settings',
            (sectionEl: HTMLElement) => this.agentSettingsSection.render(sectionEl),
            this.plugin,
            'agentConfigExpanded'
        );

        CollapsibleSectionRenderer.createCollapsibleSection(
            containerEl,
            'Content & Note Handling',
            (sectionEl: HTMLElement) => this.contentNoteHandlingSection.render(sectionEl),
            this.plugin,
            'contentChatExpanded'
        );

        CollapsibleSectionRenderer.createCollapsibleSection(
            containerEl,
            'Chat History & UI',
            (sectionEl: HTMLElement) => this.chatHistorySettingsSection.render(sectionEl),
            this.plugin,
            'dataHandlingExpanded'
        );

        CollapsibleSectionRenderer.createCollapsibleSection(
            containerEl,
            'Backup & Trash Management',
            (sectionEl: HTMLElement) => this.backupManagementSection.render(sectionEl),
            this.plugin,
            'backupManagementExpanded'
        );

        // Add a button to reset all settings to their default values (except API keys)
        new Setting(containerEl)
            .setName('Reset All Settings to Default')
            .setDesc('Reset all plugin settings (except API keys) to their original default values.')
            .addButton(button => button
                .setButtonText('Reset')
                .onClick(async () => {
                    // Dynamically import defaults to avoid circular dependencies
                    const { DEFAULT_SETTINGS } = await import('../types');

                    // Preserve API keys so users don't lose them on reset
                    const preservedApiKeys = {
                        openai: this.plugin.settings.openaiSettings.apiKey,
                        anthropic: this.plugin.settings.anthropicSettings.apiKey,
                        gemini: this.plugin.settings.geminiSettings.apiKey,
                    };

                    // Reset all settings to defaults, except API keys and title prompt
                    this.plugin.settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
                    this.plugin.settings.openaiSettings.apiKey = preservedApiKeys.openai;
                    this.plugin.settings.anthropicSettings.apiKey = preservedApiKeys.anthropic;
                    this.plugin.settings.geminiSettings.apiKey = preservedApiKeys.gemini;
                    this.plugin.settings.titlePrompt = DEFAULT_TITLE_PROMPT; // Use imported constant

                    await this.plugin.saveSettings();
                    this.display(); // Refresh UI

                    // Optionally re-activate the settings view for user feedback
                    setTimeout(() => {
                        activateView(this.plugin.app, VIEW_TYPE_MODEL_SETTINGS);
                    }, 100);
                    new Notice('All settings (except API keys) reset to default.');
                }));
    }
}
