/**
 * Performance monitoring and metrics collection system
 * Provides comprehensive performance tracking for the AI Assistant plugin
 */

interface PerformanceMetric {
    name: string;
    value: number;
    type: 'time' | 'count' | 'size' | 'rate';
    timestamp: number;
    tags?: Record<string, string>;
}

interface PerformanceMetrics {
    cacheHitRate: number;
    averageResponseTime: number;
    memoryUsage: number;
    totalRequests: number;
    errorRate: number;
    apiCallsPerMinute: number;
    streamingLatency: number;
    objectPoolEfficiency: number;
}

class PerformanceMonitor {
    private metrics: PerformanceMetric[] = [];
    private aggregatedMetrics: Map<string, PerformanceMetric[]> = new Map();
    private debugMode: boolean = false;
    private readonly MAX_METRICS_HISTORY = 1000;
    private readonly CLEANUP_INTERVAL = 5 * 60 * 1000; // 5 minutes
    private cleanupTimer?: NodeJS.Timeout;

    constructor() {
        this.startCleanupTimer();
    }

    /**
     * Set debug mode for detailed logging
     */
    setDebugMode(enabled: boolean): void {
        this.debugMode = enabled;
    }

    /**
     * Record a performance metric
     */
    recordMetric(
        name: string, 
        value: number, 
        type: 'time' | 'count' | 'size' | 'rate',
        tags?: Record<string, string>
    ): void {
        const metric: PerformanceMetric = {
            name,
            value,
            type,
            timestamp: Date.now(),
            tags
        };

        this.metrics.push(metric);

        // Group by metric name for aggregation
        if (!this.aggregatedMetrics.has(name)) {
            this.aggregatedMetrics.set(name, []);
        }
        this.aggregatedMetrics.get(name)!.push(metric);

        // Cleanup old metrics if we exceed the limit
        if (this.metrics.length > this.MAX_METRICS_HISTORY) {
            this.cleanupOldMetrics();
        }

        if (this.debugMode) {
            console.log(`[PerformanceMonitor] ${name}: ${value} ${type}`, tags);
        }
    }

    /**
     * Get current performance metrics summary
     */
    getMetrics(): PerformanceMetrics {
        const now = Date.now();
        const oneMinuteAgo = now - 60 * 1000;
        const fiveMinutesAgo = now - 5 * 60 * 1000;

        // Calculate cache hit rate
        const cacheHits = this.getMetricSum('cache_hits', fiveMinutesAgo);
        const cacheMisses = this.getMetricSum('cache_misses', fiveMinutesAgo);
        const cacheHitRate = (cacheHits + cacheMisses) > 0 ? (cacheHits / (cacheHits + cacheMisses)) * 100 : 0;

        // Calculate average response time
        const responseTimes = this.getMetricValues('api_response_time', fiveMinutesAgo);
        const averageResponseTime = responseTimes.length > 0 
            ? responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length 
            : 0;

        // Calculate memory usage (estimate based on object pool metrics)
        const memoryMetrics = this.getMetricValues('memory_usage', fiveMinutesAgo);
        const memoryUsage = memoryMetrics.length > 0 
            ? memoryMetrics[memoryMetrics.length - 1] 
            : 0;

        // Calculate total requests
        const totalRequests = this.getMetricSum('api_requests', fiveMinutesAgo);

        // Calculate error rate
        const errors = this.getMetricSum('api_errors', fiveMinutesAgo);
        const errorRate = totalRequests > 0 ? (errors / totalRequests) * 100 : 0;

        // Calculate API calls per minute
        const recentRequests = this.getMetricSum('api_requests', oneMinuteAgo);
        const apiCallsPerMinute = recentRequests;

        // Calculate streaming latency
        const streamingLatencies = this.getMetricValues('streaming_latency', fiveMinutesAgo);
        const streamingLatency = streamingLatencies.length > 0
            ? streamingLatencies.reduce((sum, latency) => sum + latency, 0) / streamingLatencies.length
            : 0;

        // Calculate object pool efficiency
        const poolHits = this.getMetricSum('object_pool_hits', fiveMinutesAgo);
        const poolMisses = this.getMetricSum('object_pool_misses', fiveMinutesAgo);
        const objectPoolEfficiency = (poolHits + poolMisses) > 0 
            ? (poolHits / (poolHits + poolMisses)) * 100 
            : 0;

        return {
            cacheHitRate,
            averageResponseTime,
            memoryUsage,
            totalRequests,
            errorRate,
            apiCallsPerMinute,
            streamingLatency,
            objectPoolEfficiency
        };
    }

    /**
     * Get metric values for a specific metric name since a timestamp
     */
    private getMetricValues(name: string, since: number): number[] {
        const metrics = this.aggregatedMetrics.get(name) || [];
        return metrics
            .filter(metric => metric.timestamp >= since)
            .map(metric => metric.value);
    }

    /**
     * Get sum of metric values for a specific metric name since a timestamp
     */
    private getMetricSum(name: string, since: number): number {
        const values = this.getMetricValues(name, since);
        return values.reduce((sum, value) => sum + value, 0);
    }

