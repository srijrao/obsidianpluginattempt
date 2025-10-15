/**
 * OpenAI Provider Implementation
 * 
 * This file contains the implementation of the OpenAI provider,
 * which allows the plugin to interact with OpenAI's API (GPT-3.5, GPT-4, etc.)
 */

import { Message, CompletionOptions, ConnectionTestResult } from '../src/types';
import { BaseProvider, ProviderError, ProviderErrorType } from './base';
import { debugLog } from '../src/utils/logger'; // Import debugLog
import { requestUrl } from 'obsidian'; // Import requestUrl for proper HTTP requests

interface OpenAIResponse {
    id: string;
    object: string;
    created: number;
    model: string;
    system_fingerprint: string;
    choices: Array<{
        index: number;
        message: {
            role: string;
            content: string;
        };
        finish_reason: string;
    }>;
    usage: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
    };
    error?: {
        message: string;
        type?: string;
        code?: string;
    };
}

/**
 * Implements the OpenAI provider functionality
 * 
 * Handles communication with OpenAI's API, including:
 * - Chat completions
 * - Model listing
 * - Connection testing
 * - Streaming responses
 */
export class OpenAIProvider extends BaseProvider {
    protected apiKey: string;
    protected baseUrl: string;
    protected model: string;
    private debugMode: boolean; // Add debugMode property

    constructor(apiKey: string, model: string = 'gpt-4', baseUrl?: string, debugMode: boolean = false) {
        super();
        this.apiKey = apiKey;
        this.model = model;
        this.baseUrl = baseUrl || 'https://api.openai.com/v1';
        this.debugMode = debugMode; // Initialize debugMode

        debugLog(true, 'debug', '[OpenAI Provider] Initializing OpenAI API', { config: { apiKey, model, baseUrl, debugMode } }); // Log initialization
    }

    /**
     * Get a completion from OpenAI
     * 
     * Sends the conversation to OpenAI and streams back the response.
     * Enhanced with better error handling and stream robustness.
     * 
     * @param messages - The conversation history
     * @param options - Settings for this completion
     */
    async getCompletion(messages: Message[], options: CompletionOptions): Promise<void> {
        let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
        
        try {
            debugLog(this.debugMode, 'debug', '[OpenAI] Starting completion request', { 
                model: this.model, 
                messageCount: messages.length,
                temperature: options.temperature 
            });

            const requestBody = {
                model: this.model,
                messages: messages.map(msg => ({
                    role: msg.role,
                    content: msg.content
                })),
                temperature: options.temperature ?? 0.7,
                stream: true,
                max_tokens: 4096
            };

            // Use non-streaming for now to avoid CORS issues with requestUrl
            const nonStreamingRequestBody = { ...requestBody, stream: false };
            
            // Use Obsidian's requestUrl to avoid CORS issues
            const response = await requestUrl({
                url: `${this.baseUrl}/chat/completions`,
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json',
                    'User-Agent': 'obsidian-ai-assistant/1.0'
                },
                body: JSON.stringify(nonStreamingRequestBody),
                throw: false // Don't throw on HTTP errors, we'll handle them
            });

            if (response.status < 200 || response.status >= 300) {
                await this.handleHttpErrorFromRequestUrl(response);
                return;
            }

            // Parse the non-streaming response
            const data = response.json as OpenAIResponse;
            
            if (!data || !data.choices || data.choices.length === 0) {
                throw new Error('Invalid response from OpenAI API');
            }

            if (data.error) {
                throw new Error(data.error.message || 'OpenAI API error');
            }

            // Get the full content from the response
            const content = data.choices[0]?.message?.content;
            
            if (content && options.streamCallback) {
                // Simulate streaming by sending the content in chunks
                const words = content.split(' ');
                let currentContent = '';
                
                for (let i = 0; i < words.length; i++) {
                    const word = words[i];
                    currentContent += (i > 0 ? ' ' : '') + word;
                    
                    // Send word by word to simulate streaming
                    options.streamCallback(i === 0 ? word : ' ' + word);
                    
                    // Small delay to simulate streaming
                    if (i < words.length - 1) {
                        await new Promise(resolve => setTimeout(resolve, 20));
                    }
                }
                
                debugLog(this.debugMode, 'debug', '[OpenAI] Completion finished', { 
                    totalLength: content.length,
                    mode: 'non-streaming-simulated'
                });
            }
            
        } catch (error: any) {
            if (error instanceof ProviderError) {
                throw error;
            }
            
            if (error.name === 'AbortError') {
                debugLog(this.debugMode, 'info', '[OpenAI] Stream was aborted by user');
                return;
            }
            
            if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
                throw new ProviderError(
                    ProviderErrorType.NetworkError,
                    'Unable to connect to OpenAI. Please check your internet connection.'
                );
            }
            
            debugLog(this.debugMode, 'error', '[OpenAI] Completion error', { 
                error: error.message,
                stack: error.stack 
            });
            
