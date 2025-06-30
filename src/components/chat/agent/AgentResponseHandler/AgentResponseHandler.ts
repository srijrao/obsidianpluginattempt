import { App } from "obsidian";
import MyPlugin from "../../../../main";
import { ToolCommand, ToolResult, Message, ReasoningData, TaskStatus, ToolExecutionResult } from "../../../../types";
import { CommandParser } from "../../CommandParser";
import { ToolRegistry } from "../ToolRegistry";
import { ToolRichDisplay } from "../ToolRichDisplay";
import { createToolInstances } from "../tools/toolcollect";
import { CONSTANTS } from "./constants";
import {
    AgentContext,
    ToolResultFormatStyle,
    NotificationType,
    TaskStatusType,
    CommandExecutionContext,
    ToolExecutionStats,
    ChatHistoryProcessingResult
} from "./types";
import { normalizePath, stringifyJson } from "./utils";
import { TaskNotificationManager } from "./TaskNotificationManager";
import { ToolResultFormatter } from "./ToolResultFormatter";
import { ToolExecutor } from "./ToolExecutor";
import { ReasoningProcessor } from "./ReasoningProcessor";
import { ToolLimitWarningUI } from "./ToolLimitWarningUI";

/**
 * Main AgentResponseHandler class, refactored for modularity.
 */
export class AgentResponseHandler {
    private commandParser: CommandParser;
    private toolRegistry: ToolRegistry;
    private executionCount: number = 0;
    private temporaryMaxToolCalls?: number;
    private toolDisplays: Map<string, ToolRichDisplay> = new Map();
    private toolMarkdownCache: Map<string, string> = new Map();
    private notificationManager: TaskNotificationManager;
    private toolResultFormatter: ToolResultFormatter;
    private toolExecutor: ToolExecutor;
    private reasoningProcessor: ReasoningProcessor;
    private toolLimitWarningUI: ToolLimitWarningUI;

    constructor(private context: AgentContext) {
        this.debugLog("constructor called");
        this.commandParser = new CommandParser(this.context.plugin);
        this.toolRegistry = new ToolRegistry(this.context.plugin);
        this.notificationManager = new TaskNotificationManager(context);
        this.toolResultFormatter = new ToolResultFormatter();
        this.toolExecutor = new ToolExecutor(
            this.toolRegistry,
            (result, command) => this.context.onToolResult(result, command),
            (command, result) => this.createToolDisplay(command, result)
        );
        this.reasoningProcessor = new ReasoningProcessor(context);
        this.toolLimitWarningUI = new ToolLimitWarningUI(this as any); 
        this.initializeTools();
    }

    getContext(): AgentContext {
        return this.context;
    }

    private debugLog(message: string, data?: any, contextLabel: string = "AgentResponseHandler"): void {
        if (this.context.plugin?.settings?.debugMode && typeof this.context.plugin.debugLog === "function") {
            this.context.plugin.debugLog("debug", `[${contextLabel}] ${message}`, data);
        }
    }

    private initializeTools(): void {
        this.debugLog("initializeTools called");
        const tools = createToolInstances(this.context.app, this.context.plugin);
        for (const tool of tools) {
            this.toolRegistry.register(tool);
        }
    }

