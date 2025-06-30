import { App } from 'obsidian';
import { Tool, ToolResult } from '../ToolRegistry';

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
    description = 'Record AI reasoning and suggest next tool. When nextTool is "finished", include final response in thought parameter. When planning, check the file list tool for available files and folders.';

    parameters = {
        thought: {
            type: 'string',
            description: 'The reasoning step to record',
            required: true
        },
        nextTool: {
            type: 'string',
            description: 'Next tool name or "finished" if complete. ALWAYS use "finished" to indicate no further action is needed.',
            required: true
        },
        nextActionDescription: {
            type: 'string',
            description: 'Brief description of next step',
            required: true
        }
    };

    constructor(private app: App) { }

    async execute(params: any, context: any): Promise<ToolResult> {
        if (context && context.plugin && typeof context.plugin.debugLog === 'function') {
            context.plugin.debugLog('info', '[ThoughtTool] execute called', { params, context });
        }

        
        const actualParams = params.parameters || params;

        
        if ((!actualParams.thought || actualParams.thought.trim().length === 0) && (actualParams as any).reasoning) {
            if (context && context.plugin && typeof context.plugin.debugLog === 'function') {
                context.plugin.debugLog('debug', '[ThoughtTool] Aliasing reasoning to thought', { params: actualParams });
            }
            actualParams.thought = (actualParams as any).reasoning;
        }
        if (!actualParams.thought || typeof actualParams.thought !== 'string' || actualParams.thought.trim().length === 0) {
            if (context && context.plugin && typeof context.plugin.debugLog === 'function') {
                context.plugin.debugLog('warn', '[ThoughtTool] Missing or invalid thought parameter', { params: actualParams });
            }
            return { success: false, error: 'Parameter "thought" is required and must be a non-empty string.' };
        }

        if (!actualParams.nextTool || typeof actualParams.nextTool !== 'string' || actualParams.nextTool.trim().length === 0) {
            return {
                success: false,
                error: 'Parameter "nextTool" is required and must be a non-empty string.'
            };
        }

        
        const thought = actualParams.thought.trim();
        const nextTool = actualParams.nextTool.trim();
        const nextActionDescription = actualParams.nextActionDescription?.trim() || undefined;
        const finished = nextTool.toLowerCase() === 'finished';
        const step = typeof actualParams.step === 'number' && actualParams.step > 0 ? actualParams.step : undefined;
        const totalSteps = typeof actualParams.totalSteps === 'number' && actualParams.totalSteps > 0 ? actualParams.totalSteps : undefined;

        
        const timestamp = new Date().toISOString();

        
        const stepInfo = step && totalSteps
            ? `Step ${step}/${totalSteps}`
            : step
                ? `Step ${step}`
                : '';

        
        const formattedThought = this.renderThought({
            thought,
            stepInfo,
            timestamp,
            nextTool,
            nextActionDescription,
            finished
        });

        
        if (context && context.plugin && typeof context.plugin.debugLog === 'function') {
            context.plugin.debugLog('info', '[ThoughtTool] ThoughtTool execution complete', { result: { thought: actualParams.thought } });
        }
        return {
            success: true,
            data: {
                thought,
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
        timestamp: string;
        nextTool: string;
        nextActionDescription?: string;
        finished: boolean;
    }): string {
        const { thought, stepInfo, nextTool, finished } = opts;

        
        const statusEmoji = finished ? '✅' : '🤔';
        const stepPrefix = stepInfo ? `${stepInfo} ` : '';
        const header = `${statusEmoji} ${stepPrefix}${finished ? 'Complete' : `→ ${nextTool}`}`;

        return `${header}\n> ${thought}`;
    }
}
