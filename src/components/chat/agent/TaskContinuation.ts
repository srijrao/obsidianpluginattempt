import { MarkdownRenderer, Component } from 'obsidian';
import { Message, ToolCommand, ToolResult } from '../../../types';
import MyPlugin from '../../../main';
import { AgentResponseHandler } from './AgentResponseHandler';

/**
 * Handles task continuation logic for agent mode
 */
export class TaskContinuation {
    constructor(
        private plugin: MyPlugin,
        private agentResponseHandler: AgentResponseHandler | null,
        private messagesContainer: HTMLElement,
        private component?: Component
    ) {}    /**
     * Continue task execution until finished parameter is true
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
        let maxIterations = 10; // Prevent infinite loops
        let iteration = 0;
        let limitReachedDuringContinuation = false;
        // Accumulate all tool results across iterations
        let allToolResults = [...initialToolResults];
        // Check if any of the initial tool results indicate finished: true
        let isFinished = this.checkIfTaskFinished(allToolResults);
        // Check if tool limit is reached before starting continuation
        if (this.agentResponseHandler?.isToolLimitReached()) {
            // Removed redundant console.log for cleaner production code.
            return { 
                content: responseContent + '\n\n*[Tool execution limit reached - task continuation stopped]*',
                limitReachedDuringContinuation: true 
            };
        }
        if (this.plugin.settings.debugMode) {
            this.plugin.debugLog('debug', '[TaskContinuation] continueTaskUntilFinished', {
                initialResponseContent,
                currentContent,
                initialToolResults,
                maxIterations
            });
        }
        while (!isFinished && iteration < maxIterations) {
            iteration++;
            if (this.agentResponseHandler?.isToolLimitReached()) {
                // Removed redundant console.log for cleaner production code.
                responseContent += '\n\n*[Tool execution limit reached during continuation]*';
                limitReachedDuringContinuation = true;
                break;
            }
            // Always include all tool results so far
            const toolResultMessage = this.agentResponseHandler?.createToolResultMessage(allToolResults);
            if (toolResultMessage) {
                messages.push({ role: 'assistant', content: initialResponseContent });
                messages.push(toolResultMessage);
                messages.push({ 
                    role: 'system', 
                    content: 'Continue with the remaining parts of the task. Check your progress and continue until ALL parts of the user\'s request are complete. Set finished: true only when everything is done.'
                });
                // Get continuation response
                const continuationContent = await this.getContinuationResponse(messages, container);
                if (continuationContent.trim()) {
                    // Process for tools first
                    let processingResult;
                    if (this.agentResponseHandler) {
                        processingResult = await this.agentResponseHandler.processResponse(continuationContent, "task-continuation", chatHistory);
                        // Add new tool results from this step to the accumulator
                        if (processingResult.toolResults && processingResult.toolResults.length > 0) {
                            allToolResults = [...allToolResults, ...processingResult.toolResults];
                        }
                    }

                    const continuationResult = await this.processContinuation(
                        continuationContent,
                        responseContent,
                        container,
                        allToolResults, // pass all so far
                        chatHistory,
                        processingResult // pass the already processed result to avoid double processing
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
            if (this.plugin.settings.debugMode) {
                this.plugin.debugLog('debug', '[TaskContinuation] Iteration', {
                    iteration,
                    isFinished,
                    toolResults: allToolResults
                });
            }
        }
        if (iteration >= maxIterations) {
            if (this.plugin.settings.debugMode) {
                this.plugin.debugLog('debug', '[TaskContinuation] Maximum iterations reached', { iteration });
            }
            responseContent += '\n\n*[Task continuation reached maximum iterations - stopping to prevent infinite loop]*';
        }
        // Removed redundant console.log for cleaner production code.
        return { content: responseContent, limitReachedDuringContinuation };
    }    /**
     * Process continuation response and update UI
     */
    private async processContinuation(
        continuationContent: string,
        responseContent: string,
        container: HTMLElement,
        initialToolResults: Array<{ command: ToolCommand; result: ToolResult }>,
        chatHistory?: any[],
        processingResult?: { processedText: string; toolResults: Array<{ command: ToolCommand; result: ToolResult }>; hasTools: boolean }
    ): Promise<{ responseContent: string; isFinished: boolean }> {
        // Use already processed result if available, otherwise process now
        let continuationResult;
        if (processingResult) {
            continuationResult = processingResult;
        } else if (this.agentResponseHandler) {
            continuationResult = await this.agentResponseHandler.processResponse(continuationContent, "main", chatHistory);
        } else {
            // No agent handler and no processing result
            const updatedContent = responseContent + '\n\n' + continuationContent;
            await this.updateContainerContent(container, updatedContent);
            return { responseContent: updatedContent, isFinished: true };
        }
            
        if (continuationResult.hasTools) {
            // Use the clean processed text, not the display format
            const cleanContinuationContent = continuationResult.processedText;
            
            // Check if this iteration is finished
            const isFinished = this.checkIfTaskFinished(continuationResult.toolResults);
            
            // Combine tool results for the enhanced message data
            const allToolResults = [...initialToolResults, ...continuationResult.toolResults];
            
            // Update content with clean text only
            const updatedContent = responseContent + '\n\n' + cleanContinuationContent;
            
            // Create enhanced message data with all tool results
            const enhancedMessageData = this.createEnhancedMessageData(
                updatedContent,
                continuationResult,
                allToolResults
            );
            
            // Update container with enhanced message data
            this.updateContainerWithMessageData(container, enhancedMessageData, updatedContent);
            
            return { responseContent: updatedContent, isFinished };
        } else {
            // If no tools were used, check if the response itself has finished: true
            let isFinished = false;
            try {
                const parsed = JSON.parse(continuationContent);
                if (parsed && parsed.finished === true) {
                    isFinished = true;
                }
            } catch (e) {
                // Not JSON, ignore
            }
            const updatedContent = responseContent + '\n\n' + continuationContent;
            await this.updateContainerContent(container, updatedContent);
            return { responseContent: updatedContent, isFinished };
        }
    }

