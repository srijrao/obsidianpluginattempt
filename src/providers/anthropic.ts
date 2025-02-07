/**
 * Anthropic Provider Implementation
 * 
 * This file contains the implementation of the Anthropic provider,
 * which allows the plugin to interact with Anthropic's API (Claude models)
 */

import { AIProvider, Message, CompletionOptions, ConnectionTestResult } from '../types';

/**
 * Implements the Anthropic provider functionality
 * 
 * Handles communication with Anthropic's API, including:
 * - Chat completions
 * - Model listing
 * - Connection testing
 * - Streaming responses
 */
export class AnthropicProvider implements AIProvider {
    private apiKey: string;
    private baseUrl = 'https://api.anthropic.com/v1';
    private model: string;

    constructor(apiKey: string, model: string = 'claude-2') {
        this.apiKey = apiKey;
        this.model = model;
    }

    /**
     * Get a completion from Anthropic
     * 
     * Sends the conversation to Anthropic and streams back the response.
     * 
     * @param messages - The conversation history
     * @param options - Settings for this completion
     */
    async getCompletion(messages: Message[], options: CompletionOptions): Promise<void> {
        try {
            // Convert messages to Anthropic format
            const prompt = messages.map(msg => {
                if (msg.role === 'system') {
                    return `System: ${msg.content}\n\n`;
                }
                return `${msg.role === 'user' ? 'Human' : 'Assistant'}: ${msg.content}\n\n`;
            }).join('') + 'Assistant:';

            const response = await fetch(`${this.baseUrl}/complete`, {
                method: 'POST',
                headers: {
                    'x-api-key': this.apiKey,
                    'anthropic-version': '2023-06-01',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: this.model,
                    prompt,
                    temperature: options.temperature ?? 0.7,
                    max_tokens_to_sample: options.maxTokens ?? 1000,
                    stream: true
                }),
                signal: options.abortController?.signal
            });

            if (!response.ok) {
                throw new Error(`Anthropic API error: ${response.status} ${response.statusText}`);
            }

            const reader = response.body?.getReader();
            const decoder = new TextDecoder('utf-8');

            while (true) {
                const { done, value } = await reader?.read() || { done: true, value: undefined };
                if (done) break;

                const chunk = decoder.decode(value);
                const lines = chunk.split('\n');
                
                for (const line of lines) {
                    if (line.startsWith('data: ') && line !== 'data: [DONE]') {
                        const data = JSON.parse(line.slice(6));
                        const content = data.completion;
                        if (content && options.streamCallback) {
                            options.streamCallback(content);
                        }
                    }
                }
            }
        } catch (error) {
            if (error.name === 'AbortError') {
                console.log('Anthropic stream was aborted');
            } else {
                console.error('Error calling Anthropic:', error);
                throw error;
            }
        }
    }

    /**
     * Get available Anthropic models
     * 
     * Returns the list of supported Claude models.
     * Note: Anthropic doesn't have a models endpoint, so we return known models.
     * 
     * @returns List of available model names
     */
    async getAvailableModels(): Promise<string[]> {
        return [
            'claude-2',
            'claude-instant-1',
            'claude-1',
            'claude-1-100k'
        ];
    }

    /**
     * Test connection to Anthropic
     * 
     * Verifies the API key works by attempting a simple completion.
     * 
     * @returns Test results including success/failure
     */
    async testConnection(): Promise<ConnectionTestResult> {
        try {
            const response = await fetch(`${this.baseUrl}/complete`, {
                method: 'POST',
                headers: {
                    'x-api-key': this.apiKey,
                    'anthropic-version': '2023-06-01',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: this.model,
                    prompt: 'Human: Hi\n\nAssistant:',
                    max_tokens_to_sample: 1
                })
            });

            if (!response.ok) {
                throw new Error(`Status ${response.status}`);
            }

            const models = await this.getAvailableModels();
            return {
                success: true,
                message: 'Successfully connected to Anthropic!',
                models
            };
        } catch (error) {
            let message = 'Connection failed: ';
            if (error.response?.status === 401) {
                message += 'Invalid API key. Please check your Anthropic API key.';
            } else if (error.response?.status === 429) {
                message += 'Rate limit exceeded. Please try again later.';
            } else {
                message += error.message;
            }
            return {
                success: false,
                message
            };
        }
    }
}
