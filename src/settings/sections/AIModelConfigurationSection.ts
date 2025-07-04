import { App, Setting, Notice } from 'obsidian';
import MyPlugin from '../../main';
import { SettingCreators } from '../components/SettingCreators';
import { CollapsibleSectionRenderer } from '../../components/chat/CollapsibleSection';
import { AIDispatcher } from '../../utils/aiDispatcher';

/**
 * AIModelConfigurationSection is responsible for rendering the settings related to AI model configuration.
 * This includes API key settings for various providers, default model settings, and model management.
 */
export class AIModelConfigurationSection {
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
     * Renders the AI Model Configuration section into the provided container element.
     * @param containerEl The HTML element to render the section into.
     */
    async render(containerEl: HTMLElement): Promise<void> {
        // Section for API Keys & Providers
        containerEl.createEl('h3', { text: 'API Keys & Providers' });
        
        // OpenAI Configuration Section
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

        // Anthropic Configuration Section
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

        // Google Gemini Configuration Section
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

        // Ollama Configuration Section
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

        // Default AI Model Settings Section
        containerEl.createEl('h3', { text: 'Default AI Model Settings' });
        
        await this.renderAIModelSettings(containerEl);
        
        // Model Management Section
        containerEl.createEl('h3', { text: 'Model Management' });
        
        // Available Models Subsection
        containerEl.createEl('h4', { text: 'Available Models' });
        await this.renderAvailableModelsSection(containerEl);
        
        // Model Setting Presets Subsection
        containerEl.createEl('h4', { text: 'Model Setting Presets' });
        this.renderModelSettingPresets(containerEl);
    }

