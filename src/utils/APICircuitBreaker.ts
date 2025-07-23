/**
 * @file APICircuitBreaker.ts
 * 
 * Advanced Circuit Breaker pattern implementation for API calls with:
 * - Exponential backoff with jitter
 * - Sliding window failure tracking
 * - Half-open state testing
 * - Provider-specific configuration
 * - Performance metrics integration
 */

import { debugLog } from './logger';
import { performanceMonitor } from './performanceMonitor';

export interface CircuitBreakerConfig {
  /** Number of failures before opening circuit */
  failureThreshold: number;
  /** Timeout before allowing retry (ms) */
  timeout: number;
  /** Max calls to allow in half-open state */
  halfOpenMaxCalls: number;
  /** Window size for tracking failures (ms) */
  monitoringWindowMs: number;
  /** Enable exponential backoff */
  exponentialBackoff: boolean;
  /** Base delay for exponential backoff (ms) */
  baseDelayMs: number;
  /** Maximum delay for exponential backoff (ms) */
  maxDelayMs: number;
  /** Jitter percentage (0-1) to add randomness */
  jitterFactor: number;
}

export interface CircuitBreakerState {
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  failureCount: number;
  successCount: number;
  lastFailureTime: number;
  nextRetryTime: number;
  halfOpenCalls: number;
  recentFailures: number[];
}

export interface CircuitBreakerMetrics {
  state: string;
  failureCount: number;
  successCount: number;
  totalCalls: number;
  failureRate: number;
  uptime: number;
  lastFailureTime: number;
  nextRetryTime: number;
}

export class APICircuitBreaker {
  private static instance: APICircuitBreaker;
  private breakers = new Map<string, CircuitBreakerState>();
  private configs = new Map<string, CircuitBreakerConfig>();
  private debugMode: boolean = false;

  private readonly DEFAULT_CONFIG: CircuitBreakerConfig = {
    failureThreshold: 5,
    timeout: 30000, // 30 seconds
    halfOpenMaxCalls: 3,
    monitoringWindowMs: 5 * 60 * 1000, // 5 minutes
    exponentialBackoff: true,
    baseDelayMs: 1000,
    maxDelayMs: 60000,
    jitterFactor: 0.1
  };

  static getInstance(): APICircuitBreaker {
    if (!APICircuitBreaker.instance) {
      APICircuitBreaker.instance = new APICircuitBreaker();
    }
    return APICircuitBreaker.instance;
  }

  constructor() {
    // Start cleanup timer for old failures
    setInterval(() => this.cleanupOldFailures(), 60000); // Every minute
  }

  /**
   * Set debug mode for detailed logging
   */
  setDebugMode(enabled: boolean): void {
    this.debugMode = enabled;
  }

  /**
   * Configure circuit breaker for specific provider
   */
  configure(provider: string, config: Partial<CircuitBreakerConfig>): void {
    this.configs.set(provider, { ...this.DEFAULT_CONFIG, ...config });
    this.log(`Configured circuit breaker for ${provider}`, config);
  }

  /**
   * Execute operation with circuit breaker protection
   */
  async execute<T>(provider: string, operation: () => Promise<T>): Promise<T> {
    const state = this.getOrCreateState(provider);
    const config = this.getConfig(provider);

    // Check if circuit is open
    if (this.isOpen(provider)) {
      const waitTime = state.nextRetryTime - Date.now();
      if (waitTime > 0) {
        performanceMonitor.recordMetric('circuit_breaker_blocked', 1, 'count', { provider });
        throw new Error(`Circuit breaker is open for ${provider}. Retry in ${Math.ceil(waitTime / 1000)}s`);
      } else {
        // Transition to half-open
        this.transitionToHalfOpen(provider);
      }
    }

    // Execute operation with monitoring
    const startTime = Date.now();
    try {
      const result = await operation();
      this.onSuccess(provider, Date.now() - startTime);
      return result;
    } catch (error) {
      this.onFailure(provider, error, Date.now() - startTime);
      throw error;
    }
  }

  /**
   * Check if circuit breaker is open for provider
   */
  isOpen(provider: string): boolean {
    const state = this.getOrCreateState(provider);
    return state.state === 'OPEN' || 
           (state.state === 'HALF_OPEN' && state.halfOpenCalls >= this.getConfig(provider).halfOpenMaxCalls);
  }

  /**
   * Force reset circuit breaker
   */
  reset(provider: string): void {
    const state = this.getOrCreateState(provider);
    state.state = 'CLOSED';
    state.failureCount = 0;
    state.successCount = 0;
    state.halfOpenCalls = 0;
    state.recentFailures = [];
    state.nextRetryTime = 0;
    
    this.log(`Circuit breaker reset for ${provider}`);
    performanceMonitor.recordMetric('circuit_breaker_reset', 1, 'count', { provider });
  }

  /**
   * Get metrics for provider
   */
  getMetrics(provider: string): CircuitBreakerMetrics {
    const state = this.getOrCreateState(provider);
    const config = this.getConfig(provider);
    const now = Date.now();
    
    // Calculate failure rate within monitoring window
    const windowStart = now - config.monitoringWindowMs;
    const recentFailures = state.recentFailures.filter(time => time > windowStart);
    const totalCalls = state.successCount + state.failureCount;
    const failureRate = totalCalls > 0 ? recentFailures.length / totalCalls : 0;

    return {
      state: state.state,
      failureCount: state.failureCount,
      successCount: state.successCount,
      totalCalls,
      failureRate,
      uptime: state.lastFailureTime > 0 ? now - state.lastFailureTime : now,
      lastFailureTime: state.lastFailureTime,
      nextRetryTime: state.nextRetryTime
    };
  }