    async processResponse(
        response: string,
        contextLabel: string = "main",
        chatHistory?: any[]
    ): Promise<{
        processedText: string;
        toolResults: Array<{ command: ToolCommand; result: ToolResult }>;
        hasTools: boolean;
    }> {
        this.debugLog("Processing response", { response }, contextLabel);

        if (!this.context.plugin.isAgentModeEnabled()) {
            return this.createProcessResponseResult(response, [], false);
        }

        const { text, commands } = this.commandParser.parseResponse(response);

        if (commands.length === 0) {
            this.debugLog("No tool commands found in response", undefined, contextLabel);
            return this.createProcessResponseResult(text, [], false);
        }

        const commandsToExecute = chatHistory
            ? this.filterAlreadyExecutedCommands(commands, chatHistory, contextLabel)
            : commands;

        if (commandsToExecute.length === 0) {
            this.debugLog("All commands already executed, skipping", undefined, contextLabel);
            const existingResults = this.getExistingToolResults(commands, chatHistory || []);
            return this.createProcessResponseResult(text, existingResults, true);
        }

        const effectiveLimit = this.getEffectiveToolLimit();
        if (this.executionCount >= effectiveLimit) {
            this.debugLog("Tool execution limit reached", { executionCount: this.executionCount, effectiveLimit }, contextLabel);
            
            this.notificationManager.showTaskCompletionNotification(`Agent mode: Maximum tool calls (${effectiveLimit}) reached`, "warning");
            return this.createProcessResponseResult(
                text + `\n\n*${effectiveLimit} [Tool execution limit reached]*`,
                [],
                true
            );
        }

        return await this.executeToolCommands(commandsToExecute, text, contextLabel);
    }

    private createProcessResponseResult(
        text: string,
        toolResults: Array<{ command: ToolCommand; result: ToolResult }>,
        hasTools: boolean
    ): { processedText: string; toolResults: Array<{ command: ToolCommand; result: ToolResult }>; hasTools: boolean } {
        return {
            processedText: text,
            toolResults,
            hasTools
        };
    }

    private async executeToolCommands(
        commands: ToolCommand[],
        text: string,
        contextLabel: string
    ): Promise<{ processedText: string; toolResults: Array<{ command: ToolCommand; result: ToolResult }>; hasTools: boolean }> {
        const toolResults: Array<{ command: ToolCommand; result: ToolResult }> = [];
        const agentSettings = this.context.plugin.getAgentModeSettings();
        const effectiveLimit = this.getEffectiveToolLimit();

        for (const command of commands) {
            try {
                
                const result = await this.toolExecutor.executeToolWithLogging(command, agentSettings.timeoutMs, contextLabel, this.debugLog.bind(this));
                toolResults.push({ command, result });
                this.executionCount++;
                this.createToolDisplay(command, result);
                this.context.onToolResult(result, command);

                if (this.executionCount >= effectiveLimit) {
                    break;
                }
            } catch (error: any) {
                this.debugLog("Tool execution error", { command, error }, contextLabel);
                console.error(`AgentResponseHandler: Tool '${command.action}' failed with error:`, error);

                const errorResult = {
                    success: false,
                    error: `${CONSTANTS.ERROR_MESSAGES.TOOL_EXECUTION_FAILED}: ${error.message}`,
                    requestId: command.requestId
                };
                toolResults.push({ command, result: errorResult });
                this.createToolDisplay(command, errorResult);
                this.context.onToolResult(errorResult, command);
            }
        }

        return this.createProcessResponseResult(text, toolResults, true);
    }

    
    getExecutionCount(): number {
        return this.executionCount;
    }
    addToolExecutions(count: number) {
        const agentSettings = this.context.plugin.getAgentModeSettings();
        this.temporaryMaxToolCalls = (this.temporaryMaxToolCalls || agentSettings.maxToolCalls) + count;
    }
    resetExecutionCount(): void {
        this.executionCount = 0;
        this.temporaryMaxToolCalls = undefined;
        this.toolDisplays.clear();
        this.toolMarkdownCache.clear();
    }
    getTemporaryMaxToolCalls(): number | undefined {
        return this.temporaryMaxToolCalls;
    }

    getAvailableTools() {
        return this.toolRegistry.getAvailableTools();
    }

    getToolDisplays(): Map<string, ToolRichDisplay> {
        return new Map(this.toolDisplays);
    }

    clearToolDisplays(): void {
        this.toolDisplays.clear();
        this.toolMarkdownCache.clear();
    }

    getToolMarkdown(): string[] {
        return Array.from(this.toolMarkdownCache.values());
    }

    getCombinedToolMarkdown(): string {
        return this.getToolMarkdown().join("\n");
    }

