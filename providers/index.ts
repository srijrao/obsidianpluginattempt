/**
 * AI Providers Index
 * 
 * This file exports all AI provider implementations and shared types.
 * Import providers from this file rather than directly from their modules.
 * 
 * Providers self-register when imported, so we import all provider files
 * to ensure they are registered with the provider registry.
 */

import { MyPluginSettings, UnifiedModel } from '../src/types';
import { BaseProvider, ProviderError, ProviderErrorType, ModelInfo } from './base';
import { providerRegistry } from './registry';

// Import all providers to trigger their self-registration
import './openai';
import './anthropic';
import './gemini';
import './openrouter';

// Re-export types and registry
export { BaseProvider, ProviderError, ProviderErrorType } from './base';
export type { ModelInfo } from './base';
export { providerRegistry } from './registry';
export type { ProviderMetadata, ConfigField } from './registry';

/**
 * Creates an AI provider instance based on the plugin settings
 * 
 * Uses the provider registry for dynamic provider creation.
 * 
 * @param settings The plugin settings containing provider configuration
 * @returns The appropriate provider instance
 * @throws Error if the provider type is invalid or not registered
 */
export function createProvider(settings: MyPluginSettings): BaseProvider {
    return providerRegistry.getProvider(settings.provider, settings);
}

/**
 * Creates an AI provider instance based on a unified model selection
 * 
 * @param settings The plugin settings
 * @param unifiedModelId The unified model ID (e.g., "openai:gpt-4")
 * @returns The appropriate provider instance
 */
export function createProviderFromUnifiedModel(settings: MyPluginSettings, unifiedModelId: string): BaseProvider {
    const [providerType] = unifiedModelId.split(':', 2);
    return providerRegistry.getProvider(providerType, settings);
}

/**
 * Gets all available models from all configured providers
 * 
 * @param settings The plugin settings
 * @returns Array of unified models from all providers
 */
export async function getAllAvailableModels(settings: MyPluginSettings): Promise<UnifiedModel[]> {
    const allModels: UnifiedModel[] = [];
    
    // Helper function to get provider display name from metadata
    const getProviderDisplayName = (providerId: string): string => {
        const metadata = providerRegistry.getMetadata(providerId);
        return metadata?.name || providerId;
    };
    
    // Get models for each registered provider
    const registeredProviders = providerRegistry.getAllProviderIds();
    
    for (const providerId of registeredProviders) {
        // Get provider-specific settings
        let providerSettings: any;
        let apiKey: string | undefined;
        
        switch (providerId) {
            case 'openai':
                providerSettings = settings.openaiSettings;
                apiKey = providerSettings?.apiKey;
                break;
            case 'anthropic':
                providerSettings = settings.anthropicSettings;
                apiKey = providerSettings?.apiKey;
                break;
            case 'gemini':
                providerSettings = settings.geminiSettings;
                apiKey = providerSettings?.apiKey;
                break;
            case 'openrouter':
                providerSettings = (settings as any).openrouterSettings;
                apiKey = providerSettings?.apiKey;
                break;
            default:
                // For unknown providers, try to get settings from a generic location
                providerSettings = (settings as any)[`${providerId}Settings`];
                apiKey = providerSettings?.apiKey;
        }
        
        // Only include models if provider has API key and available models
        if (apiKey && providerSettings?.availableModels?.length > 0) {
            providerSettings.availableModels.forEach((model: string) => {
                allModels.push({
                    id: `${providerId}:${model}`,
                    name: `${model} (${getProviderDisplayName(providerId)})`,
                    provider: providerId as any, // Cast to satisfy type constraints
                    modelId: model
                });
            });
        }
    }
    
    return allModels;
}

/**
 * Gets the provider type from a unified model ID
 * 
 * @param unifiedModelId The unified model ID (e.g., "openai:gpt-4")
 * @returns The provider type
 */
export function getProviderFromUnifiedModel(unifiedModelId: string): string {
    const [providerType] = unifiedModelId.split(':', 2);
    return providerType;
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
