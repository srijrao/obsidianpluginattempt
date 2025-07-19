import { ObjectPool, MessageContextPool, WeakCache, PreAllocatedArrays } from '../src/utils/objectPool';

describe('ObjectPool', () => {
  let objectPool: ObjectPool<{ id: number; data: string }>;
  let createFn: jest.Mock;
  let resetFn: jest.Mock;

  beforeEach(() => {
    createFn = jest.fn(() => ({ id: 0, data: '' }));
    resetFn = jest.fn((obj) => {
      obj.id = 0;
      obj.data = '';
    });
    objectPool = new ObjectPool(createFn, resetFn, 5);
  });

  describe('constructor', () => {
    test('should initialize with provided functions and max size', () => {
      expect(objectPool.size()).toBe(0);
    });

    test('should use default max size when not provided', () => {
      const defaultPool = new ObjectPool(createFn);
      expect(defaultPool.size()).toBe(0);
    });
  });

  describe('acquire', () => {
    test('should create new object when pool is empty', () => {
      const obj = objectPool.acquire();
      
      expect(createFn).toHaveBeenCalledTimes(1);
      expect(obj).toEqual({ id: 0, data: '' });
    });

    test('should reuse object from pool when available', () => {
      // First acquire creates new object
      const obj1 = objectPool.acquire();
      obj1.id = 1;
      obj1.data = 'test';
      
      // Release it back to pool
      objectPool.release(obj1);
      expect(objectPool.size()).toBe(1);
      
      // Second acquire should reuse the object
      const obj2 = objectPool.acquire();
      
      expect(createFn).toHaveBeenCalledTimes(1); // Still only called once
      expect(obj2).toBe(obj1); // Same object reference
      expect(obj2).toEqual({ id: 0, data: '' }); // Reset by resetFn
      expect(objectPool.size()).toBe(0);
    });

    test('should create new object when pool is exhausted', () => {
      const obj1 = objectPool.acquire();
      const obj2 = objectPool.acquire();
      
      expect(createFn).toHaveBeenCalledTimes(2);
      expect(obj1).not.toBe(obj2);
    });
  });

  describe('release', () => {
    test('should add object to pool and call reset function', () => {
      const obj = objectPool.acquire();
      obj.id = 42;
      obj.data = 'modified';
      
      objectPool.release(obj);
      
      expect(resetFn).toHaveBeenCalledWith(obj);
      expect(objectPool.size()).toBe(1);
    });

    test('should not exceed max pool size', () => {
      const objects = [];
      
      // Create and release more objects than max size
      for (let i = 0; i < 10; i++) {
        const obj = objectPool.acquire();
        obj.id = i;
        objects.push(obj);
      }
      
      // Release all objects
      objects.forEach(obj => objectPool.release(obj));
      
      // Pool should not exceed max size of 5
      expect(objectPool.size()).toBe(5);
    });

    test('should work without reset function', () => {
      const poolWithoutReset = new ObjectPool(createFn, undefined, 3);
      const obj = poolWithoutReset.acquire();
      
      expect(() => poolWithoutReset.release(obj)).not.toThrow();
      expect(poolWithoutReset.size()).toBe(1);
    });
  });

  describe('clear', () => {
    test('should empty the pool', () => {
      // Acquire and release objects to populate the pool
      const obj1 = objectPool.acquire();
      const obj2 = objectPool.acquire();
      const obj3 = objectPool.acquire();
      objectPool.release(obj1);
      objectPool.release(obj2);
      objectPool.release(obj3);
      
      expect(objectPool.size()).toBe(3);
      
      objectPool.clear();
      
      expect(objectPool.size()).toBe(0);
    });
  });

  describe('size', () => {
    test('should return current pool size', () => {
      expect(objectPool.size()).toBe(0);
      
      const obj1 = objectPool.acquire();
      objectPool.release(obj1);
      expect(objectPool.size()).toBe(1);
      
      const obj2 = objectPool.acquire();
      objectPool.release(obj2);
      expect(objectPool.size()).toBe(1); // Same object reused
      
      const obj3 = objectPool.acquire();
      const obj4 = objectPool.acquire();
      objectPool.release(obj3);
      objectPool.release(obj4);
      expect(objectPool.size()).toBe(2);
    });
  });
});

