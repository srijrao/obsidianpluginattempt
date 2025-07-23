/**
 * @file CacheManager.ts
 * 
 * Cache Manager service for handling response caching with TTL support.
 * Extracted from AIDispatcher to follow single responsibility principle.
 */

import { ICacheManager, CacheStats, IEventBus } from '../interfaces';
import { LRUCache } from '../../utils/lruCache';

export interface CacheEntry {
    value: string;
    timestamp: number;
    ttl: number;
    accessCount: number;
    lastAccessed: number;
}

/**
 * Manages response caching with TTL, LRU eviction, and statistics
 */
export class CacheManager implements ICacheManager {
    private cache: Map<string, CacheEntry> = new Map();
    private readonly maxSize: number;
    private readonly defaultTTL: number;
    private stats = {
        hits: 0,
        misses: 0,
        sets: 0,
        deletes: 0,
        evictions: 0
    };

    constructor(
        private eventBus: IEventBus,
        maxSize: number = 200,
        defaultTTL: number = 5 * 60 * 1000 // 5 minutes
    ) {
        this.maxSize = maxSize;
        this.defaultTTL = defaultTTL;
        this.startCleanupTimer();
    }

    /**
     * Gets a value from the cache
     */
    async get(key: string): Promise<string | null> {
        const entry = this.cache.get(key);
        
        if (!entry) {
            this.stats.misses++;
            this.eventBus.publish('cache.miss', {
                key,
                type: 'response',
                timestamp: Date.now()
            });
            return null;
        }

        // Check if entry has expired
        if (this.isExpired(entry)) {
            this.cache.delete(key);
            this.stats.misses++;
            this.eventBus.publish('cache.expired', {
                key,
                age: Date.now() - entry.timestamp,
                ttl: entry.ttl,
                timestamp: Date.now()
            });
            return null;
        }

        // Update access statistics
        entry.accessCount++;
        entry.lastAccessed = Date.now();
        this.stats.hits++;

        this.eventBus.publish('cache.hit', {
            key,
            type: 'response',
            accessCount: entry.accessCount,
            age: Date.now() - entry.timestamp,
            timestamp: Date.now()
        });

        return entry.value;
    }

    /**
     * Sets a value in the cache
     */
    async set(key: string, value: string, ttl?: number): Promise<void> {
        const effectiveTTL = ttl || this.defaultTTL;
        const now = Date.now();

        // Check if we need to evict entries to make space
        if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
            this.evictLeastRecentlyUsed();
        }

        const entry: CacheEntry = {
            value,
            timestamp: now,
            ttl: effectiveTTL,
            accessCount: 0,
            lastAccessed: now
        };

        this.cache.set(key, entry);
        this.stats.sets++;

