/**
 * @file errorHandler.ts
 * 
 * Centralized error handling system for the AI Assistant plugin.
 * Provides consistent error handling patterns, logging, and user notifications.
 */

import { Notice } from 'obsidian';
import { debugLog } from './logger';

export interface ErrorContext {
    component: string;
    operation: string;
    metadata?: Record<string, any>;
}

export interface ErrorHandlingOptions {
    showNotice?: boolean;
    logLevel?: 'error' | 'warn' | 'info';
    fallbackMessage?: string;
    retryable?: boolean;
}

export class ErrorHandler {
    private static instance: ErrorHandler;
    private errorCounts = new Map<string, number>();
    private lastErrors = new Map<string, { error: Error; timestamps: number[] }>(); // Changed to array of timestamps
    private readonly MAX_ERROR_COUNT = 5;
    private readonly ERROR_RESET_TIME = 5 * 60 * 1000; // 5 minutes

    static getInstance(): ErrorHandler {
        if (!ErrorHandler.instance) {
            ErrorHandler.instance = new ErrorHandler();
        }
        return ErrorHandler.instance;
    }

    /**
     * Handle an error with consistent logging and user notification
     */
    handleError(
        error: Error | unknown,
        context: ErrorContext,
        options: ErrorHandlingOptions = {}
    ): void {
        const {
            showNotice = true,
            logLevel = 'error',
            fallbackMessage = 'An unexpected error occurred',
            retryable = false
        } = options;

        const errorKey = `${context.component}:${context.operation}`;
        const errorMessage = this.extractErrorMessage(error);
        const enhancedError = this.enhanceError(error, context);

        // Track error frequency
        this.trackError(errorKey, enhancedError);

        // Log the error
        debugLog(true, logLevel, `[${context.component}] ${context.operation} failed:`, {
            error: errorMessage,
            context: context.metadata,
            retryable,
            errorCount: this.errorCounts.get(errorKey) || 0
        });

        // Show user notification if requested
        if (showNotice && this.shouldShowNotice(errorKey)) {
            const userMessage = this.formatUserMessage(errorMessage, context, fallbackMessage);
            new Notice(userMessage, retryable ? 5000 : 3000);
        }
    }

    /**
     * Handle async operations with automatic error handling
     */
    async handleAsync<T>(
        operation: () => Promise<T>,
        context: ErrorContext,
        options: ErrorHandlingOptions = {}
    ): Promise<T | null> {
        try {
            return await operation();
        } catch (error) {
            this.handleError(error, context, options);
            return null;
        }
    }

    /**
     * Handle sync operations with automatic error handling
     */
    handleSync<T>(
        operation: () => T,
        context: ErrorContext,
        options: ErrorHandlingOptions = {}
    ): T | null {
        try {
            return operation();
        } catch (error) {
            this.handleError(error, context, options);
            return null;
        }
    }

    /**
     * Create a wrapped version of an async function with error handling
     */
    wrapAsync<TArgs extends any[], TReturn>(
        fn: (...args: TArgs) => Promise<TReturn>,
        context: ErrorContext,
        options: ErrorHandlingOptions = {}
    ): (...args: TArgs) => Promise<TReturn | null> {
        return async (...args: TArgs) => {
            return this.handleAsync(() => fn(...args), context, options);
        };
    }

    /**
     * Create a wrapped version of a sync function with error handling
     */
    wrapSync<TArgs extends any[], TReturn>(
        fn: (...args: TArgs) => TReturn,
        context: ErrorContext,
        options: ErrorHandlingOptions = {}
    ): (...args: TArgs) => TReturn | null {
        return (...args: TArgs) => {
            return this.handleSync(() => fn(...args), context, options);
        };
    }

    /**
     * Check if an error is retryable based on its type
     */
    isRetryableError(error: Error | unknown): boolean {
        const errorMessage = this.extractErrorMessage(error);
        const retryablePatterns = [
            /network/i,
            /timed out|timeout/i,
            /rate.?limit/i,
            /temporary/i,
            /unavailable/i,
            /ECONNRESET/,
            /ETIMEDOUT/,
            /ENOTFOUND/,
            /502/,
            /503/,
            /504/
        ];

        return retryablePatterns.some(pattern => pattern.test(errorMessage));
    }

    /**
     * Get error statistics for monitoring
     */
    getErrorStats(): Record<string, { count: number; lastError: string; lastTimestamp: number }> {
        const stats: Record<string, { count: number; lastError: string; lastTimestamp: number }> = {};
        
        for (const [key, count] of this.errorCounts.entries()) {
            const errorInfo = this.lastErrors.get(key);
            stats[key] = {
                count,
                lastError: errorInfo?.error.message || 'Unknown',
                lastTimestamp: errorInfo?.timestamps[errorInfo.timestamps.length - 1] || 0 // Get the latest timestamp
            };
        }

        return stats;
    }

