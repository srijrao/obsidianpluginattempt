"use strict";
var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        if (typeof b !== "function" && b !== null)
            throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
var obsidian_1 = require("obsidian");
/**
 * Represents a view for managing OpenAI model settings within the plugin.
 * Extends the ItemView class to provide a user interface for configuring
 * various settings related to the OpenAI model, such as system message,
 * model selection, temperature, and token limits.
 */
var ModelSettingsView = /** @class */ (function (_super) {
    __extends(ModelSettingsView, _super);
    function ModelSettingsView(leaf, plugin) {
        var _this = _super.call(this, leaf) || this;
        _this.plugin = plugin;
        return _this;
    }
    ModelSettingsView.prototype.getViewType = function () {
        return VIEW_TYPE_MODEL_SETTINGS;
    };
    ModelSettingsView.prototype.getDisplayText = function () {
        return 'Model Settings';
    };
    ModelSettingsView.prototype.onOpen = function () {
        return __awaiter(this, void 0, void 0, function () {
            var contentEl;
            var _this = this;
            return __generator(this, function (_a) {
                contentEl = this.contentEl;
                contentEl.empty();
                contentEl.createEl('h2', { text: 'OpenAI Model Settings' });
                new obsidian_1.Setting(contentEl)
                    .setName('System Message')
                    .setDesc('Set the system message for the AI')
                    .addTextArea(function (text) { return text
                    .setPlaceholder('You are a helpful assistant.')
                    .setValue(_this.plugin.settings.systemMessage)
                    .onChange(function (value) { return __awaiter(_this, void 0, void 0, function () {
                    return __generator(this, function (_a) {
                        switch (_a.label) {
                            case 0:
                                this.plugin.settings.systemMessage = value;
                                return [4 /*yield*/, this.plugin.saveSettings()];
                            case 1:
                                _a.sent();
                                return [2 /*return*/];
                        }
                    });
                }); }); });
                new obsidian_1.Setting(contentEl)
                    .setName('Include Date with System Message')
                    .setDesc('Add the current date to the system message')
                    .addToggle(function (toggle) { return toggle
                    .setValue(_this.plugin.settings.includeDateWithSystemMessage)
                    .onChange(function (value) { return __awaiter(_this, void 0, void 0, function () {
                    return __generator(this, function (_a) {
                        switch (_a.label) {
                            case 0:
                                this.plugin.settings.includeDateWithSystemMessage = value;
                                return [4 /*yield*/, this.plugin.saveSettings()];
                            case 1:
                                _a.sent();
                                return [2 /*return*/];
                        }
                    });
                }); }); });
                new obsidian_1.Setting(contentEl)
                    .setName('Enable Streaming')
                    .setDesc('Enable or disable streaming for completions')
                    .addToggle(function (toggle) { return toggle
                    .setValue(_this.plugin.settings.enableStreaming)
                    .onChange(function (value) { return __awaiter(_this, void 0, void 0, function () {
                    return __generator(this, function (_a) {
                        switch (_a.label) {
                            case 0:
                                this.plugin.settings.enableStreaming = value;
                                return [4 /*yield*/, this.plugin.saveSettings()];
                            case 1:
                                _a.sent();
                                return [2 /*return*/];
                        }
                    });
                }); }); });
                new obsidian_1.Setting(contentEl)
                    .setName('Model')
                    .setDesc('Choose the OpenAI model to use')
                    .addDropdown(function (dropdown) {
                    for (var _i = 0, _a = _this.plugin.settings.availableModels; _i < _a.length; _i++) {
                        var model = _a[_i];
                        dropdown.addOption(model, model);
                    }
                    dropdown
                        .setValue(_this.plugin.settings.model)
                        .onChange(function (value) { return __awaiter(_this, void 0, void 0, function () {
                        return __generator(this, function (_a) {
                            switch (_a.label) {
                                case 0:
                                    this.plugin.settings.model = value;
                                    return [4 /*yield*/, this.plugin.saveSettings()];
                                case 1:
                                    _a.sent();
                                    return [2 /*return*/];
                            }
                        });
                    }); });
                });
                new obsidian_1.Setting(contentEl)
                    .setName('Temperature')
                    .setDesc('Set the randomness of the model\'s output (0-1)')
                    .addSlider(function (slider) { return slider
                    .setLimits(0, 1, 0.1)
                    .setValue(_this.plugin.settings.temperature)
                    .setDynamicTooltip()
                    .onChange(function (value) { return __awaiter(_this, void 0, void 0, function () {
                    return __generator(this, function (_a) {
                        switch (_a.label) {
                            case 0:
                                this.plugin.settings.temperature = value;
                                return [4 /*yield*/, this.plugin.saveSettings()];
                            case 1:
                                _a.sent();
                                return [2 /*return*/];
                        }
                    });
                }); }); });
                new obsidian_1.Setting(contentEl)
                    .setName('Max Tokens')
                    .setDesc('Set the maximum length of the model\'s output')
                    .addText(function (text) { return text
                    .setPlaceholder('4000')
                    .setValue(String(_this.plugin.settings.maxTokens))
                    .onChange(function (value) { return __awaiter(_this, void 0, void 0, function () {
                    var numValue;
                    return __generator(this, function (_a) {
                        switch (_a.label) {
                            case 0:
                                numValue = Number(value);
                                if (!!isNaN(numValue)) return [3 /*break*/, 2];
                                this.plugin.settings.maxTokens = numValue;
                                return [4 /*yield*/, this.plugin.saveSettings()];
                            case 1:
                                _a.sent();
                                _a.label = 2;
                            case 2: return [2 /*return*/];
                        }
                    });
                }); }); });
                return [2 /*return*/];
            });
        });
    };
    ModelSettingsView.prototype.onClose = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/];
            });
        });
    };
    return ModelSettingsView;
}(obsidian_1.ItemView));
var DEFAULT_SETTINGS = {
    apiKey: '',
    model: 'gpt-4o',
    temperature: 0.7,
    maxTokens: 1000,
    availableModels: [],
    systemMessage: 'You are a helpful assistant.',
    includeDateWithSystemMessage: false,
    enableStreaming: true // Added this line
};
var VIEW_TYPE_MODEL_SETTINGS = 'model-settings-view';
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
function fetchAvailableModels(apiKey) {
    return __awaiter(this, void 0, void 0, function () {
        var response, _a, _b, _c, data, error_1;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0:
                    _d.trys.push([0, 5, , 6]);
                    return [4 /*yield*/, fetch('https://api.openai.com/v1/models', {
                            method: 'GET',
                            headers: {
                                'Authorization': "Bearer ".concat(apiKey),
                                'Content-Type': 'application/json'
                            }
                        })];
                case 1:
                    response = _d.sent();
                    if (!!response.ok) return [3 /*break*/, 3];
                    _b = (_a = console).error;
                    _c = ['OpenAI API error:', response.status];
                    return [4 /*yield*/, response.text()];
                case 2:
                    _b.apply(_a, _c.concat([_d.sent()]));
                    return [2 /*return*/, []];
                case 3: return [4 /*yield*/, response.json()];
                case 4:
                    data = _d.sent();
                    return [2 /*return*/, data.data.map(function (model) { return model.id; }).filter(function (id) { return id.startsWith('gpt-'); })];
                case 5:
                    error_1 = _d.sent();
                    console.error('Error fetching models:', error_1);
                    return [2 /*return*/, []];
                case 6: return [2 /*return*/];
            }
        });
    });
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
function parseSelection(selection) {
    var lines = selection.split('\n');
    var messages = [];
    var currentRole = 'user';
    var currentContent = '';
    for (var _i = 0, lines_1 = lines; _i < lines_1.length; _i++) {
        var line = lines_1[_i];
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
var MyPlugin = /** @class */ (function (_super) {
    __extends(MyPlugin, _super);
    function MyPlugin() {
        var _this = _super !== null && _super.apply(this, arguments) || this;
        _this.modelSettingsView = null;
        _this.activeStream = null;
        return _this;
    }
    MyPlugin.prototype.onload = function () {
        return __awaiter(this, void 0, void 0, function () {
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.loadSettings()];
                    case 1:
                        _a.sent();
                        return [4 /*yield*/, this.populateSettingDefaults()];
                    case 2:
                        _a.sent();
                        this.addSettingTab(new MyPluginSettingTab(this.app, this));
                        this.registerView(VIEW_TYPE_MODEL_SETTINGS, function (leaf) { return new ModelSettingsView(leaf, _this); });
                        this.addRibbonIcon('gear', 'Open Model Settings', function () {
                            _this.activateView();
                        });
                        this.app.workspace.onLayoutReady(function () {
                            _this.activateView();
                        });
                        this.addCommand({
                            id: 'openai-completion',
                            name: 'Get OpenAI Completion',
                            editorCallback: function (editor, view) { return __awaiter(_this, void 0, void 0, function () {
                                var text, insertPosition, lineNumber, documentText, lines, messages, currentPosition, newCursorPos;
                                return __generator(this, function (_a) {
                                    switch (_a.label) {
                                        case 0:
                                            if (editor.somethingSelected()) {
                                                text = editor.getSelection();
                                                insertPosition = editor.getCursor('to');
                                            }
                                            else {
                                                lineNumber = editor.getCursor().line;
                                                documentText = editor.getValue();
                                                lines = documentText.split('\n').slice(0, lineNumber + 1);
                                                text = lines.join('\n');
                                                insertPosition = { line: lineNumber + 1, ch: 0 }; // Insert after the current line
                                            }
                                            messages = parseSelection(text);
                                            editor.replaceRange('\n\n----\n\n', insertPosition);
                                            currentPosition = {
                                                line: insertPosition.line + 3,
                                                ch: 0
                                            };
                                            this.activeStream = new AbortController(); // Create new AbortController
                                            return [4 /*yield*/, this.callOpenAI(messages, function (chunk) {
                                                    editor.replaceRange(chunk, currentPosition);
                                                    currentPosition = editor.offsetToPos(editor.posToOffset(currentPosition) + chunk.length);
                                                }, this.activeStream)];
                                        case 1:
                                            _a.sent();
                                            // Add "----" at the end of the OpenAI completion
                                            editor.replaceRange('\n\n----\n\n', currentPosition);
                                            newCursorPos = editor.offsetToPos(editor.posToOffset(currentPosition) + 8 // Adjust for the length of "\n\n----"
                                            );
                                            editor.setCursor(newCursorPos);
                                            return [2 /*return*/];
                                    }
                                });
                            }); }
                        });
                        this.addCommand({
                            id: 'end-openai-stream',
                            name: 'End OpenAI Stream',
                            callback: function () {
                                if (_this.activeStream) {
                                    _this.activeStream.abort();
                                    _this.activeStream = null;
                                    new obsidian_1.Notice('OpenAI stream ended');
                                }
                                else {
                                    new obsidian_1.Notice('No active OpenAI stream to end');
                                }
                            }
                        });
                        this.addCommand({
                            id: 'show-model-settings',
                            name: 'Show Model Settings',
                            callback: function () {
                                _this.ensureLeafExists(true);
                            }
                        });
                        this.registerInterval(window.setInterval(function () { return __awaiter(_this, void 0, void 0, function () {
                            return __generator(this, function (_a) {
                                switch (_a.label) {
                                    case 0:
                                        if (!this.settings.apiKey) return [3 /*break*/, 2];
                                        return [4 /*yield*/, this.refreshAvailableModels()];
                                    case 1:
                                        _a.sent();
                                        _a.label = 2;
                                    case 2: return [2 /*return*/];
                                }
                            });
                        }); }, 3600000) // Refresh every hour
                        );
                        return [2 /*return*/];
                }
            });
        });
    };
    MyPlugin.prototype.activateView = function () {
        return __awaiter(this, void 0, void 0, function () {
            var leaf;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        this.app.workspace.detachLeavesOfType(VIEW_TYPE_MODEL_SETTINGS);
                        leaf = this.app.workspace.getRightLeaf(false);
                        if (!leaf) return [3 /*break*/, 2];
                        return [4 /*yield*/, leaf.setViewState({
                                type: VIEW_TYPE_MODEL_SETTINGS,
                                active: true,
                            })];
                    case 1:
                        _a.sent();
                        this.app.workspace.revealLeaf(leaf);
                        return [3 /*break*/, 4];
                    case 2:
                        // If we couldn't get a right leaf, try to create a new leaf
                        leaf = this.app.workspace.getLeaf(true);
                        return [4 /*yield*/, leaf.setViewState({
                                type: VIEW_TYPE_MODEL_SETTINGS,
                                active: true,
                            })];
                    case 3:
                        _a.sent();
                        _a.label = 4;
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    MyPlugin.prototype.loadSettings = function () {
        return __awaiter(this, void 0, void 0, function () {
            var _a, _b, _c, _d;
            return __generator(this, function (_e) {
                switch (_e.label) {
                    case 0:
                        _a = this;
                        _c = (_b = Object).assign;
                        _d = [{}, DEFAULT_SETTINGS];
                        return [4 /*yield*/, this.loadData()];
                    case 1:
                        _a.settings = _c.apply(_b, _d.concat([_e.sent()]));
                        return [2 /*return*/];
                }
            });
        });
    };
    MyPlugin.prototype.saveSettings = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.saveData(this.settings)];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    MyPlugin.prototype.callOpenAI = function (messages, callback, abortController) {
        return __awaiter(this, void 0, void 0, function () {
            var systemMessage, currentDate, response, reader, decoder, _a, done, value, chunk, lines, _i, lines_2, line, data, content, error_2;
            var _b, _c, _d;
            return __generator(this, function (_e) {
                switch (_e.label) {
                    case 0:
                        _e.trys.push([0, 5, 6, 7]);
                        systemMessage = this.settings.systemMessage;
                        if (this.settings.includeDateWithSystemMessage) {
                            currentDate = new Date().toISOString().split('T')[0];
                            systemMessage = "".concat(systemMessage, " The current date is ").concat(currentDate, ".");
                        }
                        return [4 /*yield*/, fetch('https://api.openai.com/v1/chat/completions', {
                                method: 'POST',
                                headers: {
                                    'Authorization': "Bearer ".concat(this.settings.apiKey),
                                    'Content-Type': 'application/json'
                                },
                                body: JSON.stringify({
                                    model: this.settings.model,
                                    messages: __spreadArray([
                                        { role: "system", content: systemMessage }
                                    ], messages, true),
                                    temperature: this.settings.temperature,
                                    max_tokens: this.settings.maxTokens,
                                    stream: this.settings.enableStreaming // Use the streaming setting
                                }),
                                signal: abortController.signal
                            })];
                    case 1:
                        response = _e.sent();
                        if (!response.ok) {
                            throw new Error("OpenAI API error: ".concat(response.status, " ").concat(response.statusText));
                        }
                        reader = (_b = response.body) === null || _b === void 0 ? void 0 : _b.getReader();
                        decoder = new TextDecoder('utf-8');
                        _e.label = 2;
                    case 2:
                        if (!true) return [3 /*break*/, 4];
                        return [4 /*yield*/, (reader === null || reader === void 0 ? void 0 : reader.read())];
                    case 3:
                        _a = (_e.sent()) || { done: true, value: undefined }, done = _a.done, value = _a.value;
                        if (done)
                            return [3 /*break*/, 4];
                        chunk = decoder.decode(value);
                        lines = chunk.split('\n');
                        for (_i = 0, lines_2 = lines; _i < lines_2.length; _i++) {
                            line = lines_2[_i];
                            if (line.startsWith('data: ') && line !== 'data: [DONE]') {
                                data = JSON.parse(line.slice(6));
                                content = (_d = (_c = data.choices[0]) === null || _c === void 0 ? void 0 : _c.delta) === null || _d === void 0 ? void 0 : _d.content;
                                if (content) {
                                    callback(content);
                                }
                            }
                        }
                        return [3 /*break*/, 2];
                    case 4: return [3 /*break*/, 7];
                    case 5:
                        error_2 = _e.sent();
                        if (error_2.name === 'AbortError') {
                            console.log('Stream was aborted');
                        }
                        else {
                            console.error('Error calling OpenAI:', error_2);
                            new obsidian_1.Notice("Error: Unable to get completion. ".concat(error_2.message));
                            callback("Error: Unable to get completion. ".concat(error_2.message));
                        }
                        return [3 /*break*/, 7];
                    case 6:
                        this.activeStream = null; // Reset the active stream
                        return [7 /*endfinally*/];
                    case 7: return [2 /*return*/];
                }
            });
        });
    };
    MyPlugin.prototype.populateSettingDefaults = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!(!this.settings.availableModels || this.settings.availableModels.length === 0)) return [3 /*break*/, 2];
                        return [4 /*yield*/, this.refreshAvailableModels()];
                    case 1:
                        _a.sent();
                        _a.label = 2;
                    case 2: return [2 /*return*/];
                }
            });
        });
    };
    MyPlugin.prototype.ensureLeafExists = function (active) {
        if (active === void 0) { active = false; }
        var workspace = this.app.workspace;
        var leaf = workspace.getLeavesOfType(VIEW_TYPE_MODEL_SETTINGS)[0];
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
    };
    MyPlugin.prototype.refreshAvailableModels = function () {
        return __awaiter(this, void 0, void 0, function () {
            var _a, error_3;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        _b.trys.push([0, 3, , 4]);
                        _a = this.settings;
                        return [4 /*yield*/, fetchAvailableModels(this.settings.apiKey)];
                    case 1:
                        _a.availableModels = _b.sent();
                        return [4 /*yield*/, this.saveSettings()];
                    case 2:
                        _b.sent();
                        if (this.modelSettingsView) {
                            this.modelSettingsView.onOpen();
                        }
                        return [3 /*break*/, 4];
                    case 3:
                        error_3 = _b.sent();
                        new obsidian_1.Notice('Error refreshing available models. Please try again later.');
                        return [3 /*break*/, 4];
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    return MyPlugin;
}(obsidian_1.Plugin));
exports.default = MyPlugin;
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
var MyPluginSettingTab = /** @class */ (function (_super) {
    __extends(MyPluginSettingTab, _super);
    function MyPluginSettingTab(app, plugin) {
        var _this = _super.call(this, app, plugin) || this;
        _this.plugin = plugin;
        return _this;
    }
    MyPluginSettingTab.prototype.display = function () {
        var _this = this;
        var containerEl = this.containerEl;
        containerEl.empty();
        new obsidian_1.Setting(containerEl)
            .setName('Refresh Available Models')
            .setDesc('Fetch the latest available models from OpenAI')
            .addButton(function (button) { return button
            .setButtonText('Refresh')
            .onClick(function () { return __awaiter(_this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.plugin.refreshAvailableModels()];
                    case 1:
                        _a.sent();
                        this.display(); // Redraw the settings tab
                        return [2 /*return*/];
                }
            });
        }); }); });
        new obsidian_1.Setting(containerEl)
            .setName('System Message')
            .setDesc('Set the system message for the AI')
            .addTextArea(function (text) { return text
            .setPlaceholder('You are a helpful assistant.')
            .setValue(_this.plugin.settings.systemMessage)
            .onChange(function (value) { return __awaiter(_this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        this.plugin.settings.systemMessage = value;
                        return [4 /*yield*/, this.plugin.saveSettings()];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        }); }); });
        new obsidian_1.Setting(containerEl)
            .setName('Include Date with System Message')
            .setDesc('Add the current date to the system message')
            .addToggle(function (toggle) { return toggle
            .setValue(_this.plugin.settings.includeDateWithSystemMessage)
            .onChange(function (value) { return __awaiter(_this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        this.plugin.settings.includeDateWithSystemMessage = value;
                        return [4 /*yield*/, this.plugin.saveSettings()];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        }); }); });
        new obsidian_1.Setting(containerEl)
            .setName('API Key')
            .setDesc('Enter your OpenAI API key')
            .addText(function (text) { return text
            .setPlaceholder('Enter your API key')
            .setValue(_this.plugin.settings.apiKey)
            .onChange(function (value) { return __awaiter(_this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        this.plugin.settings.apiKey = value;
                        return [4 /*yield*/, this.plugin.saveSettings()];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        }); }); });
        new obsidian_1.Setting(containerEl)
            .setName('Model')
            .setDesc('Choose the OpenAI model to use')
            .addDropdown(function (dropdown) {
            for (var _i = 0, _a = _this.plugin.settings.availableModels; _i < _a.length; _i++) {
                var model = _a[_i];
                dropdown.addOption(model, model);
            }
            dropdown.setValue(_this.plugin.settings.model)
                .onChange(function (value) { return __awaiter(_this, void 0, void 0, function () {
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            this.plugin.settings.model = value;
                            return [4 /*yield*/, this.plugin.saveSettings()];
                        case 1:
                            _a.sent();
                            return [2 /*return*/];
                    }
                });
            }); });
        });
        new obsidian_1.Setting(containerEl)
            .setName('Temperature')
            .setDesc('Set the randomness of the model\'s output (0-1)')
            .addSlider(function (slider) { return slider
            .setLimits(0, 1, .1)
            .setValue(_this.plugin.settings.temperature)
            .setDynamicTooltip()
            .onChange(function (value) { return __awaiter(_this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        this.plugin.settings.temperature = value;
                        return [4 /*yield*/, this.plugin.saveSettings()];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        }); }); });
        new obsidian_1.Setting(containerEl)
            .setName('Max Tokens')
            .setDesc('Set the maximum length of the model\'s output')
            .addText(function (text) { return text
            .setPlaceholder('4000')
            .setValue(String(_this.plugin.settings.maxTokens))
            .onChange(function (value) { return __awaiter(_this, void 0, void 0, function () {
            var numValue;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        numValue = Number(value);
                        if (!!isNaN(numValue)) return [3 /*break*/, 2];
                        this.plugin.settings.maxTokens = numValue;
                        return [4 /*yield*/, this.plugin.saveSettings()];
                    case 1:
                        _a.sent();
                        _a.label = 2;
                    case 2: return [2 /*return*/];
                }
            });
        }); }); });
    };
    return MyPluginSettingTab;
}(obsidian_1.PluginSettingTab));
