import { App, PluginSettingTab, Setting, Notice } from 'obsidian';
import { MyPluginSettings } from './types';
import MyPlugin from './main';
import { SettingsSections } from './components/chat/SettingsSections';
import { CollapsibleSectionRenderer } from './components/chat/CollapsibleSection';

/**
 * Plugin Settings Tab
 * 
 * This tab provides a user interface for configuring the plugin settings.
 * It automatically opens the model settings view when settings are changed.
 */
export class MyPluginSettingTab extends PluginSettingTab {
    plugin: MyPlugin;
    private settingsSections: SettingsSections; // Added

    constructor(app: App, plugin: MyPlugin) {
        super(app, plugin);
        this.plugin = plugin;
        this.settingsSections = new SettingsSections(this.plugin); // Added initialization
    }

    /**
     * Display the settings tab
     * 
     * Shows only the auto-open setting here since all other settings
     * are managed in the model settings view for better organization.
     */
    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        containerEl.createEl('h2', { text: 'AI Assistant Settings' });

        // API Keys Section
        containerEl.createEl('h3', { text: 'API Keys' });        // OpenAI API Key
        new Setting(containerEl)
            .setName('OpenAI API Key')
            .setDesc('Enter your OpenAI API key')
            .addText(text => text
                .setPlaceholder('Enter your API key')
                .setValue(this.plugin.settings.openaiSettings.apiKey)
                .onChange(async (value) => {
                    this.plugin.settings.openaiSettings.apiKey = value;
                    await this.plugin.saveSettings();
                }));

        // OpenAI Base URL
        new Setting(containerEl)
            .setName('OpenAI Base URL')
            .setDesc('Custom base URL for OpenAI API (optional, leave empty for default)')
            .addText(text => text
                .setPlaceholder('https://api.openai.com/v1')
                .setValue(this.plugin.settings.openaiSettings.baseUrl || '')
                .onChange(async (value) => {
                    this.plugin.settings.openaiSettings.baseUrl = value.trim() || undefined;
                    await this.plugin.saveSettings();
                }));

        // Anthropic API Key
        new Setting(containerEl)
            .setName('Anthropic API Key')
            .setDesc('Enter your Anthropic API key')
            .addText(text => text
                .setPlaceholder('Enter your API key')
                .setValue(this.plugin.settings.anthropicSettings.apiKey)
                .onChange(async (value) => {
                    this.plugin.settings.anthropicSettings.apiKey = value;
                    await this.plugin.saveSettings();
                }));

        // Gemini API Key
        new Setting(containerEl)
            .setName('Google API Key')
            .setDesc('Enter your Google API key')
            .addText(text => text
                .setPlaceholder('Enter your API key')
                .setValue(this.plugin.settings.geminiSettings.apiKey)
                .onChange(async (value) => {
                    this.plugin.settings.geminiSettings.apiKey = value;
                    await this.plugin.saveSettings();
                }));

        // Ollama Server URL
        new Setting(containerEl)
            .setName('Ollama Server URL')
            .setDesc('Enter your Ollama server URL (default: http://localhost:11434)')
            .addText(text => text
                .setPlaceholder('http://localhost:11434')
                .setValue(this.plugin.settings.ollamaSettings.serverUrl)
                .onChange(async (value) => {
                    this.plugin.settings.ollamaSettings.serverUrl = value;
                    await this.plugin.saveSettings();
                }));

        // Unified AI Model Settings Section (matching chat modal exactly)
        CollapsibleSectionRenderer.createCollapsibleSection(
            containerEl,
            'AI Model Settings', // Title matches the chat modal
            async (sectionEl: HTMLElement) => {
                await this.settingsSections.renderAIModelSettings(sectionEl, () => this.display());
            },
            this.plugin,
            'generalSectionsExpanded'
        );

        new Setting(containerEl)
            .setName('Chat Separator')
            .setDesc('The string used to separate chat messages.')
            .addText(text => {
                text.setPlaceholder('----')
                    .setValue(this.plugin.settings.chatSeparator ?? '')
                    .onChange(async (value: string) => {
                        this.plugin.settings.chatSeparator = value;
                        await this.plugin.saveSettings();
                    });
            });

