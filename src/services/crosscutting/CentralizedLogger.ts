import { 
    IEventBus, 
    ILogger, 
    LogLevel, 
    LogEntry, 
    LoggerConfig,
    LogFilter,
    LoggingStats
} from '../interfaces';

/**
 * Enhanced Centralized Logging System
 * 
 * Provides structured, contextual logging across all services with:
 * - Multiple log levels and filtering
 * - Service and context tagging
 * - Event bus integration for monitoring
 * - Performance metrics integration
 * - Automatic log rotation and cleanup
 */
export class CentralizedLogger implements ILogger {
    private logs: LogEntry[] = [];
    private maxLogs: number = 1000;
    private logLevel: LogLevel = 'info';
    private enableConsoleOutput: boolean = true;
    private enableEventPublishing: boolean = true;
    private logCategories: Set<string> = new Set();
    private muted: Set<string> = new Set(); // Muted categories
    
    constructor(
        private eventBus: IEventBus,
        config?: Partial<LoggerConfig>
    ) {
        if (config) {
            this.configure(config);
        }
        
        this.setupEventListeners();
        this.startLogRotation();
    }

    /**
     * Configures the logger with new settings.
     */
    configure(config: Partial<LoggerConfig>): void {
        if (config.maxLogs !== undefined) this.maxLogs = config.maxLogs;
        if (config.logLevel !== undefined) this.logLevel = config.logLevel;
        if (config.enableConsoleOutput !== undefined) this.enableConsoleOutput = config.enableConsoleOutput;
        if (config.enableEventPublishing !== undefined) this.enableEventPublishing = config.enableEventPublishing;
        if (config.mutedCategories) this.muted = new Set(config.mutedCategories);
    }

    /**
     * Logs a message with debug level.
     */
    debug(message: string, context?: Record<string, any>, category: string = 'general'): void {
        this.log('debug', message, context, category);
    }

    /**
     * Logs a message with info level.
     */
    info(message: string, context?: Record<string, any>, category: string = 'general'): void {
        this.log('info', message, context, category);
    }

    /**
     * Logs a message with warning level.
     */
    warn(message: string, context?: Record<string, any>, category: string = 'general'): void {
        this.log('warn', message, context, category);
    }

    /**
     * Logs a message with error level.
     */
    error(message: string, context?: Record<string, any>, category: string = 'general'): void {
        this.log('error', message, context, category);
    }

    /**
     * Main logging method.
     */
    log(level: LogLevel, message: string, context?: Record<string, any>, category: string = 'general'): void {
        // Check if logging is enabled for this level
        if (!this.shouldLog(level)) {
            return;
        }

        // Check if category is muted
        if (this.muted.has(category)) {
            return;
        }

        const logEntry: LogEntry = {
            timestamp: new Date().toISOString(),
            level,
            message,
            category,
            context: context || {},
            id: this.generateLogId()
        };

        // Add to internal log storage
        this.logs.push(logEntry);
        this.logCategories.add(category);

        // Trigger cleanup if needed
        if (this.logs.length > this.maxLogs) {
            this.cleanup();
        }

        // Output to console if enabled
        if (this.enableConsoleOutput) {
            this.outputToConsole(logEntry);
        }

        // Publish to event bus if enabled
        if (this.enableEventPublishing) {
            this.publishLogEvent(logEntry);
        }
    }

    /**
     * Creates a scoped logger for a specific service or component.
     */
    createScopedLogger(serviceName: string, category?: string): ScopedLogger {
        return new ScopedLogger(this, serviceName, category);
    }

    /**
     * Gets all logs, optionally filtered by criteria.
     */
    getLogs(filter?: LogFilter): LogEntry[] {
        let filteredLogs = [...this.logs];

        if (filter) {
            if (filter.level) {
                filteredLogs = filteredLogs.filter(log => log.level === filter.level);
            }
            if (filter.category) {
                filteredLogs = filteredLogs.filter(log => log.category === filter.category);
            }
            if (filter.since) {
                filteredLogs = filteredLogs.filter(log => new Date(log.timestamp) >= filter.since!);
            }
            if (filter.until) {
                filteredLogs = filteredLogs.filter(log => new Date(log.timestamp) <= filter.until!);
            }
            if (filter.messageContains) {
                filteredLogs = filteredLogs.filter(log => 
                    log.message.toLowerCase().includes(filter.messageContains!.toLowerCase())
                );
            }
        }

        return filteredLogs.sort((a, b) => 
            new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        );
    }

