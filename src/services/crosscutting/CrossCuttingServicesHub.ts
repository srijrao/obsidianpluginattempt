import { IEventBus } from '../interfaces';
import { CentralizedLogger, ScopedLogger } from './CentralizedLogger';
import { MonitoringService } from './MonitoringService';
import { ConfigurationService } from './ConfigurationService';
import { SecurityManager } from './SecurityManager';

/**
 * Cross-Cutting Services Hub
 * 
 * Provides centralized access to all cross-cutting concerns including:
 * - Logging and diagnostic services
 * - Monitoring and metrics collection
 * - Configuration management
 * - Security validation and auditing
 * 
 * This hub ensures consistent initialization, configuration, and teardown
 * of all cross-cutting services across the application.
 */
export class CrossCuttingServicesHub {
    private logger: CentralizedLogger;
    private monitoring: MonitoringService;
    private configuration: ConfigurationService;
    private security: SecurityManager;
    private isInitialized: boolean = false;

    constructor(
        private eventBus: IEventBus,
        initialConfig?: Record<string, any>
    ) {
        // Initialize configuration first as other services depend on it
        this.configuration = new ConfigurationService(initialConfig, this.getDefaultSchema());
        
        // Initialize logging with configuration
        this.logger = new CentralizedLogger(
            this.eventBus,
            this.configuration.get('logging', {})
        );
        
        // Initialize monitoring
        this.monitoring = new MonitoringService(
            this.eventBus,
            this.configuration.get('monitoring', {})
        );
        
        // Initialize security
        this.security = new SecurityManager(
            this.eventBus,
            this.configuration.get('security', {})
        );
        
        this.setupServiceIntegrations();
        this.isInitialized = true;
        
        // Log successful initialization
        this.logger.info('Cross-cutting services hub initialized successfully', {
            services: ['logger', 'monitoring', 'configuration', 'security'],
            timestamp: Date.now()
        }, 'system');
    }

    /**
     * Gets the centralized logger instance.
     */
    getLogger(): CentralizedLogger {
        this.ensureInitialized();
        return this.logger;
    }

    /**
     * Creates a scoped logger for a specific service.
     */
    createScopedLogger(serviceName: string, category?: string): ScopedLogger {
        this.ensureInitialized();
        return this.logger.createScopedLogger(serviceName, category);
    }

    /**
     * Gets the monitoring service instance.
     */
    getMonitoring(): MonitoringService {
        this.ensureInitialized();
        return this.monitoring;
    }

    /**
     * Gets the configuration service instance.
     */
    getConfiguration(): ConfigurationService {
        this.ensureInitialized();
        return this.configuration;
    }

    /**
     * Gets the security manager instance.
     */
    getSecurity(): SecurityManager {
        this.ensureInitialized();
        return this.security;
    }

    /**
     * Validates input using the security manager.
     */
    validateInput(input: string, operation: string, source: string = 'unknown') {
        this.ensureInitialized();
        return this.security.validateInput(input, {
            operation,
            source,
            metadata: { timestamp: Date.now() }
        });
    }

    /**
     * Sanitizes output using the security manager.
     */
    sanitizeOutput(output: string, operation: string, source: string = 'unknown') {
        this.ensureInitialized();
        return this.security.sanitizeOutput(output, {
            operation,
            source,
            metadata: { timestamp: Date.now() }
        });
    }

    /**
     * Checks permissions using the security manager.
     */
    checkPermissions(operation: string, user?: string, source: string = 'unknown') {
        this.ensureInitialized();
        return this.security.checkPermissions(operation, {
            operation,
            user,
            source,
            metadata: { timestamp: Date.now() }
        });
    }

    /**
     * Records a metric using the monitoring service.
     */
    recordMetric(name: string, value: number, tags?: Record<string, string>) {
        this.ensureInitialized();
        this.monitoring.recordMetric(name, value, tags);
    }

    /**
     * Increments a counter using the monitoring service.
     */
    incrementCounter(name: string, tags?: Record<string, string>) {
        this.ensureInitialized();
        this.monitoring.incrementCounter(name, tags);
    }

