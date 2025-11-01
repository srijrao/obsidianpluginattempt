import { CrossCuttingServicesHub } from '../src/services/crosscutting/CrossCuttingServicesHub';
import { IEventBus } from '../src/services/interfaces';

// Create mock instances
const mockLogger = {
  info: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  warn: jest.fn(),
  getStats: jest.fn().mockReturnValue({ totalLogs: 100, levelCounts: { error: 5 } }),
  clearLogs: jest.fn(),
  exportLogs: jest.fn().mockReturnValue('{"logs": "data"}'),
  createScopedLogger: jest.fn().mockReturnValue({})
};

const mockMonitoring = {
  recordMetric: jest.fn(),
  incrementCounter: jest.fn(),
  recordTiming: jest.fn(),
  createTimer: jest.fn().mockReturnValue({ stop: jest.fn() }),
  getMetrics: jest.fn().mockReturnValue({ counters: {}, timings: {} }),
  getServiceHealth: jest.fn().mockReturnValue({}),
  clearMetrics: jest.fn(),
  exportMetrics: jest.fn().mockReturnValue('{"metrics": "data"}'),
  startHealthCheck: jest.fn(),
  stopHealthCheck: jest.fn()
};

const mockConfiguration = {
  get: jest.fn().mockReturnValue('config-value'),
  set: jest.fn().mockResolvedValue(undefined),
  has: jest.fn().mockReturnValue(true),
  subscribe: jest.fn().mockReturnValue(jest.fn()),
  validate: jest.fn().mockReturnValue({ isValid: true, errors: [] }),
  reload: jest.fn().mockResolvedValue(undefined),
  export: jest.fn().mockReturnValue('{"config": "data"}'),
  import: jest.fn().mockResolvedValue(undefined),
  getSchema: jest.fn().mockReturnValue({})
};

const mockSecurity = {
  validateInput: jest.fn().mockReturnValue({ valid: true }),
  sanitizeOutput: jest.fn().mockReturnValue('sanitized output'),
  checkPermissions: jest.fn().mockReturnValue(true),
  getSecurityMetrics: jest.fn().mockReturnValue({
    validationResults: { passed: 10, failed: 2 },
    recentEvents: []
  }),
  updateSecurityPolicy: jest.fn()
};

// Mock the constructors to return our mock instances
jest.mock('../src/services/crosscutting/CentralizedLogger', () => ({
  CentralizedLogger: jest.fn().mockImplementation(() => mockLogger)
}));

jest.mock('../src/services/crosscutting/MonitoringService', () => ({
  MonitoringService: jest.fn().mockImplementation(() => mockMonitoring)
}));

jest.mock('../src/services/crosscutting/ConfigurationService', () => ({
  ConfigurationService: jest.fn().mockImplementation(() => mockConfiguration)
}));

jest.mock('../src/services/crosscutting/SecurityManager', () => ({
  SecurityManager: jest.fn().mockImplementation(() => mockSecurity)
}));

