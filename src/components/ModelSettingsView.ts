import { App, WorkspaceLeaf, ItemView, Setting, Notice, TFile } from 'obsidian';
import MyPlugin from '../main'; // Import MyPlugin
import { createProvider, getAllAvailableModels, getProviderFromUnifiedModel } from '../../providers';
import { CollapsibleSectionRenderer } from './chat/CollapsibleSection';

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
    private _onSettingsChange = () => {
        this.onOpen();
    };

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
        // Register settings change listener (avoid duplicate listeners)
        this.plugin.offSettingsChange(this._onSettingsChange);
        this.plugin.onSettingsChange(this._onSettingsChange);

        // AI Model Settings Section
        CollapsibleSectionRenderer.createCollapsibleSection(contentEl, 'AI Model Settings', (sectionEl: HTMLElement) => {
            new Setting(sectionEl)
                .setName('System Message')
                .setDesc('Set the system message for the AI')
                .addTextArea(text => text
                    .setPlaceholder('You are a helpful assistant.')
                    .setValue(this.plugin.settings.systemMessage)
                    .onChange(async (value) => {
                        this.plugin.settings.systemMessage = value;
                        await this.plugin.saveSettings();
                    }));

            new Setting(sectionEl)
                .setName('Enable Streaming')
                .setDesc('Enable or disable streaming for completions')
                .addToggle(toggle => toggle
                    .setValue(this.plugin.settings.enableStreaming)
                    .onChange(async (value) => {
                        this.plugin.settings.enableStreaming = value;
                        await this.plugin.saveSettings();
                    }));

            new Setting(sectionEl)
                .setName('Temperature')
                .setDesc("Set the randomness of the model's output (0-1)")
                .addSlider(slider => slider
                    .setLimits(0, 1, 0.1)
                    .setValue(this.plugin.settings.temperature)
                    .setDynamicTooltip()
                    .onChange(async (value) => {
                        this.plugin.settings.temperature = value;
                        await this.plugin.saveSettings();
                    }));
        }, this.plugin, 'generalSectionsExpanded');

        // Date Settings Section
        CollapsibleSectionRenderer.createCollapsibleSection(contentEl, 'Date Settings', (sectionEl: HTMLElement) => {
            new Setting(sectionEl)
                .setName('Include Date with System Message')
                .setDesc('Add the current date to the system message')
                .addToggle(toggle => toggle
                    .setValue(this.plugin.settings.includeDateWithSystemMessage)
                    .onChange(async (value) => {
                        this.plugin.settings.includeDateWithSystemMessage = value;
                        await this.plugin.saveSettings();
                    }));

            new Setting(sectionEl)
                .setName('Include Time with System Message')
                .setDesc('Add the current time along with the date to the system message')
                .addToggle(toggle => toggle
                    .setValue(this.plugin.settings.includeTimeWithSystemMessage)
                    .onChange(async (value) => {
                        this.plugin.settings.includeTimeWithSystemMessage = value;
                        await this.plugin.saveSettings();
                    }));
        }, this.plugin, 'generalSectionsExpanded');

        // Note Reference Settings Section
        CollapsibleSectionRenderer.createCollapsibleSection(contentEl, 'Note Reference Settings', (sectionEl: HTMLElement) => {
            new Setting(sectionEl)
                .setName('Enable Obsidian Links')
                .setDesc('Read Obsidian links in messages using [[filename]] syntax')
                .addToggle(toggle => toggle
                    .setValue(this.plugin.settings.enableObsidianLinks)
                    .onChange(async (value) => {
                        this.plugin.settings.enableObsidianLinks = value;
                        await this.plugin.saveSettings();
                    }));

            new Setting(sectionEl)
                .setName('Enable Context Notes')
                .setDesc('Attach specified note content to chat messages')
                .addToggle(toggle => toggle
                    .setValue(this.plugin.settings.enableContextNotes)
                    .onChange(async (value) => {
                        this.plugin.settings.enableContextNotes = value;
                        await this.plugin.saveSettings();
                    }));

            const contextNotesContainer = sectionEl.createDiv('context-notes-container');
            contextNotesContainer.style.marginBottom = '24px';

            new Setting(contextNotesContainer)
                .setName('Context Notes')
                .setDesc('Notes to attach as context (supports [[filename]] and [[filename#header]] syntax)')
                .addTextArea(text => {
                    text.setPlaceholder('[[Note Name]]\\n[[Another Note#Header]]')
                        .setValue(this.plugin.settings.contextNotes || '')
                        .onChange(async (value) => {
                            this.plugin.settings.contextNotes = value;
                            await this.plugin.saveSettings();
                        });

                    // Enable larger text area
                    text.inputEl.rows = 4;
                    text.inputEl.style.width = '100%';

                });

            new Setting(sectionEl)
                .setName('Expand Linked Notes Recursively')
                .setDesc('If enabled, when fetching a note, also fetch and expand links within that note recursively (prevents infinite loops).')
                .addToggle(toggle => toggle
                    .setValue(this.plugin.settings.expandLinkedNotesRecursively ?? false)
                    .onChange(async (value) => {
                        this.plugin.settings.expandLinkedNotesRecursively = value;
                        await this.plugin.saveSettings();
                    }));
        }, this.plugin, 'generalSectionsExpanded');
        
        // Model Settings Section - Unified Approach
        CollapsibleSectionRenderer.createCollapsibleSection(contentEl, 'Model Settings', async (sectionEl: HTMLElement) => {
            // Refresh available models button
            new Setting(sectionEl)
                .setName('Refresh Available Models')
                .setDesc('Test connections to all configured providers and refresh available models')
                .addButton(button => button
                    .setButtonText('Refresh Models')
                    .onClick(async () => {
                        button.setButtonText('Refreshing...');
                        button.setDisabled(true);
                        
                        try {
                            await this.refreshAllAvailableModels();
                            new Notice('Successfully refreshed available models');
                        } catch (error) {
                            new Notice(`Error refreshing models: ${error.message}`);
                        } finally {
                            button.setButtonText('Refresh Models');
                            button.setDisabled(false);
                        }
                    }));

            // Unified model selection dropdown
            await this.renderUnifiedModelDropdown(sectionEl);
        }, this.plugin, 'generalSectionsExpanded');

        // Provider Configuration Section
        CollapsibleSectionRenderer.createCollapsibleSection(contentEl, 'Provider Configuration', (sectionEl: HTMLElement) => {
            sectionEl.createEl('p', { 
                text: 'API keys are configured in the main plugin settings. Use the test buttons below to verify connections and refresh available models.',
                cls: 'setting-item-description'
            });
            
            // Render all provider configurations
            this.renderOpenAIConfig(sectionEl);
            this.renderAnthropicConfig(sectionEl);
            this.renderGeminiConfig(sectionEl);
            this.renderOllamaConfig(sectionEl);
        }, this.plugin, 'generalSectionsExpanded');
    }

    /**
     * Renders the unified model selection dropdown
     */
    private async renderUnifiedModelDropdown(containerEl: HTMLElement) {        // Ensure we have available models
        if (!this.plugin.settings.availableModels || this.plugin.settings.availableModels.length === 0) {
            this.plugin.settings.availableModels = await getAllAvailableModels(this.plugin.settings);
            await this.plugin.saveSettings();
        }

        new Setting(containerEl)
            .setName('Selected Model')
            .setDesc('Choose from all available models across all configured providers')
            .addDropdown(dropdown => {
                // Add a default option if no models are available
                if (!this.plugin.settings.availableModels || this.plugin.settings.availableModels.length === 0) {
                    dropdown.addOption('', 'No models available - configure providers below');
                } else {
                    dropdown.addOption('', 'Select a model...');
                    
                    // Group models by provider for better organization
                    const modelsByProvider: Record<string, any[]> = {};
                    this.plugin.settings.availableModels.forEach(model => {
                        if (!modelsByProvider[model.provider]) {
                            modelsByProvider[model.provider] = [];
                        }
                        modelsByProvider[model.provider].push(model);
                    });

                    // Add models grouped by provider
                    Object.entries(modelsByProvider).forEach(([provider, models]) => {
                        models.forEach(model => {
                            dropdown.addOption(model.id, model.name);
                        });
                    });
                }
                
                dropdown
                    .setValue(this.plugin.settings.selectedModel || '')
                    .onChange(async (value) => {
                        this.plugin.settings.selectedModel = value;
                        
                        // Update the provider setting based on selected model
                        if (value) {
                            const provider = getProviderFromUnifiedModel(value);
                            this.plugin.settings.provider = provider;
                        }
                        
                        await this.plugin.saveSettings();
                    });
            });

        // Show current selection info if a model is selected
        if (this.plugin.settings.selectedModel && this.plugin.settings.availableModels) {
            const selectedModel = this.plugin.settings.availableModels.find(
                model => model.id === this.plugin.settings.selectedModel
            );
            if (selectedModel) {
                const infoEl = containerEl.createEl('div', { cls: 'setting-item-description' });
                infoEl.setText(`Currently using: ${selectedModel.name}`);
            }
        }
    }

    /**
     * Refreshes available models from all configured providers
     */
    private async refreshAllAvailableModels() {
        const providers = ['openai', 'anthropic', 'gemini', 'ollama'] as const;
        const results: string[] = [];

        for (const providerType of providers) {
            try {
                // Temporarily set provider to test connection
                const originalProvider = this.plugin.settings.provider;
                this.plugin.settings.provider = providerType;
                
                const provider = createProvider(this.plugin.settings);
                const result = await provider.testConnection();
                
                // Restore original provider
                this.plugin.settings.provider = originalProvider;
                
                if (result.success && result.models) {
                    // Update the provider's available models
                    switch (providerType) {
                        case 'openai':
                            this.plugin.settings.openaiSettings.availableModels = result.models;
                            this.plugin.settings.openaiSettings.lastTestResult = {
                                timestamp: Date.now(),
                                success: true,
                                message: result.message
                            };
                            results.push(`OpenAI: ${result.models.length} models`);
                            break;
                        case 'anthropic':
                            this.plugin.settings.anthropicSettings.availableModels = result.models;
                            this.plugin.settings.anthropicSettings.lastTestResult = {
                                timestamp: Date.now(),
                                success: true,
                                message: result.message
                            };
                            results.push(`Anthropic: ${result.models.length} models`);
                            break;
                        case 'gemini':
                            this.plugin.settings.geminiSettings.availableModels = result.models;
                            this.plugin.settings.geminiSettings.lastTestResult = {
                                timestamp: Date.now(),
                                success: true,
                                message: result.message
                            };
                            results.push(`Gemini: ${result.models.length} models`);
                            break;
                        case 'ollama':
                            this.plugin.settings.ollamaSettings.availableModels = result.models;
                            this.plugin.settings.ollamaSettings.lastTestResult = {
                                timestamp: Date.now(),
                                success: true,
                                message: result.message
                            };
                            results.push(`Ollama: ${result.models.length} models`);
                            break;
                    }
                } else {
                    // Update failed test result
                    switch (providerType) {
                        case 'openai':
                            this.plugin.settings.openaiSettings.lastTestResult = {
                                timestamp: Date.now(),
                                success: false,
                                message: result.message
                            };
                            break;
                        case 'anthropic':
                            this.plugin.settings.anthropicSettings.lastTestResult = {
                                timestamp: Date.now(),
                                success: false,
                                message: result.message
                            };
                            break;
                        case 'gemini':
                            this.plugin.settings.geminiSettings.lastTestResult = {
                                timestamp: Date.now(),
                                success: false,
                                message: result.message
                            };
                            break;
                        case 'ollama':
                            this.plugin.settings.ollamaSettings.lastTestResult = {
                                timestamp: Date.now(),
                                success: false,
                                message: result.message
                            };
                            break;
                    }
                }
            } catch (error) {
                console.warn(`Failed to test ${providerType} connection:`, error);
            }
        }

        // Update the unified available models
        this.plugin.settings.availableModels = await getAllAvailableModels(this.plugin.settings);
        await this.plugin.saveSettings();
        
        // Refresh the view to show updated models
        this.onOpen();
    }    /**
     * Renders OpenAI configuration section
     */
    private renderOpenAIConfig(containerEl: HTMLElement) {
        // Create collapsible container
        // const collapsibleContainer = containerEl.createEl('div', { cls: 'provider-collapsible' }); // Handled by CollapsibleSectionRenderer
        const providerKey = 'OpenAI Configuration'; // Use the title as the key

        CollapsibleSectionRenderer.createCollapsibleSection(containerEl, providerKey, (openaiContainer: HTMLElement) => {
            // openaiContainer.style.display = 'none'; // Handled by CollapsibleSectionRenderer
            openaiContainer.style.paddingLeft = '16px';

            // Show current API key status
            const apiKeyStatus = this.plugin.settings.openaiSettings.apiKey ? 
                `API Key: ${this.plugin.settings.openaiSettings.apiKey.substring(0, 8)}...` : 
                'No API Key configured';
            openaiContainer.createEl('div', { 
                cls: 'setting-item-description',
                text: `${apiKeyStatus} (Configure in main plugin settings)`
            });
    
            this.renderProviderStatus(openaiContainer, this.plugin.settings.openaiSettings, 'OpenAI');
        }, this.plugin, 'providerConfigExpanded');
    }

    /**
     * Renders Anthropic configuration section
     */
    private renderAnthropicConfig(containerEl: HTMLElement) {
        const providerKey = 'Anthropic Configuration'; // Use the title as the key

        CollapsibleSectionRenderer.createCollapsibleSection(containerEl, providerKey, (anthropicContainer: HTMLElement) => {
            anthropicContainer.style.paddingLeft = '16px';

            // Show current API key status
            const apiKeyStatus = this.plugin.settings.anthropicSettings.apiKey ? 
                `API Key: ${this.plugin.settings.anthropicSettings.apiKey.substring(0, 8)}...` : 
                'No API Key configured';
            anthropicContainer.createEl('div', { 
                cls: 'setting-item-description',
                text: `${apiKeyStatus} (Configure in main plugin settings)`
            });
    
            this.renderProviderStatus(anthropicContainer, this.plugin.settings.anthropicSettings, 'Anthropic');
        }, this.plugin, 'providerConfigExpanded');
    }

    /**
     * Renders Gemini configuration section
     */
    private renderGeminiConfig(containerEl: HTMLElement) {
        const providerKey = 'Google Gemini Configuration'; // Use the title as the key

        CollapsibleSectionRenderer.createCollapsibleSection(containerEl, providerKey, (geminiContainer: HTMLElement) => {
            geminiContainer.style.paddingLeft = '16px';

            // Show current API key status
            const apiKeyStatus = this.plugin.settings.geminiSettings.apiKey ? 
                `API Key: ${this.plugin.settings.geminiSettings.apiKey.substring(0, 8)}...` : 
                'No API Key configured';
            geminiContainer.createEl('div', { 
                cls: 'setting-item-description',
                text: `${apiKeyStatus} (Configure in main plugin settings)`
            });
    
            this.renderProviderStatus(geminiContainer, this.plugin.settings.geminiSettings, 'Gemini');
        }, this.plugin, 'providerConfigExpanded');
    }

    /**
     * Renders Ollama configuration section
     */
    private renderOllamaConfig(containerEl: HTMLElement) {
        const providerKey = 'Ollama Configuration'; // Use the title as the key

        CollapsibleSectionRenderer.createCollapsibleSection(containerEl, providerKey, (ollamaContainer: HTMLElement) => {
            ollamaContainer.style.paddingLeft = '16px';

            // Show current server URL status
            const serverStatus = this.plugin.settings.ollamaSettings.serverUrl ? 
                `Server URL: ${this.plugin.settings.ollamaSettings.serverUrl}` : 
                'No Server URL configured';
            ollamaContainer.createEl('div', { 
                cls: 'setting-item-description',
                text: `${serverStatus} (Configure in main plugin settings)`
            });
    
            this.renderProviderStatus(ollamaContainer, this.plugin.settings.ollamaSettings, 'Ollama');
    
            // Add help text for Ollama setup
            const helpContainer = ollamaContainer.createEl('div', { cls: 'setting-item-description' });
            helpContainer.createEl('p', { text: 'To use Ollama:' });
            const steps = helpContainer.createEl('ol');
            steps.createEl('li', { text: 'Install Ollama from https://ollama.ai' });
            steps.createEl('li', { text: 'Start the Ollama server' });
            steps.createEl('li', { text: 'Pull models using "ollama pull model-name"' });
            steps.createEl('li', { text: 'Click "Refresh Models" above to see available models' });
        }, this.plugin, 'providerConfigExpanded');
    }

    /**
     * Renders provider status information
     */
    private renderProviderStatus(containerEl: HTMLElement, settings: any, providerName: string) {
        if (settings.lastTestResult) {
            const date = new Date(settings.lastTestResult.timestamp);
            const statusEl = containerEl.createEl('div', {
                text: `Last test: ${date.toLocaleString()} - ${settings.lastTestResult.message}`,
                cls: settings.lastTestResult.success ? 'mod-success' : 'mod-warning'
            });
            
            if (settings.lastTestResult.success && settings.availableModels && settings.availableModels.length > 0) {
                statusEl.createEl('br');
                statusEl.createSpan({ 
                    text: `Available models: ${settings.availableModels.length}`,
                    cls: 'setting-item-description'
                });
            }
        } else {
            containerEl.createEl('div', {
                text: `${providerName} not tested yet. Click "Refresh Models" above to test connection.`,
                cls: 'setting-item-description'
            });
        }
    }

    async onClose() {
        this.plugin.offSettingsChange(this._onSettingsChange);
        // Clean up any resources if needed
    }

}