    /**
     * Records timing information using the monitoring service.
     */
    recordTiming(name: string, duration: number, tags?: Record<string, string>) {
        this.ensureInitialized();
        this.monitoring.recordTiming(name, duration, tags);
    }

    /**
     * Creates a performance timer for measuring operations.
     */
    createTimer(name: string, tags?: Record<string, string>) {
        this.ensureInitialized();
        return this.monitoring.createTimer(name, tags);
    }

    /**
     * Gets a configuration value.
     */
    getConfig<T>(key: string, defaultValue?: T): T {
        this.ensureInitialized();
        return this.configuration.get(key, defaultValue);
    }

    /**
     * Sets a configuration value.
     */
    async setConfig<T>(key: string, value: T): Promise<void> {
        this.ensureInitialized();
        return this.configuration.set(key, value);
    }

    /**
     * Subscribes to configuration changes.
     */
    subscribeToConfig(key: string, callback: (newValue: any, oldValue: any, key: string) => void) {
        this.ensureInitialized();
        return this.configuration.subscribe(key, callback);
    }

    /**
     * Gets comprehensive system status from all services.
     */
    getSystemStatus() {
        this.ensureInitialized();
        
        return {
            timestamp: Date.now(),
            isHealthy: true, // TODO: Calculate based on service health
            services: {
                logging: {
                    status: 'healthy',
                    stats: this.logger.getStats(),
                    logLevel: this.getConfig('logging.logLevel', 'info')
                },
                monitoring: {
                    status: 'healthy',
                    metrics: this.monitoring.getMetrics(),
                    healthChecks: this.monitoring.getServiceHealth()
                },
                configuration: {
                    status: 'healthy',
                    schema: this.configuration.getSchema(),
                    configCount: Object.keys(this.configuration.export()).length
                },
                security: {
                    status: 'healthy',
                    metrics: this.security.getSecurityMetrics(),
                    policyActive: true
                }
            }
        };
    }

    /**
     * Exports all service data for backup or analysis.
     */
    exportAllData() {
        this.ensureInitialized();
        
        return {
            timestamp: new Date().toISOString(),
            configuration: this.configuration.export(),
            logs: this.logger.exportLogs('json'),
            metrics: this.monitoring.exportMetrics('json'),
            security: this.security.getSecurityMetrics(),
            systemStatus: this.getSystemStatus()
        };
    }

    /**
     * Clears all data from all services (for testing or reset).
     */
    clearAllData() {
        this.ensureInitialized();
        
        this.logger.clearLogs();
        this.monitoring.clearMetrics();
        
        this.logger.info('All cross-cutting service data cleared', {
            timestamp: Date.now(),
            clearedServices: ['logging', 'monitoring']
        }, 'system');
    }

    /**
     * Performs health checks on all services.
     */
    async performHealthChecks() {
        this.ensureInitialized();
        
        const healthResults = {
            timestamp: Date.now(),
            overall: 'healthy' as 'healthy' | 'degraded' | 'unhealthy',
            services: {} as Record<string, any>
        };

        try {
            // Check logging service
            const logStats = this.logger.getStats();
            healthResults.services.logging = {
                status: logStats.totalLogs >= 0 ? 'healthy' : 'unhealthy',
                totalLogs: logStats.totalLogs,
                recentErrors: logStats.levelCounts.error || 0
            };

            // Check monitoring service
            const monitoringMetrics = this.monitoring.getMetrics();
            healthResults.services.monitoring = {
                status: 'healthy', // Monitoring is healthy if it's responding
                totalCounters: Object.keys(monitoringMetrics.counters).length,
                totalTimings: Object.keys(monitoringMetrics.timings).length
            };

            // Check configuration service
            try {
                const configData = this.configuration.export();
                healthResults.services.configuration = {
                    status: 'healthy',
                    configEntries: Object.keys(JSON.parse(configData)).length
                };
            } catch (error) {
                healthResults.services.configuration = {
                    status: 'unhealthy',
                    error: error instanceof Error ? error.message : String(error)
                };
                healthResults.overall = 'degraded';
            }

            // Check security service
            const securityMetrics = this.security.getSecurityMetrics();
            const recentThreats = securityMetrics.recentEvents.filter(e => 
                e.severity === 'critical' || e.severity === 'error'
            ).length;
            
            healthResults.services.security = {
                status: recentThreats > 10 ? 'degraded' : 'healthy',
                recentThreats,
                validationCount: Object.values(securityMetrics.validationResults).reduce((a, b) => a + b, 0)
            };

            if (recentThreats > 10) {
                healthResults.overall = 'degraded';
            }

        } catch (error) {
            healthResults.overall = 'unhealthy';
            this.logger.error('Health check failed', {
                error: error instanceof Error ? error.message : String(error)
            }, 'system');
        }

        return healthResults;
    }

