import { MarkdownRenderer, Component } from 'obsidian';
import { Message, ToolCommand, ToolResult } from '../../types';
import MyPlugin from '../../main';
import { AgentResponseHandler } from './AgentResponseHandler';

/**
 * Handles task continuation logic for agent mode.
 * Responsible for iteratively executing tool commands and updating the UI
 * until the task is marked as finished or a limit is reached.
 */
export class TaskContinuation {
    /**
     * @param plugin The main plugin instance (for settings and logging)
     * @param agentResponseHandler Handler for agent responses and tool execution
     * @param messagesContainer The container element for chat messages
     * @param component Optional Obsidian component for Markdown rendering context
     */
    constructor(
        private plugin: MyPlugin,
        private agentResponseHandler: AgentResponseHandler | null,
        private messagesContainer: HTMLElement,
        private component?: Component
    ) {}

    /**
     * Continues task execution until the task is finished or a limit is reached.
     * Iteratively processes tool results and agent responses.
     * @param messages The conversation history/messages
     * @param container The chat message container element
     * @param initialResponseContent The initial assistant response content
     * @param currentContent The current content to display
     * @param initialToolResults Initial tool results to process
     * @param chatHistory Optional chat history for context
     * @returns An object with the final content and a flag if the tool limit was reached
     */
    async continueTaskUntilFinished(
        messages: Message[],
        container: HTMLElement,
        initialResponseContent: string,
        currentContent: string,
        initialToolResults: Array<{ command: ToolCommand; result: ToolResult }>,
        chatHistory?: any[]
    ): Promise<{ content: string; limitReachedDuringContinuation: boolean; }> {
        let responseContent = currentContent;
        let maxIterations = this.plugin.settings.agentMode?.maxIterations ?? 10; 
        let iteration = 0;
        let limitReachedDuringContinuation = false;

        let allToolResults = [...initialToolResults];
        let isFinished = this.checkIfTaskFinished(allToolResults);

        // Stop immediately if tool execution limit is already reached
        if (this.agentResponseHandler?.isToolLimitReached()) {
            return { 
                content: responseContent + '\n\n*[Tool execution limit reached - task continuation stopped]*',
                limitReachedDuringContinuation: true 
            };
        }

        // Debug logging for task continuation start
        if (this.plugin.settings.debugMode) {
            this.plugin.debugLog('debug', '[TaskContinuation] continueTaskUntilFinished', {
                initialResponseContent,
                currentContent,
                initialToolResults,
                maxIterations
            });
        }

        // Main loop: continue until finished or max iterations reached
        while (!isFinished && iteration < maxIterations) {
            iteration++;
            if (this.agentResponseHandler?.isToolLimitReached()) {
                responseContent += '\n\n*[Tool execution limit reached during continuation]*';
                limitReachedDuringContinuation = true;
                break;
            }

            // Create a tool result message for the agent
            const toolResultMessage = this.agentResponseHandler?.createToolResultMessage(allToolResults);
            if (toolResultMessage) {
                // Build the message sequence for the next agent response
                const continuationMessages: Message[] = [
                    ...messages,
                    { role: 'assistant', content: initialResponseContent },
                    toolResultMessage
                ];

                // Get the agent's continuation response
                const continuationContent = await this.getContinuationResponse(continuationMessages, container, allToolResults);
                if (continuationContent.trim()) {
                    let processingResult;
                    if (this.agentResponseHandler) {
                        // Process the agent's response and extract tool results
                        processingResult = await this.agentResponseHandler.processResponse(continuationContent, "task-continuation", chatHistory);
                        if (processingResult.toolResults && processingResult.toolResults.length > 0) {
                            allToolResults = [...allToolResults, ...processingResult.toolResults];
                        }
                    }

                    // Update the UI and check if finished
                    const continuationResult = await this.processContinuation(
                        continuationContent,
                        responseContent,
                        container,
                        allToolResults, 
                        chatHistory,
                        processingResult 
                    );
                    responseContent = continuationResult.responseContent;
                    isFinished = continuationResult.isFinished;
                    initialResponseContent = continuationContent;
                } else {
                    isFinished = true;
                }
            } else {
                isFinished = true;
            }
            // Debug logging for each iteration
            if (this.plugin.settings.debugMode) {
                this.plugin.debugLog('debug', '[TaskContinuation] Iteration', {
                    iteration,
                    isFinished,
                    toolResults: allToolResults
                });
            }
        }
        // If max iterations reached, append a warning
        if (iteration >= maxIterations) {
            if (this.plugin.settings.debugMode) {
                this.plugin.debugLog('debug', '[TaskContinuation] Maximum iterations reached', { iteration });
            }
            responseContent += '\n\n*[Task continuation reached maximum iterations - stopping to prevent infinite loop]*';
        }

        return { content: responseContent, limitReachedDuringContinuation };
    }

