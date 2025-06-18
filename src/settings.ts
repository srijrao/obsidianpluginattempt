import { App, PluginSettingTab, Setting, Notice } from 'obsidian';
import { MyPluginSettings } from './types';
import MyPlugin from './main';
import { VIEW_TYPE_MODEL_SETTINGS } from './main'; // Import the constant
import { SettingsSections } from './components/chat/SettingsSections';
import { CollapsibleSectionRenderer } from './components/chat/CollapsibleSection';
import { DEFAULT_TITLE_PROMPT } from './promptConstants';
import { DEFAULT_SETTINGS } from './types';
import { createToolInstances } from './components/chat/tools/toolcollect'; // getAllToolClasses was unused
import { getAllAvailableModels } from '../providers';

/**
 * Plugin Settings Tab
 *
 * This tab provides a user interface for configuring the plugin settings.
 */
export class MyPluginSettingTab extends PluginSettingTab {
    plugin: MyPlugin;
    private settingsSections: SettingsSections;

    constructor(app: App, plugin: MyPlugin) {
        super(app, plugin);
        this.plugin = plugin;
        this.settingsSections = new SettingsSections(this.plugin);
    }

    /**
     * Creates a text input setting.
     * @param containerEl The HTML element to append the setting to.
     * @param name The name of the setting.
     * @param desc The description of the setting.
     * @param placeholder The placeholder text for the input.
     * @param getValue A function to get the current value of the setting.
     * @param setValue A function to set the new value of the setting.
     * @param options Additional options for the text input (e.g., trim, undefinedIfEmpty, isTextArea).
     */
    private createTextSetting(
        containerEl: HTMLElement,
        name: string,
        desc: string,
        placeholder: string,
        getValue: () => string,
        setValue: (value: string | undefined) => Promise<void>,
        options?: { trim?: boolean; undefinedIfEmpty?: boolean; isTextArea?: boolean }
    ): void {
        new Setting(containerEl)
            .setName(name)
            .setDesc(desc)
            .then(setting => {
                const textInputOptions = {
                    trim: options?.trim,
                    undefinedIfEmpty: options?.undefinedIfEmpty
                };
                if (options?.isTextArea) {
                    setting.addTextArea(text => this.configureTextInput(text, placeholder, getValue, setValue, textInputOptions));
                } else {
                    setting.addText(text => this.configureTextInput(text, placeholder, getValue, setValue, textInputOptions));
                }
            });
    }

    /**
     * Configures a text input (either single-line or multi-line).
     * @param textComponent The TextComponent or TextAreaComponent to configure.
     * @param placeholder The placeholder text.
     * @param getValue A function to get the current value.
     * @param setValue A function to set the new value.
     * @param options Additional options for processing the input value (e.g., trim, undefinedIfEmpty).
     */
    private configureTextInput(
        textComponent: any, // TextComponent | TextAreaComponent
        placeholder: string,
        getValue: () => string,
        setValue: (value: string | undefined) => Promise<void>,
        options?: { trim?: boolean; undefinedIfEmpty?: boolean }
    ): void {
        textComponent
            .setPlaceholder(placeholder)
            .setValue(getValue() ?? '')
            .onChange(async (value: string) => {
                let processedValue: string | undefined = value;
                if (options?.trim) {
                    processedValue = processedValue.trim();
                }
                if (options?.undefinedIfEmpty && processedValue === '') {
                    processedValue = undefined;
                }
                await setValue(processedValue);
            });
    }

    /**
     * Creates a dropdown setting.
     * @param containerEl The HTML element to append the setting to.
     * @param name The name of the setting.
     * @param desc The description of the setting.
     * @param options A record of option values to display names.
     * @param getValue A function to get the current value of the setting.
     * @param setValue A function to set the new value of the setting.
     */
    private createDropdownSetting(
        containerEl: HTMLElement,
        name: string,
        desc: string,
        options: Record<string, string>,
        getValue: () => string,
        setValue: (value: string) => Promise<void>
    ): void {
        new Setting(containerEl)
            .setName(name)
            .setDesc(desc)
            .addDropdown(drop => {
                Object.entries(options).forEach(([key, display]) => drop.addOption(key, display));
                drop.setValue(getValue());
                drop.onChange(async (value: string) => {
                    await setValue(value);
                });
            });
    }

