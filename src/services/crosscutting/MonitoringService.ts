import { 
    IEventBus, 
    IMonitoringService, 
    ServiceHealthStatus, 
    MonitoringMetrics, 
    ServiceHealthMap, 
    HealthChecker 
} from '../interfaces';

/**
 * Centralized Monitoring and Metrics Service
 * 
 * Provides comprehensive system observability with:
 * - Performance metrics collection and aggregation
 * - Service health monitoring and checks
 * - Real-time alerting through event bus
 * - Metrics export in multiple formats
 * - Automatic cleanup and rotation
 */
export class MonitoringService implements IMonitoringService {
    private counters: Map<string, number> = new Map();
    private timings: Map<string, TimingData> = new Map();
    private gauges: Map<string, number> = new Map();
    private healthChecks: Map<string, ServiceHealthData> = new Map();
    private healthCheckIntervals: Map<string, NodeJS.Timeout> = new Map();
    private metricHistory: MetricHistoryEntry[] = [];
    private maxHistoryEntries: number = 10000;
    
    constructor(
        private eventBus: IEventBus,
        private config: MonitoringConfig = {}
    ) {
        this.setupConfig();
        this.setupEventListeners();
        this.startPeriodicTasks();
    }

    /**
     * Records a custom metric value.
     */
    recordMetric(name: string, value: number, tags?: Record<string, string>): void {
        const metricKey = this.buildMetricKey(name, tags);
        
        // Store as gauge (latest value)
        this.gauges.set(metricKey, value);
        
        // Add to history
        this.addToHistory('metric', name, value, tags);
        
        // Publish event
        this.eventBus.publish('monitoring.metric_recorded', {
            name,
            value,
            tags,
            timestamp: Date.now()
        });
    }

    /**
     * Increments a counter metric.
     */
    incrementCounter(name: string, tags?: Record<string, string>): void {
        const metricKey = this.buildMetricKey(name, tags);
        const current = this.counters.get(metricKey) || 0;
        const newValue = current + 1;
        
        this.counters.set(metricKey, newValue);
        
        // Add to history
        this.addToHistory('counter', name, newValue, tags);
        
        // Publish event
        this.eventBus.publish('monitoring.counter_incremented', {
            name,
            value: newValue,
            tags,
            timestamp: Date.now()
        });
    }

    /**
     * Records a timing metric.
     */
    recordTiming(name: string, duration: number, tags?: Record<string, string>): void {
        const metricKey = this.buildMetricKey(name, tags);
        const existing = this.timings.get(metricKey);
        
        if (existing) {
            existing.count++;
            existing.total += duration;
            existing.avg = existing.total / existing.count;
            existing.min = Math.min(existing.min, duration);
            existing.max = Math.max(existing.max, duration);
            existing.recent.push({ value: duration, timestamp: Date.now() });
            
            // Keep only recent 100 values
            if (existing.recent.length > 100) {
                existing.recent = existing.recent.slice(-100);
            }
        } else {
            this.timings.set(metricKey, {
                count: 1,
                total: duration,
                avg: duration,
                min: duration,
                max: duration,
                recent: [{ value: duration, timestamp: Date.now() }]
            });
        }
        
        // Add to history
        this.addToHistory('timing', name, duration, tags);
        
        // Publish event
        this.eventBus.publish('monitoring.timing_recorded', {
            name,
            duration,
            tags,
            timestamp: Date.now()
        });
    }