    getExecutionStats() {
        const effectiveLimit = this.getEffectiveToolLimit();
        return {
            executionCount: this.executionCount,
            maxToolCalls: effectiveLimit,
            remaining: Math.max(0, effectiveLimit - this.executionCount)
        };
    }

    private createToolDisplay(command: ToolCommand, result: ToolResult): void {
        const displayId = this.generateDisplayId(command);

        const toolDisplay = new ToolRichDisplay({
            command,
            result,
            onRerun: () => this.rerunTool(command),
            onCopy: () => this.copyToolResult(command, result)
        });

        this.toolDisplays.set(displayId, toolDisplay);
        this.toolMarkdownCache.set(displayId, toolDisplay.toMarkdown());

        if (this.context.onToolDisplay) {
            this.context.onToolDisplay(toolDisplay);
        }

        this.cacheToolMarkdown(command, result);
    }

    private generateDisplayId(command: ToolCommand): string {
        return `${command.action}${CONSTANTS.TOOL_DISPLAY_ID_SEPARATOR}${command.requestId || Date.now()}`;
    }

    private async copyToolResult(command: ToolCommand, result: ToolResult): Promise<void> {
        const displayText = this.toolResultFormatter.formatToolResult(command, result, { style: "copy" });
        try {
            await navigator.clipboard.writeText(displayText);
        } catch (error) {
            console.error(CONSTANTS.ERROR_MESSAGES.COPY_FAILED, error);
        }
    }

    private cacheToolMarkdown(command: ToolCommand, result: ToolResult): void {
        const cacheKey = `${command.action}-${command.requestId}`;
        const statusText = result.success ? "SUCCESS" : "ERROR";
        const resultData = result.success ? stringifyJson(result.data) : result.error;

        const markdown = `### TOOL EXECUTION: ${command.action}
**Status:** ${statusText}

**Parameters:**
\`\`\`json
${stringifyJson(command.parameters)}
\`\`\`

**Result:**
\`\`\`json
${resultData}
\`\`\`
`;
        this.toolMarkdownCache.set(cacheKey, markdown);
    }

    private async rerunTool(originalCommand: ToolCommand): Promise<void> {
        try {
            const agentSettings = this.context.plugin.getAgentModeSettings();
            
            const result = await this.toolExecutor.executeToolWithLogging(originalCommand, agentSettings.timeoutMs, "rerun", this.debugLog.bind(this));
            this.createToolDisplay(originalCommand, result);
            this.context.onToolResult(result, originalCommand);
        } catch (error: any) {
            console.error(`${CONSTANTS.ERROR_MESSAGES.RERUN_FAILED} ${originalCommand.action}:`, error);
        }
    }

    private getRelativePath(filePath: string): string {
        const adapter: any = this.context.app.vault.adapter;
        const vaultRoot = adapter?.basePath ? normalizePath(adapter.basePath) : "";
        let relPath = normalizePath(filePath);

        if (vaultRoot && relPath.startsWith(vaultRoot)) {
            relPath = relPath.slice(vaultRoot.length);
            if (relPath.startsWith(CONSTANTS.PATH_SEPARATOR)) {
                relPath = relPath.slice(1);
            }
        }

        if (relPath.toLowerCase().endsWith(CONSTANTS.MD_EXTENSION)) {
            relPath = relPath.slice(0, -CONSTANTS.MD_EXTENSION.length);
        }
        return relPath;
    }

    private getEffectiveToolLimit(): number {
        const agentSettings = this.context.plugin.getAgentModeSettings();
        return this.temporaryMaxToolCalls || agentSettings.maxToolCalls;
    }

    private filterAlreadyExecutedCommands(commands: ToolCommand[], chatHistory: any[], contextLabel: string): ToolCommand[] {
        const filteredCommands: ToolCommand[] = [];

        for (const command of commands) {
            const commandKey = this.generateCommandKey(command);
            const alreadyExecuted = this.isCommandInChatHistory(commandKey, chatHistory);

            if (alreadyExecuted) {
                if (this.context.plugin.settings.debugMode) {
                    this.context.plugin.debugLog("debug", `[AgentResponseHandler][${contextLabel}] Skipping already executed command`, { command, commandKey });
                }
            } else {
                filteredCommands.push(command);
            }
        }

        return filteredCommands;
    }

