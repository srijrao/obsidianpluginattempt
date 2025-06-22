import { App } from 'obsidian';
import { Tool, ToolResult } from '../agent/ToolRegistry';

/**
 * Enum for core thought categories.
 */
export enum ThoughtCategory {
    Analysis = 'analysis',
    Planning = 'planning',
    ProblemSolving = 'problem-solving',
    Reflection = 'reflection',
    Conclusion = 'conclusion'
}

/**
 * Parameters for the ThoughtTool.
 * Enhanced with next tool suggestion and completion tracking.
 */
export interface ThoughtParams {
    /**
     * The main thought or reasoning step to record.
     */
    thought: string;
    /**
     * Current step number in a multi-step process (optional).
     */
    step?: number;
    /**
     * Total number of steps in the process (optional).
     */
    totalSteps?: number;
    /**
     * Category of the thought for organization and display.
     */
    category?: ThoughtCategory;
    /**
     * Confidence level in this thought (1-10 scale, optional).
     */
    confidence?: number;
    /**
     * Name of the next tool to use, or "finished" if no further action is needed.
     */
    nextTool: string;
    /**
     * Brief description of the recommended next step or action (optional).
     */
    nextActionDescription?: string;
}

/**
 * Tool for recording and rendering AI reasoning steps with next action guidance.
 * 
 * - Enhanced for agent automation with next tool suggestions
 * - Parameters are strictly validated and documented
 * - Output is machine-readable JSON for both agent and user use
 * - All errors and results follow MCP conventions
 * - Intended for both agent automation and user display
 */
export class ThoughtTool implements Tool {
    name = 'thought';
    description = 'Record and display a single AI reasoning step with next tool suggestion for agent automation and user display.';

    parameters = {
        thought: {
            type: 'string',
            description: 'The main thought or reasoning step to record',
            required: true
        },
        reasoning: {
            type: 'string',
            description: 'Alias for thought (MCP compliance)',
            required: false
        },
        step: {
            type: 'number',
            description: 'Current step number in a multi-step process',
            required: false
        },
        totalSteps: {
            type: 'number',
            description: 'Total number of steps in the process',
            required: false
        },
        category: {
            type: 'string',
            enum: Object.values(ThoughtCategory),
            description: 'Category of the thought for organization',
            default: ThoughtCategory.Analysis
        },
        confidence: {
            type: 'number',
            description: 'Confidence level in this thought (1-10 scale)',
            default: 7,
            minimum: 1,
            maximum: 10
        },
        nextTool: {
            type: 'string',
            description: 'Name of the next tool to use, or "finished" if no further action is needed',
            required: true
        },
        nextActionDescription: {
            type: 'string',
            description: 'Brief description of the recommended next step or action',
            required: false
        }
    };

    constructor(private app: App) {}

    async execute(params: ThoughtParams, context: any): Promise<ToolResult> {
        // Alias older 'reasoning' field into 'thought' so we stay compliant
        if ((!params.thought || params.thought.trim().length === 0) && (params as any).reasoning) {
            params.thought = (params as any).reasoning;
        }
        
        // MCP: Validate required parameters
        if (!params.thought || typeof params.thought !== 'string' || params.thought.trim().length === 0) {
            return {
                success: false,
                error: 'Parameter "thought" is required and must be a non-empty string.'
            };
        }
        
        if (!params.nextTool || typeof params.nextTool !== 'string' || params.nextTool.trim().length === 0) {
            return {
                success: false,
                error: 'Parameter "nextTool" is required and must be a non-empty string.'
            };
        }

        // MCP: Validate and normalize parameters
        const thought = params.thought.trim();
        const nextTool = params.nextTool.trim();
        const nextActionDescription = params.nextActionDescription?.trim() || undefined;
        const finished = nextTool.toLowerCase() === 'finished';
        const step = typeof params.step === 'number' && params.step > 0 ? params.step : undefined;
        const totalSteps = typeof params.totalSteps === 'number' && params.totalSteps > 0 ? params.totalSteps : undefined;
        const category: ThoughtCategory = Object.values(ThoughtCategory).includes(params.category as ThoughtCategory)
            ? params.category as ThoughtCategory
            : ThoughtCategory.Analysis;
        const confidence = this.validateConfidence(params.confidence);

        // MCP: Timestamp for traceability
        const timestamp = new Date().toISOString();

        // Compose step info for display
        const stepInfo = step && totalSteps
            ? `Step ${step}/${totalSteps}`
            : step
                ? `Step ${step}`
                : '';

        // Render the thought in a visually distinct, MCP-friendly format
        const formattedThought = this.renderThought({
            thought,
            stepInfo,
            category,
            confidence,
            timestamp,
            nextTool,
            nextActionDescription,
            finished
        });

        // MCP: Return result in strict format with enhanced machine-readable JSON
        return {
            success: true,
            data: {
                thought,
                category,
                confidence,
                step,
                totalSteps,
                timestamp,
                nextTool,
                nextActionDescription,
                finished,
                formattedThought
            }
        };
    }

    /**
     * Render a thought in a visually distinct, concise format for MCP tool output.
     * Enhanced to include next tool information and completion status.
     * @param opts - Rendering options
     * @returns Formatted string
     */
    private renderThought(opts: {
        thought: string;
        stepInfo?: string;
        category: ThoughtCategory;
        confidence: number;
        timestamp: string;
        nextTool: string;
        nextActionDescription?: string;
        finished: boolean;
    }): string {
        const { thought, stepInfo, category, confidence, timestamp, nextTool, nextActionDescription, finished } = opts;
        const emoji = this.getCategoryEmoji(category);
        const confidenceBar = '●'.repeat(confidence) + '○'.repeat(10 - confidence);

        let header = `${emoji} **${category.replace('-', ' ').toUpperCase()}**`;
        if (stepInfo) header += ` | ${stepInfo}`;
        header += ` | Confidence: ${confidence}/10 ${confidenceBar} | ${new Date(timestamp).toLocaleTimeString()}`;

        // Add next action information
        const statusEmoji = finished ? '✅' : '⏭️';
        const nextAction = finished ? 'Process Complete' : `Next: ${nextTool}`;
        header += ` | ${statusEmoji} ${nextAction}`;

        let content = `${header}\n> ${thought}`;
        
        // Add next action description if provided and not finished
        if (nextActionDescription && !finished) {
            content += `\n> 📋 **Next Action:** ${nextActionDescription}`;
        }

        return content;
    }

    /**
     * Get an emoji for a given category.
     * @param category - ThoughtCategory
     * @returns Emoji string
     */
    private getCategoryEmoji(category: ThoughtCategory): string {
        switch (category) {
            case ThoughtCategory.Analysis: return '🔍';
            case ThoughtCategory.Planning: return '📋';
            case ThoughtCategory.ProblemSolving: return '🧩';
            case ThoughtCategory.Reflection: return '🤔';
            case ThoughtCategory.Conclusion: return '✅';
            default: return '💭';
        }
    }

    /**
     * Ensure confidence is an integer between 1 and 10 (default 7).
     * @param confidence - number | undefined
     * @returns number
     */
    private validateConfidence(confidence: number | undefined): number {
        if (typeof confidence !== 'number' || isNaN(confidence)) return 7;
        return Math.max(1, Math.min(10, Math.round(confidence)));
    }
}
