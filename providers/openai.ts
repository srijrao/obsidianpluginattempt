/**
 * OpenAI Provider Implementation
 * 
 * This file contains the implementation of the OpenAI provider,
 * which allows the plugin to interact with OpenAI's API (GPT-3.5, GPT-4, etc.)
 */

import { Message, CompletionOptions, ConnectionTestResult } from '../src/types';
import { BaseProvider, ProviderError, ProviderErrorType, ModelInfo } from './base';
import { debugLog } from '../src/utils/logger'; // Import debugLog
import { providerRegistry } from './registry';
import type { MyPluginSettings } from '../src/types';

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
                    temperature: options.temperature ?? 0.0,
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
                            debugLog(this.debugMode, 'warn', 'Error parsing OpenAI response chunk:', e); // Use debugLog
                        }
                    }
                }
            }
        } catch (error) {
            if (error instanceof ProviderError) {
                throw error;
            }
            if (error.name === 'AbortError') {
                debugLog(this.debugMode, 'info', 'OpenAI stream was aborted'); // Use debugLog
            } else {
                debugLog(this.debugMode, 'error', 'Error calling OpenAI:', error); // Use debugLog
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
            debugLog(this.debugMode, 'error', 'Error fetching OpenAI models:', error); // Use debugLog
            throw error;
        }
    }

    /**
     * List available OpenAI models with rich metadata
     * 
     * Fetches models from OpenAI's API and returns detailed information.
     * Filters to only include chat models (GPT-3.5, GPT-4, etc.)
     * 
     * @returns Promise resolving to array of ModelInfo objects
     */
    async listModels(): Promise<ModelInfo[]> {
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
            const gptModels = data.data.filter((model: any) => model.id.startsWith('gpt-'));
            
            return gptModels.map((model: any) => ({
                id: model.id,
                name: model.id,
                description: this.getModelDescription(model.id),
                context_length: this.getModelContextLength(model.id),
                provider: 'openai'
            }));
        } catch (error) {
            debugLog(this.debugMode, 'error', 'Error listing OpenAI models:', error);
            throw error;
        }
    }

    /**
     * Get a description for a known OpenAI model
     */
    private getModelDescription(modelId: string): string | undefined {
        const descriptions: Record<string, string> = {
            'gpt-4-turbo': 'Most capable GPT-4 model with improved performance',
            'gpt-4-turbo-preview': 'Preview of latest GPT-4 Turbo improvements',
            'gpt-4': 'More capable than GPT-3.5, better at complex tasks',
            'gpt-4-0613': 'GPT-4 snapshot from June 2023',
            'gpt-4-32k': 'Extended context window version of GPT-4',
            'gpt-3.5-turbo': 'Fast and efficient model for most tasks',
            'gpt-3.5-turbo-16k': 'Extended context window version of GPT-3.5'
        };
        return descriptions[modelId];
    }

    /**
     * Get context length for a known OpenAI model
     */
    private getModelContextLength(modelId: string): number | undefined {
        const contextLengths: Record<string, number> = {
            'gpt-4-turbo': 128000,
            'gpt-4-turbo-preview': 128000,
            'gpt-4': 8192,
            'gpt-4-0613': 8192,
            'gpt-4-32k': 32768,
            'gpt-3.5-turbo': 16385,
            'gpt-3.5-turbo-16k': 16385
        };
        return contextLengths[modelId];
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

// Register OpenAI provider with the registry
providerRegistry.register(
    {
        id: 'openai',
        name: 'OpenAI',
        description: 'GPT-4, GPT-3.5, and other OpenAI models',
        configFields: {
            apiKey: {
                label: 'OpenAI API Key',
                placeholder: 'sk-...',
                validator: (key: string) => key.startsWith('sk-') && key.length >= 20,
                required: true,
                type: 'password'
            },
            baseUrl: {
                label: 'Base URL (optional)',
                placeholder: 'https://api.openai.com/v1',
                type: 'url'
            }
        },
        supportsStreaming: true,
        isImplemented: true
    },
    (settings: MyPluginSettings) => new OpenAIProvider(
        settings.openaiSettings.apiKey,
        settings.openaiSettings.model,
        settings.openaiSettings.baseUrl,
        settings.debugMode ?? false
    )
);
