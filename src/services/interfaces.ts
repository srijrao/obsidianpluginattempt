/**
 * @file interfaces.ts
 *
 * Service layer abstractions for the AI Assistant plugin.
 * Defines interfaces for all major services to enable dependency injection and testing.
 */

import { Message, CompletionOptions, UnifiedModel, ToolCommand, ToolResult } from '../types';
import { ChatMessage } from '../components/chat/ChatHistoryManager';

// ============================================================================
// Event Bus Interface (re-exported for consistency)
// ============================================================================

export type EventHandler<T = any> = (data: T) => void | Promise<void>;
export type UnsubscribeFunction = () => void;

export interface IEventBus {
    publish<T>(event: string, data: T): Promise<void>;
    subscribe<T>(event: string, handler: EventHandler<T>): UnsubscribeFunction;
    subscribeOnce<T>(event: string, handler: EventHandler<T>): UnsubscribeFunction;
    unsubscribe(event: string, handler?: EventHandler): void;
    clear(): void;
    getSubscriptionCount(event?: string): number;
}

// ============================================================================
// Core Service Interfaces
// ============================================================================

/**
 * AI Service interface for handling AI completions and model management
 */
export interface IAIService {
    getCompletion(request: CompletionRequest): Promise<CompletionResponse>;
    testConnection(provider: string): Promise<ConnectionResult>;
    getAvailableModels(provider: string): Promise<string[]>;
    getAllUnifiedModels(): Promise<UnifiedModel[]>;
    setSelectedModel(modelId: string): Promise<void>;
    getCurrentModel(): string | undefined;
    isProviderConfigured(provider: string): boolean;
    getConfiguredProviders(): string[];
}

/**
 * Chat Service interface for managing chat interactions
 */
export interface IChatService {
    sendMessage(content: string): Promise<void>;
    regenerateMessage(messageId: string): Promise<void>;
    clearHistory(): Promise<void>;
    getHistory(): Promise<ChatMessage[]>;
    addMessage(message: ChatMessage): Promise<void>;
    updateMessage(timestamp: string, role: string, oldContent: string, newContent: string, metadata?: any): Promise<void>;
}

/**
 * Agent Service interface for tool execution and agent mode
 */
export interface IAgentService {
    processResponse(response: string): Promise<AgentResult>;
    executeTools(commands: ToolCommand[]): Promise<ToolResult[]>;
    isLimitReached(): boolean;
    resetExecutionCount(): void;
    getExecutionStats(): ExecutionStats;
    isAgentModeEnabled(): boolean;
    setAgentModeEnabled(enabled: boolean): Promise<void>;
}

// ============================================================================
// Request Management Interfaces
// ============================================================================

/**
 * Request Manager interface for handling AI request queuing and processing
 */
export interface IRequestManager {
    queueRequest(request: AIRequest): Promise<void>;
    processQueue(): Promise<void>;
    getQueueStatus(): QueueStatus;
    abortRequest(requestId: string): void;
    abortAllRequests(): void;
}

/**
 * Cache Manager interface for response caching
 */
export interface ICacheManager {
    get(key: string): Promise<string | null>;
    set(key: string, value: string, ttl?: number): Promise<void>;
    clear(): Promise<void>;
    delete(key: string): Promise<void>;
    getStats(): CacheStats;
}

/**
 * Rate Limiter interface for managing API rate limits
 */
export interface IRateLimiter {
    checkLimit(provider: string): boolean;
    recordRequest(provider: string): void;
    getRemainingRequests(provider: string): number;
    resetLimits(provider?: string): void;
    getProviderLimits(): Record<string, RateLimitInfo>;
}

/**
 * Circuit Breaker interface for handling provider failures
 */
export interface ICircuitBreaker {
    isOpen(provider: string): boolean;
    recordSuccess(provider: string): void;
    recordFailure(provider: string): void;
    getState(provider: string): CircuitBreakerState;
    reset(provider: string): void;
}

/**
 * Metrics Collector interface for gathering performance data
 */
export interface IMetricsCollector {
    recordRequest(provider: string, duration: number, success: boolean): void;
    recordCacheHit(key: string): void;
    recordCacheMiss(key: string): void;
    getMetrics(): RequestMetrics;
    resetMetrics(): void;
    exportMetrics(): string;
}

// ============================================================================
// UI Management Interfaces
// ============================================================================

/**
 * Chat UI Manager interface for managing chat interface
 */
export interface IChatUIManager {
    createChatInterface(): HTMLElement;
    updateMessageDisplay(message: ChatMessage): void;
    scrollToBottom(): void;
    showTypingIndicator(): void;
    hideTypingIndicator(): void;
    updateModelDisplay(modelName: string): void;
    updateReferenceNoteIndicator(isEnabled: boolean, fileName?: string): void;
}

