/**
 * @file AIService.ts
 * 
 * Refactored AI Service that orchestrates decomposed services instead of handling everything directly.
 * This replaces the monolithic AIDispatcher with a clean, focused service.
 */

import { IAIService, CompletionRequest, CompletionResponse, ConnectionResult, IEventBus } from '../interfaces';
import { Message, CompletionOptions, UnifiedModel } from '../../types';
import { RequestManager } from './RequestManager';
import { CacheManager } from './CacheManager';
import { RateLimiter } from './RateLimiter';
import { CircuitBreaker } from './CircuitBreaker';
import { MetricsCollector } from './MetricsCollector';
import { BaseProvider } from '../../../providers/base';
import { createProvider, createProviderFromUnifiedModel, getAllAvailableModels } from '../../../providers';
import { saveAICallToFolder } from '../../utils/saveAICalls';
import { debugLog } from '../../utils/logger';
import { isValidProviderName, ValidProviderName, getProviderSettings, getPluginApp } from '../../utils/typeguards';
import type { MyPluginSettings } from '../../types';

/**
 * Orchestrates AI operations through focused, single-responsibility services
 */
export class AIService implements IAIService {
    private activeStreams = new Map<string, AbortController>();

    constructor(
        private eventBus: IEventBus,
        private requestManager: RequestManager,
        private cacheManager: CacheManager,
        private rateLimiter: RateLimiter,
        private circuitBreaker: CircuitBreaker,
        private metricsCollector: MetricsCollector,
        private settings: MyPluginSettings,
        private saveSettings: () => Promise<void>
    ) {
        this.setupEventListeners();
    }

    /**
     * Gets an AI completion by orchestrating the various services
     */
    async getCompletion(request: CompletionRequest): Promise<CompletionResponse> {
        const startTime = Date.now();
        const provider = this.determineProvider(request.provider);
        const cacheKey = this.generateCacheKey(request);

        try {
            // Check cache first
            const cachedResponse = await this.cacheManager.get(cacheKey);
            if (cachedResponse) {
                this.metricsCollector.recordCacheHit(cacheKey);
                
                // Stream cached response if callback provided
                if (request.options.streamCallback) {
                    request.options.streamCallback(cachedResponse);
                }

                return {
                    content: cachedResponse,
                    provider,
                    model: this.getCurrentModel() || 'unknown',
                    duration: Date.now() - startTime
                };
            }

            this.metricsCollector.recordCacheMiss(cacheKey);

            // Check circuit breaker
            if (this.circuitBreaker.isOpen(provider)) {
                throw new Error(`Provider ${provider} is temporarily unavailable (circuit breaker open)`);
            }

            // Check rate limits
            if (!this.rateLimiter.checkLimit(provider)) {
                // Queue the request if rate limited
                const aiRequest = {
                    id: this.generateRequestId(),
                    messages: request.messages,
                    options: request.options,
                    provider: request.provider,
                    priority: request.priority || 0,
                    timestamp: Date.now()
                };

                await this.requestManager.queueRequest(aiRequest);
                
                return {
                    content: '',
                    provider,
                    model: this.getCurrentModel() || 'unknown',
                    duration: Date.now() - startTime
                };
            }

            // Execute the request
            const response = await this.executeRequest(request, provider, cacheKey, startTime);
            return response;

        } catch (error: any) {
            this.circuitBreaker.recordFailure(provider);
            this.metricsCollector.recordRequest(provider, Date.now() - startTime, false);
            
            this.eventBus.publish('ai.request.failed', {
                provider,
                error: error.message,
                duration: Date.now() - startTime,
                timestamp: Date.now()
            });

            throw error;
        }
    }

    /**
     * Tests connection to a specific provider
     */
    async testConnection(provider: string): Promise<ConnectionResult> {
        debugLog(this.settings.debugMode ?? false, 'info', '[AIService] Testing connection', { provider });
        
        try {
            if (!isValidProviderName(provider)) {
                throw new Error(`Invalid provider: ${provider}`);
            }

            const tempSettings = { ...this.settings, provider: provider as ValidProviderName };
            const providerInstance = createProvider(tempSettings);
            
            const result = await providerInstance.testConnection();
            
            this.eventBus.publish('ai.connection.tested', {
                provider,
                success: result.success,
                latency: (result as any).latency,
                timestamp: Date.now()
            });

            return result;
        } catch (error: any) {
            const result = {
                success: false,
                message: error.message
            };

            this.eventBus.publish('ai.connection.tested', {
                provider,
                success: false,
                error: error.message,
                timestamp: Date.now()
            });

            return result;
        }
    }

