import { ToolCommand, ToolResult, ToolExecutionResult, ReasoningData } from "../../../../types";
import { AgentContext } from "./types";

export class ReasoningProcessor {
    private context: AgentContext;
    constructor(context: AgentContext) {
        this.context = context;
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
        return `reasoning-${timestamp}-${random}`;
    }
}
