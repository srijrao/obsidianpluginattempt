import { MarkdownRenderer, Component } from 'obsidian';
import { Message, ToolCommand, ToolResult } from '../../types';
import MyPlugin from '../../main';
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
        initialToolResults: Array<{ command: ToolCommand; result: ToolResult }>
    ): Promise<{ content: string; limitReachedDuringContinuation: boolean; }> {
        let responseContent = currentContent;
        let maxIterations = 10; // Prevent infinite loops
        let iteration = 0;
        let limitReachedDuringContinuation = false;
        
        // Check if any of the initial tool results indicate finished: true
        let isFinished = this.checkIfTaskFinished(initialToolResults);
        
        // Check if tool limit is reached before starting continuation
        if (this.agentResponseHandler?.isToolLimitReached()) {
            console.log('TaskContinuation: Tool limit reached, stopping task continuation');
            return { 
                content: responseContent + '\n\n*[Tool execution limit reached - task continuation stopped]*',
                limitReachedDuringContinuation: true 
            };
        }
        
        while (!isFinished && iteration < maxIterations) {
            iteration++;
            // Removed per-iteration log
              // Check if tool limit is reached before each iteration
            if (this.agentResponseHandler?.isToolLimitReached()) {
                // Essential debug: Log tool limit reached during iteration
                console.log('TaskContinuation: Tool limit reached during iteration, need to show UI warning');
                // Instead of just stopping, we need to trigger the UI warning
                // Break out of the loop and let the caller handle the UI
                responseContent += '\n\n*[Tool execution limit reached during continuation]*';
                limitReachedDuringContinuation = true;
                break;
            }
            
            // Add tool results to context and continue conversation
            const toolResultMessage = this.agentResponseHandler?.createToolResultMessage(initialToolResults);
            if (toolResultMessage) {
                // Continue the conversation with tool results
                messages.push({ role: 'assistant', content: initialResponseContent });
                messages.push(toolResultMessage);
                messages.push({ 
                    role: 'system', 
                    content: 'Continue with the remaining parts of the task. Check your progress and continue until ALL parts of the user\'s request are complete. Set finished: true only when everything is done.'
                });
                
                // Get continuation response
                const continuationContent = await this.getContinuationResponse(messages, container);
                if (continuationContent.trim()) {
                    const continuationResult = await this.processContinuation(
                        continuationContent,
                        responseContent,
                        container,
                        initialToolResults
                    );
                    
                    responseContent = continuationResult.responseContent;
                    isFinished = continuationResult.isFinished;
                    initialResponseContent = continuationContent;
                } else {
                    // No continuation content, task might be finished
                    isFinished = true;
                }
            } else {
                // No tool results to continue with
                isFinished = true;
            }
        }
          if (iteration >= maxIterations) {
            console.warn('TaskContinuation: Task continuation reached maximum iterations');
            responseContent += '\n\n*[Task continuation reached maximum iterations - stopping to prevent infinite loop]*';
        }
        
        // Essential debug: Log once at the end
        console.log(`TaskContinuation: Task continuation completed after ${iteration} iterations`);
        return { content: responseContent, limitReachedDuringContinuation };
    }

    /**
     * Process continuation response and update UI
     */
    private async processContinuation(
        continuationContent: string,
        responseContent: string,
        container: HTMLElement,
        initialToolResults: Array<{ command: ToolCommand; result: ToolResult }>
    ): Promise<{ responseContent: string; isFinished: boolean }> {
        // Process continuation for additional tool commands
        if (this.agentResponseHandler) {
            const continuationResult = await this.agentResponseHandler.processResponse(continuationContent);
            let continuationDisplay = continuationContent;
            
            if (continuationResult.hasTools) {
                continuationDisplay = continuationResult.processedText + 
                    this.agentResponseHandler.formatToolResultsForDisplay(continuationResult.toolResults);
                
                // Check if this iteration is finished
                const isFinished = this.checkIfTaskFinished(continuationResult.toolResults);
                
                // Use the new tool results for next iteration
                initialToolResults.push(...continuationResult.toolResults);
                
                const updatedContent = responseContent + '\n\n' + continuationDisplay;
                await this.updateContainerContent(container, updatedContent);
                
                return { responseContent: updatedContent, isFinished };
            } else {
                // If no tools were used, assume the task might be finished
                const updatedContent = responseContent + '\n\n' + continuationDisplay;
                await this.updateContainerContent(container, updatedContent);
                
                return { responseContent: updatedContent, isFinished: true };
            }
        } else {
            const updatedContent = responseContent + '\n\n' + continuationContent;
            await this.updateContainerContent(container, updatedContent);
            
            return { responseContent: updatedContent, isFinished: true }; // If no agent handler, consider finished
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
            // Check if tool limit is reached before making API call
            if (this.agentResponseHandler?.isToolLimitReached()) {
                console.log('TaskContinuation: Tool limit reached, skipping continuation API call');
                return '*[Tool execution limit reached - no continuation response]*';
            }
            
            // Import provider utilities
            const { createProvider, createProviderFromUnifiedModel } = await import('../../../providers');
            
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
            return continuationContent;
        } catch (error) {
            console.error('TaskContinuation: Error getting continuation response:', error);
            if (error.name !== 'AbortError') {
                // Return a fallback message instead of throwing
                return `*[Error getting continuation: ${error.message}]*`;
            }
            return '';
        }
    }
}
