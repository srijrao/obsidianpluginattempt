/**
 * Google Gemini Provider Implementation
 * 
 * This file contains the implementation of the Google Gemini provider,
 * which allows the plugin to interact with Google's Gemini API.
 */

import { Message, CompletionOptions, ConnectionTestResult } from '../src/types';
import { BaseProvider, ProviderError, ProviderErrorType } from './base';
import { debugLog } from '../src/utils/logger'; // Import debugLog

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
    protected apiVersion: string;
    protected baseUrl: string;
    protected model: string;
    private debugMode: boolean; // Add debugMode property

    constructor(apiKey: string, model: string = 'gemini-2.0-flash', apiVersion: string = 'v1', debugMode: boolean = false) {
        super();
        this.apiKey = apiKey;
        this.model = model;
        this.apiVersion = apiVersion;
        this.baseUrl = `https://generativelanguage.googleapis.com/${this.apiVersion}`;
        this.debugMode = debugMode; // Initialize debugMode

        debugLog(true, 'debug', '[Gemini Provider] Initializing Gemini API', { config: { apiKey, model, apiVersion, debugMode } }); // Log initialization
    }

    /**
     * Determines the correct API version for a given model name.
     * Uses v1beta for preview/experimental/beta models, otherwise v1.
     */
    private getBaseUrlForModel(model: string): string {
        // Models with preview, exp, experimental, or beta in the name should use v1beta
        if (/preview|exp|experimental|beta/i.test(model)) {
            return 'https://generativelanguage.googleapis.com/v1beta';
        }
        return 'https://generativelanguage.googleapis.com/v1';
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

            // Dynamically select the correct base URL for the model
            const baseUrl = this.getBaseUrlForModel(this.model);
            const url = `${baseUrl}/models/${this.model}:generateContent?key=${this.apiKey}`;

            // Use non-streaming version for chat completions
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    contents: formattedMessages,
                    generationConfig: {
                        temperature: options.temperature ?? 0.0,                    }
                }),
                signal: options.abortController?.signal
            });

            if (!response.ok) {
                throw this.handleHttpError(response);
            }

            // For non-streaming response, parse the JSON directly
            const data = await response.json();
            debugLog(this.debugMode, 'debug', 'Gemini response:', JSON.stringify(data)); // Use debugLog
            
            // Extract the text from the response
            const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
            
            if (text && options.streamCallback) {
                // Even though it's not streaming, we use the streamCallback
                // to maintain compatibility with the existing interface
                options.streamCallback(text);
            } else {
                debugLog(this.debugMode, 'warn', 'No text found in Gemini response:', JSON.stringify(data)); // Use debugLog
            }
        } catch (error) {
            if (error instanceof ProviderError) {
                throw error;
            }
            if (error.name === 'AbortError') {
                debugLog(this.debugMode, 'info', 'Gemini request was aborted'); // Use debugLog
            } else {
                debugLog(this.debugMode, 'error', 'Error calling Gemini:', error); // Use debugLog
                throw error;
            }
        }
    }

    /**
     * Get available Gemini models from both v1 and v1beta endpoints by default
     *
     * @returns List of available model names (deduplicated)
     */
    async getAvailableModels(): Promise<string[]> {
        // Helper to fetch models from a given version
        const fetchModels = async (version: string): Promise<string[]> => {
            const url = `https://generativelanguage.googleapis.com/${version}/models?key=${this.apiKey}`;
            const response = await fetch(url, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' }
            });
            if (!response.ok) throw this.handleHttpError(response);
            const data = await response.json();
            return data.models?.map((model: any) => model.name.split('/').pop()) || [];
        };
        try {
            // Fetch both v1 and v1beta models in parallel
            const [v1Models, v1betaModels] = await Promise.all([
                fetchModels('v1'),
                fetchModels('v1beta')
            ]);
            // Merge and deduplicate
            return Array.from(new Set([...v1Models, ...v1betaModels]));
        } catch (error) {
            debugLog(this.debugMode, 'error', 'Error fetching Gemini models:', error); // Use debugLog
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
