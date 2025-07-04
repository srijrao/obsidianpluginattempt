/**
 * @file asyncOptimizer.ts
 * 
 * Async optimization utilities for batching operations, parallelization,
 * and efficient async operation management.
 */

export interface BatchOptions {
    batchSize: number;
    delayMs?: number;
    maxWaitMs?: number;
}

export interface ParallelOptions {
    concurrency: number;
    retryAttempts?: number;
    retryDelayMs?: number;
}

/**
 * Batches async operations to reduce overhead and improve performance
 */
export class AsyncBatcher<TInput, TOutput> {
    private pendingItems: Array<{
        input: TInput;
        resolve: (value: TOutput) => void;
        reject: (error: Error) => void;
        timestamp: number;
    }> = [];
    private batchTimer: NodeJS.Timeout | null = null;
    private isProcessing = false;

    constructor(
        private processor: (items: TInput[]) => Promise<TOutput[]>,
        private options: BatchOptions
    ) {}

    /**
     * Add an item to the batch for processing
     */
    async add(input: TInput): Promise<TOutput> {
        return new Promise<TOutput>((resolve, reject) => {
            this.pendingItems.push({
                input,
                resolve,
                reject,
                timestamp: Date.now()
            });

            this.scheduleBatch();
        });
    }

    /**
     * Force process the current batch immediately
     */
    async flush(): Promise<void> {
        if (this.batchTimer) {
            clearTimeout(this.batchTimer);
            this.batchTimer = null;
        }
        await this.processBatch();
    }

    /**
     * Get current batch size
     */
    getPendingCount(): number {
        return this.pendingItems.length;
    }

    private scheduleBatch(): void {
        // Process immediately if batch is full
        if (this.pendingItems.length >= this.options.batchSize) {
            this.processBatch();
            return;
        }

        // Schedule batch processing if not already scheduled
        if (!this.batchTimer && this.options.delayMs) {
            this.batchTimer = setTimeout(() => {
                this.batchTimer = null;
                this.processBatch();
            }, this.options.delayMs);
        }

        // Force processing if items are too old
        if (this.options.maxWaitMs) {
            const oldestItem = this.pendingItems[0];
            if (oldestItem && Date.now() - oldestItem.timestamp > this.options.maxWaitMs) {
                this.processBatch();
            }
        }
    }

    private async processBatch(): Promise<void> {
        if (this.isProcessing || this.pendingItems.length === 0) {
            return;
        }

        this.isProcessing = true;
        const currentBatch = this.pendingItems.splice(0, this.options.batchSize);

        try {
            const inputs = currentBatch.map(item => item.input);
            const outputs = await this.processor(inputs);

            // Resolve all items in the batch
            currentBatch.forEach((item, index) => {
                if (index < outputs.length) {
                    item.resolve(outputs[index]);
                } else {
                    item.reject(new Error('Batch processing failed: insufficient outputs'));
                }
            });
        } catch (error) {
            // Reject all items in the batch
            currentBatch.forEach(item => {
                item.reject(error instanceof Error ? error : new Error(String(error)));
            });
        } finally {
            this.isProcessing = false;

            // Process remaining items if any
            if (this.pendingItems.length > 0) {
                this.scheduleBatch();
            }
        }
    }
}

/**
 * Parallel execution with concurrency control
 */
export class ParallelExecutor {
    private activePromises = new Set<Promise<any>>();

    /**
     * Execute tasks in parallel with concurrency limit
     */
    async executeParallel<T>(
        tasks: Array<() => Promise<T>>,
        options: ParallelOptions
    ): Promise<T[]> {
        const results: T[] = new Array(tasks.length);
        const errors: Error[] = [];
        let completedCount = 0;

        return new Promise((resolve, reject) => {
            const executeTask = async (taskIndex: number, retryCount = 0): Promise<void> => {
                if (taskIndex >= tasks.length) return;

                const task = tasks[taskIndex];
                const promise = this.executeWithRetry(task, options, retryCount);
                this.activePromises.add(promise);

                try {
                    const result = await promise;
                    results[taskIndex] = result;
                    completedCount++;

                    if (completedCount === tasks.length) {
                        if (errors.length > 0) {
                            reject(new AggregateError(errors, 'Some tasks failed'));
                        } else {
                            resolve(results);
                        }
                    }
                } catch (error) {
                    errors.push(error instanceof Error ? error : new Error(String(error)));
                    completedCount++;

                    if (completedCount === tasks.length) {
                        reject(new AggregateError(errors, 'Some tasks failed'));
                    }
                } finally {
                    this.activePromises.delete(promise);
                    
                    // Start next task if we're under the concurrency limit
                    const nextTaskIndex = taskIndex + options.concurrency;
                    if (nextTaskIndex < tasks.length) {
                        executeTask(nextTaskIndex);
                    }
                }
            };

            // Start initial batch of tasks
            const initialTasks = Math.min(options.concurrency, tasks.length);
            for (let i = 0; i < initialTasks; i++) {
                executeTask(i);
            }
        });
    }