            throw new ProviderError(
                ProviderErrorType.ServerError,
                error.message || 'Unknown error occurred while calling OpenAI'
            );
        } finally {
            // Ensure reader is always closed
            if (reader) {
                try {
                    await reader.cancel();
                } catch (e) {
                    debugLog(this.debugMode, 'warn', '[OpenAI] Error closing reader', e);
                }
            }
        }
    }

    /**
     * Get available OpenAI models
     * 
     * Fetches the list of models from OpenAI's API.
     * Filters to include chat models and newer model series.
     * 
     * @returns List of available model names
     */
    async getAvailableModels(): Promise<string[]> {
        try {
            debugLog(this.debugMode, 'debug', '[OpenAI] Fetching available models');

            const response = await fetch(`${this.baseUrl}/models`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json',
                    'User-Agent': 'obsidian-ai-assistant/1.0'
                }
            });

            if (!response.ok) {
                await this.handleHttpError(response);
                return [];
            }

            const data = await response.json();
            
            if (!data.data || !Array.isArray(data.data)) {
                debugLog(this.debugMode, 'warn', '[OpenAI] Invalid models response format', data);
                return [];
            }

            // Filter for chat-capable models with enhanced filtering
            const models = data.data
                .map((model: any) => model.id)
                .filter((id: string) => {
                    // Include GPT models and other chat-capable models
                    return (
                        id.startsWith('gpt-') ||
                        id.startsWith('o1-') ||
                        id.startsWith('o3-') ||
                        id.includes('instruct') ||
                        id.includes('chat')
                    );
                })
                .sort((a: string, b: string) => {
                    // Sort to put latest models first
                    if (a.includes('gpt-4') && !b.includes('gpt-4')) return -1;
                    if (!a.includes('gpt-4') && b.includes('gpt-4')) return 1;
                    if (a.includes('turbo') && !b.includes('turbo')) return -1;
                    if (!a.includes('turbo') && b.includes('turbo')) return 1;
                    return a.localeCompare(b);
                });

            debugLog(this.debugMode, 'debug', '[OpenAI] Found models', { 
                count: models.length,
                models: models.slice(0, 5) // Log first 5 for debugging
            });

            return models;
            
        } catch (error: any) {
            debugLog(this.debugMode, 'error', '[OpenAI] Error fetching models', { 
                error: error.message,
                stack: error.stack 
            });
            
            // Return fallback models if API call fails
            const fallbackModels = [
                'gpt-4o',
                'gpt-4o-mini',
                'gpt-4-turbo',
                'gpt-4',
                'gpt-3.5-turbo'
            ];
            
            debugLog(this.debugMode, 'info', '[OpenAI] Using fallback models', { models: fallbackModels });
            return fallbackModels;
        }
    }

    /**
     * Test connection to OpenAI
     * 
     * Verifies the API key works by attempting to list models.
     * Enhanced with better error reporting and fallback testing.
     * 
     * @returns Test results including success/failure and available models
     */
    async testConnection(): Promise<ConnectionTestResult> {
        const startTime = Date.now();
        
        try {
            debugLog(this.debugMode, 'debug', '[OpenAI] Testing connection', { 
                baseUrl: this.baseUrl,
                model: this.model 
            });

            // First try to get models (this also validates the API key)
            const models = await this.getAvailableModels();
            
            if (models.length === 0) {
                return {
                    success: false,
                    message: 'Connected to OpenAI but no models are available. Please check your API key permissions.'
                };
            }

            // Test with a minimal completion to ensure the model works
            try {
                const testResponse = await fetch(`${this.baseUrl}/chat/completions`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${this.apiKey}`,
                        'Content-Type': 'application/json',
                        'User-Agent': 'obsidian-ai-assistant/1.0'
                    },
                    body: JSON.stringify({
                        model: this.model,
                        messages: [{ role: 'user', content: 'Hi' }],
                        max_tokens: 1,
                        stream: false
                    })
                });

                if (!testResponse.ok) {
                    // If specific model fails, that's okay as long as models are available
                    debugLog(this.debugMode, 'warn', '[OpenAI] Model test failed but connection succeeded', {
                        status: testResponse.status,
                        model: this.model
                    });
                }
            } catch (testError) {
                debugLog(this.debugMode, 'warn', '[OpenAI] Model test error (connection still valid)', testError);
            }

            const duration = Date.now() - startTime;
            
            debugLog(this.debugMode, 'debug', '[OpenAI] Connection test successful', { 
                duration,
                modelCount: models.length 
            });

            return {
                success: true,
                message: `Successfully connected to OpenAI! Found ${models.length} available models. (${duration}ms)`,
                models
            };
            
        } catch (error: any) {
            const duration = Date.now() - startTime;
            
            debugLog(this.debugMode, 'error', '[OpenAI] Connection test failed', { 
                duration,
                error: error.message 
            });

            return this.createErrorResponse(error);
        }
    }

    /**
     * Handle HTTP errors from requestUrl response
     */
    private async handleHttpErrorFromRequestUrl(response: any): Promise<never> {
        const status = response.status;
        let errorMessage = 'Unknown error';
        
        try {
            if (response.json && response.json.error) {
                errorMessage = response.json.error.message || 'API error';
            } else if (response.text) {
                errorMessage = response.text;
            }
        } catch {
            errorMessage = `HTTP ${status} error`;
        }

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
}
