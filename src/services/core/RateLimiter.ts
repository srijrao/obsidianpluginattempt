/**
 * @file RateLimiter.ts
 * 
 * Rate Limiter service for managing API rate limits across different providers.
 * Extracted from AIDispatcher to follow single responsibility principle.
 */

import { IRateLimiter, RateLimitInfo, IEventBus } from '../interfaces';

export interface ProviderLimits {
    maxRequests: number;
    windowMs: number;
    burstLimit?: number;
}

export interface RateLimitEntry {
    requests: number;
    resetTime: number;
    firstRequestTime: number;
    burstCount: number;
    lastRequestTime: number;
}

/**
 * Manages rate limiting for different AI providers with burst handling
 */
export class RateLimiter implements IRateLimiter {
    private limits = new Map<string, RateLimitEntry>();
    private readonly providerLimits: Map<string, ProviderLimits> = new Map();
    private readonly RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute default

    constructor(private eventBus: IEventBus) {
        this.initializeProviderLimits();
        this.startCleanupTimer();
    }

    /**
     * Checks if a provider is within rate limits
     */
    checkLimit(provider: string): boolean {
        const limit = this.limits.get(provider);
        const providerConfig = this.providerLimits.get(provider);
        
        if (!providerConfig) {
            // If no config, allow the request but log a warning
            this.eventBus.publish('rate.limit.unknown_provider', {
                provider,
                timestamp: Date.now()
            });
            return true;
        }

        if (!limit) {
            // First request for this provider
            return true;
        }

        const now = Date.now();
        
        // Check if the rate limit window has expired
        if (now > limit.resetTime) {
            return true;
        }

        // Check burst limit if configured
        if (providerConfig.burstLimit && limit.burstCount >= providerConfig.burstLimit) {
            const timeSinceLastRequest = now - limit.lastRequestTime;
            if (timeSinceLastRequest < 1000) { // 1 second burst window
                this.eventBus.publish('rate.limit.burst_exceeded', {
                    provider,
                    burstCount: limit.burstCount,
                    burstLimit: providerConfig.burstLimit,
                    timestamp: now
                });
                return false;
            }
        }

        // Check main rate limit
        const isWithinLimit = limit.requests < providerConfig.maxRequests;
        
        if (!isWithinLimit) {
            this.eventBus.publish('rate.limit.exceeded', {
                provider,
                requests: limit.requests,
                maxRequests: providerConfig.maxRequests,
                resetTime: limit.resetTime,
                timestamp: now
            });
        }

        return isWithinLimit;
    }

    /**
     * Records a request for rate limiting
     */
    recordRequest(provider: string): void {
        const now = Date.now();
        const providerConfig = this.providerLimits.get(provider);
        
        if (!providerConfig) {
            this.eventBus.publish('rate.limit.unknown_provider', {
                provider,
                timestamp: now
            });
            return;
        }

        let limit = this.limits.get(provider);
        
        if (!limit || now > limit.resetTime) {
            // Create new or reset expired limit
            limit = {
                requests: 0,
                resetTime: now + providerConfig.windowMs,
                firstRequestTime: now,
                burstCount: 0,
                lastRequestTime: now
            };
        }

        // Update request counts
        limit.requests++;
        limit.lastRequestTime = now;

        // Update burst count if within burst window
        if (now - limit.lastRequestTime < 1000) {
            limit.burstCount++;
        } else {
            limit.burstCount = 1;
        }

        this.limits.set(provider, limit);

        this.eventBus.publish('rate.limit.request_recorded', {
            provider,
            requests: limit.requests,
            maxRequests: providerConfig.maxRequests,
            remaining: Math.max(0, providerConfig.maxRequests - limit.requests),
            resetTime: limit.resetTime,
            timestamp: now
        });
    }

    /**
     * Gets remaining requests for a provider
     */
    getRemainingRequests(provider: string): number {
        const limit = this.limits.get(provider);
        const providerConfig = this.providerLimits.get(provider);
        
        if (!providerConfig) {
            return Infinity; // Unknown provider, assume unlimited
        }

        if (!limit || Date.now() > limit.resetTime) {
            return providerConfig.maxRequests;
        }

        return Math.max(0, providerConfig.maxRequests - limit.requests);
    }

    /**
     * Resets limits for a specific provider or all providers
     */
    resetLimits(provider?: string): void {
        if (provider) {
            this.limits.delete(provider);
            this.eventBus.publish('rate.limit.reset', {
                provider,
                timestamp: Date.now()
            });
        } else {
            const resetCount = this.limits.size;
            this.limits.clear();
            this.eventBus.publish('rate.limit.reset_all', {
                resetCount,
                timestamp: Date.now()
            });
        }
    }

