import { App, Setting } from 'obsidian';
import MyPlugin from '../../main';
import { SettingCreators } from '../components/SettingCreators';

export class ChatHistorySettingsSection {
    private plugin: MyPlugin;
    private settingCreators: SettingCreators;

    constructor(plugin: MyPlugin, settingCreators: SettingCreators) {
        this.plugin = plugin;
        this.settingCreators = settingCreators;
    }

    async render(containerEl: HTMLElement): Promise<void> {
        
        containerEl.createEl('h3', { text: 'Chat History & Sessions' });
        
        this.settingCreators.createSliderSetting(
            containerEl, 
            'Max Chat Sessions', 
            'Maximum number of chat sessions to keep in history.',
            { min: 1, max: 50, step: 1 },
            () => this.plugin.settings.maxSessions,
            async (value) => { 
                this.plugin.settings.maxSessions = value; 
                await this.plugin.saveSettings(); 
            }
        );

        this.settingCreators.createToggleSetting(
            containerEl, 
            'Auto-Save Sessions', 
            'Automatically save chat sessions as you use them.',
            () => this.plugin.settings.autoSaveSessions,
            async (value) => { 
                this.plugin.settings.autoSaveSessions = value; 
                await this.plugin.saveSettings(); 
            }
        );

        
        containerEl.createEl('h3', { text: 'UI Behavior' });
        
        this.settingCreators.createToggleSetting(
            containerEl,
            'Collapse Old Reasoning',
            'Automatically collapse reasoning sections in older messages to keep the UI clean',
            () => this.plugin.settings.uiBehavior?.collapseOldReasoning ?? true,
            async (value) => {
                if (!this.plugin.settings.uiBehavior) {
                    this.plugin.settings.uiBehavior = {};
                }
                this.plugin.settings.uiBehavior.collapseOldReasoning = value;
                await this.plugin.saveSettings();
            }
        );

        this.settingCreators.createToggleSetting(
            containerEl,
            'Show Completion Notifications',
            'Show notifications when AI responses are completed',
            () => this.plugin.settings.uiBehavior?.showCompletionNotifications ?? true,
            async (value) => {
                if (!this.plugin.settings.uiBehavior) {
                    this.plugin.settings.uiBehavior = {};
                }
                this.plugin.settings.uiBehavior.showCompletionNotifications = value;
                await this.plugin.saveSettings();
            }
        );

        this.settingCreators.createToggleSetting(
            containerEl,
            'Include Reasoning in Exports',
            'Include reasoning sections when copying or exporting chat content',
            () => this.plugin.settings.uiBehavior?.includeReasoningInExports ?? true,
            async (value) => {
                if (!this.plugin.settings.uiBehavior) {
                    this.plugin.settings.uiBehavior = {};
                }
                this.plugin.settings.uiBehavior.includeReasoningInExports = value;
                await this.plugin.saveSettings();
            }
        );
    }
}
