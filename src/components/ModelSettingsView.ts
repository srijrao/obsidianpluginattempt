import { App, WorkspaceLeaf, ItemView, Setting, Notice, TFile } from 'obsidian';
import MyPlugin from '../main'; // Import MyPlugin
import { createProvider } from '../../providers';

const VIEW_TYPE_MODEL_SETTINGS = 'model-settings-view';

/**
 * AI Model Settings View
 *
 * This view provides a user interface for configuring AI model settings.
 * It allows users to:
 * - Select their preferred AI provider (OpenAI, Anthropic, Gemini, Ollama)
 * - Configure provider-specific settings like API keys and models
 * - Adjust common settings like temperature and token limits
 * - Test API connections and refresh available models
 */
export class ModelSettingsView extends ItemView {
    plugin: MyPlugin;

    constructor(leaf: WorkspaceLeaf, plugin: MyPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType(): string {
        return VIEW_TYPE_MODEL_SETTINGS;
    }

    getDisplayText(): string {
        return 'AI Model Settings';
    }

    getIcon(): string {
        return 'file-sliders';
    }

    async onOpen() {
        const { contentEl } = this;
        contentEl.empty();

        // Settings Section
        contentEl.createEl('h2', { text: 'AI Model Settings' });

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

        new Setting(contentEl)
            .setName('Enable Streaming')
            .setDesc('Enable or disable streaming for completions')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableStreaming)
                .onChange(async (value) => {
                    this.plugin.settings.enableStreaming = value;
                    await this.plugin.saveSettings();
                }));

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

        // Date Settings Section
        contentEl.createEl('h4', { text: 'Date Settings' });

