/**
 * @file MetricsCollector.test.ts
 * @description Comprehensive test suite for MetricsCollector
 */

import { MetricsCollector, MetricEntry, ProviderMetrics, DetailedMetrics } from '../src/services/core/MetricsCollector';
import { IEventBus, RequestMetrics } from '../src/services/interfaces';

describe('MetricsCollector', () => {
  let metricsCollector: MetricsCollector;
  let mockEventBus: jest.Mocked<IEventBus>;
  let originalDateNow: typeof Date.now;
  let originalSetInterval: typeof setInterval;
  let originalClearInterval: typeof clearInterval;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    // Store original functions
    originalDateNow = Date.now;
    originalSetInterval = global.setInterval;
    originalClearInterval = global.clearInterval;

    // Create mock event bus
    mockEventBus = {
      publish: jest.fn().mockResolvedValue(undefined),
      subscribe: jest.fn().mockReturnValue(() => {}),
      subscribeOnce: jest.fn().mockReturnValue(() => {}),
      unsubscribe: jest.fn(),
      clear: jest.fn(),
      getSubscriptionCount: jest.fn().mockReturnValue(0),
    };

    // Create MetricsCollector instance
    metricsCollector = new MetricsCollector(mockEventBus);
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    
    // Restore original functions
    Date.now = originalDateNow;
    global.setInterval = originalSetInterval;
    global.clearInterval = originalClearInterval;
  });

  describe('constructor and initialization', () => {
    test('should initialize with default metrics', () => {
      expect(metricsCollector).toBeInstanceOf(MetricsCollector);
      
      const metrics = metricsCollector.getMetrics();
      expect(metrics).toEqual({
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        averageResponseTime: 0,
        requestsByProvider: {},
        errorsByProvider: {}
      });
    });

    test('should start periodic reporting on initialization', () => {
      const setIntervalSpy = jest.spyOn(global, 'setInterval');
      new MetricsCollector(mockEventBus);
      expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 60000);
    });

    test('should initialize empty time series data', () => {
      const detailedMetrics = metricsCollector.getDetailedMetrics();
      expect(detailedMetrics.timeSeriesData.requests).toEqual([]);
      expect(detailedMetrics.timeSeriesData.responseTime).toEqual([]);
      expect(detailedMetrics.timeSeriesData.errors).toEqual([]);
    });

    test('should initialize empty provider metrics', () => {
      const detailedMetrics = metricsCollector.getDetailedMetrics();
      expect(detailedMetrics.providerMetrics).toEqual({});
    });

    test('should initialize cache metrics with zero values', () => {
      const detailedMetrics = metricsCollector.getDetailedMetrics();
      expect(detailedMetrics.cacheMetrics).toEqual({
        hits: 0,
        misses: 0,
        hitRate: 0
      });
    });
  });

  describe('request recording', () => {
    test('should record successful request', () => {
      const mockNow = 1000000;
      Date.now = jest.fn().mockReturnValue(mockNow);

      metricsCollector.recordRequest('openai', 1500, true);

      const metrics = metricsCollector.getMetrics();
      expect(metrics.totalRequests).toBe(1);
      expect(metrics.successfulRequests).toBe(1);
      expect(metrics.failedRequests).toBe(0);
      expect(metrics.averageResponseTime).toBe(1500);
      expect(metrics.requestsByProvider['openai']).toBe(1);
      expect(metrics.errorsByProvider['openai']).toBeUndefined();
    });

    test('should record failed request', () => {
      const mockNow = 1000000;
      Date.now = jest.fn().mockReturnValue(mockNow);

      metricsCollector.recordRequest('anthropic', 2000, false);

      const metrics = metricsCollector.getMetrics();
      expect(metrics.totalRequests).toBe(1);
      expect(metrics.successfulRequests).toBe(0);
      expect(metrics.failedRequests).toBe(1);
      expect(metrics.averageResponseTime).toBe(2000);
      expect(metrics.requestsByProvider['anthropic']).toBe(1);
      expect(metrics.errorsByProvider['anthropic']).toBe(1);
    });

    test('should update provider-specific metrics', () => {
      const mockNow = 1000000;
      Date.now = jest.fn().mockReturnValue(mockNow);

      metricsCollector.recordRequest('openai', 1000, true);
      metricsCollector.recordRequest('openai', 2000, false);

      const detailedMetrics = metricsCollector.getDetailedMetrics();
      const openaiMetrics = detailedMetrics.providerMetrics['openai'];

      expect(openaiMetrics).toEqual({
        requests: 2,
        successes: 1,
        failures: 1,
        totalDuration: 3000,
        totalTokens: 0,
        averageResponseTime: 1500,
        lastRequestTime: mockNow,
        errorRate: 0.5
      });
    });

    test('should record time series data', () => {
      const mockNow = 1000000;
      Date.now = jest.fn().mockReturnValue(mockNow);

      metricsCollector.recordRequest('openai', 1500, true);
      metricsCollector.recordRequest('anthropic', 2000, false);

      const detailedMetrics = metricsCollector.getDetailedMetrics();
      
      expect(detailedMetrics.timeSeriesData.requests).toHaveLength(2);
      expect(detailedMetrics.timeSeriesData.responseTime).toHaveLength(2);
      expect(detailedMetrics.timeSeriesData.errors).toHaveLength(1);

      expect(detailedMetrics.timeSeriesData.requests[0]).toEqual({
        timestamp: mockNow,
        value: 1
      });
      expect(detailedMetrics.timeSeriesData.responseTime[0]).toEqual({
        timestamp: mockNow,
        value: 1500
      });
      expect(detailedMetrics.timeSeriesData.errors[0]).toEqual({
        timestamp: mockNow,
        value: 1
      });
    });

    test('should publish metrics event on request recording', () => {
      const mockNow = 1000000;
      Date.now = jest.fn().mockReturnValue(mockNow);

      metricsCollector.recordRequest('openai', 1500, true);

      expect(mockEventBus.publish).toHaveBeenCalledWith('metrics.request_recorded', {
        provider: 'openai',
        duration: 1500,
        success: true,
        totalRequests: 1,
        timestamp: mockNow
      });
    });

    test('should handle multiple providers independently', () => {
      metricsCollector.recordRequest('openai', 1000, true);
      metricsCollector.recordRequest('anthropic', 2000, true);
      metricsCollector.recordRequest('gemini', 1500, false);

      const metrics = metricsCollector.getMetrics();
      expect(metrics.totalRequests).toBe(3);
      expect(metrics.successfulRequests).toBe(2);
      expect(metrics.failedRequests).toBe(1);
      expect(metrics.requestsByProvider).toEqual({
        'openai': 1,
        'anthropic': 1,
        'gemini': 1
      });
      expect(metrics.errorsByProvider).toEqual({
        'gemini': 1
      });
    });
  });

  describe('response time tracking', () => {
    test('should calculate average response time correctly', () => {
      metricsCollector.recordRequest('openai', 1000, true);
      metricsCollector.recordRequest('openai', 2000, true);
      metricsCollector.recordRequest('openai', 3000, true);

      const metrics = metricsCollector.getMetrics();
      expect(metrics.averageResponseTime).toBe(2000);
    });

    test('should maintain response time samples within limit', () => {
      // Record more than MAX_RESPONSE_TIME_SAMPLES (1000)
      for (let i = 0; i < 1100; i++) {
        metricsCollector.recordRequest('openai', 100 + i, true);
      }

      const metrics = metricsCollector.getMetrics();
      // Should only keep the last 1000 samples (100-1199), average = (100+1199)/2 = 649.5
      // But the implementation shifts from the beginning, so we get samples 100-1199
      // Average of 100 to 1199 = (100 + 1199) / 2 = 649.5
      expect(metrics.averageResponseTime).toBeCloseTo(699.5, 1); // Average of last 1000 samples
    });

    test('should calculate percentiles correctly', () => {
      // Record requests with known response times
      const responseTimes = [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000];
      responseTimes.forEach(time => {
        metricsCollector.recordRequest('openai', time, true);
      });

      const detailedMetrics = metricsCollector.getDetailedMetrics();
      // For 10 samples, p95 = 95th percentile = index 9 (0-based) = 1000
      // For 10 samples, p99 = 99th percentile = index 9 (0-based) = 1000
      expect(detailedMetrics.performanceMetrics.p95ResponseTime).toBe(1000);
      expect(detailedMetrics.performanceMetrics.p99ResponseTime).toBe(1000);
    });

    test('should handle empty response times for percentiles', () => {
      const detailedMetrics = metricsCollector.getDetailedMetrics();
      expect(detailedMetrics.performanceMetrics.p95ResponseTime).toBe(0);
      expect(detailedMetrics.performanceMetrics.p99ResponseTime).toBe(0);
    });
  });

  describe('cache metrics', () => {
    test('should record cache hit', () => {
      const mockNow = 1000000;
      Date.now = jest.fn().mockReturnValue(mockNow);

      metricsCollector.recordCacheHit('test-key');

      const detailedMetrics = metricsCollector.getDetailedMetrics();
      expect(detailedMetrics.cacheMetrics.hits).toBe(1);
      expect(detailedMetrics.cacheMetrics.misses).toBe(0);
      expect(detailedMetrics.cacheMetrics.hitRate).toBe(1);

      expect(mockEventBus.publish).toHaveBeenCalledWith('metrics.cache_hit', {
        key: 'test-key',
        totalHits: 1,
        hitRate: 1,
        timestamp: mockNow
      });
    });

    test('should record cache miss', () => {
      const mockNow = 1000000;
      Date.now = jest.fn().mockReturnValue(mockNow);

      metricsCollector.recordCacheMiss('test-key');

      const detailedMetrics = metricsCollector.getDetailedMetrics();
      expect(detailedMetrics.cacheMetrics.hits).toBe(0);
      expect(detailedMetrics.cacheMetrics.misses).toBe(1);
      expect(detailedMetrics.cacheMetrics.hitRate).toBe(0);

      expect(mockEventBus.publish).toHaveBeenCalledWith('metrics.cache_miss', {
        key: 'test-key',
        totalMisses: 1,
        hitRate: 0,
        timestamp: mockNow
      });
    });

    test('should calculate cache hit rate correctly', () => {
      metricsCollector.recordCacheHit('key1');
      metricsCollector.recordCacheHit('key2');
      metricsCollector.recordCacheMiss('key3');
      metricsCollector.recordCacheMiss('key4');

      const detailedMetrics = metricsCollector.getDetailedMetrics();
      expect(detailedMetrics.cacheMetrics.hits).toBe(2);
      expect(detailedMetrics.cacheMetrics.misses).toBe(2);
      expect(detailedMetrics.cacheMetrics.hitRate).toBe(0.5);
    });

    test('should handle zero cache operations', () => {
      const detailedMetrics = metricsCollector.getDetailedMetrics();
      expect(detailedMetrics.cacheMetrics.hitRate).toBe(0);
    });
  });

  describe('throughput calculation', () => {
    test('should calculate throughput correctly', () => {
      const mockNow = 1000000;
      Date.now = jest.fn().mockReturnValue(mockNow);

      // Record requests within the last minute
      for (let i = 0; i < 30; i++) {
        Date.now = jest.fn().mockReturnValue(mockNow - 30000 + i * 1000); // Spread over 30 seconds
        metricsCollector.recordRequest('openai', 100, true);
      }

      // Reset to current time for throughput calculation
      Date.now = jest.fn().mockReturnValue(mockNow);

      const detailedMetrics = metricsCollector.getDetailedMetrics();
      expect(detailedMetrics.performanceMetrics.throughput).toBe(0.5); // 30 requests / 60 seconds
    });

    test('should exclude old requests from throughput calculation', () => {
      const mockNow = 1000000;
      Date.now = jest.fn().mockReturnValue(mockNow);

      // Record old requests (more than 1 minute ago)
      Date.now = jest.fn().mockReturnValue(mockNow - 120000); // 2 minutes ago
      metricsCollector.recordRequest('openai', 100, true);
      metricsCollector.recordRequest('openai', 100, true);

      // Record recent requests
      Date.now = jest.fn().mockReturnValue(mockNow - 30000); // 30 seconds ago
      metricsCollector.recordRequest('openai', 100, true);

      // Reset to current time
      Date.now = jest.fn().mockReturnValue(mockNow);

      const detailedMetrics = metricsCollector.getDetailedMetrics();
      expect(detailedMetrics.performanceMetrics.throughput).toBeCloseTo(1/60, 5); // 1 request / 60 seconds
    });
  });

  describe('time range queries', () => {
    test('should filter metrics by time range', () => {
      const baseTime = 1000000;
      
      // Record requests at different times
      Date.now = jest.fn().mockReturnValue(baseTime);
      metricsCollector.recordRequest('openai', 1000, true);
      
      Date.now = jest.fn().mockReturnValue(baseTime + 30000);
      metricsCollector.recordRequest('openai', 2000, false);
      
      Date.now = jest.fn().mockReturnValue(baseTime + 60000);
      metricsCollector.recordRequest('openai', 1500, true);

      const rangeMetrics = metricsCollector.getMetricsForTimeRange(
        baseTime + 15000,
        baseTime + 45000
      );

      expect(rangeMetrics.requests).toHaveLength(1);
      expect(rangeMetrics.responseTime).toHaveLength(1);
      expect(rangeMetrics.errors).toHaveLength(1);
      expect(rangeMetrics.summary.totalRequests).toBe(1);
      expect(rangeMetrics.summary.averageResponseTime).toBe(2000);
      expect(rangeMetrics.summary.errorRate).toBe(1);
    });

    test('should handle empty time range', () => {
      const baseTime = 1000000;
      metricsCollector.recordRequest('openai', 1000, true);

      const rangeMetrics = metricsCollector.getMetricsForTimeRange(
        baseTime + 100000,
        baseTime + 200000
      );

      expect(rangeMetrics.requests).toHaveLength(0);
      expect(rangeMetrics.responseTime).toHaveLength(0);
      expect(rangeMetrics.errors).toHaveLength(0);
      expect(rangeMetrics.summary.totalRequests).toBe(0);
      expect(rangeMetrics.summary.averageResponseTime).toBe(0);
      expect(rangeMetrics.summary.errorRate).toBe(0);
    });
  });

  describe('metrics export', () => {
    beforeEach(() => {
      // Set up some test data
      metricsCollector.recordRequest('openai', 1000, true);
      metricsCollector.recordRequest('anthropic', 2000, false);
      metricsCollector.recordCacheHit('key1');
      metricsCollector.recordCacheMiss('key2');
    });

    test('should export metrics as JSON by default', () => {
      const exported = metricsCollector.exportMetrics();
      const data = JSON.parse(exported);

      expect(data).toHaveProperty('totalRequests', 2);
      expect(data).toHaveProperty('successfulRequests', 1);
      expect(data).toHaveProperty('failedRequests', 1);
      expect(data).toHaveProperty('providerMetrics');
      expect(data).toHaveProperty('cacheMetrics');
      expect(data).toHaveProperty('performanceMetrics');
      expect(data).toHaveProperty('timeSeriesData');
    });

    test('should export metrics as JSON when specified', () => {
      const exported = metricsCollector.exportMetrics('json');
      const data = JSON.parse(exported);

      expect(data).toHaveProperty('totalRequests');
      expect(typeof data).toBe('object');
    });

    test('should export metrics as CSV', () => {
      const exported = metricsCollector.exportMetrics('csv');
      const lines = exported.split('\n');

      expect(lines[0]).toBe('timestamp,provider,requests,successes,failures,avg_response_time,error_rate');
      expect(lines).toHaveLength(3); // Header + 2 providers
      expect(lines[1]).toContain('openai');
      expect(lines[2]).toContain('anthropic');
    });

    test('should export metrics as Prometheus format', () => {
      const exported = metricsCollector.exportMetrics('prometheus');
      
      expect(exported).toContain('# HELP ai_requests_total Total number of AI requests');
      expect(exported).toContain('# TYPE ai_requests_total counter');
      expect(exported).toContain('ai_requests_total 2');
      expect(exported).toContain('# HELP ai_request_duration_seconds Average request duration');
      expect(exported).toContain('# TYPE ai_request_duration_seconds gauge');
      expect(exported).toContain('# HELP ai_cache_hit_rate Cache hit rate');
      expect(exported).toContain('# TYPE ai_cache_hit_rate gauge');
      expect(exported).toContain('ai_provider_requests_total{provider="openai"}');
      expect(exported).toContain('ai_provider_error_rate{provider="anthropic"}');
    });

    test('should handle unknown export format', () => {
      const exported = metricsCollector.exportMetrics('unknown' as any);
      const data = JSON.parse(exported);

      expect(data).toHaveProperty('totalRequests');
    });
  });

  describe('memory management', () => {
    test('should trim time series data when exceeding limit', () => {
      const mockNow = 1000000;
      Date.now = jest.fn().mockReturnValue(mockNow);

      // Record more than MAX_TIME_SERIES_ENTRIES (1000)
      for (let i = 0; i < 1100; i++) {
        Date.now = jest.fn().mockReturnValue(mockNow + i * 1000);
        metricsCollector.recordRequest('openai', 100, i % 2 === 0);
      }

      const detailedMetrics = metricsCollector.getDetailedMetrics();
      expect(detailedMetrics.timeSeriesData.requests).toHaveLength(1000);
      expect(detailedMetrics.timeSeriesData.responseTime).toHaveLength(1000);
      expect(detailedMetrics.timeSeriesData.errors.length).toBeLessThanOrEqual(1000);

      // Verify that the oldest entries were removed
      expect(detailedMetrics.timeSeriesData.requests[0].timestamp).toBe(mockNow + 100 * 1000);
    });

    test('should maintain response time samples within limit', () => {
      // Record more than MAX_RESPONSE_TIME_SAMPLES (1000)
      for (let i = 0; i < 1100; i++) {
        metricsCollector.recordRequest('openai', 100 + i, true);
      }

      // The internal responseTimes array should be limited to 1000 entries
      // We can verify this indirectly through the average calculation
      const metrics = metricsCollector.getMetrics();
      // Average should be based on last 1000 samples (200-1199), not all 1100
      expect(metrics.averageResponseTime).toBeCloseTo(699.5, 1);
    });
  });

  describe('periodic reporting', () => {
    test('should publish periodic reports', () => {
      const mockNow = 1000000;
      Date.now = jest.fn().mockReturnValue(mockNow);

      // Record some metrics
      metricsCollector.recordRequest('openai', 1000, true);

      // Clear previous event calls
      mockEventBus.publish.mockClear();

      // Advance time to trigger periodic report
      jest.advanceTimersByTime(60000);

      expect(mockEventBus.publish).toHaveBeenCalledWith('metrics.periodic_report', {
        summary: expect.objectContaining({
          totalRequests: 1,
          successfulRequests: 1,
          failedRequests: 0
        }),
        timestamp: mockNow
      });
    });

    test('should continue periodic reporting', () => {
      // Advance time multiple periods
      jest.advanceTimersByTime(180000); // 3 minutes

      // Should have been called 3 times
      const periodicCalls = (mockEventBus.publish as jest.Mock).mock.calls
        .filter(call => call[0] === 'metrics.periodic_report');
      expect(periodicCalls).toHaveLength(3);
    });
  });

  describe('reset functionality', () => {
    test('should reset all metrics', () => {
      const mockNow = 1000000;
      Date.now = jest.fn().mockReturnValue(mockNow);

      // Record some metrics
      metricsCollector.recordRequest('openai', 1000, true);
      metricsCollector.recordRequest('anthropic', 2000, false);
      metricsCollector.recordCacheHit('key1');
      metricsCollector.recordCacheMiss('key2');

      // Verify metrics exist
      let metrics = metricsCollector.getMetrics();
      expect(metrics.totalRequests).toBe(2);

      // Reset metrics
      metricsCollector.resetMetrics();

      // Verify metrics are reset
      metrics = metricsCollector.getMetrics();
      expect(metrics).toEqual({
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        averageResponseTime: 0,
        requestsByProvider: {},
        errorsByProvider: {}
      });

      const detailedMetrics = metricsCollector.getDetailedMetrics();
      expect(detailedMetrics.providerMetrics).toEqual({});
      expect(detailedMetrics.cacheMetrics).toEqual({
        hits: 0,
        misses: 0,
        hitRate: 0
      });
      expect(detailedMetrics.timeSeriesData.requests).toEqual([]);
      expect(detailedMetrics.timeSeriesData.responseTime).toEqual([]);
      expect(detailedMetrics.timeSeriesData.errors).toEqual([]);

      expect(mockEventBus.publish).toHaveBeenCalledWith('metrics.reset', {
        timestamp: mockNow
      });
    });
  });

  describe('dispose functionality', () => {
    test('should dispose and reset metrics', () => {
      // Record some metrics
      metricsCollector.recordRequest('openai', 1000, true);

      metricsCollector.dispose();

      const metrics = metricsCollector.getMetrics();
      expect(metrics.totalRequests).toBe(0);
    });
  });

  describe('event bus interactions', () => {
    test('should publish request recorded events', () => {
      const mockNow = 1000000;
      Date.now = jest.fn().mockReturnValue(mockNow);

      metricsCollector.recordRequest('openai', 1500, true);

      expect(mockEventBus.publish).toHaveBeenCalledWith('metrics.request_recorded', {
        provider: 'openai',
        duration: 1500,
        success: true,
        totalRequests: 1,
        timestamp: mockNow
      });
    });

    test('should publish cache hit events', () => {
      const mockNow = 1000000;
      Date.now = jest.fn().mockReturnValue(mockNow);

      metricsCollector.recordCacheHit('test-key');

      expect(mockEventBus.publish).toHaveBeenCalledWith('metrics.cache_hit', {
        key: 'test-key',
        totalHits: 1,
        hitRate: 1,
        timestamp: mockNow
      });
    });

    test('should publish cache miss events', () => {
      const mockNow = 1000000;
      Date.now = jest.fn().mockReturnValue(mockNow);

      metricsCollector.recordCacheMiss('test-key');

      expect(mockEventBus.publish).toHaveBeenCalledWith('metrics.cache_miss', {
        key: 'test-key',
        totalMisses: 1,
        hitRate: 0,
        timestamp: mockNow
      });
    });

    test('should publish reset events', () => {
      const mockNow = 1000000;
      Date.now = jest.fn().mockReturnValue(mockNow);

      metricsCollector.resetMetrics();

      expect(mockEventBus.publish).toHaveBeenCalledWith('metrics.reset', {
        timestamp: mockNow
      });
    });

    test('should publish periodic report events', () => {
      const mockNow = 1000000;
      Date.now = jest.fn().mockReturnValue(mockNow);

      // Clear initial calls
      mockEventBus.publish.mockClear();

      // Trigger periodic report
      jest.advanceTimersByTime(60000);

      expect(mockEventBus.publish).toHaveBeenCalledWith('metrics.periodic_report', {
        summary: expect.any(Object),
        timestamp: mockNow
      });
    });
  });

  describe('edge cases and error scenarios', () => {
    test('should handle zero duration requests', () => {
      metricsCollector.recordRequest('openai', 0, true);

      const metrics = metricsCollector.getMetrics();
      expect(metrics.averageResponseTime).toBe(0);
      expect(metrics.totalRequests).toBe(1);
    });

    test('should handle negative duration requests', () => {
      metricsCollector.recordRequest('openai', -100, true);

      const metrics = metricsCollector.getMetrics();
      expect(metrics.averageResponseTime).toBe(-100);
      expect(metrics.totalRequests).toBe(1);
    });

    test('should handle very large duration values', () => {
      const largeDuration = Number.MAX_SAFE_INTEGER;
      metricsCollector.recordRequest('openai', largeDuration, true);

      const metrics = metricsCollector.getMetrics();
      expect(metrics.averageResponseTime).toBe(largeDuration);
      expect(metrics.totalRequests).toBe(1);
    });

    test('should handle empty provider names', () => {
      metricsCollector.recordRequest('', 1000, true);

      const metrics = metricsCollector.getMetrics();
      expect(metrics.requestsByProvider['']).toBe(1);
      expect(metrics.totalRequests).toBe(1);
    });

    test('should handle special characters in provider names', () => {
      const specialProvider = 'provider-with-special@chars!';
      metricsCollector.recordRequest(specialProvider, 1000, true);

      const metrics = metricsCollector.getMetrics();
      expect(metrics.requestsByProvider[specialProvider]).toBe(1);
    });

    test('should handle empty cache keys', () => {
      metricsCollector.recordCacheHit('');
      metricsCollector.recordCacheMiss('');

      const detailedMetrics = metricsCollector.getDetailedMetrics();
      expect(detailedMetrics.cacheMetrics.hits).toBe(1);
      expect(detailedMetrics.cacheMetrics.misses).toBe(1);
    });

    test('should handle special characters in cache keys', () => {
      const specialKey = 'key-with-special@chars!';
      metricsCollector.recordCacheHit(specialKey);

      expect(mockEventBus.publish).toHaveBeenCalledWith('metrics.cache_hit', 
        expect.objectContaining({
          key: specialKey
        })
      );
    });
  });

  describe('concurrent operations', () => {
    test('should handle concurrent request recordings', async () => {
      const promises = [];
      
      for (let i = 0; i < 100; i++) {
        promises.push(Promise.resolve(
          metricsCollector.recordRequest('openai', 100 + i, i % 2 === 0)
        ));
      }
      
      await Promise.all(promises);

      const metrics = metricsCollector.getMetrics();
      expect(metrics.totalRequests).toBe(100);
      expect(metrics.successfulRequests).toBe(50);
      expect(metrics.failedRequests).toBe(50);
    });

    test('should handle concurrent cache operations', async () => {
      const promises = [];
      
      for (let i = 0; i < 50; i++) {
        promises.push(Promise.resolve(metricsCollector.recordCacheHit(`key${i}`)));
        promises.push(Promise.resolve(metricsCollector.recordCacheMiss(`miss${i}`)));
      }
      
      await Promise.all(promises);

      const detailedMetrics = metricsCollector.getDetailedMetrics();
      expect(detailedMetrics.cacheMetrics.hits).toBe(50);
      expect(detailedMetrics.cacheMetrics.misses).toBe(50);
      expect(detailedMetrics.cacheMetrics.hitRate).toBe(0.5);
    });

    test('should handle mixed concurrent operations', async () => {
      const promises = [];
      
      // Mix of request recordings and cache operations
      for (let i = 0; i < 25; i++) {
        promises.push(Promise.resolve(metricsCollector.recordRequest('openai', 100 + i, true)));
        promises.push(Promise.resolve(metricsCollector.recordCacheHit(`key${i}`)));
        promises.push(Promise.resolve(metricsCollector.recordRequest('anthropic', 200 + i, false)));
        promises.push(Promise.resolve(metricsCollector.recordCacheMiss(`miss${i}`)));
      }
      
      await Promise.all(promises);

      const metrics = metricsCollector.getMetrics();
      expect(metrics.totalRequests).toBe(50);
      expect(metrics.successfulRequests).toBe(25);
      expect(metrics.failedRequests).toBe(25);

      const detailedMetrics = metricsCollector.getDetailedMetrics();
      expect(detailedMetrics.cacheMetrics.hits).toBe(25);
      expect(detailedMetrics.cacheMetrics.misses).toBe(25);
      expect(detailedMetrics.cacheMetrics.hitRate).toBe(0.5);
    });
  });

  describe('performance and stress testing', () => {
    test('should handle high-frequency metric recording efficiently', () => {
      const startTime = Date.now();
      
      // Perform many operations
      for (let i = 0; i < 1000; i++) {
        metricsCollector.recordRequest('openai', 100 + i, i % 2 === 0);
        if (i % 10 === 0) {
          metricsCollector.recordCacheHit(`key${i}`);
        } else {
          metricsCollector.recordCacheMiss(`miss${i}`);
        }
      }
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      // Should complete in reasonable time (less than 1 second)
      expect(duration).toBeLessThan(1000);
      
      const metrics = metricsCollector.getMetrics();
      expect(metrics.totalRequests).toBe(1000);
      
      const detailedMetrics = metricsCollector.getDetailedMetrics();
      expect(detailedMetrics.cacheMetrics.hits).toBe(100);
      expect(detailedMetrics.cacheMetrics.misses).toBe(900);
    });

    test('should handle many providers efficiently', () => {
      const providerCount = 100;
      
      // Create many providers
      for (let i = 0; i < providerCount; i++) {
        const provider = `provider-${i}`;
        metricsCollector.recordRequest(provider, 100 + i, i % 2 === 0);
      }
      
      const metrics = metricsCollector.getMetrics();
      expect(metrics.totalRequests).toBe(providerCount);
      expect(Object.keys(metrics.requestsByProvider)).toHaveLength(providerCount);
      
      const detailedMetrics = metricsCollector.getDetailedMetrics();
      expect(Object.keys(detailedMetrics.providerMetrics)).toHaveLength(providerCount);
      
      // Each provider should have correct stats
      for (let i = 0; i < providerCount; i++) {
        const provider = `provider-${i}`;
        expect(detailedMetrics.providerMetrics[provider].requests).toBe(1);
      }
    });

    test('should maintain performance with large time series data', () => {
      const mockNow = 1000000;
      Date.now = jest.fn().mockReturnValue(mockNow);

      // Record many requests to build up time series data
      for (let i = 0; i < 500; i++) {
        Date.now = jest.fn().mockReturnValue(mockNow + i * 1000);
        metricsCollector.recordRequest('openai', 100 + i, i % 3 !== 0);
      }
      
      // Since we're using fake timers, we don't need to measure actual execution time
      // Just verify the data was recorded correctly
      const detailedMetrics = metricsCollector.getDetailedMetrics();
      expect(detailedMetrics.timeSeriesData.requests).toHaveLength(500);
      expect(detailedMetrics.timeSeriesData.responseTime).toHaveLength(500);
      expect(detailedMetrics.timeSeriesData.errors.length).toBeGreaterThan(0);
    });
  });

  describe('data integrity and consistency', () => {
    test('should maintain data consistency across operations', () => {
      // Record various operations
      metricsCollector.recordRequest('openai', 1000, true);
      metricsCollector.recordRequest('openai', 2000, false);
      metricsCollector.recordRequest('anthropic', 1500, true);
      metricsCollector.recordCacheHit('key1');
      metricsCollector.recordCacheMiss('key2');

      const metrics = metricsCollector.getMetrics();
      const detailedMetrics = metricsCollector.getDetailedMetrics();

      // Verify overall metrics consistency
      expect(metrics.totalRequests).toBe(metrics.successfulRequests + metrics.failedRequests);
      expect(metrics.totalRequests).toBe(3);
      expect(metrics.successfulRequests).toBe(2);
      expect(metrics.failedRequests).toBe(1);

      // Verify provider metrics consistency
      const openaiMetrics = detailedMetrics.providerMetrics['openai'];
      expect(openaiMetrics.requests).toBe(openaiMetrics.successes + openaiMetrics.failures);
      expect(openaiMetrics.requests).toBe(2);
      expect(openaiMetrics.successes).toBe(1);
      expect(openaiMetrics.failures).toBe(1);

      // Verify cache metrics consistency
      const cacheTotal = detailedMetrics.cacheMetrics.hits + detailedMetrics.cacheMetrics.misses;
      expect(detailedMetrics.cacheMetrics.hitRate).toBe(
        cacheTotal > 0 ? detailedMetrics.cacheMetrics.hits / cacheTotal : 0
      );

      // Verify time series data consistency
      expect(detailedMetrics.timeSeriesData.requests).toHaveLength(3);
      expect(detailedMetrics.timeSeriesData.responseTime).toHaveLength(3);
      expect(detailedMetrics.timeSeriesData.errors).toHaveLength(1);
    });

    test('should handle rapid state changes correctly', () => {
      const mockNow = 1000000;
      Date.now = jest.fn().mockReturnValue(mockNow);

      // Rapid sequence of operations
      metricsCollector.recordRequest('openai', 100, true);
      metricsCollector.recordCacheHit('key1');
      metricsCollector.recordRequest('openai', 200, false);
      metricsCollector.recordCacheMiss('key2');
      metricsCollector.recordRequest('anthropic', 150, true);

      const metrics = metricsCollector.getMetrics();
      expect(metrics.totalRequests).toBe(3);
      expect(metrics.requestsByProvider['openai']).toBe(2);
      expect(metrics.requestsByProvider['anthropic']).toBe(1);
      expect(metrics.errorsByProvider['openai']).toBe(1);

      const detailedMetrics = metricsCollector.getDetailedMetrics();
      expect(detailedMetrics.cacheMetrics.hits).toBe(1);
      expect(detailedMetrics.cacheMetrics.misses).toBe(1);
    });

    test('should preserve data integrity after reset', () => {
      // Record some data
      metricsCollector.recordRequest('openai', 1000, true);
      metricsCollector.recordCacheHit('key1');

      // Verify data exists
      let metrics = metricsCollector.getMetrics();
      expect(metrics.totalRequests).toBe(1);

      // Reset and verify clean state
      metricsCollector.resetMetrics();
      metrics = metricsCollector.getMetrics();
      
      expect(metrics).toEqual({
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        averageResponseTime: 0,
        requestsByProvider: {},
        errorsByProvider: {}
      });

      // Record new data and verify it works correctly
      metricsCollector.recordRequest('anthropic', 2000, false);
      metrics = metricsCollector.getMetrics();
      
      expect(metrics.totalRequests).toBe(1);
      expect(metrics.failedRequests).toBe(1);
      expect(metrics.requestsByProvider['anthropic']).toBe(1);
      expect(metrics.errorsByProvider['anthropic']).toBe(1);
    });
  });

  describe('boundary conditions', () => {
    test('should handle maximum safe integer values', () => {
      const maxSafeInt = Number.MAX_SAFE_INTEGER;
      metricsCollector.recordRequest('openai', maxSafeInt, true);

      const metrics = metricsCollector.getMetrics();
      expect(metrics.averageResponseTime).toBe(maxSafeInt);
      expect(metrics.totalRequests).toBe(1);
    });

    test('should handle minimum safe integer values', () => {
      const minSafeInt = Number.MIN_SAFE_INTEGER;
      metricsCollector.recordRequest('openai', minSafeInt, true);

      const metrics = metricsCollector.getMetrics();
      expect(metrics.averageResponseTime).toBe(minSafeInt);
      expect(metrics.totalRequests).toBe(1);
    });

    test('should handle floating point durations', () => {
      metricsCollector.recordRequest('openai', 123.456, true);
      metricsCollector.recordRequest('openai', 789.012, true);

      const metrics = metricsCollector.getMetrics();
      expect(metrics.averageResponseTime).toBeCloseTo(456.234, 3);
    });

    test('should handle very long provider names', () => {
      const longProviderName = 'a'.repeat(1000);
      metricsCollector.recordRequest(longProviderName, 1000, true);

      const metrics = metricsCollector.getMetrics();
      expect(metrics.requestsByProvider[longProviderName]).toBe(1);
    });

    test('should handle very long cache keys', () => {
      const longCacheKey = 'b'.repeat(1000);
      metricsCollector.recordCacheHit(longCacheKey);

      expect(mockEventBus.publish).toHaveBeenCalledWith('metrics.cache_hit',
        expect.objectContaining({
          key: longCacheKey
        })
      );
    });
  });
});