    /**
     * Processes the agent's continuation response and updates the UI.
     * Handles both tool-based and plain responses.
     * @param continuationContent The agent's response content
     * @param responseContent The current response content
     * @param container The chat message container element
     * @param initialToolResults Tool results so far
     * @param chatHistory Optional chat history
     * @param processingResult Optional pre-processed agent result
     * @returns Object with updated response content and finished flag
     */
    private async processContinuation(
        continuationContent: string,
        responseContent: string,
        container: HTMLElement,
        initialToolResults: Array<{ command: ToolCommand; result: ToolResult }>,
        chatHistory?: any[],
        processingResult?: { processedText: string; toolResults: Array<{ command: ToolCommand; result: ToolResult }>; hasTools: boolean }
    ): Promise<{ responseContent: string; isFinished: boolean }> {
        let continuationResult;
        if (processingResult) {
            continuationResult = processingResult;
        } else if (this.agentResponseHandler) {
            continuationResult = await this.agentResponseHandler.processResponse(continuationContent, "main", chatHistory);
        } else {
            // Fallback: just append the content and update UI
            const updatedContent = responseContent + '\n\n' + continuationContent;
            await this.updateContainerContent(container, updatedContent);
            return { responseContent: updatedContent, isFinished: true };
        }

        if (continuationResult.hasTools) {
            // If the agent response includes tool usage, process accordingly
            const cleanContinuationContent = continuationResult.processedText;
            const isFinished = this.checkIfTaskFinished(continuationResult.toolResults);
            const allToolResults = initialToolResults;
            const updatedContent = responseContent + '\n\n' + cleanContinuationContent;

            // Create enhanced message data for UI
            const enhancedMessageData = this.createEnhancedMessageData(
                updatedContent,
                continuationResult,
                allToolResults
            );

            this.updateContainerWithMessageData(container, enhancedMessageData, updatedContent);

            return { responseContent: updatedContent, isFinished };
        } else {
            // If no tools, check for finished flag in JSON or fallback to tool results
            let isFinished = false;
            try {
                const parsed = JSON.parse(continuationContent);
                if (parsed && parsed.finished === true) {
                    isFinished = true;
                }
            } catch (e) {
                // Not JSON, fallback to tool results
                if (initialToolResults.length > 0) {
                    isFinished = this.checkIfTaskFinished(initialToolResults);
                }
            }
            const updatedContent = responseContent + '\n\n' + continuationContent;
            await this.updateContainerContent(container, updatedContent);
            return { responseContent: updatedContent, isFinished };
        }
    }

    /**
     * Updates the chat container with new Markdown-rendered content.
     * @param container The chat message container element
     * @param content The new content to render
     */
    private async updateContainerContent(container: HTMLElement, content: string): Promise<void> {
        container.dataset.rawContent = content;
        const contentEl = container.querySelector('.message-content') as HTMLElement;
        if (contentEl) {
            contentEl.empty();
            await MarkdownRenderer.render(
                this.plugin.app,
                content,
                contentEl,
                '',
                this.component || null as any
            );
            this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
        }
    }

    /**
     * Checks if any tool results indicate the task is finished.
     * Looks for a 'finished' flag or a 'thought' tool with nextTool 'finished'.
     * @param toolResults Array of tool command/result pairs
     * @returns True if the task is finished, false otherwise
     */
    private checkIfTaskFinished(toolResults: Array<{ command: ToolCommand; result: ToolResult }>): boolean {
        return toolResults.some(({ command, result }) => {
            // Direct finished flag
            if ((command as any).finished === true) {
                return true;
            }
            // Thought tool with nextTool 'finished'
            if (command.action === 'thought' && result.success && result.data) {
                return result.data.nextTool === 'finished' || result.data.finished === true;
            }
            return false;
        });
    }

