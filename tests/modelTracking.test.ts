/**
 * Tests for Model Tracking Utilities
 * 
 * Tests for favorites, recent models, and sorting functionality.
 */

import { 
    trackRecentModel, 
    toggleFavoriteModel, 
    isFavoriteModel,
    getRecentModels,
    getFavoriteModels,
    sortModelsByRelevance
} from '../src/utils/modelTracking';
import type MyPlugin from '../src/main';
import type { MyPluginSettings } from '../src/types/settings';
import type { UnifiedModel } from '../src/types/providers';

// Mock plugin
const createMockPlugin = (settings: Partial<MyPluginSettings> = {}): MyPlugin => {
    const defaultSettings: MyPluginSettings = {
        recentModels: [],
        favoriteModels: [],
        availableModels: [],
        // Add other required settings with defaults
        openaiSettings: { apiKey: '', availableModels: [] },
        anthropicSettings: { apiKey: '', availableModels: [] },
        geminiSettings: { apiKey: '', availableModels: [] },
        ollamaSettings: { serverUrl: '', availableModels: [] },
        openrouterSettings: { apiKey: '', availableModels: [] },
        ...settings
    } as MyPluginSettings;

    return {
        settings: defaultSettings,
        saveSettings: jest.fn().mockResolvedValue(undefined)
    } as any as MyPlugin;
};

// Mock models
const mockModels: UnifiedModel[] = [
    { id: 'openai:gpt-4', name: 'GPT-4', provider: 'openai', modelId: 'gpt-4' },
    { id: 'openai:gpt-3.5-turbo', name: 'GPT-3.5 Turbo', provider: 'openai', modelId: 'gpt-3.5-turbo' },
    { id: 'anthropic:claude-3-opus', name: 'Claude 3 Opus', provider: 'anthropic', modelId: 'claude-3-opus' },
    { id: 'anthropic:claude-3-sonnet', name: 'Claude 3 Sonnet', provider: 'anthropic', modelId: 'claude-3-sonnet' },
    { id: 'gemini:gemini-pro', name: 'Gemini Pro', provider: 'gemini', modelId: 'gemini-pro' },
];

describe('Model Tracking - Recent Models', () => {
    test('should track a model as recently used', async () => {
        const plugin = createMockPlugin();
        
        await trackRecentModel(plugin, 'openai:gpt-4');
        
        expect(plugin.settings.recentModels).toEqual(['openai:gpt-4']);
        expect(plugin.saveSettings).toHaveBeenCalled();
    });

    test('should add multiple models to recent list', async () => {
        const plugin = createMockPlugin();
        
        await trackRecentModel(plugin, 'openai:gpt-4');
        await trackRecentModel(plugin, 'anthropic:claude-3-opus');
        await trackRecentModel(plugin, 'gemini:gemini-pro');
        
        expect(plugin.settings.recentModels).toEqual([
            'gemini:gemini-pro',
            'anthropic:claude-3-opus',
            'openai:gpt-4'
        ]);
    });

    test('should move existing model to front when re-tracked', async () => {
        const plugin = createMockPlugin({
            recentModels: ['model-a', 'model-b', 'model-c']
        });
        
        await trackRecentModel(plugin, 'model-b');
        
        expect(plugin.settings.recentModels).toEqual(['model-b', 'model-a', 'model-c']);
    });

    test('should limit recent models to 5 items', async () => {
        const plugin = createMockPlugin();
        
        // Add 7 models
        for (let i = 1; i <= 7; i++) {
            await trackRecentModel(plugin, `model-${i}`);
        }
        
        // Should only keep the 5 most recent
        expect(plugin.settings.recentModels).toHaveLength(5);
        expect(plugin.settings.recentModels).toEqual([
            'model-7', 'model-6', 'model-5', 'model-4', 'model-3'
        ]);
    });

    test('should handle empty model ID gracefully', async () => {
        const plugin = createMockPlugin();
        
        await trackRecentModel(plugin, '');
        
        expect(plugin.settings.recentModels).toEqual([]);
        expect(plugin.saveSettings).not.toHaveBeenCalled();
    });

    test('should get recent models from available models', () => {
        const plugin = createMockPlugin({
            recentModels: ['openai:gpt-4', 'gemini:gemini-pro', 'nonexistent:model'],
            availableModels: mockModels
        });
        
        const recent = getRecentModels(plugin);
        
        expect(recent).toHaveLength(2);
        expect(recent[0].id).toBe('openai:gpt-4');
        expect(recent[1].id).toBe('gemini:gemini-pro');
    });
});

