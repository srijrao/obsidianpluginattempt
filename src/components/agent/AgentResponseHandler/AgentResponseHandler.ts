import { ToolCommand, ToolResult, Message, ReasoningData, TaskStatus, ToolExecutionResult } from "../../../types";
import { CommandParser } from "../CommandParser";
import { ToolRegistry } from "../ToolRegistry";
import { ToolRichDisplay } from "../ToolRichDisplay";
import { createToolInstances } from "../tools/toolcollect";
import { CONSTANTS } from "./constants";
import {
    AgentContext,
    NotificationType,
} from "./types";
import { normalizePath, stringifyJson } from "./utils";
import { TaskNotificationManager } from "./TaskNotificationManager";
import { ToolResultFormatter } from "./ToolResultFormatter";
import { ToolExecutor } from "./ToolExecutor";
import { ReasoningProcessor } from "./ReasoningProcessor";
import { ToolLimitWarningUI } from "./ToolLimitWarningUI";

/**
 * Main AgentResponseHandler class.
 * Handles parsing, executing, and displaying tool commands in agent mode.
 * Responsible for managing tool execution limits, caching results, and updating UI.
 */
export class AgentResponseHandler {
    // Command parser for extracting tool commands from responses
    private commandParser: CommandParser;
    // Registry of available tools
    private toolRegistry: ToolRegistry;
    // Number of tool executions in the current session
    private executionCount: number = 0;
    // Temporary override for max tool calls (optional)
    private temporaryMaxToolCalls?: number;
    // Map of tool display IDs to ToolRichDisplay instances
    private toolDisplays: Map<string, ToolRichDisplay> = new Map();
    // Cache of tool markdown outputs by display ID
    private toolMarkdownCache: Map<string, string> = new Map();
    // Notification manager for task progress and completion
    private notificationManager: TaskNotificationManager;
    // Formatter for tool results
    private toolResultFormatter: ToolResultFormatter;
    // Executor for running tools
    private toolExecutor: ToolExecutor;
    // Processor for reasoning data
    private reasoningProcessor: ReasoningProcessor;
    // UI for tool limit warnings
    private toolLimitWarningUI: ToolLimitWarningUI;

    /**
     * Constructs a new AgentResponseHandler.
     * @param context AgentContext containing plugin, app, and callback references.
     */
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

    /**
     * Returns the agent context.
     */
    getContext(): AgentContext {
        return this.context;
    }

    /**
     * Logs debug messages if debug mode is enabled.
     * @param message The message to log.
     * @param data Optional data to log.
     * @param contextLabel Optional label for the log context.
     */
    private debugLog(message: string, data?: any, contextLabel: string = "AgentResponseHandler"): void {
        if (this.context.plugin?.settings?.debugMode && typeof this.context.plugin.debugLog === "function") {
            this.context.plugin.debugLog("debug", `[${contextLabel}] ${message}`, data);
        }
    }

    /**
     * Initializes and registers all available tools.
     */
    private initializeTools(): void {
        this.debugLog("initializeTools called");
        const tools = createToolInstances(this.context.app, this.context.plugin);
        for (const tool of tools) {
            this.toolRegistry.register(tool);
        }
    }

    /**
     * Processes a response string, parses tool commands, executes them if needed,
     * and returns processed text and tool results.
     * @param response The response string from the agent.
     * @param contextLabel Optional label for logging context.
     * @param chatHistory Optional chat history for deduplication.
     */
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

        // If agent mode is disabled, return the raw response.
        if (!this.context.plugin.agentModeManager.isAgentModeEnabled()) {
            return this.createProcessResponseResult(response, [], false);
        }

        // Parse the response for tool commands.
        const { text, commands } = this.commandParser.parseResponse(response);

        // If no commands found, return the text as-is.
        if (commands.length === 0) {
            this.debugLog("No tool commands found in response", undefined, contextLabel);
            return this.createProcessResponseResult(text, [], false);
        }

        // Filter out commands already executed in chat history.
        const commandsToExecute = chatHistory
            ? this.filterAlreadyExecutedCommands(commands, chatHistory, contextLabel)
            : commands;

