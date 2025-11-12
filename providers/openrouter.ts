/**
 * OpenRouter Provider Implementation
 * 
 * This file contains the implementation of the OpenRouter provider,
 * which provides access to 100+ AI models from various providers
 * through a single API.
 */

import { Message, CompletionOptions, ConnectionTestResult } from '../src/types';
import { BaseProvider, ProviderError, ProviderErrorType, ModelInfo } from './base';
import { debugLog } from '../src/utils/logger';
import { providerRegistry } from './registry';
import type { MyPluginSettings } from '../src/types';

/**
 * OpenRouter API response structure for model listing
 */
interface OpenRouterModel {
    id: string;
    name: string;
    description?: string;
    context_length?: number;
    pricing?: {
        prompt: string;
        completion: string;
    };
    top_provider?: {
        context_length?: number;
        max_completion_tokens?: number;
    };
}

interface OpenRouterModelsResponse {
    data: OpenRouterModel[];
}

/**
 * Implements the OpenRouter provider functionality
 * 
 * OpenRouter provides access to models from multiple providers including:
 * - OpenAI (GPT-4, GPT-3.5)
 * - Anthropic (Claude 3)
 * - Google (Gemini)
 * - Meta (Llama)
 * - Mistral AI
 * - And many more
 */
export class OpenRouterProvider extends BaseProvider {
    protected apiKey: string;
    protected baseUrl = 'https://openrouter.ai/api/v1';
    protected model: string;
    private debugMode: boolean;

    constructor(apiKey: string, model: string = 'openai/gpt-4-turbo', debugMode: boolean = false) {
        super();
        this.apiKey = apiKey;
        this.model = model;
        this.debugMode = debugMode;

        debugLog(true, 'debug', '[OpenRouter Provider] Initializing OpenRouter API', { 
            config: { apiKey: apiKey ? '***' : 'none', model, debugMode } 
        });
    }

    /**
     * Get a completion from OpenRouter
     * 
     * Sends the conversation to OpenRouter and streams back the response.
     * Uses OpenAI-compatible API format.
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
                    'Content-Type': 'application/json',
                    'HTTP-Referer': 'https://github.com/yourusername/ai-assistant-for-obsidian',
                    'X-Title': 'AI Assistant for Obsidian'
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
                            debugLog(this.debugMode, 'warn', 'Error parsing OpenRouter response chunk:', e);
                        }
                    }
                }
            }
        } catch (error) {
            if (error instanceof ProviderError) {
                throw error;
            }
            const err = error as Error;
            if (err.name === 'AbortError') {
                debugLog(this.debugMode, 'info', 'OpenRouter stream was aborted');
            } else {
                debugLog(this.debugMode, 'error', 'Error calling OpenRouter:', error);
                throw error;
            }
        }
    }

    /**
     * Get available OpenRouter models
     * 
     * Fetches the list of models from OpenRouter's API.
     * Note: Model listing doesn't require authentication.
     * 
     * @returns List of available model IDs
     */
    async getAvailableModels(): Promise<string[]> {
        try {
            const models = await this.listModels();
            return models.map(m => m.id);
        } catch (error) {
            debugLog(this.debugMode, 'error', 'Error fetching OpenRouter models:', error);
            throw error;
        }
    }

    /**
     * List available OpenRouter models with rich metadata
     * 
     * Fetches detailed model information from OpenRouter's public API.
     * No authentication required for model listing.
     * 
     * @returns Promise resolving to array of ModelInfo objects
     */
    async listModels(): Promise<ModelInfo[]> {
        try {
            const response = await fetch('https://openrouter.ai/api/v1/models', {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw this.handleHttpError(response);
            }

            const data: OpenRouterModelsResponse = await response.json();
            
            return data.data.map(model => ({
                id: model.id,
                name: model.name || model.id,
                description: model.description,
                context_length: model.context_length || model.top_provider?.context_length,
                provider: 'openrouter'
            }));
        } catch (error) {
            debugLog(this.debugMode, 'error', 'Error listing OpenRouter models:', error);
            throw error;
        }
    }

    /**
     * Test connection to OpenRouter
     * 
     * Verifies the API key works by attempting a minimal completion.
     * 
     * @returns Test results including success/failure and available models
     */
    async testConnection(): Promise<ConnectionTestResult> {
        try {
            // Test with a minimal completion request
            const response = await fetch(`${this.baseUrl}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json',
                    'HTTP-Referer': 'https://github.com/yourusername/ai-assistant-for-obsidian',
                    'X-Title': 'AI Assistant for Obsidian'
                },
                body: JSON.stringify({
                    model: this.model,
                    messages: [{ role: 'user', content: 'Hi' }],
                    max_tokens: 1
                })
            });

            if (!response.ok) {
                throw this.handleHttpError(response);
            }

            const models = await this.getAvailableModels();
            return {
                success: true,
                message: `Successfully connected to OpenRouter! Found ${models.length} available models.`,
                models: models.slice(0, 20) // Return first 20 for display
            };
        } catch (error) {
            return this.createErrorResponse(error);
        }
    }
}

// Register OpenRouter provider with the registry
providerRegistry.register(
    {
        id: 'openrouter',
        name: 'OpenRouter',
        description: 'Access 100+ models from OpenAI, Anthropic, Google, Meta, and more',
        configFields: {
            apiKey: {
                label: 'OpenRouter API Key',
                placeholder: 'sk-or-v1-...',
                validator: (key: string) => key.startsWith('sk-or-') && key.length >= 20,
                required: true,
                type: 'password'
            }
        },
        supportsStreaming: true,
        isImplemented: true
    },
    (settings: MyPluginSettings) => {
        // Check if openrouterSettings exists, fall back to defaults if not
        const openrouterSettings = (settings as any).openrouterSettings || {
            apiKey: '',
            model: 'openai/gpt-4-turbo'
        };
        
        return new OpenRouterProvider(
            openrouterSettings.apiKey,
            openrouterSettings.model,
            settings.debugMode ?? false
        );
    }
);