        new Setting(containerEl)
            .setName('Chat Start String')
            .setDesc('The string that indicates where to start taking the note for context.')
            .addText(text => {
                text.setPlaceholder('===START===')
                    .setValue(this.plugin.settings.chatStartString ?? '')
                    .onChange(async (value: string) => {
                        this.plugin.settings.chatStartString = value;
                        await this.plugin.saveSettings();
                    });
            });

        new Setting(containerEl)
            .setName('Chat End String')
            .setDesc('The string that indicates where to end taking the note for context.')
            .addText(text => {
                text.setPlaceholder('===END===')
                    .setValue(this.plugin.settings.chatEndString ?? '')
                    .onChange(async (value: string) => {
                        this.plugin.settings.chatEndString = value;
                        await this.plugin.saveSettings();
                    });
            });

        // Title Prompt
        new Setting(containerEl)
            .setName('Title Prompt')
            .setDesc('The prompt used for generating note titles.')
            .addTextArea(text => {
                text.setPlaceholder('You are a title generator...')
                    .setValue(this.plugin.settings.titlePrompt)
                    .onChange(async (value: string) => {
                        this.plugin.settings.titlePrompt = value;
                        await this.plugin.saveSettings();
                    });
            });

        // Reset Prompts and All Settings (except API keys) to Default
        new Setting(containerEl)
            .setName('Reset All Settings to Default')
            .setDesc('Reset all plugin settings (except API keys) to their original default values.')
            .addButton(button => button
                .setButtonText('Reset')
                .onClick(async () => {
                    // Import defaults
                    const { DEFAULT_TITLE_PROMPT } = await import('./prompts');
                    const { DEFAULT_SETTINGS } = await import('./types');
                    // Preserve API keys
                    const openaiKey = this.plugin.settings.openaiSettings.apiKey;
                    const anthropicKey = this.plugin.settings.anthropicSettings.apiKey;
                    const geminiKey = this.plugin.settings.geminiSettings.apiKey;
                    // Reset all settings
                    this.plugin.settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
                    // Restore API keys
                    this.plugin.settings.openaiSettings.apiKey = openaiKey;
                    this.plugin.settings.anthropicSettings.apiKey = anthropicKey;
                    this.plugin.settings.geminiSettings.apiKey = geminiKey;
                    // Restore title prompt from prompts.ts
                    this.plugin.settings.titlePrompt = DEFAULT_TITLE_PROMPT;
                    await this.plugin.saveSettings();
                    this.display(); // Re-render the settings to show updated values
                    new Notice('All settings (except API keys) reset to default.');
                }));

        // Title Output Mode
        new Setting(containerEl)
            .setName('Title Output Mode')
            .setDesc('Choose what to do with the generated note title.')
            .addDropdown(drop => {
                drop.addOption('clipboard', 'Copy to clipboard');
                drop.addOption('replace-filename', 'Replace note filename');
                drop.addOption('metadata', 'Insert into metadata');
                drop.setValue(this.plugin.settings.titleOutputMode ?? 'clipboard');
                drop.onChange(async (value: string) => {
                    this.plugin.settings.titleOutputMode = value as any;
                    await this.plugin.saveSettings();
                });
            });

        // Summary Output Mode
        new Setting(containerEl)
            .setName('Summary Output Mode')
            .setDesc('Choose what to do with the generated note summary.')
            .addDropdown(drop => {
                drop.addOption('clipboard', 'Copy to clipboard');
                drop.addOption('metadata', 'Insert into metadata');
                drop.setValue(this.plugin.settings.summaryOutputMode ?? 'clipboard');
                drop.onChange(async (value: string) => {
                    this.plugin.settings.summaryOutputMode = value as any;
                    await this.plugin.saveSettings();
                });
            });

