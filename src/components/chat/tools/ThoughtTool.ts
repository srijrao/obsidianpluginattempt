import { App } from 'obsidian';
import { Tool, ToolResult } from '../ToolRegistry';

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
 * Only core, MCP-compliant parameters are included.
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
}

/**
 * Tool for recording and rendering AI reasoning steps in a clear, MCP-compliant format.
 * 
 * - Parameters are strictly validated and documented.
 * - Output is concise, visually distinct, and suitable for MCP tool result display.
 * - All errors and results follow MCP conventions.
 */
export class ThoughtTool implements Tool {
    name = 'thought';
    description = 'Record and display a single AI reasoning step or thought process.';

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
        }
    };

    constructor(private app: App) {}

    async execute(params: ThoughtParams, context: any): Promise<ToolResult> {
        // Alias older 'reasoning' field into 'thought' so we stay compliant
        if ((!params.thought || params.thought.trim().length === 0) && (params as any).reasoning) {
            params.thought = (params as any).reasoning;
        }
        // MCP: Validate required parameter
        if (!params.thought || typeof params.thought !== 'string' || params.thought.trim().length === 0) {
            return {
                success: false,
                error: 'Parameter "thought" is required and must be a non-empty string.'
            };
        }

        // MCP: Validate and normalize parameters
        const thought = params.thought.trim();
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
            timestamp
        });

        // MCP: Return result in strict format
        return {
            success: true,
            data: {
                thought,
                step,
                totalSteps,
                category,
                confidence,
                timestamp,
                formattedThought
            }
        };
    }

    /**
     * Render a thought in a visually distinct, concise format for MCP tool output.
     * @param opts - Rendering options
     * @returns Formatted string
     */
    private renderThought(opts: {
        thought: string;
        stepInfo?: string;
        category: ThoughtCategory;
        confidence: number;
        timestamp: string;
    }): string {
        const { thought, stepInfo, category, confidence, timestamp } = opts;
        const emoji = this.getCategoryEmoji(category);
        const confidenceBar = '●'.repeat(confidence) + '○'.repeat(10 - confidence);

        let header = `${emoji} **${category.replace('-', ' ').toUpperCase()}**`;
        if (stepInfo) header += ` | ${stepInfo}`;
        header += ` | Confidence: ${confidence}/10 ${confidenceBar} | ${new Date(timestamp).toLocaleTimeString()}`;

        // Render as a blockquote for clarity in chat/MCP UIs
        return `${header}\n> ${thought}`;
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
