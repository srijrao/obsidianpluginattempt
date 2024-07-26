'use strict';

var obsidian = require('obsidian');

/******************************************************************************
Copyright (c) Microsoft Corporation.

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.
***************************************************************************** */
/* global Reflect, Promise, SuppressedError, Symbol */


function __awaiter(thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
}

typeof SuppressedError === "function" ? SuppressedError : function (error, suppressed, message) {
    var e = new Error(message);
    return e.name = "SuppressedError", e.error = error, e.suppressed = suppressed, e;
};

class ModelSettingsView extends obsidian.ItemView {
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
    onOpen() {
        return __awaiter(this, void 0, void 0, function* () {
            const { contentEl } = this;
            contentEl.empty();
            contentEl.createEl('h2', { text: 'OpenAI Model Settings' });
            new obsidian.Setting(contentEl)
                .setName('System Message')
                .setDesc('Set the system message for the AI')
                .addTextArea(text => text
                .setPlaceholder('You are a helpful assistant.')
                .setValue(this.plugin.settings.systemMessage)
                .onChange((value) => __awaiter(this, void 0, void 0, function* () {
                this.plugin.settings.systemMessage = value;
                yield this.plugin.saveSettings();
            })));
            new obsidian.Setting(contentEl)
                .setName('Include Date with System Message')
                .setDesc('Add the current date to the system message')
                .addToggle(toggle => toggle
                .setValue(this.plugin.settings.includeDateWithSystemMessage)
                .onChange((value) => __awaiter(this, void 0, void 0, function* () {
                this.plugin.settings.includeDateWithSystemMessage = value;
                yield this.plugin.saveSettings();
            })));
            new obsidian.Setting(contentEl)
                .setName('Model')
                .setDesc('Choose the OpenAI model to use')
                .addDropdown(dropdown => {
                for (const model of this.plugin.settings.availableModels) {
                    dropdown.addOption(model, model);
                }
                dropdown
                    .setValue(this.plugin.settings.model)
                    .onChange((value) => __awaiter(this, void 0, void 0, function* () {
                    this.plugin.settings.model = value;
                    yield this.plugin.saveSettings();
                }));
            });
            new obsidian.Setting(contentEl)
                .setName('Temperature')
                .setDesc('Set the randomness of the model\'s output (0-1)')
                .addSlider(slider => slider
                .setLimits(0, 1, 0.1)
                .setValue(this.plugin.settings.temperature)
                .setDynamicTooltip()
                .onChange((value) => __awaiter(this, void 0, void 0, function* () {
                this.plugin.settings.temperature = value;
                yield this.plugin.saveSettings();
            })));
            new obsidian.Setting(contentEl)
                .setName('Max Tokens')
                .setDesc('Set the maximum length of the model\'s output')
                .addText(text => text
                .setPlaceholder('4000')
                .setValue(String(this.plugin.settings.maxTokens))
                .onChange((value) => __awaiter(this, void 0, void 0, function* () {
                const numValue = Number(value);
                if (!isNaN(numValue)) {
                    this.plugin.settings.maxTokens = numValue;
                    yield this.plugin.saveSettings();
                }
            })));
        });
    }
    onClose() {
        return __awaiter(this, void 0, void 0, function* () {
            // Clean up any resources if needed
        });
    }
}
const DEFAULT_SETTINGS = {
    apiKey: '',
    model: 'gpt-3.5-turbo',
    temperature: 0.7,
    maxTokens: 1000,
    availableModels: [],
    systemMessage: 'You are a helpful assistant.', // Add this line
    includeDateWithSystemMessage: false // Add this line
};
const VIEW_TYPE_MODEL_SETTINGS = 'model-settings-view';
function fetchAvailableModels(apiKey) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const response = yield fetch('https://api.openai.com/v1/models', {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                }
            });
            if (!response.ok) {
                console.error('OpenAI API error:', response.status, yield response.text());
                return [];
            }
            const data = yield response.json();
            return data.data.map((model) => model.id).filter((id) => id.startsWith('gpt-'));
        }
        catch (error) {
            console.error('Error fetching models:', error);
            return [];
        }
    });
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
    constructor() {
        super(...arguments);
        this.modelSettingsView = null;
        this.activeStream = null;
    }
    onload() {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.loadSettings();
            yield this.populateSettingDefaults();
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
                editorCallback: (editor, view) => __awaiter(this, void 0, void 0, function* () {
                    let text;
                    let insertPosition;
                    if (editor.somethingSelected()) {
                        text = editor.getSelection();
                        insertPosition = editor.getCursor('to');
                    }
                    else {
                        const lineNumber = editor.getCursor().line;
                        text = editor.getLine(lineNumber);
                        insertPosition = { line: lineNumber, ch: text.length };
                    }
                    const messages = parseSelection(text);
                    editor.replaceRange('\n\n----\n\n', insertPosition);
                    let currentPosition = {
                        line: insertPosition.line + 3,
                        ch: 0
                    };
                    this.activeStream = new AbortController(); // Create new AbortController
                    yield this.callOpenAI(messages, (chunk) => {
                        editor.replaceRange(chunk, currentPosition);
                        currentPosition = editor.offsetToPos(editor.posToOffset(currentPosition) + chunk.length);
                    }, this.activeStream);
                    const newCursorPos = editor.offsetToPos(editor.posToOffset(currentPosition) + 2);
                    editor.setCursor(newCursorPos);
                })
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
            this.registerInterval(window.setInterval(() => __awaiter(this, void 0, void 0, function* () {
                if (this.settings.apiKey) {
                    yield this.refreshAvailableModels();
                }
            }), 3600000) // Refresh every hour
            );
        });
    }
    activateView() {
        return __awaiter(this, void 0, void 0, function* () {
            this.app.workspace.detachLeavesOfType(VIEW_TYPE_MODEL_SETTINGS);
            let leaf = this.app.workspace.getRightLeaf(false);
            if (leaf) {
                yield leaf.setViewState({
                    type: VIEW_TYPE_MODEL_SETTINGS,
                    active: true,
                });
                this.app.workspace.revealLeaf(leaf);
            }
            else {
                // If we couldn't get a right leaf, try to create a new leaf
                leaf = this.app.workspace.getLeaf(true);
                yield leaf.setViewState({
                    type: VIEW_TYPE_MODEL_SETTINGS,
                    active: true,
                });
            }
        });
    }
    loadSettings() {
        return __awaiter(this, void 0, void 0, function* () {
            this.settings = Object.assign({}, DEFAULT_SETTINGS, yield this.loadData());
        });
    }
    saveSettings() {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.saveData(this.settings);
        });
    }
    callOpenAI(messages, callback, abortController) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c;
            try {
                let systemMessage = this.settings.systemMessage;
                if (this.settings.includeDateWithSystemMessage) {
                    const currentDate = new Date().toISOString().split('T')[0];
                    systemMessage = `${systemMessage} The current date is ${currentDate}.`;
                }
                const response = yield fetch('https://api.openai.com/v1/chat/completions', {
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
                        stream: true
                    }),
                    signal: abortController.signal
                });
                if (!response.ok) {
                    throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
                }
                const reader = (_a = response.body) === null || _a === void 0 ? void 0 : _a.getReader();
                const decoder = new TextDecoder('utf-8');
                while (true) {
                    const { done, value } = (yield (reader === null || reader === void 0 ? void 0 : reader.read())) || { done: true, value: undefined };
                    if (done)
                        break;
                    const chunk = decoder.decode(value);
                    const lines = chunk.split('\n');
                    for (const line of lines) {
                        if (line.startsWith('data: ') && line !== 'data: [DONE]') {
                            const data = JSON.parse(line.slice(6));
                            const content = (_c = (_b = data.choices[0]) === null || _b === void 0 ? void 0 : _b.delta) === null || _c === void 0 ? void 0 : _c.content;
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
                    callback(`Error: Unable to get completion. ${error.message}`);
                }
            }
            finally {
                this.activeStream = null; // Reset the active stream
            }
        });
    }
    populateSettingDefaults() {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.settings.availableModels || this.settings.availableModels.length === 0) {
                yield this.refreshAvailableModels();
            }
        });
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
    refreshAvailableModels() {
        return __awaiter(this, void 0, void 0, function* () {
            this.settings.availableModels = yield fetchAvailableModels(this.settings.apiKey);
            yield this.saveSettings();
            if (this.modelSettingsView) {
                this.modelSettingsView.onOpen();
            }
        });
    }
}
class MyPluginSettingTab extends obsidian.PluginSettingTab {
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
            .onClick(() => __awaiter(this, void 0, void 0, function* () {
            yield this.plugin.refreshAvailableModels();
            this.display(); // Redraw the settings tab
        })));
        new obsidian.Setting(containerEl)
            .setName('System Message')
            .setDesc('Set the system message for the AI')
            .addTextArea(text => text
            .setPlaceholder('You are a helpful assistant.')
            .setValue(this.plugin.settings.systemMessage)
            .onChange((value) => __awaiter(this, void 0, void 0, function* () {
            this.plugin.settings.systemMessage = value;
            yield this.plugin.saveSettings();
        })));
        new obsidian.Setting(containerEl)
            .setName('Include Date with System Message')
            .setDesc('Add the current date to the system message')
            .addToggle(toggle => toggle
            .setValue(this.plugin.settings.includeDateWithSystemMessage)
            .onChange((value) => __awaiter(this, void 0, void 0, function* () {
            this.plugin.settings.includeDateWithSystemMessage = value;
            yield this.plugin.saveSettings();
        })));
        new obsidian.Setting(containerEl)
            .setName('API Key')
            .setDesc('Enter your OpenAI API key')
            .addText(text => text
            .setPlaceholder('Enter your API key')
            .setValue(this.plugin.settings.apiKey)
            .onChange((value) => __awaiter(this, void 0, void 0, function* () {
            this.plugin.settings.apiKey = value;
            yield this.plugin.saveSettings();
        })));
        new obsidian.Setting(containerEl)
            .setName('Model')
            .setDesc('Choose the OpenAI model to use')
            .addDropdown(dropdown => {
            for (const model of this.plugin.settings.availableModels) {
                dropdown.addOption(model, model);
            }
            dropdown.setValue(this.plugin.settings.model)
                .onChange((value) => __awaiter(this, void 0, void 0, function* () {
                this.plugin.settings.model = value;
                yield this.plugin.saveSettings();
            }));
        });
        new obsidian.Setting(containerEl)
            .setName('Temperature')
            .setDesc('Set the randomness of the model\'s output (0-1)')
            .addSlider(slider => slider
            .setLimits(0, 1, .1)
            .setValue(this.plugin.settings.temperature)
            .setDynamicTooltip()
            .onChange((value) => __awaiter(this, void 0, void 0, function* () {
            this.plugin.settings.temperature = value;
            yield this.plugin.saveSettings();
        })));
        new obsidian.Setting(containerEl)
            .setName('Max Tokens')
            .setDesc('Set the maximum length of the model\'s output')
            .addText(text => text
            .setPlaceholder('4000')
            .setValue(String(this.plugin.settings.maxTokens))
            .onChange((value) => __awaiter(this, void 0, void 0, function* () {
            const numValue = Number(value);
            if (!isNaN(numValue)) {
                this.plugin.settings.maxTokens = numValue;
                yield this.plugin.saveSettings();
            }
        })));
    }
}

module.exports = MyPlugin;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpbi5qcyIsInNvdXJjZXMiOltdLCJzb3VyY2VzQ29udGVudCI6W10sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7In0=
