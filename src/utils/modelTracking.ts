import type MyPlugin from '../main';
import type { UnifiedModel } from '../types/providers';
import type { ModelInfo } from '../../providers/base';

/**
 * Utility functions for tracking recently used models and managing favorites.
 * These functions help organize the model selection UI to show relevant models first.
 */

const MAX_RECENT_MODELS = 5;

/**
 * Track a model as recently used. Adds it to the front of the recent models list.
 * Maintains a maximum of 5 recent models.
 * 
 * @param plugin The plugin instance
 * @param modelId The unified model ID (e.g., "openai:gpt-4")
 */
export async function trackRecentModel(plugin: MyPlugin, modelId: string): Promise<void> {
    if (!modelId) return;
    
    const recentModels = plugin.settings.recentModels || [];
    
    // Remove if already in list (we'll add it to front)
    const filtered = recentModels.filter(id => id !== modelId);
    
    // Add to front
    filtered.unshift(modelId);
    
    // Keep only the most recent MAX_RECENT_MODELS
    plugin.settings.recentModels = filtered.slice(0, MAX_RECENT_MODELS);
    
    await plugin.saveSettings();
}

/**
 * Toggle a model's favorite status. If it's favorited, unfavorite it. If not, favorite it.
 * 
 * @param plugin The plugin instance
 * @param modelId The unified model ID (e.g., "openai:gpt-4")
 * @returns true if the model is now favorited, false if unfavorited
 */
export async function toggleFavoriteModel(plugin: MyPlugin, modelId: string): Promise<boolean> {
    if (!modelId) return false;
    
    const favoriteModels = plugin.settings.favoriteModels || [];
    const index = favoriteModels.indexOf(modelId);
    
    if (index >= 0) {
        // Already favorited - remove it
        favoriteModels.splice(index, 1);
        plugin.settings.favoriteModels = favoriteModels;
        await plugin.saveSettings();
        return false;
    } else {
        // Not favorited - add it
        favoriteModels.push(modelId);
        plugin.settings.favoriteModels = favoriteModels;
        await plugin.saveSettings();
        return true;
    }
}

/**
 * Check if a model is favorited.
 * 
 * @param plugin The plugin instance
 * @param modelId The unified model ID (e.g., "openai:gpt-4")
 * @returns true if the model is favorited
 */
export function isFavoriteModel(plugin: MyPlugin, modelId: string): boolean {
    if (!modelId) return false;
    const favoriteModels = plugin.settings.favoriteModels || [];
    return favoriteModels.includes(modelId);
}

/**
 * Get recent models from the available models list.
 * Filters the recent model IDs to only include models that are currently available.
 * 
 * @param plugin The plugin instance
 * @returns Array of UnifiedModel objects for recent models
 */
export function getRecentModels(plugin: MyPlugin): UnifiedModel[] {
    const recentModelIds = plugin.settings.recentModels || [];
    const availableModels = plugin.settings.availableModels || [];
    
    // Map recent IDs to actual model objects, filtering out any that no longer exist
    return recentModelIds
        .map(id => availableModels.find(model => model.id === id))
        .filter((model): model is UnifiedModel => model !== undefined);
}

/**
 * Get favorite models from the available models list.
 * Filters the favorite model IDs to only include models that are currently available.
 * 
 * @param plugin The plugin instance
 * @returns Array of UnifiedModel objects for favorite models
 */
export function getFavoriteModels(plugin: MyPlugin): UnifiedModel[] {
    const favoriteModelIds = plugin.settings.favoriteModels || [];
    const availableModels = plugin.settings.availableModels || [];
    
    // Map favorite IDs to actual model objects, filtering out any that no longer exist
    return favoriteModelIds
        .map(id => availableModels.find(model => model.id === id))
        .filter((model): model is UnifiedModel => model !== undefined);
}

/**
 * Sort models to show favorites first, then recents, then alphabetically.
 * This creates a better UX by surfacing the most relevant models.
 * Works with both UnifiedModel and ModelInfo types.
 * 
 * @param plugin The plugin instance
 * @param models Array of models to sort
 * @returns Sorted array with favorites first, recents second, rest alphabetically
 */
export function sortModelsByRelevance<T extends { id: string; name?: string }>(
    plugin: MyPlugin, 
    models: T[]
): T[] {
    const favoriteIds = new Set(plugin.settings.favoriteModels || []);
    const recentIds = new Set(plugin.settings.recentModels || []);
    
    return models.slice().sort((a, b) => {
        const aFav = favoriteIds.has(a.id);
        const bFav = favoriteIds.has(b.id);
        const aRecent = recentIds.has(a.id);
        const bRecent = recentIds.has(b.id);
        
        // Favorites come first
        if (aFav && !bFav) return -1;
        if (!aFav && bFav) return 1;
        
        // Within favorites or non-favorites, recents come next
        if (aRecent && !bRecent) return -1;
        if (!aRecent && bRecent) return 1;
        
        // Otherwise, alphabetically by name/id (case-insensitive)
        const aName = (a.name || a.id).toLowerCase();
        const bName = (b.name || b.id).toLowerCase();
        const comparison = aName.localeCompare(bName);
        
        // If names are equal, use ID as tiebreaker for stable sorting
        if (comparison === 0) {
            return a.id.localeCompare(b.id);
        }
        
        return comparison;
    });
}
