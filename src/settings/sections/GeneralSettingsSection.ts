import { App, Setting } from 'obsidian';
import MyPlugin from '../../main';
import { SettingCreators } from '../components/SettingCreators';

/**
 * GeneralSettingsSection is responsible for rendering general plugin settings.
 * This includes auto-opening model settings, date/time inclusion in system messages, and debug mode.
 */
export class GeneralSettingsSection {
    private plugin: MyPlugin;
    private settingCreators: SettingCreators;

    /**
     * @param plugin The main plugin instance.
     * @param settingCreators An instance of SettingCreators for consistent UI element creation.
     */
    constructor(plugin: MyPlugin, settingCreators: SettingCreators) {
        this.plugin = plugin;
        this.settingCreators = settingCreators;
    }

    /**
     * Renders the General Settings sections (Plugin Behavior, Date & Time, Debug) into the provided container element.
     * @param containerEl The HTML element to render the sections into.
     */
    async render(containerEl: HTMLElement): Promise<void> {
        // Plugin Behavior Section Header
        containerEl.createEl('h3', { text: 'Plugin Behavior' });
        
        // Auto-Open Model Settings Toggle
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

        // Date & Time Settings Section Header
        containerEl.createEl('h3', { text: 'Date & Time Settings' });
        
        // Include Date with System Message Toggle
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

        // Include Time with System Message Toggle
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

        // Debug Settings Section Header
        containerEl.createEl('h3', { text: 'Debug Settings' });
        
        // Debug Mode Toggle
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
