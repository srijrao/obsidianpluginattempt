import { App, Setting, Notice } from 'obsidian';
import MyPlugin from '../../main';
import { SettingCreators } from '../components/SettingCreators';
import { CollapsibleSectionRenderer } from '../../utils/CollapsibleSection';
import { FuzzyModelDropdown } from '../../components/FuzzyModelDropdown';
import { ModelService } from '../../services/ModelService';
import type { ModelInfo } from '../../../providers/base';

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
        // Require modelSettingPresets to exist; tests expect an error when missing
        if (!this.plugin || !this.plugin.settings || typeof this.plugin.settings.modelSettingPresets === 'undefined') {
            throw new Error('Missing modelSettingPresets');
        }
        // Collapsible section for Model Setting Presets
        CollapsibleSectionRenderer.createCollapsibleSection(
            containerEl,
            'Model Setting Presets',
            async (sectionEl: HTMLElement) => {
                this.renderModelSettingPresetsContent(sectionEl);
            },
            this.plugin,
            'generalSectionsExpanded'
        );
    }

    /**
     * Renders the content of the Model Setting Presets section.
     * This section allows users to create, edit, and delete model setting presets.
     * @param containerEl The HTML element to append the section content to.
     */
    private renderModelSettingPresetsContent(containerEl: HTMLElement): void {
        const descEl = containerEl.createEl('div');
        descEl.setText('Presets let you save and quickly apply common model settings (model, temperature, system message, etc). Each preset is collapsible for easy organization. Click "Apply" to use a preset immediately.');
        descEl.addClass('setting-item-description');
        descEl.setAttr('style', 'margin-bottom: 1em;');

        const presetList = this.plugin.settings.modelSettingPresets || [];
        
        // Render each preset as a collapsible card
        presetList.forEach((preset, idx) => {
            this.renderPresetCard(containerEl, preset, idx);
        });

        // Add Preset Button
        new Setting(containerEl)
            .addButton(btn => btn
                .setButtonText('Add Preset')
                .setCta()
                .onClick(async () => {
                    if (!this.plugin.settings.modelSettingPresets) this.plugin.settings.modelSettingPresets = [];
                    const newPreset = {
                        name: `Preset ${this.plugin.settings.modelSettingPresets.length + 1}`,
                        selectedModel: this.plugin.settings.selectedModel,
                        systemMessage: this.plugin.settings.systemMessage,
                        temperature: this.plugin.settings.temperature,
                        enableStreaming: this.plugin.settings.enableStreaming
                    };
                    this.plugin.settings.modelSettingPresets.push(newPreset);
                    await this.plugin.saveSettings();
                    // Clear and re-render the entire content section
                    containerEl.empty();
                    this.renderModelSettingPresetsContent(containerEl);
                })
            );
    }

    /**
     * Renders a single preset as a collapsible card with all its settings.
     * @param containerEl The parent container element
     * @param preset The preset object to render
     * @param idx The index of this preset in the presets array
     */
    private renderPresetCard(containerEl: HTMLElement, preset: any, idx: number): void {
        // Helper to save settings while suppressing the settings-tab reload/re-render
        const saveWithoutReload = async () => {
            try {
                // Temporary suppression flag that the settings tab will check
                (this.plugin as any)._suppressSettingsReload = true;
                await this.plugin.saveSettings();
            } finally {
                // Delay clearing briefly to ensure any file watchers finish
                setTimeout(() => { (this.plugin as any)._suppressSettingsReload = false; }, 50);
            }
        };

        // Create preset card container
    const presetCard = containerEl.createDiv('preset-card');
    // Mark this element with a preset id for testing and queryability
    try { presetCard.setAttribute('data-preset-id', String(idx)); } catch (e) { /* ignore in some environments */ }
        presetCard.style.border = '1px solid var(--background-modifier-border)';
        presetCard.style.borderRadius = '6px';
        presetCard.style.padding = '0.75em';
        presetCard.style.marginBottom = '1em';

        // Preset header with collapse arrow, name, and action buttons
        const headerDiv = presetCard.createDiv('preset-header');
        headerDiv.style.display = 'flex';
        headerDiv.style.justifyContent = 'space-between';
        headerDiv.style.alignItems = 'center';
        headerDiv.style.gap = '0.5em';

        // Left section: Collapse arrow + name input
        const leftSection = headerDiv.createDiv();
        leftSection.style.display = 'flex';
        leftSection.style.alignItems = 'center';
        leftSection.style.gap = '0.5em';
        leftSection.style.flex = '1';

        // Collapse arrow
        const collapseArrow = leftSection.createEl('span');
        collapseArrow.textContent = '▶';
        collapseArrow.style.cursor = 'pointer';
        collapseArrow.style.fontSize = '0.8em';
        collapseArrow.style.opacity = '0.7';
        collapseArrow.style.userSelect = 'none';
        collapseArrow.title = 'Expand/Collapse';

        // Vertical divider
        const divider = leftSection.createEl('span');
        divider.textContent = '│';
        divider.style.opacity = '0.3';
        divider.style.fontSize = '1em';

        // Preset name input
        const nameInput = leftSection.createEl('input');
        nameInput.type = 'text';
        nameInput.value = preset.name;
        nameInput.style.fontSize = '0.95em'; // Smaller than section headers
        nameInput.style.fontWeight = '500';
        nameInput.style.border = 'none';
        nameInput.style.background = 'transparent';
        nameInput.style.color = 'var(--text-normal)';
        nameInput.style.flex = '1';
        nameInput.placeholder = 'Preset Name';
        
        nameInput.addEventListener('input', () => {
            preset.name = nameInput.value;
        });
        
        nameInput.addEventListener('blur', async () => {
            await saveWithoutReload();
        });

        // Right side: Action buttons container
        const actionsDiv = headerDiv.createDiv();
        actionsDiv.style.display = 'flex';
        actionsDiv.style.gap = '0.5em';

        // Apply button
        const applyBtn = actionsDiv.createEl('button');
        applyBtn.textContent = 'Apply';
        applyBtn.addClass('mod-cta');
        applyBtn.style.fontSize = '0.85em';
        applyBtn.style.padding = '0.3em 0.6em';
        applyBtn.addEventListener('click', async (e) => {
            e.stopPropagation(); // Prevent event bubbling
            // Apply this preset to the current settings
            this.plugin.settings.selectedModel = preset.selectedModel || this.plugin.settings.selectedModel;
            this.plugin.settings.systemMessage = preset.systemMessage || this.plugin.settings.systemMessage;
            this.plugin.settings.temperature = preset.temperature ?? this.plugin.settings.temperature;
            this.plugin.settings.enableStreaming = preset.enableStreaming ?? this.plugin.settings.enableStreaming;
                    
        await saveWithoutReload();
            new Notice(`Applied preset: ${preset.name}`);
        });

        // Duplicate button
        const duplicateBtn = actionsDiv.createEl('button');
        duplicateBtn.textContent = '📋';
        duplicateBtn.style.fontSize = '1.1em';
        duplicateBtn.style.background = 'transparent';
        duplicateBtn.style.border = 'none';
        duplicateBtn.style.cursor = 'pointer';
        duplicateBtn.style.opacity = '0.7';
        duplicateBtn.style.padding = '0.2em';
        duplicateBtn.title = 'Duplicate preset';
            duplicateBtn.addEventListener('click', async (e) => {
            e.stopPropagation(); // Prevent event bubbling
            if (!this.plugin.settings.modelSettingPresets) this.plugin.settings.modelSettingPresets = [];
            // Create a deep copy of the preset
            const duplicatedPreset = {
                name: `${preset.name} (Copy)`,
                selectedModel: preset.selectedModel,
                systemMessage: preset.systemMessage,
                temperature: preset.temperature,
                enableStreaming: preset.enableStreaming
            };
            // Insert the duplicate right after the current preset
            this.plugin.settings.modelSettingPresets.splice(idx + 1, 0, duplicatedPreset);
            await this.plugin.saveSettings();
            // Clear and re-render entire section to maintain proper order
            containerEl.empty();
            this.renderModelSettingPresetsContent(containerEl);
        });

        // Delete button
        const deleteBtn = actionsDiv.createEl('button');
        deleteBtn.textContent = '🗑️';
        deleteBtn.style.fontSize = '1.1em';
        deleteBtn.style.background = 'transparent';
        deleteBtn.style.border = 'none';
        deleteBtn.style.cursor = 'pointer';
        deleteBtn.style.opacity = '0.7';
        deleteBtn.style.padding = '0.2em';
        deleteBtn.title = 'Delete preset';
            deleteBtn.addEventListener('click', async (e) => {
            e.stopPropagation(); // Prevent event bubbling
            this.plugin.settings.modelSettingPresets?.splice(idx, 1);
            // Deleting a preset changes structure; allow normal save+re-render
            await this.plugin.saveSettings();
            presetCard.remove();
        });

        // Collapsible content area for preset settings
        const contentEl = presetCard.createDiv('preset-content');
        contentEl.style.display = 'none'; // Start collapsed
        contentEl.style.marginTop = '0.75em';
        contentEl.style.paddingTop = '0.75em';
        contentEl.style.borderTop = '1px solid var(--background-modifier-border)';

        // Toggle collapse on arrow click
        collapseArrow.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent event bubbling
            const isExpanded = contentEl.style.display === 'block';
            contentEl.style.display = isExpanded ? 'none' : 'block';
            collapseArrow.textContent = isExpanded ? '▶' : '▼';
        });

        // Model Selection with Dropdown
        new Setting(contentEl)
            .setName('Model')
            .setDesc('Select the AI model for this preset')
            .addButton(btn => {
                // Display current model
                const currentModel = this.plugin.settings.availableModels?.find(m => m.id === preset.selectedModel);
                btn.setButtonText(currentModel?.name || preset.selectedModel || 'Select Model');
                btn.onClick(async (e) => {
                    e.stopPropagation(); // Prevent event bubbling
                    
                    try {
                        // Use ModelService to get rich model metadata (same as main model selection)
                        const modelService = ModelService.getInstance();
                        const models = await modelService.getAllModelsWithMetadata(
                            this.plugin.settings,
                            false // Don't force refresh, use cache
                        );
                        
                        if (models.length === 0) {
                            new Notice('No models available - configure providers and refresh models first');
                            return;
                        }
                        
                        const dropdown = new FuzzyModelDropdown(
                            this.plugin.app,
                            models,
                            async (selected: ModelInfo) => {
                                preset.selectedModel = selected.id;
                                btn.setButtonText(selected.name);
                                await saveWithoutReload();
                            },
                            this.plugin
                        );
                        dropdown.open();
                    } catch (error) {
                        const errorMessage = error instanceof Error ? error.message : String(error);
                        new Notice(`Error loading models: ${errorMessage}`);
                    }
                });
            });

        // System Message (regular textarea, not collapsible)
        new Setting(contentEl)
            .setName('System Message')
            .setDesc('Custom system message for this preset')
            .addTextArea(text => {
                text.setValue(preset.systemMessage || '');
                text.setPlaceholder('Enter system message...');
                text.inputEl.style.width = '100%';
                text.inputEl.style.minHeight = '100px';
                text.inputEl.style.fontFamily = 'var(--font-monospace)';
                text.inputEl.style.fontSize = '0.9em';
                
                text.onChange(async (value) => {
                    preset.systemMessage = value;
                    await saveWithoutReload();
                });
            });

        // Temperature Slider
        this.settingCreators.createSliderSetting(
            contentEl,
            'Temperature',
            'Controls randomness in responses (0 = focused, 1 = creative)',
            { min: 0, max: 1, step: 0.1 },
                () => preset.temperature ?? 0.7,
            async (value) => {
                preset.temperature = value;
                await saveWithoutReload();
            }
        );

        // Enable Streaming Toggle
        this.settingCreators.createToggleSetting(
            contentEl,
            'Enable Streaming',
            'Stream responses in real-time',
            () => preset.enableStreaming ?? true,
            async (value) => {
                preset.enableStreaming = value;
                await saveWithoutReload();
            }
        );
    }
}
