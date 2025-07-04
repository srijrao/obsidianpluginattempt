/**
 * @file streamManager.ts
 * 
 * Advanced stream management system for the AI Assistant plugin.
 * Provides efficient stream handling, resource management, and flow control.
 */

import { EventEmitter } from 'events';
import { errorHandler } from './errorHandler';
import { LRUCache } from './lruCache';

export interface StreamOptions {
    highWaterMark?: number;
    objectMode?: boolean;
    autoDestroy?: boolean;
    timeout?: number;
    retryAttempts?: number;
    backpressureThreshold?: number;
}

export interface StreamMetrics {
    bytesRead: number;
    bytesWritten: number;
    chunksProcessed: number;
    errors: number;
    startTime: number;
    endTime?: number;
    duration?: number;
    throughput?: number;
}

export interface StreamState {
    id: string;
    status: 'idle' | 'active' | 'paused' | 'error' | 'completed' | 'destroyed';
    metrics: StreamMetrics;
    options: StreamOptions;
    createdAt: number;
    lastActivity: number;
}

export type StreamTransform<T, U> = (chunk: T, encoding?: string) => U | Promise<U>;
export type StreamFilter<T> = (chunk: T) => boolean | Promise<boolean>;
export type StreamErrorHandler = (error: Error, streamId: string) => void;

/**
 * Advanced Stream Manager with resource pooling and flow control
 */
export class StreamManager extends EventEmitter {
    private streams = new Map<string, StreamState>();
    private transformers = new Map<string, StreamTransform<any, any>>();
    private filters = new Map<string, StreamFilter<any>>();
    private streamCache: LRUCache<ReadableStream>;
    private activeStreams = new Set<string>();
    private pausedStreams = new Set<string>();
    private streamPool: ReadableStream[] = [];
    private maxConcurrentStreams: number;
    private defaultTimeout: number;
    private isDisposed = false;

    constructor(options: {
        maxConcurrentStreams?: number;
        defaultTimeout?: number;
        cacheSize?: number;
    } = {}) {
        super();
        this.maxConcurrentStreams = options.maxConcurrentStreams || 10;
        this.defaultTimeout = options.defaultTimeout || 30000;
        
        this.streamCache = new LRUCache<ReadableStream>({
            maxSize: options.cacheSize || 50,
            defaultTTL: 5 * 60 * 1000, // 5 minutes
            onEvict: (key, stream) => this.destroyStream(key)
        });

        this.setupCleanupInterval();
    }

    /**
     * Create a new managed stream
     */
    createStream<T>(
        id: string,
        source: ReadableStream<T> | (() => ReadableStream<T>),
        options: StreamOptions = {}
    ): ManagedStream<T> {
        if (this.isDisposed) {
            throw new Error('Cannot create stream on disposed StreamManager');
        }

        if (this.streams.has(id)) {
            throw new Error(`Stream with id '${id}' already exists`);
        }

        if (this.activeStreams.size >= this.maxConcurrentStreams) {
            throw new Error(`Maximum concurrent streams (${this.maxConcurrentStreams}) reached`);
        }

        const streamState: StreamState = {
            id,
            status: 'idle',
            metrics: {
                bytesRead: 0,
                bytesWritten: 0,
                chunksProcessed: 0,
                errors: 0,
                startTime: Date.now(),
            },
            options: {
                timeout: this.defaultTimeout,
                retryAttempts: 3,
                backpressureThreshold: 16384, // 16KB
                ...options
            },
            createdAt: Date.now(),
            lastActivity: Date.now()
        };

        this.streams.set(id, streamState);

        const actualSource = typeof source === 'function' ? source() : source;
        const managedStream = new ManagedStream(id, actualSource, this, streamState);

        this.streamCache.set(id, actualSource);
        this.emit('streamCreated', id, streamState);

        return managedStream;
    }

    /**
     * Get a stream by ID
     */
    getStream(id: string): ManagedStream<any> | null {
        const state = this.streams.get(id);
        const source = this.streamCache.get(id);
        
        if (!state || !source) {
            return null;
        }

        return new ManagedStream(id, source, this, state);
    }

    /**
     * Pause a stream
     */
    pauseStream(id: string): boolean {
        const state = this.streams.get(id);
        if (!state || state.status !== 'active') {
            return false;
        }

        state.status = 'paused';
        state.lastActivity = Date.now();
        this.activeStreams.delete(id);
        this.pausedStreams.add(id);
        
        this.emit('streamPaused', id);
        return true;
    }

