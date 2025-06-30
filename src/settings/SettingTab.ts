import { App, PluginSettingTab, Setting, Notice } from 'obsidian';
import MyPlugin from '../main';
import { VIEW_TYPE_MODEL_SETTINGS } from '../components/commands';
import { CollapsibleSectionRenderer } from '../components/chat/CollapsibleSection';
import { activateView } from '../utils/viewManager';

import { SettingCreators } from './components/SettingCreators';
import { GeneralSettingsSection } from './sections/GeneralSettingsSection';
import { AIModelConfigurationSection } from './sections/AIModelConfigurationSection';
import { AgentSettingsSection } from './sections/AgentSettingsSection';
import { ContentNoteHandlingSection } from './sections/ContentNoteHandlingSection';
import { BackupManagementSection } from './sections/BackupManagementSection';
import { ChatHistorySettingsSection } from './sections/ChatHistorySettingsSection';

/**
 * Plugin Settings Tab
 *
 * This tab provides a user interface for configuring the plugin settings.
 */
export class MyPluginSettingTab extends PluginSettingTab {
    plugin: MyPlugin;
    private settingCreators: SettingCreators;

    
    private generalSettingsSection: GeneralSettingsSection;
    private aiModelConfigurationSection: AIModelConfigurationSection;
    private agentSettingsSection: AgentSettingsSection;
    private contentNoteHandlingSection: ContentNoteHandlingSection;
    private backupManagementSection: BackupManagementSection;
    private chatHistorySettingsSection: ChatHistorySettingsSection;

    private settingsChangeListener: (() => void) | null = null;

    constructor(app: App, plugin: MyPlugin) {
        super(app, plugin);
        this.plugin = plugin;
        this.settingCreators = new SettingCreators(this.plugin, () => this.display()); 
        if (this.plugin && typeof this.plugin.debugLog === 'function') {
            this.plugin.debugLog('debug', '[MyPluginSettingTab] constructor called');
        }

        
        this.generalSettingsSection = new GeneralSettingsSection(this.plugin, this.settingCreators);
        this.aiModelConfigurationSection = new AIModelConfigurationSection(this.plugin, this.settingCreators);
        this.agentSettingsSection = new AgentSettingsSection(this.app, this.plugin, this.settingCreators);
        this.contentNoteHandlingSection = new ContentNoteHandlingSection(this.plugin, this.settingCreators);
        this.backupManagementSection = new BackupManagementSection(this.plugin, this.settingCreators);
        this.chatHistorySettingsSection = new ChatHistorySettingsSection(this.plugin, this.settingCreators);

        
        this.settingsChangeListener = () => {
            
            if (this.containerEl.isConnected) {
                this.display();
            }
        };
        this.plugin.onSettingsChange(this.settingsChangeListener);
    }

    hide(): void {
        
        if (this.settingsChangeListener) {
            this.plugin.offSettingsChange(this.settingsChangeListener);
            this.settingsChangeListener = null;
        }
        super.hide();
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

        
        new Setting(containerEl)
            .setName('Reset All Settings to Default')
            .setDesc('Reset all plugin settings (except API keys) to their original default values.')
            .addButton(button => button
                .setButtonText('Reset')
                .onClick(async () => {
                    const { DEFAULT_SETTINGS } = await import('../types');
                    const { DEFAULT_TITLE_PROMPT } = await import('../promptConstants');

                    
                    const preservedApiKeys = {
                        openai: this.plugin.settings.openaiSettings.apiKey,
                        anthropic: this.plugin.settings.anthropicSettings.apiKey,
                        gemini: this.plugin.settings.geminiSettings.apiKey,
                    };

                    
                    this.plugin.settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
                    this.plugin.settings.openaiSettings.apiKey = preservedApiKeys.openai;
                    this.plugin.settings.anthropicSettings.apiKey = preservedApiKeys.anthropic;
                    this.plugin.settings.geminiSettings.apiKey = preservedApiKeys.gemini;
                    this.plugin.settings.titlePrompt = DEFAULT_TITLE_PROMPT;

                    await this.plugin.saveSettings();
                    this.display(); 

                    
                    setTimeout(() => {
                        activateView(this.plugin.app, VIEW_TYPE_MODEL_SETTINGS);
                    }, 100);
                    new Notice('All settings (except API keys) reset to default.');
                }));
    }
}
