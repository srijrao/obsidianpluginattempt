/**
 * Anthropic Provider Implementation
 * 
 * This file contains the implementation of the Anthropic provider,
 * which allows the plugin to interact with Anthropic's API (Claude models)
 * using the official Anthropic TypeScript SDK.
 * 
 * Claude models have large context windows and strong reasoning capabilities.
 * This implementation handles token counting and context window management.
 */

<<<<<<< HEAD
import { Message, CompletionOptions, ConnectionTestResult } from '../src/types';
import { BaseProvider, ProviderError, ProviderErrorType } from './base';
import Anthropic from '@anthropic-ai/sdk';
=======
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
>>>>>>> main

/**
 * Anthropic API response types
 * These are simplified versions of the actual response types
 */
interface AnthropicMessage {
    role: 'user' | 'assistant';
    content: string;
}

interface AnthropicStreamEvent {
    type: string;
    delta?: {
        type: string;
        text: string;
    };
}

/**
 * Maximum context window sizes for Anthropic models (in tokens)
 * These values represent the total tokens (input + output) that each model can handle
 */
const MODEL_CONTEXT_WINDOWS: Record<string, number> = {
    'claude-3-opus-20240229': 200000,
    'claude-3-sonnet-20240229': 200000,
    'claude-3-haiku-20240307': 200000,
    'claude-3-7-sonnet-20250219': 200000,
    'claude-3-5-sonnet-20241022': 200000,
    'claude-3-5-sonnet-20240620': 200000,
    'claude-3-5-haiku-20241022': 200000,
};

/**
 * Maximum output tokens per Anthropic model
 */
const MODEL_OUTPUT_TOKEN_LIMITS: Record<string, number> = {
    'claude-3-7-sonnet-20250219': 64000,
    'claude-3-5-sonnet-20241022': 8192,
    'claude-3-5-sonnet-20240620': 8192,
    'claude-3-5-haiku-20241022': 8192,
    'claude-3-opus-20240229': 4096,
    'claude-3-sonnet-20240229': 8192, // fallback for older sonnet
    'claude-3-haiku-20240307': 4096,  // fallback for older haiku
};

/**
 * Approximate token count for messages
 * 
 * This is a simple approximation based on character count.
 * Claude models use ~3.5 chars per token on average, but we use 4 for safety.
 * 
 * @param messages - The messages to count tokens for
 * @returns Approximate token count
 */
