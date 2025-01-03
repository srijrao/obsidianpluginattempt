import { App, Plugin, PluginSettingTab, Setting, WorkspaceLeaf, ItemView, Notice } from 'obsidian';

/**
 * Represents a view for managing OpenAI model settings within the plugin.
 * Extends the ItemView class to provide a user interface for configuring
 * various settings related to the OpenAI model, such as system message,
 * model selection, temperature, and token limits.
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
        return 'Model Settings';
    }

    async onOpen() {
        const { contentEl } = this;
        contentEl.empty();

        contentEl.createEl('h2', { text: 'OpenAI Model Settings' });

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
            .setName('Enable Streaming')
            .setDesc('Enable or disable streaming for completions')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableStreaming)
                .onChange(async (value) => {
                    this.plugin.settings.enableStreaming = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(contentEl)
            .setName('Model')
            .setDesc('Choose the OpenAI model to use')
            .addDropdown(dropdown => {
                for (const model of this.plugin.settings.availableModels) {
                    dropdown.addOption(model, model);
                }
                dropdown
                    .setValue(this.plugin.settings.model)
                    .onChange(async (value) => {
                        this.plugin.settings.model = value;
                        await this.plugin.saveSettings();
                    });
            });

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
    }

    async onClose() {
        // Clean up any resources if needed
    }
}
interface MyPluginSettings {
    apiKey: string;
    model: string;
    temperature: number;
    maxTokens: number;
    availableModels: string[];
    systemMessage: string;
    includeDateWithSystemMessage: boolean;
    enableStreaming: boolean; // Added this line
}

const DEFAULT_SETTINGS: MyPluginSettings = {
    apiKey: '',
    model: 'gpt-4o',
    temperature: 0.7,
    maxTokens: 1000,
    availableModels: [],
    systemMessage: 'You are a helpful assistant.',
    includeDateWithSystemMessage: false,
    enableStreaming: true // Added this line
}

const VIEW_TYPE_MODEL_SETTINGS = 'model-settings-view';
/**
 * Fetches the list of available OpenAI models using the provided API key.
 * 
 * This function sends a GET request to the OpenAI API to retrieve the list of models.
 * It filters the models to include only those whose IDs start with 'gpt-'.
 * 
 * @param {string} apiKey - The API key used for authenticating the request to the OpenAI API.
 * @returns {Promise<string[]>} A promise that resolves to an array of model IDs that start with 'gpt-'.
 *                              If an error occurs during the fetch operation, the promise resolves to an empty array.
 * 
 * @throws Will log an error message to the console if the API request fails or if there is an error during the fetch operation.
 */
async function fetchAvailableModels(apiKey: string): Promise<string[]> {
    try {
        const response = await fetch('https://api.openai.com/v1/models', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            console.error('OpenAI API error:', response.status, await response.text());
            return [];
        }

        const data = await response.json();
        return data.data.map((model: any) => model.id).filter((id: string) => id.startsWith('gpt-'));
    } catch (error) {
        console.error('Error fetching models:', error);
        return [];
    }
}
/**
 * Parses a given text selection into an array of message objects, each containing a role and content.
 * The function interprets lines of text separated by '----' as boundaries between user and assistant messages.
 * 
 * @param {string} selection - The text selection to parse, expected to contain alternating user and assistant messages.
 * @returns {Array<{ role: string; content: string }>} An array of message objects, where each object has a 'role' 
 * indicating either 'user' or 'assistant', and 'content' containing the message text.
 * 
 * The function processes the input text line by line, switching roles whenever it encounters a line with '----'.
 * It accumulates lines into the current message content until a boundary is reached, at which point it stores the 
 * message and switches roles. The final message is added to the array if it contains any content.
 */
