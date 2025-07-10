import { App, Setting } from 'obsidian';
import MyPlugin from '../../main';
import { SettingCreators } from '../components/SettingCreators';
import { CollapsibleSectionRenderer } from '../../utils/CollapsibleSection';

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
        // Plugin Behavior Section
        CollapsibleSectionRenderer.createCollapsibleSection(
            containerEl,
            'Plugin Behavior',
            (sectionEl: HTMLElement) => {
                // Auto-Open Model Settings Toggle
                this.settingCreators.createToggleSetting(
                    sectionEl, 
                    'Auto-Open Model Settings', 
                    'Automatically open the AI model settings panel when the plugin loads.',
                    () => this.plugin.settings.autoOpenModelSettings,
                    async (value) => { 
                        this.plugin.settings.autoOpenModelSettings = value; 
                        await this.plugin.saveSettings(); 
                    }
                );
            },
            this.plugin,
            'generalSectionsExpanded'
        );

        // Date & Time Settings Section
        CollapsibleSectionRenderer.createCollapsibleSection(
            containerEl,
            'Date & Time Settings',
            (sectionEl: HTMLElement) => {
                // Include Time with System Message Toggle
                this.settingCreators.createToggleSetting(
                    sectionEl,
                    'Include Time with System Message',
                    'Add the current time along with the date to the system message',
                    () => this.plugin.settings.includeTimeWithSystemMessage,
                    async (value) => {
                        this.plugin.settings.includeTimeWithSystemMessage = value;
                        await this.plugin.saveSettings();
                    }
                );
            },
            this.plugin,
            'generalSectionsExpanded'
        );

        // Debug Settings Section
        CollapsibleSectionRenderer.createCollapsibleSection(
            containerEl,
            'Debug Settings',
            (sectionEl: HTMLElement) => {
                // Debug Mode Toggle
                this.settingCreators.createToggleSetting(
                    sectionEl,
                    'Debug Mode',
                    'Enable verbose logging and debug UI features',
                    () => this.plugin.settings.debugMode ?? false,
                    async (value) => {
                        this.plugin.settings.debugMode = value;
                        await this.plugin.saveSettings();
                    }
                );
            },
            this.plugin,
            'generalSectionsExpanded'
        );

        // AI Call Log Management Section
        CollapsibleSectionRenderer.createCollapsibleSection(
            containerEl,
            'AI Call Log Management',
            (sectionEl: HTMLElement) => {
                new Setting(sectionEl)
                    .setName('Clear AI Call Logs')
                    .setDesc('Delete all AI call log files from the plugin\'s ai-calls folder.')
                    .addButton(btn => {
                        btn.setButtonText('Clear Logs')
                            .setCta()
                            .onClick(async () => {
                                const { clearAICallLogs } = await import('../../utils/clearAICallLogs');
                                const pluginFolder = __dirname;
                                const deleted = await clearAICallLogs(pluginFolder, 'ai-calls');
                                // @ts-ignore
                                // eslint-disable-next-line no-new
                                new (window as any).Notice(`Cleared ${deleted} AI call log file(s).`);
                            });
                    });
            },
            this.plugin,
            'generalSectionsExpanded'
        );
    }
}