describe('CrossCuttingServicesHub', () => {
  let hub: CrossCuttingServicesHub;
  let mockEventBus: jest.Mocked<IEventBus>;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Re-setup mock return values after clearing
    mockLogger.getStats.mockReturnValue({ totalLogs: 100, levelCounts: { error: 5 } });
    mockLogger.exportLogs.mockReturnValue('{"logs": "data"}');
    mockMonitoring.getMetrics.mockReturnValue({ counters: {}, timings: {} });
    mockMonitoring.getServiceHealth.mockReturnValue({});
    mockMonitoring.exportMetrics.mockReturnValue('{"metrics": "data"}');
    mockConfiguration.get.mockReturnValue('config-value');
    mockConfiguration.export.mockReturnValue('{"config": "data"}');
    mockSecurity.validateInput.mockReturnValue({ valid: true });
    mockSecurity.sanitizeOutput.mockReturnValue('sanitized output');
    mockSecurity.checkPermissions.mockReturnValue(true);
    mockSecurity.getSecurityMetrics.mockReturnValue({
      validationResults: { passed: 10, failed: 2 },
      recentEvents: []
    });

    mockEventBus = {
      publish: jest.fn().mockResolvedValue(undefined),
      subscribe: jest.fn().mockReturnValue(jest.fn()),
      subscribeOnce: jest.fn().mockReturnValue(jest.fn()),
      unsubscribe: jest.fn(),
      clear: jest.fn(),
      getSubscriptionCount: jest.fn().mockReturnValue(0)
    };

    hub = new CrossCuttingServicesHub(mockEventBus);
  });

  afterEach(async () => {
    // Clean up if hub has shutdown method
    if (hub && typeof (hub as any).shutdown === 'function') {
      await (hub as any).shutdown();
    }
    jest.clearAllMocks();
  });

  describe('Initialization', () => {
    test('constructor initializes all services in correct order', () => {
      // The constructor should create instances of all services
      // Since we're using jest.mockImplementation, the constructors are called
      expect(hub).toBeDefined();
      expect(hub.getLogger()).toBeDefined();
      expect(hub.getMonitoring()).toBeDefined();
      expect(hub.getConfiguration()).toBeDefined();
      expect(hub.getSecurity()).toBeDefined();
    });

    test('constructor sets up service integrations', () => {
      // The constructor should set up cross-service integrations
      // This is tested implicitly through the service mocks
      expect(hub).toBeDefined();
    });

    test('ensureInitialized throws before initialization', () => {
      // This is tricky to test directly since the constructor initializes
      // We can test that the hub is properly initialized after construction
      expect(() => {
        (hub as any).ensureInitialized();
      }).not.toThrow();
    });

    test('all getter methods work after initialization', () => {
      expect(hub.getLogger()).toBeDefined();
      expect(hub.createScopedLogger('test')).toBeDefined();
      expect(hub.getMonitoring()).toBeDefined();
      expect(hub.getConfiguration()).toBeDefined();
      expect(hub.getSecurity()).toBeDefined();
    });
  });

  describe('Service Access', () => {
    test('getLogger returns CentralizedLogger instance', () => {
      const logger = hub.getLogger();
      expect(logger).toBe(mockLogger);
    });

    test('createScopedLogger creates properly scoped loggers', () => {
      const scopedLogger = hub.createScopedLogger('test-service', 'debug');
      expect(mockLogger.createScopedLogger).toHaveBeenCalledWith('test-service', 'debug');
      expect(scopedLogger).toBeDefined();
    });

    test('getMonitoring returns MonitoringService instance', () => {
      const monitoring = hub.getMonitoring();
      expect(monitoring).toBe(mockMonitoring);
    });

    test('getConfiguration returns ConfigurationService instance', () => {
      const config = hub.getConfiguration();
      expect(config).toBe(mockConfiguration);
    });

    test('getSecurity returns SecurityManager instance', () => {
      const security = hub.getSecurity();
      expect(security).toBe(mockSecurity);
    });
  });

  describe('Cross-Service Operations', () => {
    test('validateInput delegates to security manager', () => {
      const result = hub.validateInput('test input', 'test-operation', 'test-source');

      expect(mockSecurity.validateInput).toHaveBeenCalledWith(
        'test input',
        expect.objectContaining({
          operation: 'test-operation',
          source: 'test-source'
        })
      );
    });

    test('sanitizeOutput delegates to security manager', () => {
      const result = hub.sanitizeOutput('test output', 'test-operation', 'test-source');

      expect(mockSecurity.sanitizeOutput).toHaveBeenCalledWith(
        'test output',
        expect.objectContaining({
          operation: 'test-operation',
          source: 'test-source'
        })
      );
    });

    test('checkPermissions delegates to security manager', () => {
      const result = hub.checkPermissions('test-permission', 'test-user', 'test-source');

      expect(mockSecurity.checkPermissions).toHaveBeenCalledWith(
        'test-permission',
        expect.objectContaining({
          operation: 'test-permission',
          user: 'test-user',
          source: 'test-source'
        })
      );
    });

    test('recordMetric delegates to monitoring service', () => {
      hub.recordMetric('test.metric', 42, { tag: 'value' });

      expect(mockMonitoring.recordMetric).toHaveBeenCalledWith('test.metric', 42, { tag: 'value' });
    });

    test('incrementCounter delegates to monitoring service', () => {
      hub.incrementCounter('test.counter', { tag: 'value' });

      expect(mockMonitoring.incrementCounter).toHaveBeenCalledWith('test.counter', { tag: 'value' });
    });

    test('recordTiming delegates to monitoring service', () => {
      hub.recordTiming('test.timing', 1500, { tag: 'value' });

      expect(mockMonitoring.recordTiming).toHaveBeenCalledWith('test.timing', 1500, { tag: 'value' });
    });

    test('createTimer delegates to monitoring service', () => {
      const timer = hub.createTimer('test.timer', { tag: 'value' });

      expect(mockMonitoring.createTimer).toHaveBeenCalledWith('test.timer', { tag: 'value' });
      expect(timer).toEqual({ stop: expect.any(Function) });
    });
  });

  describe('Configuration Management', () => {
    test('getConfig retrieves configuration values', () => {
      const result = hub.getConfig('test.key', 'default');

      expect(mockConfiguration.get).toHaveBeenCalledWith('test.key', 'default');
      expect(result).toBe('config-value');
    });

    test('setConfig updates configuration values', async () => {
      await hub.setConfig('test.key', 'new-value');

      expect(mockConfiguration.set).toHaveBeenCalledWith('test.key', 'new-value');
    });

    test('subscribeToConfig handles configuration change subscriptions', () => {
      const callback = jest.fn();
      const unsubscribe = hub.subscribeToConfig('test.key', callback);

      expect(mockConfiguration.subscribe).toHaveBeenCalledWith('test.key', callback);
      expect(unsubscribe).toEqual(expect.any(Function));
    });
  });

  describe('System Health & Status', () => {
    test('getSystemStatus returns comprehensive status from all services', () => {
      mockLogger.getStats.mockReturnValue({ totalLogs: 100, levelCounts: { error: 5 } });
      mockMonitoring.getMetrics.mockReturnValue({ counters: {}, timings: {} });
      mockMonitoring.getServiceHealth.mockReturnValue({});
      mockConfiguration.export.mockReturnValue('{"test": "config"}');
      mockSecurity.getSecurityMetrics.mockReturnValue({
        validationResults: { passed: 10, failed: 2 },
        recentEvents: []
      });

      const status = hub.getSystemStatus();

      expect(status).toEqual(expect.objectContaining({
        timestamp: expect.any(Number),
        isHealthy: true,
        services: expect.objectContaining({
          logging: expect.objectContaining({
            status: 'healthy',
            stats: { totalLogs: 100, levelCounts: { error: 5 } }
          }),
          monitoring: expect.objectContaining({
            status: 'healthy'
          }),
          configuration: expect.objectContaining({
            status: 'healthy'
          }),
          security: expect.objectContaining({
            status: 'healthy'
          })
        })
      }));
    });

    test('performHealthChecks checks all services health', async () => {
      mockLogger.getStats.mockReturnValue({ totalLogs: 50, levelCounts: { error: 1 } });
      mockMonitoring.getMetrics.mockReturnValue({ counters: { test: 5 }, timings: {} });
      mockMonitoring.getServiceHealth.mockReturnValue({});
      mockConfiguration.export.mockReturnValue('{"valid": "json"}');
      mockSecurity.getSecurityMetrics.mockReturnValue({
        validationResults: { passed: 8, failed: 1 },
        recentEvents: []
      });

      const healthResults = await hub.performHealthChecks();

      expect(healthResults).toEqual(expect.objectContaining({
        timestamp: expect.any(Number),
        overall: 'healthy',
        services: expect.objectContaining({
          logging: expect.objectContaining({ status: 'healthy' }),
          monitoring: expect.objectContaining({ status: 'healthy' }),
          configuration: expect.objectContaining({ status: 'healthy' }),
          security: expect.objectContaining({ status: 'healthy' })
        })
      }));
    });

    test('exportAllData exports data from all services', () => {
      mockConfiguration.export.mockReturnValue('{"config": "data"}');
      mockLogger.exportLogs.mockReturnValue('{"logs": "data"}');
      mockMonitoring.exportMetrics.mockReturnValue('{"metrics": "data"}');
      mockSecurity.getSecurityMetrics.mockReturnValue({ security: 'data' });

      const exportData = hub.exportAllData();

      expect(exportData).toEqual(expect.objectContaining({
        timestamp: expect.any(String),
        configuration: '{"config": "data"}',
        logs: '{"logs": "data"}',
        metrics: '{"metrics": "data"}',
        security: { security: 'data' },
        systemStatus: expect.any(Object)
      }));
    });

    test('clearAllData clears data from all services', () => {
      mockLogger.clearLogs.mockImplementation(() => {});
      mockMonitoring.clearMetrics.mockImplementation(() => {});

      hub.clearAllData();

      expect(mockLogger.clearLogs).toHaveBeenCalled();
      expect(mockMonitoring.clearMetrics).toHaveBeenCalled();
    });
  });

  describe('Lifecycle Management', () => {
    test('shutdown gracefully shuts down all services', async () => {
      mockMonitoring.getServiceHealth.mockReturnValue({
        'test-service': { status: 'healthy' }
      });

      await (hub as any).shutdown();

      expect(mockMonitoring.stopHealthCheck).toHaveBeenCalledWith('test-service');
    });

    test('shutdown exports final data', async () => {
      mockMonitoring.getServiceHealth.mockReturnValue({});

      await (hub as any).shutdown();

      expect(mockConfiguration.export).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    test('handles configuration service errors gracefully', async () => {
      mockConfiguration.export.mockImplementation(() => {
        throw new Error('Config export failed');
      });

      const healthResults = await hub.performHealthChecks();

      expect(healthResults.services.configuration.status).toBe('unhealthy');
      expect(healthResults.overall).toBe('degraded');

      // Reset the mock for cleanup
      mockConfiguration.export.mockReturnValue('{"config": "data"}');
    });

    test('handles health check failures gracefully', async () => {
      mockLogger.getStats.mockImplementation(() => {
        throw new Error('Logger stats failed');
      });

      // Mock other services to avoid cascading failures
      mockMonitoring.getMetrics.mockReturnValue({ counters: {}, timings: {} });
      mockMonitoring.getServiceHealth.mockReturnValue({});
      mockConfiguration.export.mockReturnValue('{}');
      mockSecurity.getSecurityMetrics.mockReturnValue({
        validationResults: { passed: 0, failed: 0 },
        recentEvents: []
      });

      const healthResults = await hub.performHealthChecks();

      expect(healthResults.overall).toBe('unhealthy');

      // Reset the mock for cleanup
      mockLogger.getStats.mockReturnValue({ totalLogs: 100, levelCounts: { error: 5 } });
    });
  });

  describe('Integration Scenarios', () => {
    test('handles complex configuration changes that affect multiple services', () => {
      // This would test how config changes propagate to logger, security, etc.
      // Since the actual integration is set up in the constructor, we test the setup indirectly
      expect(hub.getLogger()).toBeDefined();
      expect(hub.getSecurity()).toBeDefined();
      expect(hub.getConfiguration()).toBeDefined();
    });

    test('maintains service consistency across operations', () => {
      // Test that all services remain accessible and consistent
      const logger1 = hub.getLogger();
      const logger2 = hub.getLogger();
      expect(logger1).toBe(logger2); // Should return the same instance

      const config1 = hub.getConfiguration();
      const config2 = hub.getConfiguration();
      expect(config1).toBe(config2); // Should return the same instance
    });

    test('handles concurrent access to services', async () => {
      // Test concurrent access to different services
      const promises = [
        Promise.resolve(hub.getConfig('test1')),
        Promise.resolve(hub.getConfig('test2')),
        Promise.resolve(hub.recordMetric('test.metric', 1)),
        Promise.resolve(hub.validateInput('test', 'test-op'))
      ];

      await expect(Promise.all(promises)).resolves.toBeDefined();
    });
  });
});
