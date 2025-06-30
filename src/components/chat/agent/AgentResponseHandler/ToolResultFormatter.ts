import { ToolCommand, ToolResult, Message } from "../../../../types";
import { ToolResultFormatStyle, NotificationType } from "./types";
import { stringifyJson } from "./utils";

export class ToolResultFormatter {
    getStatusIcon(success: boolean, style: ToolResultFormatStyle): string {
        if (success) {
            return style === "markdown" ? "✅" : style === "copy" ? "SUCCESS" : "✓";
        } else {
            return style === "markdown" ? "❌" : style === "copy" ? "ERROR" : "✗";
        }
    }

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
                return `${status} **${action}** completed successfully${context}`;
            case "copy":
                return this.formatToolResultForCopy(command, result, status);
            default:
                return this.formatToolResultPlain(command, result, status);
        }
    }

    getResultContext(command: ToolCommand, result: ToolResult): string {
        if (!result.success || !result.data) return "";

        switch (command.action) {
            case "file_write":
            case "file_read":
            case "file_diff":
                if (result.data.filePath) {
                    
                    return ` [[${result.data.filePath}]]`;
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

    formatToolResultForCopy(command: ToolCommand, result: ToolResult, status: string): string {
        const params = stringifyJson(command.parameters);
        const resultData = result.success
            ? stringifyJson(result.data)
            : result.error;

        return `TOOL EXECUTION: ${command.action}\nSTATUS: ${status}\nPARAMETERS:\n${params}\nRESULT:\n${resultData}`;
    }

    formatToolResultPlain(command: ToolCommand, result: ToolResult, status: string): string {
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
}