    /**
     * Execute tasks in batches
     */
    async executeBatched<T>(
        tasks: Array<() => Promise<T>>,
        batchSize: number,
        delayBetweenBatches = 0
    ): Promise<T[]> {
        const results: T[] = [];
        
        for (let i = 0; i < tasks.length; i += batchSize) {
            const batch = tasks.slice(i, i + batchSize);
            const batchResults = await Promise.allSettled(
                batch.map(task => task())
            );

            for (const result of batchResults) {
                if (result.status === 'fulfilled') {
                    results.push(result.value);
                } else {
                    throw result.reason;
                }
            }

            // Delay between batches if specified
            if (delayBetweenBatches > 0 && i + batchSize < tasks.length) {
                await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
            }
        }

        return results;
    }

    /**
     * Get count of currently active promises
     */
    getActiveCount(): number {
        return this.activePromises.size;
    }

    /**
     * Cancel all active promises (if they support cancellation)
     */
    cancelAll(): void {
        // Note: This would require AbortController support in the tasks
        this.activePromises.clear();
    }

    private async executeWithRetry<T>(
        task: () => Promise<T>,
        options: ParallelOptions,
        retryCount: number
    ): Promise<T> {
        try {
            return await task();
        } catch (error) {
            const maxRetries = options.retryAttempts || 0;
            
            if (retryCount < maxRetries) {
                const delay = options.retryDelayMs || 1000;
                await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, retryCount)));
                return this.executeWithRetry(task, options, retryCount + 1);
            }
            
            throw error;
        }
    }
}

/**
 * Debounce async operations
 */
export class AsyncDebouncer<T> {
    private timeoutId: NodeJS.Timeout | null = null;
    private lastPromise: Promise<T> | null = null;

    constructor(private delayMs: number) {}

    /**
     * Debounce an async operation
     */
    async debounce(operation: () => Promise<T>): Promise<T> {
        // Cancel previous timeout
        if (this.timeoutId) {
            clearTimeout(this.timeoutId);
        }

        return new Promise((resolve, reject) => {
            this.timeoutId = setTimeout(async () => {
                try {
                    this.lastPromise = operation();
                    const result = await this.lastPromise;
                    resolve(result);
                } catch (error) {
                    reject(error);
                } finally {
                    this.timeoutId = null;
                    this.lastPromise = null;
                }
            }, this.delayMs);
        });
    }

    /**
     * Cancel pending debounced operation
     */
    cancel(): void {
        if (this.timeoutId) {
            clearTimeout(this.timeoutId);
            this.timeoutId = null;
        }
    }

    /**
     * Check if operation is pending
     */
    isPending(): boolean {
        return this.timeoutId !== null;
    }
}

/**
 * Throttle async operations
 */
export class AsyncThrottler<T> {
    private lastExecution = 0;
    private pendingPromise: Promise<T> | null = null;

    constructor(private intervalMs: number) {}

    /**
     * Throttle an async operation
     */
    async throttle(operation: () => Promise<T>): Promise<T> {
        const now = Date.now();
        const timeSinceLastExecution = now - this.lastExecution;

        if (timeSinceLastExecution >= this.intervalMs) {
            // Execute immediately
            this.lastExecution = now;
            this.pendingPromise = operation();
            return this.pendingPromise;
        }

        // Return existing promise if one is pending
        if (this.pendingPromise) {
            return this.pendingPromise;
        }

        // Schedule execution
        const delay = this.intervalMs - timeSinceLastExecution;
        return new Promise((resolve, reject) => {
            setTimeout(async () => {
                try {
                    this.lastExecution = Date.now();
                    this.pendingPromise = operation();
                    const result = await this.pendingPromise;
                    resolve(result);
                } catch (error) {
                    reject(error);
                } finally {
                    this.pendingPromise = null;
                }
            }, delay);
        });
    }
}

/**
 * Factory for creating common async optimization patterns
 */
export class AsyncOptimizerFactory {
    /**
     * Create a batcher for DOM operations
     */
    static createDOMBatcher<T>(
        processor: (items: T[]) => Promise<void[]>
    ): AsyncBatcher<T, void> {
        return new AsyncBatcher(processor, {
            batchSize: 10,
            delayMs: 16, // ~60fps
            maxWaitMs: 100
        });
    }

    /**
     * Create a batcher for API requests
     */
    static createAPIBatcher<T, R>(
        processor: (items: T[]) => Promise<R[]>
    ): AsyncBatcher<T, R> {
        return new AsyncBatcher(processor, {
            batchSize: 5,
            delayMs: 50,
            maxWaitMs: 500
        });
    }

    /**
     * Create a parallel executor for I/O operations
     */
    static createIOExecutor(): ParallelExecutor {
        return new ParallelExecutor();
    }

    /**
     * Create a debouncer for user input
     */
    static createInputDebouncer<T>(): AsyncDebouncer<T> {
        return new AsyncDebouncer<T>(300); // 300ms delay
    }

    /**
     * Create a throttler for API calls
     */
    static createAPIThrottler<T>(): AsyncThrottler<T> {
        return new AsyncThrottler<T>(1000); // 1 second interval
    }
}