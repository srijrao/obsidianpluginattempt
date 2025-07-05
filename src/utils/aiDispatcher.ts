import { Vault } from 'obsidian';
import { Message, CompletionOptions, UnifiedModel } from '../types';
import { BaseProvider } from '../../providers/base';
import { createProvider, createProviderFromUnifiedModel, getAllAvailableModels } from '../../providers';
import { saveAICallToFolder } from './saveAICalls';
import { debugLog } from './logger';
import type { MyPluginSettings } from '../types';
import { MessageContextPool, PreAllocatedArrays } from './objectPool';
import { LRUCache, LRUCacheFactory } from './lruCache';
import { errorHandler, handleAIDispatcherError, withErrorHandling } from './errorHandler';
import { AsyncBatcher, ParallelExecutor, AsyncOptimizerFactory } from './asyncOptimizer';
import { performanceMonitor } from './performanceMonitor';
import {
    isValidProviderName,
    ValidProviderName,
    isValidMessagesArray,
    isValidMessage,
    isNonEmptyString
} from './typeGuards';
import { sanitizeInput, validateContentLength } from './validationUtils';

// Types for new features
interface CacheEntry {
    response: string;
    timestamp: number;
    ttl: number;
}

interface BatchedRequest {
    messages: Message[];
    options: CompletionOptions;
    providerOverride?: string;
}

interface RequestMetrics {
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    totalTokens: number;
    totalCost: number;
    averageResponseTime: number;
    requestsByProvider: Record<string, number>;
    errorsByProvider: Record<string, number>;
    cacheHits: number;
    cacheMisses: number;
    deduplicatedRequests: number;
}

interface CircuitBreakerState {
    isOpen: boolean;
    failureCount: number;
    lastFailureTime: number;
    nextRetryTime: number;
}

interface QueuedRequest {
    id: string;
    messages: Message[];
    options: CompletionOptions;
    providerType?: string;
    resolve: (value: void) => void;
    reject: (error: Error) => void;
    priority: number;
    timestamp: number;
}

interface PendingRequest {
    promise: Promise<void>;
    timestamp: number;
}

/**
 * Central AI Dispatcher
 * 
 * This class handles all AI requests, routes them to the correct provider,
 * automatically saves each request/response to the vault, and manages models.
 * 
 * Features:
 * - Centralized request handling
 * - Automatic request/response logging
 * - Provider abstraction
 * - Model management (refresh, get available models, etc.)
 * - Request/Response caching with TTL
 * - Rate limiting and throttling
 * - Request analytics and metrics
 * - Retry logic with circuit breaker
 * - Request validation and preprocessing
 * - Centralized streaming management
 * - Error handling
 */
export class AIDispatcher {
    // Priority 2 Optimization: LRU Cache with size limits
    private cache: LRUCache<string>;
    private modelCache: LRUCache<UnifiedModel[]>;
    private providerCache: LRUCache<string[]>;
    
    private metrics: RequestMetrics = {
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        totalTokens: 0,
        totalCost: 0,
        averageResponseTime: 0,
        requestsByProvider: {},
        errorsByProvider: {},
        cacheHits: 0,
        cacheMisses: 0,
        deduplicatedRequests: 0
    };
    private circuitBreakers = new Map<string, CircuitBreakerState>();
    private requestQueue: QueuedRequest[] = [];
    private activeStreams = new Map<string, AbortController>();
    private rateLimits = new Map<string, { requests: number; resetTime: number }>();
    private isProcessingQueue = false;

    // Priority 1 Optimization: Request deduplication with LRU
    private pendingRequests: LRUCache<Promise<void>>;
    private readonly DEDUP_TTL = 30 * 1000; // 30 seconds

    // Memory optimization: Object pools
    private messagePool: MessageContextPool;
    private arrayManager: PreAllocatedArrays;

    // Priority 2 Optimization: Async optimization
    private requestBatcher: AsyncBatcher<BatchedRequest, void>;
    private parallelExecutor: ParallelExecutor;

    // Configuration
    private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes
    private readonly CIRCUIT_BREAKER_THRESHOLD = 5;
    private readonly CIRCUIT_BREAKER_TIMEOUT = 30 * 1000; // 30 seconds
    private readonly RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
    private readonly MAX_QUEUE_SIZE = 100;
    private readonly CACHE_MAX_SIZE = 200; // Maximum cache entries

