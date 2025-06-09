import { DEFAULT_TITLE_PROMPT, DEFAULT_SUMMARY_PROMPT, DEFAULT_YAML_SYSTEM_MESSAGE, DEFAULT_GENERAL_SYSTEM_PROMPT } from "./prompts";

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
 * Represents a unified model from any provider
 */
export interface UnifiedModel {
    id: string;           // Unique identifier (e.g., "openai:gpt-4", "anthropic:claude-3-5-sonnet-latest")
    name: string;         // Display name (e.g., "GPT-4 (OpenAI)", "Claude 3.5 Sonnet (Anthropic)")
    provider: 'openai' | 'anthropic' | 'gemini' | 'ollama';
    modelId: string;      // The actual model ID for the provider (e.g., "gpt-4", "claude-3-5-sonnet-latest")
}

/**
 * Represents a YAML attribute generator for the settings UI
 */
export interface YamlAttributeGenerator {
    attributeName: string; // The YAML field to insert/update
    prompt: string;        // The LLM prompt to use for generating the value
    outputMode: "clipboard" | "metadata"; // Output mode
    commandName: string;   // The name/label for the command
}

/**
 * Represents a preset for model settings
 */
export interface ModelSettingPreset {
    name: string; // Display name for the preset
    selectedModel?: string;
    systemMessage?: string;
    temperature?: number;
    maxTokens?: number;
    enableStreaming?: boolean;
    // Add more fields as needed
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

    /** Selected unified model (new unified approach) */
    selectedModel?: string; // Format: "provider:modelId" (e.g., "openai:gpt-4")
    
    /** Available unified models from all providers */
    availableModels?: UnifiedModel[];    /** OpenAI-specific settings */
    openaiSettings: {
        apiKey: string;
        baseUrl?: string;
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
    /** Output mode for generated note title: clipboard, replace-filename, or metadata */
    titleOutputMode?: "clipboard" | "replace-filename" | "metadata";
    /** Output mode for generated note summary: clipboard or metadata */
    summaryOutputMode?: "clipboard" | "metadata";
    /** The string that separates chat messages */
    chatSeparator: string;
    /** The string that starts chat messages in a note, if present */
    chatStartString?: string;
    /** The string that ends chat messages in a note, if present */
    chatEndString?: string;
    enableContextNotes: boolean;
    contextNotes: string;

    /** Prompts for title and summary generation */
    titlePrompt: string;
    summaryPrompt: string;

    /** Chat history settings */
    maxSessions: number;
    autoSaveSessions: boolean;
    sessions: ChatSession[];
    activeSessionId?: string;

    /**
     * If true, recursively expand links within fetched notes (with loop protection)
     */
    expandLinkedNotesRecursively?: boolean;

    /**
     * Maximum depth for recursively expanding linked notes. 0 = no recursion, 1 = direct links only, etc.
     */
    maxLinkExpansionDepth?: number;

    /**
     * Folder path (relative to vault root) where chat notes will be saved. If empty, saves to vault root.
     */
    chatNoteFolder?: string;

    /** YAML attribute generators for the settings UI */
    yamlAttributeGenerators?: YamlAttributeGenerator[];

    /** Stores the expanded state of provider configuration sections */
    providerConfigExpanded?: Record<string, boolean>;

    /** Stores the expanded state of general collapsible sections in settings */
    generalSectionsExpanded?: Record<string, boolean>;

    /** Model setting presets */
    modelSettingPresets?: ModelSettingPreset[];
}

/**
 * Default settings used when initializing the plugin
 */
export const DEFAULT_SETTINGS: MyPluginSettings = {
    referenceCurrentNote: false,
    provider: 'openai',
    selectedModel: undefined,
    availableModels: [],
    openaiSettings: {
        apiKey: '',
        model: 'gpt-4.1',
        availableModels: []
    },
    anthropicSettings: {
        apiKey: '',
        model: 'claude-3-5-sonnet-latest',
        availableModels: []
    },
    geminiSettings: {
        apiKey: '',
        model: 'gemini-2.5-flash-preview-05-20',
        availableModels: []
    },
    ollamaSettings: {
        serverUrl: 'http://localhost:11434',
        model: 'llama2',
        availableModels: []
    },
    systemMessage: DEFAULT_GENERAL_SYSTEM_PROMPT,
    temperature: 0.7,
    maxTokens: 1000,
    includeDateWithSystemMessage: false,
    includeTimeWithSystemMessage: false,
    enableStreaming: true,
    autoOpenModelSettings: true,
    enableObsidianLinks: true,
    titleOutputMode: "clipboard",
    summaryOutputMode: "clipboard",
    chatSeparator: '----',
    chatStartString: undefined,
    chatEndString: undefined,
    enableContextNotes: false,
    contextNotes: '',

    titlePrompt: DEFAULT_TITLE_PROMPT,
    summaryPrompt: DEFAULT_SUMMARY_PROMPT,

    maxSessions: 10,
    autoSaveSessions: true,
    sessions: [],
    activeSessionId: undefined,

    expandLinkedNotesRecursively: false,
    maxLinkExpansionDepth: 2,

    chatNoteFolder: '', // Default to vault root

    yamlAttributeGenerators: [
        {
            attributeName: "summary",
            prompt: DEFAULT_SUMMARY_PROMPT,
            outputMode: "metadata",
            commandName: "Generate YAML: summary"
        }
    ],
    providerConfigExpanded: {
        openai: false,
        anthropic: false,
        gemini: false,
        ollama: false,
    },
    generalSectionsExpanded: {
        "AI Model Settings": true,
        "Date Settings": true,
        "Note Reference Settings": true,
        "Provider Configuration": true, // For the main group of provider configs
        "AI Model Configuration": true 
    },
    modelSettingPresets: [
        {
            name: "Default",
            selectedModel: undefined,
            systemMessage: DEFAULT_GENERAL_SYSTEM_PROMPT,
            temperature: 0.7,
            maxTokens: 1000,
            enableStreaming: true
        }
    ],
};

/**
 * Represents a chat session
 * 
 * @property id - Unique identifier for the session
 * @property name - Human-readable name for the session
 * @property created - Timestamp when the session was created
 * @property lastUpdated - Timestamp when the session was last updated
 * @property messages - List of messages in the session
 */
export interface ChatSession {
    id: string;
    name: string;
    created: number;
    lastUpdated: number;
    messages: Message[];
}
