import { Setting, Notice } from 'obsidian';
import MyPlugin from '../../main';
import { createProvider, getAllAvailableModels, getProviderFromUnifiedModel } from '../../../providers';

/**
 * Shared settings sections that can be rendered in any modal or view
 * This ensures consistent UI across different interfaces
 */
export class SettingsSections {
    private plugin: MyPlugin;

    constructor(plugin: MyPlugin) {
        this.plugin = plugin;
    }

    /**
     * AI Model Settings Section
     */
    async renderAIModelSettings(containerEl: HTMLElement, onRefresh?: () => void): Promise<void> {
        new Setting(containerEl)
            .setName('System Message')
            .setDesc('Set the system message for the AI')
            .addTextArea(text => text
                .setPlaceholder('You are a helpful assistant.')
                .setValue(this.plugin.settings.systemMessage)
                .onChange(async (value) => {
                    this.plugin.settings.systemMessage = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Enable Streaming')
            .setDesc('Enable or disable streaming for completions')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableStreaming)
                .onChange(async (value) => {
                    this.plugin.settings.enableStreaming = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
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

        // Refresh available models button
        new Setting(containerEl)
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
                        if (onRefresh) onRefresh();
                    } catch (error) {
                        new Notice(`Error refreshing models: ${error.message}`);
                    } finally {
                        button.setButtonText('Refresh Models');
                        button.setDisabled(false);
                    }
                }));

        // Unified model selection dropdown
        await this.renderUnifiedModelDropdown(containerEl);
    }

