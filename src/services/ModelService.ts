/**
 * Model Service
 * 
 * This service manages model fetching and caching for all AI providers.
 * It provides a centralized way to get model information with intelligent caching.
 */

import type { ModelInfo } from '../../providers/base';
import type { MyPluginSettings, UnifiedModel } from '../types';
import { providerRegistry } from '../../providers/registry';
import { createProvider } from '../../providers';

/**
 * Cache entry structure
 */
interface CacheEntry<T> {
    data: T;
    timestamp: number;
}

/**
 * Model Service for fetching and caching model information
 */
export class ModelService {
    private static instance: ModelService;
    private cache: Map<string, CacheEntry<ModelInfo[]>>;
    private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes in milliseconds

    private constructor() {
        this.cache = new Map();
    }

    /**
     * Get the singleton instance of ModelService
     */
    static getInstance(): ModelService {
        if (!ModelService.instance) {
            ModelService.instance = new ModelService();
        }
        return ModelService.instance;
    }

    /**
     * Generate a cache key for a provider based on its settings
     */
    private getCacheKey(providerId: string, settings: MyPluginSettings): string {
        // Include relevant settings in the cache key
        let settingsHash = providerId;
        
        switch (providerId) {
            case 'openai':
                settingsHash += `:${settings.openaiSettings.apiKey?.substring(0, 10)}:${settings.openaiSettings.baseUrl || 'default'}`;
                break;
            case 'anthropic':
                settingsHash += `:${settings.anthropicSettings.apiKey?.substring(0, 10)}`;
                break;
            case 'gemini':
                settingsHash += `:${settings.geminiSettings.apiKey?.substring(0, 10)}`;
                break;
            case 'openrouter':
                const openrouterSettings = (settings as any).openrouterSettings;
                settingsHash += `:${openrouterSettings?.apiKey?.substring(0, 10) || 'none'}`;
                break;
            default:
                // For unknown providers, use generic approach
                const providerSettings = (settings as any)[`${providerId}Settings`];
                settingsHash += `:${providerSettings?.apiKey?.substring(0, 10) || 'none'}`;
        }
        
        return settingsHash;
    }

    /**
     * Check if a cache entry is still valid
     */
    private isCacheValid(entry: CacheEntry<ModelInfo[]>): boolean {
        return Date.now() - entry.timestamp < this.CACHE_TTL;
    }

    /**
     * Get models for a specific provider with caching
     * 
     * @param providerId - The provider ID (e.g., 'openai', 'anthropic')
     * @param settings - Plugin settings
     * @param forceRefresh - If true, bypass cache and fetch fresh data
     * @returns Promise resolving to array of ModelInfo objects
     */
    async getModelsForProvider(
        providerId: string,
        settings: MyPluginSettings,
        forceRefresh: boolean = false
    ): Promise<ModelInfo[]> {
        const cacheKey = this.getCacheKey(providerId, settings);
        
        // Check cache first if not forcing refresh
        if (!forceRefresh) {
            const cachedEntry = this.cache.get(cacheKey);
            if (cachedEntry && this.isCacheValid(cachedEntry)) {
                console.log(`[ModelService] Using cached models for ${providerId}`);
                return cachedEntry.data;
            }
        }

        try {
            // Create provider instance and fetch models
            console.log(`[ModelService] Fetching fresh models for ${providerId}`);
            const provider = createProvider({ ...settings, provider: providerId } as any);
            const models = await provider.listModels();
            
            // Cache the result
            this.cache.set(cacheKey, {
                data: models,
                timestamp: Date.now()
            });
            
            return models;
        } catch (error) {
            console.error(`[ModelService] Error fetching models for ${providerId}:`, error);
            
            // On error, try to return stale cache if available
            const cachedEntry = this.cache.get(cacheKey);
            if (cachedEntry) {
                console.log(`[ModelService] Returning stale cache for ${providerId} due to error`);
                return cachedEntry.data;
            }
            
            // No cache available, throw the error
            throw error;
        }
    }

