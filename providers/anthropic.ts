/**
 * Anthropic Provider Implementation
 * 
 * This file contains the implementation of the Anthropic provider,
 * which allows the plugin to interact with Anthropic's API (Claude models)
 * using the official Anthropic TypeScript SDK.
 */

import { Message, CompletionOptions, ConnectionTestResult } from '../types';
import { BaseProvider, ProviderError } from './base';
import Anthropic from '@anthropic-ai/sdk';

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
    protected baseUrl = 'https://api.anthropic.com/v1';
    protected model: string;
    private client: Anthropic;

    constructor(apiKey: string, model: string = 'claude-3-sonnet-20240229') {
        super();
        this.apiKey = apiKey;
        this.model = model;
        this.client = new Anthropic({
            apiKey: this.apiKey,
            dangerouslyAllowBrowser: true // Required for browser environments
        });
    }

    /**
     * Get a completion from Anthropic
     * 
     * Sends the conversation to Anthropic and streams back the response
     * using the official SDK's streaming support.
     * 
     * @param messages - The conversation history
     * @param options - Settings for this completion
     */
    async getCompletion(messages: Message[], options: CompletionOptions): Promise<void> {
        try {
            const stream = await this.client.messages.create({
                model: this.model,
                messages: messages.map(msg => ({
                    role: msg.role === 'system' ? 'user' : msg.role,
                    content: msg.content
                })),
                temperature: options.temperature ?? 0.7,
                max_tokens: options.maxTokens ?? 1000,
                stream: true
            });

            for await (const chunk of stream) {
                if (chunk.type === 'content_block_delta' && chunk.delta?.type === 'text_delta' && options.streamCallback) {
                    options.streamCallback(chunk.delta.text);
                }
            }
        } catch (error) {
            if (error instanceof ProviderError) {
                throw error;
            }
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
            // Test the connection by sending a minimal message
            await this.client.messages.create({
                model: this.model,
                messages: [{ role: 'user', content: 'Hi' }],
                max_tokens: 1
            });

            const models = await this.getAvailableModels();
            return {
                success: true,
                message: 'Successfully connected to Anthropic!',
                models
            };
        } catch (error) {
            return this.createErrorResponse(error);
        }
    }
}
