import { IExecutionLimitManager, IEventBus } from '../interfaces';

/**
 * Execution Limit Manager
 * 
 * Manages tool execution limits with configurable thresholds,
 * automatic reset mechanisms, and event notifications
 */
export class ExecutionLimitManager implements IExecutionLimitManager {
    private executionCount: number = 0;
    private maxExecutions: number = 50; // Default limit
    private resetIntervalMs: number = 60000; // 1 minute default
    private lastResetTime: number = Date.now();
    private autoReset: boolean = true;
    private resetTimer?: NodeJS.Timeout;

    constructor(
        private eventBus: IEventBus,
        config?: {
            maxExecutions?: number;
            resetIntervalMs?: number;
            autoReset?: boolean;
        }
    ) {
        if (config) {
            this.maxExecutions = config.maxExecutions ?? this.maxExecutions;
            this.resetIntervalMs = config.resetIntervalMs ?? this.resetIntervalMs;
            this.autoReset = config.autoReset ?? this.autoReset;
        }

        if (this.autoReset) {
            this.startAutoReset();
        }

        // Listen for successful tool executions to update count
        this.eventBus.subscribe('tool.executed', (data: any) => {
            if (data?.result?.success) {
                this.addExecutions(1);
            }
        });
    }

    /**
     * Checks if the execution limit has been reached.
     */
    isLimitReached(): boolean {
        this.checkAutoReset();
        return this.executionCount >= this.maxExecutions;
    }

    /**
     * Checks if the specified number of executions can be performed.
     */
    canExecute(count: number = 1): boolean {
        this.checkAutoReset();
        return (this.executionCount + count) <= this.maxExecutions;
    }

    /**
     * Adds executed tool count to the current total.
     */
    addExecutions(count: number): void {
        const previousCount = this.executionCount;
        this.executionCount += count;

        // Publish execution count update event
        this.eventBus.publish('execution_limit.count_updated', {
            previousCount,
            currentCount: this.executionCount,
            maxExecutions: this.maxExecutions,
            remaining: this.getRemaining(),
            percentage: this.getUsagePercentage()
        });

        // Check if we've reached or exceeded the limit
        if (previousCount < this.maxExecutions && this.executionCount >= this.maxExecutions) {
            this.eventBus.publish('execution_limit.limit_reached', {
                count: this.executionCount,
                maxExecutions: this.maxExecutions,
                timestamp: Date.now()
            });
        }

        // Warn when approaching limit (90% threshold)
        const warningThreshold = Math.floor(this.maxExecutions * 0.9);
        if (previousCount < warningThreshold && this.executionCount >= warningThreshold) {
            this.eventBus.publish('execution_limit.warning', {
                count: this.executionCount,
                maxExecutions: this.maxExecutions,
                remaining: this.getRemaining(),
                percentage: this.getUsagePercentage()
            });
        }
    }

    /**
     * Resets the execution count to zero.
     */
    resetLimit(): void {
        const previousCount = this.executionCount;
        this.executionCount = 0;
        this.lastResetTime = Date.now();

        this.eventBus.publish('execution_limit.reset', {
            previousCount,
            timestamp: this.lastResetTime
        });
    }

    /**
     * Gets the current execution limit.
     */
    getLimit(): number {
        return this.maxExecutions;
    }

    /**
     * Sets a new execution limit.
     */
    setLimit(limit: number): void {
        if (limit < 0) {
            throw new Error('Execution limit must be non-negative');
        }

        const previousLimit = this.maxExecutions;
        this.maxExecutions = limit;

        this.eventBus.publish('execution_limit.limit_changed', {
            previousLimit,
            newLimit: limit,
            currentCount: this.executionCount,
            remaining: this.getRemaining()
        });

        // Check if the new limit has already been exceeded
        if (this.executionCount >= this.maxExecutions) {
            this.eventBus.publish('execution_limit.limit_reached', {
                count: this.executionCount,
                maxExecutions: this.maxExecutions,
                timestamp: Date.now()
            });
        }
    }

    /**
     * Gets the current execution count.
     */
    getCurrentCount(): number {
        return this.executionCount;
    }

    /**
     * Gets the remaining executions before hitting the limit.
     */
    getRemaining(): number {
        return Math.max(0, this.maxExecutions - this.executionCount);
    }

    /**
     * Gets the usage percentage (0-100).
     */
    getUsagePercentage(): number {
        if (this.maxExecutions === 0) return 0;
        return Math.min(100, (this.executionCount / this.maxExecutions) * 100);
    }

    /**
     * Gets detailed execution limit status.
     */
    getStatus(): {
        count: number;
        limit: number;
        remaining: number;
        percentage: number;
        isLimitReached: boolean;
        lastResetTime: number;
        autoReset: boolean;
        resetIntervalMs: number;
    } {
        return {
            count: this.executionCount,
            limit: this.maxExecutions,
            remaining: this.getRemaining(),
            percentage: this.getUsagePercentage(),
            isLimitReached: this.isLimitReached(),
            lastResetTime: this.lastResetTime,
            autoReset: this.autoReset,
            resetIntervalMs: this.resetIntervalMs
        };
    }

    /**
     * Configures auto-reset behavior.
     */
    setAutoReset(enabled: boolean, intervalMs?: number): void {
        this.autoReset = enabled;
        
        if (intervalMs !== undefined) {
            this.resetIntervalMs = intervalMs;
        }

        if (this.autoReset) {
            this.startAutoReset();
        } else {
            this.stopAutoReset();
        }
    }

    /**
     * Manually triggers a reset if conditions are met.
     */
    checkAutoReset(): void {
        if (!this.autoReset) return;

        const now = Date.now();
        if (now - this.lastResetTime >= this.resetIntervalMs) {
            this.resetLimit();
        }
    }

    /**
     * Starts the auto-reset timer.
     */
    private startAutoReset(): void {
        this.stopAutoReset(); // Clear any existing timer
        
        if (this.autoReset && this.resetIntervalMs > 0) {
            this.resetTimer = setInterval(() => {
                this.resetLimit();
            }, this.resetIntervalMs);
        }
    }

    /**
     * Stops the auto-reset timer.
     */
    private stopAutoReset(): void {
        if (this.resetTimer) {
            clearInterval(this.resetTimer);
            this.resetTimer = undefined;
        }
    }

    /**
     * Cleanup method for when the manager is being destroyed.
     */
    destroy(): void {
        this.stopAutoReset();
        // Unsubscribe from events if needed (EventBus should handle this)
    }
}
