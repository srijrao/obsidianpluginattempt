/**
 * Ollama Provider Implementation
 * 
 * This file contains the implementation of the Ollama provider,
 * which allows the plugin to interact with a local Ollama server
 * running AI models like Llama, Mistral, etc.
 */

import { Message, CompletionOptions, ConnectionTestResult } from '../src/types';
import { BaseProvider, ProviderError, ProviderErrorType } from './base';

interface OllamaResponse {
    model: string;
    created_at: string;
    response: string;
    done: boolean;
    context?: number[];
    total_duration?: number;
    load_duration?: number;
    prompt_eval_duration?: number;
    eval_duration?: number;
    eval_count?: number;
}

interface OllamaModel {
    name: string;
    modified_at: string;
    size: number;
    digest: string;
    details: {
        format: string;
        family: string;
        parameter_size: string;
        quantization_level: string;
    };
}

/**
 * Implements the Ollama provider functionality
 * 
 * Handles communication with a local Ollama server, including:
 * - Chat completions
 * - Model listing
 * - Connection testing
 * - Streaming responses
 * 
 * Requires Ollama to be installed and running locally:
 * 1. Install Ollama from https://ollama.ai
 * 2. Start the Ollama server
 * 3. Pull your desired models using 'ollama pull model-name'
 */
export class OllamaProvider extends BaseProvider {
    protected apiKey: string = ''; // Not used for Ollama
    protected baseUrl: string;
    protected model: string;

    constructor(serverUrl: string = 'http://localhost:11434', model: string = 'llama2') {
        super();
        this.baseUrl = serverUrl.replace(/\/$/, ''); // Remove trailing slash if present
        this.model = model;
    }

    /**
     * Convert messages to Ollama format
     * 
     * @param messages - Standard message format
     * @returns Prompt string in Ollama format
     */
    private convertToOllamaFormat(messages: Message[]): string {
        return messages.map(msg => {
            if (msg.role === 'system') {
                return `System: ${msg.content}\n\n`;
            }
            return `${msg.role === 'user' ? 'Human' : 'Assistant'}: ${msg.content}\n\n`;
        }).join('') + 'Assistant:';
    }

    /**
     * Get a completion from Ollama
     * 
     * Sends the conversation to the local Ollama server and streams back the response.
     * 
     * @param messages - The conversation history
     * @param options - Settings for this completion
     */
    async getCompletion(messages: Message[], options: CompletionOptions): Promise<void> {
        try {
            const prompt = this.convertToOllamaFormat(messages);
            const response = await fetch(`${this.baseUrl}/api/generate`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: this.model,
                    prompt,
                    stream: true,
                    options: {
                        temperature: options.temperature ?? 0.7,
                        num_predict: options.maxTokens ?? 1000
                    }
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
                    if (line.trim()) {
                        try {
                            const data: OllamaResponse = JSON.parse(line);
                            if (data.response && options.streamCallback) {
                                options.streamCallback(data.response);
                            }
                        } catch (e) {
                            console.warn('Error parsing Ollama response chunk:', e);
                        }
                    }
                }
            }
        } catch (error) {
            if (error instanceof ProviderError) {
                throw error;
            }
            if (error.name === 'AbortError') {
                console.log('Ollama stream was aborted');
            } else {
                console.error('Error calling Ollama:', error);
                throw error;
            }
        }
    }

    /**
     * Get available Ollama models
     * 
     * Fetches the list of models installed on the local Ollama server.
     * 
     * @returns List of available model names
     */
    async getAvailableModels(): Promise<string[]> {
        try {
            const response = await fetch(`${this.baseUrl}/api/tags`);

            if (!response.ok) {
                throw this.handleHttpError(response);
            }

            const data = await response.json();
            return (data.models as OllamaModel[])?.map(model => model.name) || [];
        } catch (error) {
            console.error('Error fetching Ollama models:', error);
            throw error;
        }
    }

    /**
     * Test connection to Ollama
     * 
     * Verifies the Ollama server is running and accessible.
     * Also checks if any models are installed.
     * 
     * @returns Test results including success/failure and available models
     */
    async testConnection(): Promise<ConnectionTestResult> {
        try {
            const models = await this.getAvailableModels();
            
            if (models.length === 0) {
                return {
                    success: false,
                    message: 'Connected to Ollama server, but no models are installed. Use "ollama pull model-name" to install models.',
                    models: []
                };
            }

            return {
                success: true,
                message: `Successfully connected to Ollama! Found ${models.length} installed models.`,
                models
            };
        } catch (error) {
            return this.createErrorResponse(error);
        }
    }
}
