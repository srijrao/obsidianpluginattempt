/**
 * AI Providers Index
 * 
 * This file exports all AI provider implementations and shared types.
 * Import providers from this file rather than directly from their modules.
 */

import { MyPluginSettings } from '../src/types';
import { BaseProvider, ProviderError, ProviderErrorType } from './base';
import { AnthropicProvider } from './anthropic';
import { OpenAIProvider } from './openai';
import { GeminiProvider } from './gemini';
import { OllamaProvider } from './ollama';

export { BaseProvider, ProviderError, ProviderErrorType };
export { AnthropicProvider };
export { OpenAIProvider };
export { GeminiProvider };
export { OllamaProvider };

/**
 * Creates an AI provider instance based on the plugin settings
 * 
 * @param settings The plugin settings containing provider configuration
 * @returns The appropriate provider instance
 * @throws Error if the provider type is invalid
 */
export function createProvider(settings: MyPluginSettings): BaseProvider {
    switch (settings.provider) {
        case 'openai':
            return new OpenAIProvider(
                settings.openaiSettings.apiKey,
                settings.openaiSettings.model
            );
        case 'anthropic':
            return new AnthropicProvider(
                settings.anthropicSettings.apiKey,
                settings.anthropicSettings.model
            );
        case 'gemini':
            return new GeminiProvider(
                settings.geminiSettings.apiKey,
                settings.geminiSettings.model
            );
        case 'ollama':
            return new OllamaProvider(
                settings.ollamaSettings.serverUrl,
                settings.ollamaSettings.model
            );
        default:
            throw new Error(`Invalid provider type: ${settings.provider}`);
    }
}
