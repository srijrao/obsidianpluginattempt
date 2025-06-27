import { App, Setting } from 'obsidian';
import MyPlugin from '../../main';
import { SettingCreators } from '../components/SettingCreators';

export class GeneralSettingsSection {
    private plugin: MyPlugin;
    private settingCreators: SettingCreators;

    constructor(plugin: MyPlugin, settingCreators: SettingCreators) {
        this.plugin = plugin;
        this.settingCreators = settingCreators;
    }

    async render(containerEl: HTMLElement): Promise<void> {
        // Plugin Behavior subsection
        containerEl.createEl('h3', { text: 'Plugin Behavior' });
        
        this.settingCreators.createToggleSetting(
            containerEl, 
            'Auto-Open Model Settings', 
            'Automatically open the AI model settings panel when the plugin loads.',
            () => this.plugin.settings.autoOpenModelSettings,
            async (value) => { 
                this.plugin.settings.autoOpenModelSettings = value; 
                await this.plugin.saveSettings(); 
            }
        );

        // Date Settings subsection
        containerEl.createEl('h3', { text: 'Date & Time Settings' });
        
        this.settingCreators.createToggleSetting(
            containerEl,
            'Include Date with System Message',
            'Add the current date to the system message',
            () => this.plugin.settings.includeDateWithSystemMessage,
            async (value) => {
                this.plugin.settings.includeDateWithSystemMessage = value;
                await this.plugin.saveSettings();
            }
        );

        this.settingCreators.createToggleSetting(
            containerEl,
            'Include Time with System Message',
            'Add the current time along with the date to the system message',
            () => this.plugin.settings.includeTimeWithSystemMessage,
            async (value) => {
                this.plugin.settings.includeTimeWithSystemMessage = value;
                await this.plugin.saveSettings();
            }
        );

        // Debug Mode subsection
        containerEl.createEl('h3', { text: 'Debug Settings' });
        
        this.settingCreators.createToggleSetting(
            containerEl,
            'Debug Mode',
            'Enable verbose logging and debug UI features',
            () => this.plugin.settings.debugMode ?? false,
            async (value) => {
                this.plugin.settings.debugMode = value;
                await this.plugin.saveSettings();
            }
        );
    }
}
