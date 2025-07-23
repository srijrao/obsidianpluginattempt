/**
 * @file MetricsCollector.ts
 * 
 * Metrics Collector service for gathering performance data and analytics.
 * Extracted from AIDispatcher to follow single responsibility principle.
 */

import { IMetricsCollector, RequestMetrics, IEventBus } from '../interfaces';

export interface MetricEntry {
    timestamp: number;
    value: number;
    metadata?: Record<string, any>;
}

export interface ProviderMetrics {
    requests: number;
    successes: number;
    failures: number;
    totalDuration: number;
    totalTokens: number;
    averageResponseTime: number;
    lastRequestTime: number;
    errorRate: number;
}

export interface DetailedMetrics extends RequestMetrics {
    providerMetrics: Record<string, ProviderMetrics>;
    cacheMetrics: {
        hits: number;
        misses: number;
        hitRate: number;
    };
    performanceMetrics: {
        averageResponseTime: number;
        p95ResponseTime: number;
        p99ResponseTime: number;
        throughput: number;
    };
    timeSeriesData: {
        requests: MetricEntry[];
        responseTime: MetricEntry[];
        errors: MetricEntry[];
    };
}

/**
 * Collects and analyzes performance metrics for AI operations
 */
export class MetricsCollector implements IMetricsCollector {
    private metrics: RequestMetrics = {
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        averageResponseTime: 0,
        requestsByProvider: {},
        errorsByProvider: {}
    };

    private providerMetrics = new Map<string, ProviderMetrics>();
    private responseTimes: number[] = [];
    private cacheHits = 0;
    private cacheMisses = 0;
    private timeSeriesData = {
        requests: [] as MetricEntry[],
        responseTime: [] as MetricEntry[],
        errors: [] as MetricEntry[]
    };

    private readonly MAX_TIME_SERIES_ENTRIES = 1000;
    private readonly MAX_RESPONSE_TIME_SAMPLES = 1000;

    constructor(private eventBus: IEventBus) {
        this.startPeriodicReporting();
    }

    /**
     * Records a request with its outcome and performance data
     */
    recordRequest(provider: string, duration: number, success: boolean): void {
        const now = Date.now();
        
        // Update overall metrics
        this.metrics.totalRequests++;
        if (success) {
            this.metrics.successfulRequests++;
        } else {
            this.metrics.failedRequests++;
            this.metrics.errorsByProvider[provider] = (this.metrics.errorsByProvider[provider] || 0) + 1;
        }

        this.metrics.requestsByProvider[provider] = (this.metrics.requestsByProvider[provider] || 0) + 1;

        // Update response time metrics
        this.responseTimes.push(duration);
        if (this.responseTimes.length > this.MAX_RESPONSE_TIME_SAMPLES) {
            this.responseTimes.shift();
        }
        this.updateAverageResponseTime();

        // Update provider-specific metrics
        this.updateProviderMetrics(provider, duration, success);

        // Record time series data
        this.recordTimeSeriesData(now, duration, success);

        // Emit metrics event
        this.eventBus.publish('metrics.request_recorded', {
            provider,
            duration,
            success,
            totalRequests: this.metrics.totalRequests,
            timestamp: now
        });
    }

    /**
     * Records a cache hit
     */
    recordCacheHit(key: string): void {
        this.cacheHits++;
        
        this.eventBus.publish('metrics.cache_hit', {
            key,
            totalHits: this.cacheHits,
            hitRate: this.getCacheHitRate(),
            timestamp: Date.now()
        });
    }

    /**
     * Records a cache miss
     */
    recordCacheMiss(key: string): void {
        this.cacheMisses++;
        
        this.eventBus.publish('metrics.cache_miss', {
            key,
            totalMisses: this.cacheMisses,
            hitRate: this.getCacheHitRate(),
            timestamp: Date.now()
        });
    }

    /**
     * Gets current metrics snapshot
     */
    getMetrics(): RequestMetrics {
        return { ...this.metrics };
    }