    /**
     * Resume a paused stream
     */
    resumeStream(id: string): boolean {
        const state = this.streams.get(id);
        if (!state || state.status !== 'paused') {
            return false;
        }

        if (this.activeStreams.size >= this.maxConcurrentStreams) {
            return false; // Cannot resume due to concurrency limit
        }

        state.status = 'active';
        state.lastActivity = Date.now();
        this.pausedStreams.delete(id);
        this.activeStreams.add(id);
        
        this.emit('streamResumed', id);
        return true;
    }

    /**
     * Destroy a stream
     */
    destroyStream(id: string): boolean {
        const state = this.streams.get(id);
        if (!state) {
            return false;
        }

        try {
            state.status = 'destroyed';
            state.metrics.endTime = Date.now();
            state.metrics.duration = state.metrics.endTime - state.metrics.startTime;
            
            this.activeStreams.delete(id);
            this.pausedStreams.delete(id);
            this.streams.delete(id);
            this.streamCache.delete(id);
            
            this.emit('streamDestroyed', id, state);
            return true;
        } catch (error) {
            errorHandler.handleError(error, {
                component: 'StreamManager',
                operation: 'destroyStream',
                metadata: { streamId: id }
            });
            return false;
        }
    }

    /**
     * Register a transformer for streams
     */
    registerTransformer<T, U>(name: string, transformer: StreamTransform<T, U>): void {
        this.transformers.set(name, transformer);
    }

    /**
     * Register a filter for streams
     */
    registerFilter<T>(name: string, filter: StreamFilter<T>): void {
        this.filters.set(name, filter);
    }

    /**
     * Get transformer by name
     */
    getTransformer<T, U>(name: string): StreamTransform<T, U> | undefined {
        return this.transformers.get(name);
    }

    /**
     * Get filter by name
     */
    getFilter<T>(name: string): StreamFilter<T> | undefined {
        return this.filters.get(name);
    }

    /**
     * Get all stream states
     */
    getAllStreams(): StreamState[] {
        return Array.from(this.streams.values());
    }

    /**
     * Get active streams
     */
    getActiveStreams(): StreamState[] {
        return Array.from(this.activeStreams).map(id => this.streams.get(id)!);
    }

    /**
     * Get stream statistics
     */
    getStats(): {
        totalStreams: number;
        activeStreams: number;
        pausedStreams: number;
        completedStreams: number;
        errorStreams: number;
        totalBytesProcessed: number;
        averageThroughput: number;
        cacheHitRate: number;
    } {
        const states = Array.from(this.streams.values());
        const totalBytesProcessed = states.reduce((sum, state) => 
            sum + state.metrics.bytesRead + state.metrics.bytesWritten, 0);
        
        const completedStreams = states.filter(s => s.status === 'completed');
        const averageThroughput = completedStreams.length > 0
            ? completedStreams.reduce((sum, s) => sum + (s.metrics.throughput || 0), 0) / completedStreams.length
            : 0;

        return {
            totalStreams: this.streams.size,
            activeStreams: this.activeStreams.size,
            pausedStreams: this.pausedStreams.size,
            completedStreams: states.filter(s => s.status === 'completed').length,
            errorStreams: states.filter(s => s.status === 'error').length,
            totalBytesProcessed,
            averageThroughput,
            cacheHitRate: this.streamCache.getStats().hitRate || 0
        };
    }

    /**
     * Cleanup inactive streams
     */
    cleanup(maxAge: number = 60000): number {
        const now = Date.now();
        let cleaned = 0;

        for (const [id, state] of this.streams) {
            if (now - state.lastActivity > maxAge && 
                (state.status === 'completed' || state.status === 'error')) {
                this.destroyStream(id);
                cleaned++;
            }
        }

        return cleaned;
    }

    /**
     * Dispose the stream manager
     */
    dispose(): void {
        if (this.isDisposed) return;

        // Destroy all streams
        for (const id of this.streams.keys()) {
            this.destroyStream(id);
        }

        // Clear all data
        this.streams.clear();
        this.transformers.clear();
        this.filters.clear();
        this.activeStreams.clear();
        this.pausedStreams.clear();
        this.streamPool.length = 0;
        this.streamCache.destroy();
        this.removeAllListeners();

        this.isDisposed = true;
    }

    private setupCleanupInterval(): void {
        setInterval(() => {
            if (!this.isDisposed) {
                this.cleanup();
            }
        }, 60000); // Cleanup every minute
    }

