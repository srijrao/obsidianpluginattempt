"use strict";
/**
 * Google Gemini Provider Implementation
 *
 * This file contains the implementation of the Google Gemini provider,
 * which allows the plugin to interact with Google's Gemini API
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
exports.GeminiProvider = void 0;
/**
 * Implements the Google Gemini provider functionality
 *
 * Handles communication with Google's Gemini API, including:
 * - Chat completions
 * - Model listing
 * - Connection testing
 * - Streaming responses
 */
var GeminiProvider = /** @class */ (function () {
    function GeminiProvider(apiKey, model) {
        if (model === void 0) { model = 'gemini-pro'; }
        this.baseUrl = 'https://generativelanguage.googleapis.com/v1';
        this.apiKey = apiKey;
        this.model = model;
    }
    /**
     * Get a completion from Gemini
     *
     * Sends the conversation to Gemini and streams back the response.
     *
     * @param messages - The conversation history
     * @param options - Settings for this completion
     */
    GeminiProvider.prototype.getCompletion = function (messages, options) {
        return __awaiter(this, void 0, void 0, function () {
            var contents, response, reader, decoder, _a, done, value, chunk, lines, _i, lines_1, line, data, content, error_1;
            var _b, _c, _d, _e, _f, _g, _h, _j, _k;
            return __generator(this, function (_l) {
                switch (_l.label) {
                    case 0:
                        _l.trys.push([0, 5, , 6]);
                        contents = messages.map(function (msg) { return ({
                            role: msg.role === 'assistant' ? 'model' : msg.role,
                            parts: [{ text: msg.content }]
                        }); });
                        return [4 /*yield*/, fetch("".concat(this.baseUrl, "/models/").concat(this.model, ":streamGenerateContent?key=").concat(this.apiKey), {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json'
                                },
                                body: JSON.stringify({
                                    contents: contents,
                                    generationConfig: {
                                        temperature: (_b = options.temperature) !== null && _b !== void 0 ? _b : 0.7,
                                        maxOutputTokens: (_c = options.maxTokens) !== null && _c !== void 0 ? _c : 1000,
                                        topP: 0.8,
                                        topK: 40
                                    }
                                }),
                                signal: (_d = options.abortController) === null || _d === void 0 ? void 0 : _d.signal
                            })];
                    case 1:
                        response = _l.sent();
                        if (!response.ok) {
                            throw new Error("Gemini API error: ".concat(response.status, " ").concat(response.statusText));
                        }
                        reader = (_e = response.body) === null || _e === void 0 ? void 0 : _e.getReader();
                        decoder = new TextDecoder('utf-8');
                        _l.label = 2;
                    case 2:
                        if (!true) return [3 /*break*/, 4];
                        return [4 /*yield*/, (reader === null || reader === void 0 ? void 0 : reader.read())];
                    case 3:
                        _a = (_l.sent()) || { done: true, value: undefined }, done = _a.done, value = _a.value;
                        if (done)
                            return [3 /*break*/, 4];
                        chunk = decoder.decode(value);
                        lines = chunk.split('\n');
                        for (_i = 0, lines_1 = lines; _i < lines_1.length; _i++) {
                            line = lines_1[_i];
                            if (line.trim()) {
                                try {
                                    data = JSON.parse(line);
                                    content = (_k = (_j = (_h = (_g = (_f = data.candidates) === null || _f === void 0 ? void 0 : _f[0]) === null || _g === void 0 ? void 0 : _g.content) === null || _h === void 0 ? void 0 : _h.parts) === null || _j === void 0 ? void 0 : _j[0]) === null || _k === void 0 ? void 0 : _k.text;
                                    if (content && options.streamCallback) {
                                        options.streamCallback(content);
                                    }
                                }
                                catch (e) {
                                    console.warn('Error parsing Gemini response chunk:', e);
                                }
                            }
                        }
                        return [3 /*break*/, 2];
                    case 4: return [3 /*break*/, 6];
                    case 5:
                        error_1 = _l.sent();
                        if (error_1.name === 'AbortError') {
                            console.log('Gemini stream was aborted');
                        }
                        else {
                            console.error('Error calling Gemini:', error_1);
                            throw error_1;
                        }
                        return [3 /*break*/, 6];
                    case 6: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Get available Gemini models
     *
     * Returns the list of supported Gemini models.
     * Note: Gemini has a fixed set of models currently.
     *
     * @returns List of available model names
     */
    GeminiProvider.prototype.getAvailableModels = function () {
        return __awaiter(this, void 0, void 0, function () {
            var response, data, error_2;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 3, , 4]);
                        return [4 /*yield*/, fetch("".concat(this.baseUrl, "/models?key=").concat(this.apiKey))];
                    case 1:
                        response = _a.sent();
                        if (!response.ok) {
                            throw new Error("Gemini API error: ".concat(response.status, " ").concat(response.statusText));
                        }
                        return [4 /*yield*/, response.json()];
                    case 2:
                        data = _a.sent();
                        return [2 /*return*/, data.models
                                .map(function (model) { return model.name; })
                                .filter(function (name) { return name.includes('gemini'); })];
                    case 3:
                        error_2 = _a.sent();
                        console.error('Error fetching Gemini models:', error_2);
                        // Return known models as fallback
                        return [2 /*return*/, ['gemini-pro', 'gemini-pro-vision']];
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Test connection to Gemini
     *
     * Verifies the API key works by attempting to list models.
     *
     * @returns Test results including success/failure
     */
    GeminiProvider.prototype.testConnection = function () {
        return __awaiter(this, void 0, void 0, function () {
            var response, models, error_3, message;
            var _a, _b;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        _c.trys.push([0, 3, , 4]);
                        return [4 /*yield*/, fetch("".concat(this.baseUrl, "/models?key=").concat(this.apiKey))];
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
                                message: 'Successfully connected to Google Gemini!',
                                models: models
                            }];
                    case 3:
                        error_3 = _c.sent();
                        message = 'Connection failed: ';
                        if (((_a = error_3.response) === null || _a === void 0 ? void 0 : _a.status) === 401) {
                            message += 'Invalid API key. Please check your Google API key.';
                        }
                        else if (((_b = error_3.response) === null || _b === void 0 ? void 0 : _b.status) === 429) {
                            message += 'Rate limit exceeded. Please try again later.';
                        }
                        else {
                            message += error_3.message;
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
    return GeminiProvider;
}());
exports.GeminiProvider = GeminiProvider;