    /**
     * Gets logging statistics.
     */
    getStats(): LoggingStats {
        const now = Date.now();
        const oneHourAgo = now - (60 * 60 * 1000);
        const oneDayAgo = now - (24 * 60 * 60 * 1000);

        const recentLogs = this.logs.filter(log => 
            new Date(log.timestamp).getTime() > oneHourAgo
        );

        const dailyLogs = this.logs.filter(log => 
            new Date(log.timestamp).getTime() > oneDayAgo
        );

        const levelCounts = this.logs.reduce((counts, log) => {
            counts[log.level] = (counts[log.level] || 0) + 1;
            return counts;
        }, {} as Record<LogLevel, number>);

        const categoryCounts = this.logs.reduce((counts, log) => {
            counts[log.category] = (counts[log.category] || 0) + 1;
            return counts;
        }, {} as Record<string, number>);

        return {
            totalLogs: this.logs.length,
            recentLogs: recentLogs.length,
            dailyLogs: dailyLogs.length,
            levelCounts,
            categoryCounts,
            availableCategories: Array.from(this.logCategories),
            mutedCategories: Array.from(this.muted),
            oldestLog: this.logs.length > 0 ? this.logs[0].timestamp : null,
            newestLog: this.logs.length > 0 ? this.logs[this.logs.length - 1].timestamp : null
        };
    }

    /**
     * Exports logs in various formats.
     */
    exportLogs(format: 'json' | 'csv' | 'text' = 'json', filter?: LogFilter): string {
        const logs = this.getLogs(filter);

        switch (format) {
            case 'json':
                return JSON.stringify(logs, null, 2);
            
            case 'csv':
                const headers = ['timestamp', 'level', 'category', 'message', 'context'];
                const csvLines = [headers.join(',')];
                logs.forEach(log => {
                    const row = [
                        log.timestamp,
                        log.level,
                        log.category,
                        `"${log.message.replace(/"/g, '""')}"`,
                        `"${JSON.stringify(log.context).replace(/"/g, '""')}"`
                    ];
                    csvLines.push(row.join(','));
                });
                return csvLines.join('\n');
            
            case 'text':
                return logs.map(log => 
                    `[${log.timestamp}] ${log.level.toUpperCase()} [${log.category}] ${log.message}` +
                    (Object.keys(log.context).length > 0 ? ` | ${JSON.stringify(log.context)}` : '')
                ).join('\n');
            
            default:
                return this.exportLogs('json', filter);
        }
    }

    /**
     * Clears all logs.
     */
    clearLogs(): void {
        const clearedCount = this.logs.length;
        this.logs = [];
        this.logCategories.clear();
        
        this.publishLogEvent({
            timestamp: new Date().toISOString(),
            level: 'info',
            message: `Cleared ${clearedCount} logs`,
            category: 'system',
            context: { clearedCount },
            id: this.generateLogId()
        });
    }

    /**
     * Mutes a category.
     */
    muteCategory(category: string): void {
        this.muted.add(category);
        this.info(`Muted logging category: ${category}`, {}, 'system');
    }

    /**
     * Unmutes a category.
     */
    unmuteCategory(category: string): void {
        this.muted.delete(category);
        this.info(`Unmuted logging category: ${category}`, {}, 'system');
    }

    /**
     * Sets the minimum log level.
     */
    setLogLevel(level: LogLevel): void {
        const oldLevel = this.logLevel;
        this.logLevel = level;
        this.info(`Log level changed from ${oldLevel} to ${level}`, {}, 'system');
    }

    /**
     * Checks if a log level should be logged.
     */
    private shouldLog(level: LogLevel): boolean {
        const levels: LogLevel[] = ['debug', 'info', 'warn', 'error'];
        const currentLevelIndex = levels.indexOf(this.logLevel);
        const messageLevelIndex = levels.indexOf(level);
        
        return messageLevelIndex >= currentLevelIndex;
    }