        new Setting(containerEl)
            .setName('Expand Linked Notes Recursively')
            .setDesc('If enabled, when fetching a note, also fetch and expand links within that note recursively (prevents infinite loops).')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.expandLinkedNotesRecursively ?? false)
                .onChange(async (value) => {
                    this.plugin.settings.expandLinkedNotesRecursively = value;
                    await this.plugin.saveSettings();
                    this.display(); // Re-render to show/hide the slider
                }));

        if (this.plugin.settings.expandLinkedNotesRecursively) {
            new Setting(containerEl)
                .setName('Max Link Expansion Depth')
                .setDesc('Maximum depth for recursively expanding linked notes (1-3).')
                .addSlider(slider => {
                    slider.setLimits(1, 3, 1)
                        .setValue(this.plugin.settings.maxLinkExpansionDepth ?? 2)
                        .setDynamicTooltip()
                        .onChange(async (value: number) => {
                            this.plugin.settings.maxLinkExpansionDepth = value;
                            await this.plugin.saveSettings();
                        });
                });
        }

        new Setting(containerEl)
            .setName('Chat Note Folder')
            .setDesc('Folder to save exported chat notes (relative to vault root, leave blank for root)')
            .addText(text => {
                text.setPlaceholder('e.g. AI Chats')
                    .setValue(this.plugin.settings.chatNoteFolder ?? '')
                    .onChange(async (value: string) => {
                        this.plugin.settings.chatNoteFolder = value.trim();
                        await this.plugin.saveSettings();
                    });
            });

        // --- YAML Attribute Generators Section ---
        containerEl.createEl('h3', { text: 'YAML Attribute Generators' });
        const yamlGenDesc = containerEl.createEl('div', { text: 'Configure custom YAML attribute generators. Each entry will create a command to generate and insert/update a YAML field in your notes.' });
        yamlGenDesc.style.marginBottom = '1em';

        // List all generators
        const yamlGens = this.plugin.settings.yamlAttributeGenerators ?? [];
        yamlGens.forEach((gen, idx) => {
            // Automatically generate the command name: 'Generate YAML: <attributeName>'
            const autoCommandName = gen.attributeName ? `Generate YAML: ${gen.attributeName}` : `YAML Generator #${idx + 1}`;
            const setting = new Setting(containerEl)
                .setName(autoCommandName)
                .setDesc(`YAML field: ${gen.attributeName}`)
                .addText(text => text
                    .setPlaceholder('YAML Attribute Name')
                    .setValue(gen.attributeName)
                    .onChange(async (value) => {
                        if (this.plugin.settings.yamlAttributeGenerators) {
                            this.plugin.settings.yamlAttributeGenerators[idx].attributeName = value;
                            // Also update the command name automatically
                            this.plugin.settings.yamlAttributeGenerators[idx].commandName = value ? `Generate YAML: ${value}` : '';
                            await this.plugin.saveSettings();
                            this.display(); // Re-render to update the command name
                        }
                    }))
                .addTextArea(text => text
                    .setPlaceholder('Prompt for LLM')
                    .setValue(gen.prompt)
                    .onChange(async (value) => {
                        if (this.plugin.settings.yamlAttributeGenerators) {
                            this.plugin.settings.yamlAttributeGenerators[idx].prompt = value;
                            await this.plugin.saveSettings();
                        }
                    }))
                .addDropdown(drop => {
                    drop.addOption('clipboard', 'Copy to clipboard');
                    drop.addOption('metadata', 'Insert into metadata');
                    drop.setValue(gen.outputMode);
                    drop.onChange(async (value) => {
                        if (this.plugin.settings.yamlAttributeGenerators) {
                            this.plugin.settings.yamlAttributeGenerators[idx].outputMode = value as any;
                            await this.plugin.saveSettings();
                        }
                    });
                })
                .addExtraButton(btn => {
                    btn.setIcon('cross')
                        .setTooltip('Delete')
                        .onClick(async () => {
                            if (this.plugin.settings.yamlAttributeGenerators) {
                                this.plugin.settings.yamlAttributeGenerators.splice(idx, 1);
                                await this.plugin.saveSettings();
                                this.display();
                            }
                        });
                });
        });

        // Add new generator button
        new Setting(containerEl)
            .addButton(btn => {
                btn.setButtonText('Add YAML Attribute Generator')
                    .setCta()
                    .onClick(async () => {
                        if (!this.plugin.settings.yamlAttributeGenerators) this.plugin.settings.yamlAttributeGenerators = [];
                        this.plugin.settings.yamlAttributeGenerators.push({
                            attributeName: '',
                            prompt: '',
                            outputMode: 'metadata',
                            commandName: 'New YAML Generator'
                        });
                        await this.plugin.saveSettings();
                        this.display();
                    });
            });

        // --- Model Setting Presets Management ---
        containerEl.createEl('h3', { text: 'Model Setting Presets' });
        containerEl.createEl('div', {
            text: 'Presets let you save and quickly apply common model settings (model, temperature, system message, etc). You can add, edit, or remove presets here. In the AI Model Settings panel, you will see buttons for each preset above the model selection. Clicking a preset button will instantly apply those settings. This is useful for switching between different model configurations with one click.',
            cls: 'setting-item-description',
            attr: { style: 'margin-bottom: 0.5em;' }
        });
        const presetList = this.plugin.settings.modelSettingPresets || [];
        presetList.forEach((preset, idx) => {
            const setting = new Setting(containerEl)
                .setName(preset.name)
                .setDesc('Edit or remove this preset')
                .addText(text => text
                    .setValue(preset.name)
                    .onChange(async (value) => {
                        preset.name = value;
                        await this.plugin.saveSettings();
                        this.display();
                    })
                )
                .addText(text => text
                    .setPlaceholder('Model ID (provider:model)')
                    .setValue(preset.selectedModel || '')
                    .onChange(async (value) => {
                        preset.selectedModel = value;
                        await this.plugin.saveSettings();
                    })
                )
                .addTextArea(text => text
                    .setPlaceholder('System message')
                    .setValue(preset.systemMessage || '')
                    .onChange(async (value) => {
                        preset.systemMessage = value;
                        await this.plugin.saveSettings();
                    })
                )
                .addSlider(slider => {
                    slider.setLimits(0, 1, 0.1)
                        .setValue(preset.temperature ?? 0.7)
                        .setDynamicTooltip()
                        .onChange(async (value) => {
                            preset.temperature = value;
                            await this.plugin.saveSettings();
                        });
                })
                .addText(text => text
                    .setPlaceholder('Max tokens')
                    .setValue(preset.maxTokens?.toString() || '')
                    .onChange(async (value) => {
                        const num = parseInt(value, 10);
                        preset.maxTokens = isNaN(num) ? undefined : num;
                        await this.plugin.saveSettings();
                    })
                )
                .addToggle(toggle => toggle
                    .setValue(preset.enableStreaming ?? true)
                    .onChange(async (value) => {
                        preset.enableStreaming = value;
                        await this.plugin.saveSettings();
                    })
                )
                .addExtraButton(btn => btn
                    .setIcon('cross')
                    .setTooltip('Delete')
                    .onClick(async () => {
                        this.plugin.settings.modelSettingPresets?.splice(idx, 1);
                        await this.plugin.saveSettings();
                        this.display();
                    })
                );
        });
        new Setting(containerEl)
            .addButton(btn => btn
                .setButtonText('Add Preset')
                .setCta()
                .onClick(async () => {
                    if (!this.plugin.settings.modelSettingPresets) this.plugin.settings.modelSettingPresets = [];
                    // Deep copy current settings for the new preset
                    this.plugin.settings.modelSettingPresets.push(JSON.parse(JSON.stringify({
                        name: `Preset ${this.plugin.settings.modelSettingPresets.length + 1}`,
                        selectedModel: this.plugin.settings.selectedModel,
                        systemMessage: this.plugin.settings.systemMessage,
                        temperature: this.plugin.settings.temperature,
                        maxTokens: this.plugin.settings.maxTokens,
                        enableStreaming: this.plugin.settings.enableStreaming
                    })));
                    await this.plugin.saveSettings();
                    this.display();
                })
            );
    }
}
