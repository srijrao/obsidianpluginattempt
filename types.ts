/**
 * AI Assistant Plugin Types
 * 
 * This file contains the core types and interfaces used throughout the plugin.
 * These definitions ensure consistency across different AI providers and
 * make the code more maintainable and type-safe.
 */

/**
 * Represents a chat message in a conversation
 * 
 * @property role - Who sent the message ('system', 'user', or 'assistant')
 * @property content - The actual text content of the message
 */
export interface Message {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

/**
 * Options for generating AI completions
 * 
 * These settings control how the AI generates its response.
 * Not all options are supported by all providers.
 */
export interface CompletionOptions {
    temperature?: number;
    maxTokens?: number;
    streamCallback?: (chunk: string) => void;
    abortController?: AbortController;
}

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
 * Plugin Settings
 * 
 * These settings control how the AI Assistant plugin works.
 * They are saved between sessions and can be configured in the settings tab.
 */
export interface MyPluginSettings {
    /** Which AI provider to use */
    provider: 'openai' | 'anthropic' | 'gemini' | 'ollama';
    referenceCurrentNote: boolean;

    /** OpenAI-specific settings */
    openaiSettings: {
        apiKey: string;
        model: string;
        availableModels: string[];
        lastTestResult?: {
            timestamp: number;
            success: boolean;
            message: string;
        };
    };

    /** Anthropic-specific settings */
    anthropicSettings: {
        apiKey: string;
        model: string;
        availableModels: string[];
        lastTestResult?: {
            timestamp: number;
            success: boolean;
            message: string;
        };
    };

    /** Google Gemini-specific settings */
    geminiSettings: {
        apiKey: string;
        model: string;
        availableModels: string[];
        lastTestResult?: {
            timestamp: number;
            success: boolean;
            message: string;
        };
    };

    /** Ollama-specific settings */
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

    /** Settings that apply to all providers */
    systemMessage: string;
    temperature: number;
    maxTokens: number;
    includeDateWithSystemMessage: boolean;
    includeTimeWithSystemMessage: boolean;
    enableStreaming: boolean;
    autoOpenModelSettings: boolean;
    enableObsidianLinks: boolean;
    /** The string that separates chat messages */
    chatSeparator: string;
    /** The string that starts chat messages in a note, if present */
    chatStartString?: string;
    /** The string that ends chat messages in a note, if present */
    chatEndString?: string;
    enableContextNotes: boolean;
    contextNotes: string;
}

/**
 * Default settings used when initializing the plugin
 */
export const DEFAULT_SETTINGS: MyPluginSettings = {
    referenceCurrentNote: false,
    provider: 'openai',
    openaiSettings: {
        apiKey: '',
        model: 'gpt-4o-mini',
        availableModels: []
    },
    anthropicSettings: {
        apiKey: '',
        model: 'claude-3-5-sonnet-latest',
        availableModels: []
    },
    geminiSettings: {
        apiKey: '',
        model: 'gemini-pro',
        availableModels: []
    },
    ollamaSettings: {
        serverUrl: 'http://localhost:11434',
        model: 'llama2',
        availableModels: []
    },
    systemMessage: 'You are a helpful assistant.',
    temperature: 0.7,
    maxTokens: 1000,
    includeDateWithSystemMessage: false,
    includeTimeWithSystemMessage: false,
    enableStreaming: true,
    autoOpenModelSettings: true,
    enableObsidianLinks: true,
    chatSeparator: '----',
    chatStartString: undefined,
    chatEndString: undefined,
    enableContextNotes: false,
    contextNotes: ''
};
