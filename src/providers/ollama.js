/**
 * Ollama Provider Implementation
 *
 * This file contains the implementation of the Ollama provider,
 * which allows the plugin to interact with a local Ollama server
 * running AI models like Llama, Mistral, etc.
 */
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
export class OllamaProvider {
    serverUrl;
    model;
    constructor(serverUrl = 'http://localhost:11434', model = 'llama2') {
        this.serverUrl = serverUrl.replace(/\/$/, ''); // Remove trailing slash if present
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
    async getCompletion(messages, options) {
        try {
            // Convert messages to Ollama format
            const prompt = messages.map(msg => {
                if (msg.role === 'system') {
                    return `System: ${msg.content}\n\n`;
                }
                return `${msg.role === 'user' ? 'Human' : 'Assistant'}: ${msg.content}\n\n`;
            }).join('') + 'Assistant:';
            const response = await fetch(`${this.serverUrl}/api/generate`, {
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
                throw new Error(`Ollama API error: ${response.status} ${response.statusText}`);
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
                    if (line.trim()) {
                        try {
                            const data = JSON.parse(line);
                            if (data.response && options.streamCallback) {
                                options.streamCallback(data.response);
                            }
                        }
                        catch (e) {
                            console.warn('Error parsing Ollama response chunk:', e);
                        }
                    }
                }
            }
        }
        catch (error) {
            if (error.name === 'AbortError') {
                console.log('Ollama stream was aborted');
            }
            else {
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
    async getAvailableModels() {
        try {
            const response = await fetch(`${this.serverUrl}/api/tags`);
            if (!response.ok) {
                throw new Error(`Ollama API error: ${response.status} ${response.statusText}`);
            }
            const data = await response.json();
            return data.models?.map((model) => model.name) || [];
        }
        catch (error) {
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
    async testConnection() {
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
        }
        catch (error) {
            let message = 'Connection failed: ';
            if (error.message.includes('fetch')) {
                message += 'Could not connect to Ollama server. Make sure Ollama is installed and running.';
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
