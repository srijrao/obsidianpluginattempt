import { ToolCommand, ToolResult } from "../../../../types";
import { ToolRegistry } from "../ToolRegistry";
import { CONSTANTS } from "./constants";

export class ToolExecutor {
    private toolRegistry: ToolRegistry;
    private executionCount: number = 0;
    private onToolResult: (result: ToolResult, command: ToolCommand) => void;
    private createToolDisplay: (command: ToolCommand, result: ToolResult) => void;

    constructor(toolRegistry: ToolRegistry, onToolResult: (result: ToolResult, command: ToolCommand) => void, createToolDisplay: (command: ToolCommand, result: ToolResult) => void) {
        this.toolRegistry = toolRegistry;
        this.onToolResult = onToolResult;
        this.createToolDisplay = createToolDisplay;
    }

    async executeToolWithLogging(command: ToolCommand, timeoutMs: number, contextLabel: string, debugLog?: (msg: string, data?: any, ctx?: string) => void): Promise<ToolResult> {
        const startTime = Date.now();
        if (debugLog) debugLog("Executing tool", { command }, contextLabel);

        const result = await this.executeToolWithTimeout(command, timeoutMs);
        const executionTime = Date.now() - startTime;

        if (debugLog) debugLog("Tool execution result", { command, result, executionTime }, contextLabel);
        return result;
    }

    async executeToolWithTimeout(command: ToolCommand, timeoutMs: number): Promise<ToolResult> {
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

    handleToolExecutionSuccess(
        command: ToolCommand,
        result: ToolResult,
        toolResults: Array<{ command: ToolCommand; result: ToolResult }>
    ): void {
        toolResults.push({ command, result });
        this.executionCount++;
        this.createToolDisplay(command, result);
        this.onToolResult(result, command);
    }

    handleToolExecutionError(
        command: ToolCommand,
        error: any,
        toolResults: Array<{ command: ToolCommand; result: ToolResult }>,
        contextLabel: string,
        debugLog?: (msg: string, data?: any, ctx?: string) => void
    ): void {
        if (debugLog) debugLog("Tool execution error", { command, error }, contextLabel);
        console.error(`ToolExecutor: Tool '${command.action}' failed with error:`, error);

        const errorResult = this.createErrorResult(command, error);
        this.handleToolExecutionSuccess(command, errorResult, toolResults);
    }

    createErrorResult(command: ToolCommand, error: any): ToolResult {
        return {
            success: false,
            error: `${CONSTANTS.ERROR_MESSAGES.TOOL_EXECUTION_FAILED}: ${error.message}`,
            requestId: command.requestId
        };
    }

    async rerunTool(originalCommand: ToolCommand, timeoutMs: number): Promise<void> {
        try {
            const result = await this.executeToolWithTimeout(originalCommand, timeoutMs);
            this.createToolDisplay(originalCommand, result);
            this.onToolResult(result, originalCommand);
        } catch (error: any) {
            console.error(`${CONSTANTS.ERROR_MESSAGES.RERUN_FAILED} ${originalCommand.action}:`, error);
        }
    }

    getExecutionCount(): number {
        return this.executionCount;
    }

    resetExecutionCount(): void {
        this.executionCount = 0;
    }
}
