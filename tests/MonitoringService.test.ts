/**
 * @file MonitoringService.test.ts
 * @description Comprehensive test suite for MonitoringService
 */

import { MonitoringService, PerformanceTimer } from '../src/services/crosscutting/MonitoringService';
import { EventBus } from '../src/utils/eventBus';
import { 
  IEventBus, 
  IMonitoringService, 
  ServiceHealthStatus, 
  MonitoringMetrics, 
  ServiceHealthMap, 
  HealthChecker 
} from '../src/services/interfaces';

describe('MonitoringService', () => {
  let monitoringService: MonitoringService;
  let mockEventBus: jest.Mocked<IEventBus>;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    // Create mock event bus
    mockEventBus = {
      publish: jest.fn().mockResolvedValue(undefined),
      subscribe: jest.fn().mockReturnValue(() => {}),
      subscribeOnce: jest.fn().mockReturnValue(() => {}),
      unsubscribe: jest.fn(),
      clear: jest.fn(),
      getSubscriptionCount: jest.fn().mockReturnValue(0),
    };

    // Create monitoring service instance
    monitoringService = new MonitoringService(mockEventBus);
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  describe('constructor', () => {
    test('should initialize with default configuration', () => {
      expect(monitoringService).toBeInstanceOf(MonitoringService);
      expect(mockEventBus.subscribe).toHaveBeenCalledWith('agent.*', expect.any(Function));
      expect(mockEventBus.subscribe).toHaveBeenCalledWith('tool.execution_completed', expect.any(Function));
      expect(mockEventBus.subscribe).toHaveBeenCalledWith('*.error', expect.any(Function));
      expect(mockEventBus.subscribe).toHaveBeenCalledWith('performance.*', expect.any(Function));
    });

    test('should initialize with custom configuration', () => {
      const customConfig = {
        healthCheckInterval: 60000,
        maxHistoryEntries: 5000,
        cleanupInterval: 600000
      };

      const customService = new MonitoringService(mockEventBus, customConfig);
      expect(customService).toBeInstanceOf(MonitoringService);
    });

    test('should start periodic tasks', () => {
      // Verify that setInterval was called for periodic tasks
      expect(setInterval).toHaveBeenCalledWith(expect.any(Function), expect.any(Number));
    });
  });

  describe('recordMetric', () => {
    test('should record a simple metric', () => {
      monitoringService.recordMetric('test.metric', 42);

      const metrics = monitoringService.getMetrics();
      expect(metrics.gauges['test.metric']).toBe(42);
      expect(mockEventBus.publish).toHaveBeenCalledWith('monitoring.metric_recorded', 
        expect.objectContaining({
          name: 'test.metric',
          value: 42,
          timestamp: expect.any(Number)
        })
      );
    });

    test('should record metric with tags', () => {
      const tags = { service: 'api', environment: 'production' };
      monitoringService.recordMetric('response.time', 150, tags);

      const metrics = monitoringService.getMetrics();
      const expectedKey = 'response.time{environment=production,service=api}';
      expect(metrics.gauges[expectedKey]).toBe(150);
    });

    test('should handle multiple metrics with same name but different tags', () => {
      monitoringService.recordMetric('cpu.usage', 45, { host: 'server1' });
      monitoringService.recordMetric('cpu.usage', 67, { host: 'server2' });

      const metrics = monitoringService.getMetrics();
      expect(metrics.gauges['cpu.usage{host=server1}']).toBe(45);
      expect(metrics.gauges['cpu.usage{host=server2}']).toBe(67);
    });

    test('should update existing metric values', () => {
      monitoringService.recordMetric('memory.usage', 100);
      monitoringService.recordMetric('memory.usage', 150);

      const metrics = monitoringService.getMetrics();
      expect(metrics.gauges['memory.usage']).toBe(150);
    });

    test('should handle zero and negative values', () => {
      monitoringService.recordMetric('zero.metric', 0);
      monitoringService.recordMetric('negative.metric', -50);

      const metrics = monitoringService.getMetrics();
      expect(metrics.gauges['zero.metric']).toBe(0);
      expect(metrics.gauges['negative.metric']).toBe(-50);
    });

    test('should handle decimal values', () => {
      monitoringService.recordMetric('decimal.metric', 3.14159);

      const metrics = monitoringService.getMetrics();
      expect(metrics.gauges['decimal.metric']).toBe(3.14159);
    });
  });

  describe('incrementCounter', () => {
    test('should increment a counter from zero', () => {
      monitoringService.incrementCounter('requests.total');

      const metrics = monitoringService.getMetrics();
      expect(metrics.counters['requests.total']).toBe(1);
      expect(mockEventBus.publish).toHaveBeenCalledWith('monitoring.counter_incremented', 
        expect.objectContaining({
          name: 'requests.total',
          value: 1,
          timestamp: expect.any(Number)
        })
      );
    });

    test('should increment existing counter', () => {
      monitoringService.incrementCounter('api.calls');
      monitoringService.incrementCounter('api.calls');
      monitoringService.incrementCounter('api.calls');

      const metrics = monitoringService.getMetrics();
      expect(metrics.counters['api.calls']).toBe(3);
    });

    test('should increment counter with tags', () => {
      const tags = { method: 'GET', status: '200' };
      monitoringService.incrementCounter('http.requests', tags);
      monitoringService.incrementCounter('http.requests', tags);

      const metrics = monitoringService.getMetrics();
      const expectedKey = 'http.requests{method=GET,status=200}';
      expect(metrics.counters[expectedKey]).toBe(2);
    });

    test('should handle multiple counters with different tags', () => {
      monitoringService.incrementCounter('errors', { type: 'validation' });
      monitoringService.incrementCounter('errors', { type: 'network' });
      monitoringService.incrementCounter('errors', { type: 'validation' });

      const metrics = monitoringService.getMetrics();
      expect(metrics.counters['errors{type=validation}']).toBe(2);
      expect(metrics.counters['errors{type=network}']).toBe(1);
    });
  });

  describe('recordTiming', () => {
    test('should record a timing metric', () => {
      monitoringService.recordTiming('database.query', 250);

      const metrics = monitoringService.getMetrics();
      const timing = metrics.timings['database.query'];
      expect(timing.count).toBe(1);
      expect(timing.total).toBe(250);
      expect(timing.avg).toBe(250);
      expect(timing.min).toBe(250);
      expect(timing.max).toBe(250);
    });

    test('should aggregate multiple timing measurements', () => {
      monitoringService.recordTiming('api.response', 100);
      monitoringService.recordTiming('api.response', 200);
      monitoringService.recordTiming('api.response', 300);

      const metrics = monitoringService.getMetrics();
      const timing = metrics.timings['api.response'];
      expect(timing.count).toBe(3);
      expect(timing.total).toBe(600);
      expect(timing.avg).toBe(200);
      expect(timing.min).toBe(100);
      expect(timing.max).toBe(300);
    });

    test('should record timing with tags', () => {
      const tags = { endpoint: '/users', method: 'GET' };
      monitoringService.recordTiming('http.duration', 150, tags);

      const metrics = monitoringService.getMetrics();
      const expectedKey = 'http.duration{endpoint=/users,method=GET}';
      expect(metrics.timings[expectedKey]).toBeDefined();
      expect(metrics.timings[expectedKey].avg).toBe(150);
    });

    test('should handle zero duration', () => {
      monitoringService.recordTiming('instant.operation', 0);

      const metrics = monitoringService.getMetrics();
      const timing = metrics.timings['instant.operation'];
      expect(timing.min).toBe(0);
      expect(timing.max).toBe(0);
      expect(timing.avg).toBe(0);
    });

    test('should maintain recent timing values', () => {
      // Record many timing values
      for (let i = 1; i <= 150; i++) {
        monitoringService.recordTiming('test.timing', i);
      }

      const metrics = monitoringService.getMetrics();
      const timing = metrics.timings['test.timing'];
      expect(timing.count).toBe(150);
      // Recent values should be limited to 100
    });

    test('should publish timing events', () => {
      monitoringService.recordTiming('test.duration', 500, { operation: 'test' });

      expect(mockEventBus.publish).toHaveBeenCalledWith('monitoring.timing_recorded', 
        expect.objectContaining({
          name: 'test.duration',
          duration: 500,
          tags: { operation: 'test' },
          timestamp: expect.any(Number)
        })
      );
    });
  });

  describe('recordServiceHealth', () => {
    test('should record healthy service status', () => {
      monitoringService.recordServiceHealth('api-service', 'healthy');

      const healthMap = monitoringService.getServiceHealth();
      expect(healthMap['api-service'].status).toBe('healthy');
      expect(healthMap['api-service'].lastCheck).toBeDefined();
      expect(healthMap['api-service'].metadata?.checkCount).toBe(1);
      expect(healthMap['api-service'].metadata?.consecutiveFailures).toBe(0);
    });

    test('should record unhealthy service status', () => {
      monitoringService.recordServiceHealth('database', 'unhealthy');

      const healthMap = monitoringService.getServiceHealth();
      expect(healthMap['database'].status).toBe('unhealthy');
      expect(healthMap['database'].metadata?.consecutiveFailures).toBe(1);
    });

    test('should track consecutive failures', () => {
      monitoringService.recordServiceHealth('failing-service', 'unhealthy');
      monitoringService.recordServiceHealth('failing-service', 'unhealthy');
      monitoringService.recordServiceHealth('failing-service', 'unhealthy');

      const healthMap = monitoringService.getServiceHealth();
      expect(healthMap['failing-service'].metadata?.consecutiveFailures).toBe(3);
    });

    test('should reset consecutive failures on recovery', () => {
      monitoringService.recordServiceHealth('recovering-service', 'unhealthy');
      monitoringService.recordServiceHealth('recovering-service', 'unhealthy');
      monitoringService.recordServiceHealth('recovering-service', 'healthy');

      const healthMap = monitoringService.getServiceHealth();
      expect(healthMap['recovering-service'].metadata?.consecutiveFailures).toBe(0);
    });

    test('should publish health update events', () => {
      monitoringService.recordServiceHealth('test-service', 'degraded');

      expect(mockEventBus.publish).toHaveBeenCalledWith('monitoring.health_updated', 
        expect.objectContaining({
          serviceName: 'test-service',
          status: 'degraded',
          timestamp: expect.any(Number)
        })
      );
    });

    test('should publish health alerts for unhealthy services', () => {
      monitoringService.recordServiceHealth('critical-service', 'unhealthy');

      expect(mockEventBus.publish).toHaveBeenCalledWith('monitoring.health_alert', 
        expect.objectContaining({
          serviceName: 'critical-service',
          status: 'unhealthy',
          timestamp: expect.any(Number)
        })
      );
    });

    test('should track status change timestamps', () => {
      const startTime = Date.now();
      jest.spyOn(Date, 'now').mockReturnValue(startTime);

      monitoringService.recordServiceHealth('time-service', 'healthy');

      jest.spyOn(Date, 'now').mockReturnValue(startTime + 60000);
      monitoringService.recordServiceHealth('time-service', 'unhealthy');

      const healthMap = monitoringService.getServiceHealth();
      expect(healthMap['time-service'].metadata?.lastStatusChange).toBe(startTime + 60000);
    });
  });

  describe('health checks', () => {
    test('should start health check for a service', async () => {
      const mockChecker: HealthChecker = {
        check: jest.fn().mockResolvedValue({ status: 'healthy' as ServiceHealthStatus })
      };

      monitoringService.startHealthCheck('test-service', mockChecker);

      // Advance time to trigger health check
      jest.advanceTimersByTime(30000);

      expect(mockChecker.check).toHaveBeenCalled();
    });

    test('should stop health check for a service', () => {
      const mockChecker: HealthChecker = {
        check: jest.fn().mockResolvedValue({ status: 'healthy' as ServiceHealthStatus })
      };

      monitoringService.startHealthCheck('test-service', mockChecker);
      monitoringService.stopHealthCheck('test-service');

      // Advance time - health check should not be called
      jest.advanceTimersByTime(60000);

      expect(mockChecker.check).toHaveBeenCalledTimes(1); // Only initial call
    });

    test('should handle health check errors', async () => {
      const mockChecker: HealthChecker = {
        check: jest.fn().mockRejectedValue(new Error('Health check failed'))
      };

      monitoringService.startHealthCheck('error-service', mockChecker);

      // Advance time to trigger health check
      jest.advanceTimersByTime(30000);

      const healthMap = monitoringService.getServiceHealth();
      expect(healthMap['error-service'].status).toBe('unhealthy');
      expect(mockEventBus.publish).toHaveBeenCalledWith('monitoring.health_check_error', 
        expect.objectContaining({
          serviceName: 'error-service',
          error: 'Health check failed'
        })
      );
    });

    test('should perform periodic health checks', async () => {
      const mockChecker: HealthChecker = {
        check: jest.fn().mockResolvedValue({ status: 'healthy' as ServiceHealthStatus })
      };

      monitoringService.startHealthCheck('periodic-service', mockChecker);

      // Advance time multiple intervals
      jest.advanceTimersByTime(30000); // First check
      jest.advanceTimersByTime(30000); // Second check
      jest.advanceTimersByTime(30000); // Third check

      expect(mockChecker.check).toHaveBeenCalledTimes(3);
    });

    test('should handle health check with metadata', async () => {
      const mockChecker: HealthChecker = {
        check: jest.fn().mockResolvedValue({ 
          status: 'degraded' as ServiceHealthStatus,
          message: 'High latency detected',
          metadata: { latency: 500, connections: 10 }
        })
      };

      monitoringService.startHealthCheck('metadata-service', mockChecker);
      jest.advanceTimersByTime(30000);

      const healthMap = monitoringService.getServiceHealth();
      expect(healthMap['metadata-service'].message).toBe('High latency detected');
    });
  });

  describe('getMetrics', () => {
    beforeEach(() => {
      // Setup some test data
      monitoringService.recordMetric('cpu.usage', 75);
      monitoringService.incrementCounter('requests.total');
      monitoringService.recordTiming('response.time', 200);
      monitoringService.recordServiceHealth('api', 'healthy');
    });

    test('should return comprehensive metrics', () => {
      const metrics = monitoringService.getMetrics();

      expect(metrics).toHaveProperty('counters');
      expect(metrics).toHaveProperty('timings');
      expect(metrics).toHaveProperty('gauges');
      expect(metrics).toHaveProperty('healthChecks');
    });

    test('should include all recorded counters', () => {
      const metrics = monitoringService.getMetrics();
      expect(metrics.counters['requests.total']).toBe(1);
    });

    test('should include all recorded gauges', () => {
      const metrics = monitoringService.getMetrics();
      expect(metrics.gauges['cpu.usage']).toBe(75);
    });

    test('should include timing statistics', () => {
      const metrics = monitoringService.getMetrics();
      expect(metrics.timings['response.time']).toEqual({
        count: 1,
        total: 200,
        avg: 200,
        min: 200,
        max: 200
      });
    });

    test('should include health check status', () => {
      const metrics = monitoringService.getMetrics();
      expect(metrics.healthChecks['api'].status).toBe('healthy');
    });
  });

  describe('exportMetrics', () => {
    beforeEach(() => {
      monitoringService.recordMetric('test.gauge', 42);
      monitoringService.incrementCounter('test.counter');
      monitoringService.recordTiming('test.timing', 100);
    });

    test('should export metrics as JSON by default', () => {
      const exported = monitoringService.exportMetrics();
      const parsed = JSON.parse(exported);

      expect(parsed).toHaveProperty('timestamp');
      expect(parsed).toHaveProperty('metrics');
      expect(parsed).toHaveProperty('summary');
      expect(parsed.metrics.gauges['test.gauge']).toBe(42);
      expect(parsed.metrics.counters['test.counter']).toBe(1);
    });

    test('should export metrics as JSON when specified', () => {
      const exported = monitoringService.exportMetrics('json');
      const parsed = JSON.parse(exported);

      expect(parsed.metrics).toBeDefined();
      expect(parsed.summary).toBeDefined();
    });

    test('should export metrics in Prometheus format', () => {
      const exported = monitoringService.exportMetrics('prometheus');

      expect(exported).toContain('# TYPE test.counter counter');
      expect(exported).toContain('test.counter 1');
      expect(exported).toContain('# TYPE test.gauge gauge');
      expect(exported).toContain('test.gauge 42');
      expect(exported).toContain('# TYPE test.timing_duration summary');
    });

    test('should include timestamps in Prometheus format', () => {
      const exported = monitoringService.exportMetrics('prometheus');
      const lines = exported.split('\n');
      const metricLines = lines.filter(line => !line.startsWith('#') && line.trim());
      
      metricLines.forEach(line => {
        expect(line).toMatch(/\d+$/); // Should end with timestamp
      });
    });
  });

  describe('clearMetrics', () => {
    beforeEach(() => {
      monitoringService.recordMetric('test.gauge', 100);
      monitoringService.incrementCounter('test.counter');
      monitoringService.recordTiming('test.timing', 50);
    });

    test('should clear all metrics', () => {
      monitoringService.clearMetrics();

      const metrics = monitoringService.getMetrics();
      expect(Object.keys(metrics.counters)).toHaveLength(0);
      expect(Object.keys(metrics.gauges)).toHaveLength(0);
      expect(Object.keys(metrics.timings)).toHaveLength(0);
    });

    test('should publish metrics cleared event', () => {
      monitoringService.clearMetrics();

      expect(mockEventBus.publish).toHaveBeenCalledWith('monitoring.metrics_cleared', 
        expect.objectContaining({
          clearedCounts: expect.objectContaining({
            counters: expect.any(Number),
            timings: expect.any(Number),
            gauges: expect.any(Number),
            history: expect.any(Number)
          }),
          timestamp: expect.any(Number)
        })
      );
    });

    test('should preserve health checks when clearing metrics', () => {
      monitoringService.recordServiceHealth('persistent-service', 'healthy');
      monitoringService.clearMetrics();

      const healthMap = monitoringService.getServiceHealth();
      expect(healthMap['persistent-service']).toBeDefined();
    });
  });

  describe('createTimer', () => {
    test('should create a performance timer', () => {
      const timer = monitoringService.createTimer('test.operation');
      expect(timer).toBeInstanceOf(PerformanceTimer);
    });

    test('should create timer with tags', () => {
      const timer = monitoringService.createTimer('tagged.operation', { service: 'api' });
      expect(timer).toBeInstanceOf(PerformanceTimer);
    });

    test('should record timing when timer ends', () => {
      const timer = monitoringService.createTimer('timed.operation');
      
      jest.advanceTimersByTime(100);
      const duration = timer.end();

      expect(duration).toBeGreaterThan(0);
      
      const metrics = monitoringService.getMetrics();
      expect(metrics.timings['timed.operation']).toBeDefined();
      expect(metrics.timings['timed.operation'].count).toBe(1);
    });
  });

  describe('event listeners', () => {
    test('should monitor agent operations', () => {
      const agentHandler = (mockEventBus.subscribe as jest.Mock).mock.calls
        .find(call => call[0] === 'agent.*')?.[1];

      expect(agentHandler).toBeDefined();

      agentHandler({});

      const metrics = monitoringService.getMetrics();
      expect(metrics.counters['agent.operations']).toBe(1);
    });

    test('should monitor tool executions', () => {
      const toolHandler = (mockEventBus.subscribe as jest.Mock).mock.calls
        .find(call => call[0] === 'tool.execution_completed')?.[1];

      expect(toolHandler).toBeDefined();

      const toolData = { duration: 250 };
      toolHandler(toolData);

      const metrics = monitoringService.getMetrics();
      expect(metrics.counters['tool.executions']).toBe(1);
      expect(metrics.timings['tool.execution_time']).toBeDefined();
      expect(metrics.timings['tool.execution_time'].avg).toBe(250);
    });

    test('should monitor errors', () => {
      const errorHandler = (mockEventBus.subscribe as jest.Mock).mock.calls
        .find(call => call[0] === '*.error')?.[1];

      expect(errorHandler).toBeDefined();

      const errorData = { source: 'api' };
      errorHandler(errorData);

      const metrics = monitoringService.getMetrics();
      expect(metrics.counters['system.errors{source=api}']).toBe(1);
    });

    test('should monitor performance events', () => {
      const perfHandler = (mockEventBus.subscribe as jest.Mock).mock.calls
        .find(call => call[0] === 'performance.*')?.[1];

      expect(perfHandler).toBeDefined();

      const perfData = { duration: 150, operation: 'database_query' };
      perfHandler(perfData);

      const metrics = monitoringService.getMetrics();
      expect(metrics.timings['performance.operations{operation=database_query}']).toBeDefined();
    });

    test('should handle events without expected data gracefully', () => {
      const handlers = [
        (mockEventBus.subscribe as jest.Mock).mock.calls.find(call => call[0] === 'agent.*')?.[1],
        (mockEventBus.subscribe as jest.Mock).mock.calls.find(call => call[0] === 'tool.execution_completed')?.[1],
        (mockEventBus.subscribe as jest.Mock).mock.calls.find(call => call[0] === '*.error')?.[1],
        (mockEventBus.subscribe as jest.Mock).mock.calls.find(call => call[0] === 'performance.*')?.[1]
      ];

      handlers.forEach(handler => {
        expect(() => {
          handler({});
          handler(null);
          handler(undefined);
        }).not.toThrow();
      });
    });
  });

  describe('periodic tasks', () => {
    test('should clean up old history entries', () => {
      // Add many metrics to create history
      for (let i = 0; i < 100; i++) {
        monitoringService.recordMetric(`test.metric.${i}`, i);
      }

      // Advance time to trigger cleanup
      jest.advanceTimersByTime(300000); // 5 minutes

      expect(mockEventBus.publish).toHaveBeenCalledWith('monitoring.history_cleaned', 
        expect.any(Object)
      );
    });

    test('should publish periodic metrics summary', () => {
      // Advance time to trigger summary publication
      jest.advanceTimersByTime(60000); // 1 minute

      expect(mockEventBus.publish).toHaveBeenCalledWith('monitoring.metrics_summary', 
        expect.objectContaining({
          summary: expect.any(Object),
          timestamp: expect.any(Number)
        })
      );
    });
  });

  describe('performance and memory management', () => {
    test('should handle high-volume metrics efficiently', () => {
      const startTime = Date.now();

      // Record many metrics
      for (let i = 0; i < 1000; i++) {
        monitoringService.recordMetric(`perf.metric.${i}`, i);
        monitoringService.incrementCounter(`perf.counter.${i}`);
        monitoringService.recordTiming(`perf.timing.${i}`, i);
      }

      const endTime = Date.now();
      const duration = endTime - startTime;

      expect(duration).toBeLessThan(5000); // Should complete in reasonable time
    });

    test('should limit history entries', () => {
      // Add many metrics to test history limiting
      for (let i = 0; i < 15000; i++) {
        monitoringService.recordMetric('history.test', i);
      }

      // History should be limited
      const exported = monitoringService.exportMetrics('json');
      const parsed = JSON.parse(exported);
      expect(parsed.summary.historyEntries).toBeLessThanOrEqual(10000);
    });

    test('should handle concurrent metric recording', async () => {
      const promises = [];

      for (let i = 0; i < 100; i++) {
        promises.push(Promise.resolve().then(() => {
          monitoringService.recordMetric(`concurrent.${i}`, i);
          monitoringService.incrementCounter(`concurrent.counter.${i}`);
          monitoringService.recordTiming(`concurrent.timing.${i}`, i);
        }));
      }

      await Promise.all(promises);

      const metrics = monitoringService.getMetrics();
      expect(Object.keys(metrics.gauges).length).toBeGreaterThan(90);
      expect(Object.keys(metrics.counters).length).toBeGreaterThan(90);
      expect(Object.keys(metrics.timings).length).toBeGreaterThan(90);
    });
  });

  describe('edge cases and error handling', () => {
    test('should handle invalid metric names gracefully', () => {
      expect(() => {
        monitoringService.recordMetric('', 100);
        monitoringService.recordMetric(null as any, 100);
        monitoringService.recordMetric(undefined as any, 100);
      }).not.toThrow();
    });

    test('should handle invalid metric values gracefully', () => {
      expect(() => {
        monitoringService.recordMetric('test', NaN);
        monitoringService.recordMetric('test', Infinity);
        monitoringService.recordMetric('test', -Infinity);
      }).not.toThrow();
    });

    test('should handle invalid tags gracefully', () => {
      expect(() => {
        monitoringService.recordMetric('test', 100, null as any);
        monitoringService.recordMetric('test', 100, undefined as any);
        monitoringService.recordMetric('test', 100, { '': 'empty-key' });
      }).not.toThrow();
    });

    test('should handle very long metric names', () => {
      const longName = 'a'.repeat(1000);
      expect(() => {
        monitoringService.recordMetric(longName, 100);
      }).not.toThrow();
    });

    test('should handle special characters in metric names and tags', () => {
      expect(() => {
        monitoringService.recordMetric('metric.with-special_chars@123', 100, {
          'tag-with-special_chars': 'value@123',
          'unicode-tag': '测试值'
        });
      }).not.toThrow();
    });

    test('should handle circular references in tags', () => {
      const circularTags: any = { name: 'circular' };
      circularTags.self = circularTags;

      expect(() => {
        monitoringService.recordMetric('circular.test', 100, circularTags);
      }).not.toThrow();
    });
  });

  describe('integration scenarios', () => {
    test('should support comprehensive application monitoring', () => {
      // Simulate a realistic monitoring scenario
      
      // Application startup metrics
      monitoringService.recordMetric('app.startup_time', 2500);
      monitoringService.recordServiceHealth('database', 'healthy');
      monitoringService.recordServiceHealth('cache', 'healthy');
      monitoringService.recordServiceHealth('api', 'healthy');

      // Runtime metrics
      for (let i = 0; i < 10; i++) {
        monitoringService.incrementCounter('http.requests', { method: 'GET', status: '200' });
        monitoringService.recordTiming('http.response_time', 100 + Math.random() * 200, { endpoint: '/api/users' });
        monitoringService.recordMetric('memory.usage', 50 + Math.random() * 30);
      }

      // Error scenarios
      monitoringService.incrementCounter('http.requests', { method: 'POST', status: '500' });
      monitoringService.recordServiceHealth('external_api', 'unhealthy');

      const metrics = monitoringService.getMetrics();
      const healthMap = monitoringService.getServiceHealth();

      // Verify comprehensive monitoring data
      expect(metrics.counters['http.requests{method=GET,status=200}']).toBe(10);
      expect(metrics.counters['http.requests{method=POST,status=500}']).toBe(1);
      expect(metrics.timings['http.response_time{endpoint=/api/users}']).toBeDefined();
      expect(metrics.gauges['app.startup_time']).toBe(2500);
      
      expect(healthMap['database'].status).toBe('healthy');
      expect(healthMap['external_api'].status).toBe('unhealthy');
    });

    test('should support custom health check implementations', async () => {
      const customHealthChecker: HealthChecker = {
        check: async () => {
          // Simulate complex health check logic
          const cpuUsage = Math.random() * 100;
          const memoryUsage = Math.random() * 100;
          
          if (cpuUsage > 90 || memoryUsage > 95) {
            return {
              status: 'unhealthy' as ServiceHealthStatus,
              message: 'Resource exhaustion detected',
              metadata: { cpuUsage, memoryUsage }
            };
          } else if (cpuUsage > 70 || memoryUsage > 80) {
            return {
              status: 'degraded' as ServiceHealthStatus,
              message: 'High resource usage',
              metadata: { cpuUsage, memoryUsage }
            };
          } else {
            return {
              status: 'healthy' as ServiceHealthStatus,
              message: 'All systems operational',
              metadata: { cpuUsage, memoryUsage }
            };
          }
        }
      };

      monitoringService.startHealthCheck('resource-monitor', customHealthChecker);
      jest.advanceTimersByTime(30000);

      const healthMap = monitoringService.getServiceHealth();
      expect(healthMap['resource-monitor']).toBeDefined();
      expect(['healthy', 'degraded', 'unhealthy']).toContain(healthMap['resource-monitor'].status);
    });

    test('should handle monitoring service lifecycle', () => {
      // Start multiple health checks
      const services = ['service1', 'service2', 'service3'];
      services.forEach(service => {
        const checker: HealthChecker = {
          check: jest.fn().mockResolvedValue({ status: 'healthy' as ServiceHealthStatus })
        };
        monitoringService.startHealthCheck(service, checker);
      });

      // Record various metrics
      monitoringService.recordMetric('lifecycle.test', 100);
      monitoringService.incrementCounter('lifecycle.counter');
      monitoringService.recordTiming('lifecycle.timing', 50);

      // Stop all health checks
      services.forEach(service => {
        monitoringService.stopHealthCheck(service);
      });

      // Clear all metrics
      monitoringService.clearMetrics();

      const metrics = monitoringService.getMetrics();
      expect(Object.keys(metrics.counters)).toHaveLength(0);
      expect(Object.keys(metrics.gauges)).toHaveLength(0);
      expect(Object.keys(metrics.timings)).toHaveLength(0);
    });
  });
});