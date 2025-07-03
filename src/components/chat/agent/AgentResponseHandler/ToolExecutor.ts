import { ToolCommand, ToolResult } from "../../../../types";
import { ToolRegistry } from "../ToolRegistry";
import { CONSTANTS } from "./constants";

/**
 * ToolExecutor is responsible for executing tools, handling results,
 * error management, and tracking execution statistics.
 */
export class ToolExecutor {
    // Registry of available tools.
    private toolRegistry: ToolRegistry;
    // Counter for the number of tool executions.
    private executionCount: number = 0;
    // Callback to handle tool results.
    private onToolResult: (result: ToolResult, command: ToolCommand) => void;
    // Callback to create a display for tool results.
    private createToolDisplay: (command: ToolCommand, result: ToolResult) => void;

    /**
     * Constructs a ToolExecutor.
     * @param toolRegistry The registry of available tools.
     * @param onToolResult Callback for handling tool results.
     * @param createToolDisplay Callback for displaying tool results.
     */
    constructor(
        toolRegistry: ToolRegistry,
        onToolResult: (result: ToolResult, command: ToolCommand) => void,
        createToolDisplay: (command: ToolCommand, result: ToolResult) => void
    ) {
        this.toolRegistry = toolRegistry;
        this.onToolResult = onToolResult;
        this.createToolDisplay = createToolDisplay;
    }

    /**
     * Executes a tool with logging and timing.
     * @param command The tool command to execute.
     * @param timeoutMs Timeout in milliseconds.
     * @param contextLabel Context label for logging.
     * @param debugLog Optional debug logging function.
     * @returns The result of the tool execution.
     */
    async executeToolWithLogging(
        command: ToolCommand,
        timeoutMs: number,
        contextLabel: string,
        debugLog?: (msg: string, data?: any, ctx?: string) => void
    ): Promise<ToolResult> {
        const startTime = Date.now();
        if (debugLog) debugLog("Executing tool", { command }, contextLabel);

        const result = await this.executeToolWithTimeout(command, timeoutMs);
        const executionTime = Date.now() - startTime;

        if (debugLog) debugLog("Tool execution result", { command, result, executionTime }, contextLabel);
        return result;
    }

    /**
     * Executes a tool with a timeout.
     * @param command The tool command to execute.
     * @param timeoutMs Timeout in milliseconds.
     * @returns A promise resolving to the tool result.
     */
    async executeToolWithTimeout(command: ToolCommand, timeoutMs: number): Promise<ToolResult> {
        return new Promise((resolve, reject) => {
            // Set up a timeout to reject if tool takes too long.
            const timeout = setTimeout(() => {
                reject(new Error(`${CONSTANTS.ERROR_MESSAGES.TOOL_EXECUTION_TIMEOUT} after ${timeoutMs}ms`));
            }, timeoutMs);

            // Execute the tool and clear timeout on completion.
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

    /**
     * Handles successful tool execution.
     * Adds result to toolResults, updates count, displays result, and triggers callback.
     * @param command The executed tool command.
     * @param result The result of execution.
     * @param toolResults Array to store results.
     */
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

    /**
     * Handles tool execution errors.
     * Logs error, creates error result, and processes as a success.
     * @param command The tool command.
     * @param error The error thrown.
     * @param toolResults Array to store results.
     * @param contextLabel Context label for logging.
     * @param debugLog Optional debug logging function.
     */
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

    /**
     * Creates a ToolResult object representing an error.
     * @param command The tool command.
     * @param error The error thrown.
     * @returns A ToolResult indicating failure.
     */
    createErrorResult(command: ToolCommand, error: any): ToolResult {
        return {
            success: false,
            error: `${CONSTANTS.ERROR_MESSAGES.TOOL_EXECUTION_FAILED}: ${error.message}`,
            requestId: command.requestId
        };
    }

    /**
     * Reruns a tool command and displays the result.
     * @param originalCommand The original tool command.
     * @param timeoutMs Timeout in milliseconds.
     */
    async rerunTool(originalCommand: ToolCommand, timeoutMs: number): Promise<void> {
        try {
            const result = await this.executeToolWithTimeout(originalCommand, timeoutMs);
            this.createToolDisplay(originalCommand, result);
            this.onToolResult(result, originalCommand);
        } catch (error: any) {
            console.error(`${CONSTANTS.ERROR_MESSAGES.RERUN_FAILED} ${originalCommand.action}:`, error);
        }
    }

    /**
     * Gets the number of tool executions performed.
     * @returns The execution count.
     */
    getExecutionCount(): number {
        return this.executionCount;
    }

    /**
     * Resets the execution count to zero.
     */
    resetExecutionCount(): void {
        this.executionCount = 0;
    }
}