    /**
     * Gets detailed metrics with additional analytics
     */
    getDetailedMetrics(): DetailedMetrics {
        const providerMetrics: Record<string, ProviderMetrics> = {};
        for (const [provider, metrics] of this.providerMetrics.entries()) {
            providerMetrics[provider] = { ...metrics };
        }

        return {
            ...this.metrics,
            providerMetrics,
            cacheMetrics: {
                hits: this.cacheHits,
                misses: this.cacheMisses,
                hitRate: this.getCacheHitRate()
            },
            performanceMetrics: {
                averageResponseTime: this.metrics.averageResponseTime,
                p95ResponseTime: this.calculatePercentile(95),
                p99ResponseTime: this.calculatePercentile(99),
                throughput: this.calculateThroughput()
            },
            timeSeriesData: {
                requests: [...this.timeSeriesData.requests],
                responseTime: [...this.timeSeriesData.responseTime],
                errors: [...this.timeSeriesData.errors]
            }
        };
    }

    /**
     * Resets all metrics
     */
    resetMetrics(): void {
        this.metrics = {
            totalRequests: 0,
            successfulRequests: 0,
            failedRequests: 0,
            averageResponseTime: 0,
            requestsByProvider: {},
            errorsByProvider: {}
        };

        this.providerMetrics.clear();
        this.responseTimes = [];
        this.cacheHits = 0;
        this.cacheMisses = 0;
        this.timeSeriesData = {
            requests: [],
            responseTime: [],
            errors: []
        };

        this.eventBus.publish('metrics.reset', {
            timestamp: Date.now()
        });
    }

    /**
     * Exports metrics in various formats
     */
    exportMetrics(format: 'json' | 'csv' | 'prometheus' = 'json'): string {
        const detailed = this.getDetailedMetrics();
        
        switch (format) {
            case 'json':
                return JSON.stringify(detailed, null, 2);
            
            case 'csv':
                return this.exportAsCSV(detailed);
            
            case 'prometheus':
                return this.exportAsPrometheus(detailed);
            
            default:
                return JSON.stringify(detailed, null, 2);
        }
    }

    /**
     * Gets metrics for a specific time range
     */
    getMetricsForTimeRange(startTime: number, endTime: number): {
        requests: MetricEntry[];
        responseTime: MetricEntry[];
        errors: MetricEntry[];
        summary: {
            totalRequests: number;
            averageResponseTime: number;
            errorRate: number;
        };
    } {
        const filterByTime = (entries: MetricEntry[]) => 
            entries.filter(entry => entry.timestamp >= startTime && entry.timestamp <= endTime);

        const requests = filterByTime(this.timeSeriesData.requests);
        const responseTime = filterByTime(this.timeSeriesData.responseTime);
        const errors = filterByTime(this.timeSeriesData.errors);

        const totalRequests = requests.length;
        const averageResponseTime = responseTime.length > 0 
            ? responseTime.reduce((sum, entry) => sum + entry.value, 0) / responseTime.length 
            : 0;
        const errorRate = totalRequests > 0 ? errors.length / totalRequests : 0;

        return {
            requests,
            responseTime,
            errors,
            summary: {
                totalRequests,
                averageResponseTime,
                errorRate
            }
        };
    }

    /**
     * Updates provider-specific metrics
     */
    private updateProviderMetrics(provider: string, duration: number, success: boolean): void {
        if (!this.providerMetrics.has(provider)) {
            this.providerMetrics.set(provider, {
                requests: 0,
                successes: 0,
                failures: 0,
                totalDuration: 0,
                totalTokens: 0,
                averageResponseTime: 0,
                lastRequestTime: 0,
                errorRate: 0
            });
        }

        const metrics = this.providerMetrics.get(provider)!;
        metrics.requests++;
        metrics.totalDuration += duration;
        metrics.lastRequestTime = Date.now();

        if (success) {
            metrics.successes++;
        } else {
            metrics.failures++;
        }

        metrics.averageResponseTime = metrics.totalDuration / metrics.requests;
        metrics.errorRate = metrics.failures / metrics.requests;
    }

