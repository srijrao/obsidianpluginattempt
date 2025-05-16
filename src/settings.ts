import { App, PluginSettingTab, Setting } from 'obsidian';
import { MyPluginSettings } from './types';
import MyPlugin from './main';

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

        // Title Output Mode
        new Setting(containerEl)
            .setName('Title Output Mode')
            .setDesc('Choose what to do with the generated note title.')
            .addDropdown(drop => {
                drop.addOption('clipboard', 'Copy to clipboard');
                drop.addOption('replace-filename', 'Replace note filename');
                drop.addOption('metadata', 'Insert into metadata');
                drop.setValue(this.plugin.settings.titleOutputMode ?? 'clipboard');
                drop.onChange(async (value: string) => {
                    this.plugin.settings.titleOutputMode = value as any;
                    await this.plugin.saveSettings();
                });
            });

        // Summary Output Mode
        new Setting(containerEl)
            .setName('Summary Output Mode')
            .setDesc('Choose what to do with the generated note summary.')
            .addDropdown(drop => {
                drop.addOption('clipboard', 'Copy to clipboard');
                drop.addOption('metadata', 'Insert into metadata');
                drop.setValue(this.plugin.settings.summaryOutputMode ?? 'clipboard');
                drop.onChange(async (value: string) => {
                    this.plugin.settings.summaryOutputMode = value as any;
                    await this.plugin.saveSettings();
                });
            });
    }
}
