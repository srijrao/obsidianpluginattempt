import { DEFAULT_TITLE_PROMPT, DEFAULT_SUMMARY_PROMPT, DEFAULT_YAML_SYSTEM_MESSAGE, DEFAULT_GENERAL_SYSTEM_PROMPT } from "../promptConstants";
import { AgentModeSettings, UnifiedModel, ChatSession } from "../types";

/**
 * Represents a YAML attribute generator for the settings UI.
 * This interface defines the structure for generating YAML attributes dynamically.
 */
export interface YamlAttributeGenerator {
    /** The name of the YAML attribute to be generated (e.g., "summary", "tags"). */
    attributeName: string; 
    /** The prompt used to generate the content for the attribute. */
    prompt: string;        
    /**
     * The output mode for the generated attribute.
     * - "clipboard": Copies the generated content to the clipboard.
     * - "metadata": Inserts the generated content into the note's YAML frontmatter.
     */
    outputMode: "clipboard" | "metadata"; 
    /** The command name that will trigger this generator in Obsidian. */
    commandName: string;   
}

/**
 * Represents a preset for model settings.
 * Users can define and save different configurations for AI models.
 */
export interface ModelSettingPreset {
    /** The name of the preset (e.g., "Concise", "Creative"). */
    name: string; 
    /** The ID of the selected unified model for this preset. */
    selectedModel?: string;
    /** The system message to be used with this preset. */
    systemMessage?: string;
    /** The temperature setting for the model, controlling randomness (0.0 to 1.0). */
    temperature?: number;
    /** The maximum number of tokens the model should generate in its response. */
    maxTokens?: number;
    /** Whether to enable streaming for this preset. */
    enableStreaming?: boolean;
    
}

/**
 * Plugin Settings
 * 
 * These settings control how the AI Assistant plugin works.
 * They are saved between sessions and can be configured in the settings tab.
 */
export interface MyPluginSettings {
    /** Which AI provider to use (e.g., 'openai', 'anthropic', 'gemini', 'ollama'). */
    provider: 'openai' | 'anthropic' | 'gemini' | 'ollama';
    /** If true, the current active note's content will be referenced in AI queries. */
    referenceCurrentNote: boolean;

    /** Selected unified model (new unified approach) across all providers. */
    selectedModel?: string; 
    
    /** Available unified models from all configured providers. */
    availableModels?: UnifiedModel[];

    /** OpenAI-specific settings. */
    openaiSettings: {
        /** OpenAI API key. */
        apiKey: string;
        /** Optional base URL for OpenAI API (for custom endpoints). */
        baseUrl?: string;
        /** The default OpenAI model to use. */
        model: string;
        /** List of available OpenAI models. */
        availableModels: string[];
        /** Last test result for API key validation. */
        lastTestResult?: {
            /** Timestamp of the last test. */
            timestamp: number;
            /** Whether the test was successful. */
            success: boolean;
            /** Message detailing the test result. */
            message: string;
        };
    };

    /** Anthropic-specific settings. */
    anthropicSettings: {
        /** Anthropic API key. */
        apiKey: string;
        /** The default Anthropic model to use. */
        model: string;
        /** List of available Anthropic models. */
        availableModels: string[];
        /** Last test result for API key validation. */
        lastTestResult?: {
            /** Timestamp of the last test. */
            timestamp: number;
            /** Whether the test was successful. */
            success: boolean;
            /** Message detailing the test result. */
            message: string;
        };
    };

    /** Google Gemini-specific settings. */
    geminiSettings: {
        /** Google Gemini API key. */
        apiKey: string;
        /** The default Google Gemini model to use. */
        model: string;
        /** List of available Google Gemini models. */
        availableModels: string[];
        /** Last test result for API key validation. */
        lastTestResult?: {
            /** Timestamp of the last test. */
            timestamp: number;
            /** Whether the test was successful. */
            success: boolean;
            /** Message detailing the test result. */
            message: string;
        };
    };

    /** Ollama-specific settings. */
    ollamaSettings: {
        /** URL of the Ollama server (e.g., 'http://localhost:11434'). */
        serverUrl: string;
        /** The default Ollama model to use. */
        model: string;
        /** List of available Ollama models. */
        availableModels: string[];
        /** Last test result for server connectivity and model availability. */
        lastTestResult?: {
            /** Timestamp of the last test. */
            timestamp: number;
            /** Whether the test was successful. */
            success: boolean;
            /** Message detailing the test result. */
            message: string;
        };
    };