    /**
     * Gets available models from a specific provider
     */
    async getAvailableModels(provider: string): Promise<string[]> {
        debugLog(this.settings.debugMode ?? false, 'info', '[AIService] Fetching available models', { provider });
        
        try {
            if (!isValidProviderName(provider)) {
                throw new Error(`Invalid provider: ${provider}`);
            }

            const tempSettings = { ...this.settings, provider: provider as ValidProviderName };
            const providerInstance = createProvider(tempSettings);
            const models = await providerInstance.getAvailableModels();
            
            this.eventBus.publish('ai.models.fetched', {
                provider,
                modelCount: models.length,
                timestamp: Date.now()
            });

            return models;
        } catch (error: any) {
            this.eventBus.publish('ai.models.fetch_failed', {
                provider,
                error: error.message,
                timestamp: Date.now()
            });

            throw error;
        }
    }

    /**
     * Gets all unified models from all configured providers
     */
    async getAllUnifiedModels(): Promise<UnifiedModel[]> {
        debugLog(this.settings.debugMode ?? false, 'info', '[AIService] Fetching all unified models');
        
        try {
            const models = await getAllAvailableModels(this.settings);
            
            this.eventBus.publish('ai.unified_models.fetched', {
                modelCount: models.length,
                timestamp: Date.now()
            });

            return models;
        } catch (error: any) {
            this.eventBus.publish('ai.unified_models.fetch_failed', {
                error: error.message,
                timestamp: Date.now()
            });

            throw error;
        }
    }

    /**
     * Sets the selected model
     */
    async setSelectedModel(modelId: string): Promise<void> {
        debugLog(this.settings.debugMode ?? false, 'info', '[AIService] Setting selected model', { model: modelId });
        
        this.settings.selectedModel = modelId;
        
        // Update the provider setting based on the selected model
        const [providerType] = modelId.split(':', 2);
        if (isValidProviderName(providerType)) {
            this.settings.provider = providerType;
        }
        
        await this.saveSettings();

        this.eventBus.publish('ai.model.selected', {
            modelId,
            provider: providerType,
            timestamp: Date.now()
        });
    }

    /**
     * Gets the currently selected model
     */
    getCurrentModel(): string | undefined {
        return this.settings.selectedModel;
    }

    /**
     * Checks if a specific provider is configured
     */
    isProviderConfigured(provider: string): boolean {
        switch (provider) {
            case 'openai':
                return !!this.settings.openaiSettings.apiKey;
            case 'anthropic':
                return !!this.settings.anthropicSettings.apiKey;
            case 'gemini':
                return !!this.settings.geminiSettings.apiKey;
            case 'ollama':
                return !!this.settings.ollamaSettings.serverUrl;
            default:
                return false;
        }
    }

    /**
     * Gets configured providers
     */
    getConfiguredProviders(): string[] {
        const providers: string[] = [];
        
        if (this.isProviderConfigured('openai')) providers.push('openai');
        if (this.isProviderConfigured('anthropic')) providers.push('anthropic');
        if (this.isProviderConfigured('gemini')) providers.push('gemini');
        if (this.isProviderConfigured('ollama')) providers.push('ollama');
        
        return providers;
    }

    /**
     * Gets service statistics
     */
    getStats(): {
        requests: any;
        cache: any;
        rateLimits: any;
        circuitBreakers: any;
        metrics: any;
    } {
        return {
            requests: this.requestManager.getQueueStats(),
            cache: this.cacheManager.getStats(),
            rateLimits: this.rateLimiter.getProviderLimits(),
            circuitBreakers: this.circuitBreaker.getAllStats(),
            metrics: this.metricsCollector.getDetailedMetrics()
        };
    }

    /**
     * Aborts all active streams
     */
    abortAllStreams(): void {
        for (const [id, controller] of this.activeStreams) {
            controller.abort();
            debugLog(this.settings.debugMode ?? false, 'info', '[AIService] Stream aborted', { id });
        }
        this.activeStreams.clear();

        this.eventBus.publish('ai.streams.aborted_all', {
            count: this.activeStreams.size,
            timestamp: Date.now()
        });
    }