        new Setting(contentEl)
            .setName('Include Date with System Message')
            .setDesc('Add the current date to the system message')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.includeDateWithSystemMessage)
                .onChange(async (value) => {
                    this.plugin.settings.includeDateWithSystemMessage = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(contentEl)
            .setName('Include Time with System Message')
            .setDesc('Add the current time along with the date to the system message')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.includeTimeWithSystemMessage)
                .onChange(async (value) => {
                    this.plugin.settings.includeTimeWithSystemMessage = value;
                    await this.plugin.saveSettings();
                }));
        // Note Reference Settings Section
        contentEl.createEl('h4', { text: 'Note Reference Settings' });
        new Setting(contentEl)
            .setName('Enable Obsidian Links')
            .setDesc('Read Obsidian links in messages using [[filename]] syntax')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableObsidianLinks)
                .onChange(async (value) => {
                    this.plugin.settings.enableObsidianLinks = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(contentEl)
            .setName('Enable Context Notes')
            .setDesc('Attach specified note content to chat messages')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableContextNotes)
                .onChange(async (value) => {
                    this.plugin.settings.enableContextNotes = value;
                    await this.plugin.saveSettings();
                }));

        const contextNotesContainer = contentEl.createDiv('context-notes-container');
        contextNotesContainer.style.marginBottom = '24px';

        new Setting(contextNotesContainer)
            .setName('Context Notes')
            .setDesc('Notes to attach as context (supports [[filename]] and [[filename#header]] syntax)')
            .addTextArea(text => {
                text.setPlaceholder('[[Note Name]]\n[[Another Note#Header]]')
                    .setValue(this.plugin.settings.contextNotes || '')
                    .onChange(async (value) => {
                        this.plugin.settings.contextNotes = value;
                        await this.plugin.saveSettings();
                    });

                // Enable larger text area
                text.inputEl.rows = 4;
                text.inputEl.style.width = '100%';

            });

        new Setting(contentEl)
            .setName('Expand Linked Notes Recursively')
            .setDesc('If enabled, when fetching a note, also fetch and expand links within that note recursively (prevents infinite loops).')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.expandLinkedNotesRecursively ?? false)
                .onChange(async (value) => {
                    this.plugin.settings.expandLinkedNotesRecursively = value;
                    await this.plugin.saveSettings();
                }));

        // Provider-specific settings section
        contentEl.createEl('h2', { text: 'Provider Settings' });
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
                        // Refresh view to show provider-specific settings
                        this.onOpen();
                    });
            });
        switch (this.plugin.settings.provider) {
            case 'openai':
                this.renderOpenAISettings(contentEl);
                break;
            case 'anthropic':
                this.renderAnthropicSettings(contentEl);
                break;
            case 'gemini':
                this.renderGeminiSettings(contentEl);
                break;
            case 'ollama':
                this.renderOllamaSettings(contentEl);
                break;
        }
    }

    private renderProviderSettings(containerEl: HTMLElement, settings: any, providerName: string, testConnectionCallback: () => Promise<void>) {
        new Setting(containerEl)
            .setName('Test Connection')
            .setDesc(`Verify your API key and fetch available models for ${providerName}`)
            .addButton(button => button
                .setButtonText('Test')
                .onClick(async () => {
                    button.setButtonText('Testing...');
                    button.setDisabled(true);

                    try {
                        await testConnectionCallback();
                    } catch (error) {
                        new Notice(`Error: ${error.message}`);
                    } finally {
                        button.setButtonText('Test');
                        button.setDisabled(false);
                    }
                }));

        if (settings.lastTestResult) {
            const date = new Date(settings.lastTestResult.timestamp);
            containerEl.createEl('div', {
                text: `Last test: ${date.toLocaleString()} - ${settings.lastTestResult.message}`,
                cls: settings.lastTestResult.success ? 'success' : 'error'
            });
        }

        new Setting(containerEl)
            .setName('Model')
            .setDesc(`Choose the ${providerName} model to use`)
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
    }

    private renderOpenAISettings(containerEl: HTMLElement) {
        this.renderProviderSettings(containerEl, this.plugin.settings.openaiSettings, 'OpenAI', async () => {
            const provider = createProvider(this.plugin.settings);
            const result = await provider.testConnection();

            if (result.success && result.models) {
                this.plugin.settings.openaiSettings.availableModels = result.models;
                await this.plugin.saveSettings();
                this.plugin.settings.openaiSettings.lastTestResult = {
                    timestamp: Date.now(),
                    success: true,
                    message: result.message
                };
                new Notice(result.message);
                this.onOpen(); // Refresh view
            } else {
                this.plugin.settings.openaiSettings.lastTestResult = {
                    timestamp: Date.now(),
                    success: false,
                    message: result.message
                };
                new Notice(result.message);
            }
        });
    }

    private renderAnthropicSettings(containerEl: HTMLElement) {
        this.renderProviderSettings(containerEl, this.plugin.settings.anthropicSettings, 'Anthropic', async () => {
            const provider = createProvider(this.plugin.settings);
            const result = await provider.testConnection();

            if (result.success && result.models) {
                this.plugin.settings.anthropicSettings.availableModels = result.models;
                await this.plugin.saveSettings();
                this.plugin.settings.anthropicSettings.lastTestResult = {
                    timestamp: Date.now(),
                    success: true,
                    message: result.message
                };
                new Notice(result.message);
                this.onOpen(); // Refresh view
            } else {
                this.plugin.settings.anthropicSettings.lastTestResult = {
                    timestamp: Date.now(),
                    success: false,
                    message: result.message
                };
                new Notice(result.message);
            }
        });
    }

    private renderGeminiSettings(containerEl: HTMLElement) {
        this.renderProviderSettings(containerEl, this.plugin.settings.geminiSettings, 'Gemini', async () => {
            const provider = createProvider(this.plugin.settings);
            const result = await provider.testConnection();

            if (result.success && result.models) {
                this.plugin.settings.geminiSettings.availableModels = result.models;
                await this.plugin.saveSettings();
                this.plugin.settings.geminiSettings.lastTestResult = {
                    timestamp: Date.now(),
                    success: true,
                    message: result.message
                };
                new Notice(result.message);
                this.onOpen(); // Refresh view
            } else {
                this.plugin.settings.geminiSettings.lastTestResult = {
                    timestamp: Date.now(),
                    success: false,
                    message: result.message
                };
                new Notice(result.message);
            }
        });
    }

    private renderOllamaSettings(containerEl: HTMLElement) {
        this.renderProviderSettings(containerEl, this.plugin.settings.ollamaSettings, 'Ollama', async () => {
            const provider = createProvider(this.plugin.settings);
            const result = await provider.testConnection();

            if (result.success && result.models) {
                this.plugin.settings.ollamaSettings.availableModels = result.models;
                await this.plugin.saveSettings();
                this.plugin.settings.ollamaSettings.lastTestResult = {
                    timestamp: Date.now(),
                    success: true,
                    message: result.message
                };
                new Notice(result.message);
                this.onOpen(); // Refresh view
            } else {
                this.plugin.settings.ollamaSettings.lastTestResult = {
                    timestamp: Date.now(),
                    success: false,
                    message: result.message
                };
                new Notice(result.message);
            }
        });

        // Add help text for Ollama setup
        containerEl.createEl('div', {
            cls: 'setting-item-description',
            text: 'To use Ollama:'
        });
        const steps = containerEl.createEl('ol');
        steps.createEl('li', { text: 'Install Ollama from https://ollama.ai' });
        steps.createEl('li', { text: 'Start the Ollama server' });
        steps.createEl('li', { text: 'Pull models using "ollama pull model-name"' });
        steps.createEl('li', { text: 'Test connection to see available models' });
    }

    async onClose() {
        // Clean up any resources if needed
    }

}
