/**
 * Base AI Provider Implementation
 * 
 * This file contains the base class for AI providers with shared functionality
 * and common error handling patterns.
 */

import { AIProvider, Message, CompletionOptions, ConnectionTestResult } from '../src/types';

/**
 * Common error types across providers
 */
export enum ProviderErrorType {
    InvalidApiKey = 'invalid_api_key',
    RateLimit = 'rate_limit',
    InvalidRequest = 'invalid_request',
    ServerError = 'server_error',
    NetworkError = 'network_error'
}

/**
 * Base error class for provider-specific errors
 */
export class ProviderError extends Error {
    type: ProviderErrorType;
    statusCode?: number;

    constructor(type: ProviderErrorType, message: string, statusCode?: number) {
        super(message);
        this.type = type;
        this.statusCode = statusCode;
        this.name = 'ProviderError';
    }
}

/**
 * Base class for AI providers implementing common functionality
 */
export abstract class BaseProvider implements AIProvider {
    protected abstract apiKey: string;
    protected abstract baseUrl: string;
    protected abstract model: string;

    /**
     * Get a completion from the AI model
     */
    abstract getCompletion(messages: Message[], options: CompletionOptions): Promise<void>;

    /**
     * Get available models
     */
    abstract getAvailableModels(): Promise<string[]>;

    /**
     * Test connection to the provider
     */
    abstract testConnection(): Promise<ConnectionTestResult>;

    /**
     * Handle common HTTP errors
     */
    protected async handleHttpError(error: any): Promise<never> {
        let status: number | undefined;
        let errorBody: any;

        if (error instanceof Response) {
            status = error.status;
            try {
                errorBody = await error.json();
            } catch {
                errorBody = await error.text();
            }
        } else if (error.response) {
            // Handle error objects with response property (like Axios errors)
            status = error.response.status;
            errorBody = error.response.data || error.response.text;
        } else {
            throw new ProviderError(
                ProviderErrorType.NetworkError,
                'Network error occurred'
            );
        }

        const errorMessage = typeof errorBody === 'object' && errorBody !== null && 'message' in errorBody ? errorBody.message : String(errorBody);

        switch (status) {
            case 401:
                throw new ProviderError(
                    ProviderErrorType.InvalidApiKey,
                    `Invalid API key: ${errorMessage}`,
                    status
                );
            case 429:
                throw new ProviderError(
                    ProviderErrorType.RateLimit,
                    `Rate limit exceeded: ${errorMessage}`,
                    status
                );
            case 400:
                throw new ProviderError(
                    ProviderErrorType.InvalidRequest,
                    `Invalid request: ${errorMessage}`,
                    status
                );
            case 500:
            case 502:
            case 503:
            case 504:
                throw new ProviderError(
                    ProviderErrorType.ServerError,
                    `Server error occurred: ${errorMessage}`,
                    status
                );
            default:
                throw new ProviderError(
                    ProviderErrorType.ServerError,
                    `Unknown error occurred (Status: ${status}): ${errorMessage}`,
                    status
                );
        }
    }

    /**
     * Format error message for connection test results
     */
    protected formatErrorMessage(error: any): string {
        if (error instanceof ProviderError) {
            switch (error.type) {
                case ProviderErrorType.InvalidApiKey:
                    return 'Invalid API key. Please check your credentials.';
                case ProviderErrorType.RateLimit:
                    return 'Rate limit exceeded. Please try again later.';
                case ProviderErrorType.NetworkError:
                    return 'Network error. Please check your internet connection.';
                default:
                    return error.message;
            }
        }
        return error.message || 'An unknown error occurred';
    }

    /**
     * Create a standard error response for connection tests
     */
    protected createErrorResponse(error: any): ConnectionTestResult {
        return {
            success: false,
            message: this.formatErrorMessage(error)
        };
    }
}
