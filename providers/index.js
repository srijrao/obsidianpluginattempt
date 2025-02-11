/**
 * AI Provider Exports
 *
 * This file exports all AI provider implementations and provides
 * a factory function to create provider instances based on settings.
 */
import { OpenAIProvider } from './openai';
import { AnthropicProvider } from './anthropic';
import { GeminiProvider } from './gemini';
import { OllamaProvider } from './ollama';
/**
 * Creates an AI provider instance based on plugin settings
 *
 * @param settings - The plugin settings containing provider configuration
 * @returns The appropriate provider instance
 * @throws Error if the provider type is invalid
 */
export function createProvider(settings) {
    switch (settings.provider) {
        case 'openai':
            return new OpenAIProvider(settings.openaiSettings.apiKey, settings.openaiSettings.model);
        case 'anthropic':
            return new AnthropicProvider(settings.anthropicSettings.apiKey, settings.anthropicSettings.model);
        case 'gemini':
            return new GeminiProvider(settings.geminiSettings.apiKey, settings.geminiSettings.model);
        case 'ollama':
            return new OllamaProvider(settings.ollamaSettings.serverUrl, settings.ollamaSettings.model);
        default:
            throw new Error(`Unknown provider type: ${settings.provider}`);
    }
}
export { OpenAIProvider, AnthropicProvider, GeminiProvider, OllamaProvider };
