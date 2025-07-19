/**
 * Simple metrics tracking system
 * Replaces the complex PerformanceMonitor with essential metrics only
 */

interface SimpleMetricsData {
    apiCalls: number;
    errors: number;
    cacheHits: number;
    cacheMisses: number;
}

interface SimpleMetricsStats {
    totalAPICalls: number;
    errorRate: number;
    cacheHitRate: number;
}

class SimpleMetrics {
    private stats: SimpleMetricsData = {
        apiCalls: 0,
        errors: 0,
        cacheHits: 0,
        cacheMisses: 0
    };

    /**
     * Record an API call result
     */
    recordAPICall(success: boolean): void {
        this.stats.apiCalls++;
        if (!success) {
            this.stats.errors++;
        }
    }

    /**
     * Record a cache hit
     */
    recordCacheHit(): void {
        this.stats.cacheHits++;
    }

    /**
     * Record a cache miss
     */
    recordCacheMiss(): void {
        this.stats.cacheMisses++;
    }

    /**
     * Get current statistics
     */
    getStats(): SimpleMetricsStats {
        const { apiCalls, errors, cacheHits, cacheMisses } = this.stats;
        return {
            totalAPICalls: apiCalls,
            errorRate: apiCalls > 0 ? errors / apiCalls : 0,
            cacheHitRate: (cacheHits + cacheMisses) > 0 ? cacheHits / (cacheHits + cacheMisses) : 0
        };
    }

    /**
     * Reset all statistics
     */
    reset(): void {
        this.stats = {
            apiCalls: 0,
            errors: 0,
            cacheHits: 0,
            cacheMisses: 0
        };
    }

    /**
     * Log current statistics to console
     */
    logStats(): void {
        const stats = this.getStats();
        console.log('Simple Metrics:', {
            'Total API Calls': stats.totalAPICalls,
            'Error Rate': `${(stats.errorRate * 100).toFixed(2)}%`,
            'Cache Hit Rate': `${(stats.cacheHitRate * 100).toFixed(2)}%`
        });
    }
}

export const simpleMetrics = new SimpleMetrics();
