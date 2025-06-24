import { App, Setting } from 'obsidian';
import MyPlugin from '../../main';
import { SettingCreators } from '../components/SettingCreators';
import { CollapsibleSectionRenderer } from '../../components/chat/CollapsibleSection';

export class ApiKeysSection {
    private plugin: MyPlugin;
    private settingCreators: SettingCreators;

    constructor(plugin: MyPlugin, settingCreators: SettingCreators) {
        this.plugin = plugin;
        this.settingCreators = settingCreators;
    }

    async render(containerEl: HTMLElement): Promise<void> {
        CollapsibleSectionRenderer.createCollapsibleSection(
            containerEl,
            'API Keys & Providers',
            async (sectionEl: HTMLElement) => {
                this.settingCreators.createTextSetting(sectionEl, 'OpenAI API Key', 'Enter your OpenAI API key', 'Enter your API key',
                    () => this.plugin.settings.openaiSettings.apiKey,
                    async (value) => { this.plugin.settings.openaiSettings.apiKey = value ?? ''; await this.plugin.saveSettings(); });
                this.settingCreators.createTextSetting(sectionEl, 'OpenAI Base URL', 'Custom base URL for OpenAI API (optional, leave empty for default)', 'https://api.openai.com/v1',
                    () => this.plugin.settings.openaiSettings.baseUrl || '',
                    async (value) => { this.plugin.settings.openaiSettings.baseUrl = value; await this.plugin.saveSettings(); },
                    { trim: true, undefinedIfEmpty: true });
                this.settingCreators.createTextSetting(sectionEl, 'Anthropic API Key', 'Enter your Anthropic API key', 'Enter your API key',
                    () => this.plugin.settings.anthropicSettings.apiKey,
                    async (value) => { this.plugin.settings.anthropicSettings.apiKey = value ?? ''; await this.plugin.saveSettings(); });
                this.settingCreators.createTextSetting(sectionEl, 'Google API Key', 'Enter your Google API key', 'Enter your API key',
                    () => this.plugin.settings.geminiSettings.apiKey,
                    async (value) => { this.plugin.settings.geminiSettings.apiKey = value ?? ''; await this.plugin.saveSettings(); });
                this.settingCreators.createTextSetting(sectionEl, 'Ollama Server URL', 'Enter your Ollama server URL (default: http://localhost:11434)', 'http://localhost:11434',
                    () => this.plugin.settings.ollamaSettings.serverUrl,
                    async (value) => { this.plugin.settings.ollamaSettings.serverUrl = value ?? ''; await this.plugin.saveSettings(); });
            },
            this.plugin,
            'generalSectionsExpanded'
        );
    }
}
