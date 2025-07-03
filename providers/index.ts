/**
 * AI Providers Index
 * 
 * This file exports all AI provider implementations and shared types.
 * Import providers from this file rather than directly from their modules.
 */

import { MyPluginSettings, UnifiedModel } from '../src/types';
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
                settings.openaiSettings.model,
                settings.openaiSettings.baseUrl,
                settings.debugMode ?? false // Pass debugMode
            );
        case 'anthropic':
            return new AnthropicProvider(
                settings.anthropicSettings.apiKey,
                settings.anthropicSettings.model,
                settings.debugMode ?? false // Pass debugMode
            );
        case 'gemini':
            return new GeminiProvider(
                settings.geminiSettings.apiKey,
                settings.geminiSettings.model,
                undefined, // apiVersion is optional, so pass undefined if not explicitly set
                settings.debugMode ?? false // Pass debugMode
            );
        case 'ollama':
            return new OllamaProvider(
                settings.ollamaSettings.serverUrl,
                settings.ollamaSettings.model,
                settings.debugMode ?? false // Pass debugMode
            );        default:
            throw new Error(`Invalid provider type: ${settings.provider}`);
    }
}

/**
 * Creates an AI provider instance based on a unified model selection
 * 
 * @param settings The plugin settings
 * @param unifiedModelId The unified model ID (e.g., "openai:gpt-4")
 * @returns The appropriate provider instance
 */
export function createProviderFromUnifiedModel(settings: MyPluginSettings, unifiedModelId: string): BaseProvider {
    const [providerType, modelId] = unifiedModelId.split(':', 2);
    
    switch (providerType) {
        case 'openai':
            return new OpenAIProvider(settings.openaiSettings.apiKey, modelId, settings.openaiSettings.baseUrl, settings.debugMode ?? false); // Pass debugMode
        case 'anthropic':
            return new AnthropicProvider(settings.anthropicSettings.apiKey, modelId, settings.debugMode ?? false); // Pass debugMode
        case 'gemini':
            return new GeminiProvider(settings.geminiSettings.apiKey, modelId, undefined, settings.debugMode ?? false); // Pass debugMode
        case 'ollama':
            return new OllamaProvider(settings.ollamaSettings.serverUrl, modelId, settings.debugMode ?? false); // Pass debugMode
        default:
            throw new Error(`Invalid provider type: ${providerType}`);
    }
}

/**
 * Gets all available models from all configured providers
 * 
 * @param settings The plugin settings
 * @returns Array of unified models from all providers
 */
export async function getAllAvailableModels(settings: MyPluginSettings): Promise<UnifiedModel[]> {
    const allModels: UnifiedModel[] = [];
    
    // Helper function to get provider display name
    const getProviderDisplayName = (provider: string): string => {
        switch (provider) {
            case 'openai': return 'OpenAI';
            case 'anthropic': return 'Anthropic';
            case 'gemini': return 'Google';
            case 'ollama': return 'Ollama';
            default: return provider;
        }
    };
    
    // OpenAI models
    if (settings.openaiSettings.apiKey && settings.openaiSettings.availableModels.length > 0) {
        settings.openaiSettings.availableModels.forEach(model => {
            allModels.push({
                id: `openai:${model}`,
                name: `${model} (${getProviderDisplayName('openai')})`,
                provider: 'openai',
                modelId: model
            });
        });
    }
    
    // Anthropic models
    if (settings.anthropicSettings.apiKey && settings.anthropicSettings.availableModels.length > 0) {
        settings.anthropicSettings.availableModels.forEach(model => {
            allModels.push({
                id: `anthropic:${model}`,
                name: `${model} (${getProviderDisplayName('anthropic')})`,
                provider: 'anthropic',
                modelId: model
            });
        });
    }
    
    // Gemini models
    if (settings.geminiSettings.apiKey && settings.geminiSettings.availableModels.length > 0) {
        settings.geminiSettings.availableModels.forEach(model => {
            allModels.push({
                id: `gemini:${model}`,
                name: `${model} (${getProviderDisplayName('gemini')})`,
                provider: 'gemini',
                modelId: model
            });
        });
    }
    
    // Ollama models
    if (settings.ollamaSettings.serverUrl && settings.ollamaSettings.availableModels.length > 0) {
        settings.ollamaSettings.availableModels.forEach(model => {
            allModels.push({
                id: `ollama:${model}`,
                name: `${model} (${getProviderDisplayName('ollama')})`,
                provider: 'ollama',
                modelId: model
            });
        });
    }
    
    return allModels;
}

/**
 * Gets the provider type from a unified model ID
 * 
 * @param unifiedModelId The unified model ID (e.g., "openai:gpt-4")
 * @returns The provider type
 */
export function getProviderFromUnifiedModel(unifiedModelId: string): 'openai' | 'anthropic' | 'gemini' | 'ollama' {
    const [providerType] = unifiedModelId.split(':', 2);
    return providerType as 'openai' | 'anthropic' | 'gemini' | 'ollama';
}

/**
 * Gets the model ID from a unified model ID
 * 
 * @param unifiedModelId The unified model ID (e.g., "openai:gpt-4")
 * @returns The model ID for the provider
 */
export function getModelIdFromUnifiedModel(unifiedModelId: string): string {
    const [, modelId] = unifiedModelId.split(':', 2);
    return modelId;
}
