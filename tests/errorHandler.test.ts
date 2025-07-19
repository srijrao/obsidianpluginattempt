import { ErrorHandler, ErrorContext, ErrorHandlingOptions, errorHandler, withErrorHandling } from '../src/utils/errorHandler';
import { Notice } from 'obsidian'; // Keep import for type information
import { debugLog } from '../src/utils/logger';

jest.mock('../src/utils/logger', () => ({
  debugLog: jest.fn(),
}));

describe('ErrorHandler', () => {
  let handler: ErrorHandler;
  let mockNotice: jest.Mock;
  let mockDebugLog: jest.Mock;

  beforeEach(() => {
    // Set up fake timers first
    jest.useFakeTimers();
    
    // Clear all mocks and reset singleton instance before each test
    jest.clearAllMocks();
    (Notice as jest.Mock).mockClear();
    (debugLog as jest.Mock).mockClear();
    
    // Reset the singleton instance for consistent testing
    // @ts-ignore - Accessing private static property for testing purposes
    ErrorHandler['instance'] = undefined;
    handler = ErrorHandler.getInstance();
    handler.resetErrorCounts(); // Ensure no lingering error counts from previous tests

    mockNotice = Notice as jest.Mock;
    mockDebugLog = debugLog as jest.Mock;
  });

  afterEach(() => {
    // Only run pending timers if fake timers are active
    if (jest.isMockFunction(setTimeout)) {
      jest.runOnlyPendingTimers();
    }
    jest.useRealTimers();
  });

  describe('getInstance', () => {
    test('should return a singleton instance', () => {
      const instance1 = ErrorHandler.getInstance();
      const instance2 = ErrorHandler.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe('handleError', () => {
    const context: ErrorContext = { component: 'TestComponent', operation: 'testOperation' };

    test('should log the error and show a notice by default', () => {
      const error = new Error('Something went wrong');
      handler.handleError(error, context);

      expect(mockDebugLog).toHaveBeenCalledTimes(1);
      expect(mockDebugLog).toHaveBeenCalledWith(
        true, 'error', '[TestComponent] testOperation failed:',
        expect.objectContaining({ error: 'Something went wrong' })
      );
      expect(mockNotice).toHaveBeenCalledTimes(1);
      expect(mockNotice).toHaveBeenCalledWith('TestComponent: Something went wrong', 3000);
    });

    test('should not show notice if showNotice is false', () => {
      const error = new Error('No notice here');
      handler.handleError(error, context, { showNotice: false });

      expect(mockDebugLog).toHaveBeenCalledTimes(1);
      expect(mockNotice).not.toHaveBeenCalled();
    });

    test('should use specified logLevel', () => {
      const error = new Error('Warning error');
      handler.handleError(error, context, { logLevel: 'warn' });

      expect(mockDebugLog).toHaveBeenCalledWith(
        true, 'warn', expect.any(String), expect.any(Object)
      );
    });

    test('should use fallbackMessage if error message is too long', () => {
      const longErrorMessage = 'a'.repeat(150);
      handler.handleError(new Error(longErrorMessage), context, { fallbackMessage: 'Fallback' });

      expect(mockNotice).toHaveBeenCalledWith('TestComponent: Fallback', 3000);
    });

    test('should pass retryable status to debugLog and Notice', () => {
      const error = new Error('Retryable error');
      handler.handleError(error, context, { retryable: true });

      expect(mockDebugLog).toHaveBeenCalledWith(
        true, 'error', expect.any(String), expect.objectContaining({ retryable: true })
      );
      expect(mockNotice).toHaveBeenCalledWith('TestComponent: Retryable error', 5000);
    });

    test('should track error counts and suppress notices after MAX_ERROR_COUNT', () => {
      const error = new Error('Frequent error');
      const frequentContext: ErrorContext = { component: 'Frequent', operation: 'op' };

      // First 3 notices should show
      for (let i = 0; i < 3; i++) {
        handler.handleError(error, frequentContext);
        expect(mockNotice).toHaveBeenCalledTimes(i + 1);
      }
      expect(handler.getErrorStats()['Frequent:op'].count).toBe(3);

      // Next 2 should show (up to MAX_ERROR_COUNT = 5)
      handler.handleError(error, frequentContext);
      expect(mockNotice).toHaveBeenCalledTimes(4);
      handler.handleError(error, frequentContext);
      expect(mockNotice).toHaveBeenCalledTimes(5);
      expect(handler.getErrorStats()['Frequent:op'].count).toBe(5);

      // Subsequent errors should not show notice
      handler.handleError(error, frequentContext);
      expect(mockNotice).toHaveBeenCalledTimes(5); // Still 5
      expect(handler.getErrorStats()['Frequent:op'].count).toBe(6);
    });

    test('should reset error counts after ERROR_RESET_TIME', () => {
      const error = new Error('Timed error');
      const timedContext: ErrorContext = { component: 'Timed', operation: 'op' };

      // Mock Date.now() to control time
      let mockTime = 0;
      jest.spyOn(global.Date, 'now').mockImplementation(() => mockTime);

      handler.handleError(error, timedContext);
      expect(handler.getErrorStats()['Timed:op'].count).toBe(1);
      expect(global.Date.now).toHaveBeenCalledTimes(2);

      // Advance time past the reset threshold
      mockTime += 5 * 60 * 1000 + 1; // 5 minutes + 1ms
      
      // Handle another error, which should trigger cleanup of the old error
      handler.handleError(new Error('Another error'), timedContext);
      expect(handler.getErrorStats()['Timed:op'].count).toBe(1); // Count should reset to 1
      expect(global.Date.now).toHaveBeenCalledTimes(4); // Called for first error (2), then for second error (2)
    });
  });

  describe('handleAsync', () => {
    const context: ErrorContext = { component: 'AsyncTest', operation: 'asyncOp' };

    test('should return result of successful async operation', async () => {
      const result = await handler.handleAsync(async () => 'success', context);
      expect(result).toBe('success');
      expect(mockDebugLog).not.toHaveBeenCalled();
      expect(mockNotice).not.toHaveBeenCalled();
    });

    test('should handle errors from async operation', async () => {
      const error = new Error('Async failure');
      const result = await handler.handleAsync(async () => { throw error; }, context);
      expect(result).toBeNull();
      expect(mockDebugLog).toHaveBeenCalledTimes(1);
      expect(mockNotice).toHaveBeenCalledTimes(1);
    });
  });

  describe('handleSync', () => {
    const context: ErrorContext = { component: 'SyncTest', operation: 'syncOp' };

    test('should return result of successful sync operation', () => {
      const result = handler.handleSync(() => 'sync success', context);
      expect(result).toBe('sync success');
      expect(mockDebugLog).not.toHaveBeenCalled();
      expect(mockNotice).not.toHaveBeenCalled();
    });

    test('should handle errors from sync operation', () => {
      const error = new Error('Sync failure');
      const result = handler.handleSync(() => { throw error; }, context);
      expect(result).toBeNull();
      expect(mockDebugLog).toHaveBeenCalledTimes(1);
      expect(mockNotice).toHaveBeenCalledTimes(1);
    });
  });

  describe('wrapAsync', () => {
    const context: ErrorContext = { component: 'WrapAsyncTest', operation: 'wrappedAsyncOp' };

    test('should return wrapped async function that handles errors', async () => {
      const originalFn = jest.fn(async (arg: string) => {
        if (arg === 'fail') throw new Error('Wrapped async failure');
        return `Wrapped: ${arg}`;
      });
      const wrappedFn = handler.wrapAsync(originalFn, context);

      await wrappedFn('success');
      expect(originalFn).toHaveBeenCalledWith('success');
      expect(mockDebugLog).not.toHaveBeenCalled();
      expect(mockNotice).not.toHaveBeenCalled();

      await wrappedFn('fail');
      expect(originalFn).toHaveBeenCalledWith('fail');
      expect(mockDebugLog).toHaveBeenCalledTimes(1);
      expect(mockNotice).toHaveBeenCalledTimes(1);
    });
  });

  describe('wrapSync', () => {
    const context: ErrorContext = { component: 'WrapSyncTest', operation: 'wrappedSyncOp' };

    test('should return wrapped sync function that handles errors', () => {
      const originalFn = jest.fn((arg: string) => {
        if (arg === 'fail') throw new Error('Wrapped sync failure');
        return `Wrapped: ${arg}`;
      });
      const wrappedFn = handler.wrapSync(originalFn, context);

      wrappedFn('success');
      expect(originalFn).toHaveBeenCalledWith('success');
      expect(mockDebugLog).not.toHaveBeenCalled();
      expect(mockNotice).not.toHaveBeenCalled();

      wrappedFn('fail');
      expect(originalFn).toHaveBeenCalledWith('fail');
      expect(mockDebugLog).toHaveBeenCalledTimes(1);
      expect(mockNotice).toHaveBeenCalledTimes(1);
    });
  });

  describe('isRetryableError', () => {
    test('should identify network-related errors as retryable', () => {
      expect(handler.isRetryableError(new Error('Network error'))).toBe(true);
      expect(handler.isRetryableError(new Error('Request timed out'))).toBe(true);
      expect(handler.isRetryableError(new Error('Rate limit exceeded'))).toBe(true);
      expect(handler.isRetryableError(new Error('Service Unavailable (503)'))).toBe(true);
      expect(handler.isRetryableError(new Error('ECONNRESET'))).toBe(true);
    });

    test('should not identify non-retryable errors as retryable', () => {
      expect(handler.isRetryableError(new Error('Invalid API key'))).toBe(false);
      expect(handler.isRetryableError(new Error('File not found'))).toBe(false);
      expect(handler.isRetryableError('Some custom error')).toBe(false);
    });


  });

  describe('getErrorStats', () => {
    test('should return current error statistics', () => {
      const context1: ErrorContext = { component: 'Comp1', operation: 'Op1' };
      const context2: ErrorContext = { component: 'Comp2', operation: 'Op2' };

      handler.handleError(new Error('Error A'), context1);
      handler.handleError(new Error('Error B'), context1); // Same key
      handler.handleError(new Error('Error C'), context2);

      const stats = handler.getErrorStats();
      expect(stats['Comp1:Op1'].count).toBe(2);
      expect(stats['Comp1:Op1'].lastError).toBe('Error B');
      expect(stats['Comp1:Op1'].lastTimestamp).toBeGreaterThan(0);

      expect(stats['Comp2:Op2'].count).toBe(1);
      expect(stats['Comp2:Op2'].lastError).toBe('Error C');
      expect(stats['Comp2:Op2'].lastTimestamp).toBeGreaterThan(0);
    });

    test('should return empty stats if no errors', () => {
      expect(handler.getErrorStats()).toEqual({});
    });
  });

  describe('resetErrorCounts', () => {
    test('should clear all error counts and last errors', () => {
      handler.handleError(new Error('Error'), { component: 'Comp', operation: 'Op' });
      expect(Object.keys(handler.getErrorStats()).length).toBe(1);

      handler.resetErrorCounts();
      expect(Object.keys(handler.getErrorStats()).length).toBe(0);
    });
  });

  describe('private methods', () => {
    // Test extractErrorMessage indirectly via handleError
    test('extractErrorMessage should handle various error types', () => {
      handler.handleError('string error', { component: 'Extract', operation: 'string' });
      expect(mockDebugLog).toHaveBeenCalledWith(
        true, 'error', expect.any(String), expect.objectContaining({ error: 'string error' })
      );

      handler.handleError({ message: 'object error' }, { component: 'Extract', operation: 'object' });
      expect(mockDebugLog).toHaveBeenCalledWith(
        true, 'error', expect.any(String), expect.objectContaining({ error: 'object error' })
      );

      handler.handleError(null, { component: 'Extract', operation: 'null' });
      expect(mockDebugLog).toHaveBeenCalledWith(
        true, 'error', expect.any(String), expect.objectContaining({ error: 'Unknown error' })
      );
    });

    // Test sanitizeErrorMessage
    test('sanitizeErrorMessage should remove sensitive data', () => {
      const sensitiveMessage = 'API_KEY: abc123 token=xyz password=123 http://example.com 192.168.1.1';
      handler.handleError(new Error(sensitiveMessage), { component: 'Sanitize', operation: 'test' });
      
      expect(mockNotice).toHaveBeenCalledWith(
        'Sanitize: API_KEY_HIDDEN TOKEN_HIDDEN PASSWORD_HIDDEN URL_HIDDEN IP_HIDDEN', 3000
      );
    });

    test('sanitizeErrorMessage should handle multiple occurrences', () => {
      const sensitiveMessage = 'key=123 token=abc key=456';
      handler.handleError(new Error(sensitiveMessage), { component: 'Sanitize', operation: 'multi' });
      
      expect(mockNotice).toHaveBeenCalledWith(
        'Sanitize: API_KEY_HIDDEN TOKEN_HIDDEN API_KEY_HIDDEN', 3000
      );
    });
  });

  describe('convenience functions', () => {
    test('errorHandler instance should be available', () => {
      expect(errorHandler).toBeInstanceOf(ErrorHandler);
    });

    test('withErrorHandling should use errorHandler.handleAsync', async () => {
      const mockOperation = jest.fn(async () => 'data');
      const result = await withErrorHandling(mockOperation, 'Convenience', 'testOp');
      expect(result).toBe('data');
      expect(mockOperation).toHaveBeenCalledTimes(1);
    });

    test('withErrorHandling should handle errors', async () => {
      const mockOperation = jest.fn(async () => { throw new Error('Convenience error'); });
      const result = await withErrorHandling(mockOperation, 'Convenience', 'testOp');
      expect(result).toBeNull();
      expect(mockDebugLog).toHaveBeenCalledTimes(1);
      expect(mockNotice).toHaveBeenCalledTimes(1);
    });
  });
});