        // If all commands already executed, return their previous results.
        if (commandsToExecute.length === 0) {
            this.debugLog("All commands already executed, skipping", undefined, contextLabel);
            const existingResults = this.getExistingToolResults(commands, chatHistory || []);
            return this.createProcessResponseResult(text, existingResults, true);
        }

        // Check tool execution limit.
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

        // Execute the new tool commands.
        return await this.executeToolCommands(commandsToExecute, text, contextLabel);
    }

    /**
     * Helper to create the result object for processResponse.
     */
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

    /**
     * Executes a list of tool commands, respecting the tool execution limit.
     * @param commands Array of ToolCommand objects to execute.
     * @param text The processed text to return.
     * @param contextLabel Logging context label.
     */
    private async executeToolCommands(
        commands: ToolCommand[],
        text: string,
        contextLabel: string
    ): Promise<{ processedText: string; toolResults: Array<{ command: ToolCommand; result: ToolResult }>; hasTools: boolean }> {
        const toolResults: Array<{ command: ToolCommand; result: ToolResult }> = [];
        const agentSettings = this.context.plugin.agentModeManager.getAgentModeSettings();
        const effectiveLimit = this.getEffectiveToolLimit();

        for (const command of commands) {
            try {
                // Execute the tool and collect the result.
                const result = await this.toolExecutor.executeToolWithLogging(command, agentSettings.timeoutMs, contextLabel, this.debugLog.bind(this));
                toolResults.push({ command, result });
                this.executionCount++;
                this.createToolDisplay(command, result);
                this.context.onToolResult(result, command);

                // Stop if execution limit is reached.
                if (this.executionCount >= effectiveLimit) {
                    break;
                }
            } catch (error: any) {
                // Handle tool execution errors gracefully.
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

    /**
     * Returns the current execution count.
     */
    getExecutionCount(): number {
        return this.executionCount;
    }

    /**
     * Temporarily increases the max tool call limit by a given count.
     * @param count Number of additional executions allowed.
     */
    addToolExecutions(count: number) {
        const agentSettings = this.context.plugin.agentModeManager.getAgentModeSettings();
        this.temporaryMaxToolCalls = (this.temporaryMaxToolCalls || agentSettings.maxToolCalls) + count;
    }

    /**
     * Resets the execution count and clears temporary limits and caches.
     */
    resetExecutionCount(): void {
        this.executionCount = 0;
        this.temporaryMaxToolCalls = undefined;
        this.toolDisplays.clear();
        this.toolMarkdownCache.clear();
    }

    /**
     * Returns the temporary max tool calls value, if set.
     */
    getTemporaryMaxToolCalls(): number | undefined {
        return this.temporaryMaxToolCalls;
    }

    /**
     * Returns the list of available tools.
     */
    getAvailableTools() {
        return this.toolRegistry.getAvailableTools();
    }

    /**
     * Returns a copy of the current tool displays map.
     */
    getToolDisplays(): Map<string, ToolRichDisplay> {
        return new Map(this.toolDisplays);
    }

    /**
     * Clears all tool displays and markdown caches.
     */
    clearToolDisplays(): void {
        this.toolDisplays.clear();
        this.toolMarkdownCache.clear();
    }

    /**
     * Returns an array of all tool markdown outputs.
     */
    getToolMarkdown(): string[] {
        return Array.from(this.toolMarkdownCache.values());
    }

    /**
     * Returns a single string combining all tool markdown outputs.
     */
    getCombinedToolMarkdown(): string {
        return this.getToolMarkdown().join("\n");
    }

    /**
     * Returns stats about tool executions and limits.
     */
    getExecutionStats() {
        const effectiveLimit = this.getEffectiveToolLimit();
        return {
            executionCount: this.executionCount,
            maxToolCalls: effectiveLimit,
            remaining: Math.max(0, effectiveLimit - this.executionCount)
        };
    }

    /**
     * Creates and stores a ToolRichDisplay for a tool command/result.
     * @param command The tool command.
     * @param result The tool result.
     */
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

        // Notify UI if callback is provided.
        if (this.context.onToolDisplay) {
            this.context.onToolDisplay(toolDisplay);
        }

        this.cacheToolMarkdown(command, result);
    }

    /**
     * Generates a unique display ID for a tool command.
     * @param command The tool command.
     */
    private generateDisplayId(command: ToolCommand): string {
        return `${command.action}${CONSTANTS.TOOL_DISPLAY_ID_SEPARATOR}${command.requestId || Date.now()}`;
    }

    /**
     * Copies the formatted tool result to the clipboard.
     * @param command The tool command.
     * @param result The tool result.
     */
    private async copyToolResult(command: ToolCommand, result: ToolResult): Promise<void> {
        const displayText = this.toolResultFormatter.formatToolResult(command, result, { style: "copy" });
        try {
            await navigator.clipboard.writeText(displayText);
        } catch (error) {
            console.error(CONSTANTS.ERROR_MESSAGES.COPY_FAILED, error);
        }
    }

    /**
     * Caches the markdown representation of a tool command/result.
     * @param command The tool command.
     * @param result The tool result.
     */
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

    /**
     * Reruns a tool command and updates the display/result.
     * @param originalCommand The original tool command to rerun.
     */
    private async rerunTool(originalCommand: ToolCommand): Promise<void> {
        try {
            const agentSettings = this.context.plugin.agentModeManager.getAgentModeSettings();

            const result = await this.toolExecutor.executeToolWithLogging(originalCommand, agentSettings.timeoutMs, "rerun", this.debugLog.bind(this));
            this.createToolDisplay(originalCommand, result);
            this.context.onToolResult(result, originalCommand);
        } catch (error: any) {
            console.error(`${CONSTANTS.ERROR_MESSAGES.RERUN_FAILED} ${originalCommand.action}:`, error);
        }
    }

    /**
     * Returns the effective tool execution limit (temporary or default).
     */
    private getEffectiveToolLimit(): number {
        const agentSettings = this.context.plugin.agentModeManager.getAgentModeSettings();
        return this.temporaryMaxToolCalls || agentSettings.maxToolCalls;
    }

    /**
     * Filters out tool commands that have already been executed, based on the chat history.
     * Only commands that have not been executed yet are returned.
     * 
     * @param commands - Array of ToolCommand objects to check.
     * @param chatHistory - The chat history array, containing previous messages and tool results.
     * @param contextLabel - A label for debugging/logging context.
     * @returns Array of ToolCommand objects that have not been executed yet.
     */
    private filterAlreadyExecutedCommands(commands: ToolCommand[], chatHistory: any[], contextLabel: string): ToolCommand[] {
        const filteredCommands: ToolCommand[] = [];

        for (const command of commands) {
            // Generate a unique key for the command based on its action, parameters, and requestId.
            const commandKey = this.generateCommandKey(command);
            // Check if this command has already been executed in the chat history.
            const alreadyExecuted = this.isCommandInChatHistory(commandKey, chatHistory);

            if (alreadyExecuted) {
                // If debug mode is enabled, log that this command is being skipped.
                if (this.context.plugin.settings.debugMode) {
                    this.context.plugin.debugLog(
                        "debug",
                        `[AgentResponseHandler][${contextLabel}] Skipping already executed command`,
                        { command, commandKey }
                    );
                }
            } else {
                // Only add commands that have not been executed.
                filteredCommands.push(command);
            }
        }

        return filteredCommands;
    }

    /**
     * Retrieves the existing tool results for the given commands from the chat history.
     * This is used to avoid re-executing commands and to provide their previous results.
     * 
     * @param commands - Array of ToolCommand objects to look up.
     * @param chatHistory - The chat history array, containing previous messages and tool results.
     * @returns Array of objects containing the command and its corresponding ToolResult.
     */
    private getExistingToolResults(commands: ToolCommand[], chatHistory: any[]): Array<{ command: ToolCommand; result: ToolResult }> {
        const existingResults: Array<{ command: ToolCommand; result: ToolResult }> = [];

        for (const command of commands) {
            // Generate a unique key for the command.
            const commandKey = this.generateCommandKey(command);
            // Try to find the result for this command in the chat history.
            const existingResult = this.findToolResultInChatHistory(commandKey, chatHistory);

            if (existingResult) {
                // If found, add the command and its result to the results array.
                existingResults.push({ command, result: existingResult });
            }
        }

        return existingResults;
    }

    /**
     * Generates a unique key for a tool command based on action, parameters, and requestId.
     * @param command The tool command.
     */
    private generateCommandKey(command: ToolCommand): string {
        const params = stringifyJson(command.parameters || {});
        return [
            command.action,
            params,
            command.requestId || "no-id"
        ].join(CONSTANTS.COMMAND_KEY_SEPARATOR);
    }

    /**
     * Checks if a command (by key) is present in the chat history.
     * @param commandKey The unique command key.
     * @param chatHistory The chat history array.
     */
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

    /**
     * Finds the tool result for a command key in the chat history.
     * @param commandKey The unique command key.
     * @param chatHistory The chat history array.
     */
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

    /**
     * Returns true if the tool execution limit has been reached.
     */
    isToolLimitReached(): boolean {
        const effectiveLimit = this.getEffectiveToolLimit();
        return this.executionCount >= effectiveLimit;
    }

    /**
     * Creates a Message object for tool results, or null if none.
     * @param toolResults Array of tool command/result pairs.
     */
    createToolResultMessage(toolResults: Array<{ command: ToolCommand; result: ToolResult }>): Message | null {
        return this.toolResultFormatter.createToolResultMessage(toolResults);
    }

    /**
     * Hides any task progress notifications.
     */
    hideTaskProgress(): void {
        this.notificationManager.hideTaskProgress();
    }

    /**
     * Processes a response and returns UI-related data, including reasoning and task status.
     * @param response The response string.
     * @param contextLabel Optional context label.
     * @param chatHistory Optional chat history.
     */
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
                // Check if any tools are pending user feedback
                const hasPendingFeedback = result.toolResults.some(tr => 
                    tr.command.action === 'get_user_feedback' && 
                    tr.result.success && 
                    tr.result.data?.status === 'pending'
                );
                
                if (hasPendingFeedback) {
                    status = "waiting_for_user";
                } else if (this.isToolLimitReached()) {
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

    /**
     * Creates a TaskStatus object with the given status and current execution state.
     * @param status The task status
     * @returns TaskStatus object
     */
    private createTaskStatus(status: TaskStatus["status"]): TaskStatus {
        const agentSettings = this.context.plugin.agentModeManager.getAgentModeSettings();
        return {
            status,
            toolExecutionCount: this.executionCount,
            maxToolExecutions: this.getEffectiveToolLimit(),
            canContinue: status === "running" || status === "waiting_for_user",
            lastUpdateTime: new Date().toISOString()
        };
    }

    /**
     * Shows a task completion notification.
     * @param message The message to display.
     * @param type Notification type ("success", "warning", etc).
     */
    showTaskCompletionNotification(message: string, type: NotificationType = "success"): void {
        this.notificationManager.showTaskCompletionNotification(message, type);
    }

    /**
     * Creates a tool limit warning UI element.
     * @returns HTMLElement containing the tool limit warning interface
     */
    createToolLimitWarning(): HTMLElement {
        return this.toolLimitWarningUI.createToolLimitWarning();
    }

    /**
     * Updates an existing tool display with a new result.
     * @param command The tool command
     * @param result The updated result
     */
    private updateToolDisplay(command: ToolCommand, result: ToolResult): void {
        const displayId = this.generateDisplayId(command);
        const existingDisplay = this.toolDisplays.get(displayId);
        
        if (existingDisplay) {
            // Update the existing display with the new result
            existingDisplay.updateResult(result);
            // Update the markdown cache as well
            this.toolMarkdownCache.set(displayId, existingDisplay.toMarkdown());
        } else {
            // If no existing display, create a new one
            this.createToolDisplay(command, result);
        }
    }
}
