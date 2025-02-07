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
var types_1 = require("./types");
var providers_1 = require("./providers");
var VIEW_TYPE_MODEL_SETTINGS = 'model-settings-view';
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
        return 'AI Model Settings';
    };
    ModelSettingsView.prototype.onOpen = function () {
        return __awaiter(this, void 0, void 0, function () {
            var contentEl;
            var _this = this;
            return __generator(this, function (_a) {
                contentEl = this.contentEl;
                contentEl.empty();
                contentEl.createEl('h2', { text: 'AI Model Settings' });
                // Common Settings Section
                contentEl.createEl('h3', { text: 'Common Settings' });
                new obsidian_1.Setting(contentEl)
                    .setName('AI Provider')
                    .setDesc('Choose which AI provider to use')
                    .addDropdown(function (dropdown) {
                    dropdown
                        .addOption('openai', 'OpenAI (GPT-3.5, GPT-4)')
                        .addOption('anthropic', 'Anthropic (Claude)')
                        .addOption('gemini', 'Google (Gemini)')
                        .addOption('ollama', 'Ollama (Local AI)')
                        .setValue(_this.plugin.settings.provider)
                        .onChange(function (value) { return __awaiter(_this, void 0, void 0, function () {
                        return __generator(this, function (_a) {
                            switch (_a.label) {
                                case 0:
                                    this.plugin.settings.provider = value;
                                    return [4 /*yield*/, this.plugin.saveSettings()];
                                case 1:
                                    _a.sent();
                                    // Refresh view to show provider-specific settings
                                    this.onOpen();
                                    return [2 /*return*/];
                            }
                        });
                    }); });
                });
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
                    .setName('Include Time with System Message')
                    .setDesc('Add the current time along with the date to the system message')
                    .addToggle(function (toggle) { return toggle
                    .setValue(_this.plugin.settings.includeTimeWithSystemMessage)
                    .onChange(function (value) { return __awaiter(_this, void 0, void 0, function () {
                    return __generator(this, function (_a) {
                        switch (_a.label) {
                            case 0:
                                this.plugin.settings.includeTimeWithSystemMessage = value;
                                return [4 /*yield*/, this.plugin.saveSettings()];
                            case 1:
                                _a.sent();
                                return [2 /*return*/];
                        }
                    });
                }); }); });
                new obsidian_1.Setting(contentEl)
                    .setName('Enable Obsidian Links')
                    .setDesc('Read Obsidian links in messages using [[filename]] syntax')
                    .addToggle(function (toggle) { return toggle
                    .setValue(_this.plugin.settings.enableObsidianLinks)
                    .onChange(function (value) { return __awaiter(_this, void 0, void 0, function () {
                    return __generator(this, function (_a) {
                        switch (_a.label) {
                            case 0:
                                this.plugin.settings.enableObsidianLinks = value;
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
                // Provider-specific settings section
                contentEl.createEl('h3', { text: "".concat(this.plugin.settings.provider.toUpperCase(), " Settings") });
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
                return [2 /*return*/];
            });
        });
    };
    ModelSettingsView.prototype.renderOpenAISettings = function (containerEl) {
        var _this = this;
        var settings = this.plugin.settings.openaiSettings;
        new obsidian_1.Setting(containerEl)
            .setName('API Key')
            .setDesc('Enter your OpenAI API key')
            .addText(function (text) { return text
            .setPlaceholder('Enter your API key')
            .setValue(settings.apiKey)
            .onChange(function (value) { return __awaiter(_this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        settings.apiKey = value;
                        return [4 /*yield*/, this.plugin.saveSettings()];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        }); }); });
        new obsidian_1.Setting(containerEl)
            .setName('Test Connection')
            .setDesc('Verify your API key and fetch available models')
            .addButton(function (button) { return button
            .setButtonText('Test')
            .onClick(function () { return __awaiter(_this, void 0, void 0, function () {
            var provider, result, error_1;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        button.setButtonText('Testing...');
                        button.setDisabled(true);
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 6, 7, 8]);
                        provider = (0, providers_1.createProvider)(this.plugin.settings);
                        return [4 /*yield*/, provider.testConnection()];
                    case 2:
                        result = _a.sent();
                        if (!(result.success && result.models)) return [3 /*break*/, 4];
                        settings.availableModels = result.models;
                        return [4 /*yield*/, this.plugin.saveSettings()];
                    case 3:
                        _a.sent();
                        settings.lastTestResult = {
                            timestamp: Date.now(),
                            success: true,
                            message: result.message
                        };
                        new obsidian_1.Notice(result.message);
                        this.onOpen(); // Refresh view
                        return [3 /*break*/, 5];
                    case 4:
                        settings.lastTestResult = {
                            timestamp: Date.now(),
                            success: false,
                            message: result.message
                        };
                        new obsidian_1.Notice(result.message);
                        _a.label = 5;
                    case 5: return [3 /*break*/, 8];
                    case 6:
                        error_1 = _a.sent();
                        new obsidian_1.Notice("Error: ".concat(error_1.message));
                        return [3 /*break*/, 8];
                    case 7:
                        button.setButtonText('Test');
                        button.setDisabled(false);
                        return [7 /*endfinally*/];
                    case 8: return [2 /*return*/];
                }
            });
        }); }); });
        if (settings.lastTestResult) {
            var date = new Date(settings.lastTestResult.timestamp);
            containerEl.createEl('div', {
                text: "Last test: ".concat(date.toLocaleString(), " - ").concat(settings.lastTestResult.message),
                cls: settings.lastTestResult.success ? 'success' : 'error'
            });
        }
        new obsidian_1.Setting(containerEl)
            .setName('Model')
            .setDesc('Choose the OpenAI model to use')
            .addDropdown(function (dropdown) {
            for (var _i = 0, _a = settings.availableModels; _i < _a.length; _i++) {
                var model = _a[_i];
                dropdown.addOption(model, model);
            }
            dropdown
                .setValue(settings.model)
                .onChange(function (value) { return __awaiter(_this, void 0, void 0, function () {
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            settings.model = value;
                            return [4 /*yield*/, this.plugin.saveSettings()];
                        case 1:
                            _a.sent();
                            return [2 /*return*/];
                    }
                });
            }); });
        });
    };
    ModelSettingsView.prototype.renderAnthropicSettings = function (containerEl) {
        var _this = this;
        var settings = this.plugin.settings.anthropicSettings;
        new obsidian_1.Setting(containerEl)
            .setName('API Key')
            .setDesc('Enter your Anthropic API key')
            .addText(function (text) { return text
            .setPlaceholder('Enter your API key')
            .setValue(settings.apiKey)
            .onChange(function (value) { return __awaiter(_this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        settings.apiKey = value;
                        return [4 /*yield*/, this.plugin.saveSettings()];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        }); }); });
        new obsidian_1.Setting(containerEl)
            .setName('Test Connection')
            .setDesc('Verify your API key and fetch available models')
            .addButton(function (button) { return button
            .setButtonText('Test')
            .onClick(function () { return __awaiter(_this, void 0, void 0, function () {
            var provider, result, error_2;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        button.setButtonText('Testing...');
                        button.setDisabled(true);
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 6, 7, 8]);
                        provider = (0, providers_1.createProvider)(this.plugin.settings);
                        return [4 /*yield*/, provider.testConnection()];
                    case 2:
                        result = _a.sent();
                        if (!(result.success && result.models)) return [3 /*break*/, 4];
                        settings.availableModels = result.models;
                        return [4 /*yield*/, this.plugin.saveSettings()];
                    case 3:
                        _a.sent();
                        settings.lastTestResult = {
                            timestamp: Date.now(),
                            success: true,
                            message: result.message
                        };
                        new obsidian_1.Notice(result.message);
                        this.onOpen(); // Refresh view
                        return [3 /*break*/, 5];
                    case 4:
                        settings.lastTestResult = {
                            timestamp: Date.now(),
                            success: false,
                            message: result.message
                        };
                        new obsidian_1.Notice(result.message);
                        _a.label = 5;
                    case 5: return [3 /*break*/, 8];
                    case 6:
                        error_2 = _a.sent();
                        new obsidian_1.Notice("Error: ".concat(error_2.message));
                        return [3 /*break*/, 8];
                    case 7:
                        button.setButtonText('Test');
                        button.setDisabled(false);
                        return [7 /*endfinally*/];
                    case 8: return [2 /*return*/];
                }
            });
        }); }); });
        if (settings.lastTestResult) {
            var date = new Date(settings.lastTestResult.timestamp);
            containerEl.createEl('div', {
                text: "Last test: ".concat(date.toLocaleString(), " - ").concat(settings.lastTestResult.message),
                cls: settings.lastTestResult.success ? 'success' : 'error'
            });
        }
        new obsidian_1.Setting(containerEl)
            .setName('Model')
            .setDesc('Choose the Anthropic model to use')
            .addDropdown(function (dropdown) {
            for (var _i = 0, _a = settings.availableModels; _i < _a.length; _i++) {
                var model = _a[_i];
                dropdown.addOption(model, model);
            }
            dropdown
                .setValue(settings.model)
                .onChange(function (value) { return __awaiter(_this, void 0, void 0, function () {
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            settings.model = value;
                            return [4 /*yield*/, this.plugin.saveSettings()];
                        case 1:
                            _a.sent();
                            return [2 /*return*/];
                    }
                });
            }); });
        });
    };
    ModelSettingsView.prototype.renderGeminiSettings = function (containerEl) {
        var _this = this;
        var settings = this.plugin.settings.geminiSettings;
        new obsidian_1.Setting(containerEl)
            .setName('API Key')
            .setDesc('Enter your Google API key')
            .addText(function (text) { return text
            .setPlaceholder('Enter your API key')
            .setValue(settings.apiKey)
            .onChange(function (value) { return __awaiter(_this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        settings.apiKey = value;
                        return [4 /*yield*/, this.plugin.saveSettings()];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        }); }); });
        new obsidian_1.Setting(containerEl)
            .setName('Test Connection')
            .setDesc('Verify your API key and fetch available models')
            .addButton(function (button) { return button
            .setButtonText('Test')
            .onClick(function () { return __awaiter(_this, void 0, void 0, function () {
            var provider, result, error_3;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        button.setButtonText('Testing...');
                        button.setDisabled(true);
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 6, 7, 8]);
                        provider = (0, providers_1.createProvider)(this.plugin.settings);
                        return [4 /*yield*/, provider.testConnection()];
                    case 2:
                        result = _a.sent();
                        if (!(result.success && result.models)) return [3 /*break*/, 4];
                        settings.availableModels = result.models;
                        return [4 /*yield*/, this.plugin.saveSettings()];
                    case 3:
                        _a.sent();
                        settings.lastTestResult = {
                            timestamp: Date.now(),
                            success: true,
                            message: result.message
                        };
                        new obsidian_1.Notice(result.message);
                        this.onOpen(); // Refresh view
                        return [3 /*break*/, 5];
                    case 4:
                        settings.lastTestResult = {
                            timestamp: Date.now(),
                            success: false,
                            message: result.message
                        };
                        new obsidian_1.Notice(result.message);
                        _a.label = 5;
                    case 5: return [3 /*break*/, 8];
                    case 6:
                        error_3 = _a.sent();
                        new obsidian_1.Notice("Error: ".concat(error_3.message));
                        return [3 /*break*/, 8];
                    case 7:
                        button.setButtonText('Test');
                        button.setDisabled(false);
                        return [7 /*endfinally*/];
                    case 8: return [2 /*return*/];
                }
            });
        }); }); });
        if (settings.lastTestResult) {
            var date = new Date(settings.lastTestResult.timestamp);
            containerEl.createEl('div', {
                text: "Last test: ".concat(date.toLocaleString(), " - ").concat(settings.lastTestResult.message),
                cls: settings.lastTestResult.success ? 'success' : 'error'
            });
        }
        new obsidian_1.Setting(containerEl)
            .setName('Model')
            .setDesc('Choose the Gemini model to use')
            .addDropdown(function (dropdown) {
            for (var _i = 0, _a = settings.availableModels; _i < _a.length; _i++) {
                var model = _a[_i];
                dropdown.addOption(model, model);
            }
            dropdown
                .setValue(settings.model)
                .onChange(function (value) { return __awaiter(_this, void 0, void 0, function () {
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            settings.model = value;
                            return [4 /*yield*/, this.plugin.saveSettings()];
                        case 1:
                            _a.sent();
                            return [2 /*return*/];
                    }
                });
            }); });
        });
    };
    ModelSettingsView.prototype.renderOllamaSettings = function (containerEl) {
        var _this = this;
        var settings = this.plugin.settings.ollamaSettings;
        new obsidian_1.Setting(containerEl)
            .setName('Server URL')
            .setDesc('Enter your Ollama server URL (default: http://localhost:11434)')
            .addText(function (text) { return text
            .setPlaceholder('http://localhost:11434')
            .setValue(settings.serverUrl)
            .onChange(function (value) { return __awaiter(_this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        settings.serverUrl = value;
                        return [4 /*yield*/, this.plugin.saveSettings()];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        }); }); });
        new obsidian_1.Setting(containerEl)
            .setName('Test Connection')
            .setDesc('Check server connection and fetch available models')
            .addButton(function (button) { return button
            .setButtonText('Test')
            .onClick(function () { return __awaiter(_this, void 0, void 0, function () {
            var provider, result, error_4;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        button.setButtonText('Testing...');
                        button.setDisabled(true);
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 6, 7, 8]);
                        provider = (0, providers_1.createProvider)(this.plugin.settings);
                        return [4 /*yield*/, provider.testConnection()];
                    case 2:
                        result = _a.sent();
                        if (!(result.success && result.models)) return [3 /*break*/, 4];
                        settings.availableModels = result.models;
                        return [4 /*yield*/, this.plugin.saveSettings()];
                    case 3:
                        _a.sent();
                        settings.lastTestResult = {
                            timestamp: Date.now(),
                            success: true,
                            message: result.message
                        };
                        new obsidian_1.Notice(result.message);
                        this.onOpen(); // Refresh view
                        return [3 /*break*/, 5];
                    case 4:
                        settings.lastTestResult = {
                            timestamp: Date.now(),
                            success: false,
                            message: result.message
                        };
                        new obsidian_1.Notice(result.message);
                        _a.label = 5;
                    case 5: return [3 /*break*/, 8];
                    case 6:
                        error_4 = _a.sent();
                        new obsidian_1.Notice("Error: ".concat(error_4.message));
                        return [3 /*break*/, 8];
                    case 7:
                        button.setButtonText('Test');
                        button.setDisabled(false);
                        return [7 /*endfinally*/];
                    case 8: return [2 /*return*/];
                }
            });
        }); }); });
        if (settings.lastTestResult) {
            var date = new Date(settings.lastTestResult.timestamp);
            containerEl.createEl('div', {
                text: "Last test: ".concat(date.toLocaleString(), " - ").concat(settings.lastTestResult.message),
                cls: settings.lastTestResult.success ? 'success' : 'error'
            });
        }
        new obsidian_1.Setting(containerEl)
            .setName('Model')
            .setDesc('Choose the Ollama model to use')
            .addDropdown(function (dropdown) {
            for (var _i = 0, _a = settings.availableModels; _i < _a.length; _i++) {
                var model = _a[_i];
                dropdown.addOption(model, model);
            }
            dropdown
                .setValue(settings.model)
                .onChange(function (value) { return __awaiter(_this, void 0, void 0, function () {
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            settings.model = value;
                            return [4 /*yield*/, this.plugin.saveSettings()];
                        case 1:
                            _a.sent();
                            return [2 /*return*/];
                    }
                });
            }); });
        });
        // Add help text for Ollama setup
        containerEl.createEl('div', {
            cls: 'setting-item-description',
            text: 'To use Ollama:'
        });
        var steps = containerEl.createEl('ol');
        steps.createEl('li', { text: 'Install Ollama from https://ollama.ai' });
        steps.createEl('li', { text: 'Start the Ollama server' });
        steps.createEl('li', { text: 'Pull models using "ollama pull model-name"' });
        steps.createEl('li', { text: 'Test connection to see available models' });
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
/**
 * Parses a given text selection into an array of message objects
 *
 * The function interprets lines of text separated by '----' as boundaries
 * between user and assistant messages.
 *
 * @param selection - The text selection to parse
 * @returns Array of message objects with roles and content
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
                        this.addSettingTab(new MyPluginSettingTab(this.app, this));
                        this.registerView(VIEW_TYPE_MODEL_SETTINGS, function (leaf) { return new ModelSettingsView(leaf, _this); });
                        this.addRibbonIcon('gear', 'Open AI Settings', function () {
                            _this.activateView();
                        });
                        this.app.workspace.onLayoutReady(function () {
                            if (_this.settings.autoOpenModelSettings) {
                                _this.activateView();
                            }
                        });
                        this.addCommand({
                            id: 'ai-completion',
                            name: 'Get AI Completion',
                            editorCallback: function (editor) { return __awaiter(_this, void 0, void 0, function () {
                                var text, insertPosition, lineNumber, documentText, lines, messages, currentPosition, provider, processedMessages, newCursorPos, error_5;
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
                                                insertPosition = { line: lineNumber + 1, ch: 0 };
                                            }
                                            messages = parseSelection(text);
                                            editor.replaceRange('\n\n----\n\n', insertPosition);
                                            currentPosition = {
                                                line: insertPosition.line + 3,
                                                ch: 0
                                            };
                                            this.activeStream = new AbortController();
                                            _a.label = 1;
                                        case 1:
                                            _a.trys.push([1, 4, 5, 6]);
                                            provider = (0, providers_1.createProvider)(this.settings);
                                            return [4 /*yield*/, this.processMessages(__spreadArray([
                                                    { role: 'system', content: this.getSystemMessage() }
                                                ], messages, true))];
                                        case 2:
                                            processedMessages = _a.sent();
                                            return [4 /*yield*/, provider.getCompletion(processedMessages, {
                                                    temperature: this.settings.temperature,
                                                    maxTokens: this.settings.maxTokens,
                                                    streamCallback: function (chunk) {
                                                        editor.replaceRange(chunk, currentPosition);
                                                        currentPosition = editor.offsetToPos(editor.posToOffset(currentPosition) + chunk.length);
                                                    },
                                                    abortController: this.activeStream
                                                })];
                                        case 3:
                                            _a.sent();
                                            editor.replaceRange('\n\n----\n\n', currentPosition);
                                            newCursorPos = editor.offsetToPos(editor.posToOffset(currentPosition) + 8);
                                            editor.setCursor(newCursorPos);
                                            return [3 /*break*/, 6];
                                        case 4:
                                            error_5 = _a.sent();
                                            new obsidian_1.Notice("Error: ".concat(error_5.message));
                                            editor.replaceRange("Error: ".concat(error_5.message, "\n\n----\n\n"), currentPosition);
                                            return [3 /*break*/, 6];
                                        case 5:
                                            this.activeStream = null;
                                            return [7 /*endfinally*/];
                                        case 6: return [2 /*return*/];
                                    }
                                });
                            }); }
                        });
                        this.addCommand({
                            id: 'end-ai-stream',
                            name: 'End AI Stream',
                            callback: function () {
                                if (_this.activeStream) {
                                    _this.activeStream.abort();
                                    _this.activeStream = null;
                                    new obsidian_1.Notice('AI stream ended');
                                }
                                else {
                                    new obsidian_1.Notice('No active AI stream to end');
                                }
                            }
                        });
                        this.addCommand({
                            id: 'show-ai-settings',
                            name: 'Show AI Settings',
                            callback: function () {
                                _this.activateView();
                            }
                        });
                        return [2 /*return*/];
                }
            });
        });
    };
    MyPlugin.prototype.getSystemMessage = function () {
        var systemMessage = this.settings.systemMessage;
        if (this.settings.includeDateWithSystemMessage) {
            var currentDate = new Date().toISOString().split('T')[0];
            if (this.settings.includeTimeWithSystemMessage) {
                var currentTime = new Date().toLocaleTimeString();
                systemMessage = "".concat(systemMessage, " The current date and time is ").concat(currentDate, " ").concat(currentTime, ".");
            }
            else {
                systemMessage = "".concat(systemMessage, " The current date is ").concat(currentDate, ".");
            }
        }
        return systemMessage;
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
                        _d = [{}, types_1.DEFAULT_SETTINGS];
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
    /**
     * Processes a message content to include Obsidian note contents
     *
     * If a link is found, retrieves the note content and appends it after the link.
     *
     * @param content The message content to process
     * @returns The processed content with note contents included
     */
    /**
     * Process an array of messages to include Obsidian note contents
     *
     * @param messages Array of messages to process
     * @returns Promise resolving to processed messages
     */
    MyPlugin.prototype.processMessages = function (messages) {
        return __awaiter(this, void 0, void 0, function () {
            var processedMessages, _i, messages_1, message, processedContent;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        processedMessages = [];
                        _i = 0, messages_1 = messages;
                        _a.label = 1;
                    case 1:
                        if (!(_i < messages_1.length)) return [3 /*break*/, 4];
                        message = messages_1[_i];
                        return [4 /*yield*/, this.processObsidianLinks(message.content)];
                    case 2:
                        processedContent = _a.sent();
                        processedMessages.push({
                            role: message.role,
                            content: processedContent
                        });
                        _a.label = 3;
                    case 3:
                        _i++;
                        return [3 /*break*/, 1];
                    case 4: return [2 /*return*/, processedMessages];
                }
            });
        });
    };
    /**
     * Process a single message content to include Obsidian note contents
     *
     * @param content The message content to process
     * @returns Promise resolving to processed content
     */
    MyPlugin.prototype.processObsidianLinks = function (content) {
        return __awaiter(this, void 0, void 0, function () {
            var linkRegex, match, processedContent, fileName, file, noteContent, error_6;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!this.settings.enableObsidianLinks)
                            return [2 /*return*/, content];
                        linkRegex = /\[\[(.*?)\]\]/g;
                        processedContent = content;
                        _a.label = 1;
                    case 1:
                        if (!((match = linkRegex.exec(content)) !== null)) return [3 /*break*/, 7];
                        fileName = match[1];
                        _a.label = 2;
                    case 2:
                        _a.trys.push([2, 5, , 6]);
                        file = this.app.vault.getAbstractFileByPath("".concat(fileName, ".md"));
                        if (!(file && file instanceof obsidian_1.TFile)) return [3 /*break*/, 4];
                        return [4 /*yield*/, this.app.vault.cachedRead(file)];
                    case 3:
                        noteContent = _a.sent();
                        processedContent = processedContent.replace(match[0], "".concat(match[0], "\n").concat(fileName, ":\n").concat(noteContent, "\n"));
                        _a.label = 4;
                    case 4: return [3 /*break*/, 6];
                    case 5:
                        error_6 = _a.sent();
                        console.error("Error processing Obsidian link for ".concat(fileName, ":"), error_6);
                        return [3 /*break*/, 6];
                    case 6: return [3 /*break*/, 1];
                    case 7: return [2 /*return*/, processedContent];
                }
            });
        });
    };
    return MyPlugin;
}(obsidian_1.Plugin));
exports.default = MyPlugin;
/**
 * Plugin Settings Tab
 *
 * This tab provides a user interface for configuring the plugin settings.
 * It automatically opens the model settings view when settings are changed.
 */