    /**
     * Date Settings Section
     */
    renderDateSettings(containerEl: HTMLElement): void {
        new Setting(containerEl)
            .setName('Include Date with System Message')
            .setDesc('Add the current date to the system message')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.includeDateWithSystemMessage)
                .onChange(async (value) => {
                    this.plugin.settings.includeDateWithSystemMessage = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Include Time with System Message')
            .setDesc('Add the current time along with the date to the system message')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.includeTimeWithSystemMessage)
                .onChange(async (value) => {
                    this.plugin.settings.includeTimeWithSystemMessage = value;
                    await this.plugin.saveSettings();
                }));
    }

    /**
     * Note Reference Settings Section
     */
    renderNoteReferenceSettings(containerEl: HTMLElement): void {
        new Setting(containerEl)
            .setName('Enable Obsidian Links')
            .setDesc('Read Obsidian links in messages using [[filename]] syntax')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableObsidianLinks)
                .onChange(async (value) => {
                    this.plugin.settings.enableObsidianLinks = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Enable Context Notes')
            .setDesc('Attach specified note content to chat messages')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableContextNotes)
                .onChange(async (value) => {
                    this.plugin.settings.enableContextNotes = value;
                    await this.plugin.saveSettings();
                }));

        const contextNotesContainer = containerEl.createDiv('context-notes-container');
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
                text.inputEl.rows = 4;
                text.inputEl.style.width = '100%';
            });

        new Setting(containerEl)
            .setName('Expand Linked Notes Recursively')
            .setDesc('If enabled, when fetching a note, also fetch and expand links within that note recursively (prevents infinite loops).')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.expandLinkedNotesRecursively ?? false)
                .onChange(async (value) => {
                    this.plugin.settings.expandLinkedNotesRecursively = value;
                    await this.plugin.saveSettings();
                }));
    }


    /**
     * Provider Configuration Section
     */
    renderProviderConfiguration(containerEl: HTMLElement): void {
        containerEl.createEl('p', { 
            text: 'API keys are configured in the main plugin settings. Use the test buttons below to verify connections and refresh available models.',
            cls: 'setting-item-description'
        });
        
        // Render all provider configurations
        this.renderOpenAIConfig(containerEl);
        this.renderAnthropicConfig(containerEl);
        this.renderGeminiConfig(containerEl);
        this.renderOllamaConfig(containerEl);
    }

    /**
     * Renders the unified model selection dropdown
     */
    private async renderUnifiedModelDropdown(containerEl: HTMLElement): Promise<void> {
        // Ensure we have available models
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
    private async refreshAllAvailableModels(): Promise<void> {
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
                    // Update failed test results
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
                console.error(`Error testing ${providerType}:`, error);
            }
        }

        // Update unified available models
        this.plugin.settings.availableModels = await getAllAvailableModels(this.plugin.settings);
        await this.plugin.saveSettings();
    }

    private renderOpenAIConfig(containerEl: HTMLElement): void {
        // Create collapsible container
        const collapsibleContainer = containerEl.createEl('div', { cls: 'provider-collapsible' });
        
        // Create header that can be clicked to toggle
        const headerEl = collapsibleContainer.createEl('div', { 
            cls: 'provider-header',
            text: '▶ OpenAI Configuration'
        });
        headerEl.style.cursor = 'pointer';
        headerEl.style.userSelect = 'none';
        headerEl.style.padding = '8px 0';
        headerEl.style.fontWeight = 'bold';
        
        // Create content container (initially hidden)
        const contentEl = collapsibleContainer.createEl('div', { cls: 'provider-content' });
        contentEl.style.display = 'none';
        contentEl.style.paddingLeft = '16px';
        
        // Toggle functionality
        let isExpanded = false;
        headerEl.addEventListener('click', () => {
            isExpanded = !isExpanded;
            contentEl.style.display = isExpanded ? 'block' : 'none';
            headerEl.textContent = `${isExpanded ? '▼' : '▶'} OpenAI Configuration`;
        });
        
        // Show current API key status
        const apiKeyStatus = this.plugin.settings.openaiSettings.apiKey ? 
            `API Key: ${this.plugin.settings.openaiSettings.apiKey.substring(0, 8)}...` : 
            'No API Key configured';
        contentEl.createEl('div', { 
            cls: 'setting-item-description',
            text: `${apiKeyStatus} (Configure in main plugin settings)`
        });

        new Setting(contentEl)
            .setName('OpenAI Base URL')
            .setDesc('Custom base URL for OpenAI API (optional)')
            .addText(text => text
                .setPlaceholder('https://api.openai.com/v1')
                .setValue(this.plugin.settings.openaiSettings.baseUrl || '')
                .onChange(async (value) => {
                    this.plugin.settings.openaiSettings.baseUrl = value;
                    await this.plugin.saveSettings();
                }));

        this.renderProviderTestSection(contentEl, 'openai', 'OpenAI');
    }

    private renderAnthropicConfig(containerEl: HTMLElement): void {
        // Create collapsible container
        const collapsibleContainer = containerEl.createEl('div', { cls: 'provider-collapsible' });
        
        // Create header that can be clicked to toggle
        const headerEl = collapsibleContainer.createEl('div', { 
            cls: 'provider-header',
            text: '▶ Anthropic Configuration'
        });
        headerEl.style.cursor = 'pointer';
        headerEl.style.userSelect = 'none';
        headerEl.style.padding = '8px 0';
        headerEl.style.fontWeight = 'bold';
        
        // Create content container (initially hidden)
        const contentEl = collapsibleContainer.createEl('div', { cls: 'provider-content' });
        contentEl.style.display = 'none';
        contentEl.style.paddingLeft = '16px';
        
        // Toggle functionality
        let isExpanded = false;
        headerEl.addEventListener('click', () => {
            isExpanded = !isExpanded;
            contentEl.style.display = isExpanded ? 'block' : 'none';
            headerEl.textContent = `${isExpanded ? '▼' : '▶'} Anthropic Configuration`;
        });
        
        // Show current API key status
        const apiKeyStatus = this.plugin.settings.anthropicSettings.apiKey ? 
            `API Key: ${this.plugin.settings.anthropicSettings.apiKey.substring(0, 8)}...` : 
            'No API Key configured';
        contentEl.createEl('div', { 
            cls: 'setting-item-description',
            text: `${apiKeyStatus} (Configure in main plugin settings)`
        });

        this.renderProviderTestSection(contentEl, 'anthropic', 'Anthropic');
    }

    private renderGeminiConfig(containerEl: HTMLElement): void {
        // Create collapsible container
        const collapsibleContainer = containerEl.createEl('div', { cls: 'provider-collapsible' });
        
        // Create header that can be clicked to toggle
        const headerEl = collapsibleContainer.createEl('div', { 
            cls: 'provider-header',
            text: '▶ Gemini Configuration'
        });
        headerEl.style.cursor = 'pointer';
        headerEl.style.userSelect = 'none';
        headerEl.style.padding = '8px 0';
        headerEl.style.fontWeight = 'bold';
        
        // Create content container (initially hidden)
        const contentEl = collapsibleContainer.createEl('div', { cls: 'provider-content' });
        contentEl.style.display = 'none';
        contentEl.style.paddingLeft = '16px';
        
        // Toggle functionality
        let isExpanded = false;
        headerEl.addEventListener('click', () => {
            isExpanded = !isExpanded;
            contentEl.style.display = isExpanded ? 'block' : 'none';
            headerEl.textContent = `${isExpanded ? '▼' : '▶'} Gemini Configuration`;
        });
        
        // Show current API key status
        const apiKeyStatus = this.plugin.settings.geminiSettings.apiKey ? 
            `API Key: ${this.plugin.settings.geminiSettings.apiKey.substring(0, 8)}...` : 
            'No API Key configured';
        contentEl.createEl('div', { 
            cls: 'setting-item-description',
            text: `${apiKeyStatus} (Configure in main plugin settings)`
        });

        this.renderProviderTestSection(contentEl, 'gemini', 'Gemini');
    }

    private renderOllamaConfig(containerEl: HTMLElement): void {
        // Create collapsible container
        const collapsibleContainer = containerEl.createEl('div', { cls: 'provider-collapsible' });
        
        // Create header that can be clicked to toggle
        const headerEl = collapsibleContainer.createEl('div', { 
            cls: 'provider-header',
            text: '▶ Ollama Configuration'
        });
        headerEl.style.cursor = 'pointer';
        headerEl.style.userSelect = 'none';
        headerEl.style.padding = '8px 0';
        headerEl.style.fontWeight = 'bold';
        
        // Create content container (initially hidden)
        const contentEl = collapsibleContainer.createEl('div', { cls: 'provider-content' });
        contentEl.style.display = 'none';
        contentEl.style.paddingLeft = '16px';
        
        // Toggle functionality
        let isExpanded = false;
        headerEl.addEventListener('click', () => {
            isExpanded = !isExpanded;
            contentEl.style.display = isExpanded ? 'block' : 'none';
            headerEl.textContent = `${isExpanded ? '▼' : '▶'} Ollama Configuration`;
        });
        
        // Show current server URL status
        const serverStatus = this.plugin.settings.ollamaSettings.serverUrl ? 
            `Server URL: ${this.plugin.settings.ollamaSettings.serverUrl}` : 
            'No Server URL configured';
        contentEl.createEl('div', { 
            cls: 'setting-item-description',
            text: `${serverStatus} (Configure in main plugin settings)`
        });

        this.renderProviderTestSection(contentEl, 'ollama', 'Ollama');
        
        // Add help text for Ollama setup
        contentEl.createEl('div', {
            cls: 'setting-item-description',
            text: 'To use Ollama:'
        });
        const steps = contentEl.createEl('ol');
        steps.createEl('li', { text: 'Install Ollama from https://ollama.ai' });
        steps.createEl('li', { text: 'Start the Ollama server' });
        steps.createEl('li', { text: 'Pull models using "ollama pull model-name"' });
        steps.createEl('li', { text: 'Test connection to see available models' });
    }

    private renderProviderTestSection(containerEl: HTMLElement, provider: string, displayName: string): void {
        const settings = this.plugin.settings[`${provider}Settings` as keyof typeof this.plugin.settings] as any;
        
        new Setting(containerEl)
            .setName('Test Connection')
            .setDesc(`Verify your API key and fetch available models for ${displayName}`)
            .addButton(button => button
                .setButtonText('Test')
                .onClick(async () => {
                    button.setButtonText('Testing...');
                    button.setDisabled(true);
                    try {
                        // Temporarily set provider to test connection
                        const originalProvider = this.plugin.settings.provider;
                        this.plugin.settings.provider = provider as any;
                        
                        const providerInstance = createProvider(this.plugin.settings);
                        const result = await providerInstance.testConnection();
                        
                        // Restore original provider
                        this.plugin.settings.provider = originalProvider;
                        
                        if (result.success && result.models) {
                            settings.availableModels = result.models;
                            settings.lastTestResult = {
                                timestamp: Date.now(),
                                success: true,
                                message: result.message
                            };
                            await this.plugin.saveSettings();
                            
                            // Refresh unified models
                            this.plugin.settings.availableModels = await getAllAvailableModels(this.plugin.settings);
                            await this.plugin.saveSettings();
                            
                            new Notice(result.message);
                        } else {
                            settings.lastTestResult = {
                                timestamp: Date.now(),
                                success: false,
                                message: result.message
                            };
                            new Notice(result.message);
                        }
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

        if (settings.availableModels && settings.availableModels.length > 0) {
            containerEl.createEl('div', {
                text: `Available models: ${settings.availableModels.join(', ')}`,
                cls: 'setting-item-description'
            });
        }
    }
}