    /** Settings that apply to all providers. */
    /** The default system message sent to the AI model. */
    systemMessage: string;
    /** The temperature setting for the model, controlling randomness (0.0 to 1.0). */
    temperature: number;
    /** If true, includes the current time in the system message. */
    includeTimeWithSystemMessage: boolean;
    /** If true, enables streaming responses from the AI model for a more interactive experience. */
    enableStreaming: boolean;
    /** If true, automatically opens the model settings when a new model is selected. */
    autoOpenModelSettings: boolean;
    /** If true, enables the AI to understand and generate Obsidian-style links. */
    enableObsidianLinks: boolean;
    /**
     * Output mode for generated note title.
     * - "clipboard": Copies the title to the clipboard.
     * - "replace-filename": Replaces the current note's filename with the generated title.
     * - "metadata": Inserts the title into the note's YAML frontmatter.
     */
    titleOutputMode?: "clipboard" | "replace-filename" | "metadata";
    /**
     * Output mode for generated note summary.
     * - "clipboard": Copies the summary to the clipboard.
     * - "metadata": Inserts the summary into the note's YAML frontmatter.
     */
    summaryOutputMode?: "clipboard" | "metadata";
    /** The string that separates individual chat messages in a note. */
    chatSeparator: string;
    /** The string that indicates the start of chat messages in a note. */
    chatStartString?: string;
    /** The string that indicates the end of chat messages in a note. */
    chatEndString?: string;
    /** If true, enables the use of specified context notes for AI queries. */
    enableContextNotes: boolean;
    /** A string containing paths or names of notes to be used as context. */
    contextNotes: string;

    /** Prompts for title and summary generation. */
    /** The prompt used to generate a note title. */
    titlePrompt: string;
    /** The prompt used to generate a note summary. */
    summaryPrompt: string;

    /** Chat history settings. */
    /** Maximum number of chat sessions to store. */
    maxSessions: number;
    /** If true, automatically saves chat sessions. */
    autoSaveSessions: boolean;
    /** Array of stored chat sessions. */
    sessions: ChatSession[];
    /** The ID of the currently active chat session. */
    activeSessionId?: string;

    /**
     * If true, recursively expands links within fetched notes (with loop protection)
     * when gathering context.
     */
    expandLinkedNotesRecursively?: boolean;

    /**
     * Maximum depth for recursively expanding linked notes.
     * 0 = no recursion, 1 = direct links only, etc.
     */
    maxLinkExpansionDepth?: number;

    /**
     * Folder path (relative to vault root) where chat notes will be saved.
     * If empty, saves to vault root.
     */
    chatNoteFolder?: string;

    /** YAML attribute generators for the settings UI. */
    yamlAttributeGenerators?: YamlAttributeGenerator[];

    /** Stores the expanded state of provider configuration sections in the settings UI. */
    providerConfigExpanded?: Record<string, boolean>;

    /** Stores the expanded state of general collapsible sections in settings. */
    generalSectionsExpanded?: Record<string, boolean>;
    /** Stores the expanded state of API keys sections. */
    apiKeysExpanded?: Record<string, boolean>;
    /** Stores the expanded state of model management sections. */
    modelManagementExpanded?: Record<string, boolean>;
    /** Stores the expanded state of agent configuration sections. */
    agentConfigExpanded?: Record<string, boolean>;
    /** Stores the expanded state of content and chat related sections. */
    contentChatExpanded?: Record<string, boolean>;
    /** Stores the expanded state of data handling sections. */
    dataHandlingExpanded?: Record<string, boolean>;
    /** Stores the expanded state of plugin behavior sections. */
    pluginBehaviorExpanded?: Record<string, boolean>;
    /** Stores the expanded state of backup management sections. */
    backupManagementExpanded?: Record<string, boolean>;

    /** Model setting presets defined by the user. */
    modelSettingPresets?: ModelSettingPreset[];

    /** Agent Mode settings. */
    agentMode?: AgentModeSettings;

    /** Custom agent system message template - if provided, replaces the default agent system message. */
    customAgentSystemMessage?: string;

    /** UI Behavior settings. */
    uiBehavior?: UIBehaviorSettings;

    /**
     * Map of tool name to enabled/disabled state. If false, tool is disabled.
     */
    enabledTools?: Record<string, boolean>;

    /**
     * Map of model id (provider:model) to enabled/disabled state.
     * If false, model is hidden from selection menus.
     */
    enabledModels?: Record<string, boolean>;

    /** Debug mode for verbose logging and UI. */
    debugMode?: boolean;

    
}

/**
 * Settings for UI behavior and user experience enhancements.
 */
export interface UIBehaviorSettings {
    /** If true, always show reasoning in a collapsed state for older messages in chat. */
    collapseOldReasoning?: boolean;
    /** If true, show notifications upon completion of AI tasks. */
    showCompletionNotifications?: boolean;
    /** If true, include the AI's reasoning in exported or copied content. */
    includeReasoningInExports?: boolean;
}