    constructor(
        private vault: Vault,
        private plugin: { settings: MyPluginSettings; saveSettings: () => Promise<void> }
    ) {
        // Set debug mode for performance monitor
        performanceMonitor.setDebugMode(this.plugin.settings.debugMode ?? false);

        // Initialize circuit breakers
        ['openai', 'anthropic', 'gemini', 'ollama'].forEach(provider => {
            this.circuitBreakers.set(provider, {
                isOpen: false,
                failureCount: 0,
                lastFailureTime: 0,
                nextRetryTime: 0
            });
        });

        // Priority 2 Optimization: Initialize LRU caches
        this.cache = LRUCacheFactory.createResponseCache(this.CACHE_MAX_SIZE);
        this.modelCache = new LRUCache<UnifiedModel[]>({
            maxSize: 10,
            defaultTTL: 30 * 60 * 1000, // 30 minutes
        });
        this.providerCache = new LRUCache<string[]>({
            maxSize: 20,
            defaultTTL: 15 * 60 * 1000, // 15 minutes
        });
        this.pendingRequests = new LRUCache<Promise<void>>({
            maxSize: 100,
            defaultTTL: this.DEDUP_TTL,
        });

        // Initialize memory optimization components
        this.messagePool = MessageContextPool.getInstance();
        this.arrayManager = PreAllocatedArrays.getInstance();

        // Priority 2 Optimization: Initialize async optimizers
        this.requestBatcher = AsyncOptimizerFactory.createAPIBatcher(
            async (requests: BatchedRequest[]) => {
                const results: void[] = [];
                for (const request of requests) {
                    try {
                        await this.executeWithRetry(request.messages, request.options,
                            this.determineProvider(request.providerOverride),
                            this.generateCacheKey(request.messages, request.options, request.providerOverride));
                        results.push();
                    } catch (error) {
                        handleAIDispatcherError(error, 'batchedRequest', { requestCount: requests.length });
                        results.push();
                    }
                }
                return results;
            }
        );
        this.parallelExecutor = AsyncOptimizerFactory.createIOExecutor();

        // Start queue processor
        this.startQueueProcessor();
        
        // Priority 1 Optimization: Start cleanup for expired pending requests
        this.startPendingRequestCleanup();
    }

    /**
     * Priority 1 Optimization: Clean up expired pending requests
     */
    private startPendingRequestCleanup(): void {
        setInterval(() => {
            // LRU cache handles TTL automatically, just trigger cleanup
            this.pendingRequests.cleanup();
        }, this.DEDUP_TTL); // Clean up every 30 seconds
    }

    /**
     * Makes an AI completion request through the appropriate provider.
     * Automatically saves the request and response to the vault.
     * Includes caching, rate limiting, retry logic, and validation.
     * 
     * @param messages - The conversation messages to send
     * @param options - Completion options (temperature, etc.)
     * @param providerOverride - Optional specific provider to use instead of default
     * @param priority - Request priority (higher = processed first)
     * @returns Promise that resolves when the completion is finished
     */
    getCompletion(
        messages: Message[],
        options: CompletionOptions,
        providerOverride?: string,
        priority: number = 0
    ): Promise<void> {
        return (async () => {
            // Validate request
            this.validateRequest(messages, options);

            // Generate cache key
            const cacheKey = this.generateCacheKey(messages, options, providerOverride);
            
            // Priority 1 Optimization: Check for duplicate requests
            const existingRequest = this.pendingRequests.get(cacheKey);
            if (existingRequest) {
                this.metrics.deduplicatedRequests++;
                performanceMonitor.recordMetric('deduplicated_requests', 1, 'count');
                debugLog(this.plugin.settings.debugMode ?? false, 'info', '[AIDispatcher] Deduplicating request', { key: cacheKey });
                return existingRequest;
            }
            
            // Check cache first
            const cachedResponse = this.cache.get(cacheKey);
            if (cachedResponse && options.streamCallback) {
                this.metrics.cacheHits++;
                performanceMonitor.recordMetric('cache_hits', 1, 'count');
                debugLog(this.plugin.settings.debugMode ?? false, 'info', '[AIDispatcher] Cache hit', { key: cacheKey });
                options.streamCallback(cachedResponse);
                return Promise.resolve();
            } else {
                this.metrics.cacheMisses++;
                performanceMonitor.recordMetric('cache_misses', 1, 'count');
                debugLog(this.plugin.settings.debugMode ?? false, 'info', '[AIDispatcher] Cache miss', { key: cacheKey });
            }

            // Determine provider
            const providerName = this.determineProvider(providerOverride);
            
            // Check circuit breaker
            if (this.isCircuitBreakerOpen(providerName)) {
                throw new Error(`Provider ${providerName} is temporarily unavailable (circuit breaker open)`);
            }

            // Check rate limits
            if (this.isRateLimited(providerName)) {
                // Queue the request
                return this.queueRequest(messages, options, providerOverride, priority);
            }

            // Create and track the request promise
            const requestPromise = this.executeWithRetry(messages, options, providerName, cacheKey);
            this.pendingRequests.set(cacheKey, requestPromise);

            // Clean up after completion
            requestPromise.finally(() => {
                this.pendingRequests.delete(cacheKey);
            });

            return requestPromise;
        })();
    }

