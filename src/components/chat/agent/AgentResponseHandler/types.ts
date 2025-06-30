import { App } from "obsidian";
import MyPlugin from "../../../../main";
import { ToolCommand, ToolResult, Message, ReasoningData, TaskStatus, ToolExecutionResult } from "../../../../types";
import { ToolRichDisplay } from "../ToolRichDisplay";

/**
 * Context object passed to AgentResponseHandler and related modules.
 */
export interface AgentContext {
    app: App;
    plugin: MyPlugin;
    messagesContainer: HTMLElement;
    toolContinuationContainer?: HTMLElement; 
    onToolResult: (toolResult: ToolResult, command: ToolCommand) => void;
    onToolDisplay?: (display: ToolRichDisplay) => void;
}

export interface AgentContextWithToolLimit extends AgentContext {
    getExecutionCount: () => number;
    addToolExecutions: (count: number) => void;
    resetExecutionCount: () => void;
    getTemporaryMaxToolCalls: () => number | undefined;
}

export type ToolResultFormatStyle = "markdown" | "copy" | "plain";
export type NotificationType = "success" | "error" | "warning";
export type TaskStatusType = TaskStatus["status"];

export interface CommandExecutionContext {
    commands: ToolCommand[];
    text: string;
    contextLabel: string;
    effectiveLimit: number;
    agentSettings: any;
}

export interface ToolExecutionStats {
    executionCount: number;
    maxToolCalls: number;
    remaining: number;
}

export interface ChatHistoryProcessingResult {
    commandsToExecute: ToolCommand[];
    existingResults: Array<{ command: ToolCommand; result: ToolResult }>;
}
