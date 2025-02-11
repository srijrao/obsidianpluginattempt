/**
 * Google Gemini Provider Implementation
 * 
 * This file contains the implementation of the Google Gemini provider,
 * which allows the plugin to interact with Google's Gemini API
 */

import { Message, CompletionOptions, ConnectionTestResult } from '../types';
import { BaseProvider, ProviderError, ProviderErrorType } from './base';

interface GeminiResponse {
    candidates: Array<{
        content: {
            parts: Array<{
                text: string;
            }>;
            role: string;
        };
        finishReason: string;
        index: number;
        safetyRatings: Array<{
            category: string;
            probability: string;
        }>;
    }>;
    promptFeedback: {
        safetyRatings: Array<{
            category: string;
            probability: string;
        }>;
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
    protected baseUrl = 'https://generativelanguage.googleapis.com/v1';
    protected model: string;

    constructor(apiKey: string, model: string = 'gemini-pro') {
        super();
        this.apiKey = apiKey;
        this.model = model;
    }

    /**
     * Convert messages to Gemini format
     * 
     * @param messages - Standard message format
     * @returns Messages in Gemini format
     */
    private convertToGeminiFormat(messages: Message[]) {
        return messages.map(msg => ({
            role: msg.role === 'assistant' ? 'model' : msg.role,
            parts: [{ text: msg.content }]
        }));
    }

    /**
     * Get a completion from Gemini
     * 
     * Sends the conversation to Gemini and streams back the response.
     * 
     * @param messages - The conversation history
     * @param options - Settings for this completion
     */
    async getCompletion(messages: Message[], options: CompletionOptions): Promise<void> {
        try {
            const contents = this.convertToGeminiFormat(messages);
            const response = await fetch(
                `${this.baseUrl}/models/${this.model}:streamGenerateContent?key=${this.apiKey}`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        contents,
                        generationConfig: {
                            temperature: options.temperature ?? 0.7,
                            maxOutputTokens: options.maxTokens ?? 1000,
                            topP: 0.8,
                            topK: 40
                        }
                    }),
                    signal: options.abortController?.signal
                }
            );

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
                            const data: GeminiResponse = JSON.parse(line);
                            const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
                            if (content && options.streamCallback) {
                                options.streamCallback(content);
                            }
                        } catch (e) {
                            console.warn('Error parsing Gemini response chunk:', e);
                        }
                    }
                }
            }
        } catch (error) {
            if (error instanceof ProviderError) {
                throw error;
            }
            if (error.name === 'AbortError') {
                console.log('Gemini stream was aborted');
            } else {
                console.error('Error calling Gemini:', error);
                throw error;
            }
        }
    }

    /**
     * Get available Gemini models
     * 
     * Fetches the list of models from Gemini's API.
     * 
     * @returns List of available model names
     */
    async getAvailableModels(): Promise<string[]> {
        try {
            const response = await fetch(
                `${this.baseUrl}/models?key=${this.apiKey}`
            );

            if (!response.ok) {
                throw this.handleHttpError(response);
            }

            const data = await response.json();
            return data.models
                .map((model: any) => model.name)
                .filter((name: string) => name.includes('gemini'));
        } catch (error) {
            console.error('Error fetching Gemini models:', error);
            // Return known models as fallback
            return ['gemini-pro', 'gemini-pro-vision'];
        }
    }

    /**
     * Test connection to Gemini
     * 
     * Verifies the API key works by attempting to list models.
     * 
     * @returns Test results including success/failure
     */
    async testConnection(): Promise<ConnectionTestResult> {
        try {
            const response = await fetch(
                `${this.baseUrl}/models?key=${this.apiKey}`
            );

            if (!response.ok) {
                throw this.handleHttpError(response);
            }

            const models = await this.getAvailableModels();
            return {
                success: true,
                message: 'Successfully connected to Google Gemini!',
                models
            };
        } catch (error) {
            return this.createErrorResponse(error);
        }
    }
}
