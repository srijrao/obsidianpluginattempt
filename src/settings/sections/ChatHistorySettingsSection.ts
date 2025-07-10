import { App, Setting } from 'obsidian';
import MyPlugin from '../../main';
import { SettingCreators } from '../components/SettingCreators';
import { CollapsibleSectionRenderer } from '../../utils/CollapsibleSection';

/**
 * ChatHistorySettingsSection is responsible for rendering settings related to chat history and UI behavior.
 * This includes managing the maximum number of chat sessions, auto-saving, and various UI display options.
 */
export class ChatHistorySettingsSection {
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
     * Renders the Chat History & Sessions and UI Behavior settings sections into the provided container element.
     * @param containerEl The HTML element to render the sections into.
     */
    async render(containerEl: HTMLElement): Promise<void> {
        // Chat History & Sessions Section
        CollapsibleSectionRenderer.createCollapsibleSection(
            containerEl,
            'Chat History & Sessions',
            (sectionEl: HTMLElement) => {
                // Max Chat Sessions Slider
                this.settingCreators.createSliderSetting(
                    sectionEl, 
                    'Max Chat Sessions', 
                    'Maximum number of chat sessions to keep in history.',
                    { min: 1, max: 50, step: 1 },
                    () => this.plugin.settings.maxSessions,
                    async (value) => { 
                        this.plugin.settings.maxSessions = value; 
                        await this.plugin.saveSettings(); 
                    }
                );

                // Auto-Save Sessions Toggle
                this.settingCreators.createToggleSetting(
                    sectionEl, 
                    'Auto-Save Sessions', 
                    'Automatically save chat sessions as you use them.',
                    () => this.plugin.settings.autoSaveSessions,
                    async (value) => { 
                        this.plugin.settings.autoSaveSessions = value; 
                        await this.plugin.saveSettings(); 
                    }
                );
            },
            this.plugin,
            'generalSectionsExpanded'
        );

        // UI Behavior Section
        CollapsibleSectionRenderer.createCollapsibleSection(
            containerEl,
            'UI Behavior',
            (sectionEl: HTMLElement) => {
                // Collapse Old Reasoning Toggle
                this.settingCreators.createToggleSetting(
                    sectionEl,
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

                // Show Completion Notifications Toggle
                this.settingCreators.createToggleSetting(
                    sectionEl,
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

                // Include Reasoning in Exports Toggle
                this.settingCreators.createToggleSetting(
                    sectionEl,
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
            },
            this.plugin,
            'generalSectionsExpanded'
        );
    }
}
