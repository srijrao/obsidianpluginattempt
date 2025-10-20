import { App, Setting, Notice } from 'obsidian';
import MyPlugin from '../../main';
import { SettingCreators } from '../components/SettingCreators';
import { CollapsibleSectionRenderer } from '../../utils/CollapsibleSection'; 

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
     * Renders the Model Management sections (Model Setting Presets) into the provided container element.
     * @param containerEl The HTML element to render the sections into.
     */
    async render(containerEl: HTMLElement): Promise<void> {
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
        CollapsibleSectionRenderer.createCollapsibleSection(
            containerEl,
            'Model Setting Presets',
            (sectionEl: HTMLElement) => {
                sectionEl.createEl('div', {
                    text: 'Presets let you save and quickly apply common model settings (model, temperature, system message, etc). You can add, edit, or remove presets here. In the AI Model Settings panel, you will see buttons for each preset above the model selection. Clicking a preset button will instantly apply those settings. This is useful for switching between different model configurations with one click.',
                    cls: 'setting-item-description',
                    attr: { style: 'margin-bottom: 0.5em;' }
                });

                const presetList = this.plugin.settings.modelSettingPresets || [];
                presetList.forEach((preset, idx) => {
                    // Preset Name Setting
                    new Setting(sectionEl)
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
                    new Setting(sectionEl)
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
                    new Setting(sectionEl)
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
                    this.settingCreators.createSliderSetting(sectionEl, 'Temperature', '', { min: 0, max: 1, step: 0.1 }, () => preset.temperature ?? 0.7, async (value) => {
                        preset.temperature = value;
                        await this.plugin.saveSettings();
                    });

                    // Enable Streaming Toggle for Preset
                    this.settingCreators.createToggleSetting(sectionEl, 'Enable Streaming', '', () => preset.enableStreaming ?? true, async (value) => {
                        preset.enableStreaming = value;
                        await this.plugin.saveSettings();
                    });

                    // Delete Preset Button
                    new Setting(sectionEl)
                        .addExtraButton(btn => btn
                            .setIcon('cross')
                            .setTooltip('Delete')
                            .onClick(async () => {
                                this.plugin.settings.modelSettingPresets?.splice(idx, 1);
                                await this.plugin.saveSettings();
                                // Re-render the section to reflect changes
                                this.renderModelSettingPresets(containerEl);
                            })
                        );
                });

                // Add Preset Button
                new Setting(sectionEl)
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
                                enableStreaming: this.plugin.settings.enableStreaming
                            })));
                            await this.plugin.saveSettings();
                            // Re-render the section to reflect changes
                            this.renderModelSettingPresets(containerEl);
                        })
                    );
            },
            this.plugin,
            'generalSectionsExpanded'
        );
    }
}