    /**
     * Updates the overall average response time
     */
    private updateAverageResponseTime(): void {
        if (this.responseTimes.length === 0) {
            this.metrics.averageResponseTime = 0;
            return;
        }

        const sum = this.responseTimes.reduce((acc, time) => acc + time, 0);
        this.metrics.averageResponseTime = sum / this.responseTimes.length;
    }

    /**
     * Calculates response time percentiles
     */
    private calculatePercentile(percentile: number): number {
        if (this.responseTimes.length === 0) return 0;

        const sorted = [...this.responseTimes].sort((a, b) => a - b);
        const index = Math.ceil((percentile / 100) * sorted.length) - 1;
        return sorted[Math.max(0, index)];
    }

    /**
     * Calculates current throughput (requests per second)
     */
    private calculateThroughput(): number {
        const now = Date.now();
        const oneMinuteAgo = now - 60000;
        
        const recentRequests = this.timeSeriesData.requests.filter(
            entry => entry.timestamp > oneMinuteAgo
        );
        
        return recentRequests.length / 60; // requests per second
    }

    /**
     * Gets cache hit rate
     */
    private getCacheHitRate(): number {
        const total = this.cacheHits + this.cacheMisses;
        return total > 0 ? this.cacheHits / total : 0;
    }

    /**
     * Records time series data
     */
    private recordTimeSeriesData(timestamp: number, duration: number, success: boolean): void {
        // Record request
        this.timeSeriesData.requests.push({ timestamp, value: 1 });
        
        // Record response time
        this.timeSeriesData.responseTime.push({ timestamp, value: duration });
        
        // Record error if applicable
        if (!success) {
            this.timeSeriesData.errors.push({ timestamp, value: 1 });
        }

        // Trim old data
        this.trimTimeSeriesData();
    }

    /**
     * Trims old time series data to maintain memory limits
     */
    private trimTimeSeriesData(): void {
        Object.values(this.timeSeriesData).forEach(series => {
            if (series.length > this.MAX_TIME_SERIES_ENTRIES) {
                series.splice(0, series.length - this.MAX_TIME_SERIES_ENTRIES);
            }
        });
    }

    /**
     * Exports metrics as CSV
     */
    private exportAsCSV(metrics: DetailedMetrics): string {
        const lines = [
            'timestamp,provider,requests,successes,failures,avg_response_time,error_rate',
            ...Object.entries(metrics.providerMetrics).map(([provider, data]) =>
                `${Date.now()},${provider},${data.requests},${data.successes},${data.failures},${data.averageResponseTime},${data.errorRate}`
            )
        ];
        return lines.join('\n');
    }

    /**
     * Exports metrics in Prometheus format
     */
    private exportAsPrometheus(metrics: DetailedMetrics): string {
        const lines = [
            `# HELP ai_requests_total Total number of AI requests`,
            `# TYPE ai_requests_total counter`,
            `ai_requests_total ${metrics.totalRequests}`,
            ``,
            `# HELP ai_request_duration_seconds Average request duration`,
            `# TYPE ai_request_duration_seconds gauge`,
            `ai_request_duration_seconds ${metrics.averageResponseTime / 1000}`,
            ``,
            `# HELP ai_cache_hit_rate Cache hit rate`,
            `# TYPE ai_cache_hit_rate gauge`,
            `ai_cache_hit_rate ${metrics.cacheMetrics.hitRate}`,
        ];

        // Add per-provider metrics
        for (const [provider, data] of Object.entries(metrics.providerMetrics)) {
            lines.push(
                `ai_provider_requests_total{provider="${provider}"} ${data.requests}`,
                `ai_provider_error_rate{provider="${provider}"} ${data.errorRate}`
            );
        }

        return lines.join('\n');
    }

    /**
     * Starts periodic reporting of metrics
     */
    private startPeriodicReporting(): void {
        setInterval(() => {
            const summary = this.getMetrics();
            this.eventBus.publish('metrics.periodic_report', {
                summary,
                timestamp: Date.now()
            });
        }, 60000); // Report every minute
    }

    /**
     * Cleanup method for disposing the service
     */
    dispose(): void {
        this.resetMetrics();
    }
}