    /**
     * Executes an AI request through the provider
     */
    private async executeRequest(
        request: CompletionRequest, 
        provider: string, 
        cacheKey: string, 
        startTime: number
    ): Promise<CompletionResponse> {
        let fullResponse = '';
        let providerInstance: BaseProvider;

        // Create provider instance
        if (this.settings.selectedModel) {
            providerInstance = createProviderFromUnifiedModel(this.settings, this.settings.selectedModel);
        } else {
            const tempSettings = { ...this.settings, provider: provider as ValidProviderName };
            providerInstance = createProvider(tempSettings);
        }

        // Record request for rate limiting
        this.rateLimiter.recordRequest(provider);

        // Create abort controller for this request
        const streamId = this.generateRequestId();
        const abortController = new AbortController();
        this.activeStreams.set(streamId, abortController);

        try {
            // Wrap the stream callback to capture the full response
            const originalStreamCallback = request.options.streamCallback;
            const wrappedOptions = {
                ...request.options,
                streamCallback: (chunk: string) => {
                    fullResponse += chunk;
                    if (originalStreamCallback) {
                        originalStreamCallback(chunk);
                    }
                },
                abortController
            };

            // Make the actual AI request
            await providerInstance.getCompletion(request.messages, wrappedOptions);

            // Clean up stream controller
            this.activeStreams.delete(streamId);

            // Record success
            this.circuitBreaker.recordSuccess(provider);
            const duration = Date.now() - startTime;
            this.metricsCollector.recordRequest(provider, duration, true);

            // Cache the response
            await this.cacheManager.set(cacheKey, fullResponse);

            // Save the call to the vault
            await this.saveAICall(request, fullResponse, provider, duration);

            this.eventBus.publish('ai.request.completed', {
                provider,
                duration,
                responseLength: fullResponse.length,
                timestamp: Date.now()
            });

            return {
                content: fullResponse,
                provider,
                model: this.getCurrentModel() || 'unknown',
                duration
            };

        } catch (error: any) {
            // Clean up stream controller
            this.activeStreams.delete(streamId);
            throw error;
        }
    }

    /**
     * Saves AI call to vault for logging
     */
    private async saveAICall(
        request: CompletionRequest, 
        response: string, 
        provider: string, 
        duration: number
    ): Promise<void> {
        try {
            const requestData = {
                provider,
                model: this.getCurrentModel() || 'default',
                messages: request.messages,
                options: request.options,
                timestamp: new Date().toISOString()
            };

            const responseData = {
                content: response,
                provider,
                model: this.getCurrentModel() || 'default',
                timestamp: new Date().toISOString(),
                duration
            };

            // This would need to be adapted to work with the new architecture
            // For now, we'll emit an event that other services can listen to
            this.eventBus.publish('ai.call.save_requested', {
                requestData,
                responseData,
                timestamp: Date.now()
            });

        } catch (error: any) {
            debugLog(this.settings.debugMode ?? false, 'error', '[AIService] Failed to save AI call:', error);
        }
    }

    /**
     * Determines which provider to use
     */
    private determineProvider(providerOverride?: string): string {
        if (providerOverride) return providerOverride;
        if (this.settings.selectedModel) {
            return this.settings.selectedModel.split(':')[0];
        }
        return this.settings.provider;
    }

    /**
     * Generates a cache key for the request
     */
    private generateCacheKey(request: CompletionRequest): string {
        const key = JSON.stringify({
            messages: request.messages,
            temperature: request.options.temperature,
            provider: request.provider || this.getCurrentModel() || this.settings.provider
        });

        // Use Unicode-safe base64 encoding
        function btoaUnicode(str: string) {
            return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, function(match, p1) {
                return String.fromCharCode(parseInt(p1, 16));
            }));
        }
        
        return btoaUnicode(key).substring(0, 32);
    }

    /**
     * Generates a unique request ID
     */
    private generateRequestId(): string {
        return Math.random().toString(36).substr(2, 9);
    }

    /**
     * Sets up event listeners for service coordination
     */
    private setupEventListeners(): void {
        // Listen for request processing events from RequestManager
        this.eventBus.subscribe('request.processing', async (data: any) => {
            try {
                const request: CompletionRequest = {
                    messages: data.messages,
                    options: data.options,
                    provider: data.provider,
                    priority: 0
                };

                await this.getCompletion(request);
            } catch (error: any) {
                debugLog(this.settings.debugMode ?? false, 'error', '[AIService] Failed to process queued request:', error);
            }
        });
    }

    /**
     * Cleanup method for disposing the service
     */
    dispose(): void {
        this.abortAllStreams();
        this.requestManager.dispose();
        this.cacheManager.dispose();
        this.rateLimiter.dispose();
        this.circuitBreaker.dispose();
        this.metricsCollector.dispose();
    }
}