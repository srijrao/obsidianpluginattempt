/**
 * AI Assistant Plugin Types
 * 
 * This file contains the core types and interfaces used throughout the plugin.
 * These definitions ensure consistency across different AI providers and
 * make the code more maintainable and type-safe.
 */

/**
 * Message format for chat conversations
 */
export interface Message {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

/**
 * Options for generating completions
 */
export interface CompletionOptions {
    temperature?: number;
    maxTokens?: number;
    streamCallback?: ((chunk: string) => void) | ((chunk: string) => Promise<void>);
    abortController?: AbortController;
}

/**
 * Result of testing a provider connection
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
 * Chat state for managing UI state and interactions
 */
export type ChatState = 'idle' | 'streaming' | 'thinking' | 'error';

/**
 * Provider-specific settings
 */
interface ProviderSettings {
    apiKey: string;
    model: string;
    availableModels: string[];
    lastTestResult?: {
        timestamp: number;
        success: boolean;
        message: string;
    };
}

/**
 * Plugin settings with improved type safety
 */
export interface MyPluginSettings {
    // Provider selection
    provider: 'openai' | 'anthropic' | 'gemini' | 'ollama';

    // Provider-specific settings
    openaiSettings: ProviderSettings;
    anthropicSettings: ProviderSettings;
    geminiSettings: ProviderSettings;
    ollamaSettings: {
        serverUrl: string;
        model: string;
        availableModels: string[];
        lastTestResult?: {
            timestamp: number;
            success: boolean;
            message: string;
        };
    };

    // Common settings
    systemMessage: string;
    temperature: number;
    maxTokens: number;
    includeDateWithSystemMessage: boolean;
    includeTimeWithSystemMessage: boolean;
    enableStreaming: boolean;
    autoOpenModelSettings: boolean;
    enableObsidianLinks: boolean;
    enableContextNotes: boolean;
    contextNotes: string;
    referenceCurrentNote: boolean;

    // Chat formatting
    chatSeparator: string;
    chatStartString?: string;
    chatEndString?: string;

    // Debug mode
    debugMode: boolean;
}

/**
 * Default settings
 */
export const DEFAULT_SETTINGS: MyPluginSettings = {
    provider: 'openai',
    openaiSettings: {
        apiKey: '',
        model: 'gpt-4',
        availableModels: ['gpt-4', 'gpt-4-turbo-preview', 'gpt-3.5-turbo']
    },
    anthropicSettings: {
        apiKey: '',
        model: 'claude-3-sonnet-20240229',
        availableModels: [
            'claude-3-opus-20240229',
            'claude-3-sonnet-20240229',
            'claude-3-haiku-20240307'
        ]
    },
    geminiSettings: {
        apiKey: '',
        model: 'gemini-pro',
        availableModels: ['gemini-pro']
    },
    ollamaSettings: {
        serverUrl: 'http://localhost:11434',
        model: 'llama2',
        availableModels: []
    },
    systemMessage: 'You are a helpful assistant.',
    temperature: 0.7,
    maxTokens: 2000,
    includeDateWithSystemMessage: true,
    includeTimeWithSystemMessage: false,
    enableStreaming: true,
    autoOpenModelSettings: false,
    enableObsidianLinks: true,
    enableContextNotes: false,
    contextNotes: '',
    referenceCurrentNote: false,
    chatSeparator: '----',
    debugMode: false
};
