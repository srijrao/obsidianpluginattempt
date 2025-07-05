import { App, Setting } from 'obsidian';
import MyPlugin from '../../main';
import { SettingCreators } from '../components/SettingCreators';
import { CollapsibleSectionRenderer } from '../../utils/CollapsibleSection';

/**
 * ContentChatSection is responsible for rendering settings related to content and chat customization.
 * This includes defining chat separators, start/end strings for context, and title/summary generation prompts and output modes.
 */
export class ContentChatSection {
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
     * Renders the Content & Chat Customization settings section into the provided container element.
     * This section is collapsible.
     * @param containerEl The HTML element to render the section into.
     */
    async render(containerEl: HTMLElement): Promise<void> {
        CollapsibleSectionRenderer.createCollapsibleSection(
            containerEl,
            'Content & Chat Customization',
            async (sectionEl: HTMLElement) => {
                // Chat Separator Setting
                this.settingCreators.createTextSetting(sectionEl, 'Chat Separator', 'The string used to separate chat messages.', '----',
                    () => this.plugin.settings.chatSeparator ?? '',
                    async (value) => { this.plugin.settings.chatSeparator = value ?? ''; await this.plugin.saveSettings(); });
                
                // Chat Start String Setting
                this.settingCreators.createTextSetting(sectionEl, 'Chat Start String', 'The string that indicates where to start taking the note for context.', '===START===',
                    () => this.plugin.settings.chatStartString ?? '',
                    async (value) => { this.plugin.settings.chatStartString = value ?? ''; await this.plugin.saveSettings(); });
                
                // Chat End String Setting
                this.settingCreators.createTextSetting(sectionEl, 'Chat End String', 'The string that indicates where to end taking the note for context.', '===END===',
                    () => this.plugin.settings.chatEndString ?? '',
                    async (value) => { this.plugin.settings.chatEndString = value ?? ''; await this.plugin.saveSettings(); });
                
                // Title Prompt Setting
                this.settingCreators.createTextSetting(sectionEl, 'Title Prompt', 'The prompt used for generating note titles.', 'You are a title generator...',
                    () => this.plugin.settings.titlePrompt,
                    async (value) => { this.plugin.settings.titlePrompt = value ?? ''; await this.plugin.saveSettings(); },
                    { isTextArea: true });
                
                // Title Output Mode Dropdown
                this.settingCreators.createDropdownSetting(sectionEl, 'Title Output Mode', 'Choose what to do with the generated note title.',
                    { 'clipboard': 'Copy to clipboard', 'replace-filename': 'Replace note filename', 'metadata': 'Insert into metadata' },
                    () => this.plugin.settings.titleOutputMode ?? 'clipboard',
                    async (value) => { this.plugin.settings.titleOutputMode = value as any; await this.plugin.saveSettings(); });
                
                // Summary Output Mode Dropdown
                this.settingCreators.createDropdownSetting(sectionEl, 'Summary Output Mode', 'Choose what to do with the generated note summary.',
                    { 'clipboard': 'Copy to clipboard', 'metadata': 'Insert into metadata' },
                    () => this.plugin.settings.summaryOutputMode ?? 'clipboard',
                    async (value) => { this.plugin.settings.summaryOutputMode = value as any; await this.plugin.saveSettings(); });
            },
            this.plugin,
            'generalSectionsExpanded'
        );
    }
}
