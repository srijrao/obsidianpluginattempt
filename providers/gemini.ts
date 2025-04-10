/**
 * Google Gemini Provider Implementation
 * 
 * This file contains the implementation of the Google Gemini provider,
 * which allows the plugin to interact with Google's Gemini API.
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
    protected baseUrl = 'https://generativelanguage.googleapis.com/v1';
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
        try {
            // Format messages for Gemini API
            const formattedMessages = this.formatMessages(messages);
            
            // For chat models, we should use the generateContent endpoint
            const url = `${this.baseUrl}/models/${this.model}:generateContent?key=${this.apiKey}`;
            
            // Use non-streaming version for chat completions
            const response = await fetch(url, {
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

            if (!response.ok) {
                throw this.handleHttpError(response);
            }

            // For non-streaming response, parse the JSON directly
            const data = await response.json();
            console.log('Gemini response:', JSON.stringify(data));
            
            // Extract the text from the response
            const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
            
            if (text && options.streamCallback) {
                // Even though it's not streaming, we use the streamCallback
                // to maintain compatibility with the existing interface
                options.streamCallback(text);
            } else {
                console.warn('No text found in Gemini response:', JSON.stringify(data));
            }
        } catch (error) {
            if (error instanceof ProviderError) {
                throw error;
            }
            if (error.name === 'AbortError') {
                console.log('Gemini request was aborted');
            } else {
                console.error('Error calling Gemini:', error);
                throw error;
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
            const response = await fetch(`${this.baseUrl}/models?key=${this.apiKey}`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw this.handleHttpError(response);
            }

            const data = await response.json();
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
        // The Gemini API expects a chat format where:
        // 1. System messages should be sent as user messages that come first
        // 2. Each message needs to have a role and parts array
        
        const geminiMessages = [];
        
        // First, find and process system messages
        const systemMessages = messages.filter(msg => msg.role === 'system');
        const nonSystemMessages = messages.filter(msg => msg.role !== 'system');
        
        // Add system messages first as user messages
        for (const message of systemMessages) {
            geminiMessages.push({
                role: 'user',
                parts: [{ text: message.content }]
            });
        }
        
        // Then add the regular conversation messages
        for (const message of nonSystemMessages) {
            // Gemini only supports 'user' and 'model' roles
            const role = message.role === 'assistant' ? 'model' : 'user';
            
            geminiMessages.push({
                role: role,
                parts: [{ text: message.content }]
            });
        }
        
        return geminiMessages;
    }
}
