/**
 * @file lruCache.ts
 * 
 * LRU (Least Recently Used) cache implementation with size limits and TTL support.
 * Provides memory-efficient caching with automatic eviction of least recently used items.
 */

export interface LRUCacheOptions {
    maxSize: number;
    defaultTTL?: number; // Time to live in milliseconds
    onEvict?: (key: string, value: any) => void;
}

interface CacheNode<T> {
    key: string;
    value: T;
    timestamp: number;
    ttl?: number;
    prev: CacheNode<T> | null;
    next: CacheNode<T> | null;
}

export class LRUCache<T = any> {
    private maxSize: number;
    private defaultTTL?: number;
    private onEvict?: (key: string, value: T) => void;
    private cache = new Map<string, CacheNode<T>>();
    private head: CacheNode<T> | null = null;
    private tail: CacheNode<T> | null = null;
    private cleanupInterval: NodeJS.Timeout | null = null;

    constructor(options: LRUCacheOptions) {
        this.maxSize = options.maxSize;
        this.defaultTTL = options.defaultTTL;
        this.onEvict = options.onEvict;

        // Start cleanup interval if TTL is enabled
        if (this.defaultTTL) {
            this.startCleanupInterval();
        }
    }

    /**
     * Get a value from the cache
     */
    get(key: string): T | undefined {
        const node = this.cache.get(key);
        if (!node) {
            return undefined;
        }

        // Check if expired
        if (this.isExpired(node)) {
            this.delete(key);
            return undefined;
        }

        // Move to head (most recently used)
        this.moveToHead(node);
        return node.value;
    }

    /**
     * Set a value in the cache
     */
    set(key: string, value: T, ttl?: number): void {
        const existingNode = this.cache.get(key);
        
        if (existingNode) {
            // Update existing node
            existingNode.value = value;
            existingNode.timestamp = Date.now();
            existingNode.ttl = ttl ?? this.defaultTTL;
            this.moveToHead(existingNode);
            return;
        }

        // Create new node
        const newNode: CacheNode<T> = {
            key,
            value,
            timestamp: Date.now(),
            ttl: ttl ?? this.defaultTTL,
            prev: null,
            next: null
        };

        // Add to cache
        this.cache.set(key, newNode);
        this.addToHead(newNode);

        // Check size limit
        if (this.cache.size > this.maxSize) {
            this.evictLRU();
        }
    }

    /**
     * Check if a key exists in the cache
     */
    has(key: string): boolean {
        const node = this.cache.get(key);
        if (!node) {
            return false;
        }

        if (this.isExpired(node)) {
            this.delete(key);
            return false;
        }

        return true;
    }

    /**
     * Delete a key from the cache
     */
    delete(key: string): boolean {
        const node = this.cache.get(key);
        if (!node) {
            return false;
        }

        this.removeNode(node);
        this.cache.delete(key);

        if (this.onEvict) {
            this.onEvict(key, node.value);
        }

        return true;
    }

    /**
     * Clear all items from the cache
     */
    clear(): void {
        if (this.onEvict) {
            for (const [key, node] of this.cache) {
                this.onEvict(key, node.value);
            }
        }

        this.cache.clear();
        this.head = null;
        this.tail = null;
    }

    /**
     * Get current cache size
     */
    size(): number {
        return this.cache.size;
    }

    /**
     * Get maximum cache size
     */
    maxCacheSize(): number {
        return this.maxSize;
    }

    /**
     * Get all keys in the cache (ordered from most to least recently used)
     */
    keys(): string[] {
        const keys: string[] = [];
        let current = this.head;
        
        while (current) {
            keys.push(current.key);
            current = current.next;
        }
        
        return keys;
    }

    /**
     * Get all values in the cache (ordered from most to least recently used)
     */
    values(): T[] {
        const values: T[] = [];
        let current = this.head;
        
        while (current) {
            if (!this.isExpired(current)) {
                values.push(current.value);
            }
            current = current.next;
        }
        
        return values;
    }