        this.eventBus.publish('cache.set', {
            key,
            size: value.length,
            ttl: effectiveTTL,
            cacheSize: this.cache.size,
            timestamp: now
        });
    }

    /**
     * Deletes a specific key from the cache
     */
    async delete(key: string): Promise<void> {
        if (this.cache.delete(key)) {
            this.stats.deletes++;
            this.eventBus.publish('cache.delete', {
                key,
                cacheSize: this.cache.size,
                timestamp: Date.now()
            });
        }
    }

    /**
     * Clears all entries from the cache
     */
    async clear(): Promise<void> {
        const clearedCount = this.cache.size;
        this.cache.clear();
        this.resetStats();

        this.eventBus.publish('cache.cleared', {
            clearedCount,
            timestamp: Date.now()
        });
    }

    /**
     * Gets cache statistics
     */
    getStats(): CacheStats {
        const hitRate = this.stats.hits + this.stats.misses > 0 
            ? this.stats.hits / (this.stats.hits + this.stats.misses) 
            : 0;

        return {
            hits: this.stats.hits,
            misses: this.stats.misses,
            size: this.cache.size,
            maxSize: this.maxSize,
            hitRate: Math.round(hitRate * 100) / 100 // Round to 2 decimal places
        };
    }

    /**
     * Gets detailed cache information
     */
    getDetailedStats(): {
        stats: CacheStats;
        entries: Array<{
            key: string;
            size: number;
            age: number;
            ttl: number;
            accessCount: number;
            lastAccessed: number;
        }>;
        memoryUsage: number;
    } {
        const entries = Array.from(this.cache.entries()).map(([key, entry]) => ({
            key,
            size: entry.value.length,
            age: Date.now() - entry.timestamp,
            ttl: entry.ttl,
            accessCount: entry.accessCount,
            lastAccessed: entry.lastAccessed
        }));

        const memoryUsage = entries.reduce((total, entry) => total + entry.size, 0);

        return {
            stats: this.getStats(),
            entries,
            memoryUsage
        };
    }

    /**
     * Checks if a cache entry has expired
     */
    private isExpired(entry: CacheEntry): boolean {
        return Date.now() - entry.timestamp > entry.ttl;
    }

    /**
     * Evicts the least recently used entry
     */
    private evictLeastRecentlyUsed(): void {
        let oldestKey: string | null = null;
        let oldestTime = Date.now();

        for (const [key, entry] of this.cache.entries()) {
            if (entry.lastAccessed < oldestTime) {
                oldestTime = entry.lastAccessed;
                oldestKey = key;
            }
        }

        if (oldestKey) {
            this.cache.delete(oldestKey);
            this.stats.evictions++;
            
            this.eventBus.publish('cache.evicted', {
                key: oldestKey,
                reason: 'lru',
                cacheSize: this.cache.size,
                timestamp: Date.now()
            });
        }
    }

    /**
     * Cleans up expired entries
     */
    private cleanupExpiredEntries(): void {
        const now = Date.now();
        const expiredKeys: string[] = [];

        for (const [key, entry] of this.cache.entries()) {
            if (this.isExpired(entry)) {
                expiredKeys.push(key);
            }
        }

        for (const key of expiredKeys) {
            this.cache.delete(key);
        }

        if (expiredKeys.length > 0) {
            this.eventBus.publish('cache.cleanup', {
                expiredCount: expiredKeys.length,
                cacheSize: this.cache.size,
                timestamp: now
            });
        }
    }

    /**
     * Starts the cleanup timer for expired entries
     */
    private startCleanupTimer(): void {
        setInterval(() => {
            this.cleanupExpiredEntries();
        }, 60000); // Clean up every minute
    }

    /**
     * Resets cache statistics
     */
    private resetStats(): void {
        this.stats = {
            hits: 0,
            misses: 0,
            sets: 0,
            deletes: 0,
            evictions: 0
        };
    }

    /**
     * Exports cache contents for backup/debugging
     */
    exportCache(): string {
        const exportData = {
            timestamp: Date.now(),
            stats: this.getStats(),
            entries: Array.from(this.cache.entries()).map(([key, entry]) => ({
                key,
                value: entry.value,
                timestamp: entry.timestamp,
                ttl: entry.ttl,
                accessCount: entry.accessCount,
                lastAccessed: entry.lastAccessed
            }))
        };

        return JSON.stringify(exportData, null, 2);
    }

    /**
     * Imports cache contents from backup
     */
    async importCache(data: string): Promise<void> {
        try {
            const importData = JSON.parse(data);
            const now = Date.now();

            this.clear();

            for (const entryData of importData.entries) {
                // Only import non-expired entries
                if (now - entryData.timestamp < entryData.ttl) {
                    const entry: CacheEntry = {
                        value: entryData.value,
                        timestamp: entryData.timestamp,
                        ttl: entryData.ttl,
                        accessCount: entryData.accessCount,
                        lastAccessed: entryData.lastAccessed
                    };
                    this.cache.set(entryData.key, entry);
                }
            }

            this.eventBus.publish('cache.imported', {
                importedCount: this.cache.size,
                timestamp: now
            });
        } catch (error: any) {
            this.eventBus.publish('cache.import.failed', {
                error: error.message,
                timestamp: Date.now()
            });
            throw new Error(`Failed to import cache: ${error.message}`);
        }
    }

    /**
     * Cleanup method for disposing the service
     */
    dispose(): void {
        this.clear();
    }
}