  /**
   * Get all provider metrics
   */
  getAllMetrics(): Record<string, CircuitBreakerMetrics> {
    const metrics: Record<string, CircuitBreakerMetrics> = {};
    for (const provider of this.breakers.keys()) {
      metrics[provider] = this.getMetrics(provider);
    }
    return metrics;
  }

  /**
   * Handle successful operation
   */
  private onSuccess(provider: string, duration: number): void {
    const state = this.getOrCreateState(provider);
    const config = this.getConfig(provider);
    
    state.successCount++;
    
    if (state.state === 'HALF_OPEN') {
      state.halfOpenCalls++;
      
      // Check if we should close the circuit
      if (state.halfOpenCalls >= config.halfOpenMaxCalls) {
        this.transitionToClosed(provider);
      }
    } else if (state.state === 'CLOSED') {
      // Gradually reduce failure count on success
      state.failureCount = Math.max(0, state.failureCount - 1);
    }

    performanceMonitor.recordMetric('circuit_breaker_success', 1, 'count', { provider });
    performanceMonitor.recordMetric('api_call_duration', duration, 'time', { provider });
    
    this.log(`Success for ${provider} (${duration}ms) - State: ${state.state}`);
  }

  /**
   * Handle failed operation
   */
  private onFailure(provider: string, error: any, duration: number): void {
    const state = this.getOrCreateState(provider);
    const config = this.getConfig(provider);
    const now = Date.now();
    
    state.failureCount++;
    state.lastFailureTime = now;
    state.recentFailures.push(now);
    
    // Clean up old failures
    const windowStart = now - config.monitoringWindowMs;
    state.recentFailures = state.recentFailures.filter(time => time > windowStart);
    
    performanceMonitor.recordMetric('circuit_breaker_failure', 1, 'count', { provider });
    performanceMonitor.recordMetric('api_call_duration', duration, 'time', { provider, status: 'failed' });
    
    // Check if we should open the circuit
    if (state.state === 'CLOSED' && state.recentFailures.length >= config.failureThreshold) {
      this.transitionToOpen(provider);
    } else if (state.state === 'HALF_OPEN') {
      // Any failure in half-open transitions back to open
      this.transitionToOpen(provider);
    }
    
    this.log(`Failure for ${provider} (${duration}ms) - State: ${state.state}, Recent failures: ${state.recentFailures.length}`);
  }

  /**
   * Transition to OPEN state
   */
  private transitionToOpen(provider: string): void {
    const state = this.getOrCreateState(provider);
    const config = this.getConfig(provider);
    
    state.state = 'OPEN';
    state.halfOpenCalls = 0;
    
    // Calculate next retry time with exponential backoff and jitter
    let timeout = config.timeout;
    if (config.exponentialBackoff) {
      const exponentialDelay = Math.min(
        config.baseDelayMs * Math.pow(2, Math.min(state.failureCount - 1, 10)),
        config.maxDelayMs
      );
      timeout = Math.max(timeout, exponentialDelay);
    }
    
    // Add jitter to prevent thundering herd
    const jitter = timeout * config.jitterFactor * Math.random();
    state.nextRetryTime = Date.now() + timeout + jitter;
    
    performanceMonitor.recordMetric('circuit_breaker_opened', 1, 'count', { provider });
    this.log(`Circuit breaker OPENED for ${provider}. Next retry: ${new Date(state.nextRetryTime).toISOString()}`);
  }

  /**
   * Transition to HALF_OPEN state
   */
  private transitionToHalfOpen(provider: string): void {
    const state = this.getOrCreateState(provider);
    
    state.state = 'HALF_OPEN';
    state.halfOpenCalls = 0;
    
    performanceMonitor.recordMetric('circuit_breaker_half_opened', 1, 'count', { provider });
    this.log(`Circuit breaker HALF_OPEN for ${provider}`);
  }

  /**
   * Transition to CLOSED state
   */
  private transitionToClosed(provider: string): void {
    const state = this.getOrCreateState(provider);
    
    state.state = 'CLOSED';
    state.failureCount = 0;
    state.halfOpenCalls = 0;
    state.nextRetryTime = 0;
    
    performanceMonitor.recordMetric('circuit_breaker_closed', 1, 'count', { provider });
    this.log(`Circuit breaker CLOSED for ${provider}`);
  }

  /**
   * Get or create state for provider
   */
  private getOrCreateState(provider: string): CircuitBreakerState {
    if (!this.breakers.has(provider)) {
      this.breakers.set(provider, {
        state: 'CLOSED',
        failureCount: 0,
        successCount: 0,
        lastFailureTime: 0,
        nextRetryTime: 0,
        halfOpenCalls: 0,
        recentFailures: []
      });
    }
    return this.breakers.get(provider)!;
  }

  /**
   * Get configuration for provider
   */
  private getConfig(provider: string): CircuitBreakerConfig {
    return this.configs.get(provider) || this.DEFAULT_CONFIG;
  }

  /**
   * Clean up old failure records
   */
  private cleanupOldFailures(): void {
    const now = Date.now();
    
    for (const [provider, state] of this.breakers.entries()) {
      const config = this.getConfig(provider);
      const windowStart = now - config.monitoringWindowMs;
      
      const oldLength = state.recentFailures.length;
      state.recentFailures = state.recentFailures.filter(time => time > windowStart);
      
      if (oldLength !== state.recentFailures.length) {
        this.log(`Cleaned up ${oldLength - state.recentFailures.length} old failures for ${provider}`);
      }
    }
  }

  /**
   * Log debug messages
   */
  private log(message: string, data?: any): void {
    if (this.debugMode) {
      debugLog(true, 'info', `[APICircuitBreaker] ${message}`, data);
    }
  }
}

// Singleton instance
export const apiCircuitBreaker = APICircuitBreaker.getInstance();