    /**
     * Gets the agent's continuation response after tool execution.
     * Calls the provider's getCompletion method and streams the result.
     * @param messages The conversation history/messages
     * @param container The chat message container element
     * @param toolResults Optional tool results to extract requested tool from
     * @returns The agent's response content as a string
     */
    private async getContinuationResponse(
        messages: Message[],
        container: HTMLElement,
        toolResults?: Array<{ command: ToolCommand; result: ToolResult }>
    ): Promise<string> {
        try {
            if (this.plugin.settings.debugMode) {
                this.plugin.debugLog('debug', '[TaskContinuation] getContinuationResponse', { messages, toolResults });
            }

            if (this.agentResponseHandler?.isToolLimitReached()) {
                return '*[Tool execution limit reached - no continuation response]*';
            }

            // Extract requested tool from thought tool results
            const requestedTool = this.extractRequestedToolFromResults(toolResults || []);

            // Add agent system prompt with tool-specific details if available
            await this.addAgentSystemPrompt(messages, requestedTool);

            // Use dispatcher for all AI completions
            const { AIDispatcher } = await import('../../utils/aiDispatcher');
            const aiDispatcher = new AIDispatcher(this.plugin.app.vault, this.plugin);

            // Select the provider based on settings
            let continuationContent = '';

            // Stream the completion result
            await aiDispatcher.getCompletion(
                messages,
                {
                    temperature: this.plugin.settings.temperature,
                    streamCallback: async (chunk: string) => {
                        continuationContent += chunk;
                        // (Optional: update UI with streaming chunk)
                    },
                }
            );

            if (this.plugin.settings.debugMode) {
                this.plugin.debugLog('debug', '[TaskContinuation] Continuation response received', { continuationContent });
            }
            return continuationContent;
        } catch (error) {
            if (this.plugin.settings.debugMode) {
                this.plugin.debugLog('debug', '[TaskContinuation] Error getting continuation response', { error });
            }
            console.error('TaskContinuation: Error getting continuation response:', error);
            if (error.name !== 'AbortError') {
                return `*[Error getting continuation: ${error.message}]*`;
            }
            return '';
        }
    }

    /**
     * Extracts the requested tool name from thought tool results
     * @param toolResults Array of tool execution results
     * @returns The name of the tool requested via nextTool parameter, or undefined
     */
    private extractRequestedToolFromResults(toolResults: Array<{ command: ToolCommand; result: ToolResult }>): string | undefined {
        for (const toolResult of toolResults) {
            if (toolResult.command.action === 'thought' && toolResult.result.data) {
                try {
                    const data = typeof toolResult.result.data === 'string' 
                        ? JSON.parse(toolResult.result.data) 
                        : toolResult.result.data;
                    
                    if (data?.nextTool && typeof data.nextTool === 'string') {
                        return data.nextTool;
                    }
                } catch (error) {
                    // Ignore JSON parsing errors
                }
            }
        }
        return undefined;
    }

    /**
     * Adds or updates the agent system prompt with tool-specific details
     * @param messages The messages array to modify
     * @param requestedTool Optional tool name to include detailed parameters for
     */
    private async addAgentSystemPrompt(messages: Message[], requestedTool?: string): Promise<void> {
        const { buildAgentSystemPrompt } = await import('../../promptConstants');
        
        // Build the system prompt with conditional tool details
        const systemPrompt = buildAgentSystemPrompt(
            this.plugin.settings.enabledTools,
            this.plugin.settings.customAgentSystemMessage,
            requestedTool
        );
        
        // Remove ALL existing system messages to avoid duplication
        for (let i = messages.length - 1; i >= 0; i--) {
            if (messages[i].role === 'system') {
                messages.splice(i, 1);
            }
        }
        
        // Add the new system prompt at the beginning
        messages.unshift({
            role: 'system',
            content: systemPrompt
        });
    }

    /**
     * Creates an enhanced message data structure for UI or logging.
     * Includes reasoning, task status, and tool results.
     * @param content The message content
     * @param agentResult The agent's result object
     * @param toolResults Optional array of tool results
     * @returns Message object with additional metadata
     */
    private createEnhancedMessageData(
        content: string, 
        agentResult: any, 
        toolResults?: any[]
    ): Message {
        const messageData: Message = {
            role: 'assistant',
            content,
            reasoning: agentResult.reasoning,
            taskStatus: agentResult.taskStatus
        };

        if (toolResults) {
            messageData.toolResults = toolResults.map(({ command, result }: any) => ({
                command,
                result,
                timestamp: new Date().toISOString()
            }));
        }

        return messageData;
    }

    /**
     * Updates the chat container with enhanced message data and raw content.
     * @param container The chat message container element
     * @param messageData The message data object to store
     * @param rawContent The raw content string
     */
    private updateContainerWithMessageData(
        container: HTMLElement, 
        messageData: Message, 
        rawContent: string
    ): void {
        container.dataset.messageData = JSON.stringify(messageData);
        container.dataset.rawContent = rawContent;
        // (Optional: update UI here if needed)
    }
}