function parseSelection(selection: string): Array<{ role: string; content: string }> {
    const lines = selection.split('\n');
    let messages: Array<{ role: string; content: string }> = [];
    let currentRole = 'user';
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
 * MyPlugin is a class that extends the Plugin class to provide functionality for managing OpenAI model settings
 * and interacting with the OpenAI API within the Obsidian application. It includes features such as loading and
 * saving settings, activating a custom view for model settings, and handling commands for OpenAI completions.
 * 
 * Key Features:
 * - Loads and saves plugin settings, including API key, model selection, and other configuration options.
 * - Provides a custom view for managing OpenAI model settings, accessible via a ribbon icon and command.
 * - Supports streaming of OpenAI completions with the ability to abort active streams.
 * - Periodically refreshes the list of available OpenAI models using the provided API key.
 * 
 * Methods:
 * - onload: Initializes the plugin by loading settings, adding a settings tab, registering views and commands,
 *   and setting up periodic model refresh.
 * - activateView: Activates the custom view for model settings, creating a new leaf if necessary.
 * - loadSettings: Loads the plugin settings from storage, merging with default settings.
 * - saveSettings: Saves the current plugin settings to storage.
 * - callOpenAI: Sends a request to the OpenAI API for chat completions, handling streaming responses and errors.
 * - populateSettingDefaults: Ensures default settings are populated, including fetching available models if needed.
 * - ensureLeafExists: Ensures a leaf exists for the model settings view, activating it if specified.
 * - refreshAvailableModels: Fetches the latest available OpenAI models and updates the settings.
 */
export default class MyPlugin extends Plugin {
    settings: MyPluginSettings;
    modelSettingsView: ModelSettingsView | null = null;
    activeStream: AbortController | null = null;

    async onload() {
        await this.loadSettings();
        await this.populateSettingDefaults();

        this.addSettingTab(new MyPluginSettingTab(this.app, this));

        this.registerView(
            VIEW_TYPE_MODEL_SETTINGS,
            (leaf) => new ModelSettingsView(leaf, this)
        );

        this.addRibbonIcon('gear', 'Open Model Settings', () => {
            this.activateView();
        });

        this.app.workspace.onLayoutReady(() => {
            this.activateView();
        });


        this.addCommand({
            id: 'openai-completion',
            name: 'Get OpenAI Completion',
            editorCallback: async (editor, view) => {
                let text;
                let insertPosition;

                if (editor.somethingSelected()) {
                    text = editor.getSelection();
                    insertPosition = editor.getCursor('to');
                } else {
                    const lineNumber = editor.getCursor().line;
                    const documentText = editor.getValue();
                    const lines = documentText.split('\n').slice(0, lineNumber + 1); // Include the current line
                    text = lines.join('\n');
                    insertPosition = { line: lineNumber + 1, ch: 0 }; // Insert after the current line
                }

                const messages = parseSelection(text);

                editor.replaceRange('\n\n----\n\n', insertPosition);
                let currentPosition = {
                    line: insertPosition.line + 3,
                    ch: 0
                };

                this.activeStream = new AbortController();  // Create new AbortController

                await this.callOpenAI(messages, (chunk) => {
                    editor.replaceRange(chunk, currentPosition);
                    currentPosition = editor.offsetToPos(editor.posToOffset(currentPosition) + chunk.length);
                }, this.activeStream);

                // Add "----" at the end of the OpenAI completion
                editor.replaceRange('\n\n----\n\n', currentPosition);
                const newCursorPos = editor.offsetToPos(
                    editor.posToOffset(currentPosition) + 8 // Adjust for the length of "\n\n----"
                );
                editor.setCursor(newCursorPos);
            }
        });


        this.addCommand({
            id: 'end-openai-stream',
            name: 'End OpenAI Stream',
            callback: () => {
                if (this.activeStream) {
                    this.activeStream.abort();
                    this.activeStream = null;
                    new Notice('OpenAI stream ended');
                } else {
                    new Notice('No active OpenAI stream to end');
                }
            }
        });
        this.addCommand({
            id: 'show-model-settings',
            name: 'Show Model Settings',
            callback: () => {
                this.ensureLeafExists(true);
            }
        });


        this.registerInterval(
            window.setInterval(async () => {
                if (this.settings.apiKey) {
                    await this.refreshAvailableModels();
                }
            }, 3600000) // Refresh every hour
        );
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
            // If we couldn't get a right leaf, try to create a new leaf
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

    async callOpenAI(messages: Array<{ role: string; content: string }>, callback: (chunk: string) => void, abortController: AbortController): Promise<void> {
        try {
            let systemMessage = this.settings.systemMessage;
            if (this.settings.includeDateWithSystemMessage) {
                const currentDate = new Date().toISOString().split('T')[0];
                systemMessage = `${systemMessage} The current date is ${currentDate}.`;
            }

            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.settings.apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: this.settings.model,
                    messages: [
                        { role: "system", content: systemMessage },
                        ...messages
                    ],
                    temperature: this.settings.temperature,
                    max_tokens: this.settings.maxTokens,
                    stream: this.settings.enableStreaming // Use the streaming setting
                }),
                signal: abortController.signal
            });

            if (!response.ok) {
                throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
            }

            const reader = response.body?.getReader();
            const decoder = new TextDecoder('utf-8');

            while (true) {
                const { done, value } = await reader?.read() || { done: true, value: undefined };
                if (done) break;

                const chunk = decoder.decode(value);
                const lines = chunk.split('\n');
                for (const line of lines) {
                    if (line.startsWith('data: ') && line !== 'data: [DONE]') {
                        const data = JSON.parse(line.slice(6));
                        const content = data.choices[0]?.delta?.content;
                        if (content) {
                            callback(content);
                        }
                    }
                }
            }
        } catch (error) {
            if (error.name === 'AbortError') {
                console.log('Stream was aborted');
            } else {
                console.error('Error calling OpenAI:', error);
                new Notice(`Error: Unable to get completion. ${error.message}`);
                callback(`Error: Unable to get completion. ${error.message}`);
            }
        } finally {
            this.activeStream = null;  // Reset the active stream
        }
    }

    async populateSettingDefaults() {
        if (!this.settings.availableModels || this.settings.availableModels.length === 0) {
            await this.refreshAvailableModels();
        }
    }

    ensureLeafExists(active: boolean = false): void {
        let { workspace } = this.app;
        let leaf = workspace.getLeavesOfType(VIEW_TYPE_MODEL_SETTINGS)[0];

        if (leaf) {
            leaf.setViewState({
                type: VIEW_TYPE_MODEL_SETTINGS,
                active: active
            });
            this.modelSettingsView = leaf.view as ModelSettingsView;
            if (this.modelSettingsView) {
                this.modelSettingsView.onOpen();
            }
        } else {
            console.warn('No right leaf available for model settings view');
            return;
        }


        if (active && leaf) {
            workspace.revealLeaf(leaf);
        }
    }
    async refreshAvailableModels(): Promise<void> {
        try {
            this.settings.availableModels = await fetchAvailableModels(this.settings.apiKey);
            await this.saveSettings();
            if (this.modelSettingsView) {
                this.modelSettingsView.onOpen();
            }
        } catch (error) {
            new Notice('Error refreshing available models. Please try again later.');
        }
    }

}