/**
 * Event Coordinator interface for handling UI events
 */
export interface IChatEventCoordinator {
    setupEventHandlers(): void;
    handleSendMessage(content: string): Promise<void>;
    handleStopStream(): void;
    handleClearChat(): void;
    handleRegenerateMessage(messageId: string): Promise<void>;
    cleanup(): void;
}

/**
 * Message Manager interface for message operations
 */
export interface IMessageManager {
    addMessage(message: ChatMessage): Promise<void>;
    regenerateMessage(messageId: string): Promise<void>;
    getMessageHistory(): ChatMessage[];
    updateMessage(messageId: string, content: string): Promise<void>;
    deleteMessage(messageId: string): Promise<void>;
}

/**
 * Stream Coordinator interface for managing streaming responses
 */
export interface IStreamCoordinator {
    startStream(messages: Message[]): Promise<string>;
    stopStream(): void;
    isStreaming(): boolean;
    getActiveStreams(): string[];
    abortStream(streamId: string): void;
}

// ============================================================================
// Tool Execution Interfaces
// ============================================================================

/**
 * Command Processor interface for parsing and validating tool commands
 */
export interface ICommandProcessor {
    parseCommands(response: string): ToolCommand[];
    validateCommands(commands: ToolCommand[]): ValidationResult;
    filterExecutedCommands(commands: ToolCommand[], history: any[]): ToolCommand[];
}

/**
 * Tool Execution Engine interface for running tools
 */
export interface IToolExecutionEngine {
    executeCommand(command: ToolCommand): Promise<ToolResult>;
    canExecute(command: ToolCommand): boolean;
    getExecutionStats(): ExecutionStats;
    registerTool(tool: any): void;
    unregisterTool(toolName: string): void;
}

/**
 * Execution Limit Manager interface for managing tool execution limits
 */
export interface IExecutionLimitManager {
    isLimitReached(): boolean;
    canExecute(count: number): boolean;
    addExecutions(count: number): void;
    resetLimit(): void;
    getLimit(): number;
    setLimit(limit: number): void;
    getCurrentCount(): number;
    getRemaining(): number;
    getUsagePercentage(): number;
    getStatus(): {
        count: number;
        limit: number;
        remaining: number;
        percentage: number;
        isLimitReached: boolean;
        lastResetTime: number;
        autoReset: boolean;
        resetIntervalMs: number;
    };
    setAutoReset(enabled: boolean, intervalMs?: number): void;
    destroy(): void;
}

/**
 * Tool Display Manager interface for managing tool result displays
 */
export interface IToolDisplayManager {
    createDisplay(command: ToolCommand, result: ToolResult): ToolRichDisplay;
    updateDisplay(displayId: string, result: ToolResult): void;
    getDisplays(): Map<string, ToolRichDisplay>;
    clearDisplays(): void;
    getDisplay(displayId: string): ToolRichDisplay | undefined;
    removeDisplay(displayId: string): boolean;
    getDisplaysByAction(action: string): ToolRichDisplay[];
    getDisplaysByStatus(success: boolean): ToolRichDisplay[];
    getDisplayStats(): {
        total: number;
        successful: number;
        failed: number;
        byAction: Record<string, number>;
    };
    exportDisplaysToMarkdown(): string;
    destroy(): void;
}

// ============================================================================
// Plugin Management Interfaces
// ============================================================================

/**
 * Initialization Manager interface for plugin startup
 */
export interface IInitializationManager {
    initializeCore(): Promise<void>;
    initializeViews(): Promise<void>;
    initializeCommands(): Promise<void>;
    cleanup(): Promise<void>;
}

/**
 * View Manager interface for managing Obsidian views
 */
export interface IViewManager {
    registerViews(): void;
    activateView(type: string): Promise<void>;
    getActiveViews(): ViewInfo[];
    closeView(type: string): Promise<void>;
}

/**
 * Command Manager interface for managing Obsidian commands
 */
export interface ICommandManager {
    registerCommands(): void;
    unregisterCommands(): void;
    executeCommand(id: string, ...args: any[]): Promise<void>;
    getRegisteredCommands(): string[];
}

/**
 * Settings Manager interface for managing plugin settings
 */
export interface ISettingsManager {
    loadSettings(): Promise<any>;
    saveSettings(settings: any): Promise<void>;
    onSettingsChange(callback: () => void): () => void;
    validateSettings(settings: any): ValidationResult;
}

// ============================================================================
// Cross-Cutting Service Interfaces
// ============================================================================

/**
 * Logger interface for centralized logging
 */
