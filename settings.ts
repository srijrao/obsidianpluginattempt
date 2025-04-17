import { App, PluginSettingTab, Setting } from 'obsidian';
import { MyPluginSettings } from './types';
import MyPlugin from './main';
import { Notice } from 'obsidian';
import { createProvider } from './providers';

/**
 * Plugin Settings Tab
 * 
 * This tab provides a user interface for configuring the plugin settings.
 * It automatically opens the model settings view when settings are changed.
 */
export class MyPluginSettingTab extends PluginSettingTab {
    plugin: MyPlugin;

    constructor(app: App, plugin: MyPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    /**
     * Display the settings tab
     * 
     * Shows only the auto-open setting here since all other settings
     * are managed in the model settings view for better organization.
     */
    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        containerEl.createEl('h2', { text: 'AI Assistant Settings' });

        // API Keys Section
        containerEl.createEl('h3', { text: 'API Keys' });

        // OpenAI API Key
        new Setting(containerEl)
            .setName('OpenAI API Key')
            .setDesc('Enter your OpenAI API key')
            .addText(text => text
                .setPlaceholder('Enter your API key')
                .setValue(this.plugin.settings.openaiSettings.apiKey)
                .onChange(async (value) => {
                    this.plugin.settings.openaiSettings.apiKey = value;
                    await this.plugin.saveSettings();
                }));

        // Anthropic API Key
        new Setting(containerEl)
            .setName('Anthropic API Key')
            .setDesc('Enter your Anthropic API key')
            .addText(text => text
                .setPlaceholder('Enter your API key')
                .setValue(this.plugin.settings.anthropicSettings.apiKey)
                .onChange(async (value) => {
                    this.plugin.settings.anthropicSettings.apiKey = value;
                    await this.plugin.saveSettings();
                }));

        // Gemini API Key
        new Setting(containerEl)
            .setName('Google API Key')
            .setDesc('Enter your Google API key')
            .addText(text => text
                .setPlaceholder('Enter your API key')
                .setValue(this.plugin.settings.geminiSettings.apiKey)
                .onChange(async (value) => {
                    this.plugin.settings.geminiSettings.apiKey = value;
                    await this.plugin.saveSettings();
                }));

        // Ollama Server URL
        new Setting(containerEl)
            .setName('Ollama Server URL')
            .setDesc('Enter your Ollama server URL (default: http://localhost:11434)')
            .addText(text => text
                .setPlaceholder('http://localhost:11434')
                .setValue(this.plugin.settings.ollamaSettings.serverUrl)
                .onChange(async (value) => {
                    this.plugin.settings.ollamaSettings.serverUrl = value;
                    await this.plugin.saveSettings();
                }));

        // Model Settings Section
        containerEl.createEl('h3', { text: 'Model Settings' });

        new Setting(containerEl)
            .setName('Auto-open Model Settings')
            .setDesc('Automatically open model settings when Obsidian starts')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.autoOpenModelSettings)
                .onChange(async (value) => {
                    this.plugin.settings.autoOpenModelSettings = value;
                    await this.plugin.saveSettings();
                }));

        // Add a button to open model settings
        new Setting(containerEl)
            .setName('Open Model Settings')
            .setDesc('Open the model settings view')
            .addButton(button => button
                .setButtonText('Open')
                .onClick(() => {
                    this.plugin.activateView();
                }));

        // Debug Mode Setting
        containerEl.createEl('h3', { text: 'Debugging' });
        new Setting(containerEl)
            .setName('Enable Debug Mode')
            .setDesc('Log detailed information to the console for debugging purposes.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.debugMode)
                .onChange(async (value) => {
                    this.plugin.settings.debugMode = value;
                    await this.plugin.saveSettings();
                }));

        // Chat Formatting Section
        containerEl.createEl('h3', { text: 'Chat Formatting' });

        new Setting(containerEl)
            .setName('Chat Separator')
            .setDesc('The string used to separate chat messages.')
            .addText(text => {
                text.setPlaceholder('----')
                    .setValue(this.plugin.settings.chatSeparator ?? '')
                    .onChange(async (value: string) => {
                        this.plugin.settings.chatSeparator = value;
                        await this.plugin.saveSettings();
                    });
            });

        new Setting(containerEl)
            .setName('Chat Start String')
            .setDesc('The string that indicates where to start taking the note for context.')
            .addText(text => {
                text.setPlaceholder('===START===')
                    .setValue(this.plugin.settings.chatStartString ?? '')
                    .onChange(async (value: string) => {
                        this.plugin.settings.chatStartString = value;
                        await this.plugin.saveSettings();
                    });
            });

        new Setting(containerEl)
            .setName('Chat End String')
            .setDesc('The string that indicates where to end taking the note for context.')
            .addText(text => {
                text.setPlaceholder('===END===')
                    .setValue(this.plugin.settings.chatEndString ?? '')
                    .onChange(async (value: string) => {
                        this.plugin.settings.chatEndString = value;
                        await this.plugin.saveSettings();
                    });
            });
    }
}

export class SettingsValidator {
    static validateSettings(settings: MyPluginSettings): boolean {
        // Check temperature bounds
        if (settings.temperature < 0 || settings.temperature > 1) {
            new Notice('Temperature must be between 0 and 1');
            return false;
        }

        // Check max tokens
        if (settings.maxTokens <= 0) {
            new Notice('Max tokens must be greater than 0');
            return false;
        }

        // Validate provider-specific settings
        switch (settings.provider) {
            case 'openai':
                if (!settings.openaiSettings.apiKey) {
                    new Notice('OpenAI API key is required');
                    return false;
                }
                break;
            case 'anthropic':
                if (!settings.anthropicSettings.apiKey) {
                    new Notice('Anthropic API key is required');
                    return false;
                }
                break;
            case 'gemini':
                if (!settings.geminiSettings.apiKey) {
                    new Notice('Google API key is required');
                    return false;
                }
                break;
            case 'ollama':
                // Validate Ollama server URL format
                try {
                    new URL(settings.ollamaSettings.serverUrl);
                } catch {
                    new Notice('Invalid Ollama server URL');
                    return false;
                }
                break;
        }

        return true;
    }

    static async validateConnection(settings: MyPluginSettings): Promise<boolean> {
        try {
            const provider = createProvider(settings);
            const result = await provider.testConnection();
            if (!result.success) {
                new Notice(`Connection test failed: ${result.message}`);
                return false;
            }
            return true;
        } catch (error) {
            new Notice(`Connection error: ${error.message}`);
            return false;
        }
    }
}

// Export utility functions
export function getDebugFlag(): boolean {
    return localStorage.getItem('ai_chat_debug') === 'true';
}

export function debug(...args: any[]): void {
    if (getDebugFlag()) {
        console.log('[AI Chat Debug]', ...args);
    }
}
