"use strict";
/**
 * Ollama Provider Implementation
 *
 * This file contains the implementation of the Ollama provider,
 * which allows the plugin to interact with a local Ollama server
 * running AI models like Llama, Mistral, etc.
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
exports.OllamaProvider = void 0;
/**
 * Implements the Ollama provider functionality
 *
 * Handles communication with a local Ollama server, including:
 * - Chat completions
 * - Model listing
 * - Connection testing
 * - Streaming responses
 *
 * Requires Ollama to be installed and running locally:
 * 1. Install Ollama from https://ollama.ai
 * 2. Start the Ollama server
 * 3. Pull your desired models using 'ollama pull model-name'
 */
var OllamaProvider = /** @class */ (function () {
    function OllamaProvider(serverUrl, model) {
        if (serverUrl === void 0) { serverUrl = 'http://localhost:11434'; }
        if (model === void 0) { model = 'llama2'; }
        this.serverUrl = serverUrl.replace(/\/$/, ''); // Remove trailing slash if present
        this.model = model;
    }
    /**
     * Get a completion from Ollama
     *
     * Sends the conversation to the local Ollama server and streams back the response.
     *
     * @param messages - The conversation history
     * @param options - Settings for this completion
     */
    OllamaProvider.prototype.getCompletion = function (messages, options) {
        return __awaiter(this, void 0, void 0, function () {
            var prompt_1, response, reader, decoder, _a, done, value, chunk, lines, _i, lines_1, line, data, error_1;
            var _b, _c, _d, _e;
            return __generator(this, function (_f) {
                switch (_f.label) {
                    case 0:
                        _f.trys.push([0, 5, , 6]);
                        prompt_1 = messages.map(function (msg) {
                            if (msg.role === 'system') {
                                return "System: ".concat(msg.content, "\n\n");
                            }
                            return "".concat(msg.role === 'user' ? 'Human' : 'Assistant', ": ").concat(msg.content, "\n\n");
                        }).join('') + 'Assistant:';
                        return [4 /*yield*/, fetch("".concat(this.serverUrl, "/api/generate"), {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json'
                                },
                                body: JSON.stringify({
                                    model: this.model,
                                    prompt: prompt_1,
                                    stream: true,
                                    options: {
                                        temperature: (_b = options.temperature) !== null && _b !== void 0 ? _b : 0.7,
                                        num_predict: (_c = options.maxTokens) !== null && _c !== void 0 ? _c : 1000
                                    }
                                }),
                                signal: (_d = options.abortController) === null || _d === void 0 ? void 0 : _d.signal
                            })];
                    case 1:
                        response = _f.sent();
                        if (!response.ok) {
                            throw new Error("Ollama API error: ".concat(response.status, " ").concat(response.statusText));
                        }
                        reader = (_e = response.body) === null || _e === void 0 ? void 0 : _e.getReader();
                        decoder = new TextDecoder('utf-8');
                        _f.label = 2;
                    case 2:
                        if (!true) return [3 /*break*/, 4];
                        return [4 /*yield*/, (reader === null || reader === void 0 ? void 0 : reader.read())];
                    case 3:
                        _a = (_f.sent()) || { done: true, value: undefined }, done = _a.done, value = _a.value;
                        if (done)
                            return [3 /*break*/, 4];
                        chunk = decoder.decode(value);
                        lines = chunk.split('\n');
                        for (_i = 0, lines_1 = lines; _i < lines_1.length; _i++) {
                            line = lines_1[_i];
                            if (line.trim()) {
                                try {
                                    data = JSON.parse(line);
                                    if (data.response && options.streamCallback) {
                                        options.streamCallback(data.response);
                                    }
                                }
                                catch (e) {
                                    console.warn('Error parsing Ollama response chunk:', e);
                                }
                            }
                        }
                        return [3 /*break*/, 2];
                    case 4: return [3 /*break*/, 6];
                    case 5:
                        error_1 = _f.sent();
                        if (error_1.name === 'AbortError') {
                            console.log('Ollama stream was aborted');
                        }
                        else {
                            console.error('Error calling Ollama:', error_1);
                            throw error_1;
                        }
                        return [3 /*break*/, 6];
                    case 6: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Get available Ollama models
     *
     * Fetches the list of models installed on the local Ollama server.
     *
     * @returns List of available model names
     */
    OllamaProvider.prototype.getAvailableModels = function () {
        return __awaiter(this, void 0, void 0, function () {
            var response, data, error_2;
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        _b.trys.push([0, 3, , 4]);
                        return [4 /*yield*/, fetch("".concat(this.serverUrl, "/api/tags"))];
                    case 1:
                        response = _b.sent();
                        if (!response.ok) {
                            throw new Error("Ollama API error: ".concat(response.status, " ").concat(response.statusText));
                        }
                        return [4 /*yield*/, response.json()];
                    case 2:
                        data = _b.sent();
                        return [2 /*return*/, ((_a = data.models) === null || _a === void 0 ? void 0 : _a.map(function (model) { return model.name; })) || []];
                    case 3:
                        error_2 = _b.sent();
                        console.error('Error fetching Ollama models:', error_2);
                        throw error_2;
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Test connection to Ollama
     *
     * Verifies the Ollama server is running and accessible.
     * Also checks if any models are installed.
     *
     * @returns Test results including success/failure and available models
     */
    OllamaProvider.prototype.testConnection = function () {
        return __awaiter(this, void 0, void 0, function () {
            var models, error_3, message;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, this.getAvailableModels()];
                    case 1:
                        models = _a.sent();
                        if (models.length === 0) {
                            return [2 /*return*/, {
                                    success: false,
                                    message: 'Connected to Ollama server, but no models are installed. Use "ollama pull model-name" to install models.',
                                    models: []
                                }];
                        }
                        return [2 /*return*/, {
                                success: true,
                                message: "Successfully connected to Ollama! Found ".concat(models.length, " installed models."),
                                models: models
                            }];
                    case 2:
                        error_3 = _a.sent();
                        message = 'Connection failed: ';
                        if (error_3.message.includes('fetch')) {
                            message += 'Could not connect to Ollama server. Make sure Ollama is installed and running.';
                        }
                        else {
                            message += error_3.message;
                        }
                        return [2 /*return*/, {
                                success: false,
                                message: message
                            }];
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    return OllamaProvider;
}());
exports.OllamaProvider = OllamaProvider;
