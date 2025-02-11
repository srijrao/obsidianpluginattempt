/**
 * Anthropic Provider Implementation
 *
 * This file contains the implementation of the Anthropic provider,
 * which allows the plugin to interact with Anthropic's API (Claude models)
 */
/**
 * Implements the Anthropic provider functionality
 *
 * Handles communication with Anthropic's API, including:
 * - Chat completions
 * - Model listing
 * - Connection testing
 * - Streaming responses
 */
export class AnthropicProvider {
    apiKey;
    baseUrl = 'https://api.anthropic.com/v1';
    model;
    constructor(apiKey, model = 'claude-3-sonnet-20240229') {
        this.apiKey = apiKey;
        this.model = model;
    }
    /**
     * Get a completion from Anthropic
     *
     * Sends the conversation to Anthropic and streams back the response.
     *
     * @param messages - The conversation history
     * @param options - Settings for this completion
     */
    async getCompletion(messages, options) {
        try {
            const response = await fetch(`${this.baseUrl}/messages`, {
                method: 'POST',
                headers: {
                    'x-api-key': this.apiKey,
                    'anthropic-version': '2024-01-01',
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
                throw new Error(`Anthropic API error: ${response.status} ${response.statusText}`);
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
                        const content = data.delta?.text;
                        if (content && options.streamCallback) {
                            options.streamCallback(content);
                        }
                    }
                }
            }
        }
        catch (error) {
            if (error.name === 'AbortError') {
                console.log('Anthropic stream was aborted');
            }
            else {
                console.error('Error calling Anthropic:', error);
                throw error;
            }
        }
    }
    /**
     * Get available Anthropic models
     *
     * Returns the list of supported Claude models.
     * Note: Anthropic doesn't have a models endpoint, so we return known models.
     *
     * @returns List of available model names
     */
    async getAvailableModels() {
        return [
            'claude-3-opus-20240229',
            'claude-3-sonnet-20240229',
            'claude-3-haiku-20240307'
        ];
    }
    /**
     * Test connection to Anthropic
     *
     * Verifies the API key works by attempting a simple completion.
     *
     * @returns Test results including success/failure
     */
    async testConnection() {
        try {
            const response = await fetch(`${this.baseUrl}/messages`, {
                method: 'POST',
                headers: {
                    'x-api-key': this.apiKey,
                    'anthropic-version': '2024-01-01',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: this.model,
                    messages: [{ role: 'user', content: 'Hi' }],
                    max_tokens: 1
                })
            });
            if (!response.ok) {
                throw new Error(`Status ${response.status}`);
            }
            const models = await this.getAvailableModels();
            return {
                success: true,
                message: 'Successfully connected to Anthropic!',
                models
            };
        }
        catch (error) {
            let message = 'Connection failed: ';
            if (error.response?.status === 401) {
                message += 'Invalid API key. Please check your Anthropic API key.';
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
