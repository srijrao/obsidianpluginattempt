/**
 * Google Gemini Provider Implementation
 * 
 * This file contains the implementation of the Google Gemini provider,
 * which allows the plugin to interact with Google's Gemini API.
 */
import { BaseProvider, ProviderError } from './base';
export class GeminiProvider extends BaseProvider {
    constructor(apiKey, model = "gemini-pro") {
        super();
        this.apiKey = apiKey;
        this.baseUrl = "https://generativelanguage.googleapis.com/v1";
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
    async getCompletion(messages, options) {
        try {
            // Format messages for Gemini API
            const formattedMessages = this.formatMessages(messages);
            
            // Build URL with API key
            const url = `${this.baseUrl}/models/${this.model}:streamGenerateContent?key=${this.apiKey}`;
            
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

            if (!response.ok) {
                throw this.handleHttpError(response);
            }

            const reader = response.body?.getReader();
            const decoder = new TextDecoder('utf-8');
            
            if (!reader) {
                throw new ProviderError(
                    "server_error" /* ServerError */,
                    'Failed to get response reader'
                );
            }

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
                            if (text && options.streamCallback) {
                                options.streamCallback(text);
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
     * Fetches the list of available models from Google's API.
     * Filters to only include Gemini models.
     * 
     * @returns List of available model names
     */
    async getAvailableModels() {
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
                .map(model => model.name.split('/').pop())
                .filter(id => id.startsWith('gemini-'));
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
    async testConnection() {
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
    formatMessages(messages) {
        const formattedMessages = [];
        let currentRole = null;
        let content = { parts: [{ text: '' }] };
        
        for (const message of messages) {
            const role = message.role === 'system' ? 'user' : message.role;
            
            if (role !== currentRole && currentRole !== null) {
                formattedMessages.push({ role: currentRole, parts: [{ text: content.parts[0].text }] });
                content = { parts: [{ text: message.content }] };
            } else {
                content.parts[0].text += (content.parts[0].text ? '\n\n' : '') + message.content;
            }
            
            currentRole = role;
        }
        
        if (currentRole !== null) {
            formattedMessages.push({ role: currentRole, parts: [{ text: content.parts[0].text }] });
        }
        
        return formattedMessages;
    }
}
