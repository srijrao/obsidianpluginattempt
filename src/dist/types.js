"use strict";
/**
 * AI Assistant Plugin Types
 *
 * This file contains the core types and interfaces used throughout the plugin.
 * These definitions ensure consistency across different AI providers and
 * make the code more maintainable and type-safe.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_SETTINGS = void 0;
/**
 * Default settings used when initializing the plugin
 */
exports.DEFAULT_SETTINGS = {
    provider: 'openai',
    openaiSettings: {
        apiKey: '',
        model: 'gpt-4',
        availableModels: []
    },
    anthropicSettings: {
        apiKey: '',
        model: 'claude-3-sonnet-20240229',
        availableModels: []
    },
    geminiSettings: {
        apiKey: '',
        model: 'gemini-pro',
        availableModels: []
    },
    ollamaSettings: {
        serverUrl: 'http://localhost:11434',
        model: 'llama2',
        availableModels: []
    },
    systemMessage: 'You are a helpful assistant.',
    temperature: 0.7,
    maxTokens: 1000,
    includeDateWithSystemMessage: false,
    includeTimeWithSystemMessage: false,
    enableStreaming: true,
    autoOpenModelSettings: true,
    enableObsidianLinks: true
};
