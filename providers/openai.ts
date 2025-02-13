/**
 * OpenAI Provider Implementation
 * 
 * This file contains the implementation of the OpenAI provider,
 * which allows the plugin to interact with OpenAI's API (GPT-3.5, GPT-4, etc.)
 */

import { Message, CompletionOptions, ConnectionTestResult } from '../types';
import { BaseProvider, ProviderError, ProviderErrorType } from './base';

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
    protected baseUrl = 'https://api.openai.com/v1';
    protected model: string;

    constructor(apiKey: string, model: string = 'gpt-4') {
        super();
        this.apiKey = apiKey;
        this.model = model;
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
        try {
            const response = await fetch(`${this.baseUrl}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: this.model,
                    messages,
                    temperature: options.temperature ?? 0.7,
                    max_tokens: options.maxTokens ?? 1000,
                    stream: true
                }),
                signal: options.abortController?.signal
            });

            if (!response.ok) {
                throw this.handleHttpError(response);
            }

            const reader = response.body?.getReader();
            const decoder = new TextDecoder('utf-8');
            let buffer = '';

            while (true) {
                const { done, value } = await reader?.read() || { done: true, value: undefined };
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    if (line.startsWith('data: ') && line !== 'data: [DONE]') {
                        try {
                            const data = JSON.parse(line.slice(6));
                            const content = data.choices[0]?.delta?.content;
                            if (content && options.streamCallback) {
                                options.streamCallback(content);
                            }
                        } catch (e) {
                            console.warn('Error parsing OpenAI response chunk:', e);
                        }
                    }
                }
            }
        } catch (error) {
            if (error instanceof ProviderError) {
                throw error;
            }
            if (error.name === 'AbortError') {
                console.log('OpenAI stream was aborted');
            } else {
                console.error('Error calling OpenAI:', error);
                throw error;
            }
        }
    }

    /**
     * Get available OpenAI models
     * 
     * Fetches the list of models from OpenAI's API.
     * Filters to only include chat models (GPT-3.5, GPT-4, etc.)
     * 
     * @returns List of available model names
     */
    async getAvailableModels(): Promise<string[]> {
        try {
            const response = await fetch(`${this.baseUrl}/models`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw this.handleHttpError(response);
            }

            const data = await response.json();
            return data.data
                .map((model: any) => model.id)
                .filter((id: string) => id.startsWith('gpt-'));
        } catch (error) {
            console.error('Error fetching OpenAI models:', error);
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
