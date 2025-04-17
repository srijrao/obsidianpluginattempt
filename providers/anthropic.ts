/**
 * Anthropic Provider Implementation
 * 
 * This file contains the implementation of the Anthropic provider,
 * which allows the plugin to interact with Anthropic's API (Claude models)
 * using the official Anthropic TypeScript SDK.
 */

import { Message, CompletionOptions, ConnectionTestResult } from '../types';
import { BaseProvider, ProviderError, ProviderErrorType } from './base';
import { debug } from '../settings';

interface AnthropicMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
}

interface AnthropicResponse {
    id: string;
    model: string;
    type: string;
    role: string;
    content: Array<{
        type: string;
        text: string;
    }>;
    stop_reason: string | null;
    usage: {
        input_tokens: number;
        output_tokens: number;
    };
}

/**
 * Implements the Anthropic provider functionality
 * 
 * Handles communication with Anthropic's API, including:
 * - Chat completions
 * - Model listing
 * - Connection testing
 * - Streaming responses
 */
export class AnthropicProvider extends BaseProvider {
    protected apiKey: string;
    protected baseUrl: string = 'https://api.anthropic.com/v1';
    protected model: string;

    constructor(apiKey: string, model: string = 'claude-3-sonnet-20240229') {
        super();
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
        this.validateCompletionOptions(options);

        // Create stream manager if we're streaming
        const streamManager = this.createStreamManager(options);
        
        try {
            this.logRequestStart('POST', '/messages');
            const startTime = Date.now();

            const url = `${this.baseUrl}/messages`;
            const headers = {
                'Content-Type': 'application/json',
                'x-api-key': this.apiKey,
                'anthropic-version': '2023-06-01'
            };

            // Format the messages according to Anthropic's API requirements
            const formattedMessages = this.formatMessages(messages);
            
            const body = {
                model: this.model,
                messages: formattedMessages,
                max_tokens: options.maxTokens ?? 2000,
                temperature: options.temperature ?? 0.7,
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
                                if (json.type === 'content_block_delta' && json.delta?.text) {
                                    streamManager?.write(json.delta.text);
                                }
                            } catch (e) {
                                debug('Error parsing Anthropic response chunk:', e);
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

                const data = await response.json() as AnthropicResponse;
                let content = '';
                
                // Extract content from Anthropic's response format
                if (data.content && data.content.length > 0) {
                    content = data.content.map(block => block.type === 'text' ? block.text : '').join('');
                }
                
                if (streamManager) {
                    streamManager.write(content);
                    streamManager.complete();
                }
            }

            this.logRequestEnd('POST', '/messages', Date.now() - startTime);
        } catch (error) {
            if (error instanceof ProviderError) {
                throw error;
            }
            
            if (error.name === 'AbortError') {
                debug('Anthropic stream was aborted');
                streamManager?.destroy();
            } else {
                this.logError(error);
                throw new ProviderError(
                    ProviderErrorType.SERVER_ERROR,
                    `Error calling Anthropic: ${error.message}`
                );
            }
        }
    }

    /**
     * Format messages for Anthropic's API
     * 
     * @param messages Array of message objects
     * @returns Formatted messages for Anthropic API
     */
    private formatMessages(messages: Message[]): AnthropicMessage[] {
        const result: AnthropicMessage[] = [];
        
        // Get system messages
        const systemMessages = messages.filter(msg => msg.role === 'system');
        if (systemMessages.length > 0) {
            result.push({
                role: 'system',
                content: systemMessages.map(msg => msg.content).join('\n\n')
            });
        }
        
        // Add user/assistant exchanges
        const nonSystemMessages = messages.filter(msg => msg.role !== 'system');
        result.push(...nonSystemMessages.map(msg => ({
            role: msg.role as 'user' | 'assistant',
            content: msg.content
        })));
        
        return result;
    }

    /**
     * Get available Anthropic models
     * 
     * Returns the list of Claude models.
     * 
     * @returns List of available model names
     */
    async getAvailableModels(): Promise<string[]> {
        // Anthropic doesn't have a models endpoint, so we return the known models
        return [
            'claude-3-opus-20240229',
            'claude-3-sonnet-20240229',
            'claude-3-haiku-20240307'
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
            const url = `${this.baseUrl}/messages`;
            const headers = {
                'Content-Type': 'application/json',
                'x-api-key': this.apiKey,
                'anthropic-version': '2023-06-01'
            };

            const body = {
                model: this.model,
                messages: [{ role: 'user', content: 'Hello!' }],
                max_tokens: 1
            };

            const response = await this.makeRequest(url, {
                method: 'POST',
                headers,
                body: JSON.stringify(body)
            });

            const models = await this.getAvailableModels();

            return {
                success: true,
                message: 'Successfully connected to Anthropic Claude!',
                models
            };
        } catch (error) {
            return this.createErrorResponse(error);
        }
    }
}