/**
 * MyPluginSettingTab is a class that extends PluginSettingTab to provide a user interface
 * for configuring the settings of the MyPlugin within the Obsidian application.
 * 
 * This class is responsible for rendering the settings tab where users can adjust various
 * configuration options related to the OpenAI model, such as API key, model selection,
 * system message, and other parameters.
 * 
 * Key Features:
 * - Provides a button to refresh the list of available OpenAI models.
 * - Allows users to set a custom system message for the AI.
 * - Includes an option to append the current date to the system message.
 * - Enables users to input their OpenAI API key for authentication.
 * - Offers a dropdown menu for selecting the desired OpenAI model from the available options.
 * - Provides a slider to adjust the temperature, controlling the randomness of the model's output.
 * - Allows users to specify the maximum number of tokens for the model's output.
 * 
 * Methods:
 * - constructor: Initializes the setting tab with the given app and plugin instances.
 * - display: Renders the settings UI, including all available configuration options and controls.
 */
class MyPluginSettingTab extends PluginSettingTab {
    plugin: MyPlugin;

    constructor(app: App, plugin: MyPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();
        new Setting(containerEl)
            .setName('Refresh Available Models')
            .setDesc('Fetch the latest available models from OpenAI')
            .addButton(button => button
                .setButtonText('Refresh')
                .onClick(async () => {
                    await this.plugin.refreshAvailableModels();
                    this.display(); // Redraw the settings tab
                }));
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
            .setName('Include Date with System Message')
            .setDesc('Add the current date to the system message')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.includeDateWithSystemMessage)
                .onChange(async (value) => {
                    this.plugin.settings.includeDateWithSystemMessage = value;
                    await this.plugin.saveSettings();
                }));
        new Setting(containerEl)
            .setName('API Key')
            .setDesc('Enter your OpenAI API key')
            .addText(text => text
                .setPlaceholder('Enter your API key')
                .setValue(this.plugin.settings.apiKey)
                .onChange(async (value) => {
                    this.plugin.settings.apiKey = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Model')
            .setDesc('Choose the OpenAI model to use')
            .addDropdown(dropdown => {
                for (const model of this.plugin.settings.availableModels) {
                    dropdown.addOption(model, model);
                }
                dropdown.setValue(this.plugin.settings.model)
                    .onChange(async (value) => {
                        this.plugin.settings.model = value;
                        await this.plugin.saveSettings();
                    });
            });

        new Setting(containerEl)
            .setName('Temperature')
            .setDesc('Set the randomness of the model\'s output (0-1)')
            .addSlider(slider => slider
                .setLimits(0, 1, .1)
                .setValue(this.plugin.settings.temperature)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.plugin.settings.temperature = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
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
    }
}