    private getExistingToolResults(commands: ToolCommand[], chatHistory: any[]): Array<{ command: ToolCommand; result: ToolResult }> {
        const existingResults: Array<{ command: ToolCommand; result: ToolResult }> = [];

        for (const command of commands) {
            const commandKey = this.generateCommandKey(command);
            const existingResult = this.findToolResultInChatHistory(commandKey, chatHistory);

            if (existingResult) {
                existingResults.push({ command, result: existingResult });
            }
        }

        return existingResults;
    }

    private generateCommandKey(command: ToolCommand): string {
        const params = stringifyJson(command.parameters || {});
        return [
            command.action,
            params,
            command.requestId || "no-id"
        ].join(CONSTANTS.COMMAND_KEY_SEPARATOR);
    }

    private isCommandInChatHistory(commandKey: string, chatHistory: any[]): boolean {
        for (const message of chatHistory) {
            if (message.sender === "assistant" && message.toolResults) {
                for (const toolResult of message.toolResults) {
                    const existingKey = this.generateCommandKey(toolResult.command);
                    if (existingKey === commandKey) {
                        return true;
                    }
                }
            }
        }
        return false;
    }

    private findToolResultInChatHistory(commandKey: string, chatHistory: any[]): ToolResult | null {
        for (const message of chatHistory) {
            if (message.sender === "assistant" && message.toolResults) {
                for (const toolResult of message.toolResults) {
                    const existingKey = this.generateCommandKey(toolResult.command);
                    if (existingKey === commandKey) {
                        return toolResult.result;
                    }
                }
            }
        }
        return null;
    }

    
    isToolLimitReached(): boolean {
        const effectiveLimit = this.getEffectiveToolLimit();
        return this.executionCount >= effectiveLimit;
    }
    createToolResultMessage(toolResults: Array<{ command: ToolCommand; result: ToolResult }>): Message | null {
        return this.toolResultFormatter.createToolResultMessage(toolResults);
    }
    hideTaskProgress(): void {
        this.notificationManager.hideTaskProgress();
    }
    processResponseWithUI(
        response: string,
        contextLabel: string = "ui",
        chatHistory?: any[]
    ): Promise<{
        processedText: string;
        toolResults: Array<{ command: ToolCommand; result: ToolResult }>;
        hasTools: boolean;
        reasoning?: ReasoningData;
        taskStatus: TaskStatus;
        shouldShowLimitWarning: boolean;
    }> {
        return (async () => {
            const result = await this.processResponse(response, contextLabel, chatHistory);
            let status: TaskStatus["status"] = "completed";
            if (result.hasTools) {
                if (this.isToolLimitReached()) {
                    status = "limit_reached";
                } else {
                    status = "running";
                }
            }
            const taskStatus = this.createTaskStatus(status);
            const { reasoning } = this.reasoningProcessor.processToolResultsForMessage(result.toolResults);
            const shouldShowLimitWarning = this.isToolLimitReached() && result.hasTools;
            return {
                ...result,
                reasoning,
                taskStatus,
                shouldShowLimitWarning
            };
        })();
    }
    showTaskCompletionNotification(message: string, type: NotificationType = "success"): void {
        this.notificationManager.showTaskCompletionNotification(message, type);
    }
    createToolLimitWarning(): HTMLElement {
        return this.toolLimitWarningUI.createToolLimitWarning();
    }
    createTaskStatus(status: TaskStatus["status"], progress?: TaskStatus["progress"]): TaskStatus {
        const agentSettings = this.context.plugin.getAgentModeSettings();
        return {
            status,
            progress,
            toolExecutionCount: this.executionCount,
            maxToolExecutions: agentSettings.maxToolCalls,
            canContinue: status === "limit_reached" || status === "stopped",
            lastUpdateTime: new Date().toISOString()
        };
    }
}
