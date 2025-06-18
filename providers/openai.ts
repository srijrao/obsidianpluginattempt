/**
 * OpenAI Provider Implementation
 * 
 * This file contains the implementation of the OpenAI provider,
 * which allows the plugin to interact with OpenAI's API (GPT-3.5, GPT-4, etc.)
 */

import { Message, CompletionOptions, ConnectionTestResult } from '../src/types';
import { BaseProvider, ProviderError, ProviderErrorType } from './base';
import { StreamManager } from '../utils';
import { debug } from '../settings';

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
<<<<<<< HEAD
    protected baseUrl: string;
=======
    protected baseUrl: string = 'https://api.openai.com/v1';
>>>>>>> main
    protected model: string;

    constructor(apiKey: string, model: string = 'gpt-4', baseUrl?: string) {
        super();
        this.apiKey = apiKey;
        this.model = model;
        this.baseUrl = baseUrl || 'https://api.openai.com/v1';
    }

    /**
     * Get a completion from OpenAI
     * 
     * Sends the conversation to OpenAI and streams back the response.
     * 
     * @param messages - The conversation history
     * @param options - Settings for this completion
     */
    async getCompletion(messages: Message[], options: CompletionOptions): Promise<void> {
        this.validateCompletionOptions(options);

        // Create stream manager if we're streaming
        const streamManager = this.createStreamManager(options);
        
        try {
            this.logRequestStart('POST', '/chat/completions');
            const startTime = Date.now();

            const url = `${this.baseUrl}/chat/completions`;
            const headers = {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.apiKey}`
            };

            const body = {
                model: this.model,
                messages: messages,
                temperature: options.temperature ?? 0.7,
                max_tokens: options.maxTokens,
                stream: Boolean(options.streamCallback)
            };

            if (options.streamCallback) {
                // Streaming request
                const response = await this.makeRequest(url, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify(body),
                    signal: options.abortController?.signal
                });

                const reader = response.body?.getReader();
                if (!reader) {
                    throw new ProviderError(
                        ProviderErrorType.SERVER_ERROR, 
                        'Failed to get response stream'
                    );
                }

                const decoder = new TextDecoder('utf-8');
                let buffer = '';
                
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    
                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split('\n');
                    buffer = lines.pop() || '';
                    
                    for (const line of lines) {
                        if (line.startsWith('data: ')) {
                            const data = line.slice(6);
                            if (data === '[DONE]') continue;
                            
                            try {
                                const json = JSON.parse(data);
                                const content = json.choices?.[0]?.delta?.content;
                                if (content) {
                                    streamManager?.write(content);
                                }
                            } catch (e) {
                                debug('Error parsing OpenAI response chunk:', e);
                            }
                        }
                    }
                }
                
                // Complete the stream
                streamManager?.complete();
            } else {
                // Non-streaming request
                const response = await this.makeRequest(url, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify(body),
                    signal: options.abortController?.signal
                });

                const data = await response.json() as OpenAIResponse;
                if (data.choices && data.choices[0] && data.choices[0].message) {
                    const content = data.choices[0].message.content;
                    if (content && streamManager) {
                        streamManager.write(content);
                        streamManager.complete();
                    }
                }
            }

            this.logRequestEnd('POST', '/chat/completions', Date.now() - startTime);
        } catch (error) {
            if (error instanceof ProviderError) {
                throw error;
            }
            
            if (error.name === 'AbortError') {
                debug('OpenAI stream was aborted');
                streamManager?.destroy();
            } else {
                this.logError(error);
                throw new ProviderError(
                    ProviderErrorType.SERVER_ERROR,
                    `Error calling OpenAI: ${error.message}`
                );
            }
        }
    }

    /**
     * Get available OpenAI models
     * 
     * Fetches the list of available models from OpenAI's API.
     * Filters to only include GPT models.
     * 
     * @returns List of available model names
     */
    async getAvailableModels(): Promise<string[]> {
        try {
            this.logRequestStart('GET', '/models');
            const startTime = Date.now();

            const response = await this.makeRequest(`${this.baseUrl}/models`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`
                }
            });

            const data = await response.json();
            this.logRequestEnd('GET', '/models', Date.now() - startTime);

            // Filter to only include GPT models
            return data.data
                .map((model: any) => model.id)
                .filter((id: string) => 
                    id.includes('gpt-4') || 
                    id.includes('gpt-3.5') ||
                    id.includes('gpt-4o'));
        } catch (error) {
            this.logError(error);
            throw error;
        }
    }

    /**
     * Test connection to OpenAI
     * 
     * Verifies the API key works by attempting to list models.
     * 
     * @returns Test results including success/failure and available models
     */
    async testConnection(): Promise<ConnectionTestResult> {
        try {
            const models = await this.getAvailableModels();
            return {
                success: true,
                message: `Successfully connected to OpenAI! Found ${models.length} available models.`,
                models
            };
        } catch (error) {
            return this.createErrorResponse(error);
        }
    }
}