    updateStreamMetrics(id: string, metrics: Partial<StreamMetrics>): void {
        const state = this.streams.get(id);
        if (state) {
            Object.assign(state.metrics, metrics);
            state.lastActivity = Date.now();
            
            // Calculate throughput if duration is available
            if (state.metrics.duration && state.metrics.duration > 0) {
                const totalBytes = state.metrics.bytesRead + state.metrics.bytesWritten;
                state.metrics.throughput = totalBytes / (state.metrics.duration / 1000); // bytes per second
            }
        }
    }

    updateStreamStatus(id: string, status: StreamState['status']): void {
        const state = this.streams.get(id);
        if (state) {
            const oldStatus = state.status;
            state.status = status;
            state.lastActivity = Date.now();

            // Update active/paused sets
            if (status === 'active' && oldStatus !== 'active') {
                this.activeStreams.add(id);
                this.pausedStreams.delete(id);
            } else if (status === 'paused' && oldStatus !== 'paused') {
                this.activeStreams.delete(id);
                this.pausedStreams.add(id);
            } else if (status === 'completed' || status === 'error' || status === 'destroyed') {
                this.activeStreams.delete(id);
                this.pausedStreams.delete(id);
                
                if (status === 'completed') {
                    state.metrics.endTime = Date.now();
                    state.metrics.duration = state.metrics.endTime - state.metrics.startTime;
                }
            }

            this.emit('streamStatusChanged', id, status, oldStatus);
        }
    }
}

/**
 * Managed Stream wrapper with advanced features
 */
export class ManagedStream<T> extends EventEmitter {
    private reader: ReadableStreamDefaultReader<T> | null = null;
    private isReading = false;
    private backpressureActive = false;

    constructor(
        public readonly id: string,
        private source: ReadableStream<T>,
        private manager: StreamManager,
        private state: StreamState
    ) {
        super();
        this.setupTimeout();
    }

    /**
     * Start reading from the stream
     */
    async start(): Promise<void> {
        if (this.isReading) {
            throw new Error('Stream is already reading');
        }

        try {
            this.manager.updateStreamStatus(this.id, 'active');
            this.reader = this.source.getReader();
            this.isReading = true;

            await this.readLoop();
        } catch (error) {
            this.handleError(error as Error);
        }
    }

    /**
     * Transform stream data
     */
    transform<U>(transformer: StreamTransform<T, U> | string): ManagedStream<U> {
        const actualTransformer = typeof transformer === 'string'
            ? this.manager.getTransformer<T, U>(transformer)
            : transformer;

        if (!actualTransformer) {
            throw new Error(`Transformer not found: ${transformer}`);
        }

        const transformedSource = new ReadableStream<U>({
            start: (controller) => {
                this.on('data', async (chunk: T) => {
                    try {
                        const transformed = await actualTransformer(chunk);
                        controller.enqueue(transformed);
                    } catch (error) {
                        controller.error(error);
                    }
                });

                this.on('end', () => controller.close());
                this.on('error', (error) => controller.error(error));
            }
        });

        return this.manager.createStream(`${this.id}-transformed`, transformedSource, this.state.options);
    }

    /**
     * Filter stream data
     */
    filter(filter: StreamFilter<T> | string): ManagedStream<T> {
        const actualFilter = typeof filter === 'string'
            ? this.manager.getFilter<T>(filter)
            : filter;

        if (!actualFilter) {
            throw new Error(`Filter not found: ${filter}`);
        }

        const filteredSource = new ReadableStream<T>({
            start: (controller) => {
                this.on('data', async (chunk: T) => {
                    try {
                        const shouldInclude = await actualFilter(chunk);
                        if (shouldInclude) {
                            controller.enqueue(chunk);
                        }
                    } catch (error) {
                        controller.error(error);
                    }
                });

                this.on('end', () => controller.close());
                this.on('error', (error) => controller.error(error));
            }
        });

        return this.manager.createStream(`${this.id}-filtered`, filteredSource, this.state.options);
    }

    /**
     * Pause the stream
     */
    pause(): boolean {
        return this.manager.pauseStream(this.id);
    }

    /**
     * Resume the stream
     */
    resume(): boolean {
        return this.manager.resumeStream(this.id);
    }