export interface ILogger {
    debug(message: string, context?: Record<string, any>, category?: string): void;
    info(message: string, context?: Record<string, any>, category?: string): void;
    warn(message: string, context?: Record<string, any>, category?: string): void;
    error(message: string, context?: Record<string, any>, category?: string): void;
    log(level: LogLevel, message: string, context?: Record<string, any>, category?: string): void;
    configure(config: Partial<LoggerConfig>): void;
    createScopedLogger(serviceName: string, category?: string): ScopedLogger;
    getLogs(filter?: LogFilter): LogEntry[];
    getStats(): LoggingStats;
    exportLogs(format?: 'json' | 'csv' | 'text', filter?: LogFilter): string;
    clearLogs(): void;
    muteCategory(category: string): void;
    unmuteCategory(category: string): void;
    setLogLevel(level: LogLevel): void;
}

/**
 * Scoped Logger interface for service-specific logging
 */
export interface IScopedLogger {
    debug(message: string, context?: Record<string, any>, category?: string): void;
    info(message: string, context?: Record<string, any>, category?: string): void;
    warn(message: string, context?: Record<string, any>, category?: string): void;
    error(message: string, context?: Record<string, any>, category?: string): void;
    time(label: string): PerformanceTimer;
}

/**
 * Monitoring interface for system observability
 */
export interface IMonitoringService {
    recordMetric(name: string, value: number, tags?: Record<string, string>): void;
    incrementCounter(name: string, tags?: Record<string, string>): void;
    recordTiming(name: string, duration: number, tags?: Record<string, string>): void;
    recordServiceHealth(serviceName: string, status: ServiceHealthStatus): void;
    getMetrics(): MonitoringMetrics;
    getServiceHealth(): ServiceHealthMap;
    startHealthCheck(serviceName: string, checker: HealthChecker): void;
    stopHealthCheck(serviceName: string): void;
    exportMetrics(format?: 'json' | 'prometheus'): string;
    clearMetrics(): void;
}

/**
 * Configuration Manager interface for centralized configuration
 */
export interface IConfigurationService {
    get<T>(key: string, defaultValue?: T): T;
    set<T>(key: string, value: T): Promise<void>;
    has(key: string): boolean;
    subscribe(key: string, callback: ConfigChangeCallback): UnsubscribeFunction;
    validate(config: any): ValidationResult;
    reload(): Promise<void>;
    export(): string;
    import(config: string): Promise<void>;
    getSchema(): ConfigSchema;
}

/**
 * Security Manager interface for security concerns
 */
export interface ISecurityManager {
    validateInput(input: string, context: SecurityContext): SecurityValidationResult;
    sanitizeOutput(output: string, context: SecurityContext): string;
    checkPermissions(operation: string, context: SecurityContext): boolean;
    auditLog(event: SecurityEvent): void;
    getSecurityMetrics(): SecurityMetrics;
    updateSecurityPolicy(policy: SecurityPolicy): void;
}

// ============================================================================
// Configuration and Error Handling Interfaces
// ============================================================================

/**
 * Configuration Manager interface for centralized configuration
 */
export interface IConfigurationManager {
    get<T>(key: string): T;
    set<T>(key: string, value: T): Promise<void>;
    subscribe(key: string, callback: (value: any) => void): () => void;
    validate(config: any): ValidationResult;
    export(): string;
    import(config: string): Promise<void>;
}

/**
 * Error Boundary interface for handling errors at service boundaries
 */
export interface IErrorBoundary {
    wrap<T>(operation: () => Promise<T>): Promise<T>;
    handleError(error: Error, context: ErrorContext): void;
    getErrorStats(): ErrorStats;
    clearErrors(): void;
}

// ============================================================================
// Type Definitions
// ============================================================================

export interface CompletionRequest {
    messages: Message[];
    options: CompletionOptions;
    provider?: string;
    priority?: number;
}

export interface CompletionResponse {
    content: string;
    provider: string;
    model: string;
    duration: number;
    tokens?: number;
}

export interface ConnectionResult {
    success: boolean;
    message: string;
    latency?: number;
}

export interface AgentResult {
    processedText: string;
    toolResults: Array<{ command: ToolCommand; result: ToolResult }>;
    hasTools: boolean;
    reasoning?: any;
    taskStatus: any;
}

export interface AIRequest {
    id: string;
    messages: Message[];
    options: CompletionOptions;
    provider?: string;
    priority: number;
    timestamp: number;
}

export interface QueueStatus {
    queueLength: number;
    processing: boolean;
    averageWaitTime: number;
    totalProcessed: number;
}

export interface CacheStats {
    hits: number;
    misses: number;
    size: number;
    maxSize: number;
    hitRate: number;
}

