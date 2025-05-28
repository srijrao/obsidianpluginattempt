import { App, Modal, Setting } from 'obsidian';
import MyPlugin from '../../main';

/**
 * Modal for configuring AI model settings
 */
export class SettingsModal extends Modal {
    private plugin: MyPlugin;

    constructor(app: App, plugin: MyPlugin) {
        super(app);
        this.plugin = plugin;
        this.titleEl.setText('AI Model Settings');
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('ai-settings-modal');

        // Provider selection
        new Setting(contentEl)
            .setName('AI Provider')
            .setDesc('Choose which AI provider to use')
            .addDropdown(dropdown => {
                dropdown
                    .addOption('openai', 'OpenAI (ChatGPT)')
                    .addOption('anthropic', 'Anthropic (Claude)')
                    .addOption('gemini', 'Google (Gemini)')
                    .addOption('ollama', 'Ollama (Local AI)')
                    .setValue(this.plugin.settings.provider)
                    .onChange(async (value: 'openai' | 'anthropic' | 'gemini' | 'ollama') => {
                        this.plugin.settings.provider = value;
                        await this.plugin.saveSettings();
                        this.onOpen(); // Refresh view to show provider-specific settings
                    });
            });

        // System message
        new Setting(contentEl)
            .setName('System Message')
            .setDesc('Set the system message for the AI')
            .addTextArea(text => text
                .setPlaceholder('You are a helpful assistant.')
                .setValue(this.plugin.settings.systemMessage)
                .onChange(async (value) => {
                    this.plugin.settings.systemMessage = value;
                    await this.plugin.saveSettings();
                }));

        // Include date with system message
        new Setting(contentEl)
            .setName('Include Date with System Message')
            .setDesc('Add the current date to the system message')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.includeDateWithSystemMessage)
                .onChange(async (value) => {
                    this.plugin.settings.includeDateWithSystemMessage = value;
                    await this.plugin.saveSettings();
                }));

        // Include time with system message
        new Setting(contentEl)
            .setName('Include Time with System Message')
            .setDesc('Add the current time along with the date to the system message')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.includeTimeWithSystemMessage)
                .onChange(async (value) => {
                    this.plugin.settings.includeTimeWithSystemMessage = value;
                    await this.plugin.saveSettings();
                }));

        // Enable Obsidian links
        new Setting(contentEl)
            .setName('Enable Obsidian Links')
            .setDesc('Read Obsidian links in messages using [[filename]] syntax')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableObsidianLinks)
                .onChange(async (value) => {
                    this.plugin.settings.enableObsidianLinks = value;
                    await this.plugin.saveSettings();
                }));

        // Expand Linked Notes Recursively
        new Setting(contentEl)
            .setName('Expand Linked Notes Recursively')
            .setDesc('If enabled, when fetching a note, also fetch and expand links within that note recursively (prevents infinite loops).')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.expandLinkedNotesRecursively ?? false)
                .onChange(async (value) => {
                    this.plugin.settings.expandLinkedNotesRecursively = value;
                    await this.plugin.saveSettings();
                }));

        // Enable context notes
        new Setting(contentEl)
            .setName('Enable Context Notes')
            .setDesc('Attach specified note content to chat messages')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableContextNotes)
                .onChange(async (value) => {
                    this.plugin.settings.enableContextNotes = value;
                    await this.plugin.saveSettings();
                }));

        // Context notes
        new Setting(contentEl)
            .setName('Context Notes')
            .setDesc('Notes to attach as context (supports [[filename]] and [[filename#header]] syntax)')
            .addTextArea(text => {
                text.setPlaceholder('[[Note Name]]\n[[Another Note#Header]]')
                    .setValue(this.plugin.settings.contextNotes || '')
                    .onChange(async (value) => {
                        this.plugin.settings.contextNotes = value;
                        await this.plugin.saveSettings();
                    });
                text.inputEl.rows = 4;
            });

        // Reference current note
        new Setting(contentEl)
            .setName('Reference Current Note')
            .setDesc('Include the content of the current note in the chat context.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.referenceCurrentNote)
                .onChange(async (value) => {
                    this.plugin.settings.referenceCurrentNote = value;
                    await this.plugin.saveSettings();
                }));

        // Enable streaming
        new Setting(contentEl)
            .setName('Enable Streaming')
            .setDesc('Enable or disable streaming for completions')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableStreaming)
                .onChange(async (value) => {
                    this.plugin.settings.enableStreaming = value;
                    await this.plugin.saveSettings();
                }));

        // Temperature
        new Setting(contentEl)
            .setName('Temperature')
            .setDesc('Set the randomness of the model\'s output (0-1)')
            .addSlider(slider => slider
                .setLimits(0, 1, 0.1)
                .setValue(this.plugin.settings.temperature)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.plugin.settings.temperature = value;
                    await this.plugin.saveSettings();
                }));

        // Max tokens
        new Setting(contentEl)
            .setName('Max Tokens')
            .setDesc('Set the maximum length of the model\'s output')
            .addText(text => text
                .setPlaceholder('4000')
                .setValue(String(this.plugin.settings.maxTokens))
                .onChange(async (value) => {
                    const numValue = Number(value);
                    if (!isNaN(numValue)) {
                        this.plugin.settings.maxTokens = numValue;
                        await this.plugin.saveSettings();
                    }
                }));

        // Provider-specific settings
        contentEl.createEl('h3', { text: `${this.plugin.settings.provider.toUpperCase()} Settings` });

        switch (this.plugin.settings.provider) {
            case 'openai': {
                const settings = this.plugin.settings.openaiSettings;
                new Setting(contentEl)
                    .setName('Model')
                    .setDesc('Choose the OpenAI model to use')
                    .addDropdown(dropdown => {
                        for (const model of settings.availableModels) {
                            dropdown.addOption(model, model);
                        }
                        dropdown
                            .setValue(settings.model)
                            .onChange(async (value) => {
                                settings.model = value;
                                await this.plugin.saveSettings();
                            });
                    });
                break;
            }
            case 'anthropic': {
                const settings = this.plugin.settings.anthropicSettings;
                new Setting(contentEl)
                    .setName('Model')
                    .setDesc('Choose the Anthropic model to use')
                    .addDropdown(dropdown => {
                        for (const model of settings.availableModels) {
                            dropdown.addOption(model, model);
                        }
                        dropdown
                            .setValue(settings.model)
                            .onChange(async (value) => {
                                settings.model = value;
                                await this.plugin.saveSettings();
                            });
                    });
                break;
            }
            case 'gemini': {
                const settings = this.plugin.settings.geminiSettings;
                new Setting(contentEl)
                    .setName('Model')
                    .setDesc('Choose the Gemini model to use')
                    .addDropdown(dropdown => {
                        for (const model of settings.availableModels) {
                            dropdown.addOption(model, model);
                        }
                        dropdown
                            .setValue(settings.model)
                            .onChange(async (value) => {
                                settings.model = value;
                                await this.plugin.saveSettings();
                            });
                    });
                break;
            }
            case 'ollama': {
                const settings = this.plugin.settings.ollamaSettings;
                new Setting(contentEl)
                    .setName('Model')
                    .setDesc('Choose the Ollama model to use')
                    .addDropdown(dropdown => {
                        for (const model of settings.availableModels) {
                            dropdown.addOption(model, model);
                        }
                        dropdown
                            .setValue(settings.model)
                            .onChange(async (value) => {
                                settings.model = value;
                                await this.plugin.saveSettings();
                            });
                    });
                break;
            }
        }
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}