import { App, Setting, Notice } from 'obsidian';
import MyPlugin from '../../main';
import { SettingCreators } from '../components/SettingCreators';
import { CollapsibleSectionRenderer } from '../../components/chat/CollapsibleSection';
import { getAllAvailableModels, createProvider, getProviderFromUnifiedModel } from '../../../providers';

export class AIModelConfigurationSection {
    private plugin: MyPlugin;
    private settingCreators: SettingCreators;

    constructor(plugin: MyPlugin, settingCreators: SettingCreators) {
        this.plugin = plugin;
        this.settingCreators = settingCreators;
    }

    async render(containerEl: HTMLElement): Promise<void> {
        // API Keys & Providers section - each provider as collapsible sub-section
        containerEl.createEl('h3', { text: 'API Keys & Providers' });
        
        // OpenAI Provider
        CollapsibleSectionRenderer.createCollapsibleSection(
            containerEl,
            'OpenAI Configuration',
            async (sectionEl: HTMLElement) => {
                this.settingCreators.createTextSetting(
                    sectionEl, 
                    'OpenAI API Key', 
                    'Enter your OpenAI API key', 
                    'Enter your API key',
                    () => this.plugin.settings.openaiSettings.apiKey,
                    async (value) => { 
                        this.plugin.settings.openaiSettings.apiKey = value ?? ''; 
                        await this.plugin.saveSettings(); 
                    }
                );
                
                this.settingCreators.createTextSetting(
                    sectionEl, 
                    'OpenAI Base URL', 
                    'Custom base URL for OpenAI API (optional, leave empty for default)', 
                    'https://api.openai.com/v1',
                    () => this.plugin.settings.openaiSettings.baseUrl || '',
                    async (value) => { 
                        this.plugin.settings.openaiSettings.baseUrl = value; 
                        await this.plugin.saveSettings(); 
                    },
                    { trim: true, undefinedIfEmpty: true }
                );
                
                this.renderProviderTestSection(sectionEl, 'openai', 'OpenAI');
            },
            this.plugin,
            'providerConfigExpanded'
        );

        // Anthropic Provider
        CollapsibleSectionRenderer.createCollapsibleSection(
            containerEl,
            'Anthropic Configuration',
            async (sectionEl: HTMLElement) => {
                this.settingCreators.createTextSetting(
                    sectionEl, 
                    'Anthropic API Key', 
                    'Enter your Anthropic API key', 
                    'Enter your API key',
                    () => this.plugin.settings.anthropicSettings.apiKey,
                    async (value) => { 
                        this.plugin.settings.anthropicSettings.apiKey = value ?? ''; 
                        await this.plugin.saveSettings(); 
                    }
                );
                
                this.renderProviderTestSection(sectionEl, 'anthropic', 'Anthropic');
            },
            this.plugin,
            'providerConfigExpanded'
        );

        // Google Gemini Provider
        CollapsibleSectionRenderer.createCollapsibleSection(
            containerEl,
            'Google Gemini Configuration',
            async (sectionEl: HTMLElement) => {
                this.settingCreators.createTextSetting(
                    sectionEl, 
                    'Google API Key', 
                    'Enter your Google API key', 
                    'Enter your API key',
                    () => this.plugin.settings.geminiSettings.apiKey,
                    async (value) => { 
                        this.plugin.settings.geminiSettings.apiKey = value ?? ''; 
                        await this.plugin.saveSettings(); 
                    }
                );
                
                this.renderProviderTestSection(sectionEl, 'gemini', 'Google Gemini');
            },
            this.plugin,
            'providerConfigExpanded'
        );

        // Ollama Provider
        CollapsibleSectionRenderer.createCollapsibleSection(
            containerEl,
            'Ollama Configuration',
            async (sectionEl: HTMLElement) => {
                this.settingCreators.createTextSetting(
                    sectionEl, 
                    'Ollama Server URL', 
                    'Enter your Ollama server URL (default: http://localhost:11434)', 
                    'http://localhost:11434',
                    () => this.plugin.settings.ollamaSettings.serverUrl,
                    async (value) => { 
                        this.plugin.settings.ollamaSettings.serverUrl = value ?? ''; 
                        await this.plugin.saveSettings(); 
                    }
                );
                
                sectionEl.createEl('div', {
                    cls: 'setting-item-description',
                    text: 'To use Ollama:'
                });
                const steps = sectionEl.createEl('ol');
                steps.createEl('li', { text: 'Install Ollama from https://ollama.ai' });
                steps.createEl('li', { text: 'Start the Ollama server' });
                steps.createEl('li', { text: 'Pull models using "ollama pull model-name"' });
                steps.createEl('li', { text: 'Test connection to see available models' });
                
                this.renderProviderTestSection(sectionEl, 'ollama', 'Ollama');
            },
            this.plugin,
            'providerConfigExpanded'
        );

        // Default AI Model Settings section
        containerEl.createEl('h3', { text: 'Default AI Model Settings' });
        
        await this.renderAIModelSettings(containerEl);
        
        // Model Management section
        containerEl.createEl('h3', { text: 'Model Management' });
        
        // Available Models subsection
        containerEl.createEl('h4', { text: 'Available Models' });
        await this.renderAvailableModelsSection(containerEl);
        
        // Model Setting Presets subsection
        containerEl.createEl('h4', { text: 'Model Setting Presets' });
        this.renderModelSettingPresets(containerEl);
    }

