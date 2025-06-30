import { Message, CompletionOptions } from "../types";

/**
 * Result of testing an AI provider connection
 * 
 * @property success - Whether the connection test passed
 * @property message - Human-readable result message
 * @property models - List of available models (if test successful)
 */
export interface ConnectionTestResult {
    success: boolean;
    message: string;
    models?: string[];
}

/**
 * Common interface for all AI providers
 * 
 * This interface ensures that all AI providers (OpenAI, Anthropic, etc.)
 * implement the same basic functionality, making it easy to switch between them.
 */
export interface AIProvider {
    /**
     * Get a completion from the AI model
     * 
     * @param messages - The conversation history
     * @param options - Settings for this completion
     * @returns Promise that resolves when the completion is finished
     */
    getCompletion(messages: Message[], options: CompletionOptions): Promise<void>;

    /**
     * Get the list of available models from this provider
     * 
     * @returns Promise resolving to list of model names
     */
    getAvailableModels(): Promise<string[]>;

    /**
     * Test the connection to this provider
     * 
     * Verifies API keys, server connections, and permissions.
     * Also fetches the list of available models if successful.
     * 
     * @returns Promise resolving to test results
     */
    testConnection(): Promise<ConnectionTestResult>;
}

/**
 * Represents a unified model from any provider
 */
export interface UnifiedModel {
    id: string;           
    name: string;         
    provider: 'openai' | 'anthropic' | 'gemini' | 'ollama';
    modelId: string;      
}