    /**
     * Get all models with rich metadata across all configured providers
     * Returns ModelInfo[] with full details including description, context_length, etc.
     * 
     * @param settings - Plugin settings
     * @param forceRefresh - If true, bypass cache for all providers
     * @returns Promise resolving to array of ModelInfo objects with unified IDs
     */
    async getAllModelsWithMetadata(
        settings: MyPluginSettings,
        forceRefresh: boolean = false
    ): Promise<ModelInfo[]> {
        const allModels: ModelInfo[] = [];
        const registeredProviders = providerRegistry.getAllProviderIds();
        
        // Fetch models for each provider in parallel
        const providerPromises = registeredProviders.map(async (providerId) => {
            // Check if provider has API key configured
            let hasApiKey = false;
            
            switch (providerId) {
                case 'openai':
                    hasApiKey = !!settings.openaiSettings.apiKey;
                    break;
                case 'anthropic':
                    hasApiKey = !!settings.anthropicSettings.apiKey;
                    break;
                case 'gemini':
                    hasApiKey = !!settings.geminiSettings.apiKey;
                    break;
                case 'openrouter':
                    hasApiKey = !!(settings as any).openrouterSettings?.apiKey;
                    break;
                default:
                    hasApiKey = !!(settings as any)[`${providerId}Settings`]?.apiKey;
            }
            
            if (!hasApiKey) {
                return [];
            }
            
            try {
                const models = await this.getModelsForProvider(providerId, settings, forceRefresh);
                
                // Convert to unified ID format and ensure provider is set
                return models.map(model => ({
                    ...model,
                    id: `${providerId}:${model.id}`, // Use unified ID format
                    provider: providerId, // Ensure provider is set
                }));
            } catch (error) {
                console.error(`[ModelService] Failed to fetch models for ${providerId}:`, error);
                return [];
            }
        });
        
        const results = await Promise.all(providerPromises);
        results.forEach(models => allModels.push(...models));
        
        return allModels;
    }

    /**
     * Get all unified models across all configured providers (legacy method)
     * Returns simplified UnifiedModel[] for backward compatibility
     * 
     * @deprecated Use getAllModelsWithMetadata() for rich model information
     * @param settings - Plugin settings
     * @param forceRefresh - If true, bypass cache for all providers
     * @returns Promise resolving to array of UnifiedModel objects
     */
    async getAllUnifiedModels(
        settings: MyPluginSettings,
        forceRefresh: boolean = false
    ): Promise<UnifiedModel[]> {
        const allModels: UnifiedModel[] = [];
        const registeredProviders = providerRegistry.getAllProviderIds();
        
        // Fetch models for each provider in parallel
        const providerPromises = registeredProviders.map(async (providerId) => {
            // Check if provider has API key configured
            let hasApiKey = false;
            
            switch (providerId) {
                case 'openai':
                    hasApiKey = !!settings.openaiSettings.apiKey;
                    break;
                case 'anthropic':
                    hasApiKey = !!settings.anthropicSettings.apiKey;
                    break;
                case 'gemini':
                    hasApiKey = !!settings.geminiSettings.apiKey;
                    break;
                case 'openrouter':
                    hasApiKey = !!(settings as any).openrouterSettings?.apiKey;
                    break;
                default:
                    hasApiKey = !!(settings as any)[`${providerId}Settings`]?.apiKey;
            }
            
            if (!hasApiKey) {
                return [];
            }
            
            try {
                const models = await this.getModelsForProvider(providerId, settings, forceRefresh);
                const metadata = providerRegistry.getMetadata(providerId);
                const providerName = metadata?.name || providerId;
                
                return models.map(model => ({
                    id: `${providerId}:${model.id}`,
                    name: `${model.name} (${providerName})`,
                    provider: providerId as any,
                    modelId: model.id
                }));
            } catch (error) {
                console.error(`[ModelService] Failed to fetch models for ${providerId}:`, error);
                return [];
            }
        });
        
        const results = await Promise.all(providerPromises);
        results.forEach(models => allModels.push(...models));
        
        return allModels;
    }

    /**
     * Clear all cached models
     */
    clearCache(): void {
        this.cache.clear();
        console.log('[ModelService] Cache cleared');
    }

    /**
     * Clear cached models for a specific provider
     * 
     * @param providerId - Provider ID to clear cache for
     */
    clearCacheForProvider(providerId: string): void {
        // Remove all cache entries that start with the provider ID
        const keysToDelete: string[] = [];
        this.cache.forEach((_, key) => {
            if (key.startsWith(providerId + ':')) {
                keysToDelete.push(key);
            }
        });
        
        keysToDelete.forEach(key => this.cache.delete(key));
        console.log(`[ModelService] Cache cleared for provider: ${providerId}`);
    }

    /**
     * Get cache information for debugging
     * 
     * @returns Object with cache size and keys
     */
    getCacheInfo(): { size: number; keys: string[] } {
        return {
            size: this.cache.size,
            keys: Array.from(this.cache.keys())
        };
    }
}
