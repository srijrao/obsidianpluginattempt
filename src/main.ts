import { App, Plugin, PluginSettingTab, Setting, WorkspaceLeaf, ItemView, Notice, TFile } from 'obsidian';
import { MyPluginSettings, Message, DEFAULT_SETTINGS } from './types';
import { createProvider } from './providers';

const VIEW_TYPE_MODEL_SETTINGS = 'model-settings-view';

/**
 * AI Model Settings View
 * 
 * This view provides a user interface for configuring AI model settings.
 * It allows users to:
 * - Select their preferred AI provider (OpenAI, Anthropic, Gemini, Ollama)
 * - Configure provider-specific settings like API keys and models
 * - Adjust common settings like temperature and token limits
 * - Test API connections and refresh available models
 */
class ModelSettingsView extends ItemView {
    plugin: MyPlugin;

    constructor(leaf: WorkspaceLeaf, plugin: MyPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType(): string {
        return VIEW_TYPE_MODEL_SETTINGS;
    }

    getDisplayText(): string {
        return 'AI Model Settings';
    }

    async onOpen() {
        const { contentEl } = this;
        contentEl.empty();

        contentEl.createEl('h2', { text: 'AI Model Settings' });

        // Common Settings Section
        contentEl.createEl('h3', { text: 'Common Settings' });

        new Setting(contentEl)
            .setName('AI Provider')
            .setDesc('Choose which AI provider to use')
            .addDropdown(dropdown => {
                dropdown
                    .addOption('openai', 'OpenAI (GPT-3.5, GPT-4)')
                    .addOption('anthropic', 'Anthropic (Claude)')
                    .addOption('gemini', 'Google (Gemini)')
                    .addOption('ollama', 'Ollama (Local AI)')
                    .setValue(this.plugin.settings.provider)
                    .onChange(async (value: 'openai' | 'anthropic' | 'gemini' | 'ollama') => {
                        this.plugin.settings.provider = value;
                        await this.plugin.saveSettings();
                        // Refresh view to show provider-specific settings
                        this.onOpen();
                    });
            });

        new Setting(contentEl)
            .setName('System Message')
            .setDesc('Set the system message for the AI')
            .addTextArea(text => text
                .setPlaceholder('You are a helpful assistant.')
                .setValue(this.plugin.settings.systemMessage)
                .onChange(async (value) => {
                    this.plugin.settings.systemMessage = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(contentEl)
            .setName('Include Date with System Message')
            .setDesc('Add the current date to the system message')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.includeDateWithSystemMessage)
                .onChange(async (value) => {
                    this.plugin.settings.includeDateWithSystemMessage = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(contentEl)
            .setName('Include Time with System Message')
            .setDesc('Add the current time along with the date to the system message')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.includeTimeWithSystemMessage)
                .onChange(async (value) => {
                    this.plugin.settings.includeTimeWithSystemMessage = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(contentEl)
            .setName('Enable Obsidian Links')
            .setDesc('Read Obsidian links in messages using [[filename]] syntax')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableObsidianLinks)
                .onChange(async (value) => {
                    this.plugin.settings.enableObsidianLinks = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(contentEl)
            .setName('Enable Streaming')
            .setDesc('Enable or disable streaming for completions')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableStreaming)
                .onChange(async (value) => {
                    this.plugin.settings.enableStreaming = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(contentEl)
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

        new Setting(contentEl)
            .setName('Max Tokens')
            .setDesc('Set the maximum length of the model\'s output')
            .addText(text => text
                .setPlaceholder('4000')
                .setValue(String(this.plugin.settings.maxTokens))
                .onChange(async (value) => {
                    const numValue = Number(value);
                    if (!isNaN(numValue)) {
                        this.plugin.settings.maxTokens = numValue;
                        await this.plugin.saveSettings();
                    }
                }));

        // Provider-specific settings section
        contentEl.createEl('h3', { text: `${this.plugin.settings.provider.toUpperCase()} Settings` });

        switch (this.plugin.settings.provider) {
            case 'openai':
                this.renderOpenAISettings(contentEl);
                break;
            case 'anthropic':
                this.renderAnthropicSettings(contentEl);
                break;
            case 'gemini':
                this.renderGeminiSettings(contentEl);
                break;
            case 'ollama':
                this.renderOllamaSettings(contentEl);
                break;
        }
    }

    private renderOpenAISettings(containerEl: HTMLElement) {
        const settings = this.plugin.settings.openaiSettings;

        new Setting(containerEl)
            .setName('API Key')
            .setDesc('Enter your OpenAI API key')
            .addText(text => text
                .setPlaceholder('Enter your API key')
                .setValue(settings.apiKey)
                .onChange(async (value) => {
                    settings.apiKey = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Test Connection')
            .setDesc('Verify your API key and fetch available models')
            .addButton(button => button
                .setButtonText('Test')
                .onClick(async () => {
                    button.setButtonText('Testing...');
                    button.setDisabled(true);

                    try {
                        const provider = createProvider(this.plugin.settings);
                        const result = await provider.testConnection();
                        
                        if (result.success && result.models) {
                            settings.availableModels = result.models;
                            await this.plugin.saveSettings();
                            settings.lastTestResult = {
                                timestamp: Date.now(),
                                success: true,
                                message: result.message
                            };
                            new Notice(result.message);
                            this.onOpen(); // Refresh view
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

        new Setting(containerEl)
            .setName('Model')
            .setDesc('Choose the OpenAI model to use')
            .addDropdown(dropdown => {
                for (const model of settings.availableModels) {
                    dropdown.addOption(model, model);
                }
                dropdown
                    .setValue(settings.model)
                    .onChange(async (value) => {
                        settings.model = value;
                        await this.plugin.saveSettings();
                    });
            });
    }

    private renderAnthropicSettings(containerEl: HTMLElement) {
        const settings = this.plugin.settings.anthropicSettings;

        new Setting(containerEl)
            .setName('API Key')
            .setDesc('Enter your Anthropic API key')
            .addText(text => text
                .setPlaceholder('Enter your API key')
                .setValue(settings.apiKey)
                .onChange(async (value) => {
                    settings.apiKey = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Test Connection')
            .setDesc('Verify your API key and fetch available models')
            .addButton(button => button
                .setButtonText('Test')
                .onClick(async () => {
                    button.setButtonText('Testing...');
                    button.setDisabled(true);

                    try {
                        const provider = createProvider(this.plugin.settings);
                        const result = await provider.testConnection();
                        
                        if (result.success && result.models) {
                            settings.availableModels = result.models;
                            await this.plugin.saveSettings();
                            settings.lastTestResult = {
                                timestamp: Date.now(),
                                success: true,
                                message: result.message
                            };
                            new Notice(result.message);
                            this.onOpen(); // Refresh view
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

        new Setting(containerEl)
            .setName('Model')
            .setDesc('Choose the Anthropic model to use')
            .addDropdown(dropdown => {
                for (const model of settings.availableModels) {
                    dropdown.addOption(model, model);
                }
                dropdown
                    .setValue(settings.model)
                    .onChange(async (value) => {
                        settings.model = value;
                        await this.plugin.saveSettings();
                    });
            });
    }

    private renderGeminiSettings(containerEl: HTMLElement) {
        const settings = this.plugin.settings.geminiSettings;

        new Setting(containerEl)
            .setName('API Key')
            .setDesc('Enter your Google API key')
            .addText(text => text
                .setPlaceholder('Enter your API key')
                .setValue(settings.apiKey)
                .onChange(async (value) => {
                    settings.apiKey = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Test Connection')
            .setDesc('Verify your API key and fetch available models')
            .addButton(button => button
                .setButtonText('Test')
                .onClick(async () => {
                    button.setButtonText('Testing...');
                    button.setDisabled(true);

                    try {
                        const provider = createProvider(this.plugin.settings);
                        const result = await provider.testConnection();
                        
                        if (result.success && result.models) {
                            settings.availableModels = result.models;
                            await this.plugin.saveSettings();
                            settings.lastTestResult = {
                                timestamp: Date.now(),
                                success: true,
                                message: result.message
                            };
                            new Notice(result.message);
                            this.onOpen(); // Refresh view
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

        new Setting(containerEl)
            .setName('Model')
            .setDesc('Choose the Gemini model to use')
            .addDropdown(dropdown => {
                for (const model of settings.availableModels) {
                    dropdown.addOption(model, model);
                }
                dropdown
                    .setValue(settings.model)
                    .onChange(async (value) => {
                        settings.model = value;
                        await this.plugin.saveSettings();
                    });
            });
    }

    private renderOllamaSettings(containerEl: HTMLElement) {
        const settings = this.plugin.settings.ollamaSettings;

        new Setting(containerEl)
            .setName('Server URL')
            .setDesc('Enter your Ollama server URL (default: http://localhost:11434)')
            .addText(text => text
                .setPlaceholder('http://localhost:11434')
                .setValue(settings.serverUrl)
                .onChange(async (value) => {
                    settings.serverUrl = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Test Connection')
            .setDesc('Check server connection and fetch available models')
            .addButton(button => button
                .setButtonText('Test')
                .onClick(async () => {
                    button.setButtonText('Testing...');
                    button.setDisabled(true);

                    try {
                        const provider = createProvider(this.plugin.settings);
                        const result = await provider.testConnection();
                        
                        if (result.success && result.models) {
                            settings.availableModels = result.models;
                            await this.plugin.saveSettings();
                            settings.lastTestResult = {
                                timestamp: Date.now(),
                                success: true,
                                message: result.message
                            };
                            new Notice(result.message);
                            this.onOpen(); // Refresh view
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

        new Setting(containerEl)
            .setName('Model')
            .setDesc('Choose the Ollama model to use')
            .addDropdown(dropdown => {
                for (const model of settings.availableModels) {
                    dropdown.addOption(model, model);
                }
                dropdown
                    .setValue(settings.model)
                    .onChange(async (value) => {
                        settings.model = value;
                        await this.plugin.saveSettings();
                    });
            });

        // Add help text for Ollama setup
        containerEl.createEl('div', {
            cls: 'setting-item-description',
            text: 'To use Ollama:'
        });
        const steps = containerEl.createEl('ol');
        steps.createEl('li', { text: 'Install Ollama from https://ollama.ai' });
        steps.createEl('li', { text: 'Start the Ollama server' });
        steps.createEl('li', { text: 'Pull models using "ollama pull model-name"' });
        steps.createEl('li', { text: 'Test connection to see available models' });
    }

    async onClose() {
        // Clean up any resources if needed
    }
}

/**
 * Parses a given text selection into an array of message objects
 * 
 * The function interprets lines of text separated by '----' as boundaries
 * between user and assistant messages.
 * 
 * @param selection - The text selection to parse
 * @returns Array of message objects with roles and content
 */
function parseSelection(selection: string): Message[] {
    const lines = selection.split('\n');
    let messages: Message[] = [];
    let currentRole: 'user' | 'assistant' = 'user';
    let currentContent = '';

    for (const line of lines) {
        if (line.trim() === '----') {
            if (currentContent.trim()) {
                messages.push({ role: currentRole, content: currentContent.trim() });
            }
            currentRole = currentRole === 'user' ? 'assistant' : 'user';
            currentContent = '';
        } else {
            currentContent += line + '\n';
        }
    }

    if (currentContent.trim()) {
        messages.push({ role: currentRole, content: currentContent.trim() });
    }

    return messages;
}

/**
 * AI Assistant Plugin
 * 
 * This plugin adds AI capabilities to Obsidian, supporting multiple providers:
 * - OpenAI (GPT-3.5, GPT-4)
 * - Anthropic (Claude)
 * - Google (Gemini)
 * - Ollama (Local AI)
 * 
 * Features:
 * - Chat with AI models
 * - Stream responses in real-time
 * - Configure model settings
 * - Test API connections
 * - Use local AI models through Ollama
 */
export default class MyPlugin extends Plugin {
    settings: MyPluginSettings;
    modelSettingsView: ModelSettingsView | null = null;
    activeStream: AbortController | null = null;

    async onload() {
        await this.loadSettings();

        this.addSettingTab(new MyPluginSettingTab(this.app, this));

        this.registerView(
            VIEW_TYPE_MODEL_SETTINGS,
            (leaf) => new ModelSettingsView(leaf, this)
        );

        this.addRibbonIcon('gear', 'Open AI Settings', () => {
            this.activateView();
        });

        this.app.workspace.onLayoutReady(() => {
            if (this.settings.autoOpenModelSettings) {
                this.activateView();
            }
        });

        this.addCommand({
            id: 'ai-completion',
            name: 'Get AI Completion',
            editorCallback: async (editor) => {
                let text;
                let insertPosition;

                if (editor.somethingSelected()) {
                    text = editor.getSelection();
                    insertPosition = editor.getCursor('to');
                } else {
                    const lineNumber = editor.getCursor().line;
                    const documentText = editor.getValue();
                    const lines = documentText.split('\n').slice(0, lineNumber + 1);
                    text = lines.join('\n');
                    insertPosition = { line: lineNumber + 1, ch: 0 };
                }

                const messages = parseSelection(text);

                editor.replaceRange('\n\n----\n\n', insertPosition);
                let currentPosition = {
                    line: insertPosition.line + 3,
                    ch: 0
                };

                this.activeStream = new AbortController();

                try {
                    const provider = createProvider(this.settings);
                    await provider.getCompletion(
                        [
                            { role: 'system', content: this.getSystemMessage() },
                            ...messages
                        ],
                        {
                            temperature: this.settings.temperature,
                            maxTokens: this.settings.maxTokens,
                            streamCallback: (chunk: string) => {
                                editor.replaceRange(chunk, currentPosition);
                                currentPosition = editor.offsetToPos(
                                    editor.posToOffset(currentPosition) + chunk.length
                                );
                            },
                            abortController: this.activeStream
                        }
                    );

                    editor.replaceRange('\n\n----\n\n', currentPosition);
                    const newCursorPos = editor.offsetToPos(
                        editor.posToOffset(currentPosition) + 8
                    );
                    editor.setCursor(newCursorPos);
                } catch (error) {
                    new Notice(`Error: ${error.message}`);
                    editor.replaceRange(`Error: ${error.message}\n\n----\n\n`, currentPosition);
                } finally {
                    this.activeStream = null;
                }
            }
        });

        this.addCommand({
            id: 'end-ai-stream',
            name: 'End AI Stream',
            callback: () => {
                if (this.activeStream) {
                    this.activeStream.abort();
                    this.activeStream = null;
                    new Notice('AI stream ended');
                } else {
                    new Notice('No active AI stream to end');
                }
            }
        });

        this.addCommand({
            id: 'show-ai-settings',
            name: 'Show AI Settings',
            callback: () => {
                this.activateView();
            }
        });
    }

    private getSystemMessage(): string {
        let systemMessage = this.settings.systemMessage;
        
        if (this.settings.includeDateWithSystemMessage) {
            const currentDate = new Date().toISOString().split('T')[0];
            if (this.settings.includeTimeWithSystemMessage) {
                const currentTime = new Date().toLocaleTimeString();
                systemMessage = `${systemMessage} The current date and time is ${currentDate} ${currentTime}.`;
            } else {
                systemMessage = `${systemMessage} The current date is ${currentDate}.`;
            }
        }

        return systemMessage;
    }

    async activateView() {
        this.app.workspace.detachLeavesOfType(VIEW_TYPE_MODEL_SETTINGS);

        let leaf = this.app.workspace.getRightLeaf(false);
        if (leaf) {
            await leaf.setViewState({
                type: VIEW_TYPE_MODEL_SETTINGS,
                active: true,
            });
            this.app.workspace.revealLeaf(leaf);
        } else {
            leaf = this.app.workspace.getLeaf(true);
            await leaf.setViewState({
                type: VIEW_TYPE_MODEL_SETTINGS,
                active: true,
            });
        }
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    /**
     * Processes a message content to include Obsidian note contents
     * 
     * If a link is found, retrieves the note content and appends it after the link.
     * 
     * @param content The message content to process
     * @returns The processed content with note contents included
     */
    async processObsidianLinks(content: string): Promise<string> {
        if (!this.settings.enableObsidianLinks) return content;

        const linkRegex = /\[\[(.*?)\]\]/g;
        let match;
        let processedContent = content;
        
        while ((match = linkRegex.exec(content)) !== null) {
            const fileName = match[1];
            try {
                const file = this.app.vault.getAbstractFileByPath(`${fileName}.md`);
                if (file && file instanceof TFile) {
                    const noteContent = await this.app.vault.cachedRead(file);
                    processedContent = processedContent.replace(
                        match[0],
                        `${match[0]}\n${fileName}:\n${noteContent}\n`
                    );
                }
            } catch (error) {
                console.error(`Error processing Obsidian link for ${fileName}:`, error);
            }
        }
        
        return processedContent;
    }
}

/**
 * Plugin Settings Tab
 * 
 * This tab provides a user interface for configuring the plugin settings.
 * It automatically opens the model settings view when settings are changed.
 */
class MyPluginSettingTab extends PluginSettingTab {
    plugin: MyPlugin;

    constructor(app: App, plugin: MyPlugin) {
        super(app, plugin);
        this.plugin = plugin;
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

        new Setting(containerEl)
            .setName('Auto-open Model Settings')
            .setDesc('Automatically open model settings when Obsidian starts')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.autoOpenModelSettings)
                .onChange(async (value) => {
                    this.plugin.settings.autoOpenModelSettings = value;
                    await this.plugin.saveSettings();
                }));

        // Add a button to open model settings
        new Setting(containerEl)
            .setName('Open Model Settings')
            .setDesc('Open the model settings view')
            .addButton(button => button
                .setButtonText('Open')
                .onClick(() => {
                    this.plugin.activateView();
                }));
    }
}