function estimateTokenCount(messages: Message[]): number {
    // Simple approximation: 1 token ≈ 4 characters
    const CHARS_PER_TOKEN = 4;
    
    // Calculate total characters in all messages
    const totalChars = messages.reduce((total, msg) => {
        return total + msg.content.length;
    }, 0);
    
    // Convert to tokens
    return Math.ceil(totalChars / CHARS_PER_TOKEN);
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
     * Automatically adjusts max_tokens if the request would exceed the model's context window.
     * 
     * @param messages - The conversation history
     * @param options - Settings for this completion
     */
    async getCompletion(messages: Message[], options: CompletionOptions): Promise<void> {
<<<<<<< HEAD
        try {
            // Get the context window size for the current model
            const contextWindow = MODEL_CONTEXT_WINDOWS[this.model] ?? 200000;
            const outputTokenLimit = MODEL_OUTPUT_TOKEN_LIMITS[this.model];

            // Estimate token count for input messages
            const inputTokens = estimateTokenCount(messages);

            // Calculate safe max_tokens value
            let maxTokens = options.maxTokens ?? 1000;

            // If the combined input + output tokens would exceed the context window,
            // automatically adjust max_tokens to fit
            if (inputTokens + maxTokens > contextWindow) {
                const adjustedMaxTokens = contextWindow - inputTokens;

                if (adjustedMaxTokens <= 0) {
                    throw new ProviderError(
                        ProviderErrorType.InvalidRequest,
                        `Input is too long for ${this.model}'s context window. ` +
                        `Estimated input tokens: ${inputTokens}, context window: ${contextWindow}`
                    );
=======
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
>>>>>>> main
                }

                console.log(
                    `Adjusting max_tokens from ${maxTokens} to ${adjustedMaxTokens} ` +
                    `to fit within ${this.model}'s context window`
                );

                maxTokens = adjustedMaxTokens;
            }

            // Enforce model output token limit
            if (outputTokenLimit && maxTokens > outputTokenLimit) {
                console.log(
                    `Capping max_tokens from ${maxTokens} to model output limit ${outputTokenLimit} for ${this.model}`
                );
                maxTokens = outputTokenLimit;
            }
            
            // Format messages for Anthropic API
            const { systemPrompt, anthropicMessages } = this.formatMessages(messages);
            
            // Create the request parameters
            const requestParams: any = {
                model: this.model,
                messages: anthropicMessages,
                temperature: options.temperature ?? 0.7,
                max_tokens: maxTokens,
                stream: true
            };
            
            // Add system prompt if present
            if (systemPrompt) {
                requestParams.system = systemPrompt;
            }
            
            // Create the stream with proper message format
            // Use type assertion to bypass TypeScript errors
            const stream = await this.client.messages.create(requestParams) as any;
            
            // Process the stream using a try-catch to handle any streaming errors
            try {
                // Handle the stream based on the Anthropic SDK's streaming implementation
                // This is a simplified approach that should work with most versions of the SDK
                if (stream && typeof stream === 'object') {
                    if (stream.on && typeof stream.on === 'function') {
                        // Event-based API
                        await new Promise<void>((resolve, reject) => {
                            stream.on('content_block_delta', (chunk: any) => {
                                if (chunk.delta?.type === 'text_delta' && options.streamCallback) {
                                    options.streamCallback(chunk.delta.text);
                                }
                            });
                            stream.on('end', resolve);
                            stream.on('error', reject);
                        });
                    } else if (Symbol.asyncIterator in stream) {
                        // Async iterator API
                        for await (const chunk of stream) {
                            if (chunk.type === 'content_block_delta' && 
                                chunk.delta?.type === 'text_delta' && 
                                options.streamCallback) {
                                options.streamCallback(chunk.delta.text);
                            }
                        }
                    } else if (options.streamCallback) {
                        // Non-streaming response (fallback)
                        console.warn('Anthropic response is not a stream, handling as regular response');
                        if ('content' in stream && typeof stream.content === 'string') {
                            options.streamCallback(stream.content);
                        }
                    }
                }
            } catch (streamError) {
                console.error('Error processing Anthropic stream:', streamError);
                throw streamError;
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
<<<<<<< HEAD
     * Returns the list of supported Claude models.
     * Note: Anthropic doesn't have a models endpoint, so we return known models.
     * This list is based on the models defined in MODEL_CONTEXT_WINDOWS.
=======
     * Returns the list of Claude models.
>>>>>>> main
     * 
     * @returns List of available model names
     */
    async getAvailableModels(): Promise<string[]> {
<<<<<<< HEAD
        try {
            // Return the keys from our MODEL_CONTEXT_WINDOWS object
            // This ensures the model list is synchronized with our context window definitions
            return Object.keys(MODEL_CONTEXT_WINDOWS);
        } catch (error) {
            console.error('Error getting Anthropic models:', error);
            throw error;
        }
    }
    
    /**
     * Format messages for Anthropic API
     * 
     * Converts from the plugin's Message format to Anthropic's expected format.
     * Handles system messages specially as Anthropic has a different format.
     * 
     * @param messages - Array of messages to format
     * @returns Formatted messages and system prompt for Anthropic API
     */
    private formatMessages(messages: Message[]): { 
        systemPrompt: string | undefined, 
        anthropicMessages: AnthropicMessage[] 
    } {
        // Handle system messages specially as Anthropic has a different format
        const systemMessages = messages.filter(msg => msg.role === 'system');
        const nonSystemMessages = messages.filter(msg => msg.role !== 'system');
        
        // Extract system message if present
        const systemPrompt = systemMessages.length > 0 
            ? systemMessages.map(msg => msg.content).join('\n\n')
            : undefined;
        
        // Convert messages to Anthropic format
        // First, prepare a clean array of messages with proper roles
        const anthropicMessages = nonSystemMessages.map(msg => {
            // Ensure role is either 'user' or 'assistant'
            const role = (msg.role === 'user' || msg.role === 'assistant') 
                ? msg.role as 'user' | 'assistant'  // Type assertion to help TypeScript
                : 'user' as const;
            
            return { role, content: msg.content };
        });
        
        return { systemPrompt, anthropicMessages };
=======
        // Anthropic doesn't have a models endpoint, so we return the known models
        return [
            'claude-3-opus-20240229',
            'claude-3-sonnet-20240229',
            'claude-3-haiku-20240307'
        ];
>>>>>>> main
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
<<<<<<< HEAD
                messages: [{ role: 'user' as const, content: 'Hi' }],
=======
                messages: [{ role: 'user', content: 'Hello!' }],
>>>>>>> main
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