    /**
     * Destroy the stream
     */
    destroy(): boolean {
        if (this.reader) {
            this.reader.releaseLock();
            this.reader = null;
        }
        this.isReading = false;
        return this.manager.destroyStream(this.id);
    }

    /**
     * Get stream metrics
     */
    getMetrics(): StreamMetrics {
        return { ...this.state.metrics };
    }

    /**
     * Get stream status
     */
    getStatus(): StreamState['status'] {
        return this.state.status;
    }

    private async readLoop(): Promise<void> {
        if (!this.reader) return;

        try {
            while (this.isReading && this.state.status === 'active') {
                const { done, value } = await this.reader.read();

                if (done) {
                    this.manager.updateStreamStatus(this.id, 'completed');
                    this.emit('end');
                    break;
                }

                // Update metrics
                this.state.metrics.chunksProcessed++;
                if (typeof value === 'string') {
                    this.state.metrics.bytesRead += value.length;
                } else if (value instanceof Uint8Array) {
                    this.state.metrics.bytesRead += value.length;
                }

                this.manager.updateStreamMetrics(this.id, this.state.metrics);

                // Check for backpressure
                if (this.state.options.backpressureThreshold &&
                    this.state.metrics.bytesRead > this.state.options.backpressureThreshold &&
                    !this.backpressureActive) {
                    this.backpressureActive = true;
                    this.emit('backpressure');
                    await this.handleBackpressure();
                }

                this.emit('data', value);

                // Yield control to prevent blocking
                await new Promise(resolve => setImmediate(resolve));
            }
        } catch (error) {
            this.handleError(error as Error);
        } finally {
            if (this.reader) {
                this.reader.releaseLock();
                this.reader = null;
            }
            this.isReading = false;
        }
    }

    private async handleBackpressure(): Promise<void> {
        // Simple backpressure handling - pause briefly
        await new Promise(resolve => setTimeout(resolve, 100));
        this.backpressureActive = false;
    }

    private handleError(error: Error): void {
        this.state.metrics.errors++;
        this.manager.updateStreamStatus(this.id, 'error');
        this.manager.updateStreamMetrics(this.id, this.state.metrics);
        
        errorHandler.handleError(error, {
            component: 'ManagedStream',
            operation: 'readLoop',
            metadata: { streamId: this.id }
        });

        this.emit('error', error);
    }

    private setupTimeout(): void {
        if (this.state.options.timeout) {
            setTimeout(() => {
                if (this.state.status === 'active' || this.state.status === 'idle') {
                    this.handleError(new Error(`Stream timeout after ${this.state.options.timeout}ms`));
                }
            }, this.state.options.timeout);
        }
    }
}

/**
 * Global stream manager instance
 */
export const globalStreamManager = new StreamManager();

/**
 * Stream utilities
 */
export class StreamUtils {
    /**
     * Create a stream from an array
     */
    static fromArray<T>(items: T[]): ReadableStream<T> {
        let index = 0;
        
        return new ReadableStream<T>({
            pull(controller) {
                if (index < items.length) {
                    controller.enqueue(items[index++]);
                } else {
                    controller.close();
                }
            }
        });
    }

    /**
     * Create a stream from a generator
     */
    static fromGenerator<T>(generator: Generator<T>): ReadableStream<T> {
        return new ReadableStream<T>({
            pull(controller) {
                const { done, value } = generator.next();
                if (done) {
                    controller.close();
                } else {
                    controller.enqueue(value);
                }
            }
        });
    }

    /**
     * Merge multiple streams
     */
    static merge<T>(...streams: ReadableStream<T>[]): ReadableStream<T> {
        return new ReadableStream<T>({
            start(controller) {
                let activeStreams = streams.length;

                streams.forEach(stream => {
                    const reader = stream.getReader();
                    
                    const pump = async () => {
                        try {
                            while (true) {
                                const { done, value } = await reader.read();
                                if (done) {
                                    activeStreams--;
                                    if (activeStreams === 0) {
                                        controller.close();
                                    }
                                    break;
                                }
                                controller.enqueue(value);
                            }
                        } catch (error) {
                            controller.error(error);
                        } finally {
                            reader.releaseLock();
                        }
                    };

                    pump();
                });
            }
        });
    }

    /**
     * Convert stream to array
     */
    static async toArray<T>(stream: ReadableStream<T>): Promise<T[]> {
        const reader = stream.getReader();
        const chunks: T[] = [];

        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                chunks.push(value);
            }
        } finally {
            reader.releaseLock();
        }

        return chunks;
    }
}