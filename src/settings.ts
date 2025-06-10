import { App, PluginSettingTab, Setting, Notice } from 'obsidian';
import { MyPluginSettings } from './types';
import MyPlugin from './main';
import { VIEW_TYPE_MODEL_SETTINGS } from './main'; // Import the constant
import { SettingsSections } from './components/chat/SettingsSections';
import { CollapsibleSectionRenderer } from './components/chat/CollapsibleSection';
import { DEFAULT_TITLE_PROMPT } from './prompts';
import { DEFAULT_SETTINGS } from './types';

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
            const setting = new Setting(containerEl)
                .setName(preset.name)
                .setDesc('Edit or remove this preset');

            this.configureTextInput(setting.addText(text => text), 'Preset Name', () => preset.name, async (value) => {
                preset.name = value ?? '';
                await this.plugin.saveSettings();
                this.display();
            });
            this.configureTextInput(setting.addText(text => text), 'Model ID (provider:model)', () => preset.selectedModel || '', async (value) => {
                preset.selectedModel = value ?? '';
                await this.plugin.saveSettings();
            });
            this.configureTextInput(setting.addTextArea(text => text), 'System message', () => preset.systemMessage || '', async (value) => {
                preset.systemMessage = value ?? '';
                await this.plugin.saveSettings();
            });
            this.createSliderSetting(setting.controlEl, 'Temperature', '', { min: 0, max: 1, step: 0.1 }, () => preset.temperature ?? 0.7, async (value) => {
                preset.temperature = value;
                await this.plugin.saveSettings();
            });
            this.configureTextInput(setting.addText(text => text), 'Max tokens', () => preset.maxTokens?.toString() || '', async (value) => {
                const num = parseInt(value ?? '', 10);
                preset.maxTokens = isNaN(num) ? undefined : num;
                await this.plugin.saveSettings();
            });
            this.createToggleSetting(setting.controlEl, 'Enable Streaming', '', () => preset.enableStreaming ?? true, async (value) => {
                preset.enableStreaming = value;
                await this.plugin.saveSettings();
            });

            setting.addExtraButton(btn => btn
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
     * Display the settings tab.
     * This method orchestrates the rendering of all setting sections.
     */
    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        containerEl.createEl('h2', { text: 'AI Assistant Settings' });

        // API Keys Section
        containerEl.createEl('h3', { text: 'API Keys' });
        this.createTextSetting(containerEl, 'OpenAI API Key', 'Enter your OpenAI API key', 'Enter your API key',
            () => this.plugin.settings.openaiSettings.apiKey,
            async (value) => { this.plugin.settings.openaiSettings.apiKey = value ?? ''; await this.plugin.saveSettings(); });
        this.createTextSetting(containerEl, 'OpenAI Base URL', 'Custom base URL for OpenAI API (optional, leave empty for default)', 'https://api.openai.com/v1',
            () => this.plugin.settings.openaiSettings.baseUrl || '',
            async (value) => { this.plugin.settings.openaiSettings.baseUrl = value; await this.plugin.saveSettings(); },
            { trim: true, undefinedIfEmpty: true });
        this.createTextSetting(containerEl, 'Anthropic API Key', 'Enter your Anthropic API key', 'Enter your API key',
            () => this.plugin.settings.anthropicSettings.apiKey,
            async (value) => { this.plugin.settings.anthropicSettings.apiKey = value ?? ''; await this.plugin.saveSettings(); });
        this.createTextSetting(containerEl, 'Google API Key', 'Enter your Google API key', 'Enter your API key',
            () => this.plugin.settings.geminiSettings.apiKey,
            async (value) => { this.plugin.settings.geminiSettings.apiKey = value ?? ''; await this.plugin.saveSettings(); });
        this.createTextSetting(containerEl, 'Ollama Server URL', 'Enter your Ollama server URL (default: http://localhost:11434)', 'http://localhost:11434',
            () => this.plugin.settings.ollamaSettings.serverUrl,
            async (value) => { this.plugin.settings.ollamaSettings.serverUrl = value ?? ''; await this.plugin.saveSettings(); });

        // Unified AI Model Settings Section
        CollapsibleSectionRenderer.createCollapsibleSection(
            containerEl,
            'AI Model Settings',
            async (sectionEl: HTMLElement) => {
                await this.settingsSections.renderAIModelSettings(sectionEl, () => this.display());
            },
            this.plugin,
            'generalSectionsExpanded'
        );

        this.createTextSetting(containerEl, 'Chat Separator', 'The string used to separate chat messages.', '----',
            () => this.plugin.settings.chatSeparator ?? '',
            async (value) => { this.plugin.settings.chatSeparator = value ?? ''; await this.plugin.saveSettings(); });
        this.createTextSetting(containerEl, 'Chat Start String', 'The string that indicates where to start taking the note for context.', '===START===',
            () => this.plugin.settings.chatStartString ?? '',
            async (value) => { this.plugin.settings.chatStartString = value ?? ''; await this.plugin.saveSettings(); });
        this.createTextSetting(containerEl, 'Chat End String', 'The string that indicates where to end taking the note for context.', '===END===',
            () => this.plugin.settings.chatEndString ?? '',
            async (value) => { this.plugin.settings.chatEndString = value ?? ''; await this.plugin.saveSettings(); });
        this.createTextSetting(containerEl, 'Title Prompt', 'The prompt used for generating note titles.', 'You are a title generator...',
            () => this.plugin.settings.titlePrompt,
            async (value) => { this.plugin.settings.titlePrompt = value ?? ''; await this.plugin.saveSettings(); },
            { isTextArea: true });

        // Reset All Settings to Default
        new Setting(containerEl)
            .setName('Reset All Settings to Default')
            .setDesc('Reset all plugin settings (except API keys) to their original default values.')
            .addButton(button => button
                .setButtonText('Reset')
                .onClick(async () => {
                    const { DEFAULT_SETTINGS } = await import('./types');
                    const { DEFAULT_TITLE_PROMPT } = await import('./prompts');

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

        this.createDropdownSetting(containerEl, 'Title Output Mode', 'Choose what to do with the generated note title.',
            { 'clipboard': 'Copy to clipboard', 'replace-filename': 'Replace note filename', 'metadata': 'Insert into metadata' },
            () => this.plugin.settings.titleOutputMode ?? 'clipboard',
            async (value) => { this.plugin.settings.titleOutputMode = value as any; await this.plugin.saveSettings(); });

        this.createDropdownSetting(containerEl, 'Summary Output Mode', 'Choose what to do with the generated note summary.',
            { 'clipboard': 'Copy to clipboard', 'metadata': 'Insert into metadata' },
            () => this.plugin.settings.summaryOutputMode ?? 'clipboard',
            async (value) => { this.plugin.settings.summaryOutputMode = value as any; await this.plugin.saveSettings(); });

        this.createToggleSetting(containerEl, 'Expand Linked Notes Recursively', 'If enabled, when fetching a note, also fetch and expand links within that note recursively (prevents infinite loops).',
            () => this.plugin.settings.expandLinkedNotesRecursively ?? false,
            async (value) => { this.plugin.settings.expandLinkedNotesRecursively = value; await this.plugin.saveSettings(); },
            () => this.display()); // Re-render to show/hide the slider

        if (this.plugin.settings.expandLinkedNotesRecursively) {
            this.createSliderSetting(containerEl, 'Max Link Expansion Depth', 'Maximum depth for recursively expanding linked notes (1-3).',
                { min: 1, max: 3, step: 1 },
                () => this.plugin.settings.maxLinkExpansionDepth ?? 2,
                async (value) => { this.plugin.settings.maxLinkExpansionDepth = value; await this.plugin.saveSettings(); });
        }

        this.createTextSetting(containerEl, 'Chat Note Folder', 'Folder to save exported chat notes (relative to vault root, leave blank for root)', 'e.g. AI Chats',
            () => this.plugin.settings.chatNoteFolder ?? '',
            async (value) => { this.plugin.settings.chatNoteFolder = value ?? ''; await this.plugin.saveSettings(); },
            { trim: true });

        this.renderYamlAttributeGenerators(containerEl);
        this.renderModelSettingPresets(containerEl);
    }
}
