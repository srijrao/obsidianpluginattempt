/**
 * @file CircuitBreaker.ts
 * 
 * Circuit Breaker service for handling provider failures and automatic recovery.
 * Extracted from AIDispatcher to follow single responsibility principle.
 */

import { ICircuitBreaker, CircuitBreakerState, IEventBus } from '../interfaces';

export interface CircuitBreakerConfig {
    failureThreshold: number;
    timeoutMs: number;
    monitoringPeriodMs: number;
    halfOpenMaxCalls: number;
}

export interface CircuitBreakerEntry extends CircuitBreakerState {
    config: CircuitBreakerConfig;
    halfOpenCalls: number;
    totalCalls: number;
    successfulCalls: number;
    recentFailures: number[];
    lastStateChange: number;
}

/**
 * Manages circuit breakers for different AI providers with automatic recovery
 */
export class CircuitBreaker implements ICircuitBreaker {
    private breakers = new Map<string, CircuitBreakerEntry>();
    private monitoringIntervalId: NodeJS.Timeout | null = null;
    private readonly defaultConfig: CircuitBreakerConfig = {
        failureThreshold: 5,
        timeoutMs: 30 * 1000, // 30 seconds
        monitoringPeriodMs: 5 * 60 * 1000, // 5 minutes
        halfOpenMaxCalls: 3
    };

    constructor(private eventBus: IEventBus, customConfig?: Partial<CircuitBreakerConfig>) {
        if (customConfig) {
            this.defaultConfig = { ...this.defaultConfig, ...customConfig };
        }
        this.initializeProviderBreakers();
        this.startMonitoringTimer();
console.log(`[CircuitBreaker] Initialized for providers: ${Array.from(this.breakers.keys()).join(', ')}`);
    }

    /**
     * Checks if a circuit breaker is open for a provider
     */
    isOpen(provider: string): boolean {
        const breaker = this.getOrCreateBreaker(provider);
        const now = Date.now();

        // Check if we should transition from OPEN to HALF_OPEN
        if (breaker.isOpen && now >= breaker.nextRetryTime) {
            this.transitionToHalfOpen(provider, breaker);
        }

        return breaker.isOpen;
    }

    /**
     * Records a successful operation
     */
    recordSuccess(provider: string): void {
        const breaker = this.getOrCreateBreaker(provider);
        const now = Date.now();

        breaker.successfulCalls++;
        breaker.totalCalls++;
        
        // Remove old failures outside monitoring period
        this.cleanupOldFailures(breaker, now);

        // Handle state transitions based on current state
        if (breaker.isOpen) {
            // In HALF_OPEN state, check if we should close the circuit
            if (breaker.halfOpenCalls >= breaker.config.halfOpenMaxCalls) {
                this.transitionToClosed(provider, breaker);
            } else {
                breaker.halfOpenCalls++;
            }
        } else {
            // In CLOSED state, reset failure count on success
            breaker.failureCount = Math.max(0, breaker.failureCount - 1);
        }

        this.eventBus.publish('circuit.breaker.success', {
            provider,
            state: breaker.isOpen ? 'half-open' : 'closed',
            successfulCalls: breaker.successfulCalls,
            totalCalls: breaker.totalCalls,
            timestamp: now
        });
    }

    /**
     * Records a failed operation
     */
    recordFailure(provider: string): void {
        const breaker = this.getOrCreateBreaker(provider);
        const now = Date.now();

        breaker.failureCount++;
        breaker.totalCalls++;
        breaker.lastFailureTime = now;
        breaker.recentFailures.push(now);

        // Clean up old failures
        this.cleanupOldFailures(breaker, now);

        // Check if we should open the circuit
        if (!breaker.isOpen && breaker.failureCount >= breaker.config.failureThreshold) {
            this.transitionToOpen(provider, breaker);
        } else if (breaker.isOpen) {
            // In HALF_OPEN state, any failure should reopen the circuit
            this.transitionToOpen(provider, breaker);
        }

        this.eventBus.publish('circuit.breaker.failure', {
            provider,
            state: breaker.isOpen ? 'open' : 'closed',
            failureCount: breaker.failureCount,
            threshold: breaker.config.failureThreshold,
            recentFailures: breaker.recentFailures.length,
            timestamp: now
        });
        console.log(`[CircuitBreaker] Failure recorded for provider: ${provider}, Failure count: ${breaker.failureCount}`);
    }

    /**
     * Gets the current state of a circuit breaker
     */
    getState(provider: string): CircuitBreakerState & { failures: number } {
        const breaker = this.getOrCreateBreaker(provider);
        
        return {
            isOpen: breaker.isOpen,
            failureCount: breaker.failureCount,
            failures: breaker.failureCount, // Add backward compatibility for tests
            lastFailureTime: breaker.lastFailureTime,
            nextRetryTime: breaker.nextRetryTime
        };
    }

    /**
     * Manually resets a circuit breaker
     */
    reset(provider: string): void {
        const breaker = this.getOrCreateBreaker(provider);
        
        this.transitionToClosed(provider, breaker);
        
        this.eventBus.publish('circuit.breaker.reset', {
            provider,
            timestamp: Date.now()
        });
    }