    /**
     * Reset error counts (useful for testing or manual reset)
     */
    resetErrorCounts(): void {
        this.errorCounts.clear();
        this.lastErrors.clear();
    }

    private extractErrorMessage(error: Error | unknown): string {
        if (error instanceof Error) {
            return error.message;
        }
        if (typeof error === 'string') {
            return error;
        }
        if (error && typeof error === 'object' && 'message' in error) {
            return String((error as any).message);
        }
        return 'Unknown error';
    }

    private enhanceError(error: Error | unknown, context: ErrorContext): Error {
        if (error instanceof Error) {
            // Add context to the error
            (error as any).context = context;
            return error;
        }
        
        // Create a new Error if it's not already one
        const newError = new Error(this.extractErrorMessage(error));
        (newError as any).context = context;
        (newError as any).originalError = error;
        return newError;
    }

    private trackError(errorKey: string, error: Error): void {
        // Increment error count
        const currentCount = this.errorCounts.get(errorKey) || 0;
        this.errorCounts.set(errorKey, currentCount + 1);

        // Store error timestamp
        const currentTimestamp = Date.now();
        const existingEntry = this.lastErrors.get(errorKey);
        if (existingEntry) {
            existingEntry.timestamps.push(currentTimestamp);
            existingEntry.error = error; // Update with the latest error object
        } else {
            this.lastErrors.set(errorKey, {
                error,
                timestamps: [currentTimestamp]
            });
        }

        // Clean up old errors
        this.cleanupOldErrors();
    }

    private shouldShowNotice(errorKey: string): boolean {
        const count = this.errorCounts.get(errorKey) || 0;
        
        // Don't spam the user with notices for the same error
        if (count > this.MAX_ERROR_COUNT) {
            return false;
        }

        // Show notice for first few occurrences
        return count <= this.MAX_ERROR_COUNT;
    }

    private formatUserMessage(errorMessage: string, context: ErrorContext, fallbackMessage: string): string {
        // Sanitize error message for user display
        let sanitizedMessage = this.sanitizeErrorMessage(errorMessage);
        sanitizedMessage = sanitizedMessage.replace(/\s+/g, ' ').trim(); // Replace multiple spaces with single and trim
        
        if (sanitizedMessage.length > 100) {
            return `${context.component}: ${fallbackMessage}`;
        }

        return `${context.component}: ${sanitizedMessage}`;
    }

    private sanitizeErrorMessage(message: string): string {
        // Remove sensitive information and technical details
        return message
            .replace(/(api[_-]?key[s]?|key)\s*[:=]\s*([^\\s,;]+)/gi, 'API_KEY_HIDDEN')
            .replace(/(token[s]?|auth|bearer)\s*[:=]\s*([^\\s,;]+)/gi, 'TOKEN_HIDDEN')
            .replace(/(password[s]?|pass)\s*[:=]\s*([^\\s,;]+)/gi, 'PASSWORD_HIDDEN')
            .replace(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, 'IP_HIDDEN')
            .replace(/https?:\/\/[^\\s,;]+/g, 'URL_HIDDEN');
    }

    private cleanupOldErrors(): void {
        const now = Date.now();
        
        for (const [key, errorInfo] of this.lastErrors.entries()) {
            // Filter out old timestamps
            errorInfo.timestamps = errorInfo.timestamps.filter(
                timestamp => now - timestamp <= this.ERROR_RESET_TIME
            );

            // If no timestamps remain, remove the entry
            if (errorInfo.timestamps.length === 0) {
                this.errorCounts.delete(key);
                this.lastErrors.delete(key);
            } else {
                // Update error count based on remaining timestamps
                this.errorCounts.set(key, errorInfo.timestamps.length);
            }
        }
    }
}

// Convenience functions for common error handling patterns
export const errorHandler = ErrorHandler.getInstance();

export function handleChatError(error: Error | unknown, operation: string, metadata?: Record<string, any>): void {
    errorHandler.handleError(error, {
        component: 'ChatView',
        operation,
        metadata
    });
}

export function handleAIDispatcherError(error: Error | unknown, operation: string, metadata?: Record<string, any>): void {
    errorHandler.handleError(error, {
        component: 'AIDispatcher',
        operation,
        metadata
    });
}

export function handleSettingsError(error: Error | unknown, operation: string, metadata?: Record<string, any>): void {
    errorHandler.handleError(error, {
        component: 'Settings',
        operation,
        metadata
    });
}

export async function withErrorHandling<T>(
    operation: () => Promise<T>,
    component: string,
    operationName: string,
    options?: ErrorHandlingOptions
): Promise<T | null> {
    return errorHandler.handleAsync(operation, {
        component,
        operation: operationName
    }, options);
}