"use strict";
/**
 * Anthropic Provider Implementation
 *
 * This file contains the implementation of the Anthropic provider,
 * which allows the plugin to interact with Anthropic's API (Claude models)
 */
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.AnthropicProvider = void 0;
/**
 * Implements the Anthropic provider functionality
 *
 * Handles communication with Anthropic's API, including:
 * - Chat completions
 * - Model listing
 * - Connection testing
 * - Streaming responses
 */
var AnthropicProvider = /** @class */ (function () {
    function AnthropicProvider(apiKey, model) {
        if (model === void 0) { model = 'claude-3-sonnet-20240229'; }
        this.baseUrl = 'https://api.anthropic.com/v1';
        this.apiKey = apiKey;
        this.model = model;
    }
    /**
     * Get a completion from Anthropic
     *
     * Sends the conversation to Anthropic and streams back the response.
     *
     * @param messages - The conversation history
     * @param options - Settings for this completion
     */
    AnthropicProvider.prototype.getCompletion = function (messages, options) {
        return __awaiter(this, void 0, void 0, function () {
            var response, reader, decoder, _a, done, value, chunk, lines, _i, lines_1, line, data, content, error_1;
            var _b, _c, _d, _e, _f;
            return __generator(this, function (_g) {
                switch (_g.label) {
                    case 0:
                        _g.trys.push([0, 5, , 6]);
                        return [4 /*yield*/, fetch("".concat(this.baseUrl, "/messages"), {
                                method: 'POST',
                                headers: {
                                    'x-api-key': this.apiKey,
                                    'anthropic-version': '2024-01-01',
                                    'Content-Type': 'application/json'
                                },
                                body: JSON.stringify({
                                    model: this.model,
                                    messages: messages,
                                    temperature: (_b = options.temperature) !== null && _b !== void 0 ? _b : 0.7,
                                    max_tokens: (_c = options.maxTokens) !== null && _c !== void 0 ? _c : 1000,
                                    stream: true
                                }),
                                signal: (_d = options.abortController) === null || _d === void 0 ? void 0 : _d.signal
                            })];
                    case 1:
                        response = _g.sent();
                        if (!response.ok) {
                            throw new Error("Anthropic API error: ".concat(response.status, " ").concat(response.statusText));
                        }
                        reader = (_e = response.body) === null || _e === void 0 ? void 0 : _e.getReader();
                        decoder = new TextDecoder('utf-8');
                        _g.label = 2;
                    case 2:
                        if (!true) return [3 /*break*/, 4];
                        return [4 /*yield*/, (reader === null || reader === void 0 ? void 0 : reader.read())];
                    case 3:
                        _a = (_g.sent()) || { done: true, value: undefined }, done = _a.done, value = _a.value;
                        if (done)
                            return [3 /*break*/, 4];
                        chunk = decoder.decode(value);
                        lines = chunk.split('\n');
                        for (_i = 0, lines_1 = lines; _i < lines_1.length; _i++) {
                            line = lines_1[_i];
                            if (line.startsWith('data: ') && line !== 'data: [DONE]') {
                                data = JSON.parse(line.slice(6));
                                content = (_f = data.delta) === null || _f === void 0 ? void 0 : _f.text;
                                if (content && options.streamCallback) {
                                    options.streamCallback(content);
                                }
                            }
                        }
                        return [3 /*break*/, 2];
                    case 4: return [3 /*break*/, 6];
                    case 5:
                        error_1 = _g.sent();
                        if (error_1.name === 'AbortError') {
                            console.log('Anthropic stream was aborted');
                        }
                        else {
                            console.error('Error calling Anthropic:', error_1);
                            throw error_1;
                        }
                        return [3 /*break*/, 6];
                    case 6: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Get available Anthropic models
     *
     * Returns the list of supported Claude models.
     * Note: Anthropic doesn't have a models endpoint, so we return known models.
     *
     * @returns List of available model names
     */
    AnthropicProvider.prototype.getAvailableModels = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, [
                        'claude-3-opus-20240229',
                        'claude-3-sonnet-20240229',
                        'claude-3-haiku-20240307'
                    ]];
            });
        });
    };
    /**
     * Test connection to Anthropic
     *
     * Verifies the API key works by attempting a simple completion.
     *
     * @returns Test results including success/failure
     */
    AnthropicProvider.prototype.testConnection = function () {
        return __awaiter(this, void 0, void 0, function () {
            var response, models, error_2, message;
            var _a, _b;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        _c.trys.push([0, 3, , 4]);
                        return [4 /*yield*/, fetch("".concat(this.baseUrl, "/messages"), {
                                method: 'POST',
                                headers: {
                                    'x-api-key': this.apiKey,
                                    'anthropic-version': '2024-01-01',
                                    'Content-Type': 'application/json'
                                },
                                body: JSON.stringify({
                                    model: this.model,
                                    messages: [{ role: 'user', content: 'Hi' }],
                                    max_tokens: 1
                                })
                            })];
                    case 1:
                        response = _c.sent();
                        if (!response.ok) {
                            throw new Error("Status ".concat(response.status));
                        }
                        return [4 /*yield*/, this.getAvailableModels()];
                    case 2:
                        models = _c.sent();
                        return [2 /*return*/, {
                                success: true,
                                message: 'Successfully connected to Anthropic!',
                                models: models
                            }];
                    case 3:
                        error_2 = _c.sent();
                        message = 'Connection failed: ';
                        if (((_a = error_2.response) === null || _a === void 0 ? void 0 : _a.status) === 401) {
                            message += 'Invalid API key. Please check your Anthropic API key.';
                        }
                        else if (((_b = error_2.response) === null || _b === void 0 ? void 0 : _b.status) === 429) {
                            message += 'Rate limit exceeded. Please try again later.';
                        }
                        else {
                            message += error_2.message;
                        }
                        return [2 /*return*/, {
                                success: false,
                                message: message
                            }];
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    return AnthropicProvider;
}());
exports.AnthropicProvider = AnthropicProvider;
