/**
 * @file errorHandler.test.ts
 * @description Tests for the error handler utility
 */

import { ErrorHandler } from '../../src/utils/errorHandler';

// Mock dependencies
jest.mock('../../src/utils/logger', () => ({
    debugLog: jest.fn()
}));

jest.mock('../../src/utils/performanceMonitor', () => ({
    performanceMonitor: {
        recordError: jest.fn()
    }
}));

describe('ErrorHandler', () => {
    let errorHandler: ErrorHandler;

    beforeEach(() => {
        errorHandler = ErrorHandler.getInstance();
        // Clear error counts and history
        (errorHandler as any).errorCounts.clear();
        (errorHandler as any).lastErrors.clear();
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('getInstance', () => {
        it('should return the same instance (singleton pattern)', () => {
            const instance1 = ErrorHandler.getInstance();
            const instance2 = ErrorHandler.getInstance();
            expect(instance1).toBe(instance2);
        });
    });

    describe('handleError', () => {
        it('should handle standard errors', () => {
            const error = new Error('Test error');
            const context = {
                component: 'TestComponent',
                operation: 'testOperation'
            };

            expect(() => {
                errorHandler.handleError(error, context, { showNotice: false });
            }).not.toThrow();
        });

        it('should handle unknown error types', () => {
            const error = 'String error';
            const context = {
                component: 'TestComponent',
                operation: 'testOperation'
            };

            expect(() => {
                errorHandler.handleError(error, context, { showNotice: false });
            }).not.toThrow();
        });

        it('should track error counts', () => {
            const error = new Error('Test error');
            const context = {
                component: 'TestComponent',
                operation: 'testOperation'
            };

            errorHandler.handleError(error, context, { showNotice: false });
            errorHandler.handleError(error, context, { showNotice: false });

            const errorKey = `${context.component}:${context.operation}`;
            expect((errorHandler as any).errorCounts.get(errorKey)).toBe(2);
        });

        it('should include metadata in context', () => {
            const error = new Error('Test error');
            const context = {
                component: 'TestComponent',
                operation: 'testOperation',
                metadata: { userId: '123', action: 'save' }
            };

            expect(() => {
                errorHandler.handleError(error, context, { showNotice: false });
            }).not.toThrow();
        });
    });

    describe('getErrorMessage', () => {
        it('should extract message from Error object', () => {
            const message = (errorHandler as any).getErrorMessage(new Error('Test error'));
            expect(message).toBe('Test error');
        });

        it('should handle string errors', () => {
            const message = (errorHandler as any).getErrorMessage('String error');
            expect(message).toBe('String error');
        });

        it('should handle unknown error types', () => {
            const message = (errorHandler as any).getErrorMessage({ custom: 'object' });
            expect(message).toBe('Unknown error occurred');
        });

        it('should handle null/undefined errors', () => {
            expect((errorHandler as any).getErrorMessage(null)).toBe('Unknown error occurred');
            expect((errorHandler as any).getErrorMessage(undefined)).toBe('Unknown error occurred');
        });
    });

    describe('formatErrorMessage', () => {
        it('should format error message with component and operation', () => {
            const context = {
                component: 'TestComponent',
                operation: 'testOperation'
            };
            const formatted = (errorHandler as any).formatErrorMessage('Error message', context);
            expect(formatted).toContain('TestComponent');
            expect(formatted).toContain('testOperation');
            expect(formatted).toContain('Error message');
        });
    });

    describe('shouldShowNotice', () => {
        it('should respect showNotice option when true', () => {
            const result = (errorHandler as any).shouldShowNotice(
                new Error('Test'),
                { component: 'Test', operation: 'test' },
                { showNotice: true }
            );
            expect(result).toBe(true);
        });

        it('should respect showNotice option when false', () => {
            const result = (errorHandler as any).shouldShowNotice(
                new Error('Test'),
                { component: 'Test', operation: 'test' },
                { showNotice: false }
            );
            expect(result).toBe(false);
        });
    });

    describe('isErrorRateLimited', () => {
        it('should not rate limit first error', () => {
            const errorKey = 'Test:operation';
            const result = (errorHandler as any).isErrorRateLimited(errorKey);
            expect(result).toBe(false);
        });

        it('should rate limit after max error count', () => {
            const errorKey = 'Test:operation';
            const maxCount = (errorHandler as any).MAX_ERROR_COUNT;

            // Simulate max errors
            for (let i = 0; i < maxCount; i++) {
                (errorHandler as any).incrementErrorCount(errorKey);
            }

            const result = (errorHandler as any).isErrorRateLimited(errorKey);
            expect(result).toBe(true);
        });
    });

    describe('API error classification', () => {
        it('should identify authentication errors', () => {
            const error = new Error('Authentication failed');
            (error as any).status = 401;
            expect((errorHandler as any).isAuthenticationError(error)).toBe(true);
        });

        it('should identify rate limit errors', () => {
            const error = new Error('Rate limit exceeded');
            (error as any).status = 429;
            expect((errorHandler as any).isRateLimitError(error)).toBe(true);
        });

        it('should identify network errors', () => {
            const error = new Error('Network error');
            (error as any).code = 'ECONNREFUSED';
            expect((errorHandler as any).isNetworkError(error)).toBe(true);
        });
    });
});
