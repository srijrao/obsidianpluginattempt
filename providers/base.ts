/**
 * Base AI Provider Implementation
 * 
 * This file contains the base class for AI providers with shared functionality
 * and common error handling patterns.
 */

<<<<<<< HEAD
import { AIProvider, Message, CompletionOptions, ConnectionTestResult } from '../src/types';
=======
import { Message, CompletionOptions, ConnectionTestResult } from '../types';
import { APIHandler, APIError, StreamManager } from '../utils';
import { debug } from '../settings';
>>>>>>> main

/**
 * Common error types across providers
 */
export enum ProviderErrorType {
    INVALID_API_KEY = 'invalid_api_key',
    RATE_LIMIT = 'rate_limit',
    SERVER_ERROR = 'server_error',
    INVALID_REQUEST = 'invalid_request',
    CONTEXT_LENGTH = 'context_length',
    CONTENT_FILTER = 'content_filter',
    NETWORK_ERROR = 'network_error'
}

/**
 * Base error class for provider-specific errors
 */
export class ProviderError extends Error {
    constructor(
        public type: ProviderErrorType,
        message: string,
        public statusCode?: number
    ) {
        super(message);
        this.name = 'ProviderError';
    }
}

/**
 * Base class for AI providers implementing common functionality
 */
export abstract class BaseProvider {
    protected abstract apiKey: string;
    protected abstract baseUrl: string;
    protected abstract model: string;

    protected async makeRequest(url: string, options: RequestInit): Promise<Response> {
        return APIHandler.fetchWithRetry(url, options, {
            maxRetries: 3,
            baseDelay: 1000,
            maxDelay: 10000
        });
    }

    protected handleHttpError(response: Response): ProviderError {
        const status = response.status;
        
        switch (status) {
            case 401:
                return new ProviderError(
                    ProviderErrorType.INVALID_API_KEY,
                    'Invalid API key',
                    status
                );
            case 429:
                return new ProviderError(
                    ProviderErrorType.RATE_LIMIT,
                    'Rate limit exceeded',
                    status
                );
            case 400:
                return new ProviderError(
                    ProviderErrorType.INVALID_REQUEST,
                    'Invalid request parameters',
                    status
                );
            case 413:
                return new ProviderError(
                    ProviderErrorType.CONTEXT_LENGTH,
                    'Input too long',
                    status
                );
            default:
                if (status >= 500) {
                    return new ProviderError(
                        ProviderErrorType.SERVER_ERROR,
                        `Server error (${status})`,
                        status
                    );
                }
                return new ProviderError(
                    ProviderErrorType.SERVER_ERROR,
                    `HTTP error ${status}`,
                    status
                );
        }
    }

    protected validateCompletionOptions(options: CompletionOptions): void {
        if (options.temperature !== undefined && (options.temperature < 0 || options.temperature > 1)) {
            throw new ProviderError(
                ProviderErrorType.INVALID_REQUEST,
                'Temperature must be between 0 and 1'
            );
        }

        if (options.maxTokens !== undefined && options.maxTokens <= 0) {
            throw new ProviderError(
                ProviderErrorType.INVALID_REQUEST,
                'Max tokens must be greater than 0'
            );
        }
    }

    /**
     * Create a standard error response for connection tests
     */
    protected createErrorResponse(error: any): ConnectionTestResult {
        let message = 'Connection failed: ';

        if (error instanceof ProviderError) {
            switch (error.type) {
                case ProviderErrorType.INVALID_API_KEY:
                    message += 'Invalid API key. Please check your credentials.';
                    break;
                case ProviderErrorType.RATE_LIMIT:
                    message += 'Rate limit exceeded. Please try again later.';
                    break;
                case ProviderErrorType.NETWORK_ERROR:
                    message += 'Network error. Please check your internet connection.';
                    break;
                default:
                    message += error.message;
                    break;
            }
        } else if (error instanceof APIError) {
            message += error.message;
        } else if (error instanceof Error) {
            message += error.message;
        } else {
            message += 'Unknown error occurred';
        }

        return {
            success: false,
            message
        };
    }

    abstract getCompletion(messages: Message[], options: CompletionOptions): Promise<void>;
    abstract getAvailableModels(): Promise<string[]>;
    abstract testConnection(): Promise<ConnectionTestResult>;

    protected createStreamManager(options: CompletionOptions): StreamManager | undefined {
        if (!options.streamCallback) return undefined;
        
        return new StreamManager(
            options.streamCallback,
            undefined,
            (error) => {
                debug('Stream error:', error);
            }
        );
    }

    protected logRequestStart(method: string, endpoint: string): void {
        debug(`${method} ${endpoint} - Request started`);
    }

    protected logRequestEnd(method: string, endpoint: string, duration: number): void {
        debug(`${method} ${endpoint} - Request completed in ${duration}ms`);
    }

    protected logError(error: Error): void {
        if (error instanceof ProviderError) {
            debug(`Provider error: ${error.type} - ${error.message}`);
        } else {
            debug('Unexpected error:', error);
        }
    }
}