export interface RateLimitInfo {
    requests: number;
    maxRequests: number;
    resetTime: number;
    remaining: number;
}

export interface CircuitBreakerState {
    isOpen: boolean;
    failureCount: number;
    lastFailureTime: number;
    nextRetryTime: number;
}

export interface RequestMetrics {
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    averageResponseTime: number;
    requestsByProvider: Record<string, number>;
    errorsByProvider: Record<string, number>;
}

export interface ExecutionStats {
    executionCount: number;
    maxExecutions: number;
    remaining: number;
    averageExecutionTime: number;
    successfulExecutions: number;
    failedExecutions: number;
    totalExecutions: number;
}

export interface ValidationResult {
    isValid: boolean;
    errors?: string[];
    warnings?: string[];
    validCommands?: ToolCommand[];
    invalidCommands?: Array<{ command: ToolCommand; reason: string }>;
    totalCount?: number;
    validCount?: number;
}

export interface ViewInfo {
    type: string;
    isActive: boolean;
    leaf: any;
}

export interface ErrorContext {
    service: string;
    operation: string;
    timestamp: number;
    metadata?: any;
}

export interface ErrorStats {
    totalErrors: number;
    errorsByService: Record<string, number>;
    errorsByType: Record<string, number>;
    recentErrors: Array<{ error: Error; context: ErrorContext }>;
}

export interface ToolRichDisplay {
    getElement(): HTMLElement;
    updateResult(result: ToolResult): void;
    toMarkdown(): string;
}

// ============================================================================
// Cross-Cutting Service Type Definitions
// ============================================================================

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type ServiceHealthStatus = 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
export type SecurityContext = {
    operation: string;
    user?: string;
    source: string;
    metadata?: Record<string, any>;
};

export interface LogEntry {
    timestamp: string;
    level: LogLevel;
    message: string;
    category: string;
    context: Record<string, any>;
    id: string;
}

export interface LoggerConfig {
    maxLogs: number;
    logLevel: LogLevel;
    enableConsoleOutput: boolean;
    enableEventPublishing: boolean;
    mutedCategories: string[];
}

export interface LogFilter {
    level?: LogLevel;
    category?: string;
    since?: Date;
    until?: Date;
    messageContains?: string;
}

export interface LoggingStats {
    totalLogs: number;
    recentLogs: number;
    dailyLogs: number;
    levelCounts: Record<LogLevel, number>;
    categoryCounts: Record<string, number>;
    availableCategories: string[];
    mutedCategories: string[];
    oldestLog: string | null;
    newestLog: string | null;
}

export interface ScopedLogger {
    debug(message: string, context?: Record<string, any>, category?: string): void;
    info(message: string, context?: Record<string, any>, category?: string): void;
    warn(message: string, context?: Record<string, any>, category?: string): void;
    error(message: string, context?: Record<string, any>, category?: string): void;
    time(label: string): PerformanceTimer;
}

export interface PerformanceTimer {
    end(context?: Record<string, any>): number;
}

export interface MonitoringMetrics {
    counters: Record<string, number>;
    timings: Record<string, { count: number; total: number; avg: number; min: number; max: number }>;
    gauges: Record<string, number>;
    healthChecks: ServiceHealthMap;
}

export interface ServiceHealthMap {
    [serviceName: string]: {
        status: ServiceHealthStatus;
        lastCheck: number;
        message?: string;
        metadata?: Record<string, any>;
    };
}

export interface HealthChecker {
    check(): Promise<{ status: ServiceHealthStatus; message?: string; metadata?: Record<string, any> }>;
}

export interface ConfigSchema {
    [key: string]: {
        type: 'string' | 'number' | 'boolean' | 'object' | 'array';
        required?: boolean;
        default?: any;
        description?: string;
        validation?: (value: any) => boolean;
    };
}

export interface ConfigChangeCallback {
    (newValue: any, oldValue: any, key: string): void;
}

export interface SecurityValidationResult {
    isValid: boolean;
    threats: string[];
    sanitizedInput?: string;
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
}

export interface SecurityEvent {
    type: 'validation' | 'permission_check' | 'suspicious_activity' | 'policy_violation';
    timestamp: number;
    context: SecurityContext;
    details: Record<string, any>;
    severity: 'info' | 'warn' | 'error' | 'critical';
}

export interface SecurityMetrics {
    validationResults: Record<string, number>;
    permissionChecks: Record<string, number>;
    suspiciousActivities: number;
    policyViolations: number;
    recentEvents: SecurityEvent[];
}

export interface SecurityPolicy {
    allowedOperations: string[];
    restrictedPatterns: string[];
    maxInputLength: number;
    requiresPermission: string[];
    auditAll: boolean;
}