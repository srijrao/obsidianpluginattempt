"use strict";
/**
 * Google Gemini Provider Implementation
 *
 * This file contains the implementation of the Google Gemini provider,
 * which allows the plugin to interact with Google's Gemini API.
 */
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
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
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
var base_1 = require("./base");
/**
 * Implements the Google Gemini provider functionality
 *
 * Handles communication with Google's Gemini API, including:
 * - Chat completions
 * - Model listing
 * - Connection testing
 * - Streaming responses
 */
var GeminiProvider = /** @class */ (function (_super) {
    __extends(GeminiProvider, _super);
    function GeminiProvider(apiKey, model) {
        if (model === void 0) { model = 'gemini-pro'; }
        var _this = _super.call(this) || this;
        _this.baseUrl = 'https://generativelanguage.googleapis.com/v1';
        _this.apiKey = apiKey;
        _this.model = model;
        return _this;
    }
    /**
     * Get a completion from Google Gemini
     *
     * Sends the conversation to Gemini and streams back the response.
     *
     * @param messages - The conversation history
     * @param options - Settings for this completion
     */
    GeminiProvider.prototype.getCompletion = function (messages, options) {
        return __awaiter(this, void 0, void 0, function () {
            var formattedMessages, url, response, reader, decoder, buffer, _a, done, value, lines, _i, lines_1, line, data, text, error_1;
            var _b, _c, _d, _e, _f, _g, _h, _j, _k;
            return __generator(this, function (_l) {
                switch (_l.label) {
                    case 0:
                        _l.trys.push([0, 5, , 6]);
                        formattedMessages = this.formatMessages(messages);
                        url = "".concat(this.baseUrl, "/models/").concat(this.model, ":streamGenerateContent?key=").concat(this.apiKey);
                        return [4 /*yield*/, fetch(url, {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json'
                                },
                                body: JSON.stringify({
                                    contents: formattedMessages,
                                    generationConfig: {
                                        temperature: (_b = options.temperature) !== null && _b !== void 0 ? _b : 0.7,
                                        maxOutputTokens: (_c = options.maxTokens) !== null && _c !== void 0 ? _c : 1000
                                    },
                                    safetySettings: [
                                        {
                                            category: "HARM_CATEGORY_HARASSMENT",
                                            threshold: "BLOCK_MEDIUM_AND_ABOVE"
                                        },
                                        {
                                            category: "HARM_CATEGORY_HATE_SPEECH",
                                            threshold: "BLOCK_MEDIUM_AND_ABOVE"
                                        },
                                        {
                                            category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
                                            threshold: "BLOCK_MEDIUM_AND_ABOVE"
                                        },
                                        {
                                            category: "HARM_CATEGORY_DANGEROUS_CONTENT",
                                            threshold: "BLOCK_MEDIUM_AND_ABOVE"
                                        }
                                    ]
                                }),
                                signal: (_d = options.abortController) === null || _d === void 0 ? void 0 : _d.signal
                            })];
                    case 1:
                        response = _l.sent();
                        if (!response.ok) {
                            throw this.handleHttpError(response);
                        }
                        reader = (_e = response.body) === null || _e === void 0 ? void 0 : _e.getReader();
                        decoder = new TextDecoder('utf-8');
                        if (!reader) {
                            throw new base_1.ProviderError(base_1.ProviderErrorType.ServerError, 'Failed to get response reader');
                        }
                        buffer = '';
                        _l.label = 2;
                    case 2:
                        if (!true) return [3 /*break*/, 4];
                        return [4 /*yield*/, reader.read()];
                    case 3:
                        _a = _l.sent(), done = _a.done, value = _a.value;
                        if (done)
                            return [3 /*break*/, 4];
                        buffer += decoder.decode(value, { stream: true });
                        lines = buffer.split('\n');
                        buffer = lines.pop() || '';
                        for (_i = 0, lines_1 = lines; _i < lines_1.length; _i++) {
                            line = lines_1[_i];
                            if (line.trim() && !line.startsWith('[')) {
                                try {
                                    data = JSON.parse(line);
                                    text = (_k = (_j = (_h = (_g = (_f = data.candidates) === null || _f === void 0 ? void 0 : _f[0]) === null || _g === void 0 ? void 0 : _g.content) === null || _h === void 0 ? void 0 : _h.parts) === null || _j === void 0 ? void 0 : _j[0]) === null || _k === void 0 ? void 0 : _k.text;
                                    if (text && options.streamCallback) {
                                        options.streamCallback(text);
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
                        if (error_1 instanceof base_1.ProviderError) {
                            throw error_1;
                        }
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
     * Fetches the list of available models from Google's API.
     * Filters to only include Gemini models.
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
                        return [4 /*yield*/, fetch("".concat(this.baseUrl, "/models?key=").concat(this.apiKey), {
                                method: 'GET',
                                headers: {
                                    'Content-Type': 'application/json'
                                }
                            })];
                    case 1:
                        response = _a.sent();
                        if (!response.ok) {
                            throw this.handleHttpError(response);
                        }
                        return [4 /*yield*/, response.json()];
                    case 2:
                        data = _a.sent();
                        return [2 /*return*/, data.models
                                .map(function (model) { return model.name.split('/').pop(); })
                                .filter(function (id) { return id.startsWith('gemini-'); })];
                    case 3:
                        error_2 = _a.sent();
                        console.error('Error fetching Gemini models:', error_2);
                        throw error_2;
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
     * @returns Test results including success/failure and available models
     */
    GeminiProvider.prototype.testConnection = function () {
        return __awaiter(this, void 0, void 0, function () {
            var models, error_3;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, this.getAvailableModels()];
                    case 1:
                        models = _a.sent();
                        return [2 /*return*/, {
                                success: true,
                                message: "Successfully connected to Google Gemini! Found ".concat(models.length, " available models."),
                                models: models
                            }];
                    case 2:
                        error_3 = _a.sent();
                        return [2 /*return*/, this.createErrorResponse(error_3)];
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Format messages for Gemini API
     *
     * Converts from the plugin's Message format to Gemini's expected format.
     *
     * @param messages - Array of messages to format
     * @returns Formatted messages for Gemini API
     */
    GeminiProvider.prototype.formatMessages = function (messages) {
        var formattedMessages = [];
        var currentRole = null;
        var content = { parts: [{ text: '' }] };
        for (var _i = 0, messages_1 = messages; _i < messages_1.length; _i++) {
            var message = messages_1[_i];
            var role = message.role === 'system' ? 'user' : message.role;
            if (role !== currentRole && currentRole !== null) {
                formattedMessages.push({ role: currentRole, parts: [{ text: content.parts[0].text }] });
                content = { parts: [{ text: message.content }] };
            }
            else {
                content.parts[0].text += (content.parts[0].text ? '\n\n' : '') + message.content;
            }
            currentRole = role;
        }
        if (currentRole !== null) {
            formattedMessages.push({ role: currentRole, parts: [{ text: content.parts[0].text }] });
        }
        return formattedMessages;
    };
    return GeminiProvider;
}(base_1.BaseProvider));
exports.GeminiProvider = GeminiProvider;