    /**
     * Renders the provider connection test section.
     */
    private renderProviderTestSection(containerEl: HTMLElement, provider: 'openai' | 'anthropic' | 'gemini' | 'ollama', displayName: string): void {
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
                        this.plugin.settings.provider = provider;
                        
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
                text: `Available models: ${settings.availableModels.map((m: any) => m.name || m.id).join(', ')}`,
                cls: 'setting-item-description'
            });
        }
    }

    /**
     * AI Model Settings Section
     */
    async renderAIModelSettings(containerEl: HTMLElement): Promise<void> {
        // --- Model Setting Presets UI ---
        if (this.plugin.settings.modelSettingPresets && this.plugin.settings.modelSettingPresets.length > 0) {
            const presetContainer = containerEl.createDiv();
            presetContainer.addClass('model-preset-buttons');
            presetContainer.createEl('div', { text: 'Quick Presets:', cls: 'setting-item-name' });
            this.plugin.settings.modelSettingPresets.forEach((preset, idx) => {
                const btn = presetContainer.createEl('button', { text: preset.name });
                btn.style.marginRight = '0.5em';
                btn.onclick = async () => {
                    // Apply preset fields to current settings
                    if (preset.selectedModel !== undefined) this.plugin.settings.selectedModel = preset.selectedModel;
                    if (preset.systemMessage !== undefined) this.plugin.settings.systemMessage = preset.systemMessage;
                    if (preset.temperature !== undefined) this.plugin.settings.temperature = preset.temperature;
                    if (preset.maxTokens !== undefined) this.plugin.settings.maxTokens = preset.maxTokens;
                    if (preset.enableStreaming !== undefined) this.plugin.settings.enableStreaming = preset.enableStreaming;
                    await this.plugin.saveSettings();
                    new Notice(`Applied preset: ${preset.name}`);
                };
            });
        }

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
                    dropdown.addOption('', 'No models available - configure providers above');
                } else {
                    dropdown.addOption('', 'Select a model...');
                    // Group models by provider for better organization
                    const modelsByProvider: Record<string, any[]> = {};
                    // Filter models by enabledModels
                    const enabledModels = this.plugin.settings.enabledModels || {};
                    const filteredModels = this.plugin.settings.availableModels.filter(model => enabledModels[model.id] !== false);
                    filteredModels.forEach(model => {
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

        for (const providerType of providers) {
            try {
                const originalProvider = this.plugin.settings.provider;
                this.plugin.settings.provider = providerType; // Temporarily set provider to test connection

                const providerInstance = createProvider(this.plugin.settings);
                const result = await providerInstance.testConnection();

                this.plugin.settings.provider = originalProvider; // Restore original provider

                const providerSettings = this.plugin.settings[`${providerType}Settings` as keyof typeof this.plugin.settings] as any;

                if (result.success && result.models) {
                    providerSettings.availableModels = result.models;
                    providerSettings.lastTestResult = {
                        timestamp: Date.now(),
                        success: true,
                        message: result.message
                    };
                } else {
                    providerSettings.lastTestResult = {
                        timestamp: Date.now(),
                        success: false,
                        message: result.message
                    };
                }
            } catch (error) {
                console.error(`Error testing ${providerType}:`, error);
            }
        }

        this.plugin.settings.availableModels = await getAllAvailableModels(this.plugin.settings);
        await this.plugin.saveSettings();
    }

    /**
     * Renders the Available Models section with checkboxes for each model.
     */
    private async renderAvailableModelsSection(containerEl: HTMLElement): Promise<void> {
        containerEl.createEl('div', {
            text: 'Choose which models are available in model selection menus throughout the plugin.',
            cls: 'setting-item-description',
            attr: { style: 'margin-bottom: 1em;' }
        });

        // Add a refresh button and all-on/all-off buttons
        const buttonRow = containerEl.createDiv({ cls: 'ai-models-button-row' });
        new Setting(buttonRow)
            .addButton(btn => {
                btn.setButtonText('Refresh Models')
                    .setCta()
                    .onClick(async () => {
                        btn.setButtonText('Refreshing...');
                        btn.setDisabled(true);
                        try {
                            this.plugin.settings.availableModels = await getAllAvailableModels(this.plugin.settings);
                            await this.plugin.saveSettings();
                            new Notice('Available models refreshed.');
                        } catch (e) {
                            new Notice('Error refreshing models: ' + (e?.message || e));
                        } finally {
                            btn.setButtonText('Refresh Models');
                            btn.setDisabled(false);
                        }
                    });
            })
            .addButton(btn => {
                btn.setButtonText('All On')
                    .onClick(async () => {
                        let allModels = this.plugin.settings.availableModels || [];
                        if (allModels.length === 0) {
                            allModels = await getAllAvailableModels(this.plugin.settings);
                        }
                        if (!this.plugin.settings.enabledModels) this.plugin.settings.enabledModels = {};
                        allModels.forEach(model => {
                            this.plugin.settings.enabledModels![model.id] = true;
                        });
                        await this.plugin.saveSettings();
                    });
            })
            .addButton(btn => {
                btn.setButtonText('All Off')
                    .onClick(async () => {
                        let allModels = this.plugin.settings.availableModels || [];
                        if (allModels.length === 0) {
                            allModels = await getAllAvailableModels(this.plugin.settings);
                        }
                        if (!this.plugin.settings.enabledModels) this.plugin.settings.enabledModels = {};
                        allModels.forEach(model => {
                            this.plugin.settings.enabledModels![model.id] = false;
                        });
                        await this.plugin.saveSettings();
                    });
            });

        // Dynamically get all available models from settings (populated by providers)
        let allModels = this.plugin.settings.availableModels || [];
        // If not yet loaded, try to fetch them
        if (allModels.length === 0) {
            allModels = await getAllAvailableModels(this.plugin.settings);
        }

        if (!this.plugin.settings.enabledModels) this.plugin.settings.enabledModels = {};

        if (allModels.length === 0) {
            containerEl.createEl('div', { text: 'No models found. Please configure your providers and refresh available models.', cls: 'setting-item-description' });
        } else {
            // Sort models by provider, then alphabetically by name
            allModels = allModels.slice().sort((a, b) => {
                if (a.provider !== b.provider) {
                    return a.provider.localeCompare(b.provider);
                }
                return (a.name || a.id).localeCompare(b.name || b.id);
            });
            allModels.forEach(model => {
                this.settingCreators.createToggleSetting(
                    containerEl,
                    model.name || model.id,
                    `Enable or disable "${model.name || model.id}" (${model.id}) in model selection menus.`,
                    () => this.plugin.settings.enabledModels![model.id] !== false, // default to true
                    async (value) => {
                        this.plugin.settings.enabledModels![model.id] = value;
                        await this.plugin.saveSettings();
                    }
                );
            });
        }
    }

    /**
     * Renders the Model Setting Presets section.
     */
    private renderModelSettingPresets(containerEl: HTMLElement): void {
        containerEl.createEl('div', {
            text: 'Presets let you save and quickly apply common model settings (model, temperature, system message, etc). You can add, edit, or remove presets here. In the AI Model Settings panel, you will see buttons for each preset above the model selection. Clicking a preset button will instantly apply those settings. This is useful for switching between different model configurations with one click.',
            cls: 'setting-item-description',
            attr: { style: 'margin-bottom: 0.5em;' }
        });

        const presetList = this.plugin.settings.modelSettingPresets || [];
        presetList.forEach((preset, idx) => {
            // Preset Name
            new Setting(containerEl)
                .setName('Preset Name')
                .setDesc('Edit the name of this preset')
                .addText(text => {
                    text.setPlaceholder('Preset Name')
                        .setValue(preset.name)
                        .onChange(async (value) => {
                            preset.name = value ?? '';
                            await this.plugin.saveSettings();
                        });
                });

            // Model ID
            new Setting(containerEl)
                .setName('Model ID (provider:model)')
                .setDesc('Edit the model for this preset')
                .addText(text => {
                    text.setPlaceholder('Model ID (provider:model)')
                        .setValue(preset.selectedModel || '')
                        .onChange(async (value) => {
                            preset.selectedModel = value ?? '';
                            await this.plugin.saveSettings();
                        });
                });

            // System Message
            new Setting(containerEl)
                .setName('System Message')
                .setDesc('Edit the system message for this preset')
                .addTextArea(text => {
                    text.setPlaceholder('System message')
                        .setValue(preset.systemMessage || '')
                        .onChange(async (value) => {
                            preset.systemMessage = value ?? '';
                            await this.plugin.saveSettings();
                        });
                });

            // Temperature
            this.settingCreators.createSliderSetting(containerEl, 'Temperature', '', { min: 0, max: 1, step: 0.1 }, () => preset.temperature ?? 0.7, async (value) => {
                preset.temperature = value;
                await this.plugin.saveSettings();
            });

            // Max Tokens
            new Setting(containerEl)
                .setName('Max Tokens')
                .setDesc('Edit the max tokens for this preset')
                .addText(text => {
                    text.setPlaceholder('Max tokens')
                        .setValue(preset.maxTokens?.toString() || '')
                        .onChange(async (value) => {
                            const num = parseInt(value ?? '', 10);
                            preset.maxTokens = isNaN(num) ? undefined : num;
                            await this.plugin.saveSettings();
                        });
                });

            // Enable Streaming
            this.settingCreators.createToggleSetting(containerEl, 'Enable Streaming', '', () => preset.enableStreaming ?? true, async (value) => {
                preset.enableStreaming = value;
                await this.plugin.saveSettings();
            });

            // Delete button
            new Setting(containerEl)
                .addExtraButton(btn => btn
                    .setIcon('cross')
                    .setTooltip('Delete')
                    .onClick(async () => {
                        this.plugin.settings.modelSettingPresets?.splice(idx, 1);
                        await this.plugin.saveSettings();
                    })
                );
        });

        new Setting(containerEl)
            .addButton(btn => btn
                .setButtonText('Add Preset')
                .setCta()
                .onClick(async () => {
                    if (!this.plugin.settings.modelSettingPresets) this.plugin.settings.modelSettingPresets = [];
                    this.plugin.settings.modelSettingPresets.push(JSON.parse(JSON.stringify({
                        name: `Preset ${this.plugin.settings.modelSettingPresets.length + 1}`,
                        selectedModel: this.plugin.settings.selectedModel,
                        systemMessage: this.plugin.settings.systemMessage,
                        temperature: this.plugin.settings.temperature,
                        maxTokens: this.plugin.settings.maxTokens,
                        enableStreaming: this.plugin.settings.enableStreaming
                    })));
                    await this.plugin.saveSettings();
                })
            );
    }
}