var MyPluginSettingTab = /** @class */ (function (_super) {
    __extends(MyPluginSettingTab, _super);
    function MyPluginSettingTab(app, plugin) {
        var _this = _super.call(this, app, plugin) || this;
        _this.plugin = plugin;
        return _this;
    }
    /**
     * Display the settings tab
     *
     * Shows only the auto-open setting here since all other settings
     * are managed in the model settings view for better organization.
     */
    MyPluginSettingTab.prototype.display = function () {
        var _this = this;
        var containerEl = this.containerEl;
        containerEl.empty();
        new obsidian_1.Setting(containerEl)
            .setName('Auto-open Model Settings')
            .setDesc('Automatically open model settings when Obsidian starts')
            .addToggle(function (toggle) { return toggle
            .setValue(_this.plugin.settings.autoOpenModelSettings)
            .onChange(function (value) { return __awaiter(_this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        this.plugin.settings.autoOpenModelSettings = value;
                        return [4 /*yield*/, this.plugin.saveSettings()];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        }); }); });
        // Add a button to open model settings
        new obsidian_1.Setting(containerEl)
            .setName('Open Model Settings')
            .setDesc('Open the model settings view')
            .addButton(function (button) { return button
            .setButtonText('Open')
            .onClick(function () {
            _this.plugin.activateView();
        }); });
    };
    return MyPluginSettingTab;
}(obsidian_1.PluginSettingTab));