    /**
     * Get cache statistics
     */
    getStats(): {
        size: number;
        maxSize: number;
        hitRate?: number;
        oldestTimestamp?: number;
        newestTimestamp?: number;
    } {
        let oldestTimestamp: number | undefined;
        let newestTimestamp: number | undefined;

        if (this.tail) {
            oldestTimestamp = this.tail.timestamp;
        }
        if (this.head) {
            newestTimestamp = this.head.timestamp;
        }

        return {
            size: this.cache.size,
            maxSize: this.maxSize,
            oldestTimestamp,
            newestTimestamp
        };
    }

    /**
     * Manually trigger cleanup of expired items
     */
    cleanup(): number {
        let removedCount = 0;
        const now = Date.now();
        const keysToRemove: string[] = [];

        for (const [key, node] of this.cache) {
            if (this.isExpired(node, now)) {
                keysToRemove.push(key);
            }
        }

        for (const key of keysToRemove) {
            this.delete(key);
            removedCount++;
        }

        return removedCount;
    }

    /**
     * Update the max size of the cache
     */
    setMaxSize(newMaxSize: number): void {
        this.maxSize = newMaxSize;
        
        // Evict items if necessary
        while (this.cache.size > this.maxSize) {
            this.evictLRU();
        }
    }

    /**
     * Destroy the cache and cleanup resources
     */
    destroy(): void {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }
        this.clear();
    }

    private isExpired(node: CacheNode<T>, now: number = Date.now()): boolean {
        if (!node.ttl) {
            return false;
        }
        return now > node.timestamp + node.ttl;
    }

    private moveToHead(node: CacheNode<T>): void {
        this.removeNode(node);
        this.addToHead(node);
    }

    private addToHead(node: CacheNode<T>): void {
        node.prev = null;
        node.next = this.head;

        if (this.head) {
            this.head.prev = node;
        }

        this.head = node;

        if (!this.tail) {
            this.tail = node;
        }
    }

    private removeNode(node: CacheNode<T>): void {
        if (node.prev) {
            node.prev.next = node.next;
        } else {
            this.head = node.next;
        }

        if (node.next) {
            node.next.prev = node.prev;
        } else {
            this.tail = node.prev;
        }
    }

    private evictLRU(): void {
        if (!this.tail) {
            return;
        }

        const lruNode = this.tail;
        this.removeNode(lruNode);
        this.cache.delete(lruNode.key);

        if (this.onEvict) {
            this.onEvict(lruNode.key, lruNode.value);
        }
    }

    private startCleanupInterval(): void {
        // Run cleanup every 5 minutes
        this.cleanupInterval = setInterval(() => {
            this.cleanup();
        }, 5 * 60 * 1000);
    }
}

/**
 * Factory function to create LRU caches with common configurations
 */
export class LRUCacheFactory {
    /**
     * Create a cache for AI responses
     */
    static createResponseCache(maxSize: number = 100): LRUCache<string> {
        return new LRUCache<string>({
            maxSize,
            defaultTTL: 5 * 60 * 1000, // 5 minutes
            onEvict: (key, value) => {
                // Could log evictions for debugging
            }
        });
    }

    /**
     * Create a cache for DOM elements
     */
    static createDOMCache(maxSize: number = 50): LRUCache<HTMLElement> {
        return new LRUCache<HTMLElement>({
            maxSize,
            defaultTTL: 10 * 60 * 1000, // 10 minutes
            onEvict: (key, element) => {
                // Cleanup DOM element if needed
                if (element.parentNode) {
                    element.parentNode.removeChild(element);
                }
            }
        });
    }

    /**
     * Create a cache for API data
     */
    static createAPICache(maxSize: number = 200): LRUCache<any> {
        return new LRUCache<any>({
            maxSize,
            defaultTTL: 15 * 60 * 1000, // 15 minutes
        });
    }

    /**
     * Create a cache for computed values
     */
    static createComputedCache(maxSize: number = 500): LRUCache<any> {
        return new LRUCache<any>({
            maxSize,
            defaultTTL: 30 * 60 * 1000, // 30 minutes
        });
    }
}