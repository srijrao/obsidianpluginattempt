import { App, Setting } from 'obsidian';
import MyPlugin from '../../main';
import { SettingCreators } from '../components/SettingCreators';
import { CollapsibleSectionRenderer } from '../../components/chat/CollapsibleSection';

export class ContentChatSection {
    private plugin: MyPlugin;
    private settingCreators: SettingCreators;

    constructor(plugin: MyPlugin, settingCreators: SettingCreators) {
        this.plugin = plugin;
        this.settingCreators = settingCreators;
    }

    async render(containerEl: HTMLElement): Promise<void> {
        CollapsibleSectionRenderer.createCollapsibleSection(
            containerEl,
            'Content & Chat Customization',
            async (sectionEl: HTMLElement) => {
                this.settingCreators.createTextSetting(sectionEl, 'Chat Separator', 'The string used to separate chat messages.', '----',
                    () => this.plugin.settings.chatSeparator ?? '',
                    async (value) => { this.plugin.settings.chatSeparator = value ?? ''; await this.plugin.saveSettings(); });
                this.settingCreators.createTextSetting(sectionEl, 'Chat Start String', 'The string that indicates where to start taking the note for context.', '===START===',
                    () => this.plugin.settings.chatStartString ?? '',
                    async (value) => { this.plugin.settings.chatStartString = value ?? ''; await this.plugin.saveSettings(); });
                this.settingCreators.createTextSetting(sectionEl, 'Chat End String', 'The string that indicates where to end taking the note for context.', '===END===',
                    () => this.plugin.settings.chatEndString ?? '',
                    async (value) => { this.plugin.settings.chatEndString = value ?? ''; await this.plugin.saveSettings(); });
                this.settingCreators.createTextSetting(sectionEl, 'Title Prompt', 'The prompt used for generating note titles.', 'You are a title generator...',
                    () => this.plugin.settings.titlePrompt,
                    async (value) => { this.plugin.settings.titlePrompt = value ?? ''; await this.plugin.saveSettings(); },
                    { isTextArea: true });
                this.settingCreators.createDropdownSetting(sectionEl, 'Title Output Mode', 'Choose what to do with the generated note title.',
                    { 'clipboard': 'Copy to clipboard', 'replace-filename': 'Replace note filename', 'metadata': 'Insert into metadata' },
                    () => this.plugin.settings.titleOutputMode ?? 'clipboard',
                    async (value) => { this.plugin.settings.titleOutputMode = value as any; await this.plugin.saveSettings(); });
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
