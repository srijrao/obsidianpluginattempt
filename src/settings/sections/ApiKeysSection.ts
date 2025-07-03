import { App, Setting } from 'obsidian';
import MyPlugin from '../../main';
import { SettingCreators } from '../components/SettingCreators';
import { CollapsibleSectionRenderer } from '../../components/chat/CollapsibleSection';

/**
 * ApiKeysSection is responsible for rendering the settings related to API keys for various AI providers.
 * This section is collapsible and includes input fields for OpenAI, Anthropic, Google Gemini, and Ollama API keys/URLs.
 */
export class ApiKeysSection {
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
     * Renders the API Keys & Providers settings section into the provided container element.
     * This section is collapsible.
     * @param containerEl The HTML element to render the section into.
     */
    async render(containerEl: HTMLElement): Promise<void> {
        CollapsibleSectionRenderer.createCollapsibleSection(
            containerEl,
            'API Keys & Providers',
            async (sectionEl: HTMLElement) => {
                // OpenAI API Key Setting
                this.settingCreators.createTextSetting(sectionEl, 'OpenAI API Key', 'Enter your OpenAI API key', 'Enter your API key',
                    () => this.plugin.settings.openaiSettings.apiKey,
                    async (value) => { this.plugin.settings.openaiSettings.apiKey = value ?? ''; await this.plugin.saveSettings(); });
                
                // OpenAI Base URL Setting
                this.settingCreators.createTextSetting(sectionEl, 'OpenAI Base URL', 'Custom base URL for OpenAI API (optional, leave empty for default)', 'https://api.openai.com/v1',
                    () => this.plugin.settings.openaiSettings.baseUrl || '',
                    async (value) => { this.plugin.settings.openaiSettings.baseUrl = value; await this.plugin.saveSettings(); },
                    { trim: true, undefinedIfEmpty: true });
                
                // Anthropic API Key Setting
                this.settingCreators.createTextSetting(sectionEl, 'Anthropic API Key', 'Enter your Anthropic API key', 'Enter your API key',
                    () => this.plugin.settings.anthropicSettings.apiKey,
                    async (value) => { this.plugin.settings.anthropicSettings.apiKey = value ?? ''; await this.plugin.saveSettings(); });
                
                // Google API Key Setting
                this.settingCreators.createTextSetting(sectionEl, 'Google API Key', 'Enter your Google API key', 'Enter your API key',
                    () => this.plugin.settings.geminiSettings.apiKey,
                    async (value) => { this.plugin.settings.geminiSettings.apiKey = value ?? ''; await this.plugin.saveSettings(); });
                
                // Ollama Server URL Setting
                this.settingCreators.createTextSetting(sectionEl, 'Ollama Server URL', 'Enter your Ollama server URL (default: http://localhost:11434)', 'http://localhost:11434',
                    () => this.plugin.settings.ollamaSettings.serverUrl,
                    async (value) => { this.plugin.settings.ollamaSettings.serverUrl = value ?? ''; await this.plugin.saveSettings(); });
            },
            this.plugin,
            'generalSectionsExpanded'
        );
    }
}
