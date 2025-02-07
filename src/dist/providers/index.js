"use strict";
/**
 * AI Provider Exports
 *
 * This file exports all AI provider implementations and provides
 * a factory function to create provider instances based on settings.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.OllamaProvider = exports.GeminiProvider = exports.AnthropicProvider = exports.OpenAIProvider = void 0;
exports.createProvider = createProvider;
var openai_1 = require("./openai");
Object.defineProperty(exports, "OpenAIProvider", { enumerable: true, get: function () { return openai_1.OpenAIProvider; } });
var anthropic_1 = require("./anthropic");
Object.defineProperty(exports, "AnthropicProvider", { enumerable: true, get: function () { return anthropic_1.AnthropicProvider; } });
var gemini_1 = require("./gemini");
Object.defineProperty(exports, "GeminiProvider", { enumerable: true, get: function () { return gemini_1.GeminiProvider; } });
var ollama_1 = require("./ollama");
Object.defineProperty(exports, "OllamaProvider", { enumerable: true, get: function () { return ollama_1.OllamaProvider; } });
/**
 * Creates an AI provider instance based on plugin settings
 *
 * @param settings - The plugin settings containing provider configuration
 * @returns The appropriate provider instance
 * @throws Error if the provider type is invalid
 */
function createProvider(settings) {
    switch (settings.provider) {
        case 'openai':
            return new openai_1.OpenAIProvider(settings.openaiSettings.apiKey, settings.openaiSettings.model);
        case 'anthropic':
            return new anthropic_1.AnthropicProvider(settings.anthropicSettings.apiKey, settings.anthropicSettings.model);
        case 'gemini':
            return new gemini_1.GeminiProvider(settings.geminiSettings.apiKey, settings.geminiSettings.model);
        case 'ollama':
            return new ollama_1.OllamaProvider(settings.ollamaSettings.serverUrl, settings.ollamaSettings.model);
        default:
            throw new Error("Unknown provider type: ".concat(settings.provider));
    }
}