    /**
     * Creates a toggle (checkbox) setting.
     * @param containerEl The HTML element to append the setting to.
     * @param name The name of the setting.
     * @param desc The description of the setting.
     * @param getValue A function to get the current boolean value.
     * @param setValue A function to set the new boolean value.
     * @param onChangeCallback An optional callback to run after the value changes and settings are saved.
     */
    private createToggleSetting(
        containerEl: HTMLElement,
        name: string,
        desc: string,
        getValue: () => boolean,
        setValue: (value: boolean) => Promise<void>,
        onChangeCallback?: () => void
    ): void {
        new Setting(containerEl)
            .setName(name)
            .setDesc(desc)
            .addToggle(toggle => toggle
                .setValue(getValue())
                .onChange(async (value) => {
                    await setValue(value);
                    if (onChangeCallback) {
                        onChangeCallback();
                    }
                }));
    }

    /**
     * Creates a slider setting.
     * @param containerEl The HTML element to append the setting to.
     * @param name The name of the setting.
     * @param desc The description of the setting.
     * @param limits An object defining min, max, and step for the slider.
     * @param getValue A function to get the current numeric value.
     * @param setValue A function to set the new numeric value.
     */
    private createSliderSetting(
        containerEl: HTMLElement,
        name: string,
        desc: string,
        limits: { min: number, max: number, step: number },
        getValue: () => number,
        setValue: (value: number) => Promise<void>
    ): void {
        new Setting(containerEl)
            .setName(name)
            .setDesc(desc)
            .addSlider(slider => {
                slider.setLimits(limits.min, limits.max, limits.step)
                    .setValue(getValue())
                    .setDynamicTooltip()
                    .onChange(async (value: number) => {
                        await setValue(value);
                    });
            });
    }

