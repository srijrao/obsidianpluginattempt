import { DEFAULT_TITLE_PROMPT, DEFAULT_SUMMARY_PROMPT, DEFAULT_YAML_SYSTEM_MESSAGE, DEFAULT_GENERAL_SYSTEM_PROMPT } from "../promptConstants";
import { AgentModeSettings, UnifiedModel, ChatSession } from "../types";

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
    availableModels?: UnifiedModel[];

    /** OpenAI-specific settings */
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
    apiKeysExpanded?: Record<string, boolean>;
    modelManagementExpanded?: Record<string, boolean>;
    agentConfigExpanded?: Record<string, boolean>;
    contentChatExpanded?: Record<string, boolean>;
    dataHandlingExpanded?: Record<string, boolean>;
    pluginBehaviorExpanded?: Record<string, boolean>;
    backupManagementExpanded?: Record<string, boolean>;

    /** Model setting presets */
    modelSettingPresets?: ModelSettingPreset[];

    /** Agent Mode settings */
    agentMode?: AgentModeSettings;

    /** Custom agent system message template - if provided, replaces the default agent system message */
    customAgentSystemMessage?: string;

    /** UI Behavior settings */
    uiBehavior?: UIBehaviorSettings;

    /**
     * Map of tool name to enabled/disabled state. If false, tool is disabled.
     */
    enabledTools?: Record<string, boolean>;

    /**
     * Map of model id (provider:model) to enabled/disabled state. If false, model is hidden from selection menus.
     */
    enabledModels?: Record<string, boolean>;

    /** Debug mode for verbose logging and UI */
    debugMode?: boolean;

    // Debug: Log when agent mode or tool settings are changed
}

/**
 * Settings for UI behavior and user experience enhancements
 */
export interface UIBehaviorSettings {
    /** Always show reasoning in collapsed state for older messages */
    collapseOldReasoning?: boolean;
    /** Show completion notifications */
    showCompletionNotifications?: boolean;
    /** Include reasoning in exports and copies */
    includeReasoningInExports?: boolean;
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
    autoOpenModelSettings: false,
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
    apiKeysExpanded: {},
    modelManagementExpanded: {},
    agentConfigExpanded: {},
    contentChatExpanded: {},
    dataHandlingExpanded: {},
    pluginBehaviorExpanded: {},
    backupManagementExpanded: {},
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
    customAgentSystemMessage: undefined, // Use default agent system message
    uiBehavior: {
        collapseOldReasoning: true,
        showCompletionNotifications: true,
        includeReasoningInExports: true
    },
    enabledTools: {},
    enabledModels: {},
    debugMode: false,
    agentMode: {
        enabled: false,
        maxToolCalls: 10,
        timeoutMs: 30000,
        maxIterations: 3
    },
};