/**
 * Default settings used when initializing the plugin.
 * These values are applied if no user-defined settings are found.
 */
export const DEFAULT_SETTINGS: MyPluginSettings = {
    /** @inheritdoc */
    referenceCurrentNote: false,
    /** @inheritdoc */
    provider: 'openai',
    /** @inheritdoc */
    selectedModel: undefined,
    /** @inheritdoc */
    availableModels: [],
    /** @inheritdoc */
    openaiSettings: {
        apiKey: '',
        model: 'gpt-4.1',
        availableModels: []
    },
    /** @inheritdoc */
    anthropicSettings: {
        apiKey: '',
        model: 'claude-3-5-sonnet-latest',
        availableModels: []
    },
    /** @inheritdoc */
    geminiSettings: {
        apiKey: '',
        model: 'gemini-2.5-flash-preview-05-20',
        availableModels: []
    },
    /** @inheritdoc */
    ollamaSettings: {
        serverUrl: 'http://localhost:11434',
        model: 'llama2',
        availableModels: []
    },
    /** @inheritdoc */
    systemMessage: DEFAULT_GENERAL_SYSTEM_PROMPT,
    /** @inheritdoc */
    temperature: 0.7,
    /** @inheritdoc */
    includeTimeWithSystemMessage: false,
    /** @inheritdoc */
    enableStreaming: true,
    /** @inheritdoc */
    autoOpenModelSettings: false,
    /** @inheritdoc */
    enableObsidianLinks: true,
    /** @inheritdoc */
    titleOutputMode: "clipboard",
    /** @inheritdoc */
    summaryOutputMode: "clipboard",
    /** @inheritdoc */
    chatSeparator: '----',
    /** @inheritdoc */
    chatStartString: undefined,
    /** @inheritdoc */
    chatEndString: undefined,
    /** @inheritdoc */
    enableContextNotes: false,
    /** @inheritdoc */
    contextNotes: '',

    /** @inheritdoc */
    titlePrompt: DEFAULT_TITLE_PROMPT,
    /** @inheritdoc */
    summaryPrompt: DEFAULT_SUMMARY_PROMPT,

    /** @inheritdoc */
    maxSessions: 10,
    /** @inheritdoc */
    autoSaveSessions: true,
    /** @inheritdoc */
    sessions: [],
    /** @inheritdoc */
    activeSessionId: undefined,

    /** @inheritdoc */
    expandLinkedNotesRecursively: false,
    /** @inheritdoc */
    maxLinkExpansionDepth: 2,

    /** @inheritdoc */
    chatNoteFolder: '', 

    /** @inheritdoc */
    yamlAttributeGenerators: [
        {
            attributeName: "summary",
            prompt: DEFAULT_SUMMARY_PROMPT,
            outputMode: "metadata",
            commandName: "Generate YAML: summary"
        }
    ],
    /** @inheritdoc */
    providerConfigExpanded: {
        openai: false,
        anthropic: false,
        gemini: false,
        ollama: false,
    },
    /** @inheritdoc */
    generalSectionsExpanded: {
        "AI Model Settings": true,
        "Date Settings": true,
        "Note Reference Settings": true,
        "Provider Configuration": true, 
        "AI Model Configuration": true
    },
    /** @inheritdoc */
    apiKeysExpanded: {},
    /** @inheritdoc */
    modelManagementExpanded: {},
    /** @inheritdoc */
    agentConfigExpanded: {},
    /** @inheritdoc */
    contentChatExpanded: {},
    /** @inheritdoc */
    dataHandlingExpanded: {},
    /** @inheritdoc */
    pluginBehaviorExpanded: {},
    /** @inheritdoc */
    backupManagementExpanded: {},
    /** @inheritdoc */
    modelSettingPresets: [
        {
            name: "Default",
            selectedModel: undefined,
            systemMessage: DEFAULT_GENERAL_SYSTEM_PROMPT,
            temperature: 0.0,
            enableStreaming: true
        }
    ],
    /** @inheritdoc */
    customAgentSystemMessage: undefined, 
    /** @inheritdoc */
    uiBehavior: {
        collapseOldReasoning: true,
        showCompletionNotifications: true,
        includeReasoningInExports: true
    },
    /** @inheritdoc */
    enabledTools: {},
    /** @inheritdoc */
    enabledModels: {},
    /** @inheritdoc */
    debugMode: false,
    /** @inheritdoc */
    agentMode: {
        enabled: false,
        maxToolCalls: 10,
        timeoutMs: 30000,
        maxIterations: 10
    },
};