describe('Model Tracking - Favorite Models', () => {
    test('should favorite a model', async () => {
        const plugin = createMockPlugin();
        
        const isFavorited = await toggleFavoriteModel(plugin, 'openai:gpt-4');
        
        expect(isFavorited).toBe(true);
        expect(plugin.settings.favoriteModels).toEqual(['openai:gpt-4']);
        expect(plugin.saveSettings).toHaveBeenCalled();
    });

    test('should unfavorite a model', async () => {
        const plugin = createMockPlugin({
            favoriteModels: ['openai:gpt-4', 'anthropic:claude-3-opus']
        });
        
        const isFavorited = await toggleFavoriteModel(plugin, 'openai:gpt-4');
        
        expect(isFavorited).toBe(false);
        expect(plugin.settings.favoriteModels).toEqual(['anthropic:claude-3-opus']);
        expect(plugin.saveSettings).toHaveBeenCalled();
    });

    test('should check if model is favorited', () => {
        const plugin = createMockPlugin({
            favoriteModels: ['openai:gpt-4', 'gemini:gemini-pro']
        });
        
        expect(isFavoriteModel(plugin, 'openai:gpt-4')).toBe(true);
        expect(isFavoriteModel(plugin, 'gemini:gemini-pro')).toBe(true);
        expect(isFavoriteModel(plugin, 'anthropic:claude-3-opus')).toBe(false);
    });

    test('should handle empty model ID in favorite check', () => {
        const plugin = createMockPlugin();
        
        expect(isFavoriteModel(plugin, '')).toBe(false);
    });

    test('should handle empty model ID in toggle', async () => {
        const plugin = createMockPlugin();
        
        const result = await toggleFavoriteModel(plugin, '');
        
        expect(result).toBe(false);
        expect(plugin.saveSettings).not.toHaveBeenCalled();
    });

    test('should get favorite models from available models', () => {
        const plugin = createMockPlugin({
            favoriteModels: ['openai:gpt-4', 'anthropic:claude-3-opus', 'nonexistent:model'],
            availableModels: mockModels
        });
        
        const favorites = getFavoriteModels(plugin);
        
        expect(favorites).toHaveLength(2);
        expect(favorites[0].id).toBe('openai:gpt-4');
        expect(favorites[1].id).toBe('anthropic:claude-3-opus');
    });

    test('should allow unlimited favorites', async () => {
        const plugin = createMockPlugin();
        
        // Favorite 10 models
        for (let i = 1; i <= 10; i++) {
            await toggleFavoriteModel(plugin, `model-${i}`);
        }
        
        expect(plugin.settings.favoriteModels).toHaveLength(10);
    });
});