    /**
     * Records service health status.
     */
    recordServiceHealth(serviceName: string, status: ServiceHealthStatus): void {
        const healthData: ServiceHealthData = {
            status,
            lastCheck: Date.now(),
            lastStatusChange: this.healthChecks.get(serviceName)?.status !== status ? Date.now() : 
                              this.healthChecks.get(serviceName)?.lastStatusChange || Date.now(),
            checkCount: (this.healthChecks.get(serviceName)?.checkCount || 0) + 1,
            consecutiveFailures: status === 'healthy' ? 0 : 
                                (this.healthChecks.get(serviceName)?.consecutiveFailures || 0) + 1
        };
        
        this.healthChecks.set(serviceName, healthData);
        
        // Add to history
        this.addToHistory('health', serviceName, 1, { status });
        
        // Publish event
        this.eventBus.publish('monitoring.health_updated', {
            serviceName,
            status,
            timestamp: Date.now(),
            healthData
        });
        
        // Alert on status changes or critical states
        if (status === 'unhealthy' || status === 'degraded') {
            this.eventBus.publish('monitoring.health_alert', {
                serviceName,
                status,
                timestamp: Date.now(),
                consecutiveFailures: healthData.consecutiveFailures
            });
        }
    }

    /**
     * Gets all current metrics.
     */
    getMetrics(): MonitoringMetrics {
        const timingsRecord: Record<string, { count: number; total: number; avg: number; min: number; max: number }> = {};
        this.timings.forEach((value, key) => {
            timingsRecord[key] = {
                count: value.count,
                total: value.total,
                avg: value.avg,
                min: value.min,
                max: value.max
            };
        });

        const gaugesRecord: Record<string, number> = {};
        this.gauges.forEach((value, key) => {
            gaugesRecord[key] = value;
        });

        const countersRecord: Record<string, number> = {};
        this.counters.forEach((value, key) => {
            countersRecord[key] = value;
        });

        return {
            counters: countersRecord,
            timings: timingsRecord,
            gauges: gaugesRecord,
            healthChecks: this.getServiceHealth()
        };
    }

    /**
     * Gets service health status map.
     */
    getServiceHealth(): ServiceHealthMap {
        const healthMap: ServiceHealthMap = {};
        
        this.healthChecks.forEach((data, serviceName) => {
            healthMap[serviceName] = {
                status: data.status,
                lastCheck: data.lastCheck,
                message: this.getHealthMessage(data),
                metadata: {
                    checkCount: data.checkCount,
                    consecutiveFailures: data.consecutiveFailures,
                    lastStatusChange: data.lastStatusChange,
                    uptime: Date.now() - data.lastStatusChange
                }
            };
        });
        
        return healthMap;
    }

    /**
     * Starts a health check for a service.
     */
    startHealthCheck(serviceName: string, checker: HealthChecker): void {
        // Stop existing health check if any
        this.stopHealthCheck(serviceName);
        
        // Perform initial check
        this.performHealthCheck(serviceName, checker);
        
        // Set up periodic checking
        const interval = setInterval(() => {
            this.performHealthCheck(serviceName, checker);
        }, this.config.healthCheckInterval || 30000); // Default 30 seconds
        
        this.healthCheckIntervals.set(serviceName, interval);
    }

    /**
     * Stops a health check for a service.
     */
    stopHealthCheck(serviceName: string): void {
        const interval = this.healthCheckIntervals.get(serviceName);
        if (interval) {
            clearInterval(interval);
            this.healthCheckIntervals.delete(serviceName);
        }
    }

    /**
     * Exports metrics in various formats.
     */
    exportMetrics(format: 'json' | 'prometheus' = 'json'): string {
        const metrics = this.getMetrics();
        
        switch (format) {
            case 'json':
                return JSON.stringify({
                    timestamp: new Date().toISOString(),
                    metrics,
                    summary: this.getMetricsSummary()
                }, null, 2);
            
            case 'prometheus':
                return this.exportPrometheusMetrics(metrics);
            
            default:
                return this.exportMetrics('json');
        }
    }

    /**
     * Clears all metrics.
     */
    clearMetrics(): void {
        const clearedCounts = {
            counters: this.counters.size,
            timings: this.timings.size,
            gauges: this.gauges.size,
            history: this.metricHistory.length
        };
        
        this.counters.clear();
        this.timings.clear();
        this.gauges.clear();
        this.metricHistory = [];
        
        this.eventBus.publish('monitoring.metrics_cleared', {
            clearedCounts,
            timestamp: Date.now()
        });
    }

