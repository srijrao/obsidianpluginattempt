import { LRUCache, LRUCacheFactory, LRUCacheOptions } from '../src/utils/lruCache';

describe('LRUCache', () => {
  let cache: LRUCache<string>;
  let onEvictSpy: jest.Mock;

  beforeEach(() => {
    onEvictSpy = jest.fn();
    cache = new LRUCache<string>({
      maxSize: 3,
      onEvict: onEvictSpy
    });
  });

  afterEach(() => {
    cache.destroy();
  });

  describe('constructor', () => {
    test('should initialize with provided options', () => {
      expect(cache.size()).toBe(0);
      expect(cache.maxCacheSize()).toBe(3);
    });

    test('should start cleanup interval when TTL is provided', () => {
      const cacheWithTTL = new LRUCache<string>({
        maxSize: 5,
        defaultTTL: 1000
      });

      expect(cacheWithTTL.size()).toBe(0);
      cacheWithTTL.destroy();
    });
  });

  describe('basic operations', () => {
    test('should set and get values', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');

      expect(cache.get('key1')).toBe('value1');
      expect(cache.get('key2')).toBe('value2');
      expect(cache.size()).toBe(2);
    });

    test('should return undefined for non-existent keys', () => {
      expect(cache.get('nonexistent')).toBeUndefined();
    });

    test('should update existing values', () => {
      cache.set('key1', 'value1');
      expect(cache.get('key1')).toBe('value1');

      cache.set('key1', 'updated');
      expect(cache.get('key1')).toBe('updated');
      expect(cache.size()).toBe(1);
    });

    test('should check if key exists', () => {
      expect(cache.has('key1')).toBe(false);

      cache.set('key1', 'value1');
      expect(cache.has('key1')).toBe(true);
    });

    test('should delete keys', () => {
      cache.set('key1', 'value1');
      expect(cache.has('key1')).toBe(true);

      const deleted = cache.delete('key1');
      expect(deleted).toBe(true);
      expect(cache.has('key1')).toBe(false);
      expect(cache.size()).toBe(0);

      const deletedAgain = cache.delete('key1');
      expect(deletedAgain).toBe(false);
    });

    test('should call onEvict when deleting', () => {
      cache.set('key1', 'value1');
      cache.delete('key1');

      expect(onEvictSpy).toHaveBeenCalledWith('key1', 'value1');
    });
  });

  describe('LRU behavior', () => {
    test('should evict least recently used item when max size exceeded', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.set('key3', 'value3');
      expect(cache.size()).toBe(3);

      // Adding fourth item should evict key1 (least recently used)
      cache.set('key4', 'value4');

      expect(cache.size()).toBe(3);
      expect(cache.has('key1')).toBe(false);
      expect(cache.has('key2')).toBe(true);
      expect(cache.has('key3')).toBe(true);
      expect(cache.has('key4')).toBe(true);

      expect(onEvictSpy).toHaveBeenCalledWith('key1', 'value1');
    });

    test('should move accessed items to head', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.set('key3', 'value3');

      // Access key1 to make it most recently used
      cache.get('key1');

      // Add new item - should evict key2 (now least recently used)
      cache.set('key4', 'value4');

      expect(cache.has('key1')).toBe(true);
      expect(cache.has('key2')).toBe(false);
      expect(cache.has('key3')).toBe(true);
      expect(cache.has('key4')).toBe(true);

      expect(onEvictSpy).toHaveBeenCalledWith('key2', 'value2');
    });

    test('should maintain correct order with keys() method', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.set('key3', 'value3');

      // Access key1 to move it to head
      cache.get('key1');

      const keys = cache.keys();
      expect(keys).toEqual(['key1', 'key3', 'key2']);
    });

    test('should maintain correct order with values() method', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.set('key3', 'value3');

      // Access key2 to move it to head
      cache.get('key2');

      const values = cache.values();
      expect(values).toEqual(['value2', 'value3', 'value1']);
    });
  });

  describe('TTL (Time To Live)', () => {
    let cacheWithTTL: LRUCache<string>;

    beforeEach(() => {
      jest.useFakeTimers();
      cacheWithTTL = new LRUCache<string>({
        maxSize: 5,
        defaultTTL: 100, // 100ms
        onEvict: onEvictSpy
      });
    });

    afterEach(() => {
      cacheWithTTL.destroy();
      jest.useRealTimers();
    });

    test('should expire items after TTL', () => {
      cacheWithTTL.set('key1', 'value1');
      expect(cacheWithTTL.has('key1')).toBe(true);

      // Advance timers by more than TTL
      jest.advanceTimersByTime(150);

      expect(cacheWithTTL.has('key1')).toBe(false);
      expect(cacheWithTTL.get('key1')).toBeUndefined();
    });

    test('should use custom TTL when provided', () => {
      cacheWithTTL.set('key1', 'value1', 50); // 50ms TTL
      cacheWithTTL.set('key2', 'value2', 200); // 200ms TTL

      // Advance timers by 100ms - key1 should expire, key2 should remain
      jest.advanceTimersByTime(100);

      expect(cacheWithTTL.has('key1')).toBe(false);
      expect(cacheWithTTL.has('key2')).toBe(true);
    });

    test('should cleanup expired items manually', () => {
      cacheWithTTL.set('key1', 'value1', 1); // 1ms TTL
      cacheWithTTL.set('key2', 'value2', 10000); // 10s TTL

      // Advance timers to allow key1 to expire
      jest.advanceTimersByTime(10);

      const removedCount = cacheWithTTL.cleanup();
      expect(removedCount).toBe(1);
      expect(cacheWithTTL.has('key1')).toBe(false);
      expect(cacheWithTTL.has('key2')).toBe(true);
    });

    test('should not include expired items in values()', () => {
      cacheWithTTL.set('key1', 'value1', 50);
      cacheWithTTL.set('key2', 'value2', 200);

      jest.advanceTimersByTime(100);

      const values = cacheWithTTL.values();
      expect(values).toEqual(['value2']);
    });
  });

  describe('size management', () => {
    test('should update max size and evict if necessary', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.set('key3', 'value3');
      expect(cache.size()).toBe(3);

      // Reduce max size to 2
      cache.setMaxSize(2);

      expect(cache.maxCacheSize()).toBe(2);
      expect(cache.size()).toBe(2);
      expect(cache.has('key1')).toBe(false); // LRU item evicted
      expect(onEvictSpy).toHaveBeenCalledWith('key1', 'value1');
    });

    test('should handle increasing max size', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');

      cache.setMaxSize(5);

      expect(cache.maxCacheSize()).toBe(5);
      expect(cache.size()).toBe(2);
      expect(cache.has('key1')).toBe(true);
      expect(cache.has('key2')).toBe(true);
    });
  });

  describe('clear', () => {
    test('should clear all items and call onEvict for each', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.set('key3', 'value3');

      cache.clear();

      expect(cache.size()).toBe(0);
      expect(cache.has('key1')).toBe(false);
      expect(cache.has('key2')).toBe(false);
      expect(cache.has('key3')).toBe(false);

      expect(onEvictSpy).toHaveBeenCalledTimes(3);
      expect(onEvictSpy).toHaveBeenCalledWith('key1', 'value1');
      expect(onEvictSpy).toHaveBeenCalledWith('key2', 'value2');
      expect(onEvictSpy).toHaveBeenCalledWith('key3', 'value3');
    });
  });

  describe('getStats', () => {
    test('should return cache statistics', () => {
      jest.useFakeTimers();
      
      const stats1 = cache.getStats();
      expect(stats1.size).toBe(0);
      expect(stats1.maxSize).toBe(3);
      expect(stats1.oldestTimestamp).toBeUndefined();
      expect(stats1.newestTimestamp).toBeUndefined();

      cache.set('key1', 'value1');
      const time1 = Date.now();
      
      // Advance timers to ensure different timestamps
      jest.advanceTimersByTime(1);
      
      cache.set('key2', 'value2');
      const time2 = Date.now();

      const stats2 = cache.getStats();
      expect(stats2.size).toBe(2);
      expect(stats2.maxSize).toBe(3);
      expect(stats2.oldestTimestamp).toBeGreaterThanOrEqual(time1);
      expect(stats2.newestTimestamp).toBeGreaterThanOrEqual(time2);
      expect(stats2.newestTimestamp).toBeGreaterThanOrEqual(stats2.oldestTimestamp!);
      
      jest.useRealTimers();
    });
  });

  describe('edge cases', () => {
    test('should handle zero max size', () => {
      const zeroCache = new LRUCache<string>({ maxSize: 0 });
      
      zeroCache.set('key1', 'value1');
      expect(zeroCache.size()).toBe(0);
      expect(zeroCache.get('key1')).toBeUndefined();
      
      zeroCache.destroy();
    });

    test('should handle single item cache', () => {
      const singleCache = new LRUCache<string>({ maxSize: 1 });
      
      singleCache.set('key1', 'value1');
      expect(singleCache.size()).toBe(1);
      expect(singleCache.get('key1')).toBe('value1');
      
      singleCache.set('key2', 'value2');
      expect(singleCache.size()).toBe(1);
      expect(singleCache.has('key1')).toBe(false);
      expect(singleCache.get('key2')).toBe('value2');
      
      singleCache.destroy();
    });

    test('should handle empty string keys', () => {
      cache.set('', 'empty key value');
      expect(cache.get('')).toBe('empty key value');
      expect(cache.has('')).toBe(true);
    });

    test('should handle undefined values', () => {
      const undefinedCache = new LRUCache<string | undefined>({ maxSize: 3 });
      
      undefinedCache.set('key1', undefined);
      expect(undefinedCache.has('key1')).toBe(true);
      expect(undefinedCache.get('key1')).toBeUndefined();
      
      undefinedCache.destroy();
    });

    test('should handle rapid successive operations', () => {
      for (let i = 0; i < 100; i++) {
        cache.set(`key${i}`, `value${i}`);
      }
      
      expect(cache.size()).toBe(3); // Should maintain max size
      
      // Should have the last 3 items
      expect(cache.has('key97')).toBe(true);
      expect(cache.has('key98')).toBe(true);
      expect(cache.has('key99')).toBe(true);
    });
  });

  describe('destroy', () => {
    test('should cleanup resources and clear cache', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      
      cache.destroy();
      
      expect(cache.size()).toBe(0);
      expect(cache.get('key1')).toBeUndefined();
    });
  });
});

