/**
 * Ollama Provider Implementation
 * 
 * This file contains the implementation of the Ollama provider,
 * which allows the plugin to interact with a local Ollama server
 * running AI models like Llama, Mistral, etc.
 */

import { Message, CompletionOptions, ConnectionTestResult } from '../types';
import { BaseProvider, ProviderError, ProviderErrorType } from './base';
import { debug } from '../settings';

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
    protected apiKey: string = '';  // Ollama doesn't use API keys
    protected baseUrl: string;
    protected model: string;

    constructor(serverUrl: string = 'http://localhost:11434', model: string = 'llama2') {
        super();
        this.baseUrl = serverUrl;
        this.model = model;
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
        this.validateCompletionOptions(options);

        // Create stream manager if we're streaming
        const streamManager = this.createStreamManager(options);
        
        try {
            this.logRequestStart('POST', '/api/generate');
            const startTime = Date.now();

            // Format the messages for Ollama
            const formattedPrompt = this.formatMessages(messages);
            
            const url = `${this.baseUrl}/api/generate`;
            const response = await this.makeRequest(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: this.model,
                    prompt: formattedPrompt,
                    stream: Boolean(options.streamCallback),
                    options: {
                        temperature: options.temperature ?? 0.7,
                        num_predict: options.maxTokens ?? 2000,
                    }
                }),
                signal: options.abortController?.signal
            });
            
            if (options.streamCallback && streamManager) {
                // Streaming response
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
                        if (line.trim()) {
                            try {
                                const data = JSON.parse(line) as OllamaResponse;
                                if (data.response) {
                                    streamManager.write(data.response);
                                }
                                
                                // Check if generation is complete
                                if (data.done) {
                                    streamManager.complete();
                                }
                            } catch (e) {
                                debug('Error parsing Ollama response chunk:', e);
                            }
                        }
                    }
                }
            } else {
                // Non-streaming response
                const data = await response.json() as OllamaResponse;
                
                if (options.streamCallback && data.response) {
                    options.streamCallback(data.response);
                }
            }

            this.logRequestEnd('POST', '/api/generate', Date.now() - startTime);
        } catch (error) {
            if (error instanceof ProviderError) {
                throw error;
            }
            
            if (error.name === 'AbortError') {
                debug('Ollama stream was aborted');
                streamManager?.destroy();
            } else {
                const errorMessage = error.message?.includes('fetch') 
                    ? 'Could not connect to Ollama server. Make sure Ollama is installed and running.'
                    : `Error calling Ollama: ${error.message}`;
                    
                this.logError(error);
                throw new ProviderError(
                    ProviderErrorType.SERVER_ERROR,
                    errorMessage
                );
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
            this.logRequestStart('GET', '/api/tags');
            const startTime = Date.now();
            
            const response = await this.makeRequest(`${this.baseUrl}/api/tags`, {
                method: 'GET'
            });
            
            const data = await response.json();
            this.logRequestEnd('GET', '/api/tags', Date.now() - startTime);
            
            return data.models.map((model: OllamaModel) => model.name);
        } catch (error) {
            this.logError(error);
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
            let message = 'Connection failed: ';
            
            if (error instanceof Error) {
                if (error.message.includes('fetch')) {
                    message += 'Could not connect to Ollama server. Make sure Ollama is installed and running.';
                } else {
                    message += error.message;
                }
            } else {
                message += 'Unknown error occurred';
            }
            
            return {
                success: false,
                message
            };
        }
    }

    /**
     * Format messages for Ollama API
     * 
     * Converts from the plugin's Message format to Ollama's expected format.
     * Ollama expects a simple text prompt, so we need to flatten the conversation.
     * 
     * @param messages Array of message objects
     * @returns Formatted prompt string for Ollama
     */
    private formatMessages(messages: Message[]): string {
        let prompt = '';
        
        // Extract system messages and add them at the beginning
        const systemMessages = messages.filter(m => m.role === 'system');
        if (systemMessages.length > 0) {
            prompt = systemMessages.map(m => m.content).join('\n\n');
            prompt += '\n\n';
        }
        
        // Add user/assistant exchanges
        const nonSystemMessages = messages.filter(m => m.role !== 'system');
        for (const message of nonSystemMessages) {
            const roleName = message.role === 'user' ? 'User' : 'Assistant';
            prompt += `${roleName}: ${message.content}\n\n`;
        }
        
        // Add final prompt token
        prompt += 'Assistant: ';
        
        return prompt;
    }
}
