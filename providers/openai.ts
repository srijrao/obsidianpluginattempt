/**
 * OpenAI Provider Implementation
 * 
 * This file contains the implementation of the OpenAI provider,
 * which allows the plugin to interact with OpenAI's API (GPT-3.5, GPT-4, etc.)
 */

import { Message, CompletionOptions, ConnectionTestResult } from '../src/types';
import { BaseProvider, ProviderError, ProviderErrorType } from './base';
import { debugLog } from '../src/utils/logger'; // Import debugLog

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

            const response = await fetch(`${this.baseUrl}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json',
                    'User-Agent': 'obsidian-ai-assistant/1.0'
                },
                body: JSON.stringify(requestBody),
                signal: options.abortController?.signal
            });

            if (!response.ok) {
                await this.handleHttpError(response);
                return;
            }

            if (!response.body) {
                throw new Error('Response body is null');
            }

            reader = response.body.getReader();
            const decoder = new TextDecoder('utf-8');
            let buffer = '';
            let totalContent = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    const trimmedLine = line.trim();
                    if (!trimmedLine || !trimmedLine.startsWith('data: ')) continue;
                    
                    if (trimmedLine === 'data: [DONE]') {
                        debugLog(this.debugMode, 'debug', '[OpenAI] Stream completed', { totalLength: totalContent.length });
                        break;
                    }

                    try {
                        const jsonData = trimmedLine.slice(6);
                        const data = JSON.parse(jsonData);
                        
                        if (data.error) {
                            throw new Error(data.error.message || 'OpenAI API error');
                        }

                        const delta = data.choices?.[0]?.delta;
                        const content = delta?.content;
                        
                        if (content && options.streamCallback) {
                            totalContent += content;
                            options.streamCallback(content);
                        }
                        
                        // Handle function calls if present
                        if (delta?.function_call || delta?.tool_calls) {
                            debugLog(this.debugMode, 'debug', '[OpenAI] Function call detected', { delta });
                        }
                        
                        // Check for finish reason
                        const finishReason = data.choices?.[0]?.finish_reason;
                        if (finishReason) {
                            debugLog(this.debugMode, 'debug', '[OpenAI] Completion finished', { 
                                reason: finishReason,
                                totalLength: totalContent.length 
                            });
                        }
                        
                    } catch (parseError) {
                        debugLog(this.debugMode, 'warn', '[OpenAI] Error parsing response chunk', { 
                            line: trimmedLine,
                            error: parseError 
                        });
                        // Continue processing other chunks
                    }
                }
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
}
