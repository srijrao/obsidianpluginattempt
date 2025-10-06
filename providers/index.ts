/**
 * AI Providers Index
 * 
 * This file exports all AI provider implementations and shared types.
 * Import providers from this file rather than directly from their modules.
 */

import { MyPluginSettings, UnifiedModel } from '../src/types';
import { BaseProvider, ProviderError, ProviderErrorType } from './base';
import { OpenAIProvider } from './openai';

export { BaseProvider, ProviderError, ProviderErrorType };
export { OpenAIProvider };

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
        default:
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
    
    return allModels;
}

/**
 * Gets the provider type from a unified model ID
 * 
 * @param unifiedModelId The unified model ID (e.g., "openai:gpt-4")
 * @returns The provider type
 */
export function getProviderFromUnifiedModel(unifiedModelId: string): 'openai' {
    const [providerType] = unifiedModelId.split(':', 2);
    return providerType as 'openai';
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