    /**
     * Gets statistics for all circuit breakers
     */
    getAllStats(): Record<string, {
        state: 'open' | 'closed' | 'half-open';
        config: CircuitBreakerConfig;
        stats: {
            failureCount: number;
            successfulCalls: number;
            totalCalls: number;
            failureRate: number;
            recentFailures: number;
            uptime: number;
            lastFailureTime: number;
            nextRetryTime: number;
        };
    }> {
        const result: Record<string, any> = {};
        const now = Date.now();

        for (const [provider, breaker] of this.breakers.entries()) {
            const failureRate = breaker.totalCalls > 0 
                ? (breaker.totalCalls - breaker.successfulCalls) / breaker.totalCalls 
                : 0;
            
            const uptime = now - breaker.lastStateChange;
            
            let state: 'open' | 'closed' | 'half-open';
            if (breaker.isOpen) {
                state = now >= breaker.nextRetryTime ? 'half-open' : 'open';
            } else {
                state = 'closed';
            }

            result[provider] = {
                state,
                config: breaker.config,
                stats: {
                    failureCount: breaker.failureCount,
                    successfulCalls: breaker.successfulCalls,
                    totalCalls: breaker.totalCalls,
                    failureRate: Math.round(failureRate * 100) / 100,
                    recentFailures: breaker.recentFailures.length,
                    uptime,
                    lastFailureTime: breaker.lastFailureTime,
                    nextRetryTime: breaker.nextRetryTime
                }
            };
        }

        return result;
    }

    /**
     * Updates configuration for a specific provider
     */
    updateConfig(provider: string, config: Partial<CircuitBreakerConfig>): void {
        const breaker = this.getOrCreateBreaker(provider);
        breaker.config = { ...breaker.config, ...config };
        
        this.eventBus.publish('circuit.breaker.config_updated', {
            provider,
            config: breaker.config,
            timestamp: Date.now()
        });
    }

    /**
     * Gets or creates a circuit breaker for a provider
     */
    private getOrCreateBreaker(provider: string): CircuitBreakerEntry {
        if (!this.breakers.has(provider)) {
            const now = Date.now();
            const breaker: CircuitBreakerEntry = {
                isOpen: false,
                failureCount: 0,
                lastFailureTime: 0,
                nextRetryTime: 0,
                config: { ...this.defaultConfig },
                halfOpenCalls: 0,
                totalCalls: 0,
                successfulCalls: 0,
                recentFailures: [],
                lastStateChange: now
            };
            this.breakers.set(provider, breaker);
        }
        return this.breakers.get(provider)!;
    }

    /**
     * Transitions circuit breaker to OPEN state
     */
    private transitionToOpen(provider: string, breaker: CircuitBreakerEntry): void {
        const now = Date.now();
        
        breaker.isOpen = true;
        breaker.nextRetryTime = now + breaker.config.timeoutMs;
        breaker.halfOpenCalls = 0;
        breaker.lastStateChange = now;

        this.eventBus.publish('circuit.breaker.opened', {
            provider,
            failureCount: breaker.failureCount,
            threshold: breaker.config.failureThreshold,
            nextRetryTime: breaker.nextRetryTime,
            timestamp: now
        });
    }

    /**
     * Transitions circuit breaker to HALF_OPEN state
     */
    private transitionToHalfOpen(provider: string, breaker: CircuitBreakerEntry): void {
        const now = Date.now();
        
        breaker.isOpen = true; // Still considered "open" but allowing limited calls
        breaker.halfOpenCalls = 0;
        breaker.lastStateChange = now;

        this.eventBus.publish('circuit.breaker.half_opened', {
            provider,
            maxCalls: breaker.config.halfOpenMaxCalls,
            timestamp: now
        });
    }

    /**
     * Transitions circuit breaker to CLOSED state
     */
    private transitionToClosed(provider: string, breaker: CircuitBreakerEntry): void {
        const now = Date.now();
        
        breaker.isOpen = false;
        breaker.failureCount = 0;
        breaker.halfOpenCalls = 0;
        breaker.nextRetryTime = 0;
        breaker.recentFailures = [];
        breaker.lastStateChange = now;

        this.eventBus.publish('circuit.breaker.closed', {
            provider,
            successfulCalls: breaker.successfulCalls,
            totalCalls: breaker.totalCalls,
            timestamp: now
        });
    }

    /**
     * Removes old failures outside the monitoring period
     */
    private cleanupOldFailures(breaker: CircuitBreakerEntry, now: number): void {
        const cutoff = now - breaker.config.monitoringPeriodMs;
        breaker.recentFailures = breaker.recentFailures.filter(time => time > cutoff);
    }

    /**
     * Initializes circuit breakers for known providers
     */
    private initializeProviderBreakers(): void {
        const providers = ['openai', 'anthropic', 'gemini', 'ollama'];
        
        for (const provider of providers) {
            this.getOrCreateBreaker(provider);
        }
    }

    /**
     * Starts monitoring timer for automatic state management
     */
    private startMonitoringTimer(): void {
        this.monitoringIntervalId = setInterval(() => {
            this.performPeriodicMaintenance();
        }, 30000); // Check every 30 seconds
    }

    /**
     * Performs periodic maintenance on all circuit breakers
     */
    private performPeriodicMaintenance(): void {
        const now = Date.now();
        
        for (const [provider, breaker] of this.breakers.entries()) {
            // Clean up old failures
            this.cleanupOldFailures(breaker, now);
            
            // Check for automatic recovery in OPEN state
            if (breaker.isOpen && now >= breaker.nextRetryTime) {
                this.eventBus.publish('circuit.breaker.ready_for_retry', {
                    provider,
                    downtime: now - breaker.lastStateChange,
                    timestamp: now
                });
            }
        }
    }

    /**
     * Cleanup method for disposing the service
     */
    dispose(): void {
console.log(`[CircuitBreaker] Disposing circuit breaker.`);
        if (this.monitoringIntervalId) {
            clearInterval(this.monitoringIntervalId);
            this.monitoringIntervalId = null;
        }
        this.breakers.clear();
    }
}