    /**
     * Renders the YAML Attribute Generators section.
     * @param containerEl The HTML element to append the section to.
     */
    private renderYamlAttributeGenerators(containerEl: HTMLElement): void {
        containerEl.createEl('h3', { text: 'YAML Attribute Generators' });
        containerEl.createEl('div', { text: 'Configure custom YAML attribute generators. Each entry will create a command to generate and insert/update a YAML field in your notes.' }).style.marginBottom = '1em';

        const yamlGens = this.plugin.settings.yamlAttributeGenerators ?? [];
        yamlGens.forEach((gen, idx) => {
            const autoCommandName = gen.attributeName ? `Generate YAML: ${gen.attributeName}` : `YAML Generator #${idx + 1}`;
            new Setting(containerEl)
                .setName(autoCommandName)
                .setDesc(`YAML field: ${gen.attributeName}`)
                .addText(text => this.configureTextInput(text, 'YAML Attribute Name', () => gen.attributeName, async (value) => {
                    if (this.plugin.settings.yamlAttributeGenerators) {
                        this.plugin.settings.yamlAttributeGenerators[idx].attributeName = value ?? '';
                        this.plugin.settings.yamlAttributeGenerators[idx].commandName = value ? `Generate YAML: ${value}` : '';
                        await this.plugin.saveSettings();
                        this.display(); // Re-render to update the command name
                    }
                }))
                .addTextArea(text => this.configureTextInput(text, 'Prompt for LLM', () => gen.prompt, async (value) => {
                    if (this.plugin.settings.yamlAttributeGenerators) {
                        this.plugin.settings.yamlAttributeGenerators[idx].prompt = value ?? '';
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
                            this.display();
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
            this.createSliderSetting(containerEl, 'Temperature', '', { min: 0, max: 1, step: 0.1 }, () => preset.temperature ?? 0.7, async (value) => {
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
            this.createToggleSetting(containerEl, 'Enable Streaming', '', () => preset.enableStreaming ?? true, async (value) => {
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

    /**
     * Renders the Tool Enable/Disable section.
     * @param containerEl The HTML element to append the section to.
     */    private renderToolToggles(containerEl: HTMLElement): void {
        containerEl.createEl('h3', { text: 'Agent Tools' });
        containerEl.createEl('div', {
            text: 'Enable or disable individual agent tools. Disabled tools will not be available to the agent or appear in the system prompt.',
            cls: 'setting-item-description',
            attr: { style: 'margin-bottom: 0.5em;' }
        });        // Use centralized tool creation function to get properly instantiated tools
        const tools = createToolInstances(this.app, this.plugin);
        if (!this.plugin.settings.enabledTools) {
            console.log('[AI Assistant] Settings: Initializing enabledTools object.');
            this.plugin.settings.enabledTools = {};
        }
        console.log('[AI Assistant] Settings: Current enabledTools before processing:', JSON.stringify(this.plugin.settings.enabledTools));

        tools.forEach(tool => {
            // CRITICAL LOGGING: Check the tool object and its name property
            if (!tool) {
                console.error('[AI Assistant] Settings: Encountered an undefined tool object in tools array!');
                return; // Skip this iteration
            }
            console.log(`[AI Assistant] Settings: Processing tool for UI - Name: ${tool.name}, Description: ${tool.description}`);
            if (typeof tool.name === 'undefined') {
                console.error('[AI Assistant] Settings: CRITICAL - Tool object has undefined name:', tool);
            }

            this.createToggleSetting(
                containerEl,
                `${tool.name} (${tool.description})`,
                `Enable or disable the "${tool.name}" tool.`,
                () => {
                    // CRITICAL LOGGING: Check tool.name before accessing enabledTools
                    console.log(`[AI Assistant] Settings: Getting toggle state for tool: ${tool.name}`);
                    if (typeof tool.name === 'undefined') {
                        console.error('[AI Assistant] Settings: CRITICAL - Trying to get toggle state for tool with undefined name!');
                        return false; // Default to false if name is undefined
                    }
                    return !!this.plugin.settings.enabledTools && this.plugin.settings.enabledTools[tool.name] !== false;
                },
                async (value) => {
                    // CRITICAL LOGGING: Check tool.name before setting enabledTools
                    console.log(`[AI Assistant] Settings: Setting toggle state for tool: ${tool.name} to ${value}`);
                    if (typeof tool.name === 'undefined') {
                        console.error('[AI Assistant] Settings: CRITICAL - Trying to set toggle state for tool with undefined name! Skipping save.');
                        return;
                    }
                    if (!this.plugin.settings.enabledTools) {
                        // This should have been initialized above, but as a safeguard
                        this.plugin.settings.enabledTools = {};
                    }
                    this.plugin.settings.enabledTools[tool.name] = value;
                    await this.plugin.saveSettings();
                    console.log('[AI Assistant] Settings: Saved enabledTools:', JSON.stringify(this.plugin.settings.enabledTools));
                }
            );
        });
    }

    /**
     * Renders the Available Models section with checkboxes for each model.
     * @param containerEl The HTML element to append the section to.
     */
    private renderAvailableModelsSection(containerEl: HTMLElement): void {
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
                                    this.display();
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
                                this.display();
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
                                this.display();
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
                        this.createToggleSetting(
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

    /**
     * Display the settings tab.
     * This method orchestrates the rendering of all setting sections.
     */
    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        containerEl.createEl('h2', { text: 'AI Assistant Settings' });

        // Note: You will need to add the following boolean keys to your MyPluginSettings interface in src/types.ts:
        // apiKeysSectionExpanded: boolean;
        // modelManagementSectionExpanded: boolean; // This can be a parent or use specific ones below
        // availableModelsSectionExpanded: boolean; // Used by renderAvailableModelsSection
        // modelPresetsSectionExpanded: boolean;
        // defaultModelSettingsSectionExpanded: boolean;
        // agentConfigSectionExpanded: boolean; // This can be a parent or use specific ones below
        // agentModeSettingsSectionExpanded: boolean;
        // agentToolsSectionExpanded: boolean;
        // contentChatSettingsSectionExpanded: boolean;
        // noteLinkHandlingSectionExpanded: boolean;
        // yamlGeneratorsSectionExpanded: boolean;
        // pluginBehaviorSectionExpanded: boolean;


        // Section 1: API Keys & Providers
        CollapsibleSectionRenderer.createCollapsibleSection(
            containerEl,
            'API Keys & Providers',
            async (sectionEl: HTMLElement) => {
                this.createTextSetting(sectionEl, 'OpenAI API Key', 'Enter your OpenAI API key', 'Enter your API key',
                    () => this.plugin.settings.openaiSettings.apiKey,
                    async (value) => { this.plugin.settings.openaiSettings.apiKey = value ?? ''; await this.plugin.saveSettings(); });
                this.createTextSetting(sectionEl, 'OpenAI Base URL', 'Custom base URL for OpenAI API (optional, leave empty for default)', 'https://api.openai.com/v1',
                    () => this.plugin.settings.openaiSettings.baseUrl || '',
                    async (value) => { this.plugin.settings.openaiSettings.baseUrl = value; await this.plugin.saveSettings(); },
                    { trim: true, undefinedIfEmpty: true });
                this.createTextSetting(sectionEl, 'Anthropic API Key', 'Enter your Anthropic API key', 'Enter your API key',
                    () => this.plugin.settings.anthropicSettings.apiKey,
                    async (value) => { this.plugin.settings.anthropicSettings.apiKey = value ?? ''; await this.plugin.saveSettings(); });
                this.createTextSetting(sectionEl, 'Google API Key', 'Enter your Google API key', 'Enter your API key',
                    () => this.plugin.settings.geminiSettings.apiKey,
                    async (value) => { this.plugin.settings.geminiSettings.apiKey = value ?? ''; await this.plugin.saveSettings(); });
                this.createTextSetting(sectionEl, 'Ollama Server URL', 'Enter your Ollama server URL (default: http://localhost:11434)', 'http://localhost:11434',
                    () => this.plugin.settings.ollamaSettings.serverUrl,
                    async (value) => { this.plugin.settings.ollamaSettings.serverUrl = value ?? ''; await this.plugin.saveSettings(); });
            },
            this.plugin,
            'generalSectionsExpanded'
        );

        // Section 2: Model Management
        // This section will contain "Available Models" and "Model Setting Presets"
        // "Available Models" is already collapsible via its own render method.
        this.renderAvailableModelsSection(containerEl); // Ensure its sectionKey is unique

        CollapsibleSectionRenderer.createCollapsibleSection(
            containerEl,
            'Model Setting Presets',
            async (sectionEl: HTMLElement) => {
                this.renderModelSettingPresets(sectionEl);
            },
            this.plugin,
            'generalSectionsExpanded'
        );

        // Section 3: Core AI Settings (Default Model Settings)
        CollapsibleSectionRenderer.createCollapsibleSection(
            containerEl,
            'Default AI Model Settings',
            async (sectionEl: HTMLElement) => {
                await this.settingsSections.renderAIModelSettings(sectionEl, () => this.display());
            },
            this.plugin,
            'generalSectionsExpanded'
        );

        // Section 4: Agent Configuration
        CollapsibleSectionRenderer.createCollapsibleSection(
            containerEl,
            'Agent Mode Settings',
            async (sectionEl: HTMLElement) => {
                sectionEl.createEl('div', {
                    text: 'Agent Mode allows the AI to use tools like file creation, reading, and modification. Configure the limits and behavior for tool usage.',
                    cls: 'setting-item-description',
                    attr: { style: 'margin-bottom: 1em;' }
                });

                this.createToggleSetting(sectionEl, 'Enable Agent Mode by Default', 'Start new conversations with Agent Mode enabled.',
                    () => this.plugin.settings.agentMode?.enabled ?? false,
                    async (value) => {
                        if (!this.plugin.settings.agentMode) {
                            this.plugin.settings.agentMode = { enabled: false, maxToolCalls: 10, timeoutMs: 30000 };
                        }
                        this.plugin.settings.agentMode.enabled = value;
                        await this.plugin.saveSettings();
                    });

                this.createSliderSetting(sectionEl, 'Max Tool Calls per Conversation', 'Maximum number of tools the AI can use in a single conversation to prevent runaway execution.',
                    { min: 1, max: 50, step: 1 },
                    () => this.plugin.settings.agentMode?.maxToolCalls ?? 10,
                    async (value) => {
                        if (!this.plugin.settings.agentMode) {
                            this.plugin.settings.agentMode = { enabled: false, maxToolCalls: 10, timeoutMs: 30000 };
                        }
                        this.plugin.settings.agentMode.maxToolCalls = value;
                        await this.plugin.saveSettings();
                    });                this.createSliderSetting(sectionEl, 'Tool Execution Timeout (seconds)', 'Maximum time to wait for each tool to complete before timing out.',
                    { min: 5, max: 300, step: 5 },
                    () => (this.plugin.settings.agentMode?.timeoutMs ?? 30000) / 1000,
                    async (value) => {
                        if (!this.plugin.settings.agentMode) {
                            this.plugin.settings.agentMode = { enabled: false, maxToolCalls: 10, timeoutMs: 30000 };
                        }
                        this.plugin.settings.agentMode.timeoutMs = value * 1000;
                        await this.plugin.saveSettings();
                    });

                // Custom Agent System Message Setting
                sectionEl.createEl('h4', { text: 'Agent System Message' });
                sectionEl.createEl('div', {
                    text: 'Customize the system message used when Agent Mode is enabled. Use {{TOOL_DESCRIPTIONS}} to include the available tools list.',
                    cls: 'setting-item-description',
                    attr: { style: 'margin-bottom: 0.5em;' }
                });

                const agentMessageContainer = sectionEl.createDiv('agent-message-container');
                agentMessageContainer.style.display = 'flex';
                agentMessageContainer.style.gap = '0.5em';
                agentMessageContainer.style.alignItems = 'flex-start';
                agentMessageContainer.style.marginBottom = '1em';

                const textareaContainer = agentMessageContainer.createDiv();
                textareaContainer.style.flex = '1';

                const textarea = textareaContainer.createEl('textarea');
                textarea.rows = 8;
                textarea.style.width = '100%';
                textarea.style.minHeight = '120px';
                textarea.style.fontFamily = 'monospace';
                textarea.style.fontSize = '0.9em';
                textarea.placeholder = 'Enter custom agent system message template...';
                textarea.value = this.plugin.settings.customAgentSystemMessage || '';

                const buttonContainer = agentMessageContainer.createDiv();
                buttonContainer.style.display = 'flex';
                buttonContainer.style.flexDirection = 'column';
                buttonContainer.style.gap = '0.25em';

                const resetButton = buttonContainer.createEl('button', { text: 'Reset to Default' });
                resetButton.style.padding = '0.25em 0.5em';
                resetButton.style.fontSize = '0.8em';
                resetButton.addEventListener('click', async () => {
                    const { AGENT_SYSTEM_PROMPT_TEMPLATE } = await import('./promptConstants');
                    textarea.value = AGENT_SYSTEM_PROMPT_TEMPLATE;
                    this.plugin.settings.customAgentSystemMessage = AGENT_SYSTEM_PROMPT_TEMPLATE;
                    await this.plugin.saveSettings();
                });

                const clearButton = buttonContainer.createEl('button', { text: 'Use Default' });
                clearButton.style.padding = '0.25em 0.5em';
                clearButton.style.fontSize = '0.8em';
                clearButton.addEventListener('click', async () => {
                    textarea.value = '';
                    this.plugin.settings.customAgentSystemMessage = undefined;
                    await this.plugin.saveSettings();
                });

                textarea.addEventListener('input', async () => {
                    const value = textarea.value.trim();
                    this.plugin.settings.customAgentSystemMessage = value || undefined;
                    await this.plugin.saveSettings();
                });
            },
            this.plugin,
            'generalSectionsExpanded'
        );

        CollapsibleSectionRenderer.createCollapsibleSection(
            containerEl,
            'Agent Tools',
            async (sectionEl: HTMLElement) => {
                this.renderToolToggles(sectionEl);
            },
            this.plugin,
            'generalSectionsExpanded'
        );

        // Section 5: Content & Chat Customization
        CollapsibleSectionRenderer.createCollapsibleSection(
            containerEl,
            'Content & Chat Customization',
            async (sectionEl: HTMLElement) => {
                this.createTextSetting(sectionEl, 'Chat Separator', 'The string used to separate chat messages.', '----',
                    () => this.plugin.settings.chatSeparator ?? '',
                    async (value) => { this.plugin.settings.chatSeparator = value ?? ''; await this.plugin.saveSettings(); });
                this.createTextSetting(sectionEl, 'Chat Start String', 'The string that indicates where to start taking the note for context.', '===START===',
                    () => this.plugin.settings.chatStartString ?? '',
                    async (value) => { this.plugin.settings.chatStartString = value ?? ''; await this.plugin.saveSettings(); });
                this.createTextSetting(sectionEl, 'Chat End String', 'The string that indicates where to end taking the note for context.', '===END===',
                    () => this.plugin.settings.chatEndString ?? '',
                    async (value) => { this.plugin.settings.chatEndString = value ?? ''; await this.plugin.saveSettings(); });
                this.createTextSetting(sectionEl, 'Title Prompt', 'The prompt used for generating note titles.', 'You are a title generator...',
                    () => this.plugin.settings.titlePrompt,
                    async (value) => { this.plugin.settings.titlePrompt = value ?? ''; await this.plugin.saveSettings(); },
                    { isTextArea: true });
                this.createDropdownSetting(sectionEl, 'Title Output Mode', 'Choose what to do with the generated note title.',
                    { 'clipboard': 'Copy to clipboard', 'replace-filename': 'Replace note filename', 'metadata': 'Insert into metadata' },
                    () => this.plugin.settings.titleOutputMode ?? 'clipboard',
                    async (value) => { this.plugin.settings.titleOutputMode = value as any; await this.plugin.saveSettings(); });
                this.createDropdownSetting(sectionEl, 'Summary Output Mode', 'Choose what to do with the generated note summary.',
                    { 'clipboard': 'Copy to clipboard', 'metadata': 'Insert into metadata' },
                    () => this.plugin.settings.summaryOutputMode ?? 'clipboard',
                    async (value) => { this.plugin.settings.summaryOutputMode = value as any; await this.plugin.saveSettings(); });
            },
            this.plugin,
            'generalSectionsExpanded'
        );

        // Section 6: Note & Data Handling
        CollapsibleSectionRenderer.createCollapsibleSection(
            containerEl,
            'Note & Data Handling',
            async (sectionEl: HTMLElement) => {
                this.createToggleSetting(sectionEl, 'Expand Linked Notes Recursively', 'If enabled, when fetching a note, also fetch and expand links within that note recursively (prevents infinite loops).',
                    () => this.plugin.settings.expandLinkedNotesRecursively ?? false,
                    async (value) => { this.plugin.settings.expandLinkedNotesRecursively = value; await this.plugin.saveSettings(); this.display(); }, // Re-render to show/hide slider
                    () => this.display());

                if (this.plugin.settings.expandLinkedNotesRecursively) {
                    this.createSliderSetting(sectionEl, 'Max Link Expansion Depth', 'Maximum depth for recursively expanding linked notes (1-3).',
                        { min: 1, max: 3, step: 1 },
                        () => this.plugin.settings.maxLinkExpansionDepth ?? 2,
                        async (value) => { this.plugin.settings.maxLinkExpansionDepth = value; await this.plugin.saveSettings(); });
                }

                this.createTextSetting(sectionEl, 'Chat Note Folder', 'Folder to save exported chat notes (relative to vault root, leave blank for root)', 'e.g. AI Chats',
                    () => this.plugin.settings.chatNoteFolder ?? '',
                    async (value) => { this.plugin.settings.chatNoteFolder = value ?? ''; await this.plugin.saveSettings(); },
                    { trim: true });

                // YAML Attribute Generators will be a sub-section here conceptually, rendered by its own method
                this.renderYamlAttributeGenerators(sectionEl); // This method creates its own h3, which is fine as a sub-header
            },
            this.plugin,
            'generalSectionsExpanded'
        );
        
        // Section 7: Plugin Behavior
        CollapsibleSectionRenderer.createCollapsibleSection(
            containerEl,
            'Plugin Behavior',
            async (sectionEl: HTMLElement) => {
                this.createToggleSetting(sectionEl, 'Auto-Open Model Settings', 'Automatically open the AI model settings panel when the plugin loads.',
                    () => this.plugin.settings.autoOpenModelSettings,
                    async (value) => { this.plugin.settings.autoOpenModelSettings = value; await this.plugin.saveSettings(); });
            },
            this.plugin,
            'generalSectionsExpanded'        );

        // Section 8: Backup Management
        CollapsibleSectionRenderer.createCollapsibleSection(
            containerEl,
            'Backup Management',
            async (sectionEl: HTMLElement) => {
                await this.renderBackupManagement(sectionEl);
            },
            this.plugin,
            'generalSectionsExpanded'
        );


        // Reset All Settings to Default (remains at the bottom, not collapsible)
        new Setting(containerEl)
            .setName('Reset All Settings to Default')
            .setDesc('Reset all plugin settings (except API keys) to their original default values.')
            .addButton(button => button
                .setButtonText('Reset')
                .onClick(async () => {
                    const { DEFAULT_SETTINGS } = await import('./types');
                    const { DEFAULT_TITLE_PROMPT } = await import('./promptConstants');

                    // Preserve API keys
                    const preservedApiKeys = {
                        openai: this.plugin.settings.openaiSettings.apiKey,
                        anthropic: this.plugin.settings.anthropicSettings.apiKey,
                        gemini: this.plugin.settings.geminiSettings.apiKey,
                    };

                    // Reset all settings to default, then restore preserved API keys
                    this.plugin.settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
                    this.plugin.settings.openaiSettings.apiKey = preservedApiKeys.openai;
                    this.plugin.settings.anthropicSettings.apiKey = preservedApiKeys.anthropic;
                    this.plugin.settings.geminiSettings.apiKey = preservedApiKeys.gemini;
                    this.plugin.settings.titlePrompt = DEFAULT_TITLE_PROMPT;

                    await this.plugin.saveSettings();
                    this.display(); // Re-render the settings to show updated values

                    // Force ModelSettingsView to refresh if open
                    if (typeof this.plugin.activateView === 'function') {
                        setTimeout(() => {
                            this.plugin.activateView(VIEW_TYPE_MODEL_SETTINGS);
                        }, 100);
                    }
                    new Notice('All settings (except API keys) reset to default.');
                }));

        // The following settings were previously at the end or mixed in.
        // They are now grouped into the collapsible sections above.
        // - Title Output Mode (moved to Content & Chat Customization)
        // - Summary Output Mode (moved to Content & Chat Customization)
        // - Expand Linked Notes Recursively & Max Depth (moved to Note & Data Handling)
        // - Chat Note Folder (moved to Note & Data Handling)
        // - Agent Mode Settings (now its own collapsible section under Agent Configuration)
        // - Auto-Open Model Settings (moved to Plugin Behavior)
        // - renderYamlAttributeGenerators (called within Note & Data Handling)
        // - renderToolToggles (now its own collapsible section Agent Tools)
        // - renderModelSettingPresets (now its own collapsible section Model Setting Presets)
    }

    /**
     * Renders the Backup Management section.
     * @param containerEl The HTML element to append the section to.
     */
    private async renderBackupManagement(containerEl: HTMLElement): Promise<void> {
        containerEl.createEl('h3', { text: 'Backup Management' });
        containerEl.createEl('div', {
            text: 'Manage backups created when files are modified by AI tools. Backups are stored in the plugin data folder, not in your vault.',
            cls: 'setting-item-description',
            attr: { style: 'margin-bottom: 1em;' }
        });

        const backupManager = this.plugin.backupManager;
        
        // Show backup statistics
        const totalBackups = await backupManager.getTotalBackupCount();
        const totalSize = await backupManager.getTotalBackupSize();
        const sizeInKB = Math.round(totalSize / 1024);
          containerEl.createEl('div', {
            text: `Total backups: ${totalBackups} (${sizeInKB} KB)`,
            cls: 'setting-item-description',
            attr: { style: 'margin-bottom: 1em; font-weight: bold;' }
        });

        // Add refresh button
        const refreshButton = containerEl.createEl('button', {
            text: 'Refresh Backup List',
            cls: 'mod-cta'
        });
        refreshButton.style.marginBottom = '1em';
        refreshButton.onclick = () => {
            this.display(); // Refresh the entire settings view
        };

        // Get all files with backups
        const backupFiles = await backupManager.getAllBackupFiles();
        
        if (backupFiles.length === 0) {
            containerEl.createEl('div', {
                text: 'No backups found.',
                cls: 'setting-item-description'
            });
            return;
        }

        // Create backup list
        for (const filePath of backupFiles) {
            const backups = await backupManager.getBackupsForFile(filePath);
            
            if (backups.length === 0) continue;

            // File header
            const fileSection = containerEl.createDiv({ cls: 'backup-file-section' });
            fileSection.createEl('h4', { text: filePath, cls: 'backup-file-path' });
            
            // Backups for this file
            const backupList = fileSection.createDiv({ cls: 'backup-list' });
            
            backups.forEach((backup, index) => {
                const backupItem = backupList.createDiv({ cls: 'backup-item' });
                
                // Backup info
                const backupInfo = backupItem.createDiv({ cls: 'backup-info' });
                backupInfo.createEl('span', { 
                    text: `${backup.readableTimestamp} (${Math.round(backup.content.length / 1024)} KB)`,
                    cls: 'backup-timestamp'
                });
                
                // Backup actions
                const backupActions = backupItem.createDiv({ cls: 'backup-actions' });
                
                // Restore button
                const restoreBtn = backupActions.createEl('button', {
                    text: 'Restore',
                    cls: 'mod-cta'
                });
                restoreBtn.onclick = async () => {                    const confirmed = await this.showConfirmationDialog(
                        'Restore Backup',
                        `Are you sure you want to restore the backup from ${backup.readableTimestamp}? This will overwrite the current file content.`
                    );
                    
                    if (confirmed) {
                        try {
                            const result = await backupManager.restoreBackup(backup);
                            if (result.success) {
                                new Notice(`Successfully restored backup for ${filePath}`);
                            } else {
                                new Notice(`Failed to restore backup: ${result.error}`);
                            }
                        } catch (error) {
                            new Notice(`Error restoring backup: ${error.message}`);
                        }
                    }
                };
                
                // Delete button
                const deleteBtn = backupActions.createEl('button', {
                    text: 'Delete',
                    cls: 'mod-warning'
                });                deleteBtn.onclick = async () => {
                    const confirmed = await this.showConfirmationDialog(
                        'Delete Backup',
                        `Are you sure you want to delete the backup from ${backup.readableTimestamp}?`
                    );
                    
                    if (confirmed) {
                        try {
                            await backupManager.deleteSpecificBackup(filePath, backup.timestamp);
                            new Notice(`Deleted backup for ${filePath}`);
                            this.display(); // Refresh the settings view
                        } catch (error) {
                            new Notice(`Error deleting backup: ${error.message}`);
                        }
                    }
                };
                
                // Preview button (show first 200 characters)
                const previewBtn = backupActions.createEl('button', {
                    text: 'Preview',
                    cls: 'mod-muted'
                });
                previewBtn.onclick = () => {
                    const preview = backup.content.substring(0, 200);
                    const truncated = backup.content.length > 200 ? '...' : '';
                    new Notice(`Preview: ${preview}${truncated}`, 10000);
                };
            });
            
            // Delete all backups for this file
            const deleteAllBtn = fileSection.createEl('button', {
                text: `Delete All Backups for ${filePath}`,
                cls: 'mod-warning'
            });            deleteAllBtn.onclick = async () => {
                const confirmed = await this.showConfirmationDialog(
                    'Delete All Backups',
                    `Are you sure you want to delete all ${backups.length} backups for ${filePath}?`
                );
                
                if (confirmed) {
                    try {
                        await backupManager.deleteBackupsForFile(filePath);
                        new Notice(`Deleted all backups for ${filePath}`);
                        this.display(); // Refresh the settings view
                    } catch (error) {
                        new Notice(`Error deleting backups: ${error.message}`);
                    }
                }
            };
        }
    }

    /**
     * Shows a confirmation dialog
     */
    private showConfirmationDialog(title: string, message: string): Promise<boolean> {
        return new Promise((resolve) => {
            const modal = document.createElement('div');
            modal.className = 'modal';
            modal.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background-color: rgba(0, 0, 0, 0.5);
                display: flex;
                justify-content: center;
                align-items: center;
                z-index: 1000;
            `;
            
            const content = modal.createDiv();
            content.className = 'modal-content';
            content.style.cssText = `
                background-color: var(--background-primary);
                padding: 2rem;
                border-radius: 8px;
                max-width: 400px;
                width: 90%;
                box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            `;
            
            content.createEl('h3', { text: title });
            content.createEl('p', { text: message });
            
            const buttonContainer = content.createDiv();
            buttonContainer.style.cssText = `
                display: flex;
                gap: 1rem;
                justify-content: flex-end;
                margin-top: 1rem;
            `;
            
            const cancelBtn = buttonContainer.createEl('button', { text: 'Cancel' });
            cancelBtn.onclick = () => {
                document.body.removeChild(modal);
                resolve(false);
            };
            
            const confirmBtn = buttonContainer.createEl('button', { text: 'Confirm', cls: 'mod-cta' });
            confirmBtn.onclick = () => {
                document.body.removeChild(modal);
                resolve(true);
            };
            
            document.body.appendChild(modal);
            
            // Close on background click
            modal.onclick = (e) => {
                if (e.target === modal) {
                    document.body.removeChild(modal);
                    resolve(false);
                }
            };
        });
    }
}
