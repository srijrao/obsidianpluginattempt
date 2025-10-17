/**
 * Tests for ModelService
 * 
 * Tests the model fetching and caching functionality
 */

// Mock the Anthropic SDK before it gets imported
jest.mock('@anthropic-ai/sdk', () => {
  return {
    __esModule: true,
    default: jest.fn(),
  };
});

import { ModelService } from '../src/services/ModelService';
import type { MyPluginSettings } from '../src/types';
import { DEFAULT_SETTINGS } from '../src/types';

// Mock the provider registry
jest.mock('../providers/registry');
jest.mock('../providers/index');

describe('ModelService', () => {
    let modelService: ModelService;
    let mockSettings: MyPluginSettings;

    beforeEach(() => {
        // Get fresh instance for each test
        modelService = ModelService.getInstance();
        modelService.clearCache();
        
        // Create mock settings
        mockSettings = {
            ...DEFAULT_SETTINGS,
            openaiSettings: {
                apiKey: 'sk-test123',
                model: 'gpt-4',
                availableModels: [],
                baseUrl: 'https://api.openai.com/v1'
            }
        };
    });

    afterEach(() => {
        modelService.clearCache();
    });

    describe('Cache Management', () => {
        test('should clear all cache', () => {
            modelService.clearCache();
            const cacheInfo = modelService.getCacheInfo();
            expect(cacheInfo.size).toBe(0);
            expect(cacheInfo.keys).toHaveLength(0);
        });

        test('should clear cache for specific provider', () => {
            // This would require mocking the cache state
            modelService.clearCacheForProvider('openai');
            const cacheInfo = modelService.getCacheInfo();
            // Verify openai cache entries are removed
            expect(cacheInfo.keys.every(key => !key.startsWith('openai:'))).toBe(true);
        });

        test('should provide cache info', () => {
            const cacheInfo = modelService.getCacheInfo();
            expect(cacheInfo).toHaveProperty('size');
            expect(cacheInfo).toHaveProperty('keys');
            expect(Array.isArray(cacheInfo.keys)).toBe(true);
        });
    });

    describe('Cache Key Generation', () => {
        test('should generate unique cache keys for different providers', () => {
            const service = modelService as any;
            const openaiKey = service.getCacheKey('openai', mockSettings);
            const anthropicKey = service.getCacheKey('anthropic', mockSettings);
            
            expect(openaiKey).not.toBe(anthropicKey);
            expect(openaiKey).toContain('openai');
            expect(anthropicKey).toContain('anthropic');
        });

        test('should include API key substring in cache key', () => {
            const service = modelService as any;
            const cacheKey = service.getCacheKey('openai', mockSettings);
            
            expect(cacheKey).toContain('sk-test123'.substring(0, 10));
        });

        test('should handle missing provider settings gracefully', () => {
            const service = modelService as any;
            const settingsWithoutOpenRouter = { ...mockSettings };
            
            const cacheKey = service.getCacheKey('openrouter', settingsWithoutOpenRouter);
            expect(cacheKey).toContain('openrouter');
            expect(cacheKey).toContain('none');
        });
    });

    describe('Singleton Pattern', () => {
        test('should return same instance', () => {
            const instance1 = ModelService.getInstance();
            const instance2 = ModelService.getInstance();
            
            expect(instance1).toBe(instance2);
        });

        test('should share cache across instances', () => {
            const instance1 = ModelService.getInstance();
            const instance2 = ModelService.getInstance();
            
            instance1.clearCache();
            const cacheInfo = instance2.getCacheInfo();
            
            expect(cacheInfo.size).toBe(0);
        });
    });
});
