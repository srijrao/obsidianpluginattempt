/**
 * Google Gemini Provider Implementation
 * 
 * This file contains the implementation of the Google Gemini provider,
 * which allows the plugin to interact with Google's Gemini API.
 */

import { Message, CompletionOptions, ConnectionTestResult } from '../types';
import { BaseProvider, ProviderError, ProviderErrorType } from './base';
import { debug } from '../settings';

interface GeminiResponse {
    candidates: Array<{
        content: {
            parts: Array<{
                text: string;
            }>;
            role: string;
        };
        finishReason: string;
        safetyRatings: Array<any>;
    }>;
    promptFeedback: {
        safetyRatings: Array<any>;
    };
}

/**
 * Implements the Google Gemini provider functionality
 * 
 * Handles communication with Google's Gemini API, including:
 * - Chat completions
 * - Model listing
 * - Connection testing
 * - Streaming responses
 */
export class GeminiProvider extends BaseProvider {
    protected apiKey: string;
    protected baseUrl: string = 'https://generativelanguage.googleapis.com/v1';
    protected model: string;

    constructor(apiKey: string, model: string = 'gemini-pro') {
        super();
        this.apiKey = apiKey;
        this.model = model;
    }

    /**
     * Get a completion from Google Gemini
     * 
     * Sends the conversation to Gemini and streams back the response.
     * 
     * @param messages - The conversation history
     * @param options - Settings for this completion
     */
    async getCompletion(messages: Message[], options: CompletionOptions): Promise<void> {
        this.validateCompletionOptions(options);

        // Create stream manager if we're streaming
        const streamManager = this.createStreamManager(options);
        
        try {
            const formattedMessages = this.formatMessages(messages);
            
            // Determine if we should stream
            const isStreaming = Boolean(options.streamCallback);
            
            if (isStreaming) {
                // Streaming request
                this.logRequestStart('POST', `/models/${this.model}:streamGenerateContent`);
                const startTime = Date.now();
                
                const url = `${this.baseUrl}/models/${this.model}:streamGenerateContent?key=${this.apiKey}`;
                const response = await this.makeRequest(url, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        contents: formattedMessages,
                        generationConfig: {
                            temperature: options.temperature ?? 0.7,
                            maxOutputTokens: options.maxTokens ?? 1000
                        },
                        safetySettings: [
                            {
                                category: "HARM_CATEGORY_HARASSMENT",
                                threshold: "BLOCK_MEDIUM_AND_ABOVE"
                            },
                            {
                                category: "HARM_CATEGORY_HATE_SPEECH",
                                threshold: "BLOCK_MEDIUM_AND_ABOVE"
                            },
                            {
                                category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
                                threshold: "BLOCK_MEDIUM_AND_ABOVE"
                            },
                            {
                                category: "HARM_CATEGORY_DANGEROUS_CONTENT",
                                threshold: "BLOCK_MEDIUM_AND_ABOVE"
                            }
                        ]
                    }),
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
                        if (line.trim() && !line.startsWith('[')) {
                            try {
                                const data = JSON.parse(line);
                                const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
                                if (text && streamManager) {
                                    streamManager.write(text);
                                }
                            } catch (e) {
                                debug('Error parsing Gemini response chunk:', e);
                            }
                        }
                    }
                }
                
                streamManager?.complete();
                this.logRequestEnd('POST', `/models/${this.model}:streamGenerateContent`, Date.now() - startTime);
            } else {
                // Non-streaming request
                this.logRequestStart('POST', `/models/${this.model}:generateContent`);
                const startTime = Date.now();
                
                const url = `${this.baseUrl}/models/${this.model}:generateContent?key=${this.apiKey}`;
                const response = await this.makeRequest(url, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        contents: formattedMessages,
                        generationConfig: {
                            temperature: options.temperature ?? 0.7,
                            maxOutputTokens: options.maxTokens ?? 1000
                        }
                    }),
                    signal: options.abortController?.signal
                });
                
                const data = await response.json() as GeminiResponse;
                const content = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
                
                if (options.streamCallback) {
                    options.streamCallback(content);
                }
                
                this.logRequestEnd('POST', `/models/${this.model}:generateContent`, Date.now() - startTime);
            }
        } catch (error) {
            if (error instanceof ProviderError) {
                throw error;
            }
            
            if (error.name === 'AbortError') {
                debug('Gemini stream was aborted');
                streamManager?.destroy();
            } else {
                this.logError(error);
                throw new ProviderError(
                    ProviderErrorType.SERVER_ERROR,
                    `Error calling Gemini: ${error.message}`
                );
            }
        }
    }

    /**
     * Get available Gemini models
     * 
     * Fetches the list of available models from Google's API.
     * Filters to only include Gemini models.
     * 
     * @returns List of available model names
     */
    async getAvailableModels(): Promise<string[]> {
        try {
            this.logRequestStart('GET', '/models');
            const startTime = Date.now();

            const response = await this.makeRequest(`${this.baseUrl}/models?key=${this.apiKey}`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            const data = await response.json();
            this.logRequestEnd('GET', '/models', Date.now() - startTime);

            return data.models
                .map((model: any) => model.name.split('/').pop())
                .filter((id: string) => id.startsWith('gemini-'));
        } catch (error) {
            console.error('Error fetching Gemini models:', error);
            throw error;
        }
    }

    /**
     * Test connection to Gemini
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
                message: `Successfully connected to Google Gemini! Found ${models.length} available models.`,
                models
            };
        } catch (error) {
            return this.createErrorResponse(error);
        }
    }

    /**
     * Format messages for Gemini API
     * 
     * Converts from the plugin's Message format to Gemini's expected format.
     * 
     * @param messages - Array of messages to format
     * @returns Formatted messages for Gemini API
     */
    private formatMessages(messages: Message[]): Array<any> {
        const formattedMessages = [];
        let currentRole = null;
        let content = { parts: [{ text: '' }] };
        
        for (const message of messages) {
            // Gemini doesn't support system messages, so convert them to user
            const role = message.role === 'system' ? 'user' : message.role;
            
            if (role !== currentRole && currentRole !== null) {
                formattedMessages.push({ 
                    role: currentRole, 
                    parts: [{ text: content.parts[0].text }] 
                });
                content = { parts: [{ text: message.content }] };
            } else {
                content.parts[0].text += (content.parts[0].text ? '\n\n' : '') + message.content;
            }
            
            currentRole = role;
        }
        
        if (currentRole !== null) {
            formattedMessages.push({ 
                role: currentRole, 
                parts: [{ text: content.parts[0].text }] 
            });
        }
        
        return formattedMessages;
    }
}
