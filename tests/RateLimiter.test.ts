import { RateLimiter, ProviderLimits } from '../src/services/core/RateLimiter';
import { IEventBus } from '../src/services/interfaces';

describe('RateLimiter', () => {
  let rateLimiter: RateLimiter;
  let mockEventBus: jest.Mocked<IEventBus>;

  beforeEach(() => {
    mockEventBus = {
      publish: jest.fn().mockResolvedValue(undefined),
      subscribe: jest.fn().mockReturnValue(jest.fn()),
      subscribeOnce: jest.fn().mockReturnValue(jest.fn()),
      unsubscribe: jest.fn(),
      clear: jest.fn(),
      getSubscriptionCount: jest.fn().mockReturnValue(0)
    };
    rateLimiter = new RateLimiter(mockEventBus);
  });

  afterEach(() => {
    rateLimiter.dispose();
  });

  describe('Core Rate Limiting Logic', () => {
    test('checkLimit() returns true when under limits for known provider', () => {
      expect(rateLimiter.checkLimit('openai')).toBe(true);
    });

    test('checkLimit() returns true for unknown provider', () => {
      expect(rateLimiter.checkLimit('unknown-provider')).toBe(true);
    });

    test('checkLimit() returns false when over rate limits', () => {
      // OpenAI has maxRequests: 60, so make 60 requests
      for (let i = 0; i < 60; i++) {
        rateLimiter.recordRequest('openai');
      }

      expect(rateLimiter.checkLimit('openai')).toBe(false);
    });

    test('checkLimit() returns false when over burst limits', () => {
      // OpenAI has burstLimit: 10, so make 10 rapid requests
      for (let i = 0; i < 10; i++) {
        rateLimiter.recordRequest('openai');
      }

      expect(rateLimiter.checkLimit('openai')).toBe(false);
    });

    test('recordRequest() increments counters correctly', () => {
      rateLimiter.recordRequest('openai');

      const limits = rateLimiter.getProviderLimits();
      expect(limits.openai.requests).toBe(1);
      expect(limits.openai.remaining).toBe(59); // 60 - 1
    });

    test('recordRequest() resets expired windows', () => {
      // Record a request
      rateLimiter.recordRequest('openai');

      // Manually expire the window by setting resetTime to past
      const limits = rateLimiter['limits'];
      const openaiLimit = limits.get('openai');
      if (openaiLimit) {
        openaiLimit.resetTime = Date.now() - 1000; // 1 second ago
        limits.set('openai', openaiLimit);
      }

      // Next check should reset and allow request
      expect(rateLimiter.checkLimit('openai')).toBe(true);
    });

    test('getRemainingRequests() returns correct remaining count', () => {
      expect(rateLimiter.getRemainingRequests('openai')).toBe(60);

      rateLimiter.recordRequest('openai');
      expect(rateLimiter.getRemainingRequests('openai')).toBe(59);

      // Unknown provider returns Infinity
      expect(rateLimiter.getRemainingRequests('unknown')).toBe(Infinity);
    });
  });

  describe('Provider Management', () => {
    test('getProviderLimitConfig() returns correct limits for known providers', () => {
      const config = rateLimiter.getProviderLimitConfig('openai');
      expect(config).toEqual({
        maxRequests: 60,
        windowMs: 60000,
        burstLimit: 10
      });
    });

    test('getProviderLimitConfig() returns undefined for unknown providers', () => {
      const config = rateLimiter.getProviderLimitConfig('unknown');
      expect(config).toBeUndefined();
    });

    test('updateProviderLimits() updates provider configuration', () => {
      const newLimits: ProviderLimits = {
        maxRequests: 100,
        windowMs: 30000,
        burstLimit: 20
      };

      rateLimiter.updateProviderLimits('openai', newLimits);

      const config = rateLimiter.getProviderLimitConfig('openai');
      expect(config).toEqual(newLimits);
    });

    test('resetLimits() clears specific provider limits', () => {
      rateLimiter.recordRequest('openai');
      expect(rateLimiter.getRemainingRequests('openai')).toBe(59);

      rateLimiter.resetLimits('openai');
      expect(rateLimiter.getRemainingRequests('openai')).toBe(60);
    });

    test('resetLimits() clears all provider limits', () => {
      rateLimiter.recordRequest('openai');
      rateLimiter.recordRequest('anthropic');

      rateLimiter.resetLimits();
      expect(rateLimiter.getRemainingRequests('openai')).toBe(60);
      expect(rateLimiter.getRemainingRequests('anthropic')).toBe(50);
    });
  });

  describe('Event Publishing', () => {
    test('publishes rate.limit.exceeded when limits exceeded', () => {
      // Make 60 requests to exceed limit
      for (let i = 0; i < 60; i++) {
        rateLimiter.recordRequest('openai');
      }

      rateLimiter.checkLimit('openai');

      expect(mockEventBus.publish).toHaveBeenCalledWith('rate.limit.exceeded', expect.objectContaining({
        provider: 'openai',
        requests: 60,
        maxRequests: 60
      }));
    });

    test('publishes rate.limit.burst_exceeded when burst limits exceeded', () => {
      // Make 10 rapid requests to exceed burst limit
      for (let i = 0; i < 10; i++) {
        rateLimiter.recordRequest('openai');
      }

      rateLimiter.checkLimit('openai');

      expect(mockEventBus.publish).toHaveBeenCalledWith('rate.limit.burst_exceeded', expect.objectContaining({
        provider: 'openai',
        burstCount: 10,
        burstLimit: 10
      }));
    });

    test('publishes rate.limit.request_recorded on successful requests', () => {
      rateLimiter.recordRequest('openai');

      expect(mockEventBus.publish).toHaveBeenCalledWith('rate.limit.request_recorded', expect.objectContaining({
        provider: 'openai',
        requests: 1,
        remaining: 59
      }));
    });

    test('publishes rate.limit.reset when limits reset', () => {
      rateLimiter.resetLimits('openai');

      expect(mockEventBus.publish).toHaveBeenCalledWith('rate.limit.reset', expect.objectContaining({
        provider: 'openai'
      }));
    });

    test('publishes rate.limit.unknown_provider for unknown providers', () => {
      rateLimiter.checkLimit('unknown-provider');

      expect(mockEventBus.publish).toHaveBeenCalledWith('rate.limit.unknown_provider', expect.objectContaining({
        provider: 'unknown-provider'
      }));
    });
  });

  describe('Statistics & Monitoring', () => {
    test('getProviderLimits() returns correct stats for all providers', () => {
      rateLimiter.recordRequest('openai');

      const limits = rateLimiter.getProviderLimits();

      expect(limits.openai).toEqual({
        requests: 1,
        maxRequests: 60,
        resetTime: expect.any(Number),
        remaining: 59
      });

      expect(limits.anthropic).toEqual({
        requests: 0,
        maxRequests: 50,
        resetTime: expect.any(Number),
        remaining: 50
      });
    });

    test('getDetailedStats() includes burst counts and request rates', () => {
      const startTime = Date.now();
      rateLimiter.recordRequest('openai');
      rateLimiter.recordRequest('openai');

      const stats = rateLimiter.getDetailedStats();

      expect(stats.providers.openai).toEqual({
        config: {
          maxRequests: 60,
          windowMs: 60000,
          burstLimit: 10
        },
        current: {
          requests: 2,
          maxRequests: 60,
          resetTime: expect.any(Number),
          remaining: 58
        },
        burstCount: 2,
        averageRequestRate: expect.any(Number)
      });

      expect(stats.totalRequests).toBe(2);
      expect(stats.activeProviders).toBe(1);
    });

    test('getDetailedStats() calculates average request rates correctly', () => {
      rateLimiter.recordRequest('openai');

      const stats = rateLimiter.getDetailedStats();

      // Should have some request rate (requests per second)
      expect(stats.providers.openai.averageRequestRate).toBeGreaterThan(0);
    });
  });

  describe('Lifecycle Management', () => {
    test('dispose() clears all data and stops cleanup timer', () => {
      rateLimiter.recordRequest('openai');

      rateLimiter.dispose();

      // Should clear limits
      expect(rateLimiter.getRemainingRequests('openai')).toBe(60);

      // Should publish disposed event
      expect(mockEventBus.publish).toHaveBeenCalledWith('rate.limit.disposed', expect.objectContaining({
        timestamp: expect.any(Number)
      }));
    });

    test('cleanup timer removes expired entries automatically', async () => {
      // Record a request
      rateLimiter.recordRequest('openai');

      // Manually expire the entry
      const limits = rateLimiter['limits'];
      const openaiLimit = limits.get('openai');
      if (openaiLimit) {
        openaiLimit.resetTime = Date.now() - 1000; // Expired
        limits.set('openai', openaiLimit);
      }

      // Wait for cleanup (cleanup runs every 60 seconds, but we can trigger it)
      rateLimiter['cleanupExpiredLimits']();

      // Should publish cleanup event
      expect(mockEventBus.publish).toHaveBeenCalledWith('rate.limit.cleanup', expect.objectContaining({
        expiredCount: 1
      }));
    });

    test('handles multiple providers simultaneously', () => {
      rateLimiter.recordRequest('openai');
      rateLimiter.recordRequest('anthropic');
      rateLimiter.recordRequest('gemini');

      const limits = rateLimiter.getProviderLimits();

      expect(limits.openai.requests).toBe(1);
      expect(limits.anthropic.requests).toBe(1);
      expect(limits.gemini.requests).toBe(1);
    });
  });

  describe('Edge Cases', () => {
    test('handles providers with zero maxRequests', () => {
      rateLimiter.updateProviderLimits('blocked-provider', {
        maxRequests: 0,
        windowMs: 60000
      });

      expect(rateLimiter.checkLimit('blocked-provider')).toBe(false);
    });

    test('handles providers without burst limits', () => {
      rateLimiter.updateProviderLimits('no-burst', {
        maxRequests: 10,
        windowMs: 60000
        // No burstLimit
      });

      // Should still work with rate limiting
      for (let i = 0; i < 10; i++) {
        rateLimiter.recordRequest('no-burst');
      }

      expect(rateLimiter.checkLimit('no-burst')).toBe(false);
    });

    test('handles rapid successive requests', () => {
      // Simulate rapid requests that might exceed burst limit
      for (let i = 0; i < 15; i++) {
        rateLimiter.recordRequest('openai');
      }

      expect(rateLimiter.checkLimit('openai')).toBe(false);
    });

    test('handles window expiration correctly', () => {
      // Fill up the limit
      for (let i = 0; i < 60; i++) {
        rateLimiter.recordRequest('openai');
      }

      expect(rateLimiter.checkLimit('openai')).toBe(false);

      // Simulate window expiration by directly modifying the reset time
      const limits = rateLimiter['limits'];
      const openaiLimit = limits.get('openai');
      if (openaiLimit) {
        openaiLimit.resetTime = Date.now() - 1000; // Expired
        limits.set('openai', openaiLimit);
      }

      // Should now allow requests again
      expect(rateLimiter.checkLimit('openai')).toBe(true);
    });
  });

  describe('Default Provider Configurations', () => {
    test('has correct default limits for OpenAI', () => {
      const config = rateLimiter.getProviderLimitConfig('openai');
      expect(config?.maxRequests).toBe(60);
      expect(config?.windowMs).toBe(60000);
      expect(config?.burstLimit).toBe(10);
    });

    test('has correct default limits for Anthropic', () => {
      const config = rateLimiter.getProviderLimitConfig('anthropic');
      expect(config?.maxRequests).toBe(50);
      expect(config?.windowMs).toBe(60000);
      expect(config?.burstLimit).toBe(8);
    });

    test('has correct default limits for Gemini', () => {
      const config = rateLimiter.getProviderLimitConfig('gemini');
      expect(config?.maxRequests).toBe(60);
      expect(config?.windowMs).toBe(60000);
      expect(config?.burstLimit).toBe(10);
    });

    test('has correct default limits for Ollama', () => {
      const config = rateLimiter.getProviderLimitConfig('ollama');
      expect(config?.maxRequests).toBe(100);
      expect(config?.windowMs).toBe(60000);
      expect(config?.burstLimit).toBe(20);
    });
  });
});