    /**
     * Gets rate limit information for all providers
     */
    getProviderLimits(): Record<string, RateLimitInfo> {
        const result: Record<string, RateLimitInfo> = {};
        const now = Date.now();

        for (const [provider, config] of this.providerLimits.entries()) {
            const limit = this.limits.get(provider);
            
            if (!limit || now > limit.resetTime) {
                result[provider] = {
                    requests: 0,
                    maxRequests: config.maxRequests,
                    resetTime: now + config.windowMs,
                    remaining: config.maxRequests
                };
            } else {
                result[provider] = {
                    requests: limit.requests,
                    maxRequests: config.maxRequests,
                    resetTime: limit.resetTime,
                    remaining: Math.max(0, config.maxRequests - limit.requests)
                };
            }
        }

        return result;
    }

    /**
     * Gets detailed rate limit statistics
     */
    getDetailedStats(): {
        providers: Record<string, {
            config: ProviderLimits;
            current: RateLimitInfo;
            burstCount: number;
            averageRequestRate: number;
        }>;
        totalRequests: number;
        activeProviders: number;
    } {
        const now = Date.now();
        const providers: Record<string, any> = {};
        let totalRequests = 0;
        let activeProviders = 0;

        for (const [provider, config] of this.providerLimits.entries()) {
            const limit = this.limits.get(provider);
            
            let current: RateLimitInfo;
            let burstCount = 0;
            let averageRequestRate = 0;

            if (!limit || now > limit.resetTime) {
                current = {
                    requests: 0,
                    maxRequests: config.maxRequests,
                    resetTime: now + config.windowMs,
                    remaining: config.maxRequests
                };
            } else {
                current = {
                    requests: limit.requests,
                    maxRequests: config.maxRequests,
                    resetTime: limit.resetTime,
                    remaining: Math.max(0, config.maxRequests - limit.requests)
                };
                burstCount = limit.burstCount;
                
                const timeElapsed = now - limit.firstRequestTime;
                if (timeElapsed > 0) {
                    averageRequestRate = (limit.requests / timeElapsed) * 1000; // requests per second
                }
                
                if (limit.requests > 0) {
                    activeProviders++;
                }
            }

            totalRequests += current.requests;

            providers[provider] = {
                config,
                current,
                burstCount,
                averageRequestRate: Math.round(averageRequestRate * 100) / 100
            };
        }

        return {
            providers,
            totalRequests,
            activeProviders
        };
    }

    /**
     * Updates provider limits configuration
     */
    updateProviderLimits(provider: string, limits: ProviderLimits): void {
        this.providerLimits.set(provider, limits);
        
        this.eventBus.publish('rate.limit.config_updated', {
            provider,
            limits,
            timestamp: Date.now()
        });
    }

    /**
     * Initializes default provider limits
     */
    private initializeProviderLimits(): void {
        const defaultLimits: Record<string, ProviderLimits> = {
            openai: {
                maxRequests: 60,
                windowMs: this.RATE_LIMIT_WINDOW,
                burstLimit: 10
            },
            anthropic: {
                maxRequests: 50,
                windowMs: this.RATE_LIMIT_WINDOW,
                burstLimit: 8
            },
            gemini: {
                maxRequests: 60,
                windowMs: this.RATE_LIMIT_WINDOW,
                burstLimit: 10
            },
            ollama: {
                maxRequests: 100,
                windowMs: this.RATE_LIMIT_WINDOW,
                burstLimit: 20 // Local, more generous
            }
        };

        for (const [provider, limits] of Object.entries(defaultLimits)) {
            this.providerLimits.set(provider, limits);
        }
    }

    /**
     * Starts cleanup timer for expired rate limit entries
     */
    private startCleanupTimer(): void {
        setInterval(() => {
            this.cleanupExpiredLimits();
        }, 60000); // Clean up every minute
    }

    /**
     * Cleans up expired rate limit entries
     */
    private cleanupExpiredLimits(): void {
        const now = Date.now();
        const expiredProviders: string[] = [];

        for (const [provider, limit] of this.limits.entries()) {
            if (now > limit.resetTime) {
                expiredProviders.push(provider);
            }
        }

        for (const provider of expiredProviders) {
            this.limits.delete(provider);
        }

        if (expiredProviders.length > 0) {
            this.eventBus.publish('rate.limit.cleanup', {
                expiredCount: expiredProviders.length,
                providers: expiredProviders,
                timestamp: now
            });
        }
    }

    /**
     * Cleanup method for disposing the service
     */
    dispose(): void {
        this.limits.clear();
        this.providerLimits.clear();
    }
}