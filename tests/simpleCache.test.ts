import { SimpleCache, createSimpleCache } from '../src/utils/simpleCache';

describe('SimpleCache', () => {
  let cache: SimpleCache<string>;

  beforeEach(() => {
    cache = new SimpleCache<string>(3);
  });

  describe('constructor', () => {
    test('should initialize with provided max size', () => {
      expect(cache.size).toBe(0);
    });

    test('should use default max size', () => {
      const defaultCache = new SimpleCache<string>();
      expect(defaultCache.size).toBe(0);
    });
  });

  describe('set and get', () => {
    test('should store and retrieve values', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');

      expect(cache.get('key1')).toBe('value1');
      expect(cache.get('key2')).toBe('value2');
      expect(cache.size).toBe(2);
    });

    test('should return undefined for non-existent keys', () => {
      expect(cache.get('nonexistent')).toBeUndefined();
    });

    test('should update existing values', () => {
      cache.set('key1', 'value1');
      cache.set('key1', 'updated');

      expect(cache.get('key1')).toBe('updated');
      expect(cache.size).toBe(1);
    });
  });

  describe('LRU eviction', () => {
    test('should evict least recently used item when at capacity', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.set('key3', 'value3');
      expect(cache.size).toBe(3);

      // Adding 4th item should evict key1 (oldest)
      cache.set('key4', 'value4');
      expect(cache.size).toBe(3);
      expect(cache.get('key1')).toBeUndefined();
      expect(cache.get('key2')).toBe('value2');
      expect(cache.get('key3')).toBe('value3');
      expect(cache.get('key4')).toBe('value4');
    });

    test('should move accessed items to most recent', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.set('key3', 'value3');

      // Access key1 to make it most recent
      cache.get('key1');

      // Add key4, should evict key2 (oldest unused)
      cache.set('key4', 'value4');
      expect(cache.get('key1')).toBe('value1'); // Should still exist
      expect(cache.get('key2')).toBeUndefined(); // Should be evicted
      expect(cache.get('key3')).toBe('value3');
      expect(cache.get('key4')).toBe('value4');
    });
  });

  describe('has', () => {
    test('should check if key exists', () => {
      expect(cache.has('key1')).toBe(false);
      
      cache.set('key1', 'value1');
      expect(cache.has('key1')).toBe(true);
    });
  });

  describe('delete', () => {
    test('should remove items', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');

      expect(cache.delete('key1')).toBe(true);
      expect(cache.get('key1')).toBeUndefined();
      expect(cache.get('key2')).toBe('value2');
      expect(cache.size).toBe(1);
    });

    test('should return false for non-existent keys', () => {
      expect(cache.delete('nonexistent')).toBe(false);
    });
  });

  describe('clear', () => {
    test('should remove all items', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      expect(cache.size).toBe(2);

      cache.clear();
      expect(cache.size).toBe(0);
      expect(cache.get('key1')).toBeUndefined();
      expect(cache.get('key2')).toBeUndefined();
    });
  });

  describe('createSimpleCache factory', () => {
    test('should create cache with specified size', () => {
      const factoryCache = createSimpleCache<string>(5);
      expect(factoryCache.size).toBe(0);

      // Fill to capacity
      for (let i = 0; i < 6; i++) {
        factoryCache.set(`key${i}`, `value${i}`);
      }
      
      expect(factoryCache.size).toBe(5);
      expect(factoryCache.get('key0')).toBeUndefined(); // Should be evicted
      expect(factoryCache.get('key5')).toBe('value5');
    });

    test('should use default size when not specified', () => {
      const defaultCache = createSimpleCache<string>();
      expect(defaultCache.size).toBe(0);
    });
  });
});
