/**
 * Generic object pool for reducing memory allocations
 * Reuses objects instead of creating new ones repeatedly
 */
export class ObjectPool<T> {
    private pool: T[] = [];
    private createFn: () => T;
    private resetFn?: (obj: T) => void;
    private maxSize: number;

    constructor(createFn: () => T, resetFn?: (obj: T) => void, maxSize: number = 50) {
        this.createFn = createFn;
        this.resetFn = resetFn;
        this.maxSize = maxSize;
    }

    /**
     * Get an object from the pool or create a new one
     */
    acquire(): T {
        if (this.pool.length > 0) {
            return this.pool.pop()!;
        }
        return this.createFn();
    }

    /**
     * Return an object to the pool for reuse
     */
    release(obj: T): void {
        if (this.pool.length < this.maxSize) {
            if (this.resetFn) {
                this.resetFn(obj);
            }
            this.pool.push(obj);
        }
    }

    /**
     * Clear the pool
     */
    clear(): void {
        this.pool.length = 0;
    }

    /**
     * Get current pool size
     */
    size(): number {
        return this.pool.length;
    }
}

/**
 * Specialized pools for common objects
 */
export class MessageContextPool {
    private static instance: MessageContextPool;
    private messagePool: ObjectPool<{ role: string; content: string }>;
    private arrayPool: ObjectPool<any[]>;
    private acquiredMessages: number = 0;
    private releasedMessages: number = 0;
    private acquiredArrays: number = 0;
    private releasedArrays: number = 0;

    private constructor() {
        this.messagePool = new ObjectPool(
            () => ({ role: '', content: '' }),
            (obj) => {
                obj.role = '';
                obj.content = '';
            }
        );

        this.arrayPool = new ObjectPool(
            () => [],
            (arr) => {
                arr.length = 0;
            }
        );
    }

    static getInstance(): MessageContextPool {
        if (!MessageContextPool.instance) {
            MessageContextPool.instance = new MessageContextPool();
        }
        return MessageContextPool.instance;
    }

    acquireMessage(): { role: string; content: string } {
        this.acquiredMessages++;
        return this.messagePool.acquire();
    }

    releaseMessage(msg: { role: string; content: string }): void {
        this.releasedMessages++;
        this.messagePool.release(msg);
    }

    acquireArray<T>(): T[] {
        this.acquiredArrays++;
        return this.arrayPool.acquire();
    }

    releaseArray<T>(arr: T[]): void {
        this.releasedArrays++;
        this.arrayPool.release(arr);
    }

    clear(): void {
        this.messagePool.clear();
        this.arrayPool.clear();
        this.acquiredMessages = 0;
        this.releasedMessages = 0;
        this.acquiredArrays = 0;
        this.releasedArrays = 0;
    }

    getStats(): {
        acquiredMessages: number;
        releasedMessages: number;
        estimatedMessageMemorySaved: string;
        acquiredArrays: number;
        releasedArrays: number;
        estimatedArrayMemorySaved: string;
    } {
        const messageSizeEstimate = 50; // Estimate bytes per message object
        const arraySizeEstimate = 24; // Estimate bytes per array object (empty array) + 8 bytes per element

        const messageSaved = (this.releasedMessages - this.messagePool.size()) * messageSizeEstimate;
        const arraySaved = (this.releasedArrays - this.arrayPool.size()) * arraySizeEstimate;

        return {
            acquiredMessages: this.acquiredMessages,
            releasedMessages: this.releasedMessages,
            estimatedMessageMemorySaved: `${(messageSaved / 1024).toFixed(2)} KB`,
            acquiredArrays: this.acquiredArrays,
            releasedArrays: this.releasedArrays,
            estimatedArrayMemorySaved: `${(arraySaved / 1024).toFixed(2)} KB`,
        };
    }
}

/**
 * WeakMap-based cache for temporary associations
 * Automatically cleans up when objects are garbage collected
 */
export class WeakCache<K extends object, V> {
    private cache = new WeakMap<K, V>();

    set(key: K, value: V): void {
        this.cache.set(key, value);
    }

    get(key: K): V | undefined {
        return this.cache.get(key);
    }

    has(key: K): boolean {
        return this.cache.has(key);
    }

    delete(key: K): boolean {
        return this.cache.delete(key);
    }
}

/**
 * Pre-allocated array manager for predictable sizes
 */
export class PreAllocatedArrays {
    private static instance: PreAllocatedArrays;
    private arrays = new Map<number, any[][]>();
    private acquiredArraysCount: Map<number, number> = new Map();
    private releasedArraysCount: Map<number, number> = new Map();

    private constructor() {}

    static getInstance(): PreAllocatedArrays {
        if (!PreAllocatedArrays.instance) {
            PreAllocatedArrays.instance = new PreAllocatedArrays();
        }
        return PreAllocatedArrays.instance;
    }

    /**
     * Get a pre-allocated array of specified size
     */
    getArray<T>(size: number): T[] {
        this.acquiredArraysCount.set(size, (this.acquiredArraysCount.get(size) || 0) + 1);
        if (!this.arrays.has(size)) {
            this.arrays.set(size, []);
        }

        const pool = this.arrays.get(size)!;
        if (pool.length > 0) {
            const arr = pool.pop()!;
            arr.length = 0; // Reset array
            return arr;
        }

        return new Array(size);
    }

    /**
     * Return array to pool for reuse
     */
    returnArray<T>(arr: T[]): void {
        const size = arr.length;
        this.releasedArraysCount.set(size, (this.releasedArraysCount.get(size) || 0) + 1);
        if (!this.arrays.has(size)) {
            this.arrays.set(size, []);
        }

        const pool = this.arrays.get(size)!;
        if (pool.length < 10) { // Limit pool size
            arr.length = 0; // Clear array
            pool.push(arr);
        }
    }

    /**
     * Clear all pools
     */
    clear(): void {
        this.arrays.clear();
        this.acquiredArraysCount.clear();
        this.releasedArraysCount.clear();
    }

    getStats(): {
        totalAcquired: number;
        totalReleased: number;
        estimatedMemorySaved: string;
        arraysBySize: { size: number; acquired: number; released: number; inPool: number }[];
    } {
        let totalAcquired = 0;
        let totalReleased = 0;
        let estimatedSavedBytes = 0;
        const arraysBySize: { size: number; acquired: number; released: number; inPool: number }[] = [];

        for (const [size, pool] of this.arrays.entries()) {
            const acquired = this.acquiredArraysCount.get(size) || 0;
            const released = this.releasedArraysCount.get(size) || 0;
            const inPool = pool.length;

            totalAcquired += acquired;
            totalReleased += released;

            // Estimate memory saved: (released - inPool) * (array_overhead + size * element_size)
            // Assuming average element size of 8 bytes (for numbers/pointers)
            const arrayOverhead = 24; // Estimate for empty array object
            const elementSize = 8; // Estimate for element reference/value
            const savedForSize = (released - inPool) * (arrayOverhead + size * elementSize);
            estimatedSavedBytes += savedForSize;

            arraysBySize.push({ size, acquired, released, inPool });
        }

        return {
            totalAcquired,
            totalReleased,
            estimatedMemorySaved: `${(estimatedSavedBytes / 1024).toFixed(2)} KB`,
            arraysBySize: arraysBySize.sort((a, b) => a.size - b.size),
        };
    }
}