describe('MessageContextPool', () => {
  let messagePool: MessageContextPool;

  beforeEach(() => {
    messagePool = MessageContextPool.getInstance();
    messagePool.clear(); // Reset singleton state
  });

  describe('singleton pattern', () => {
    test('should return same instance', () => {
      const instance1 = MessageContextPool.getInstance();
      const instance2 = MessageContextPool.getInstance();
      
      expect(instance1).toBe(instance2);
    });
  });

  describe('message pool operations', () => {
    test('should acquire and release message objects', () => {
      const msg = messagePool.acquireMessage();
      
      expect(msg).toEqual({ role: '', content: '' });
      
      msg.role = 'user';
      msg.content = 'test message';
      
      messagePool.releaseMessage(msg);
      
      // Acquire again should get the same object, reset
      const msg2 = messagePool.acquireMessage();
      expect(msg2).toBe(msg);
      expect(msg2).toEqual({ role: '', content: '' });
    });

    test('should handle multiple message acquisitions', () => {
      const messages = [];
      
      for (let i = 0; i < 5; i++) {
        const msg = messagePool.acquireMessage();
        msg.role = `role${i}`;
        msg.content = `content${i}`;
        messages.push(msg);
      }
      
      // Release all messages
      messages.forEach(msg => messagePool.releaseMessage(msg));
      
      // Acquire again should reuse objects
      const newMsg = messagePool.acquireMessage();
      expect(newMsg).toEqual({ role: '', content: '' });
      expect(messages).toContain(newMsg);
    });
  });

  describe('array pool operations', () => {
    test('should acquire and release array objects', () => {
      const arr = messagePool.acquireArray<string>();
      
      expect(Array.isArray(arr)).toBe(true);
      expect(arr.length).toBe(0);
      
      arr.push('item1', 'item2', 'item3');
      
      messagePool.releaseArray(arr);
      
      // Acquire again should get the same array, reset
      const arr2 = messagePool.acquireArray<string>();
      expect(arr2).toBe(arr);
      expect(arr2.length).toBe(0);
    });

    test('should handle different array types', () => {
      const stringArr = messagePool.acquireArray<string>();
      const numberArr = messagePool.acquireArray<number>();
      
      stringArr.push('test');
      numberArr.push(42);
      
      messagePool.releaseArray(stringArr);
      messagePool.releaseArray(numberArr);
      
      expect(stringArr.length).toBe(0);
      expect(numberArr.length).toBe(0);
    });
  });

  describe('clear', () => {
    test('should clear all pools', () => {
      const msg = messagePool.acquireMessage();
      const arr = messagePool.acquireArray();
      
      messagePool.releaseMessage(msg);
      messagePool.releaseArray(arr);
      
      messagePool.clear();
      
      // After clear, should create new objects
      const newMsg = messagePool.acquireMessage();
      const newArr = messagePool.acquireArray();
      
      expect(newMsg).not.toBe(msg);
      expect(newArr).not.toBe(arr);
    });
  });
});

describe('WeakCache', () => {
  let weakCache: WeakCache<object, string>;
  let key1: object;
  let key2: object;

  beforeEach(() => {
    weakCache = new WeakCache<object, string>();
    key1 = { id: 1 };
    key2 = { id: 2 };
  });

  describe('basic operations', () => {
    test('should set and get values', () => {
      weakCache.set(key1, 'value1');
      weakCache.set(key2, 'value2');
      
      expect(weakCache.get(key1)).toBe('value1');
      expect(weakCache.get(key2)).toBe('value2');
    });

    test('should return undefined for non-existent keys', () => {
      expect(weakCache.get(key1)).toBeUndefined();
    });

    test('should check if key exists', () => {
      expect(weakCache.has(key1)).toBe(false);
      
      weakCache.set(key1, 'value1');
      expect(weakCache.has(key1)).toBe(true);
    });

    test('should delete keys', () => {
      weakCache.set(key1, 'value1');
      expect(weakCache.has(key1)).toBe(true);
      
      const deleted = weakCache.delete(key1);
      expect(deleted).toBe(true);
      expect(weakCache.has(key1)).toBe(false);
      
      const deletedAgain = weakCache.delete(key1);
      expect(deletedAgain).toBe(false);
    });

    test('should handle object keys only', () => {
      const objKey = { test: true };
      weakCache.set(objKey, 'object value');
      
      expect(weakCache.get(objKey)).toBe('object value');
    });

    test('should update existing values', () => {
      weakCache.set(key1, 'initial');
      expect(weakCache.get(key1)).toBe('initial');
      
      weakCache.set(key1, 'updated');
      expect(weakCache.get(key1)).toBe('updated');
    });
  });

  describe('memory management', () => {
    test('should allow garbage collection of keys', () => {
      let tempKey: object | null = { temp: true };
      weakCache.set(tempKey, 'temp value');
      
      expect(weakCache.has(tempKey)).toBe(true);
      
      // Remove reference to key
      tempKey = null;
      
      // Force garbage collection (if available)
      if (global.gc) {
        global.gc();
      }
      
      // Note: We can't reliably test garbage collection in Jest
      // This test documents the intended behavior
    });
  });
});

