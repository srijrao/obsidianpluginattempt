import { App, Setting, Notice } from 'obsidian';
import MyPlugin from '../../main';
import { SettingCreators } from '../components/SettingCreators';
import { CollapsibleSectionRenderer } from '../../utils/CollapsibleSection';
import { getAllAvailableModels } from '../../../providers'; 

/**
 * ModelManagementSection is responsible for rendering settings related to AI model management.
 * This includes displaying available models, enabling/disabling them, and managing model setting presets.
 */
export class ModelManagementSection {
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
     * Renders the Model Management sections (Available Models and Model Setting Presets) into the provided container element.
     * @param containerEl The HTML element to render the sections into.
     */
    async render(containerEl: HTMLElement): Promise<void> {
        // Render the Available Models section
        await this.renderAvailableModelsSection(containerEl); 

        // Collapsible section for Model Setting Presets
        CollapsibleSectionRenderer.createCollapsibleSection(
            containerEl,
            'Model Setting Presets',
            async (sectionEl: HTMLElement) => {
                this.renderModelSettingPresets(sectionEl);
            },
            this.plugin,
            'generalSectionsExpanded'
        );
    }

    /**
     * Renders the Model Setting Presets section.
     * This section allows users to create, edit, and delete model setting presets.
     * @param containerEl The HTML element to append the section to.
     */
    private renderModelSettingPresets(containerEl: HTMLElement): void {
        containerEl.createEl('h3', { text: 'Model Setting Presets' });
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
                            // No need to save here, will save on blur
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
                        // Re-render the section to reflect changes
                        this.renderModelSettingPresets(containerEl.parentElement!);
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
                    // Re-render the section to reflect changes
                    this.renderModelSettingPresets(containerEl.parentElement!);
                })
            );
    }

    /**
     * Renders the Available Models section with checkboxes for each model.
     * This section allows users to enable or disable specific models from appearing in selection menus.
     * @param containerEl The HTML element to append the section to.
     */
    private async renderAvailableModelsSection(containerEl: HTMLElement): Promise<void> {
        CollapsibleSectionRenderer.createCollapsibleSection(
            containerEl,
            'Available Models',
            async (sectionEl: HTMLElement) => {
                sectionEl.createEl('div', {
                    text: 'Choose which models are available in model selection menus throughout the plugin.',
                    cls: 'setting-item-description',
                    attr: { style: 'margin-bottom: 1em;' }
                });

                // Buttons for refreshing models and toggling all models on/off
                const buttonRow = sectionEl.createDiv({ cls: 'ai-models-button-row' });
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
                                    // Re-render the section to reflect changes
                                    this.renderAvailableModelsSection(containerEl.parentElement!);
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
                                // Re-render the section to reflect changes
                                this.renderAvailableModelsSection(containerEl.parentElement!);
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
                                // Re-render the section to reflect changes
                                this.renderAvailableModelsSection(containerEl.parentElement!);
                            });
                    });

                // Get all available models, refreshing if necessary
                let allModels = this.plugin.settings.availableModels || [];
                
                if (allModels.length === 0) {
                    allModels = await getAllAvailableModels(this.plugin.settings);
                }

                if (!this.plugin.settings.enabledModels) this.plugin.settings.enabledModels = {};

                if (allModels.length === 0) {
                    sectionEl.createEl('div', { text: 'No models found. Please configure your providers and refresh available models.', cls: 'setting-item-description' });
                } else {
                    // Sort models by provider and then by name/id
                    allModels = allModels.slice().sort((a, b) => {
                        if (a.provider !== b.provider) {
                            return a.provider.localeCompare(b.provider);
                        }
                        return (a.name || a.id).localeCompare(b.name || b.id);
                    });
                    // Render a toggle for each model
                    allModels.forEach(model => {
                        this.settingCreators.createToggleSetting(
                            sectionEl,
                            model.name || model.id,
                            `Enable or disable "${model.name || model.id}" (${model.id}) in model selection menus.`,
                            () => this.plugin.settings.enabledModels![model.id] !== false, // Default to true if not explicitly false
                            async (value) => {
                                this.plugin.settings.enabledModels![model.id] = value;
                                await this.plugin.saveSettings();
                            }
                        );
                    });
                }
            },
            this.plugin,
            'generalSectionsExpanded'
        );
    }
}