    /**
     * Update container content with new text
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
     * Check if any tool results indicate the task is finished
     */
    private checkIfTaskFinished(toolResults: Array<{ command: ToolCommand; result: ToolResult }>): boolean {
        return toolResults.some(({ command }) => {
            // Check if the command has finished: true parameter
            return (command as any).finished === true;
        });
    }    /**
     * Get continuation response after tool execution
     */
    private async getContinuationResponse(
        messages: Message[],
        container: HTMLElement
    ): Promise<string> {
        try {
            if (this.plugin.settings.debugMode) {
                this.plugin.debugLog('debug', '[TaskContinuation] getContinuationResponse', { messages });
            }
            // Check if tool limit is reached before making API call
            if (this.agentResponseHandler?.isToolLimitReached()) {
                // Removed redundant console.log for cleaner production code.
                return '*[Tool execution limit reached - no continuation response]*';
            }
            
            // Import provider utilities
            const { createProvider, createProviderFromUnifiedModel } = await import('../../../../providers');
            
            // Use the same provider setup as the main response
            const provider = this.plugin.settings.selectedModel 
                ? createProviderFromUnifiedModel(this.plugin.settings, this.plugin.settings.selectedModel)
                : createProvider(this.plugin.settings);

            let continuationContent = '';
            
            await provider.getCompletion(
                messages,
                {
                    temperature: this.plugin.settings.temperature,
                    maxTokens: this.plugin.settings.maxTokens,
                    streamCallback: async (chunk: string) => {
                        continuationContent += chunk;
                        // Don't update the UI during continuation streaming
                        // The caller will handle the final update
                    },
                    // Note: We don't pass activeStream here as this is a background operation
                }
            );

            // Removed verbose log for continuation response received
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
                // Return a fallback message instead of throwing
                return `*[Error getting continuation: ${error.message}]*`;
            }
            return '';
        }
    }

    /**
     * Creates enhanced message data structure
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
     * Updates container with enhanced message data
     */
    private updateContainerWithMessageData(
        container: HTMLElement, 
        messageData: Message, 
        rawContent: string
    ): void {
        container.dataset.messageData = JSON.stringify(messageData);
        container.dataset.rawContent = rawContent;
        // Note: MessageRenderer update would need to be called by the parent if needed
    }
}
