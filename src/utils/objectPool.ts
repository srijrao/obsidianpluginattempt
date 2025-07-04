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
        return this.messagePool.acquire();
    }

    releaseMessage(msg: { role: string; content: string }): void {
        this.messagePool.release(msg);
    }

    acquireArray<T>(): T[] {
        return this.arrayPool.acquire();
    }

    releaseArray<T>(arr: T[]): void {
        this.arrayPool.release(arr);
    }

    clear(): void {
        this.messagePool.clear();
        this.arrayPool.clear();
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
    }
}