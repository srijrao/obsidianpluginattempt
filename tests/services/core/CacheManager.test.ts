/**
 * @file CacheManager.test.ts
 * @description Tests for the CacheManager service
 */

import { CacheManager } from '../../../src/services/core/CacheManager';
import { EventBus } from '../../../src/utils/eventBus';

describe('CacheManager', () => {
    let cacheManager: CacheManager;
    let eventBus: EventBus;

    beforeEach(() => {
        eventBus = new EventBus();
        cacheManager = new CacheManager(eventBus, 10, 1000); // Small cache for testing
    });

    afterEach(() => {
        cacheManager.clear();
        eventBus.clear();
    });

    describe('set and get', () => {
        it('should store and retrieve values', async () => {
            await cacheManager.set('key1', 'value1');
            const result = await cacheManager.get('key1');
            expect(result).toBe('value1');
        });

        it('should return null for non-existent keys', async () => {
            const result = await cacheManager.get('nonexistent');
            expect(result).toBeNull();
        });

        it('should overwrite existing keys', async () => {
            await cacheManager.set('key1', 'value1');
            await cacheManager.set('key1', 'value2');
            const result = await cacheManager.get('key1');
            expect(result).toBe('value2');
        });
    });

    describe('TTL (Time To Live)', () => {
        it('should expire entries after TTL', async () => {
            await cacheManager.set('key1', 'value1', 100); // 100ms TTL
            
            // Should be available immediately
            let result = await cacheManager.get('key1');
            expect(result).toBe('value1');

            // Wait for expiration
            await new Promise(resolve => setTimeout(resolve, 150));

            // Should be expired now
            result = await cacheManager.get('key1');
            expect(result).toBeNull();
        });

        it('should use default TTL when not specified', async () => {
            await cacheManager.set('key1', 'value1');
            const result = await cacheManager.get('key1');
            expect(result).toBe('value1');
        });
    });

    describe('has', () => {
        it('should check for existing keys', async () => {
            await cacheManager.set('key1', 'value1');
            const result = await cacheManager.get('key1');
            expect(result).not.toBeNull();
        });

        it('should return null for non-existent keys', async () => {
            const result = await cacheManager.get('nonexistent');
            expect(result).toBeNull();
        });

        it('should return null for expired keys', async () => {
            await cacheManager.set('key1', 'value1', 50);
            await new Promise(resolve => setTimeout(resolve, 100));
            const result = await cacheManager.get('key1');
            expect(result).toBeNull();
        });
    });

    describe('delete', () => {
        it('should delete existing keys', async () => {
            await cacheManager.set('key1', 'value1');
            await cacheManager.delete('key1');
            const result = await cacheManager.get('key1');
            expect(result).toBeNull();
        });

        it('should handle deleting non-existent keys', async () => {
            await expect(cacheManager.delete('nonexistent')).resolves.not.toThrow();
        });
    });

    describe('clear', () => {
        it('should remove all entries', async () => {
            await cacheManager.set('key1', 'value1');
            await cacheManager.set('key2', 'value2');
            await cacheManager.set('key3', 'value3');

            cacheManager.clear();

            expect(await cacheManager.get('key1')).toBeNull();
            expect(await cacheManager.get('key2')).toBeNull();
            expect(await cacheManager.get('key3')).toBeNull();
        });
    });

    describe('getStats', () => {
        it('should track cache hits', async () => {
            await cacheManager.set('key1', 'value1');
            await cacheManager.get('key1');
            await cacheManager.get('key1');

            const stats = cacheManager.getStats();
            expect(stats.hits).toBe(2);
        });

        it('should track cache misses', async () => {
            await cacheManager.get('nonexistent1');
            await cacheManager.get('nonexistent2');

            const stats = cacheManager.getStats();
            expect(stats.misses).toBe(2);
        });

        it('should track sets and operations', async () => {
            await cacheManager.set('key1', 'value1');
            await cacheManager.set('key2', 'value2');

            const stats = cacheManager.getStats();
            expect(stats.size).toBe(2);
        });

        it('should track deletes and operations', async () => {
            await cacheManager.set('key1', 'value1');
            await cacheManager.delete('key1');

            const stats = cacheManager.getStats();
            expect(stats.size).toBe(0);
        });

        it('should calculate hit rate correctly', async () => {
            await cacheManager.set('key1', 'value1');
            await cacheManager.get('key1'); // hit
            await cacheManager.get('key2'); // miss

            const stats = cacheManager.getStats();
            expect(stats.hitRate).toBeCloseTo(0.5, 2);
        });

        it('should report cache size', async () => {
            await cacheManager.set('key1', 'value1');
            await cacheManager.set('key2', 'value2');

            const stats = cacheManager.getStats();
            expect(stats.size).toBe(2);
        });
    });

    describe('LRU eviction', () => {
        it('should evict least recently used items when cache is full', async () => {
            // Fill cache to max size (10) with slight delays to ensure different timestamps
            for (let i = 0; i < 10; i++) {
                await cacheManager.set(`key${i}`, `value${i}`);
                // Small delay to ensure different timestamps
                await new Promise(resolve => setTimeout(resolve, 1));
            }

            // Add one more item - should evict the first one
            await cacheManager.set('key10', 'value10');

            // First key should be evicted
            expect(await cacheManager.get('key0')).toBeNull();
            // New key should exist
            expect(await cacheManager.get('key10')).toBe('value10');
        });

        it('should update LRU order on access', async () => {
            // Fill cache with slight delays to ensure different timestamps
            for (let i = 0; i < 10; i++) {
                await cacheManager.set(`key${i}`, `value${i}`);
                // Small delay to ensure different timestamps
                await new Promise(resolve => setTimeout(resolve, 1));
            }

            // Access key0 to make it recently used
            await cacheManager.get('key0');

            // Add new item - should evict key1 instead of key0
            await cacheManager.set('key10', 'value10');

            expect(await cacheManager.get('key0')).toBe('value0'); // Should still exist
            expect(await cacheManager.get('key1')).toBeNull(); // Should be evicted
        });
    });

    describe('event publishing', () => {
        it('should publish cache.hit events', async () => {
            const handler = jest.fn();
            eventBus.subscribe('cache.hit', handler);

            await cacheManager.set('key1', 'value1');
            await cacheManager.get('key1');

            expect(handler).toHaveBeenCalled();
            expect(handler.mock.calls[0][0]).toMatchObject({
                key: 'key1',
                type: 'response'
            });
        });

        it('should publish cache.miss events', async () => {
            const handler = jest.fn();
            eventBus.subscribe('cache.miss', handler);

            await cacheManager.get('nonexistent');

            expect(handler).toHaveBeenCalled();
            expect(handler.mock.calls[0][0]).toMatchObject({
                key: 'nonexistent',
                type: 'response'
            });
        });

        it('should publish cache.expired events', async () => {
            const handler = jest.fn();
            eventBus.subscribe('cache.expired', handler);

            await cacheManager.set('key1', 'value1', 50);
            await new Promise(resolve => setTimeout(resolve, 100));
            await cacheManager.get('key1');

            expect(handler).toHaveBeenCalled();
        });

        it('should publish cache.evicted events on LRU eviction', async () => {
            const handler = jest.fn();
            eventBus.subscribe('cache.evicted', handler);

            // Fill cache
            for (let i = 0; i < 10; i++) {
                await cacheManager.set(`key${i}`, `value${i}`);
            }

            // Trigger eviction
            await cacheManager.set('key10', 'value10');

            expect(handler).toHaveBeenCalled();
        });
    });

    describe('access tracking', () => {
        it('should track access count', async () => {
            await cacheManager.set('key1', 'value1');
            await cacheManager.get('key1');
            await cacheManager.get('key1');
            await cacheManager.get('key1');

            // Access internal state to verify count
            const entry = (cacheManager as any).cache.get('key1');
            expect(entry.accessCount).toBe(3);
        });

        it('should update last accessed time', async () => {
            await cacheManager.set('key1', 'value1');
            const entry1 = (cacheManager as any).cache.get('key1');
            const firstAccess = entry1.lastAccessed;

            await new Promise(resolve => setTimeout(resolve, 10));
            await cacheManager.get('key1');

            const entry2 = (cacheManager as any).cache.get('key1');
            expect(entry2.lastAccessed).toBeGreaterThan(firstAccess);
        });
    });
});
