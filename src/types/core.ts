import { DEFAULT_TITLE_PROMPT, DEFAULT_SUMMARY_PROMPT, DEFAULT_YAML_SYSTEM_MESSAGE, DEFAULT_GENERAL_SYSTEM_PROMPT } from "../promptConstants";
import { ToolExecutionResult, TaskStatus } from "../types";

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
 * @property reasoning - Optional structured reasoning/planning data for assistant messages
 * @property toolResults - Optional tool execution results for assistant messages
 * @property taskStatus - Optional task status information
 */
export interface Message {
    role: 'system' | 'user' | 'assistant';
    content: string;
    reasoning?: ReasoningData;
    toolResults?: ToolExecutionResult[];
    taskStatus?: TaskStatus;
}

/**
 * Represents reasoning/planning data attached to a message
 * 
 * Debug: Log when reasoning data is created or updated
 */
export interface ReasoningData {
    id: string;
    timestamp: string;
    type: 'simple' | 'structured';
    problem?: string;
    steps?: ReasoningStep[];
    summary?: string;
    confidence?: number;
    depth?: 'shallow' | 'medium' | 'deep';
    isCollapsed?: boolean;
}

/**
 * Represents a single reasoning step
 */
export interface ReasoningStep {
    step: number;
    category: 'analysis' | 'planning' | 'problem-solving' | 'reflection' | 'conclusion' | 'reasoning' | 'information' | 'approach' | 'evaluation' | 'synthesis' | 'validation' | 'refinement';
    title: string;
    content: string;
    confidence: number;
}

/**
 * Options for generating AI completions
 * 
 * These settings control how the AI generates its response.
 * Not all options are supported by all providers.
 */
export interface CompletionOptions {
    temperature?: number;
    streamCallback?: (chunk: string) => void;
    abortController?: AbortController;
}
