import { App } from 'obsidian';
import { Tool, ToolResult } from '../ToolRegistry';

/**
 * Parameters for getting user feedback.
 */
export interface GetUserFeedbackParams {
    question: string;                    // The question to ask the user (required)
    type?: 'text' | 'choice';           // Type of response expected (optional, defaults to 'text')
    choices?: string[];                  // Array of choices for multiple choice questions (required if type is 'choice')
    timeout?: number;                    // Timeout in milliseconds to wait for response (optional, defaults to 300000 = 5 minutes)
    allowCustomAnswer?: boolean;         // For choice type, allow user to provide custom text answer (optional, defaults to false)
    placeholder?: string;                // Placeholder text for text input (optional)
}

/**
 * Interface for the user feedback response data.
 */
export interface UserFeedbackResponse {
    question: string;
    type: 'text' | 'choice';
    answer: string;
    choiceIndex?: number;               // Index of selected choice (for choice type)
    isCustomAnswer?: boolean;           // Whether the answer is a custom text input (for choice type with allowCustomAnswer)
    timestamp: string;
    responseTimeMs: number;
}

/**
 * Tool for getting feedback from the user during agent execution.
 * Supports both text input and multiple choice questions with rich interactive UI.
 */
export class GetUserFeedbackTool implements Tool {
    name = 'get_user_feedback';
    description = 'Prompts user for text or multiple choice input during agent execution.';
    parameters = {
        question: {
            type: 'string',
            description: 'The question to ask the user',
            required: true
        },
        type: {
            type: 'string',
            description: 'Type of response expected: "text" for free text input, "choice" for multiple choice',
            enum: ['text', 'choice'],
            default: 'text',
            required: false
        },
        choices: {
            type: 'array',
            description: 'Array of choices for multiple choice questions (required if type is "choice")',
            items: { type: 'string' },
            required: false
        },
        timeout: {
            type: 'number',
            description: 'Timeout in milliseconds to wait for response (default: 300000 = 5 minutes)',
            default: 300000,
            required: false
        },
        allowCustomAnswer: {
            type: 'boolean',
            description: 'For choice type, allow user to provide custom text answer in addition to choices',
            default: false,
            required: false
        },
        placeholder: {
            type: 'string',
            description: 'Placeholder text for text input',
            required: false
        }
    };

    private static pendingFeedback = new Map<string, {
        resolve: (value: UserFeedbackResponse) => void;
        reject: (reason: any) => void;
        timeoutId: NodeJS.Timeout;
        startTime: number;
    }>();

    constructor(private app: App) {}

    /**
     * Executes the user feedback request.
     * Returns a special result that allows the UI to show interactive elements while waiting for user response.
     * @param params GetUserFeedbackParams
     * @param context Execution context (unused)
     * @returns ToolResult with pending status and request data for UI creation
     */
    async execute(params: GetUserFeedbackParams, context: any): Promise<ToolResult> {
        const {
            question,
            type = 'text',
            choices = [],
            timeout = 300000, // 5 minutes default
            allowCustomAnswer = false,
            placeholder
        } = params;

        // Validate parameters
        if (!question || question.trim().length === 0) {
            return {
                success: false,
                error: 'Question parameter is required and cannot be empty'
            };
        }

        if (type === 'choice' && (!choices || choices.length === 0)) {
            return {
                success: false,
                error: 'Choices parameter is required and cannot be empty when type is "choice"'
            };
        }

        // Generate unique request ID
        const requestId = `feedback_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const startTime = Date.now();

        // Return a special "pending" result that contains all the UI data
        // The UI will create interactive elements and handle the response
        return {
            success: true,
            data: {
                requestId,
                status: 'pending',
                question,
                type,
                choices,
                timeout,
                allowCustomAnswer,
                placeholder,
                startTime
            }
        };
    }

    /**
     * Creates a pending feedback request after the UI has been displayed.
     * This should be called by the ToolRichDisplay when it creates the interactive UI.
     * @param requestId The request ID from the tool result
     * @param timeout Timeout in milliseconds
     * @returns Promise that resolves when user responds or times out
     */
    static createPendingRequest(requestId: string, timeout: number): Promise<UserFeedbackResponse> {
        return new Promise((resolve, reject) => {
            // Set up timeout
            const timeoutId = setTimeout(() => {
                GetUserFeedbackTool.pendingFeedback.delete(requestId);
                reject(new Error(`User feedback timeout after ${timeout}ms`));
            }, timeout);

            // Store the pending feedback request
            GetUserFeedbackTool.pendingFeedback.set(requestId, {
                resolve,
                reject,
                timeoutId,
                startTime: Date.now()
            });
        });
    }

    /**
     * Static method to handle user response from the UI.
     * Called by the ToolRichDisplay when user interacts with the feedback UI.
     * @param requestId The request ID of the pending feedback
     * @param answer The user's answer
     * @param choiceIndex Optional index of selected choice (for choice type)
     * @param isCustomAnswer Whether this is a custom answer (for choice type with allowCustomAnswer)
     */
    static handleUserResponse(
        requestId: string, 
        answer: string, 
        choiceIndex?: number, 
        isCustomAnswer?: boolean
    ): void {
        const pending = GetUserFeedbackTool.pendingFeedback.get(requestId);
        if (!pending) {
            console.warn(`No pending feedback request found for ID: ${requestId}`);
            return;
        }

        // Clear timeout
        clearTimeout(pending.timeoutId);
        
        // Remove from pending map
        GetUserFeedbackTool.pendingFeedback.delete(requestId);

        // Calculate response time
        const responseTimeMs = Date.now() - pending.startTime;

        // Resolve with user response
        const response: UserFeedbackResponse = {
            question: '', // This will be populated by the tool execution context
            type: choiceIndex !== undefined ? 'choice' : 'text',
            answer,
            choiceIndex,
            isCustomAnswer,
            timestamp: new Date().toISOString(),
            responseTimeMs
        };

        pending.resolve(response);
    }

    /**
     * Static method to cancel a pending feedback request.
     * @param requestId The request ID to cancel
     */
    static cancelFeedbackRequest(requestId: string): void {
        const pending = GetUserFeedbackTool.pendingFeedback.get(requestId);
        if (pending) {
            clearTimeout(pending.timeoutId);
            GetUserFeedbackTool.pendingFeedback.delete(requestId);
            pending.reject(new Error('Feedback request cancelled'));
        }
    }

    /**
     * Static method to get all pending feedback requests.
     * Used for debugging and UI management.
     */
    static getPendingRequests(): string[] {
        return Array.from(GetUserFeedbackTool.pendingFeedback.keys());
    }

    /**
     * Static method to check if a request is pending.
     * @param requestId The request ID to check
     */
    static isPending(requestId: string): boolean {
        return GetUserFeedbackTool.pendingFeedback.has(requestId);
    }
}
