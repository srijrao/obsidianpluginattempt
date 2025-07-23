/**
 * Cross-Cutting Services Module
 * 
 * Exports all cross-cutting concern services for the AI Assistant plugin.
 * These services provide system-wide functionality including:
 * - Centralized logging and diagnostics
 * - Performance monitoring and metrics
 * - Configuration management
 * - Security validation and auditing
 */

export { CentralizedLogger, ScopedLogger, PerformanceTimer } from './CentralizedLogger';
export { MonitoringService } from './MonitoringService';
export { ConfigurationService } from './ConfigurationService';
export { SecurityManager } from './SecurityManager';
export { CrossCuttingServicesHub } from './CrossCuttingServicesHub';

// Re-export commonly used types for convenience
export type {
    LogLevel,
    LogEntry,
    LoggerConfig,
    LogFilter,
    LoggingStats,
    MonitoringMetrics,
    ServiceHealthStatus,
    SecurityValidationResult,
    SecurityEvent,
    SecurityMetrics,
    SecurityPolicy
} from '../interfaces';