describe('PreAllocatedArrays', () => {
  let preAllocated: PreAllocatedArrays;

  beforeEach(() => {
    preAllocated = PreAllocatedArrays.getInstance();
    preAllocated.clear(); // Reset singleton state
  });

  describe('singleton pattern', () => {
    test('should return same instance', () => {
      const instance1 = PreAllocatedArrays.getInstance();
      const instance2 = PreAllocatedArrays.getInstance();
      
      expect(instance1).toBe(instance2);
    });
  });

  describe('array management', () => {
    test('should provide arrays of requested size', () => {
      const arr5 = preAllocated.getArray<number>(5);
      const arr10 = preAllocated.getArray<string>(10);
      
      expect(Array.isArray(arr5)).toBe(true);
      expect(Array.isArray(arr10)).toBe(true);
      expect(arr5.length).toBe(5); // Newly created array has length of size
      expect(arr10.length).toBe(10); // Newly created array has length of size
    });

    test('should reuse returned arrays', () => {
      const arr1 = preAllocated.getArray<number>(0); // Acquire array of size 0
      
      preAllocated.returnArray(arr1); // Return to pool for size 0
      
      const arr2 = preAllocated.getArray<number>(0); // Request array of size 0
      
      expect(arr2).toBe(arr1); // Should be the same array reference
      expect(arr2.length).toBe(0); // Should be reset to empty
    });

    test('should handle different array sizes separately', () => {
      const arr5a = preAllocated.getArray<number>(5);
      const arr10a = preAllocated.getArray<number>(10);
      
      preAllocated.returnArray(arr5a);
      preAllocated.returnArray(arr10a);
      
      const arr5b = preAllocated.getArray<number>(5);
      const arr10b = preAllocated.getArray<number>(10);
      
      expect(arr5b).toBe(arr5a);
      expect(arr10b).toBe(arr10a);
      expect(arr5b).not.toBe(arr10b);
    });

    test('should limit pool size per array size', () => {
      const arrays: number[][] = [];
      
      // Create and return more than 10 arrays (pool limit)
      for (let i = 0; i < 15; i++) {
        const arr = preAllocated.getArray<number>(5);
        arr.push(i);
        arrays.push(arr);
      }
      
      // Return all arrays
      arrays.forEach(arr => preAllocated.returnArray(arr));
      
      // Get arrays again - should only reuse up to 10
      const reusedArrays: number[][] = [];
      for (let i = 0; i < 15; i++) {
        reusedArrays.push(preAllocated.getArray<number>(5));
      }
      
      // First 10 should be reused, last 5 should be new
      const reusedCount = reusedArrays.filter(arr => arrays.includes(arr)).length;
      expect(reusedCount).toBeLessThanOrEqual(10);
    });

    test('should clear arrays when returning', () => {
      const arr = preAllocated.getArray<string>(5);
      arr.push('a', 'b', 'c');
      
      preAllocated.returnArray(arr);
      
      expect(arr.length).toBe(0);
    });

    test('should handle zero-length arrays', () => {
      const arr = preAllocated.getArray<any>(0);
      expect(arr.length).toBe(0);
      
      preAllocated.returnArray(arr);
      
      const arr2 = preAllocated.getArray<any>(0);
      expect(arr2).toBe(arr);
    });
  });

  describe('clear', () => {
    test('should clear all array pools', () => {
      const arr5 = preAllocated.getArray<number>(5);
      const arr10 = preAllocated.getArray<number>(10);
      
      preAllocated.returnArray(arr5);
      preAllocated.returnArray(arr10);
      
      preAllocated.clear();
      
      // After clear, should create new arrays
      const newArr5 = preAllocated.getArray<number>(5);
      const newArr10 = preAllocated.getArray<number>(10);
      
      expect(newArr5).not.toBe(arr5);
      expect(newArr10).not.toBe(arr10);
    });
  });

  describe('edge cases', () => {
    test('should handle large array sizes', () => {
      const largeArr = preAllocated.getArray<number>(1000);
      expect(largeArr.length).toBe(1000); // Newly created array has length of size
      
      largeArr.push(...Array(500).fill(0).map((_, i) => i));
      expect(largeArr.length).toBe(1500); // Length increases with push
      
      preAllocated.returnArray(largeArr);
      expect(largeArr.length).toBe(0); // Reset to empty after returning
    });

    test('should handle negative array sizes gracefully', () => {
      // The current implementation throws a RangeError for negative sizes
      expect(() => preAllocated.getArray<number>(-1)).toThrow(RangeError);
    });
  });
});