    /**
     * Outputs a log entry to console.
     */
    private outputToConsole(entry: LogEntry): void {
        const prefix = `[AI Assistant ${entry.level.toUpperCase()} ${entry.timestamp}] [${entry.category}]`;
        const message = `${prefix} ${entry.message}`;
        
        switch (entry.level) {
            case 'debug':
                console.debug(message, entry.context);
                break;
            case 'info':
                console.info(message, entry.context);
                break;
            case 'warn':
                console.warn(message, entry.context);
                break;
            case 'error':
                console.error(message, entry.context);
                break;
        }
    }

    /**
     * Publishes a log event to the event bus.
     */
    private publishLogEvent(entry: LogEntry): void {
        this.eventBus.publish('logger.entry_created', {
            logEntry: entry,
            timestamp: Date.now()
        });

        // Also publish level-specific events
        this.eventBus.publish(`logger.${entry.level}`, {
            logEntry: entry,
            timestamp: Date.now()
        });
    }

    /**
     * Sets up event listeners for automatic logging.
     */
    private setupEventListeners(): void {
        // Log all critical events
        this.eventBus.subscribe('*.error', (data: any) => {
            this.error('Event error occurred', data, 'events');
        });

        // Log service lifecycle events
        this.eventBus.subscribe('service.*', (data: any) => {
            this.debug('Service event', data, 'services');
        });

        // Log agent events
        this.eventBus.subscribe('agent.*', (data: any) => {
            this.info('Agent event', data, 'agent');
        });

        // Log tool events
        this.eventBus.subscribe('tool.*', (data: any) => {
            this.debug('Tool event', data, 'tools');
        });

        // Log execution limit events
        this.eventBus.subscribe('execution_limit.*', (data: any) => {
            this.warn('Execution limit event', data, 'limits');
        });
    }

    /**
     * Starts automatic log rotation.
     */
    private startLogRotation(): void {
        // Clean up old logs every 5 minutes
        setInterval(() => {
            this.cleanup();
        }, 5 * 60 * 1000);
    }

    /**
     * Removes old logs to maintain memory limits.
     */
    private cleanup(): void {
        if (this.logs.length <= this.maxLogs) {
            return;
        }

        const logsToRemove = this.logs.length - this.maxLogs;
        const removedLogs = this.logs.splice(0, logsToRemove);
        
        this.info(`Cleaned up ${removedLogs.length} old logs`, {
            removedCount: removedLogs.length,
            remainingCount: this.logs.length
        }, 'system');
    }

    /**
     * Generates a unique log ID.
     */
    private generateLogId(): string {
        return `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
}

/**
 * Scoped Logger for specific services
 */
export class ScopedLogger {
    constructor(
        private parentLogger: CentralizedLogger,
        private serviceName: string,
        private defaultCategory: string = 'general'
    ) {}

    debug(message: string, context?: Record<string, any>, category?: string): void {
        this.parentLogger.debug(
            `[${this.serviceName}] ${message}`,
            { ...context, service: this.serviceName },
            category || this.defaultCategory
        );
    }

    info(message: string, context?: Record<string, any>, category?: string): void {
        this.parentLogger.info(
            `[${this.serviceName}] ${message}`,
            { ...context, service: this.serviceName },
            category || this.defaultCategory
        );
    }

    warn(message: string, context?: Record<string, any>, category?: string): void {
        this.parentLogger.warn(
            `[${this.serviceName}] ${message}`,
            { ...context, service: this.serviceName },
            category || this.defaultCategory
        );
    }

    error(message: string, context?: Record<string, any>, category?: string): void {
        this.parentLogger.error(
            `[${this.serviceName}] ${message}`,
            { ...context, service: this.serviceName },
            category || this.defaultCategory
        );
    }

    /**
     * Creates a performance timing context.
     */
    time(label: string): PerformanceTimer {
        return new PerformanceTimer(this, label);
    }
}

/**
 * Performance Timer for measuring operation durations
 */
export class PerformanceTimer {
    private startTime: number = Date.now();

    constructor(
        private logger: ScopedLogger,
        private label: string
    ) {
        this.logger.debug(`Started timing: ${this.label}`, { label });
    }

    /**
     * Ends the timer and logs the duration.
     */
    end(context?: Record<string, any>): number {
        const duration = Date.now() - this.startTime;
        this.logger.debug(
            `Completed timing: ${this.label} (${duration}ms)`,
            { ...context, label: this.label, duration },
            'performance'
        );
        return duration;
    }
}