    /**
     * Validates request format and content with enhanced security using comprehensive type guards.
     */
    private validateRequest(messages: Message[], options: CompletionOptions): void {
        const MAX_TOTAL_MESSAGE_LENGTH = 50000; // Max total characters for all messages combined

        // Use type guards for comprehensive validation
        if (!Array.isArray(messages) || messages.length === 0) {
            throw new Error('Messages array is required and cannot be empty');
        }

        let totalMessageLength = 0;

        // Validate each message using type guards
        for (let i = 0; i < messages.length; i++) {
            const message = messages[i];
            
            // Basic message structure validation
            if (!message || typeof message !== 'object') {
                throw new Error(`Invalid message at index ${i}: Message must be an object`);
            }

            if (!message.role || typeof message.role !== 'string') {
                throw new Error(`Invalid message at index ${i}: Message role is required and must be a string`);
            }

            if (!message.content || typeof message.content !== 'string') {
                throw new Error(`Invalid message at index ${i}: Message content is required and must be a string`);
            }

            // Validate role values
            if (!['system', 'user', 'assistant'].includes(message.role)) {
                throw new Error(`Invalid message role at index ${i}: ${message.role}. Must be 'system', 'user', or 'assistant'`);
            }
            
            // Validate individual message content length
            try {
                validateContentLength(message.content, 10000); // Max per message
                totalMessageLength += message.content.length;
            } catch (error) {
                throw new Error(`Message content validation failed at index ${i}: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
        }

        // Enforce total message length limit
        if (totalMessageLength > MAX_TOTAL_MESSAGE_LENGTH) {
            throw new Error(`Total message content length (${totalMessageLength}) exceeds limit of ${MAX_TOTAL_MESSAGE_LENGTH} characters`);
        }

        // Enhanced options validation with comprehensive type checking
        if (options.temperature !== undefined) {
            if (typeof options.temperature !== 'number' || isNaN(options.temperature)) {
                throw new Error('Temperature must be a valid number');
            }
            if (options.temperature < 0 || options.temperature > 2) {
                throw new Error('Temperature must be between 0 and 2');
            }
        }

        // Validate stream callback if provided
        if (options.streamCallback !== undefined && typeof options.streamCallback !== 'function') {
            throw new Error('Stream callback must be a function');
        }

        // Apply content filtering and sanitization
        this.sanitizeMessages(messages);
        
        debugLog(this.plugin.settings.debugMode ?? false, 'debug', '[AIDispatcher] Request validation completed successfully', {
            messageCount: messages.length,
            totalLength: totalMessageLength
        });
    }

    /**
     * Sanitizes message content for safety using enhanced validation.
     */
    private sanitizeMessages(messages: Message[]): void {
        const MAX_MESSAGE_LENGTH = 10000; // Max characters per message content

        for (const message of messages) {
            try {
                // Validate and sanitize content length
                message.content = validateContentLength(message.content, MAX_MESSAGE_LENGTH);
                
                // Apply comprehensive sanitization
                message.content = sanitizeInput(message.content);
                
                debugLog(this.plugin.settings.debugMode ?? false, 'debug', '[AIDispatcher] Message content sanitized successfully');
            } catch (error) {
                debugLog(this.plugin.settings.debugMode ?? false, 'warn', '[AIDispatcher] Message content sanitization failed:', error);
                
                // Fallback to basic sanitization if enhanced validation fails
                message.content = message.content.trim();
                if (message.content.length > MAX_MESSAGE_LENGTH) {
                    message.content = message.content.substring(0, MAX_MESSAGE_LENGTH);
                }
                
                // Basic sanitization as fallback
                message.content = message.content
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;')
                    .replace(/&/g, '&amp;')
                    .replace(/"/g, '&quot;')
                    .replace(/'/g, '&#039;');
            }
        }
    }


    /**
     * Generates a cache key for the request.
     * Uses base64 encoding that supports Unicode (so it won't throw on non-Latin1 chars).
     * Optimized to use object pooling for reduced memory allocations.
     */
    private generateCacheKey(messages: Message[], options: CompletionOptions, providerOverride?: string): string {
        // Use pre-allocated array for message mapping to reduce allocations
        const messageArray = this.arrayManager.getArray<{role: string, content: string}>(messages.length);
        
        try {
            // Map messages using pooled objects
            for (let i = 0; i < messages.length; i++) {
                const pooledMsg = this.messagePool.acquireMessage();
                pooledMsg.role = messages[i].role;
                pooledMsg.content = messages[i].content;
                messageArray[i] = pooledMsg;
            }

            const key = JSON.stringify({
                messages: messageArray,
                temperature: options.temperature,
                provider: providerOverride || this.plugin.settings.selectedModel || this.plugin.settings.provider
            });

            // Use Unicode-safe base64 encoding
            function btoaUnicode(str: string) {
                // First encode to UTF-8, then to base64
                return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, function(match, p1) {
                    return String.fromCharCode(parseInt(p1, 16));
                }));
            }
            
            return btoaUnicode(key).substring(0, 32);
        } finally {
            // Return pooled objects
            for (let i = 0; i < messageArray.length; i++) {
                if (messageArray[i]) {
                    this.messagePool.releaseMessage(messageArray[i]);
                }
            }
            // Return array to pool
            this.arrayManager.returnArray(messageArray);
        }
    }

    /**
     * Gets response from cache if available and not expired.
     */
    private getFromCache(cacheKey: string): string | null {
        const response = this.cache.get(cacheKey);
        if (response) {
            debugLog(this.plugin.settings.debugMode ?? false, 'info', '[AIDispatcher] Cache hit', { key: cacheKey });
        }
        return response || null;
    }

    /**
     * Stores response in cache.
     */
    private setCache(cacheKey: string, response: string, ttl: number = this.CACHE_TTL): void {
        this.cache.set(cacheKey, response, ttl);
        debugLog(this.plugin.settings.debugMode ?? false, 'info', '[AIDispatcher] Response cached', { key: cacheKey });
    }

    /**
     * Determines which provider to use.
     */
    private determineProvider(providerOverride?: string): string {
        if (providerOverride) return providerOverride;
        if (this.plugin.settings.selectedModel) {
            return this.plugin.settings.selectedModel.split(':')[0];
        }
        return this.plugin.settings.provider;
    }

    /**
     * Checks if circuit breaker is open for provider.
     */
    private isCircuitBreakerOpen(providerName: string): boolean {
        const breaker = this.circuitBreakers.get(providerName);
        if (!breaker) return false;

        if (breaker.isOpen) {
            if (Date.now() > breaker.nextRetryTime) {
                // Reset circuit breaker
                breaker.isOpen = false;
                breaker.failureCount = 0;
                debugLog(this.plugin.settings.debugMode ?? false, 'info', '[AIDispatcher] Circuit breaker reset', { provider: providerName });
            }
        }

        return breaker.isOpen;
    }

    /**
     * Records failure for circuit breaker.
     */
    private recordFailure(providerName: string): void {
        const breaker = this.circuitBreakers.get(providerName);
        if (!breaker) return;

        breaker.failureCount++;
        breaker.lastFailureTime = Date.now();

        if (breaker.failureCount >= this.CIRCUIT_BREAKER_THRESHOLD) {
            breaker.isOpen = true;
            breaker.nextRetryTime = Date.now() + this.CIRCUIT_BREAKER_TIMEOUT;
            debugLog(this.plugin.settings.debugMode ?? false, 'warn', '[AIDispatcher] Circuit breaker opened', { 
                provider: providerName, 
                failures: breaker.failureCount 
            });
        }
    }

    /**
     * Records success for circuit breaker.
     */
    private recordSuccess(providerName: string): void {
        const breaker = this.circuitBreakers.get(providerName);
        if (!breaker) return;

        // If the retry time has passed, fully close the breaker
        if (breaker.isOpen && Date.now() > breaker.nextRetryTime) {
            breaker.isOpen = false;
            breaker.failureCount = 0;
        } else {
            breaker.failureCount = Math.max(0, breaker.failureCount - 1);
        }
    }

    /**
     * Checks if provider is rate limited.
     */
    private isRateLimited(providerName: string): boolean {
        const limit = this.rateLimits.get(providerName);
        if (!limit) return false;

        if (Date.now() > limit.resetTime) {
            this.rateLimits.delete(providerName);
            return false;
        }

        // Provider-specific rate limits
        const maxRequests = this.getProviderRateLimit(providerName);
        return limit.requests >= maxRequests;
    }

    /**
     * Gets rate limit for provider.
     */
    private getProviderRateLimit(providerName: string): number {
        switch (providerName) {
            case 'openai': return 60; // 60 requests per minute
            case 'anthropic': return 50;
            case 'gemini': return 60;
            case 'ollama': return 100; // Local, more generous
            default: return 60;
        }
    }

    /**
     * Records request for rate limiting.
     */
    private recordRequest(providerName: string): void {
        const limit = this.rateLimits.get(providerName) || { requests: 0, resetTime: Date.now() + this.RATE_LIMIT_WINDOW };
        limit.requests++;
        this.rateLimits.set(providerName, limit);
    }

    /**
     * Queues request for later processing.
     */
    private async queueRequest(
        messages: Message[],
        options: CompletionOptions,
        providerOverride?: string,
        priority: number = 0
    ): Promise<void> {
        if (this.requestQueue.length >= this.MAX_QUEUE_SIZE) {
            throw new Error('Request queue is full. Please try again later.');
        }

        return new Promise((resolve, reject) => {
            const request: QueuedRequest = {
                id: Math.random().toString(36).substr(2, 9),
                messages,
                options,
                providerType: providerOverride,
                resolve,
                reject,
                priority,
                timestamp: Date.now()
            };

            this.requestQueue.push(request);
            this.requestQueue.sort((a, b) => b.priority - a.priority); // Higher priority first

            debugLog(this.plugin.settings.debugMode ?? false, 'info', '[AIDispatcher] Request queued', { 
                id: request.id, 
                queueSize: this.requestQueue.length 
            });
        });
    }

    /**
     * Starts the queue processor.
     */
    private startQueueProcessor(): void {
        setInterval(() => {
            if (!this.isProcessingQueue && this.requestQueue.length > 0) {
                this.processQueue();
            }
        }, 1000); // Check every second
    }

    /**
     * Processes queued requests.
     */
    private async processQueue(): Promise<void> {
        if (this.isProcessingQueue) return;
        this.isProcessingQueue = true;

        try {
            while (this.requestQueue.length > 0) {
                const request = this.requestQueue.shift()!;
                const providerName = this.determineProvider(request.providerType);

                if (!this.isRateLimited(providerName) && !this.isCircuitBreakerOpen(providerName)) {
                    try {
                        await this.executeRequest(request);
                    } catch (error) {
                        request.reject(error);
                    }
                } else {
                    // Put back at front of queue
                    this.requestQueue.unshift(request);
                    break;
                }
            }
        } finally {
            this.isProcessingQueue = false;
        }
    }

    /**
     * Executes a queued request.
     */
    private async executeRequest(request: QueuedRequest): Promise<void> {
        const providerName = this.determineProvider(request.providerType);
        const cacheKey = this.generateCacheKey(request.messages, request.options, request.providerType);
        
        try {
            await this.executeWithRetry(request.messages, request.options, providerName, cacheKey);
            request.resolve();
        } catch (error) {
            request.reject(error);
        }
    }

    private async executeWithRetry(
        messages: Message[],
        options: CompletionOptions,
        providerName: string,
        cacheKey: string,
        retryCount: number = 0
    ): Promise<void> {
        const startTime = Date.now();
        let provider: BaseProvider;
        let fullResponse = '';
        let abortController: AbortController;

        try {
            // Create provider
            if (this.plugin.settings.selectedModel) {
                provider = createProviderFromUnifiedModel(this.plugin.settings, this.plugin.settings.selectedModel);
            } else {
                if (!isValidProviderName(providerName)) {
                    throw new Error(`Invalid provider name: ${providerName}`);
                }
                const tempSettings = { ...this.plugin.settings, provider: providerName as ValidProviderName };
                provider = createProvider(tempSettings);
            }

            // Record request for rate limiting
            this.recordRequest(providerName);

            // Create abort controller for this request
            const streamId = Math.random().toString(36).substr(2, 9);
            abortController = new AbortController();
            this.activeStreams.set(streamId, abortController);

            // Prepare request data for logging
            const requestData = {
                provider: providerName,
                model: this.plugin.settings.selectedModel || 'default',
                messages: messages,
                options: options,
                timestamp: new Date().toISOString()
            };

            // Wrap the stream callback to capture the full response
            const originalStreamCallback = options.streamCallback;
            const wrappedOptions = {
                ...options,
                streamCallback: (chunk: string) => {
                    fullResponse += chunk;
                    if (originalStreamCallback) {
                        originalStreamCallback(chunk);
                    }
                },
                abortController
            };

            // Make the actual AI request
            await provider.getCompletion(messages, wrappedOptions);

            // Clean up stream controller
            this.activeStreams.delete(streamId);

            // Record success
            this.recordSuccess(providerName);
            this.updateMetrics(providerName, true, Date.now() - startTime, fullResponse.length);
            performanceMonitor.recordMetric('api_response_time', Date.now() - startTime, 'time');
            performanceMonitor.recordMetric('api_response_size', fullResponse.length, 'size');

            // Cache the response
            this.setCache(cacheKey, fullResponse);

            // Prepare response data for logging
            const responseData = {
                content: fullResponse,
                provider: providerName,
                model: this.plugin.settings.selectedModel || 'default',
                timestamp: new Date().toISOString(),
                duration: Date.now() - startTime
            };

            debugLog(this.plugin.settings.debugMode ?? false, 'info', '[AIDispatcher] AI request completed', {
                provider: providerName,
                responseLength: fullResponse.length,
                duration: responseData.duration
            });

            // Save the call to the vault
            try {
                await saveAICallToFolder(requestData, responseData, { settings: this.plugin.settings, app: (this.plugin as any).app });
            } catch (saveError) {
                debugLog(this.plugin.settings.debugMode ?? false, 'error', '[AIDispatcher] Failed to save AI call:', saveError);
            }

        } catch (error) {
            // Clean up stream controller
            this.activeStreams.forEach((controller, id) => {
                if (controller === abortController) {
                    this.activeStreams.delete(id);
                }
            });

            // Record failure
            this.recordFailure(providerName);
            this.updateMetrics(providerName, false, Date.now() - startTime, 0);

            debugLog(this.plugin.settings.debugMode ?? false, 'error', '[AIDispatcher] AI request failed:', error);

            // Retry logic with exponential backoff
            const maxRetries = 3;
            if (retryCount < maxRetries && this.shouldRetry(error)) {
                const backoffDelay = Math.pow(2, retryCount) * 1000; // Exponential backoff
                debugLog(this.plugin.settings.debugMode ?? false, 'info', '[AIDispatcher] Retrying request', { 
                    attempt: retryCount + 1, 
                    delay: backoffDelay 
                });
                
                await new Promise(resolve => setTimeout(resolve, backoffDelay));
                return this.executeWithRetry(messages, options, providerName, cacheKey, retryCount + 1);
            }

            // Save failed request for debugging
            try {
                const errorResponseData = {
                    error: error.message || 'Unknown error',
                    provider: providerName,
                    timestamp: new Date().toISOString(),
                    duration: Date.now() - startTime
                };
                const requestData = {
                    provider: providerName,
                    model: this.plugin.settings.selectedModel || 'default',
                    messages: messages,
                    options: options,
                    timestamp: new Date().toISOString()
                };
                await saveAICallToFolder(requestData, errorResponseData, { settings: this.plugin.settings, app: (this.plugin as any).app });
            } catch (saveError) {
                debugLog(this.plugin.settings.debugMode ?? false, 'error', '[AIDispatcher] Failed to save error log:', saveError);
            }

            throw error;
        }
    }

    /**
     * Determines if error is retryable.
     */
    private shouldRetry(error: any): boolean {
        const retryableErrors = ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'rate_limit_exceeded'];
        return retryableErrors.some(code => 
            error.message?.includes(code) || error.code === code
        );
    }

    /**
     * Updates metrics tracking.
     */
    private updateMetrics(providerName: string, success: boolean, duration: number, tokenCount: number): void {
        this.metrics.totalRequests++;
        
        if (success) {
            this.metrics.successfulRequests++;
            this.metrics.totalTokens += tokenCount;
            // Update average response time
            this.metrics.averageResponseTime = 
                (this.metrics.averageResponseTime * (this.metrics.successfulRequests - 1) + duration) / 
                this.metrics.successfulRequests;
        } else {
            this.metrics.failedRequests++;
            this.metrics.errorsByProvider[providerName] = (this.metrics.errorsByProvider[providerName] || 0) + 1;
        }

        this.metrics.requestsByProvider[providerName] = (this.metrics.requestsByProvider[providerName] || 0) + 1;
    }

    /**
     * Gets current metrics.
     */
    getMetrics(): RequestMetrics {
        return { ...this.metrics };
    }

    /**
     * Resets metrics.
     */
    resetMetrics(): void {
        this.metrics = {
            totalRequests: 0,
            successfulRequests: 0,
            failedRequests: 0,
            totalTokens: 0,
            totalCost: 0,
            averageResponseTime: 0,
            requestsByProvider: {},
            errorsByProvider: {},
            cacheHits: 0,
            cacheMisses: 0,
            deduplicatedRequests: 0
        };
    }

    /**
     * Clears cache.
     */
    clearCache(): void {
        this.cache.clear();
        this.modelCache.clear();
        this.providerCache.clear();
        performanceMonitor.clearMetrics(); // Clear performance metrics as well
        debugLog(this.plugin.settings.debugMode ?? false, 'info', '[AIDispatcher] All caches cleared');
    }

    /**
     * Logs current performance metrics.
     */
    logPerformanceMetrics(): void {
        performanceMonitor.logMetrics();
    }

    /**
     * Aborts all active streams.
     */
    abortAllStreams(): void {
        for (const [id, controller] of this.activeStreams) {
            controller.abort();
            debugLog(this.plugin.settings.debugMode ?? false, 'info', '[AIDispatcher] Stream aborted', { id });
        }
        this.activeStreams.clear();
    }

    /**
     * Aborts specific stream by ID.
     */
    abortStream(streamId: string): void {
        const controller = this.activeStreams.get(streamId);
        if (controller) {
            controller.abort();
            this.activeStreams.delete(streamId);
            debugLog(this.plugin.settings.debugMode ?? false, 'info', '[AIDispatcher] Stream aborted', { id: streamId });
        }
    }

    /**
     * Check if there are any active streams.
     */
    hasActiveStreams(): boolean {
        return this.activeStreams.size > 0;
    }

    /**
     * Get the current number of active streams.
     */
    getActiveStreamCount(): number {
        return this.activeStreams.size;
    }

    /**
     * Test connection to a specific provider.
     * 
     * @param providerType - The type of provider to test
     * @returns Promise resolving to connection test result
     */
    async testConnection(providerType: 'openai' | 'anthropic' | 'gemini' | 'ollama') {
        debugLog(this.plugin.settings.debugMode ?? false, 'info', '[AIDispatcher] Testing connection', { provider: providerType });
        
        const tempSettings = { ...this.plugin.settings, provider: providerType };
        const provider = createProvider(tempSettings);
        
        return await provider.testConnection();
    }

    /**
     * Get available models from a specific provider.
     *
     * @param providerType - The type of provider to query
     * @returns Promise resolving to list of available models
     */
    async getAvailableModels(providerType: 'openai' | 'anthropic' | 'gemini' | 'ollama'): Promise<string[]> {
        debugLog(this.plugin.settings.debugMode ?? false, 'info', '[AIDispatcher] Fetching available models', { provider: providerType });
        
        // Check cache first
        const cachedModels = this.providerCache.get(providerType);
        if (cachedModels) {
            debugLog(this.plugin.settings.debugMode ?? false, 'info', '[AIDispatcher] Using cached models', { provider: providerType });
            return cachedModels;
        }

        return await withErrorHandling(
            async () => {
                const tempSettings = { ...this.plugin.settings, provider: providerType };
                const provider = createProvider(tempSettings);
                const models = await provider.getAvailableModels();
                this.providerCache.set(providerType, models);
                return models;
            },
            'AIDispatcher',
            'getAvailableModels',
            { fallbackMessage: `Failed to fetch models for ${providerType}` }
        ) || [];
    }

    /**
     * Get all available unified models from all configured providers.
     *
     * @returns Promise resolving to unified model list
     */
    async getAllUnifiedModels(): Promise<UnifiedModel[]> {
        debugLog(this.plugin.settings.debugMode ?? false, 'info', '[AIDispatcher] Fetching all unified models');
        
        // Check cache first
        const cacheKey = 'all-unified-models';
        const cachedModels = this.modelCache.get(cacheKey);
        if (cachedModels) {
            debugLog(this.plugin.settings.debugMode ?? false, 'info', '[AIDispatcher] Using cached unified models');
            return cachedModels;
        }

        return await withErrorHandling(
            async () => {
                const models = await getAllAvailableModels(this.plugin.settings);
                this.modelCache.set(cacheKey, models);
                return models;
            },
            'AIDispatcher',
            'getAllUnifiedModels',
            { fallbackMessage: 'Failed to fetch unified models' }
        ) || [];
    }

    /**
     * Refresh available models for a specific provider and update settings.
     * 
     * @param providerType - The provider to refresh models for
     * @returns Promise resolving to the updated models list
     */
    async refreshProviderModels(providerType: 'openai' | 'anthropic' | 'gemini' | 'ollama'): Promise<string[]> {
        debugLog(this.plugin.settings.debugMode ?? false, 'info', '[AIDispatcher] Refreshing models for provider', { provider: providerType });
        
        try {
            const models = await this.getAvailableModels(providerType);
            
            // Update the settings with the new models
            const settingsKey = `${providerType}Settings` as keyof typeof this.plugin.settings;
            const providerSettings = this.plugin.settings[settingsKey] as any;
            
            if (providerSettings) {
                providerSettings.availableModels = models;
                providerSettings.lastTestResult = {
                    timestamp: Date.now(),
                    success: true,
                    message: `Successfully refreshed ${models.length} models`
                };
                
                // Save the updated settings
                await this.plugin.saveSettings();
                
                debugLog(this.plugin.settings.debugMode ?? false, 'info', 
                    '[AIDispatcher] Successfully refreshed models', { 
                        provider: providerType, 
                        count: models.length 
                    });
            }
            
            return models;
        } catch (error) {
            debugLog(this.plugin.settings.debugMode ?? false, 'error', 
                '[AIDispatcher] Failed to refresh models', { provider: providerType, error });
            
            // Update settings with error info
            const settingsKey = `${providerType}Settings` as keyof typeof this.plugin.settings;
            const providerSettings = this.plugin.settings[settingsKey] as any;
            
            if (providerSettings) {
                providerSettings.lastTestResult = {
                    timestamp: Date.now(),
                    success: false,
                    message: error.message || 'Failed to refresh models'
                };
                await this.plugin.saveSettings();
            }
            
            throw error;
        }
    }

    /**
     * Refresh models for all configured providers.
     * 
     * @returns Promise resolving to a map of provider -> models
     */
    async refreshAllProviderModels(): Promise<Record<string, string[]>> {
        debugLog(this.plugin.settings.debugMode ?? false, 'info', '[AIDispatcher] Refreshing models for all providers');
        
        const providers = ['openai', 'anthropic', 'gemini', 'ollama'] as const;
        const results: Record<string, string[]> = {};
        
        for (const provider of providers) {
            try {
                results[provider] = await this.refreshProviderModels(provider);
            } catch (error) {
                debugLog(this.plugin.settings.debugMode ?? false, 'warn', 
                    '[AIDispatcher] Failed to refresh models for provider', { provider, error });
                results[provider] = []; // Empty array on failure
            }
        }
        
        // Refresh the unified models list
        this.plugin.settings.availableModels = await this.getAllUnifiedModels();
        await this.plugin.saveSettings();
        
        return results;
    }

    /**
     * Set the current model selection.
     * 
     * @param unifiedModelId - The unified model ID (e.g., "openai:gpt-4")
     */
    async setSelectedModel(unifiedModelId: string): Promise<void> {
        debugLog(this.plugin.settings.debugMode ?? false, 'info', '[AIDispatcher] Setting selected model', { model: unifiedModelId });
        
        this.plugin.settings.selectedModel = unifiedModelId;
        
        // Update the provider setting based on the selected model
        const [providerType] = unifiedModelId.split(':', 2);
        this.plugin.settings.provider = providerType as any;
        
        await this.plugin.saveSettings();
    }

    /**
     * Get the currently selected model.
     * 
     * @returns The current unified model ID or undefined
     */
    getCurrentModel(): string | undefined {
        return this.plugin.settings.selectedModel;
    }

    /**
     * Get model information for a specific unified model ID.
     * 
     * @param unifiedModelId - The unified model ID
     * @returns The model information or undefined if not found
     */
    getModelInfo(unifiedModelId: string): { id: string; name: string; provider: string } | undefined {
        const model = this.plugin.settings.availableModels?.find(model => model.id === unifiedModelId);
        if (!model) return undefined;
        
        return {
            id: model.id,
            name: model.name,
            provider: model.provider
        };
    }

    /**
     * Check if a specific provider is configured (has API key).
     * 
     * @param providerType - The provider to check
     * @returns True if the provider is configured
     */
    isProviderConfigured(providerType: 'openai' | 'anthropic' | 'gemini' | 'ollama'): boolean {
        switch (providerType) {
            case 'openai':
                return !!this.plugin.settings.openaiSettings.apiKey;
            case 'anthropic':
                return !!this.plugin.settings.anthropicSettings.apiKey;
            case 'gemini':
                return !!this.plugin.settings.geminiSettings.apiKey;
            case 'ollama':
                return !!this.plugin.settings.ollamaSettings.serverUrl;
            default:
                return false;
        }
    }

    /**
     * Get configured providers (those with API keys).
     * 
     * @returns Array of configured provider names
     */
    getConfiguredProviders(): Array<'openai' | 'anthropic' | 'gemini' | 'ollama'> {
        const providers: Array<'openai' | 'anthropic' | 'gemini' | 'ollama'> = [];
        
        if (this.isProviderConfigured('openai')) providers.push('openai');
        if (this.isProviderConfigured('anthropic')) providers.push('anthropic');
        if (this.isProviderConfigured('gemini')) providers.push('gemini');
        if (this.isProviderConfigured('ollama')) providers.push('ollama');
        
        return providers;
    }
}