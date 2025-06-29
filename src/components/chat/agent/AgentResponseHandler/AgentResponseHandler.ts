import { App, Notice, MarkdownRenderer } from "obsidian";
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

    constructor(private context: AgentContext) {
        this.debugLog("constructor called");
        this.commandParser = new CommandParser(this.context.plugin);
        this.toolRegistry = new ToolRegistry(this.context.plugin);
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
            new Notice(`Agent mode: Maximum tool calls (${effectiveLimit}) reached`);
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
                const result = await this.executeToolWithLogging(command, agentSettings.timeoutMs, contextLabel);
                this.handleToolExecutionSuccess(command, result, toolResults);

                if (this.executionCount >= effectiveLimit) {
                    break;
                }
            } catch (error: any) {
                this.handleToolExecutionError(command, error, toolResults, contextLabel);
            }
        }

        return this.createProcessResponseResult(text, toolResults, true);
    }

    private async executeToolWithLogging(command: ToolCommand, timeoutMs: number, contextLabel: string): Promise<ToolResult> {
        const startTime = Date.now();
        this.debugLog("Executing tool", { command }, contextLabel);

        const result = await this.executeToolWithTimeout(command, timeoutMs);
        const executionTime = Date.now() - startTime;

        this.debugLog("Tool execution result", { command, result, executionTime }, contextLabel);
        return result;
    }

    private handleToolExecutionSuccess(
        command: ToolCommand,
        result: ToolResult,
        toolResults: Array<{ command: ToolCommand; result: ToolResult }>
    ): void {
        toolResults.push({ command, result });
        this.executionCount++;
        this.createToolDisplay(command, result);
        this.context.onToolResult(result, command);
    }

    private handleToolExecutionError(
        command: ToolCommand,
        error: any,
        toolResults: Array<{ command: ToolCommand; result: ToolResult }>,
        contextLabel: string
    ): void {
        this.debugLog("Tool execution error", { command, error }, contextLabel);
        console.error(`AgentResponseHandler: Tool '${command.action}' failed with error:`, error);

        const errorResult = this.createErrorResult(command, error);
        this.handleToolExecutionSuccess(command, errorResult, toolResults);
    }

    private createErrorResult(command: ToolCommand, error: any): ToolResult {
        return {
            success: false,
            error: `${CONSTANTS.ERROR_MESSAGES.TOOL_EXECUTION_FAILED}: ${error.message}`,
            requestId: command.requestId
        };
    }

    private async executeToolWithTimeout(command: ToolCommand, timeoutMs: number): Promise<ToolResult> {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error(`${CONSTANTS.ERROR_MESSAGES.TOOL_EXECUTION_TIMEOUT} after ${timeoutMs}ms`));
            }, timeoutMs);

            this.toolRegistry.execute(command)
                .then(result => {
                    clearTimeout(timeout);
                    resolve(result);
                })
                .catch(error => {
                    clearTimeout(timeout);
                    reject(error);
                });
        });
    }

    resetExecutionCount(): void {
        this.executionCount = 0;
        this.temporaryMaxToolCalls = undefined;
        this.toolDisplays.clear();
        this.toolMarkdownCache.clear();
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

    private formatToolResult(
        command: ToolCommand,
        result: ToolResult,
        opts?: { style?: ToolResultFormatStyle }
    ): string {
        const style = opts?.style || "plain";
        const status = this.getStatusIcon(result.success, style);
        const action = command.action.replace("_", " ");
        const context = this.getResultContext(command, result);

        switch (style) {
            case "markdown":
                return `${status} **${action}** completed successfully${context}`;
            case "copy":
                return this.formatToolResultForCopy(command, result, status);
            default:
                return this.formatToolResultPlain(command, result, status);
        }
    }

    private getStatusIcon(success: boolean, style: ToolResultFormatStyle): string {
        if (success) {
            return style === "markdown" ? "✅" : style === "copy" ? "SUCCESS" : "✓";
        } else {
            return style === "markdown" ? "❌" : style === "copy" ? "ERROR" : "✗";
        }
    }

    private getResultContext(command: ToolCommand, result: ToolResult): string {
        if (!result.success || !result.data) return "";

        switch (command.action) {
            case "file_write":
            case "file_read":
            case "file_diff":
                if (result.data.filePath) {
                    const relPath = this.getRelativePath(result.data.filePath);
                    return ` [[${relPath}]]`;
                }
                break;
            case "file_select":
                if (result.data.count !== undefined) {
                    return ` [[${result.data.count} files found]]`;
                }
                break;
            case "thought":
                if (result.data?.formattedThought) {
                    return result.data.formattedThought;
                }
                break;
        }
        return "";
    }

    private formatToolResultForCopy(command: ToolCommand, result: ToolResult, status: string): string {
        const params = stringifyJson(command.parameters);
        const resultData = result.success
            ? stringifyJson(result.data)
            : result.error;

        return `TOOL EXECUTION: ${command.action}
STATUS: ${status}
PARAMETERS:
${params}
RESULT:
${resultData}`;
    }

    private formatToolResultPlain(command: ToolCommand, result: ToolResult, status: string): string {
        const data = result.success ? stringifyJson(result.data) : result.error;
        return `${status} Tool: ${command.action}\nParameters: ${stringifyJson(command.parameters)}\nResult: ${data}`;
    }

    formatToolResultsForDisplay(toolResults: Array<{ command: ToolCommand; result: ToolResult }>): string {
        if (toolResults.length === 0) {
            return "";
        }
        const resultText = toolResults.map(({ command, result }) =>
            this.formatToolResult(command, result, { style: "markdown" })
        ).join("\n");
        return `\n\n**Tool Execution:**\n${resultText}`;
    }

    createToolResultMessage(toolResults: Array<{ command: ToolCommand; result: ToolResult }>): Message | null {
        if (toolResults.length === 0) {
            return null;
        }
        const resultText = toolResults.map(({ command, result }) =>
            this.formatToolResult(command, result, { style: "plain" })
        ).join("\n\n");
        return {
            role: "system",
            content: `Tool execution results:\n\n${resultText}`
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
        const displayText = this.formatToolResult(command, result, { style: "copy" });
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
            const result = await this.executeToolWithTimeout(originalCommand, agentSettings.timeoutMs);
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

    processToolResultsForMessage(toolResults: Array<{ command: ToolCommand; result: ToolResult }>): {
        reasoning?: ReasoningData;
        toolExecutionResults: ToolExecutionResult[];
    } {
        const toolExecutionResults: ToolExecutionResult[] = toolResults.map(({ command, result }) => ({
            command,
            result,
            timestamp: new Date().toISOString()
        }));

        let reasoning: ReasoningData | undefined;

        for (const { command, result } of toolResults) {
            if (command.action === "thought" && result.success && result.data) {
                reasoning = this.convertThoughtToolResultToReasoning(result.data);
                break;
            }
        }

        return {
            reasoning,
            toolExecutionResults
        };
    }

    private convertThoughtToolResultToReasoning(thoughtData: any): ReasoningData {
        const reasoningId = this.generateReasoningId();
        const baseData = {
            id: reasoningId,
            timestamp: thoughtData.timestamp || new Date().toISOString(),
            isCollapsed: this.context.plugin.settings.uiBehavior?.collapseOldReasoning || false
        };

        if (thoughtData.reasoning === "structured" && thoughtData.steps) {
            return {
                ...baseData,
                type: "structured",
                problem: thoughtData.problem,
                steps: thoughtData.steps.map((step: any) => ({
                    step: step.step,
                    title: step.title,
                    content: step.content
                })),
                depth: thoughtData.depth
            };
        } else {
            return {
                ...baseData,
                type: "simple",
                summary: thoughtData.thought || thoughtData.formattedThought
            };
        }
    }

    private generateReasoningId(): string {
        const timestamp = Date.now();
        const random = Math.random().toString(36).substr(2, 9);
        return `${CONSTANTS.REASONING_ID_PREFIX}${timestamp}-${random}`;
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

    isToolLimitReached(): boolean {
        const effectiveLimit = this.getEffectiveToolLimit();
        return this.executionCount >= effectiveLimit;
    }

    getRemainingToolExecutions(): number {
        const effectiveLimit = this.getEffectiveToolLimit();
        return Math.max(0, effectiveLimit - this.executionCount);
    }

    private hideToolContinuationContainerIfEmpty(): void {
        if (this.context.toolContinuationContainer) {
            if (this.context.toolContinuationContainer.children.length === 0) {
                this.context.toolContinuationContainer.style.display = "none";
            }
        }
    }

    createToolLimitWarning(): HTMLElement {
        const warning = document.createElement("div");
        warning.className = "tool-limit-warning";

        const agentSettings = this.context.plugin.getAgentModeSettings();
        const effectiveLimit = this.getEffectiveToolLimit();

        warning.innerHTML = this.createToolLimitWarningHTML(effectiveLimit, agentSettings.maxToolCalls);
        this.attachToolLimitWarningHandlers(warning, agentSettings);

        return warning;
    }

    private createToolLimitWarningHTML(effectiveLimit: number, maxToolCalls: number): string {
        return `
            <div class="tool-limit-warning-text">
                <strong>⚠️ Tool execution limit reached</strong><br>
                Used ${this.executionCount}/${effectiveLimit} tool calls. 
                Choose how to proceed:
            </div>
            <div class="tool-limit-warning-actions">
                <div class="tool-limit-input-group">
                    <label for="additional-tools">Add more executions:</label>
                    <input type="number" id="additional-tools" min="1" max="${CONSTANTS.MAX_ADDITIONAL_TOOLS}" value="${maxToolCalls}" placeholder="5">
                    <button class="ai-chat-add-tools-button">Add & Continue</button>
                </div>
                <div class="tool-limit-button-group">
                    <button class="ai-chat-continue-button">Reset & Continue</button>
                    <span class="tool-limit-settings-link">Open Settings</span>
                </div>
            </div>
        `;
    }

    private attachToolLimitWarningHandlers(warning: HTMLElement, agentSettings: any): void {
        this.attachSettingsHandler(warning);
        this.attachAddToolsHandler(warning, agentSettings);
        this.attachContinueHandler(warning);
    }

    private attachSettingsHandler(warning: HTMLElement): void {
        const settingsLink = warning.querySelector(".tool-limit-settings-link") as HTMLElement;
        if (settingsLink) {
            settingsLink.onclick = () => {
                (this.context.app as any).setting.open();
                (this.context.app as any).setting.openTabById(this.context.plugin.manifest.id);
            };
        }
    }

    private attachAddToolsHandler(warning: HTMLElement, agentSettings: any): void {
        const addToolsButton = warning.querySelector(".ai-chat-add-tools-button") as HTMLElement;
        if (addToolsButton) {
            addToolsButton.onclick = () => {
                const input = warning.querySelector("#additional-tools") as HTMLInputElement;
                const additionalTools = parseInt(input.value) || agentSettings.maxToolCalls;

                if (additionalTools > 0) {
                    this.addToolExecutions(additionalTools);
                    this.removeWarningAndTriggerContinuation(warning, "continueTaskWithAdditionalTools", { additionalTools });
                }
            };
        }
    }

    private attachContinueHandler(warning: HTMLElement): void {
        const continueButton = warning.querySelector(".ai-chat-continue-button") as HTMLElement;
        if (continueButton) {
            continueButton.onclick = () => {
                this.resetExecutionCount();
                this.removeWarningAndTriggerContinuation(warning, "continueTask");
            };
        }
    }

    private removeWarningAndTriggerContinuation(warning: HTMLElement, eventType: string, detail?: any): void {
        warning.remove();
        this.hideToolContinuationContainerIfEmpty();

        const event = detail
            ? new CustomEvent(eventType, { detail })
            : new CustomEvent(eventType);

        this.context.messagesContainer.dispatchEvent(event);
    }

    createTaskCompletionNotification(
        message: string,
        type: NotificationType = "success"
    ): HTMLElement {
        const notification = document.createElement("div");
        notification.className = `task-completion-notification ${type}`;

        const icon = this.getNotificationIcon(type);
        notification.innerHTML = `
            <div style="display: flex; align-items: center; gap: 8px;">
                <span>${icon}</span>
                <span>${message}</span>
            </div>
        `;

        this.setupNotificationAutoRemoval(notification);
        return notification;
    }

    private getNotificationIcon(type: NotificationType): string {
        const icons = {
            success: "✅",
            error: "❌",
            warning: "⚠️"
        };
        return icons[type];
    }

    private setupNotificationAutoRemoval(notification: HTMLElement): void {
        setTimeout(() => {
            notification.classList.add("show");
        }, CONSTANTS.NOTIFICATION_DISPLAY_DELAY);

        setTimeout(() => {
            notification.classList.remove("show");
            setTimeout(() => notification.remove(), CONSTANTS.NOTIFICATION_FADE_DELAY);
        }, CONSTANTS.NOTIFICATION_AUTO_REMOVE_DELAY);
    }

    showTaskCompletionNotification(
        message: string,
        type: NotificationType = "success"
    ): void {
        if (!this.context.plugin.settings.uiBehavior?.showCompletionNotifications) {
            return;
        }

        const notification = this.createTaskCompletionNotification(message, type);
        document.body.appendChild(notification);
    }

    updateTaskProgress(current: number, total?: number, description?: string): void {
        // Progress indicator removed
    }

    hideTaskProgress(): void {
        // Progress indicator removed
    }

    async processResponseWithUI(
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

        const { reasoning } = this.processToolResultsForMessage(result.toolResults);

        const shouldShowLimitWarning = this.isToolLimitReached() && result.hasTools;

        return {
            ...result,
            reasoning,
            taskStatus,
            shouldShowLimitWarning
        };
    }

    addToolExecutions(additionalCount: number) {
        const agentSettings = this.context.plugin.getAgentModeSettings();
        this.temporaryMaxToolCalls = (this.temporaryMaxToolCalls || agentSettings.maxToolCalls) + additionalCount;
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
}