    /**
     * Log current performance metrics to console
     */
    logMetrics(): void {
        const metrics = this.getMetrics();
        console.group('🚀 Performance Metrics');
        console.log(`Cache Hit Rate: ${metrics.cacheHitRate.toFixed(2)}%`);
        console.log(`Average Response Time: ${metrics.averageResponseTime.toFixed(2)}ms`);
        console.log(`Memory Usage: ${(metrics.memoryUsage / 1024 / 1024).toFixed(2)}MB`);
        console.log(`Total Requests (5min): ${metrics.totalRequests}`);
        console.log(`Error Rate: ${metrics.errorRate.toFixed(2)}%`);
        console.log(`API Calls/min: ${metrics.apiCallsPerMinute}`);
        console.log(`Streaming Latency: ${metrics.streamingLatency.toFixed(2)}ms`);
        console.log(`Object Pool Efficiency: ${metrics.objectPoolEfficiency.toFixed(2)}%`);
        console.groupEnd();
    }

    /**
     * Clear all metrics
     */
    clearMetrics(): void {
        this.metrics = [];
        this.aggregatedMetrics.clear();
        if (this.debugMode) {
            console.log('[PerformanceMonitor] All metrics cleared');
        }
    }

    /**
     * Start a performance timer
     */
    startTimer(name: string): () => void {
        const startTime = performance.now();
        return () => {
            const duration = performance.now() - startTime;
            this.recordMetric(name, duration, 'time');
        };
    }

    /**
     * Measure memory usage
     */
    measureMemory(): void {
        if (typeof performance !== 'undefined' && 'memory' in performance) {
            const memory = (performance as any).memory;
            this.recordMetric('memory_usage', memory.usedJSHeapSize, 'size');
            this.recordMetric('memory_total', memory.totalJSHeapSize, 'size');
            this.recordMetric('memory_limit', memory.jsHeapSizeLimit, 'size');
        }
    }

    /**
     * Record API request metrics
     */
    recordAPIRequest(success: boolean, responseTime: number, provider: string): void {
        this.recordMetric('api_requests', 1, 'count', { provider });
        this.recordMetric('api_response_time', responseTime, 'time', { provider });
        
        if (success) {
            this.recordMetric('api_success', 1, 'count', { provider });
        } else {
            this.recordMetric('api_errors', 1, 'count', { provider });
        }
    }

    /**
     * Record cache metrics
     */
    recordCacheMetrics(hits: number, misses: number): void {
        this.recordMetric('cache_hits', hits, 'count');
        this.recordMetric('cache_misses', misses, 'count');
    }

    /**
     * Record object pool metrics
     */
    recordObjectPoolMetrics(hits: number, misses: number): void {
        this.recordMetric('object_pool_hits', hits, 'count');
        this.recordMetric('object_pool_misses', misses, 'count');
    }

    /**
     * Record streaming metrics
     */
    recordStreamingMetrics(latency: number, chunkSize: number): void {
        this.recordMetric('streaming_latency', latency, 'time');
        this.recordMetric('streaming_chunk_size', chunkSize, 'size');
    }

    /**
     * Get performance report as string
     */
    getPerformanceReport(): string {
        const metrics = this.getMetrics();
        return `
Performance Report:
==================
Cache Hit Rate: ${metrics.cacheHitRate.toFixed(2)}%
Average Response Time: ${metrics.averageResponseTime.toFixed(2)}ms
Memory Usage: ${(metrics.memoryUsage / 1024 / 1024).toFixed(2)}MB
Total Requests (5min): ${metrics.totalRequests}
Error Rate: ${metrics.errorRate.toFixed(2)}%
API Calls/min: ${metrics.apiCallsPerMinute}
Streaming Latency: ${metrics.streamingLatency.toFixed(2)}ms
Object Pool Efficiency: ${metrics.objectPoolEfficiency.toFixed(2)}%
        `.trim();
    }

    /**
     * Start cleanup timer for old metrics
     */
    private startCleanupTimer(): void {
        this.cleanupTimer = setInterval(() => {
            this.cleanupOldMetrics();
        }, this.CLEANUP_INTERVAL);
    }

    /**
     * Clean up old metrics to prevent memory leaks
     */
    private cleanupOldMetrics(): void {
        const cutoffTime = Date.now() - (10 * 60 * 1000); // Keep 10 minutes of data
        
        // Clean main metrics array
        this.metrics = this.metrics.filter(metric => metric.timestamp >= cutoffTime);
        
        // Clean aggregated metrics
        for (const [name, metrics] of this.aggregatedMetrics.entries()) {
            const filteredMetrics = metrics.filter(metric => metric.timestamp >= cutoffTime);
            if (filteredMetrics.length === 0) {
                this.aggregatedMetrics.delete(name);
            } else {
                this.aggregatedMetrics.set(name, filteredMetrics);
            }
        }

        if (this.debugMode) {
            console.log(`[PerformanceMonitor] Cleaned up old metrics. Current count: ${this.metrics.length}`);
        }
    }

    /**
     * Dispose of the performance monitor
     */
    dispose(): void {
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
            this.cleanupTimer = undefined;
        }
        this.clearMetrics();
    }
}

// Export singleton instance
export const performanceMonitor = new PerformanceMonitor();