/**
 * @file RequestManager.ts
 * 
 * Request Manager service for handling AI request queuing and processing.
 * Extracted from AIDispatcher to follow single responsibility principle.
 */

import { IRequestManager, AIRequest, QueueStatus, IEventBus } from '../interfaces';
import { Message, CompletionOptions } from '../../types';

export interface QueuedRequest extends AIRequest {
    resolve: (value: void) => void;
    reject: (error: Error) => void;
}

/**
 * Manages AI request queuing, prioritization, and processing
 */
export class RequestManager implements IRequestManager {
    private requestQueue: QueuedRequest[] = [];
    private isProcessingQueue = false;
    private readonly MAX_QUEUE_SIZE = 100;
    private totalProcessed = 0;
    private processingTimes: number[] = [];

    constructor(private eventBus: IEventBus) {
        this.startQueueProcessor();
    }

    /**
     * Queues a request for processing
     */
    async queueRequest(request: AIRequest): Promise<void> {
        if (this.requestQueue.length >= this.MAX_QUEUE_SIZE) {
            const error = new Error('Request queue is full. Please try again later.');
            this.eventBus.publish('request.queue.full', {
                queueSize: this.requestQueue.length,
                maxSize: this.MAX_QUEUE_SIZE,
                timestamp: Date.now()
            });
            throw error;
        }

        return new Promise((resolve, reject) => {
            const queuedRequest: QueuedRequest = {
                ...request,
                resolve,
                reject
            };

            this.requestQueue.push(queuedRequest);
            this.requestQueue.sort((a, b) => b.priority - a.priority); // Higher priority first

            this.eventBus.publish('request.queued', {
                requestId: request.id,
                queueSize: this.requestQueue.length,
                priority: request.priority,
                timestamp: Date.now()
            });
        });
    }

    /**
     * Processes the request queue
     */
    async processQueue(): Promise<void> {
        if (this.isProcessingQueue || this.requestQueue.length === 0) {
            return;
        }

        this.isProcessingQueue = true;

        try {
            while (this.requestQueue.length > 0) {
                const request = this.requestQueue.shift()!;
                const startTime = Date.now();

                try {
                    await this.processRequest(request);
                    request.resolve();
                    
                    const processingTime = Date.now() - startTime;
                    this.recordProcessingTime(processingTime);
                    this.totalProcessed++;

                    this.eventBus.publish('request.processed', {
                        requestId: request.id,
                        processingTime,
                        queueSize: this.requestQueue.length,
                        timestamp: Date.now()
                    });
                } catch (error: any) {
                    request.reject(error);
                    
                    this.eventBus.publish('request.failed', {
                        requestId: request.id,
                        error: error.message,
                        queueSize: this.requestQueue.length,
                        timestamp: Date.now()
                    });
                }
            }
        } finally {
            this.isProcessingQueue = false;
        }
    }

    /**
     * Gets the current queue status
     */
    getQueueStatus(): QueueStatus {
        return {
            queueLength: this.requestQueue.length,
            processing: this.isProcessingQueue,
            averageWaitTime: this.calculateAverageProcessingTime(),
            totalProcessed: this.totalProcessed
        };
    }

    /**
     * Aborts a specific request
     */
    abortRequest(requestId: string): void {
        const index = this.requestQueue.findIndex(req => req.id === requestId);
        if (index !== -1) {
            const request = this.requestQueue.splice(index, 1)[0];
            request.reject(new Error('Request aborted'));
            
            this.eventBus.publish('request.aborted', {
                requestId,
                queueSize: this.requestQueue.length,
                timestamp: Date.now()
            });
        }
    }

    /**
     * Aborts all pending requests
     */
    abortAllRequests(): void {
        const abortedCount = this.requestQueue.length;
        
        while (this.requestQueue.length > 0) {
            const request = this.requestQueue.shift()!;
            request.reject(new Error('All requests aborted'));
        }

        this.eventBus.publish('request.all_aborted', {
            abortedCount,
            timestamp: Date.now()
        });
    }

    /**
     * Gets queue statistics
     */
    getQueueStats(): {
        currentSize: number;
        maxSize: number;
        totalProcessed: number;
        averageProcessingTime: number;
        isProcessing: boolean;
    } {
        return {
            currentSize: this.requestQueue.length,
            maxSize: this.MAX_QUEUE_SIZE,
            totalProcessed: this.totalProcessed,
            averageProcessingTime: this.calculateAverageProcessingTime(),
            isProcessing: this.isProcessingQueue
        };
    }

    /**
     * Starts the queue processor
     */
    private startQueueProcessor(): void {
        setInterval(() => {
            if (!this.isProcessingQueue && this.requestQueue.length > 0) {
                this.processQueue().catch(error => {
                    console.error('[RequestManager] Queue processing error:', error);
                    this.eventBus.publish('request.queue.error', {
                        error: error.message,
                        timestamp: Date.now()
                    });
                });
            }
        }, 1000); // Check every second
    }

    /**
     * Processes a single request (to be implemented by integrating with other services)
     */
    private async processRequest(request: QueuedRequest): Promise<void> {
        // This will be implemented when we integrate with other services
        // For now, emit an event that other services can listen to
        this.eventBus.publish('request.processing', {
            requestId: request.id,
            messages: request.messages,
            options: request.options,
            provider: request.provider,
            timestamp: Date.now()
        });

        // Simulate processing time for now
        await new Promise(resolve => setTimeout(resolve, 100));
    }

    /**
     * Records processing time for statistics
     */
    private recordProcessingTime(time: number): void {
        this.processingTimes.push(time);
        
        // Keep only the last 100 processing times for rolling average
        if (this.processingTimes.length > 100) {
            this.processingTimes.shift();
        }
    }

    /**
     * Calculates average processing time
     */
    private calculateAverageProcessingTime(): number {
        if (this.processingTimes.length === 0) {
            return 0;
        }
        
        const sum = this.processingTimes.reduce((acc, time) => acc + time, 0);
        return sum / this.processingTimes.length;
    }

    /**
     * Cleanup method for disposing the service
     */
    dispose(): void {
        this.abortAllRequests();
        this.processingTimes = [];
        this.totalProcessed = 0;
    }
}