describe('Model Tracking - Sorting by Relevance', () => {
    test('should sort favorites first', () => {
        const plugin = createMockPlugin({
            favoriteModels: ['gemini:gemini-pro', 'openai:gpt-4'],
            recentModels: []
        });
        
        const sorted = sortModelsByRelevance(plugin, mockModels);
        
        // First two should be favorites
        expect(sorted[0].id).toBe('gemini:gemini-pro');
        expect(sorted[1].id).toBe('openai:gpt-4');
    });

    test('should sort recents after favorites', () => {
        const plugin = createMockPlugin({
            favoriteModels: ['openai:gpt-4'],
            recentModels: ['anthropic:claude-3-opus', 'gemini:gemini-pro']
        });
        
        const sorted = sortModelsByRelevance(plugin, mockModels);
        
        // Favorite first, then recents
        expect(sorted[0].id).toBe('openai:gpt-4'); // Favorite
        expect(sorted[1].id).toBe('anthropic:claude-3-opus'); // Recent
        expect(sorted[2].id).toBe('gemini:gemini-pro'); // Recent
    });

    test('should sort rest alphabetically', () => {
        const plugin = createMockPlugin({
            favoriteModels: [],
            recentModels: []
        });
        
        const sorted = sortModelsByRelevance(plugin, mockModels);
        
        // Should be alphabetically sorted by localeCompare (case-insensitive)
        for (let i = 1; i < sorted.length; i++) {
            const prev = (sorted[i-1].name || sorted[i-1].id).toLowerCase();
            const curr = (sorted[i].name || sorted[i].id).toLowerCase();
            expect(prev.localeCompare(curr)).toBeLessThanOrEqual(0);
        }
    });

    test('should not duplicate models that are both favorite and recent', () => {
        const plugin = createMockPlugin({
            favoriteModels: ['openai:gpt-4'],
            recentModels: ['openai:gpt-4', 'gemini:gemini-pro']
        });
        
        const sorted = sortModelsByRelevance(plugin, mockModels);
        
        // Should appear only once (as favorite, not recent)
        const gpt4Count = sorted.filter(m => m.id === 'openai:gpt-4').length;
        expect(gpt4Count).toBe(1);
        expect(sorted[0].id).toBe('openai:gpt-4');
    });

    test('should handle empty favorites and recents', () => {
        const plugin = createMockPlugin({
            favoriteModels: [],
            recentModels: []
        });
        
        const sorted = sortModelsByRelevance(plugin, mockModels);
        
        expect(sorted).toHaveLength(mockModels.length);
        // Should all be sorted by localeCompare
        for (let i = 1; i < sorted.length; i++) {
            const prev = (sorted[i-1].name || sorted[i-1].id).toLowerCase();
            const curr = (sorted[i].name || sorted[i].id).toLowerCase();
            expect(prev.localeCompare(curr)).toBeLessThanOrEqual(0);
        }
    });

    test('should work with generic objects having id and name', () => {
        const plugin = createMockPlugin({
            favoriteModels: ['item-2'],
            recentModels: ['item-3']
        });
        
        const items = [
            { id: 'item-1', name: 'Item A' },
            { id: 'item-2', name: 'Item B' },
            { id: 'item-3', name: 'Item C' },
            { id: 'item-4', name: 'Item D' }
        ];
        
        const sorted = sortModelsByRelevance(plugin, items);
        
        expect(sorted[0].id).toBe('item-2'); // Favorite
        expect(sorted[1].id).toBe('item-3'); // Recent
        expect(sorted[2].id).toBe('item-1'); // Alphabetical
        expect(sorted[3].id).toBe('item-4'); // Alphabetical
    });
});

describe('Model Tracking - Integration Scenarios', () => {
    test('should handle complete workflow: select, favorite, reselect', async () => {
        const plugin = createMockPlugin({
            availableModels: mockModels
        });
        
        // User selects a model
        await trackRecentModel(plugin, 'openai:gpt-4');
        expect(plugin.settings.recentModels).toContain('openai:gpt-4');
        
        // User favorites it
        await toggleFavoriteModel(plugin, 'openai:gpt-4');
        expect(plugin.settings.favoriteModels).toContain('openai:gpt-4');
        
        // User selects another model
        await trackRecentModel(plugin, 'anthropic:claude-3-opus');
        
        // User selects the favorited model again
        await trackRecentModel(plugin, 'openai:gpt-4');
        
        // Should be in both lists
        expect(isFavoriteModel(plugin, 'openai:gpt-4')).toBe(true);
        expect(plugin.settings.recentModels?.[0]).toBe('openai:gpt-4');
        
        // Sorting should show it once at the top (as favorite)
        const sorted = sortModelsByRelevance(plugin, mockModels);
        expect(sorted[0].id).toBe('openai:gpt-4');
    });

    test('should persist settings after multiple operations', async () => {
        const plugin = createMockPlugin();
        
        await trackRecentModel(plugin, 'model-1');
        await toggleFavoriteModel(plugin, 'model-2');
        await trackRecentModel(plugin, 'model-3');
        
        // Should have called saveSettings 3 times
        expect(plugin.saveSettings).toHaveBeenCalledTimes(3);
    });

    test('should handle rapid successive operations', async () => {
        const plugin = createMockPlugin();
        
        // Rapidly track and favorite models
        await Promise.all([
            trackRecentModel(plugin, 'model-1'),
            trackRecentModel(plugin, 'model-2'),
            toggleFavoriteModel(plugin, 'model-1')
        ]);
        
        // All operations should complete
        expect(plugin.settings.recentModels?.length).toBeGreaterThan(0);
        expect(plugin.settings.favoriteModels?.length).toBeGreaterThan(0);
    });
});

console.log('✅ All model tracking tests defined successfully');