    /**
     * Shuts down all services gracefully.
     */
    async shutdown() {
        if (!this.isInitialized) {
            return;
        }

        this.logger.info('Shutting down cross-cutting services hub', {
            timestamp: Date.now()
        }, 'system');

        // Stop all health checks
        const healthMap = this.monitoring.getServiceHealth();
        Object.keys(healthMap).forEach(serviceName => {
            this.monitoring.stopHealthCheck(serviceName);
        });

        // Export final data for persistence
        const finalExport = this.exportAllData();
        
        // Mark as not initialized
        this.isInitialized = false;

        this.logger.info('Cross-cutting services hub shutdown complete', {
            timestamp: Date.now(),
            finalDataSize: JSON.stringify(finalExport).length
        }, 'system');
    }

    /**
     * Sets up integrations between services.
     */
    private setupServiceIntegrations() {
        // Subscribe to configuration changes that affect logging
        this.configuration.subscribe('logging', (newConfig) => {
            this.logger.configure(newConfig);
            this.logger.info('Logger configuration updated', { newConfig }, 'system');
        });

        // Subscribe to configuration changes that affect security
        this.configuration.subscribe('security', (newConfig) => {
            this.security.updateSecurityPolicy(newConfig);
            this.logger.info('Security policy updated', { newConfig }, 'system');
        });

        // Set up cross-service monitoring
        this.monitoring.startHealthCheck('logging', {
            check: async () => {
                const stats = this.logger.getStats();
                const errorRate = (stats.levelCounts.error || 0) / Math.max(stats.totalLogs, 1);
                
                return {
                    status: errorRate > 0.1 ? 'degraded' : 'healthy',
                    message: `Error rate: ${(errorRate * 100).toFixed(1)}%`,
                    metadata: { errorRate, totalLogs: stats.totalLogs }
                };
            }
        });

        this.monitoring.startHealthCheck('security', {
            check: async () => {
                const metrics = this.security.getSecurityMetrics();
                const recentThreats = metrics.recentEvents.filter(e => 
                    e.severity === 'critical' && Date.now() - e.timestamp < 60000 // Last minute
                ).length;
                
                return {
                    status: recentThreats > 5 ? 'unhealthy' : recentThreats > 0 ? 'degraded' : 'healthy',
                    message: `${recentThreats} recent critical threats`,
                    metadata: { recentThreats }
                };
            }
        });
    }

    /**
     * Gets the default configuration schema.
     */
    private getDefaultSchema() {
        return {
            'logging.logLevel': {
                type: 'string' as const,
                default: 'info',
                description: 'Minimum log level to output'
            },
            'logging.maxLogs': {
                type: 'number' as const,
                default: 1000,
                description: 'Maximum number of logs to retain in memory'
            },
            'monitoring.healthCheckInterval': {
                type: 'number' as const,
                default: 30000,
                description: 'Interval between health checks in milliseconds'
            },
            'security.maxInputLength': {
                type: 'number' as const,
                default: 10000,
                description: 'Maximum allowed input length for security validation'
            },
            'security.auditAll': {
                type: 'boolean' as const,
                default: false,
                description: 'Whether to audit all security operations'
            }
        };
    }

    /**
     * Ensures the hub is initialized before operations.
     */
    private ensureInitialized() {
        if (!this.isInitialized) {
            throw new Error('CrossCuttingServicesHub must be initialized before use');
        }
    }
}
