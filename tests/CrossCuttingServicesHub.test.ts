/**
 * @file CrossCuttingServicesHub.test.ts
 * @description Comprehensive test suite for CrossCuttingServicesHub
 */

import { CrossCuttingServicesHub } from '../src/services/crosscutting/CrossCuttingServicesHub';
import { CentralizedLogger, ScopedLogger } from '../src/services/crosscutting/CentralizedLogger';
import { MonitoringService } from '../src/services/crosscutting/MonitoringService';
import { ConfigurationService } from '../src/services/crosscutting/ConfigurationService';
import { SecurityManager } from '../src/services/crosscutting/SecurityManager';
import { EventBus } from '../src/utils/eventBus';
import { IEventBus } from '../src/services/interfaces';

// Mock the cross-cutting services
jest.mock('../src/services/crosscutting/CentralizedLogger');
jest.mock('../src/services/crosscutting/MonitoringService');
jest.mock('../src/services/crosscutting/ConfigurationService');
jest.mock('../src/services/crosscutting/SecurityManager');

describe('CrossCuttingServicesHub', () => {
  let hub: CrossCuttingServicesHub;
  let mockEventBus: jest.Mocked<IEventBus>;
  let mockLogger: jest.Mocked<CentralizedLogger>;
  let mockMonitoring: jest.Mocked<MonitoringService>;
  let mockConfiguration: jest.Mocked<ConfigurationService>;
  let mockSecurity: jest.Mocked<SecurityManager>;
  let mockScopedLogger: jest.Mocked<ScopedLogger>;

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

    // Create mock scoped logger
    mockScopedLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      time: jest.fn().mockReturnValue({ end: jest.fn().mockReturnValue(100) })
    } as any;

    // Create mock services
    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      log: jest.fn(),
      configure: jest.fn(),
      createScopedLogger: jest.fn().mockReturnValue(mockScopedLogger),
      getLogs: jest.fn().mockReturnValue([]),
      getStats: jest.fn().mockReturnValue({
        totalLogs: 0,
        recentLogs: 0,
        dailyLogs: 0,
        levelCounts: { debug: 0, info: 0, warn: 0, error: 0 },
        categoryCounts: {},
        availableCategories: [],
        mutedCategories: [],
        oldestLog: null,
        newestLog: null
      }),
      exportLogs: jest.fn().mockReturnValue('[]'),
      clearLogs: jest.fn(),
      muteCategory: jest.fn(),
      unmuteCategory: jest.fn(),
      setLogLevel: jest.fn()
    } as any;

    mockMonitoring = {
      recordMetric: jest.fn(),
      incrementCounter: jest.fn(),
      recordTiming: jest.fn(),
      recordServiceHealth: jest.fn(),
      getMetrics: jest.fn().mockReturnValue({
        counters: {},
        timings: {},
        gauges: {},
        healthChecks: {}
      }),
      getServiceHealth: jest.fn().mockReturnValue({}),
      startHealthCheck: jest.fn(),
      stopHealthCheck: jest.fn(),
      exportMetrics: jest.fn().mockReturnValue('{}'),
      clearMetrics: jest.fn(),
      createTimer: jest.fn().mockReturnValue({ end: jest.fn().mockReturnValue(100) })
    } as any;

    mockConfiguration = {
      get: jest.fn().mockImplementation((key: string, defaultValue?: any) => {
        const config: Record<string, any> = {
          'logging': {},
          'monitoring': {},
          'security': {},
          'logging.logLevel': 'info'
        };
        return config[key] !== undefined ? config[key] : defaultValue;
      }),
      set: jest.fn().mockResolvedValue(undefined),
      has: jest.fn().mockReturnValue(false),
      subscribe: jest.fn().mockReturnValue(() => {}),
      validate: jest.fn().mockReturnValue({ isValid: true, errors: [] }),
      reload: jest.fn().mockResolvedValue(undefined),
      export: jest.fn().mockReturnValue('{}'),
      import: jest.fn().mockResolvedValue(undefined),
      getSchema: jest.fn().mockReturnValue({})
    } as any;

    mockSecurity = {
      validateInput: jest.fn().mockReturnValue({
        isValid: true,
        threats: [],
        riskLevel: 'low'
      }),
      sanitizeOutput: jest.fn().mockImplementation((input: string) => input),
      checkPermissions: jest.fn().mockReturnValue(true),
      auditLog: jest.fn(),
      getSecurityMetrics: jest.fn().mockReturnValue({
        validationResults: {},
        permissionChecks: {},
        suspiciousActivities: 0,
        policyViolations: 0,
        recentEvents: []
      }),
      updateSecurityPolicy: jest.fn()
    } as any;

    // Mock the constructors
    (CentralizedLogger as jest.MockedClass<typeof CentralizedLogger>).mockImplementation(() => mockLogger);
    (MonitoringService as jest.MockedClass<typeof MonitoringService>).mockImplementation(() => mockMonitoring);
    (ConfigurationService as jest.MockedClass<typeof ConfigurationService>).mockImplementation(() => mockConfiguration);
    (SecurityManager as jest.MockedClass<typeof SecurityManager>).mockImplementation(() => mockSecurity);

    // Create hub instance
    hub = new CrossCuttingServicesHub(mockEventBus);
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  describe('constructor', () => {
    test('should initialize all cross-cutting services', () => {
      expect(CentralizedLogger).toHaveBeenCalledWith(mockEventBus, {});
      expect(MonitoringService).toHaveBeenCalledWith(mockEventBus, {});
      expect(SecurityManager).toHaveBeenCalledWith(mockEventBus, {});
      expect(ConfigurationService).toHaveBeenCalledWith(undefined, expect.any(Object));
    });

    test('should initialize with custom configuration', () => {
      const customConfig = {
        'logging.logLevel': 'debug',
        'monitoring.healthCheckInterval': 60000,
        'security.maxInputLength': 5000
      };

      const customHub = new CrossCuttingServicesHub(mockEventBus, customConfig);
      expect(customHub).toBeInstanceOf(CrossCuttingServicesHub);
      expect(ConfigurationService).toHaveBeenCalledWith(customConfig, expect.any(Object));
    });

    test('should log successful initialization', () => {
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Cross-cutting services hub initialized successfully',
        expect.objectContaining({
          services: ['logger', 'monitoring', 'configuration', 'security']
        }),
        'system'
      );
    });

    test('should setup service integrations', () => {
      expect(mockConfiguration.subscribe).toHaveBeenCalledWith('logging', expect.any(Function));
      expect(mockConfiguration.subscribe).toHaveBeenCalledWith('security', expect.any(Function));
      expect(mockMonitoring.startHealthCheck).toHaveBeenCalledWith('logging', expect.any(Object));
      expect(mockMonitoring.startHealthCheck).toHaveBeenCalledWith('security', expect.any(Object));
    });
  });

  describe('service getters', () => {
    test('should return logger instance', () => {
      const logger = hub.getLogger();
      expect(logger).toBe(mockLogger);
    });

    test('should return monitoring instance', () => {
      const monitoring = hub.getMonitoring();
      expect(monitoring).toBe(mockMonitoring);
    });

    test('should return configuration instance', () => {
      const configuration = hub.getConfiguration();
      expect(configuration).toBe(mockConfiguration);
    });

    test('should return security instance', () => {
      const security = hub.getSecurity();
      expect(security).toBe(mockSecurity);
    });

    test('should create scoped logger', () => {
      const scopedLogger = hub.createScopedLogger('TestService', 'test-category');
      expect(mockLogger.createScopedLogger).toHaveBeenCalledWith('TestService', 'test-category');
      expect(scopedLogger).toBe(mockScopedLogger);
    });

    test('should throw error when accessing services before initialization', () => {
      // Create a hub that simulates uninitialized state
      const uninitializedHub = Object.create(CrossCuttingServicesHub.prototype);
      uninitializedHub['isInitialized'] = false;

      expect(() => uninitializedHub.getLogger()).toThrow('CrossCuttingServicesHub must be initialized before use');
      expect(() => uninitializedHub.getMonitoring()).toThrow('CrossCuttingServicesHub must be initialized before use');
      expect(() => uninitializedHub.getConfiguration()).toThrow('CrossCuttingServicesHub must be initialized before use');
      expect(() => uninitializedHub.getSecurity()).toThrow('CrossCuttingServicesHub must be initialized before use');
    });
  });

  describe('security convenience methods', () => {
    test('should validate input using security manager', () => {
      const result = hub.validateInput('test input', 'test_operation', 'user');

      expect(mockSecurity.validateInput).toHaveBeenCalledWith('test input', {
        operation: 'test_operation',
        source: 'user',
        metadata: { timestamp: expect.any(Number) }
      });
      expect(result).toEqual({
        isValid: true,
        threats: [],
        riskLevel: 'low'
      });
    });

    test('should sanitize output using security manager', () => {
      const result = hub.sanitizeOutput('<script>alert("xss")</script>', 'output_operation', 'system');

      expect(mockSecurity.sanitizeOutput).toHaveBeenCalledWith('<script>alert("xss")</script>', {
        operation: 'output_operation',
        source: 'system',
        metadata: { timestamp: expect.any(Number) }
      });
      expect(result).toBe('<script>alert("xss")</script>');
    });

    test('should check permissions using security manager', () => {
      const result = hub.checkPermissions('file_access', 'testuser', 'application');

      expect(mockSecurity.checkPermissions).toHaveBeenCalledWith('file_access', {
        operation: 'file_access',
        user: 'testuser',
        source: 'application',
        metadata: { timestamp: expect.any(Number) }
      });
      expect(result).toBe(true);
    });

    test('should use default source when not provided', () => {
      hub.validateInput('test', 'operation');
      hub.sanitizeOutput('test', 'operation');
      hub.checkPermissions('operation');

      expect(mockSecurity.validateInput).toHaveBeenCalledWith('test', expect.objectContaining({
        source: 'unknown'
      }));
      expect(mockSecurity.sanitizeOutput).toHaveBeenCalledWith('test', expect.objectContaining({
        source: 'unknown'
      }));
      expect(mockSecurity.checkPermissions).toHaveBeenCalledWith('operation', expect.objectContaining({
        source: 'unknown'
      }));
    });
  });

  describe('monitoring convenience methods', () => {
    test('should record metric using monitoring service', () => {
      hub.recordMetric('test.metric', 42, { tag: 'value' });

      expect(mockMonitoring.recordMetric).toHaveBeenCalledWith('test.metric', 42, { tag: 'value' });
    });

    test('should increment counter using monitoring service', () => {
      hub.incrementCounter('test.counter', { environment: 'test' });

      expect(mockMonitoring.incrementCounter).toHaveBeenCalledWith('test.counter', { environment: 'test' });
    });

    test('should record timing using monitoring service', () => {
      hub.recordTiming('test.timing', 150, { operation: 'database' });

      expect(mockMonitoring.recordTiming).toHaveBeenCalledWith('test.timing', 150, { operation: 'database' });
    });

    test('should create timer using monitoring service', () => {
      const timer = hub.createTimer('test.operation', { service: 'api' });

      expect(mockMonitoring.createTimer).toHaveBeenCalledWith('test.operation', { service: 'api' });
      expect(timer).toEqual({ end: expect.any(Function) });
    });
  });

  describe('configuration convenience methods', () => {
    test('should get configuration value', () => {
      const result = hub.getConfig('test.key', 'default-value');

      expect(mockConfiguration.get).toHaveBeenCalledWith('test.key', 'default-value');
    });

    test('should set configuration value', async () => {
      await hub.setConfig('test.key', 'test-value');

      expect(mockConfiguration.set).toHaveBeenCalledWith('test.key', 'test-value');
    });

    test('should subscribe to configuration changes', () => {
      const callback = jest.fn();
      const unsubscribe = hub.subscribeToConfig('test.key', callback);

      expect(mockConfiguration.subscribe).toHaveBeenCalledWith('test.key', callback);
      expect(typeof unsubscribe).toBe('function');
    });
  });

  describe('system status', () => {
    test('should return comprehensive system status', () => {
      const status = hub.getSystemStatus();

      expect(status).toEqual({
        timestamp: expect.any(Number),
        isHealthy: true,
        services: {
          logging: {
            status: 'healthy',
            stats: expect.any(Object),
            logLevel: 'info'
          },
          monitoring: {
            status: 'healthy',
            metrics: expect.any(Object),
            healthChecks: expect.any(Object)
          },
          configuration: {
            status: 'healthy',
            schema: expect.any(Object),
            configCount: expect.any(Number)
          },
          security: {
            status: 'healthy',
            metrics: expect.any(Object),
            policyActive: true
          }
        }
      });
    });

    test('should call appropriate service methods for status', () => {
      hub.getSystemStatus();

      expect(mockLogger.getStats).toHaveBeenCalled();
      expect(mockMonitoring.getMetrics).toHaveBeenCalled();
      expect(mockMonitoring.getServiceHealth).toHaveBeenCalled();
      expect(mockConfiguration.getSchema).toHaveBeenCalled();
      expect(mockConfiguration.export).toHaveBeenCalled();
      expect(mockSecurity.getSecurityMetrics).toHaveBeenCalled();
    });
  });

  describe('data export and import', () => {
    test('should export all service data', () => {
      const exportedData = hub.exportAllData();

      expect(exportedData).toEqual({
        timestamp: expect.any(String),
        configuration: '{}',
        logs: '[]',
        metrics: '{}',
        security: expect.any(Object),
        systemStatus: expect.any(Object)
      });

      expect(mockConfiguration.export).toHaveBeenCalled();
      expect(mockLogger.exportLogs).toHaveBeenCalledWith('json');
      expect(mockMonitoring.exportMetrics).toHaveBeenCalledWith('json');
      expect(mockSecurity.getSecurityMetrics).toHaveBeenCalled();
    });

    test('should clear all service data', () => {
      hub.clearAllData();

      expect(mockLogger.clearLogs).toHaveBeenCalled();
      expect(mockMonitoring.clearMetrics).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith(
        'All cross-cutting service data cleared',
        expect.objectContaining({
          clearedServices: ['logging', 'monitoring']
        }),
        'system'
      );
    });
  });

  describe('health checks', () => {
    test('should perform health checks on all services', async () => {
      const healthResults = await hub.performHealthChecks();

      expect(healthResults).toEqual({
        timestamp: expect.any(Number),
        overall: 'healthy',
        services: {
          logging: {
            status: 'healthy',
            totalLogs: 0,
            recentErrors: 0
          },
          monitoring: {
            status: 'healthy',
            totalCounters: 0,
            totalTimings: 0
          },
          configuration: {
            status: 'healthy',
            configEntries: 0
          },
          security: {
            status: 'healthy',
            recentThreats: 0,
            validationCount: 0
          }
        }
      });
    });

    test('should handle configuration service errors in health check', async () => {
      mockConfiguration.export.mockImplementation(() => {
        throw new Error('Configuration export failed');
      });

      const healthResults = await hub.performHealthChecks();

      expect(healthResults.overall).toBe('degraded');
      expect(healthResults.services.configuration.status).toBe('unhealthy');
      expect(healthResults.services.configuration.error).toBe('Configuration export failed');
    });

    test('should detect degraded security status', async () => {
      mockSecurity.getSecurityMetrics.mockReturnValue({
        validationResults: {},
        permissionChecks: {},
        suspiciousActivities: 0,
        policyViolations: 0,
        recentEvents: Array(15).fill(0).map((_, i) => ({
          type: 'validation' as const,
          timestamp: Date.now(),
          context: { operation: 'test', source: 'test', metadata: {} },
          details: {},
          severity: 'critical' as const
        }))
      });

      const healthResults = await hub.performHealthChecks();

      expect(healthResults.overall).toBe('degraded');
      expect(healthResults.services.security.status).toBe('degraded');
      expect(healthResults.services.security.recentThreats).toBe(15);
    });

    test('should handle health check errors gracefully', async () => {
      mockLogger.getStats.mockImplementation(() => {
        throw new Error('Logger stats failed');
      });

      const healthResults = await hub.performHealthChecks();

      expect(healthResults.overall).toBe('unhealthy');
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Health check failed',
        expect.objectContaining({
          error: 'Logger stats failed'
        }),
        'system'
      );
    });
  });

  describe('service integrations', () => {
    test('should handle logging configuration changes', () => {
      const loggingSubscriber = (mockConfiguration.subscribe as jest.Mock).mock.calls
        .find(call => call[0] === 'logging')?.[1];

      expect(loggingSubscriber).toBeDefined();

      const newLoggingConfig = { logLevel: 'debug', maxLogs: 2000 };
      loggingSubscriber(newLoggingConfig);

      expect(mockLogger.configure).toHaveBeenCalledWith(newLoggingConfig);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Logger configuration updated',
        { newConfig: newLoggingConfig },
        'system'
      );
    });

    test('should handle security configuration changes', () => {
      const securitySubscriber = (mockConfiguration.subscribe as jest.Mock).mock.calls
        .find(call => call[0] === 'security')?.[1];

      expect(securitySubscriber).toBeDefined();

      const newSecurityConfig = { maxInputLength: 5000, auditAll: true };
      securitySubscriber(newSecurityConfig);

      expect(mockSecurity.updateSecurityPolicy).toHaveBeenCalledWith(newSecurityConfig);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Security policy updated',
        { newConfig: newSecurityConfig },
        'system'
      );
    });

    test('should setup logging health check', () => {
      const loggingHealthCheck = (mockMonitoring.startHealthCheck as jest.Mock).mock.calls
        .find(call => call[0] === 'logging')?.[1];

      expect(loggingHealthCheck).toBeDefined();
      expect(loggingHealthCheck.check).toBeDefined();
    });

    test('should setup security health check', () => {
      const securityHealthCheck = (mockMonitoring.startHealthCheck as jest.Mock).mock.calls
        .find(call => call[0] === 'security')?.[1];

      expect(securityHealthCheck).toBeDefined();
      expect(securityHealthCheck.check).toBeDefined();
    });
  });

  describe('shutdown', () => {
    test('should shutdown gracefully', async () => {
      mockMonitoring.getServiceHealth.mockReturnValue({
        'test-service': {
          status: 'healthy',
          lastCheck: Date.now(),
          message: 'OK'
        }
      });

      await hub.shutdown();

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Shutting down cross-cutting services hub',
        expect.objectContaining({
          timestamp: expect.any(Number)
        }),
        'system'
      );

      expect(mockMonitoring.stopHealthCheck).toHaveBeenCalledWith('test-service');

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Cross-cutting services hub shutdown complete',
        expect.objectContaining({
          timestamp: expect.any(Number),
          finalDataSize: expect.any(Number)
        }),
        'system'
      );
    });

    test('should handle shutdown when not initialized', async () => {
      const uninitializedHub = Object.create(CrossCuttingServicesHub.prototype);
      uninitializedHub['isInitialized'] = false;

      await uninitializedHub.shutdown();
      // Should not throw and should complete silently
    });

    test('should export final data during shutdown', async () => {
      await hub.shutdown();

      expect(mockConfiguration.export).toHaveBeenCalled();
      expect(mockLogger.exportLogs).toHaveBeenCalled();
      expect(mockMonitoring.exportMetrics).toHaveBeenCalled();
      expect(mockSecurity.getSecurityMetrics).toHaveBeenCalled();
    });
  });

  describe('default schema', () => {
    test('should provide comprehensive default schema', () => {
      // Access the private method through the instance
      const schema = (hub as any).getDefaultSchema();

      expect(schema['logging.logLevel']).toBeDefined();
      expect(schema['logging.maxLogs']).toBeDefined();
      expect(schema['monitoring.healthCheckInterval']).toBeDefined();
      expect(schema['security.maxInputLength']).toBeDefined();
      expect(schema['security.auditAll']).toBeDefined();

      // Verify schema structure
      expect(schema['logging.logLevel']).toEqual({
        type: 'string',
        default: 'info',
        description: 'Minimum log level to output'
      });

      expect(schema['monitoring.healthCheckInterval']).toEqual({
        type: 'number',
        default: 30000,
        description: 'Interval between health checks in milliseconds'
      });
    });
  });

  describe('error handling and edge cases', () => {
    test('should handle service initialization errors gracefully', () => {
      (CentralizedLogger as jest.MockedClass<typeof CentralizedLogger>).mockImplementation(() => {
        throw new Error('Logger initialization failed');
      });

      expect(() => {
        new CrossCuttingServicesHub(mockEventBus);
      }).toThrow('Logger initialization failed');
    });

    test('should handle null/undefined inputs gracefully', () => {
      expect(() => {
        hub.validateInput(null as any, 'test');
        hub.sanitizeOutput(undefined as any, 'test');
        hub.recordMetric('test', NaN);
        hub.getConfig(null as any);
      }).not.toThrow();
    });

    test('should handle concurrent operations', async () => {
      const promises = [];

      // Concurrent configuration operations
      for (let i = 0; i < 10; i++) {
        promises.push(hub.setConfig(`concurrent.key.${i}`, `value-${i}`));
      }

      // Concurrent monitoring operations
      for (let i = 0; i < 10; i++) {
        promises.push(Promise.resolve(hub.recordMetric(`concurrent.metric.${i}`, i)));
      }

      // Concurrent security operations
      for (let i = 0; i < 10; i++) {
        promises.push(Promise.resolve(hub.validateInput(`test-${i}`, 'concurrent_test')));
      }

      await Promise.all(promises);

      expect(mockConfiguration.set).toHaveBeenCalledTimes(10);
      expect(mockMonitoring.recordMetric).toHaveBeenCalledTimes(10);
      expect(mockSecurity.validateInput).toHaveBeenCalledTimes(10);
    });

    test('should handle service method failures gracefully', () => {
      mockLogger.info.mockImplementation(() => {
        throw new Error('Logger failed');
      });

      expect(() => {
        hub.getSystemStatus();
      }).not.toThrow();
    });
  });

  describe('integration scenarios', () => {
    test('should support end-to-end workflow', async () => {
      // Configuration setup
      await hub.setConfig('app.name', 'Test Application');
      await hub.setConfig('app.environment', 'test');

      // Security validation
      const validationResult = hub.validateInput('user input data', 'user_action', 'web');
      expect(validationResult.isValid).toBe(true);

      // Monitoring metrics
      hub.recordMetric('app.startup_time', 1500);
      hub.incrementCounter('app.requests', { method: 'GET' });
      
      const timer = hub.createTimer('app.operation');
      jest.advanceTimersByTime(100);
      timer.end();

      // System health check
      const healthStatus = await hub.performHealthChecks();
      expect(healthStatus.overall).toBe('healthy');

      // Data export
      const exportedData = hub.exportAllData();
      expect(exportedData.timestamp).toBeDefined();

      // Verify all services were called appropriately
      expect(mockConfiguration.set).toHaveBeenCalledTimes(2);
      expect(mockSecurity.validateInput).toHaveBeenCalledTimes(1);
      expect(mockMonitoring.recordMetric).toHaveBeenCalledTimes(1);
      expect(mockMonitoring.incrementCounter).toHaveBeenCalledTimes(1);
      expect(mockMonitoring.createTimer).toHaveBeenCalledTimes(1);
    });

    test('should handle complex service interactions', async () => {
      // Setup configuration change handler
      const configCallback = jest.fn();
      hub.subscribeToConfig('feature.enabled', configCallback);

      // Trigger configuration change
      const loggingSubscriber = (mockConfiguration.subscribe as jest.Mock).mock.calls
        .find(call => call[0] === 'logging')?.[1];
      loggingSubscriber({ logLevel: 'debug' });

      // Verify service integration
      expect(mockLogger.configure).toHaveBeenCalledWith({ logLevel: 'debug' });

      // Test security and monitoring integration
      mockSecurity.validateInput.mockReturnValue({
        isValid: false,
        threats: ['XSS attempt detected'],
        riskLevel: 'high'
      });

      const result = hub.validateInput('<script>alert("xss")</script>', 'user_input');
      expect(result.riskLevel).toBe('high');

      // Verify monitoring recorded the security event
      hub.recordMetric('security.threats_detected', 1);
      expect(mockMonitoring.recordMetric).toHaveBeenCalledWith('security.threats_detected', 1, undefined);
    });

    test('should maintain service state consistency', async () => {
      // Initial state
      const initialStatus = hub.getSystemStatus();
      expect(initialStatus.isHealthy).toBe(true);

      // Simulate service degradation
      mockSecurity.getSecurityMetrics.mockReturnValue({
        validationResults: {},
        permissionChecks: {},
        suspiciousActivities: 0,
        policyViolations: 0,
        recentEvents: Array(20).fill(0).map(() => ({
          type: 'validation' as const,
          timestamp: Date.now(),
          context: { operation: 'test', source: 'test', metadata: {} },
          details: {},
          severity: 'critical' as const
        }))
      });

      // Check health after degradation
      const degradedStatus = await hub.performHealthChecks();
      expect(degradedStatus.overall).toBe('degraded');
      expect(degradedStatus.services.security.status).toBe('degraded');

      // Verify state is reflected in system status
      const currentStatus = hub.getSystemStatus();
      expect(currentStatus.services.security.metrics.recentEvents).toHaveLength(20);
    });
  });
});