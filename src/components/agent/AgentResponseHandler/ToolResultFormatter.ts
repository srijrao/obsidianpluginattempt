import { ToolCommand, ToolResult, Message } from "../../../types";
import { ToolResultFormatStyle, NotificationType } from "./types";
import { stringifyJson } from "./utils";

/**
 * Formats tool execution results for display, copying, or system messages.
 */
export class ToolResultFormatter {
    /**
     * Returns a status icon or label based on success and style.
     * @param success Whether the tool execution was successful.
     * @param style The formatting style ("markdown", "copy", or "plain").
     */
    getStatusIcon(success: boolean, style: ToolResultFormatStyle): string {
        if (success) {
            return style === "markdown" ? "✅" : style === "copy" ? "SUCCESS" : "✓";
        } else {
            return style === "markdown" ? "❌" : style === "copy" ? "ERROR" : "✗";
        }
    }

    /**
     * Formats a single tool result for display in the specified style.
     * @param command The tool command.
     * @param result The tool result.
     * @param opts Optional formatting options.
     */
    formatToolResult(
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
                // Markdown: icon, bold action, and context.
                return `${status} **${action}** completed successfully${context}`;
            case "copy":
                // Copy: multi-line, machine-readable format.
                return this.formatToolResultForCopy(command, result, status);
            default:
                // Plain: simple text format.
                return this.formatToolResultPlain(command, result, status);
        }
    }

    /**
     * Returns additional context for a tool result, such as file path or summary.
     * @param command The tool command.
     * @param result The tool result.
     */
    getResultContext(command: ToolCommand, result: ToolResult): string {
        if (!result.success || !result.data) return "";

        switch (command.action) {
            case "file_write":
            case "file_read":
            case "file_diff":
                if (result.data.filePath) {
                    // Show file path as a wiki link.
                    return ` [[${result.data.filePath}]]`;
                }
                break;
            case "file_select":
                if (result.data.count !== undefined) {
                    // Show number of files found.
                    return ` [[${result.data.count} files found]]`;
                }
                break;
            case "thought":
                if (result.data?.formattedThought) {
                    // Show formatted thought summary.
                    return result.data.formattedThought;
                }
                break;
        }
        return "";
    }

    /**
     * Formats a tool result for copying (machine-readable).
     * @param command The tool command.
     * @param result The tool result.
     * @param status The status label.
     */
    formatToolResultForCopy(command: ToolCommand, result: ToolResult, status: string): string {
        const params = stringifyJson(command.parameters);
        const resultData = result.success
            ? stringifyJson(result.data)
            : result.error;

        return `TOOL EXECUTION: ${command.action}\nSTATUS: ${status}\nPARAMETERS:\n${params}\nRESULT:\n${resultData}`;
    }

    /**
     * Formats a tool result as plain text.
     * @param command The tool command.
     * @param result The tool result.
     * @param status The status icon or label.
     */
    formatToolResultPlain(command: ToolCommand, result: ToolResult, status: string): string {
        const data = result.success ? stringifyJson(result.data) : result.error;
        return `${status} Tool: ${command.action}\nParameters: ${stringifyJson(command.parameters)}\nResult: ${data}`;
    }

    /**
     * Formats an array of tool results for display in markdown.
     * @param toolResults Array of tool command/result pairs.
     * @returns Markdown string for display.
     */
    formatToolResultsForDisplay(toolResults: Array<{ command: ToolCommand; result: ToolResult }>): string {
        if (toolResults.length === 0) {
            return "";
        }
        const resultText = toolResults.map(({ command, result }) =>
            this.formatToolResult(command, result, { style: "markdown" })
        ).join("\n");
        return `\n\n**Tool Execution:**\n${resultText}`;
    }

    /**
     * Creates a system message summarizing tool execution results.
     * @param toolResults Array of tool command/result pairs.
     * @returns A Message object or null if no results.
     */
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
}
