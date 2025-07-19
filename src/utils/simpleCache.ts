/**
 * SimpleCache - Replaces the complex LRU cache with essential caching functionality
 * Follows the architecture review recommendations to remove enterprise-grade complexity
 */

export class SimpleCache<T> {
    private cache = new Map<string, T>();
    
    constructor(private maxSize: number = 100) {}
    
    get(key: string): T | undefined {
        const value = this.cache.get(key);
        if (value !== undefined) {
            // Move to end (most recent)
            this.cache.delete(key);
            this.cache.set(key, value);
        }
        return value;
    }
    
    set(key: string, value: T): void {
        if (this.cache.has(key)) {
            this.cache.delete(key);
        } else if (this.cache.size >= this.maxSize) {
            // Remove oldest
            const firstKey = this.cache.keys().next().value;
            this.cache.delete(firstKey);
        }
        this.cache.set(key, value);
    }
    
    has(key: string): boolean {
        return this.cache.has(key);
    }
    
    delete(key: string): boolean {
        return this.cache.delete(key);
    }
    
    clear(): void {
        this.cache.clear();
    }
    
    get size(): number {
        return this.cache.size;
    }
}

// Factory function to match existing patterns
export function createSimpleCache<T>(maxSize: number = 100): SimpleCache<T> {
    return new SimpleCache<T>(maxSize);
}
