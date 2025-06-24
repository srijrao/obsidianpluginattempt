import { App, Setting, Notice } from 'obsidian';
import MyPlugin from '../../main';
import { SettingCreators } from '../components/SettingCreators';
import { CollapsibleSectionRenderer } from '../../components/chat/CollapsibleSection';
import { getAllAvailableModels } from '../../../providers'; // Adjust path as needed

export class ModelManagementSection {
    private plugin: MyPlugin;
    private settingCreators: SettingCreators;

    constructor(plugin: MyPlugin, settingCreators: SettingCreators) {
        this.plugin = plugin;
        this.settingCreators = settingCreators;
    }

    async render(containerEl: HTMLElement): Promise<void> {
        // Section 2: Model Management
        // This section will contain "Available Models" and "Model Setting Presets"
        // "Available Models" is already collapsible via its own render method.
        await this.renderAvailableModelsSection(containerEl); // Ensure its sectionKey is unique

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
                            // Re-render to update the command name
                            // This display() call needs to be handled by the main settings tab
                            // For now, we'll just save and let the user manually refresh if needed
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
                        // Re-render needs to be handled by the main settings tab
                        // For now, we'll just save and let the user manually refresh if needed
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
                    // Re-render needs to be handled by the main settings tab
                    // For now, we'll just save and let the user manually refresh if needed
                })
            );
    }

    /**
     * Renders the Available Models section with checkboxes for each model.
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

                // Add a refresh button and all-on/all-off buttons
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
                                    // Re-render needs to be handled by the main settings tab
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
                                // Re-render needs to be handled by the main settings tab
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
                                // Re-render needs to be handled by the main settings tab
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
                    sectionEl.createEl('div', { text: 'No models found. Please configure your providers and refresh available models.', cls: 'setting-item-description' });
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
                            sectionEl,
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
            },
            this.plugin,
            'generalSectionsExpanded'
        );
    }
}
