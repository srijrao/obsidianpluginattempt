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
        let maxIterations = this.plugin.settings.agentMode?.maxIterations ?? 10; 
        let iteration = 0;
        let limitReachedDuringContinuation = false;
        
        let allToolResults = [...initialToolResults];
        
        let isFinished = this.checkIfTaskFinished(allToolResults);
        
        if (this.agentResponseHandler?.isToolLimitReached()) {
            
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
                
                responseContent += '\n\n*[Tool execution limit reached during continuation]*';
                limitReachedDuringContinuation = true;
                break;
            }
            
            const toolResultMessage = this.agentResponseHandler?.createToolResultMessage(allToolResults);
            if (toolResultMessage) {
                
                const continuationMessages: Message[] = [
                    ...messages,
                    { role: 'assistant', content: initialResponseContent },
                    toolResultMessage
                ];
                
                
                const continuationContent = await this.getContinuationResponse(continuationMessages, container);
                if (continuationContent.trim()) {
                    
                    let processingResult;
                    if (this.agentResponseHandler) {
                        processingResult = await this.agentResponseHandler.processResponse(continuationContent, "task-continuation", chatHistory);
                        
                        if (processingResult.toolResults && processingResult.toolResults.length > 0) {
                            allToolResults = [...allToolResults, ...processingResult.toolResults];
                        }
                    }

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
        
        let continuationResult;
        if (processingResult) {
            continuationResult = processingResult;
        } else if (this.agentResponseHandler) {
            continuationResult = await this.agentResponseHandler.processResponse(continuationContent, "main", chatHistory);
        } else {
            
            const updatedContent = responseContent + '\n\n' + continuationContent;
            await this.updateContainerContent(container, updatedContent);
            return { responseContent: updatedContent, isFinished: true };
        }
            
        if (continuationResult.hasTools) {
            
            const cleanContinuationContent = continuationResult.processedText;
            
            
            const isFinished = this.checkIfTaskFinished(continuationResult.toolResults);
            
            
            
            const allToolResults = initialToolResults;
            
            
            const updatedContent = responseContent + '\n\n' + cleanContinuationContent;
            
            
            const enhancedMessageData = this.createEnhancedMessageData(
                updatedContent,
                continuationResult,
                allToolResults
            );
            
            
            this.updateContainerWithMessageData(container, enhancedMessageData, updatedContent);
            
            return { responseContent: updatedContent, isFinished };
        } else {
            
            let isFinished = false;
            try {
                const parsed = JSON.parse(continuationContent);
                if (parsed && parsed.finished === true) {
                    isFinished = true;
                }
            } catch (e) {
                
                
                
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
        return toolResults.some(({ command, result }) => {
            
            if ((command as any).finished === true) {
                return true;
            }
            
            
            if (command.action === 'thought' && result.success && result.data) {
                
                return result.data.nextTool === 'finished' || result.data.finished === true;
            }
            
            return false;
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
            
            if (this.agentResponseHandler?.isToolLimitReached()) {
                
                return '*[Tool execution limit reached - no continuation response]*';
            }
            
            
            const { createProvider, createProviderFromUnifiedModel } = await import('../../../../providers');
            
            
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
        
    }
}
