/**
 * Google Gemini Provider Implementation
 * 
 * This file contains the implementation of the Google Gemini provider,
 * which allows the plugin to interact with Google's Gemini API using
 * the official Google Generative AI SDK.
 */

import { Message, CompletionOptions, ConnectionTestResult } from '../types';
import { BaseProvider, ProviderError } from './base';
import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';

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
    private genAI: GoogleGenerativeAI;
    private modelInstance: GenerativeModel;

    constructor(apiKey: string, model: string = 'gemini-1.5-pro') {
        super();
        this.apiKey = apiKey;
        this.model = model;
        this.genAI = new GoogleGenerativeAI(this.apiKey);
        this.modelInstance = this.genAI.getGenerativeModel({ model: this.model });
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
            const chat = this.modelInstance.startChat({
                generationConfig: {
                    temperature: options.temperature ?? 0.7,
                    maxOutputTokens: options.maxTokens ?? 1000,
                    topP: 0.8,
                    topK: 40
                }
            });

            // Convert messages to Gemini format and send history
            const history = messages.slice(0, -1);
            if (history.length > 0) {
                for (const msg of history) {
                    await chat.sendMessage(msg.content);
                }
            }

            // Send the last message and stream the response
            const lastMessage = messages[messages.length - 1];
            const result = await chat.sendMessageStream(lastMessage.content);

            for await (const chunk of result.stream) {
                const text = chunk.text();
                if (text && options.streamCallback) {
                    options.streamCallback(text);
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
     * Returns the list of supported Gemini models.
     * These are the officially supported models from Google's documentation.
     * 
     * @returns List of available model names
     */
    async getAvailableModels(): Promise<string[]> {
        return [
            'gemini-2.0-flash',
            'gemini-2.0-flash-lite',
            'gemini-1.5-flash',
            'gemini-1.5-flash-8b',
            'gemini-1.5-pro'
        ];
    }

    /**
     * Test connection to Gemini
     * 
     * Verifies the API key works by attempting a simple completion.
     * 
     * @returns Test results including success/failure
     */
    async testConnection(): Promise<ConnectionTestResult> {
        try {
            const chat = this.modelInstance.startChat();
            await chat.sendMessage("Hi");

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
