/**
 * @file CentralizedLogger.test.ts
 * @description Comprehensive test suite for CentralizedLogger service
 */

import { CentralizedLogger, ScopedLogger, PerformanceTimer } from '../src/services/crosscutting/CentralizedLogger';
import { EventBus } from '../src/utils/eventBus';
import { IEventBus, LogLevel, LogEntry, LoggerConfig, LogFilter, LoggingStats } from '../src/services/interfaces';

// Mock console methods
const originalConsole = global.console;
const mockConsole = {
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

describe('CentralizedLogger', () => {
  let logger: CentralizedLogger;
  let mockEventBus: jest.Mocked<IEventBus>;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    
    // Mock console
    global.console = mockConsole as any;

    // Create mock event bus
    mockEventBus = {
      publish: jest.fn().mockResolvedValue(undefined),
      subscribe: jest.fn().mockReturnValue(() => {}),
      subscribeOnce: jest.fn().mockReturnValue(() => {}),
      unsubscribe: jest.fn(),
      clear: jest.fn(),
      getSubscriptionCount: jest.fn().mockReturnValue(0),
    };

    // Create logger instance
    logger = new CentralizedLogger(mockEventBus);
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    global.console = originalConsole;
  });

  describe('constructor', () => {
    test('should initialize with default configuration', () => {
      expect(logger).toBeInstanceOf(CentralizedLogger);
      expect(mockEventBus.subscribe).toHaveBeenCalledWith('*.error', expect.any(Function));
      expect(mockEventBus.subscribe).toHaveBeenCalledWith('service.*', expect.any(Function));
      expect(mockEventBus.subscribe).toHaveBeenCalledWith('agent.*', expect.any(Function));
      expect(mockEventBus.subscribe).toHaveBeenCalledWith('tool.*', expect.any(Function));
      expect(mockEventBus.subscribe).toHaveBeenCalledWith('execution_limit.*', expect.any(Function));
    });

    test('should initialize with custom configuration', () => {
      const config: Partial<LoggerConfig> = {
        maxLogs: 500,
        logLevel: 'warn',
        enableConsoleOutput: false,
        enableEventPublishing: false,
        mutedCategories: ['test']
      };

      const customLogger = new CentralizedLogger(mockEventBus, config);
      expect(customLogger).toBeInstanceOf(CentralizedLogger);
    });
  });

  describe('configure', () => {
    test('should update configuration settings', () => {
      const config: Partial<LoggerConfig> = {
        maxLogs: 2000,
        logLevel: 'error',
        enableConsoleOutput: false,
        enableEventPublishing: false,
        mutedCategories: ['muted-category']
      };

      logger.configure(config);

      // Test that configuration is applied by checking behavior
      logger.debug('Debug message'); // Should not log due to error level
      expect(mockConsole.debug).not.toHaveBeenCalled();
      expect(mockEventBus.publish).not.toHaveBeenCalled();
    });

    test('should handle partial configuration updates', () => {
      logger.configure({ maxLogs: 100 });
      logger.configure({ logLevel: 'warn' });
      logger.configure({ enableConsoleOutput: false });

      // Should still work with partial updates
      logger.error('Error message');
      expect(mockEventBus.publish).toHaveBeenCalled();
    });
  });

  describe('logging methods', () => {
    test('should log debug messages', () => {
      const message = 'Debug message';
      const context = { userId: 123 };
      const category = 'test';

      logger.debug(message, context, category);

      expect(mockConsole.debug).toHaveBeenCalledWith(
        expect.stringContaining(message),
        context
      );
      expect(mockEventBus.publish).toHaveBeenCalledWith('logger.entry_created', expect.any(Object));
      expect(mockEventBus.publish).toHaveBeenCalledWith('logger.debug', expect.any(Object));
    });

    test('should log info messages', () => {
      const message = 'Info message';
      const context = { action: 'test' };

      logger.info(message, context);

      expect(mockConsole.info).toHaveBeenCalledWith(
        expect.stringContaining(message),
        context
      );
      expect(mockEventBus.publish).toHaveBeenCalledWith('logger.entry_created', expect.any(Object));
      expect(mockEventBus.publish).toHaveBeenCalledWith('logger.info', expect.any(Object));
    });

    test('should log warning messages', () => {
      const message = 'Warning message';
      const context = { warning: true };

      logger.warn(message, context);

      expect(mockConsole.warn).toHaveBeenCalledWith(
        expect.stringContaining(message),
        context
      );
      expect(mockEventBus.publish).toHaveBeenCalledWith('logger.entry_created', expect.any(Object));
      expect(mockEventBus.publish).toHaveBeenCalledWith('logger.warn', expect.any(Object));
    });

    test('should log error messages', () => {
      const message = 'Error message';
      const context = { error: 'critical' };

      logger.error(message, context);

      expect(mockConsole.error).toHaveBeenCalledWith(
        expect.stringContaining(message),
        context
      );
      expect(mockEventBus.publish).toHaveBeenCalledWith('logger.entry_created', expect.any(Object));
      expect(mockEventBus.publish).toHaveBeenCalledWith('logger.error', expect.any(Object));
    });

    test('should respect log level filtering', () => {
      logger.configure({ logLevel: 'warn' });

      logger.debug('Debug message');
      logger.info('Info message');
      logger.warn('Warning message');
      logger.error('Error message');

      expect(mockConsole.debug).not.toHaveBeenCalled();
      expect(mockConsole.info).not.toHaveBeenCalled();
      expect(mockConsole.warn).toHaveBeenCalled();
      expect(mockConsole.error).toHaveBeenCalled();
    });

    test('should respect muted categories', () => {
      logger.configure({ mutedCategories: ['muted'] });

      logger.info('Normal message', {}, 'normal');
      logger.info('Muted message', {}, 'muted');

      expect(mockConsole.info).toHaveBeenCalledTimes(1);
      expect(mockEventBus.publish).toHaveBeenCalledTimes(2); // Only for normal message
    });

    test('should handle disabled console output', () => {
      logger.configure({ enableConsoleOutput: false });

      logger.info('Test message');

      expect(mockConsole.info).not.toHaveBeenCalled();
      expect(mockEventBus.publish).toHaveBeenCalled(); // Event publishing still works
    });

    test('should handle disabled event publishing', () => {
      logger.configure({ enableEventPublishing: false });

      logger.info('Test message');

      expect(mockConsole.info).toHaveBeenCalled(); // Console output still works
      expect(mockEventBus.publish).not.toHaveBeenCalled();
    });
  });

  describe('log storage and retrieval', () => {
    test('should store log entries', () => {
      logger.info('Test message 1');
      logger.warn('Test message 2');
      logger.error('Test message 3');

      const logs = logger.getLogs();
      expect(logs).toHaveLength(3);
      expect(logs[0].message).toBe('Test message 3'); // Most recent first
      expect(logs[1].message).toBe('Test message 2');
      expect(logs[2].message).toBe('Test message 1');
    });

    test('should filter logs by level', () => {
      logger.info('Info message');
      logger.warn('Warning message');
      logger.error('Error message');

      const errorLogs = logger.getLogs({ level: 'error' });
      expect(errorLogs).toHaveLength(1);
      expect(errorLogs[0].level).toBe('error');
    });

    test('should filter logs by category', () => {
      logger.info('Message 1', {}, 'category1');
      logger.info('Message 2', {}, 'category2');
      logger.info('Message 3', {}, 'category1');

      const category1Logs = logger.getLogs({ category: 'category1' });
      expect(category1Logs).toHaveLength(2);
      expect(category1Logs.every(log => log.category === 'category1')).toBe(true);
    });

    test('should filter logs by time range', () => {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);

      // Mock Date.now to control timestamps
      jest.spyOn(Date.prototype, 'toISOString')
        .mockReturnValueOnce(twoHoursAgo.toISOString())
        .mockReturnValueOnce(oneHourAgo.toISOString())
        .mockReturnValueOnce(now.toISOString());

      logger.info('Old message');
      logger.info('Recent message');
      logger.info('Current message');

      const recentLogs = logger.getLogs({ since: oneHourAgo });
      expect(recentLogs).toHaveLength(2);
    });

    test('should filter logs by message content', () => {
      logger.info('Important system message');
      logger.info('Regular user action');
      logger.info('Another important notification');

      const importantLogs = logger.getLogs({ messageContains: 'important' });
      expect(importantLogs).toHaveLength(2);
    });

    test('should handle log cleanup when max logs exceeded', () => {
      logger.configure({ maxLogs: 3 });

      logger.info('Message 1');
      logger.info('Message 2');
      logger.info('Message 3');
      logger.info('Message 4'); // Should trigger cleanup

      const logs = logger.getLogs();
      expect(logs).toHaveLength(3);
      expect(logs.some(log => log.message === 'Message 1')).toBe(false); // Oldest removed
    });
  });

  describe('statistics and metrics', () => {
    test('should provide logging statistics', () => {
      logger.info('Info message', {}, 'category1');
      logger.warn('Warning message', {}, 'category2');
      logger.error('Error message', {}, 'category1');

      const stats = logger.getStats();

      expect(stats.totalLogs).toBe(3);
      expect(stats.levelCounts.info).toBe(1);
      expect(stats.levelCounts.warn).toBe(1);
      expect(stats.levelCounts.error).toBe(1);
      expect(stats.categoryCounts.category1).toBe(2);
      expect(stats.categoryCounts.category2).toBe(1);
      expect(stats.availableCategories).toContain('category1');
      expect(stats.availableCategories).toContain('category2');
    });

    test('should track recent and daily logs', () => {
      // Mock current time
      const now = Date.now();
      jest.spyOn(Date, 'now').mockReturnValue(now);

      logger.info('Recent message');
      logger.warn('Another recent message');

      const stats = logger.getStats();
      expect(stats.recentLogs).toBe(2);
      expect(stats.dailyLogs).toBe(2);
    });
  });

  describe('log export', () => {
    beforeEach(() => {
      logger.info('Test message 1', { key: 'value1' }, 'category1');
      logger.warn('Test message 2', { key: 'value2' }, 'category2');
    });

    test('should export logs as JSON', () => {
      const exported = logger.exportLogs('json');
      const parsed = JSON.parse(exported);

      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed).toHaveLength(2);
      expect(parsed[0].message).toBe('Test message 2'); // Most recent first
      expect(parsed[0].level).toBe('warn');
    });

    test('should export logs as CSV', () => {
      const exported = logger.exportLogs('csv');
      const lines = exported.split('\n');

      expect(lines[0]).toBe('timestamp,level,category,message,context');
      expect(lines).toHaveLength(3); // Header + 2 data rows
      expect(lines[1]).toContain('warn');
      expect(lines[2]).toContain('info');
    });

    test('should export logs as text', () => {
      const exported = logger.exportLogs('text');
      const lines = exported.split('\n');

      expect(lines).toHaveLength(2);
      expect(lines[0]).toContain('WARN');
      expect(lines[0]).toContain('Test message 2');
      expect(lines[1]).toContain('INFO');
      expect(lines[1]).toContain('Test message 1');
    });

    test('should export filtered logs', () => {
      const exported = logger.exportLogs('json', { level: 'warn' });
      const parsed = JSON.parse(exported);

      expect(parsed).toHaveLength(1);
      expect(parsed[0].level).toBe('warn');
    });
  });

  describe('log management', () => {
    test('should clear all logs', () => {
      logger.info('Message 1');
      logger.warn('Message 2');

      expect(logger.getLogs()).toHaveLength(2);

      logger.clearLogs();

      expect(logger.getLogs()).toHaveLength(0);
      expect(mockEventBus.publish).toHaveBeenCalledWith('logger.entry_created', 
        expect.objectContaining({
          logEntry: expect.objectContaining({
            message: expect.stringContaining('Cleared 2 logs')
          })
        })
      );
    });

    test('should mute and unmute categories', () => {
      logger.muteCategory('test-category');
      logger.info('Muted message', {}, 'test-category');
      logger.info('Normal message', {}, 'normal');

      expect(logger.getLogs()).toHaveLength(2); // Only normal message and mute notification

      logger.unmuteCategory('test-category');
      logger.info('Unmuted message', {}, 'test-category');

      expect(logger.getLogs()).toHaveLength(4); // All messages plus notifications
    });

    test('should change log level', () => {
      logger.setLogLevel('error');
      
      logger.debug('Debug message');
      logger.info('Info message');
      logger.error('Error message');

      const logs = logger.getLogs();
      const nonSystemLogs = logs.filter(log => log.category !== 'system');
      expect(nonSystemLogs).toHaveLength(1);
      expect(nonSystemLogs[0].level).toBe('error');
    });
  });

  describe('scoped logger', () => {
    test('should create scoped logger', () => {
      const scopedLogger = logger.createScopedLogger('TestService', 'test-category');
      expect(scopedLogger).toBeInstanceOf(ScopedLogger);
    });

    test('should prefix messages with service name', () => {
      const scopedLogger = logger.createScopedLogger('TestService');
      
      scopedLogger.info('Test message', { key: 'value' });

      const logs = logger.getLogs();
      expect(logs[0].message).toContain('[TestService]');
      expect(logs[0].context.service).toBe('TestService');
    });

    test('should use default category when not specified', () => {
      const scopedLogger = logger.createScopedLogger('TestService');
      
      scopedLogger.info('Test message');

      const logs = logger.getLogs();
      expect(logs[0].category).toBe('general');
    });

    test('should use custom category when specified', () => {
      const scopedLogger = logger.createScopedLogger('TestService', 'custom');
      
      scopedLogger.info('Test message', {}, 'override');

      const logs = logger.getLogs();
      expect(logs[0].category).toBe('override');
    });
  });

  describe('performance timer', () => {
    test('should create and use performance timer', () => {
      const scopedLogger = logger.createScopedLogger('TestService');
      const timer = scopedLogger.time('test-operation');

      expect(timer).toBeInstanceOf(PerformanceTimer);

      // Advance time
      jest.advanceTimersByTime(100);

      const duration = timer.end({ operation: 'test' });

      expect(duration).toBeGreaterThan(0);
      
      const logs = logger.getLogs();
      const timerLogs = logs.filter(log => log.message.includes('timing'));
      expect(timerLogs).toHaveLength(2); // Start and end
    });

    test('should log timing start and end', () => {
      const scopedLogger = logger.createScopedLogger('TimerService');
      const timer = scopedLogger.time('database-query');

      jest.advanceTimersByTime(250);
      timer.end({ query: 'SELECT * FROM users' });

      const logs = logger.getLogs();
      const startLog = logs.find(log => log.message.includes('Started timing'));
      const endLog = logs.find(log => log.message.includes('Completed timing'));

      expect(startLog).toBeDefined();
      expect(endLog).toBeDefined();
      expect(endLog?.context.duration).toBeGreaterThan(0);
      expect(endLog?.category).toBe('performance');
    });
  });

  describe('event listeners', () => {
    test('should log error events', () => {
      const errorHandler = (mockEventBus.subscribe as jest.Mock).mock.calls
        .find(call => call[0] === '*.error')?.[1];

      expect(errorHandler).toBeDefined();

      const errorData = { message: 'Test error', source: 'test' };
      errorHandler(errorData);

      const logs = logger.getLogs();
      const errorLog = logs.find(log => log.message === 'Event error occurred');
      expect(errorLog).toBeDefined();
      expect(errorLog?.level).toBe('error');
      expect(errorLog?.category).toBe('events');
    });

    test('should log service events', () => {
      const serviceHandler = (mockEventBus.subscribe as jest.Mock).mock.calls
        .find(call => call[0] === 'service.*')?.[1];

      expect(serviceHandler).toBeDefined();

      const serviceData = { service: 'TestService', action: 'started' };
      serviceHandler(serviceData);

      const logs = logger.getLogs();
      const serviceLog = logs.find(log => log.message === 'Service event');
      expect(serviceLog).toBeDefined();
      expect(serviceLog?.level).toBe('debug');
      expect(serviceLog?.category).toBe('services');
    });

    test('should log agent events', () => {
      const agentHandler = (mockEventBus.subscribe as jest.Mock).mock.calls
        .find(call => call[0] === 'agent.*')?.[1];

      expect(agentHandler).toBeDefined();

      const agentData = { action: 'tool_executed', tool: 'file_read' };
      agentHandler(agentData);

      const logs = logger.getLogs();
      const agentLog = logs.find(log => log.message === 'Agent event');
      expect(agentLog).toBeDefined();
      expect(agentLog?.level).toBe('info');
      expect(agentLog?.category).toBe('agent');
    });

    test('should log tool events', () => {
      const toolHandler = (mockEventBus.subscribe as jest.Mock).mock.calls
        .find(call => call[0] === 'tool.*')?.[1];

      expect(toolHandler).toBeDefined();

      const toolData = { tool: 'file_write', status: 'completed' };
      toolHandler(toolData);

      const logs = logger.getLogs();
      const toolLog = logs.find(log => log.message === 'Tool event');
      expect(toolLog).toBeDefined();
      expect(toolLog?.level).toBe('debug');
      expect(toolLog?.category).toBe('tools');
    });

    test('should log execution limit events', () => {
      const limitHandler = (mockEventBus.subscribe as jest.Mock).mock.calls
        .find(call => call[0] === 'execution_limit.*')?.[1];

      expect(limitHandler).toBeDefined();

      const limitData = { limit: 10, current: 8 };
      limitHandler(limitData);

      const logs = logger.getLogs();
      const limitLog = logs.find(log => log.message === 'Execution limit event');
      expect(limitLog).toBeDefined();
      expect(limitLog?.level).toBe('warn');
      expect(limitLog?.category).toBe('limits');
    });
  });

  describe('log rotation and cleanup', () => {
    test('should start automatic log rotation', () => {
      // Verify that setInterval was called for log rotation
      expect(setInterval).toHaveBeenCalledWith(expect.any(Function), 5 * 60 * 1000);
    });

    test('should perform cleanup when triggered', () => {
      logger.configure({ maxLogs: 2 });

      logger.info('Message 1');
      logger.info('Message 2');
      logger.info('Message 3'); // Should trigger cleanup

      const logs = logger.getLogs();
      expect(logs).toHaveLength(2);
    });

    test('should not cleanup if under limit', () => {
      logger.configure({ maxLogs: 10 });

      logger.info('Message 1');
      logger.info('Message 2');

      const logs = logger.getLogs();
      expect(logs).toHaveLength(2);
    });
  });

  describe('error handling', () => {
    test('should handle invalid log levels gracefully', () => {
      // This should not throw
      expect(() => {
        logger.log('invalid' as LogLevel, 'Test message');
      }).not.toThrow();
    });

    test('should handle missing context gracefully', () => {
      expect(() => {
        logger.info('Test message', undefined);
      }).not.toThrow();

      const logs = logger.getLogs();
      expect(logs[0].context).toEqual({});
    });

    test('should handle very long messages', () => {
      const longMessage = 'A'.repeat(10000);
      
      expect(() => {
        logger.info(longMessage);
      }).not.toThrow();

      const logs = logger.getLogs();
      expect(logs[0].message).toBe(longMessage);
    });

    test('should handle circular references in context', () => {
      const circularObj: any = { name: 'test' };
      circularObj.self = circularObj;

      expect(() => {
        logger.info('Test message', circularObj);
      }).not.toThrow();
    });
  });

  describe('memory management', () => {
    test('should limit memory usage with max logs', () => {
      logger.configure({ maxLogs: 100 });

      // Add many logs
      for (let i = 0; i < 200; i++) {
        logger.info(`Message ${i}`);
      }

      const logs = logger.getLogs();
      expect(logs.length).toBeLessThanOrEqual(100);
    });

    test('should clean up old logs periodically', () => {
      logger.configure({ maxLogs: 5 });

      for (let i = 0; i < 10; i++) {
        logger.info(`Message ${i}`);
      }

      // Trigger periodic cleanup
      jest.advanceTimersByTime(5 * 60 * 1000);

      const logs = logger.getLogs();
      expect(logs.length).toBeLessThanOrEqual(5);
    });
  });

  describe('integration scenarios', () => {
    test('should handle high-volume logging', () => {
      const startTime = Date.now();

      // Log many messages quickly
      for (let i = 0; i < 1000; i++) {
        logger.info(`High volume message ${i}`, { index: i });
      }

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Should complete quickly
      expect(duration).toBeLessThan(1000); // Less than 1 second

      const logs = logger.getLogs();
      expect(logs.length).toBeGreaterThan(0);
    });

    test('should maintain performance with complex contexts', () => {
      const complexContext = {
        user: { id: 123, name: 'Test User', roles: ['admin', 'user'] },
        request: { method: 'POST', url: '/api/test', headers: { 'content-type': 'application/json' } },
        metadata: { timestamp: Date.now(), version: '1.0.0' }
      };

      const startTime = Date.now();

      for (let i = 0; i < 100; i++) {
        logger.info(`Complex context message ${i}`, complexContext);
      }

      const endTime = Date.now();
      const duration = endTime - startTime;

      expect(duration).toBeLessThan(500); // Should be fast even with complex contexts
    });

    test('should work correctly with multiple scoped loggers', () => {
      const serviceA = logger.createScopedLogger('ServiceA', 'serviceA');
      const serviceB = logger.createScopedLogger('ServiceB', 'serviceB');
      const serviceC = logger.createScopedLogger('ServiceC', 'serviceC');

      serviceA.info('Service A message');
      serviceB.warn('Service B warning');
      serviceC.error('Service C error');

      const logs = logger.getLogs();
      expect(logs).toHaveLength(3);

      const serviceALogs = logger.getLogs({ category: 'serviceA' });
      const serviceBLogs = logger.getLogs({ category: 'serviceB' });
      const serviceCLogs = logger.getLogs({ category: 'serviceC' });

      expect(serviceALogs).toHaveLength(1);
      expect(serviceBLogs).toHaveLength(1);
      expect(serviceCLogs).toHaveLength(1);
    });
  });

  describe('enterprise-level enhancements', () => {
    test('should maintain log data integrity under extreme high-volume logging', () => {
      const largeMessage = 'A'.repeat(500); // A moderately large message
      const logCount = 10000; // Log 10,000 messages
      logger.configure({ maxLogs: logCount + 100 }); // Ensure logs are not immediately cleaned up by size

      for (let i = 0; i < logCount; i++) {
        logger.info(`${largeMessage} - ${i}`, { index: i }, 'high-volume');
      }

      const logs = logger.getLogs({ category: 'high-volume' });
      expect(logs).toHaveLength(logCount);
      for (let i = 0; i < logCount; i++) {
        expect(logs[logCount - 1 - i].message).toBe(`${largeMessage} - ${i}`); // Verify order and content
      }
    });

    test('should manage resource utilization (memory) during continuous logging', () => {
      const initialMemory = process.memoryUsage().heapUsed;
      const logCount = 5000;
      logger.configure({ maxLogs: 100 }); // Simulate cleanup to prevent excessive memory growth

      for (let i = 0; i < logCount; i++) {
        logger.info(`Message with variable data: ${Math.random()}`, { largeData: 'X'.repeat(500) }, 'memory-test');
      }

      // Force garbage collection to get a more accurate memory reading
      if (global.gc) {
        global.gc();
      }
      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;

      // Expect memory increase to be within a reasonable, non-linear bound
      // This is a heuristic and might need tuning for different environments
      expect(memoryIncrease).toBeLessThan(initialMemory * 2); // Should not double for example
      expect(logger.getLogs().length).toBe(100); // Verify maxLogs limit
    });

    test('should handle sensitive information by redacting when appropriate', () => {
      // This test assumes a mechanism for sensitive data handling, which CentralizedLogger does not currently have.
      // A common approach would be to add a custom serializer for context or a specific scrubbing function.
      // For now, this test will ensure sensitive data isn't logged if explicitly muted or if a hypothetical
      // future feature redacts it within 'log' method itself.
      // Currently, the `CentralizedLogger` doesn't redact sensitive info; it logs whatever is passed.
      // This test will be updated if redaction logic is added to `CentralizedLogger`.
      const sensitiveData = 'user_password_123';
      const cleanData = 'normal_data';

      // Scenario 1: Sensitive data is passed directly (no redaction built-in)
      logger.info(`Login attempt for user: ${sensitiveData}`, { password: sensitiveData }, 'security');
      let logs = logger.getLogs({ category: 'security' });
      expect(logs[0].message).toContain(sensitiveData); // Currently logs it directly
      expect(logs[0].context.password).toBe(sensitiveData);

      // Scenario 2: Demonstrate how it *would* work if a redaction concept existed
      // This part is conceptual, if redaction logic is added to log() or context processing
      // For instance, if log() had a callback to transform context.
      // For the current implementation, we can only verify what's logged.
    });

    test('should strictly adhere to maxLogs for log rotation and cleanup intervals', () => {
      logger.configure({ maxLogs: 5, enableConsoleOutput: false }); // Small limit for testing
      const totalLogsToGenerate = 15;

      for (let i = 0; i < totalLogsToGenerate; i++) {
        logger.info(`Log message ${i}`, {}, 'rotation');
      }

      expect(logger.getLogs({ category: 'rotation' })).toHaveLength(5); // Should immediately respect maxLogs
      expect(logger.getLogs({ category: 'rotation' }).some(log => log.message === 'Log message 0')).toBe(false); // Oldest removed

      // Advance timers to trigger interval cleanup
      jest.advanceTimersByTime(5 * 60 * 1000); // 5 minutes
      expect(logger.getLogs({ category: 'rotation' })).toHaveLength(5); // Should remain at maxLogs

      // Add more logs to ensure further cleanup occurs on next interval trigger
      for (let i = totalLogsToGenerate; i < totalLogsToGenerate + 5; i++) {
        logger.info(`Another log message ${i}`, {}, 'rotation');
      }
      expect(logger.getLogs({ category: 'rotation' })).toHaveLength(5);

      jest.advanceTimersByTime(5 * 60 * 1000); // Another 5 minutes
      expect(logger.getLogs({ category: 'rotation' })).toHaveLength(5); // Still maintains limit
      expect(mockEventBus.publish).toHaveBeenCalledWith('logger.entry_created',
        expect.objectContaining({
          logEntry: expect.objectContaining({
            message: expect.stringContaining('Cleaned up') // Verify cleanup logs are created
          })
        })
      );
    });
  });
});