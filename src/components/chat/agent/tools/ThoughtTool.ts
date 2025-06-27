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
    description = `Record and display a single AI reasoning step, always suggesting the next tool to use (or 'finished' if complete). Output is machine-readable for both agent automation and user display. Requires 'thought' and 'nextTool' parameters; optionally includes step tracking and a description of the next action.
Never use 'action: finished'. When you are done, always use the 'thought' tool with 'nextTool': 'finished'.

IMPORTANT: When nextTool is 'finished', include your final response to the user in the 'thought' parameter. This is the ONLY way to communicate your final answer to the user.

Example (continuing task):
{
  "action": "thought",
  "parameters": {
    "thought": "I will summarize the note before editing.",
    "nextTool": "file_write",
    "nextActionDescription": "Write a description of the tool's use"
  }
}

Example (finishing task):
{
  "action": "thought",
  "parameters": {
    "thought": "Based on my search, here are the files in your vault: Note1.md, Note2.md, and Ideas.md. The file 'Note1.md' contains your project planning notes.",
    "nextTool": "finished",
    "nextActionDescription": "Task completed - provided file information to user"
  }
}`;

    parameters = {
        thought: {
            type: 'string',
            description: "REQUIRED. The main thought or reasoning step to record. Use the key 'thought' (not 'text', 'message', or any other name). This must always be present and non-empty. IMPORTANT: When nextTool is 'finished', this should contain your final response to the user, not just internal reasoning. Example: { \"thought\": \"I will summarize the note before editing.\" } or when finished: { \"thought\": \"Here are the files in your vault: Note1.md, Note2.md, Ideas.md\" }",
            required: true
        },
        reasoning: {
            type: 'string',
            description: "Optional. Alias for 'thought' (for legacy/compatibility only). Do NOT use unless specifically instructed. Always prefer 'thought'.",
            required: false
        },
        nextTool: {
            type: 'string',
            description: "REQUIRED. Name of the next tool to use, or 'finished' if no further action is needed. When 'finished', the 'thought' parameter must contain your final response to the user. Always include this key. Example: { \"nextTool\": \"file_write\" } or { \"nextTool\": \"finished\" }.",
            required: true
        },
        nextActionDescription: {
            type: 'string',
            description: 'REQUIRED. Brief description of the recommended next step or action.',
            required: true
        }
    };

    constructor(private app: App) { }

    async execute(params: ThoughtParams, context: any): Promise<ToolResult> {
        if (context && context.plugin && typeof context.plugin.debugLog === 'function') {
            context.plugin.debugLog('info', '[ThoughtTool] execute called', { params, context });
        }

        // Alias older 'reasoning' field into 'thought' so we stay compliant
        if ((!params.thought || params.thought.trim().length === 0) && (params as any).reasoning) {
            if (context && context.plugin && typeof context.plugin.debugLog === 'function') {
                context.plugin.debugLog('debug', '[ThoughtTool] Aliasing reasoning to thought', { params });
            }
            params.thought = (params as any).reasoning;
        }
        if (!params.thought || typeof params.thought !== 'string' || params.thought.trim().length === 0) {
            if (context && context.plugin && typeof context.plugin.debugLog === 'function') {
                context.plugin.debugLog('warn', '[ThoughtTool] Missing or invalid thought parameter', { params });
            }
            return { success: false, error: 'Parameter "thought" is required and must be a non-empty string.' };
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
            timestamp,
            nextTool,
            nextActionDescription,
            finished
        });

        // MCP: Return result in strict format with enhanced machine-readable JSON
        if (context && context.plugin && typeof context.plugin.debugLog === 'function') {
            context.plugin.debugLog('info', '[ThoughtTool] ThoughtTool execution complete', { result: { thought: params.thought } });
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
        const { thought, stepInfo, timestamp, nextTool, nextActionDescription, finished } = opts;

        let header = '';
        if (stepInfo) header = `${stepInfo}`;
        header += `${header ? ' | ' : ''}${new Date(timestamp).toLocaleTimeString()}`;

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
}
