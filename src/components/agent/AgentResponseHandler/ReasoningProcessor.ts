import { ToolCommand, ToolResult, ToolExecutionResult, ReasoningData } from "../../../types";
import { AgentContext } from "./types";

/**
 * Handles processing of reasoning and tool results for agent chat responses.
 */
export class ReasoningProcessor {
    // Context containing plugin settings and environment.
    private context: AgentContext;

    /**
     * Constructs a ReasoningProcessor with the given agent context.
     * @param context The agent context, including plugin settings.
     */
    constructor(context: AgentContext) {
        this.context = context;
    }

    /**
     * Processes an array of tool results for a chat message.
     * Extracts reasoning data if a "thought" tool result is present,
     * and collects all tool execution results with timestamps.
     *
     * @param toolResults Array of objects containing a ToolCommand and its ToolResult.
     * @returns An object containing optional reasoning data and an array of tool execution results.
     */
    processToolResultsForMessage(toolResults: Array<{ command: ToolCommand; result: ToolResult }>): {
        reasoning?: ReasoningData;
        toolExecutionResults: ToolExecutionResult[];
    } {
        // Map each tool result to a ToolExecutionResult, adding a timestamp.
        const toolExecutionResults: ToolExecutionResult[] = toolResults.map(({ command, result }) => ({
            command,
            result,
            timestamp: new Date().toISOString()
        }));

        let reasoning: ReasoningData | undefined;

        // Look for a "thought" tool result that succeeded and has data.
        for (const { command, result } of toolResults) {
            if (command.action === "thought" && result.success && result.data) {
                // Convert the thought tool result data into ReasoningData format.
                reasoning = this.convertThoughtToolResultToReasoning(result.data);
                break; // Only the first valid thought is used.
            }
        }

        return {
            reasoning,
            toolExecutionResults
        };
    }

    /**
     * Converts the data from a "thought" tool result into ReasoningData.
     * Handles both structured and simple reasoning formats.
     *
     * @param thoughtData The data from the thought tool result.
     * @returns A ReasoningData object.
     */
    private convertThoughtToolResultToReasoning(thoughtData: any): ReasoningData {
        // Generate a unique ID for this reasoning instance.
        const reasoningId = this.generateReasoningId();
        // Prepare base data shared by all reasoning types.
        const baseData = {
            id: reasoningId,
            timestamp: thoughtData.timestamp || new Date().toISOString(),
            isCollapsed: this.context.plugin.settings.uiBehavior?.collapseOldReasoning || false
        };

        // Handle structured reasoning with steps.
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
            // Handle simple reasoning (single thought or summary).
            return {
                ...baseData,
                type: "simple",
                summary: thoughtData.thought || thoughtData.formattedThought
            };
        }
    }

    /**
     * Generates a unique identifier for a reasoning instance.
     * Combines the current timestamp and a random string.
     *
     * @returns A unique reasoning ID string.
     */
    private generateReasoningId(): string {
        const timestamp = Date.now();
        const random = Math.random().toString(36).substr(2, 9);
        return `reasoning-${timestamp}-${random}`;
    }
}
