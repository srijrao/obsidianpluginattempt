/**
 * OpenAI Provider Implementation
 *
 * This file contains the implementation of the OpenAI provider,
 * which allows the plugin to interact with OpenAI's API (GPT-3.5, GPT-4, etc.)
 */
/**
 * Implements the OpenAI provider functionality
 *
 * Handles communication with OpenAI's API, including:
 * - Chat completions
 * - Model listing
 * - Connection testing
 * - Streaming responses
 */
export class OpenAIProvider {
    apiKey;
    baseUrl = 'https://api.openai.com/v1';
    model;
    constructor(apiKey, model = 'gpt-4') {
        this.apiKey = apiKey;
        this.model = model;
    }
    /**
     * Get a completion from OpenAI
     *
     * Sends the conversation to OpenAI and streams back the response.
     *
     * @param messages - The conversation history
     * @param options - Settings for this completion
     */
    async getCompletion(messages, options) {
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
                    temperature: options.temperature ?? 0.7,
                    max_tokens: options.maxTokens ?? 1000,
                    stream: true
                }),
                signal: options.abortController?.signal
            });
            if (!response.ok) {
                throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
            }
            const reader = response.body?.getReader();
            const decoder = new TextDecoder('utf-8');
            while (true) {
                const { done, value } = await reader?.read() || { done: true, value: undefined };
                if (done)
                    break;
                const chunk = decoder.decode(value);
                const lines = chunk.split('\n');
                for (const line of lines) {
                    if (line.startsWith('data: ') && line !== 'data: [DONE]') {
                        const data = JSON.parse(line.slice(6));
                        const content = data.choices[0]?.delta?.content;
                        if (content && options.streamCallback) {
                            options.streamCallback(content);
                        }
                    }
                }
            }
        }
        catch (error) {
            if (error.name === 'AbortError') {
                console.log('OpenAI stream was aborted');
            }
            else {
                console.error('Error calling OpenAI:', error);
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
    async getAvailableModels() {
        try {
            const response = await fetch(`${this.baseUrl}/models`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json'
                }
            });
            if (!response.ok) {
                throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
            }
            const data = await response.json();
            return data.data
                .map((model) => model.id)
                .filter((id) => id.startsWith('gpt-'));
        }
        catch (error) {
            console.error('Error fetching OpenAI models:', error);
            throw error;
        }
    }
    /**
     * Test connection to OpenAI
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
                message: `Successfully connected to OpenAI! Found ${models.length} available models.`,
                models
            };
        }
        catch (error) {
            let message = 'Connection failed: ';
            if (error.response?.status === 401) {
                message += 'Invalid API key. Please check your OpenAI API key.';
            }
            else if (error.response?.status === 429) {
                message += 'Rate limit exceeded. Please try again later.';
            }
            else {
                message += error.message;
            }
            return {
                success: false,
                message
            };
        }
    }
}
