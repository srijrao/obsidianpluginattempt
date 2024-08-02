'use strict';

var obsidian = require('obsidian');

class ModelSettingsView extends obsidian.ItemView {
    plugin;
    constructor(leaf, plugin) {
        super(leaf);
        this.plugin = plugin;
    }
    getViewType() {
        return VIEW_TYPE_MODEL_SETTINGS;
    }
    getDisplayText() {
        return 'Model Settings';
    }
    async onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl('h2', { text: 'OpenAI Model Settings' });
        new obsidian.Setting(contentEl)
            .setName('System Message')
            .setDesc('Set the system message for the AI')
            .addTextArea(text => text
            .setPlaceholder('You are a helpful assistant.')
            .setValue(this.plugin.settings.systemMessage)
            .onChange(async (value) => {
            this.plugin.settings.systemMessage = value;
            await this.plugin.saveSettings();
        }));
        new obsidian.Setting(contentEl)
            .setName('Include Date with System Message')
            .setDesc('Add the current date to the system message')
            .addToggle(toggle => toggle
            .setValue(this.plugin.settings.includeDateWithSystemMessage)
            .onChange(async (value) => {
            this.plugin.settings.includeDateWithSystemMessage = value;
            await this.plugin.saveSettings();
        }));
        new obsidian.Setting(contentEl)
            .setName('Enable Streaming')
            .setDesc('Enable or disable streaming for completions')
            .addToggle(toggle => toggle
            .setValue(this.plugin.settings.enableStreaming)
            .onChange(async (value) => {
            this.plugin.settings.enableStreaming = value;
            await this.plugin.saveSettings();
        }));
        new obsidian.Setting(contentEl)
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
        new obsidian.Setting(contentEl)
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
        new obsidian.Setting(contentEl)
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
const DEFAULT_SETTINGS = {
    apiKey: '',
    model: 'gpt-4o',
    temperature: 0.7,
    maxTokens: 1000,
    availableModels: [],
    systemMessage: 'You are a helpful assistant.',
    includeDateWithSystemMessage: false,
    enableStreaming: true // Added this line
};
const VIEW_TYPE_MODEL_SETTINGS = 'model-settings-view';
async function fetchAvailableModels(apiKey) {
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
        return data.data.map((model) => model.id).filter((id) => id.startsWith('gpt-'));
    }
    catch (error) {
        console.error('Error fetching models:', error);
        return [];
    }
}
function parseSelection(selection) {
    const lines = selection.split('\n');
    let messages = [];
    let currentRole = 'user';
    let currentContent = '';
    for (const line of lines) {
        if (line.trim() === '----') {
            if (currentContent.trim()) {
                messages.push({ role: currentRole, content: currentContent.trim() });
            }
            currentRole = currentRole === 'user' ? 'assistant' : 'user';
            currentContent = '';
        }
        else {
            currentContent += line + '\n';
        }
    }
    if (currentContent.trim()) {
        messages.push({ role: currentRole, content: currentContent.trim() });
    }
    return messages;
}
class MyPlugin extends obsidian.Plugin {
    settings;
    modelSettingsView = null;
    activeStream = null;
    async onload() {
        await this.loadSettings();
        await this.populateSettingDefaults();
        this.addSettingTab(new MyPluginSettingTab(this.app, this));
        this.registerView(VIEW_TYPE_MODEL_SETTINGS, (leaf) => new ModelSettingsView(leaf, this));
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
                }
                else {
                    const lineNumber = editor.getCursor().line;
                    const documentText = editor.getValue();
                    const lines = documentText.split('\n').slice(0, lineNumber);
                    text = lines.join('\n');
                    insertPosition = { line: lineNumber + 1, ch: 0 }; // Insert after the current line
                }
                const messages = parseSelection(text);
                editor.replaceRange('\n\n----\n\n', insertPosition);
                let currentPosition = {
                    line: insertPosition.line + 3,
                    ch: 0
                };
                this.activeStream = new AbortController(); // Create new AbortController
                await this.callOpenAI(messages, (chunk) => {
                    editor.replaceRange(chunk, currentPosition);
                    currentPosition = editor.offsetToPos(editor.posToOffset(currentPosition) + chunk.length);
                }, this.activeStream);
                const newCursorPos = editor.offsetToPos(editor.posToOffset(currentPosition) + 2);
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
                    new obsidian.Notice('OpenAI stream ended');
                }
                else {
                    new obsidian.Notice('No active OpenAI stream to end');
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
        this.registerInterval(window.setInterval(async () => {
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
        }
        else {
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
    async callOpenAI(messages, callback, abortController) {
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
                if (done)
                    break;
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
        }
        catch (error) {
            if (error.name === 'AbortError') {
                console.log('Stream was aborted');
            }
            else {
                console.error('Error calling OpenAI:', error);
                new obsidian.Notice(`Error: Unable to get completion. ${error.message}`);
                callback(`Error: Unable to get completion. ${error.message}`);
            }
        }
        finally {
            this.activeStream = null; // Reset the active stream
        }
    }
    async populateSettingDefaults() {
        if (!this.settings.availableModels || this.settings.availableModels.length === 0) {
            await this.refreshAvailableModels();
        }
    }
    ensureLeafExists(active = false) {
        let { workspace } = this.app;
        let leaf = workspace.getLeavesOfType(VIEW_TYPE_MODEL_SETTINGS)[0];
        if (leaf) {
            leaf.setViewState({
                type: VIEW_TYPE_MODEL_SETTINGS,
                active: active
            });
            this.modelSettingsView = leaf.view;
            if (this.modelSettingsView) {
                this.modelSettingsView.onOpen();
            }
        }
        else {
            console.warn('No right leaf available for model settings view');
            return;
        }
        if (active && leaf) {
            workspace.revealLeaf(leaf);
        }
    }
    async refreshAvailableModels() {
        try {
            this.settings.availableModels = await fetchAvailableModels(this.settings.apiKey);
            await this.saveSettings();
            if (this.modelSettingsView) {
                this.modelSettingsView.onOpen();
            }
        }
        catch (error) {
            new obsidian.Notice('Error refreshing available models. Please try again later.');
        }
    }
}
class MyPluginSettingTab extends obsidian.PluginSettingTab {
    plugin;
    constructor(app, plugin) {
        super(app, plugin);
        this.plugin = plugin;
    }
    display() {
        const { containerEl } = this;
        containerEl.empty();
        new obsidian.Setting(containerEl)
            .setName('Refresh Available Models')
            .setDesc('Fetch the latest available models from OpenAI')
            .addButton(button => button
            .setButtonText('Refresh')
            .onClick(async () => {
            await this.plugin.refreshAvailableModels();
            this.display(); // Redraw the settings tab
        }));
        new obsidian.Setting(containerEl)
            .setName('System Message')
            .setDesc('Set the system message for the AI')
            .addTextArea(text => text
            .setPlaceholder('You are a helpful assistant.')
            .setValue(this.plugin.settings.systemMessage)
            .onChange(async (value) => {
            this.plugin.settings.systemMessage = value;
            await this.plugin.saveSettings();
        }));
        new obsidian.Setting(containerEl)
            .setName('Include Date with System Message')
            .setDesc('Add the current date to the system message')
            .addToggle(toggle => toggle
            .setValue(this.plugin.settings.includeDateWithSystemMessage)
            .onChange(async (value) => {
            this.plugin.settings.includeDateWithSystemMessage = value;
            await this.plugin.saveSettings();
        }));
        new obsidian.Setting(containerEl)
            .setName('API Key')
            .setDesc('Enter your OpenAI API key')
            .addText(text => text
            .setPlaceholder('Enter your API key')
            .setValue(this.plugin.settings.apiKey)
            .onChange(async (value) => {
            this.plugin.settings.apiKey = value;
            await this.plugin.saveSettings();
        }));
        new obsidian.Setting(containerEl)
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
        new obsidian.Setting(containerEl)
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
        new obsidian.Setting(containerEl)
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

module.exports = MyPlugin;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpbi5qcyIsInNvdXJjZXMiOltdLCJzb3VyY2VzQ29udGVudCI6W10sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OyJ9