    /**
     * Renders the provider connection test section.
     * Allows users to test their API key and fetch available models for a given provider.
     * @param containerEl The HTML element to append the section to.
     * @param provider The ID of the provider (e.g., 'openai', 'anthropic').
     * @param displayName The display name of the provider (e.g., 'OpenAI', 'Anthropic').
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
                        // Use dispatcher for connection testing
                        const aiDispatcher = new AIDispatcher(this.plugin.app.vault, this.plugin);
                        const result = await aiDispatcher.testConnection(provider);
                        
                        if (result.success && result.models) {
                            settings.availableModels = result.models;
                            settings.lastTestResult = {
                                timestamp: Date.now(),
                                success: true,
                                message: result.message
                            };
                            await this.plugin.saveSettings();
                            
                            // Refresh all available models after a successful test
                            this.plugin.settings.availableModels = await aiDispatcher.getAllUnifiedModels();
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
     * Renders the AI Model Settings section.
     * This includes system message, streaming, temperature, and model selection.
     * @param containerEl The HTML element to append the section to.
     */
    async renderAIModelSettings(containerEl: HTMLElement): Promise<void> {
        // Render quick preset buttons if presets exist
        if (this.plugin.settings.modelSettingPresets && this.plugin.settings.modelSettingPresets.length > 0) {
            const presetContainer = containerEl.createDiv();
            presetContainer.addClass('model-preset-buttons');
            presetContainer.createEl('div', { text: 'Quick Presets:', cls: 'setting-item-name' });
            this.plugin.settings.modelSettingPresets.forEach((preset, idx) => {
                const btn = presetContainer.createEl('button', { text: preset.name });
                btn.style.marginRight = '0.5em';
                btn.onclick = async () => {
                    // Apply preset settings
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

        // System Message Setting
        new Setting(containerEl)
            .setName('System Message')
            .setDesc('Set the system message for the AI')
            .addTextArea(text => {
                text.setPlaceholder('You are a helpful assistant.')
                    .setValue(this.plugin.settings.systemMessage)
                    .onChange((value) => {
                        // Update setting immediately on change
                        this.plugin.settings.systemMessage = value;
                    });
                
                // Save settings on blur to prevent frequent saves during typing
                text.inputEl.addEventListener('blur', async () => {
                    await this.plugin.saveSettings();
                });
                
                return text;
            });

        // Enable Streaming Toggle
        new Setting(containerEl)
            .setName('Enable Streaming')
            .setDesc('Enable or disable streaming for completions')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableStreaming)
                .onChange(async (value) => {
                    this.plugin.settings.enableStreaming = value;
                    await this.plugin.saveSettings();
                }));

        // Temperature Slider
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

        // Refresh Available Models Button
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

        // Render unified model dropdown
        await this.renderUnifiedModelDropdown(containerEl);
    }

    /**
     * Renders the unified model selection dropdown.
     * This dropdown allows users to select from all available models across all configured providers.
     * @param containerEl The HTML element to append the dropdown to.
     */
    private async renderUnifiedModelDropdown(containerEl: HTMLElement): Promise<void> {
        // Ensure available models are loaded
        if (!this.plugin.settings.availableModels || this.plugin.settings.availableModels.length === 0) {
            const aiDispatcher = new AIDispatcher(this.plugin.app.vault, this.plugin);
            this.plugin.settings.availableModels = await aiDispatcher.getAllUnifiedModels();
            await this.plugin.saveSettings();
        }

        new Setting(containerEl)
            .setName('Selected Model')
            .setDesc('Choose from all available models across all configured providers')
            .addDropdown(dropdown => {
                // Populate dropdown options
                if (!this.plugin.settings.availableModels || this.plugin.settings.availableModels.length === 0) {
                    dropdown.addOption('', 'No models available - configure providers above');
                } else {
                    dropdown.addOption('', 'Select a model...');
                    
                    const modelsByProvider: Record<string, any[]> = {};
                    
                    // Filter and group models by provider
                    const enabledModels = this.plugin.settings.enabledModels || {};
                    const filteredModels = this.plugin.settings.availableModels.filter(model => enabledModels[model.id] !== false);
                    filteredModels.forEach(model => {
                        if (!modelsByProvider[model.provider]) {
                            modelsByProvider[model.provider] = [];
                        }
                        modelsByProvider[model.provider].push(model);
                    });
                    
                    // Add options to dropdown, grouped by provider
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
                        
                        // Update the active provider based on the selected model
                        if (value) {
                            // Extract provider from unified model ID
                            const [provider] = value.split(':', 2);
                            this.plugin.settings.provider = provider as any;
                        }
                        await this.plugin.saveSettings();
                    });
            });
        
        // Display currently selected model info
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
     * Refreshes available models from all configured providers using the dispatcher.
     * This function uses the dispatcher to refresh models from all providers.
     */
    private async refreshAllAvailableModels(): Promise<void> {
        const aiDispatcher = new AIDispatcher(this.plugin.app.vault, this.plugin);
        
        try {
            // Use dispatcher to refresh all provider models
            await aiDispatcher.refreshAllProviderModels();
            this.plugin.settings.availableModels = await aiDispatcher.getAllUnifiedModels();
            await this.plugin.saveSettings();
        } catch (error) {
            console.error('Error refreshing all available models:', error);
        }
    }

    /**
     * Renders the Available Models section in the Model Management settings.
     * This section displays all models available from configured providers and allows
     * enabling/disabling models and deleting local copies of models.
     * @param containerEl The HTML element to append the section to.
     */
    private async renderAvailableModelsSection(containerEl: HTMLElement): Promise<void> {
        const availableModels = this.plugin.settings.availableModels || [];
        
        if (availableModels.length === 0) {
            containerEl.createEl('div', { text: 'No models available. Configure providers and refresh to load models.', cls: 'setting-item-description' });
            return;
        }
        
        // Create a table to display models
        const table = containerEl.createEl('table');
        const thead = table.createEl('thead');
        const tbody = table.createEl('tbody');
        
        // Header row
        const headerRow = thead.createEl('tr');
        headerRow.createEl('th', { text: 'Model' });
        headerRow.createEl('th', { text: 'Provider' });
        headerRow.createEl('th', { text: 'Enabled' });
        headerRow.createEl('th', { text: 'Actions' });
        
        // Data rows
        for (const model of availableModels) {
            const row = tbody.createEl('tr');
            row.createEl('td', { text: model.name });
            row.createEl('td', { text: model.provider });
            
            // Enabled/Disabled toggle
            const enabledToggle = new Setting(row.createEl('td'))
                .setName('')
                .setDesc('Enable or disable this model')
                .addToggle(toggle => toggle
                    .setValue(this.plugin.settings.enabledModels?.[model.id] !== false)
                    .onChange(async (value) => {
                        // Update enabledModels setting
                        const enabledModels = this.plugin.settings.enabledModels || {};
                        enabledModels[model.id] = value ? true : false;
                        this.plugin.settings.enabledModels = enabledModels;
                        await this.plugin.saveSettings();
                    }));
            
            // Actions column
            const actionsCell = row.createEl('td');
            
            // Delete action
            new Setting(actionsCell)
                .setName('')
                .setDesc('Delete local copy of this model')
                .addButton(button => button
                    .setButtonText('Delete')
                    .setWarning()
                    .onClick(async () => {
                        const confirmed = confirm(`Are you sure you want to delete the local copy of the model "${model.name}"?`);
                        if (confirmed) {
                            try {
                                // Delete the model file from the filesystem
                                await this.plugin.app.vault.adapter.remove(`ai-models/${model.id}.json`);
                                
                                // Refresh available models after deletion
                                const aiDispatcher = new AIDispatcher(this.plugin.app.vault, this.plugin);
                                this.plugin.settings.availableModels = await aiDispatcher.getAllUnifiedModels();
                                await this.plugin.saveSettings();
                                
                                new Notice(`Deleted model "${model.name}"`);
                                
                                // Re-render the section to reflect changes
                                containerEl.empty();
                                await this.renderAvailableModelsSection(containerEl);
                            } catch (error) {
                                new Notice(`Error deleting model: ${error.message}`);
                            }
                        }
                    }))
                .addButton(button => button
                    .setButtonText('Re-download')
                    .onClick(async () => {
                        const confirmed = confirm(`Are you sure you want to re-download the model "${model.name}"?`);
                        if (confirmed) {
                            try {
                                // TODO: Implement model re-download logic
                                new Notice(`Re-download feature is not yet implemented. Please pull the model again using the provider settings.`);
                            } catch (error) {
                                new Notice(`Error re-downloading model: ${error.message}`);
                            }
                        }
                    }));
        }
    }

    /**
     * Renders the Model Setting Presets section.
     * This section allows users to create, edit, and delete model setting presets.
     * @param containerEl The HTML element to append the section to.
     */
    private renderModelSettingPresets(containerEl: HTMLElement): void {
        containerEl.createEl('div', {
            text: 'Presets let you save and quickly apply common model settings (model, temperature, system message, etc). You can add, edit, or remove presets here. In the AI Model Settings panel, you will see buttons for each preset above the model selection. Clicking a preset button will instantly apply those settings. This is useful for switching between different model configurations with one click.',
            cls: 'setting-item-description',
            attr: { style: 'margin-bottom: 0.5em;' }
        });

        const presetList = this.plugin.settings.modelSettingPresets || [];
        presetList.forEach((preset, idx) => {
            // Preset Name Setting
            new Setting(containerEl)
                .setName('Preset Name')
                .setDesc('Edit the name of this preset')
                .addText(text => {
                    text.setPlaceholder('Preset Name')
                        .setValue(preset.name)
                        .onChange((value) => {
                            // Update preset name immediately on change
                            preset.name = value ?? '';
                        });
                    
                    // Save settings on blur
                    text.inputEl.addEventListener('blur', async () => {
                        await this.plugin.saveSettings();
                    });
                });

            // Model ID Setting
            new Setting(containerEl)
                .setName('Model ID (provider:model)')
                .setDesc('Edit the model for this preset')
                .addText(text => {
                    text.setPlaceholder('Model ID (provider:model)')
                        .setValue(preset.selectedModel || '')
                        .onChange((value) => {
                            // Update selected model immediately on change
                            preset.selectedModel = value ?? '';
                        });
                    
                    // Save settings on blur
                    text.inputEl.addEventListener('blur', async () => {
                        await this.plugin.saveSettings();
                    });
                });

            // System Message Setting for Preset
            new Setting(containerEl)
                .setName('System Message')
                .setDesc('Edit the system message for this preset')
                .addTextArea(text => {
                    text.setPlaceholder('System message')
                        .setValue(preset.systemMessage || '')
                        .onChange((value) => {
                            // Update system message immediately on change
                            preset.systemMessage = value ?? '';
                        });
                    
                    // Save settings on blur
                    text.inputEl.addEventListener('blur', async () => {
                        await this.plugin.saveSettings();
                    });
                });

            // Temperature Setting for Preset
            this.settingCreators.createSliderSetting(containerEl, 'Temperature', '', { min: 0, max: 1, step: 0.1 }, () => preset.temperature ?? 0.7, async (value) => {
                preset.temperature = value;
                await this.plugin.saveSettings();
            });

            // Max Tokens Setting for Preset
            new Setting(containerEl)
                .setName('Max Tokens')
                .setDesc('Edit the max tokens for this preset')
                .addText(text => {
                    text.setPlaceholder('Max tokens')
                        .setValue(preset.maxTokens?.toString() || '')
                        .onChange((value) => {
                            // Parse and update max tokens immediately on change
                            const num = parseInt(value ?? '', 10);
                            preset.maxTokens = isNaN(num) ? undefined : num;
                        });
                    
                    // Save settings on blur
                    text.inputEl.addEventListener('blur', async () => {
                        await this.plugin.saveSettings();
                    });
                });

            // Enable Streaming Toggle for Preset
            this.settingCreators.createToggleSetting(containerEl, 'Enable Streaming', '', () => preset.enableStreaming ?? true, async (value) => {
                preset.enableStreaming = value;
                await this.plugin.saveSettings();
            });

            // Delete Preset Button
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

        // Add Preset Button
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