describe('LRUCacheFactory', () => {
  afterEach(() => {
    // Clean up any created caches
    jest.clearAllTimers();
  });

  describe('createResponseCache', () => {
    test('should create cache with response-specific configuration', () => {
      const responseCache = LRUCacheFactory.createResponseCache(50);
      
      expect(responseCache.maxCacheSize()).toBe(50);
      
      responseCache.set('response1', 'AI response content');
      expect(responseCache.get('response1')).toBe('AI response content');
      
      responseCache.destroy();
    });

    test('should use default size when not specified', () => {
      const responseCache = LRUCacheFactory.createResponseCache();
      
      expect(responseCache.maxCacheSize()).toBe(100);
      
      responseCache.destroy();
    });
  });

  describe('createDOMCache', () => {
    test('should create cache with DOM-specific configuration', () => {
      const domCache = LRUCacheFactory.createDOMCache(25);
      
      expect(domCache.maxCacheSize()).toBe(25);
      
      // Create a mock DOM element
      const mockElement = {
        parentNode: {
          removeChild: jest.fn()
        }
      } as any;
      
      domCache.set('element1', mockElement);
      expect(domCache.get('element1')).toBe(mockElement);
      
      // Test eviction cleanup
      domCache.clear();
      expect(mockElement.parentNode.removeChild).toHaveBeenCalledWith(mockElement);
      
      domCache.destroy();
    });

    test('should handle DOM elements without parent', () => {
      const domCache = LRUCacheFactory.createDOMCache();
      
      const mockElement = {
        parentNode: null
      } as any;
      
      domCache.set('element1', mockElement);
      
      // Should not throw when clearing element without parent
      expect(() => domCache.clear()).not.toThrow();
      
      domCache.destroy();
    });
  });

  describe('createAPICache', () => {
    test('should create cache with API-specific configuration', () => {
      const apiCache = LRUCacheFactory.createAPICache(150);
      
      expect(apiCache.maxCacheSize()).toBe(150);
      
      const apiData = { users: [{ id: 1, name: 'John' }] };
      apiCache.set('users-endpoint', apiData);
      expect(apiCache.get('users-endpoint')).toEqual(apiData);
      
      apiCache.destroy();
    });
  });

  describe('createComputedCache', () => {
    test('should create cache with computed values configuration', () => {
      const computedCache = LRUCacheFactory.createComputedCache(300);
      
      expect(computedCache.maxCacheSize()).toBe(300);
      
      const computedValue = { result: 42, timestamp: Date.now() };
      computedCache.set('expensive-calculation', computedValue);
      expect(computedCache.get('expensive-calculation')).toEqual(computedValue);
      
      computedCache.destroy();
    });
  });

  describe('factory cache behavior', () => {
    test('should create independent cache instances', () => {
      const cache1 = LRUCacheFactory.createResponseCache(10);
      const cache2 = LRUCacheFactory.createResponseCache(20);
      
      cache1.set('key1', 'value1');
      cache2.set('key2', 'value2');
      
      expect(cache1.get('key1')).toBe('value1');
      expect(cache1.get('key2')).toBeUndefined();
      expect(cache2.get('key1')).toBeUndefined();
      expect(cache2.get('key2')).toBe('value2');
      
      cache1.destroy();
      cache2.destroy();
    });
  });
});