    /**
     * Gets a performance timer for measuring operations.
     */
    createTimer(name: string, tags?: Record<string, string>): PerformanceTimer {
        return new PerformanceTimer(this, name, tags);
    }

    /**
     * Sets up configuration with defaults.
     */
    private setupConfig(): void {
        this.config = {
            healthCheckInterval: 30000,
            maxHistoryEntries: 10000,
            cleanupInterval: 300000, // 5 minutes
            ...this.config
        };
    }

    /**
     * Sets up event listeners for automatic monitoring.
     */
    private setupEventListeners(): void {
        // Monitor agent operations
        this.eventBus.subscribe('agent.*', () => {
            this.incrementCounter('agent.operations');
        });

        // Monitor tool executions
        this.eventBus.subscribe('tool.execution_completed', (data: any) => {
            this.incrementCounter('tool.executions');
            if (data.duration) {
                this.recordTiming('tool.execution_time', data.duration);
            }
        });

        // Monitor errors
        this.eventBus.subscribe('*.error', (data: any) => {
            this.incrementCounter('system.errors', { 
                source: data.source || 'unknown' 
            });
        });

        // Monitor performance
        this.eventBus.subscribe('performance.*', (data: any) => {
            if (data.duration) {
                this.recordTiming('performance.operations', data.duration, {
                    operation: data.operation || 'unknown'
                });
            }
        });
    }

    /**
     * Starts periodic maintenance tasks.
     */
    private startPeriodicTasks(): void {
        // Cleanup old history entries
        setInterval(() => {
            this.cleanupHistory();
        }, this.config.cleanupInterval || 300000);

        // Publish periodic metrics summary
        setInterval(() => {
            this.publishMetricsSummary();
        }, 60000); // Every minute
    }

