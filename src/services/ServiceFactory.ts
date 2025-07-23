/**
 * @file ServiceFactory.ts
 * 
 * Service Factory for creating and wiring up all decomposed services.
 * Provides a clean way to instantiate the new architecture.
 */

import { IEventBus } from './interfaces';
import { RequestManager } from './core/RequestManager';
import { CacheManager } from './core/CacheManager';
import { RateLimiter } from './core/RateLimiter';
import { CircuitBreaker } from './core/CircuitBreaker';
import { MetricsCollector } from './core/MetricsCollector';
import { AIService } from './core/AIService';
import type { MyPluginSettings } from '../types';

export interface ServiceConfiguration {
    cache?: {
        maxSize?: number;
        defaultTTL?: number;
    };
    requestQueue?: {
        maxSize?: number;
    };
    rateLimiting?: {
        enabled?: boolean;
    };
    circuitBreaker?: {
        enabled?: boolean;
    };
    metrics?: {
        enabled?: boolean;
    };
}

/**
 * Factory for creating and configuring all AI-related services
 */
export class ServiceFactory {
    /**
     * Creates a complete AI service with all dependencies
     */
    static createAIService(
        eventBus: IEventBus,
        settings: MyPluginSettings,
        saveSettings: () => Promise<void>,
        config: ServiceConfiguration = {}
    ): AIService {
        // Create core services
        const requestManager = new RequestManager(eventBus);
        
        const cacheManager = new CacheManager(
            eventBus,
            config.cache?.maxSize || 200,
            config.cache?.defaultTTL || 5 * 60 * 1000
        );
        
        const rateLimiter = new RateLimiter(eventBus);
        const circuitBreaker = new CircuitBreaker(eventBus);
        const metricsCollector = new MetricsCollector(eventBus);

        // Create the main AI service
        const aiService = new AIService(
            eventBus,
            requestManager,
            cacheManager,
            rateLimiter,
            circuitBreaker,
            metricsCollector,
            settings,
            saveSettings
        );

        return aiService;
    }

    /**
     * Creates individual services for custom configurations
     */
    static createServices(
        eventBus: IEventBus,
        config: ServiceConfiguration = {}
    ): {
        requestManager: RequestManager;
        cacheManager: CacheManager;
        rateLimiter: RateLimiter;
        circuitBreaker: CircuitBreaker;
        metricsCollector: MetricsCollector;
    } {
        return {
            requestManager: new RequestManager(eventBus),
            cacheManager: new CacheManager(
                eventBus,
                config.cache?.maxSize || 200,
                config.cache?.defaultTTL || 5 * 60 * 1000
            ),
            rateLimiter: new RateLimiter(eventBus),
            circuitBreaker: new CircuitBreaker(eventBus),
            metricsCollector: new MetricsCollector(eventBus)
        };
    }

    /**
     * Creates a service with custom configuration
     */
    static createCustomAIService(
        eventBus: IEventBus,
        settings: MyPluginSettings,
        saveSettings: () => Promise<void>,
        services: {
            requestManager?: RequestManager;
            cacheManager?: CacheManager;
            rateLimiter?: RateLimiter;
            circuitBreaker?: CircuitBreaker;
            metricsCollector?: MetricsCollector;
        }
    ): AIService {
        const defaultServices = this.createServices(eventBus);

        return new AIService(
            eventBus,
            services.requestManager || defaultServices.requestManager,
            services.cacheManager || defaultServices.cacheManager,
            services.rateLimiter || defaultServices.rateLimiter,
            services.circuitBreaker || defaultServices.circuitBreaker,
            services.metricsCollector || defaultServices.metricsCollector,
            settings,
            saveSettings
        );
    }

    /**
     * Creates a minimal AI service for testing
     */
    static createTestAIService(
        eventBus: IEventBus,
        settings: MyPluginSettings,
        saveSettings: () => Promise<void>
    ): AIService {
        const config: ServiceConfiguration = {
            cache: { maxSize: 10, defaultTTL: 1000 },
            requestQueue: { maxSize: 5 }
        };

        return this.createAIService(eventBus, settings, saveSettings, config);
    }

    /**
     * Validates service configuration
     */
    static validateConfiguration(config: ServiceConfiguration): {
        isValid: boolean;
        errors: string[];
        warnings: string[];
    } {
        const errors: string[] = [];
        const warnings: string[] = [];

        // Validate cache configuration
        if (config.cache) {
            if (config.cache.maxSize !== undefined && config.cache.maxSize <= 0) {
                errors.push('Cache maxSize must be greater than 0');
            }
            if (config.cache.defaultTTL !== undefined && config.cache.defaultTTL <= 0) {
                errors.push('Cache defaultTTL must be greater than 0');
            }
            if (config.cache.maxSize !== undefined && config.cache.maxSize > 1000) {
                warnings.push('Large cache size may impact memory usage');
            }
        }

        // Validate request queue configuration
        if (config.requestQueue) {
            if (config.requestQueue.maxSize !== undefined && config.requestQueue.maxSize <= 0) {
                errors.push('Request queue maxSize must be greater than 0');
            }
            if (config.requestQueue.maxSize !== undefined && config.requestQueue.maxSize > 500) {
                warnings.push('Large queue size may impact performance');
            }
        }

        return {
            isValid: errors.length === 0,
            errors,
            warnings
        };
    }

    /**
     * Gets default configuration
     */
    static getDefaultConfiguration(): ServiceConfiguration {
        return {
            cache: {
                maxSize: 200,
                defaultTTL: 5 * 60 * 1000 // 5 minutes
            },
            requestQueue: {
                maxSize: 100
            },
            rateLimiting: {
                enabled: true
            },
            circuitBreaker: {
                enabled: true
            },
            metrics: {
                enabled: true
            }
        };
    }

    /**
     * Creates configuration for different environments
     */
    static createEnvironmentConfiguration(environment: 'development' | 'production' | 'testing'): ServiceConfiguration {
        const base = this.getDefaultConfiguration();

        switch (environment) {
            case 'development':
                return {
                    ...base,
                    cache: {
                        maxSize: 50,
                        defaultTTL: 2 * 60 * 1000 // 2 minutes
                    },
                    requestQueue: {
                        maxSize: 20
                    }
                };

            case 'testing':
                return {
                    ...base,
                    cache: {
                        maxSize: 10,
                        defaultTTL: 1000 // 1 second
                    },
                    requestQueue: {
                        maxSize: 5
                    }
                };

            case 'production':
            default:
                return base;
        }
    }
}

/**
 * Service registry for managing service instances
 */
export class ServiceRegistry {
    private static instances = new Map<string, any>();

    /**
     * Registers a service instance
     */
    static register<T>(name: string, instance: T): void {
        this.instances.set(name, instance);
    }

    /**
     * Gets a registered service instance
     */
    static get<T>(name: string): T | undefined {
        return this.instances.get(name);
    }

    /**
     * Checks if a service is registered
     */
    static has(name: string): boolean {
        return this.instances.has(name);
    }

    /**
     * Unregisters a service
     */
    static unregister(name: string): boolean {
        return this.instances.delete(name);
    }

    /**
     * Clears all registered services
     */
    static clear(): void {
        // Dispose services that have a dispose method
        for (const [name, instance] of this.instances) {
            if (instance && typeof instance.dispose === 'function') {
                try {
                    instance.dispose();
                } catch (error) {
                    console.warn(`Error disposing service ${name}:`, error);
                }
            }
        }
        this.instances.clear();
    }

    /**
     * Gets all registered service names
     */
    static getRegisteredServices(): string[] {
        return Array.from(this.instances.keys());
    }
}