    /**
     * Builds a metric key with tags.
     */
    private buildMetricKey(name: string, tags?: Record<string, string>): string {
        if (!tags || Object.keys(tags).length === 0) {
            return name;
        }
        
        const tagPairs = Object.entries(tags)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, value]) => `${key}=${value}`);
        
        return `${name}{${tagPairs.join(',')}}`;
    }

    /**
     * Adds an entry to metric history.
     */
    private addToHistory(type: string, name: string, value: number, tags?: Record<string, string>): void {
        this.metricHistory.push({
            timestamp: Date.now(),
            type,
            name,
            value,
            tags: tags || {}
        });
        
        // Cleanup if too many entries
        if (this.metricHistory.length > this.maxHistoryEntries) {
            this.metricHistory = this.metricHistory.slice(-this.maxHistoryEntries);
        }
    }

    /**
     * Performs a health check for a service.
     */
    private async performHealthCheck(serviceName: string, checker: HealthChecker): Promise<void> {
        try {
            const result = await checker.check();
            this.recordServiceHealth(serviceName, result.status);
        } catch (error) {
            this.recordServiceHealth(serviceName, 'unhealthy');
            this.eventBus.publish('monitoring.health_check_error', {
                serviceName,
                error: error instanceof Error ? error.message : String(error),
                timestamp: Date.now()
            });
        }
    }

    /**
     * Gets a health message for service data.
     */
    private getHealthMessage(data: ServiceHealthData): string {
        switch (data.status) {
            case 'healthy':
                return `Service is healthy (${data.checkCount} checks)`;
            case 'degraded':
                return `Service is degraded (${data.consecutiveFailures} failures)`;
            case 'unhealthy':
                return `Service is unhealthy (${data.consecutiveFailures} consecutive failures)`;
            case 'unknown':
                return 'Service status unknown';
            default:
                return 'Unknown status';
        }
    }

    /**
     * Exports metrics in Prometheus format.
     */
    private exportPrometheusMetrics(metrics: MonitoringMetrics): string {
        const lines: string[] = [];
        const timestamp = Date.now();
        
        // Export counters
        Object.entries(metrics.counters).forEach(([name, value]) => {
            lines.push(`# TYPE ${name} counter`);
            lines.push(`${name} ${value} ${timestamp}`);
        });
        
        // Export gauges
        Object.entries(metrics.gauges).forEach(([name, value]) => {
            lines.push(`# TYPE ${name} gauge`);
            lines.push(`${name} ${value} ${timestamp}`);
        });
        
        // Export timing summaries
        Object.entries(metrics.timings).forEach(([name, data]) => {
            lines.push(`# TYPE ${name}_duration summary`);
            lines.push(`${name}_duration_count ${data.count} ${timestamp}`);
            lines.push(`${name}_duration_sum ${data.total} ${timestamp}`);
            lines.push(`${name}_duration{quantile="0.5"} ${data.avg} ${timestamp}`);
            lines.push(`${name}_duration{quantile="1.0"} ${data.max} ${timestamp}`);
        });
        
        return lines.join('\n');
    }

    /**
     * Gets a summary of current metrics.
     */
    private getMetricsSummary(): MetricsSummary {
        return {
            totalCounters: this.counters.size,
            totalTimings: this.timings.size,
            totalGauges: this.gauges.size,
            totalServices: this.healthChecks.size,
            healthyServices: Array.from(this.healthChecks.values())
                .filter(d => d.status === 'healthy').length,
            unhealthyServices: Array.from(this.healthChecks.values())
                .filter(d => d.status === 'unhealthy').length,
            historyEntries: this.metricHistory.length
        };
    }

    /**
     * Cleans up old history entries.
     */
    private cleanupHistory(): void {
        const before = this.metricHistory.length;
        const cutoff = Date.now() - (24 * 60 * 60 * 1000); // 24 hours ago
        
        this.metricHistory = this.metricHistory.filter(entry => entry.timestamp > cutoff);
        
        const removed = before - this.metricHistory.length;
        if (removed > 0) {
            this.eventBus.publish('monitoring.history_cleaned', {
                removedEntries: removed,
                remainingEntries: this.metricHistory.length,
                timestamp: Date.now()
            });
        }
    }

    /**
     * Publishes a metrics summary to the event bus.
     */
    private publishMetricsSummary(): void {
        const summary = this.getMetricsSummary();
        this.eventBus.publish('monitoring.metrics_summary', {
            summary,
            timestamp: Date.now()
        });
    }
}

/**
 * Performance Timer for measuring operation durations
 */
export class PerformanceTimer {
    private startTime: number = Date.now();

    constructor(
        private monitoring: MonitoringService,
        private name: string,
        private tags?: Record<string, string>
    ) {}

    /**
     * Ends the timer and records the duration.
     */
    end(): number {
        const duration = Date.now() - this.startTime;
        this.monitoring.recordTiming(this.name, duration, this.tags);
        return duration;
    }
}

// Supporting interfaces and types
export interface MonitoringConfig {
    healthCheckInterval?: number;
    maxHistoryEntries?: number;
    cleanupInterval?: number;
}

export interface TimingData {
    count: number;
    total: number;
    avg: number;
    min: number;
    max: number;
    recent: Array<{ value: number; timestamp: number }>;
}

export interface ServiceHealthData {
    status: ServiceHealthStatus;
    lastCheck: number;
    lastStatusChange: number;
    checkCount: number;
    consecutiveFailures: number;
}

export interface MetricHistoryEntry {
    timestamp: number;
    type: string;
    name: string;
    value: number;
    tags: Record<string, string>;
}

export interface MetricsSummary {
    totalCounters: number;
    totalTimings: number;
    totalGauges: number;
    totalServices: number;
    healthyServices: number;
    unhealthyServices: number;
    historyEntries: number;
}
