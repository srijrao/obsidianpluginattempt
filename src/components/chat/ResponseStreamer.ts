import { Notice, MarkdownRenderer, Component } from 'obsidian';
import { Message, ToolCommand, ToolResult } from '../../types';
import { createProvider, createProviderFromUnifiedModel } from '../../../providers';
import MyPlugin from '../../main';
import { AgentResponseHandler } from './AgentResponseHandler';
import { MessageRenderer } from './MessageRenderer';
import { TaskContinuation } from './TaskContinuation';
/**
 * Handles streaming responses from AI providers and processing agent tasks
 */
export class ResponseStreamer {
    private messageRenderer: MessageRenderer;

    constructor(
        private plugin: MyPlugin,
        private agentResponseHandler: AgentResponseHandler | null,
        private messagesContainer: HTMLElement,
        private activeStream: AbortController | null,
        private component?: Component
    ) {
        this.messageRenderer = new MessageRenderer(plugin.app);
    }

    async streamAssistantResponse(
        messages: Message[],
        container: HTMLElement,
        originalTimestamp?: string,
        originalContent?: string
    ): Promise<string> {
        let responseContent = '';
        this.activeStream = new AbortController();

        // Add agent system prompt if agent mode is enabled
        if (this.plugin.isAgentModeEnabled()) {
            // Import agent system prompt and prepend to system message
            const { AGENT_SYSTEM_PROMPT } = await import('../../promptConstants');
            const systemMessageIndex = messages.findIndex(msg => msg.role === 'system');
            if (systemMessageIndex !== -1) {
                messages[systemMessageIndex].content = AGENT_SYSTEM_PROMPT + '\n\n' + messages[systemMessageIndex].content;
            }
        }

        try {
            // Use unified model if available, fallback to legacy provider selection
            const provider = this.plugin.settings.selectedModel 
                ? createProviderFromUnifiedModel(this.plugin.settings, this.plugin.settings.selectedModel)
                : createProvider(this.plugin.settings);
            
            await provider.getCompletion(
                messages,
                {
                    temperature: this.plugin.settings.temperature,
                    maxTokens: this.plugin.settings.maxTokens,
                    streamCallback: async (chunk: string) => {
                        responseContent += chunk;
                        const contentEl = container.querySelector('.message-content') as HTMLElement;
                        if (contentEl) {
                            container.dataset.rawContent = responseContent;
                            contentEl.empty();
                            await MarkdownRenderer.render(
                                this.plugin.app,
                                responseContent,
                                contentEl,
                                '',
                                this.component || null as any
                            );
                            this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
                        }
                    },
                    abortController: this.activeStream || undefined
                }
            );

            // Process response for agent tools if agent mode is enabled
            if (this.plugin.isAgentModeEnabled() && this.agentResponseHandler) {
                responseContent = await this.processAgentResponse(
                    responseContent, 
                    container, 
                    messages
                );
            }

            return responseContent;
        } catch (error) {
            if (error.name !== 'AbortError') {
                throw error;
            }
            return '';
        }
    }

    private async processAgentResponse(
        responseContent: string,
        container: HTMLElement,
        messages: Message[]
    ): Promise<string> {
        if (!this.agentResponseHandler) return responseContent;

        // Always hide any previous progress indicator before starting a new one
        this.agentResponseHandler.hideTaskProgress();
        // Show task progress indicator
        this.agentResponseHandler.updateTaskProgress(1, undefined, 'Processing AI response...');
        
        try {
            // Use enhanced processing with UI integration
            const agentResult = await this.agentResponseHandler.processResponseWithUI(responseContent);
            // Hide task progress after processing
            this.agentResponseHandler.hideTaskProgress();
            
            if (agentResult.hasTools) {
                return await this.handleToolExecution(
                    agentResult, 
                    container, 
                    responseContent, 
                    messages
                );
            } else {
                return await this.handleNonToolResponse(
                    agentResult, 
                    container, 
                    responseContent, 
                    messages
                );
            }
        } finally {
            // Ensure progress indicator is always hidden, even on error
            this.agentResponseHandler.hideTaskProgress();
        }
    }

    private async handleToolExecution(
        agentResult: any,
        container: HTMLElement,
        responseContent: string,
        messages: Message[]
    ): Promise<string> {
        // Update the display with processed text and tool execution results
        const finalContent = agentResult.processedText + 
            this.agentResponseHandler!.formatToolResultsForDisplay(agentResult.toolResults);
        
        // Update container with enhanced message data
        const enhancedMessageData: Message = {
            role: 'assistant',
            content: finalContent,
            reasoning: agentResult.reasoning,
            taskStatus: agentResult.taskStatus,
            toolResults: agentResult.toolResults.map(({ command, result }: any) => ({
                command,
                result,
                timestamp: new Date().toISOString()
            }))
        };
        
        // Store enhanced message data in container
        container.dataset.messageData = JSON.stringify(enhancedMessageData);
        container.dataset.rawContent = finalContent;
        
        // Update UI to show reasoning and task status
        this.messageRenderer.updateMessageWithEnhancedData(container, enhancedMessageData);
        
        // Handle task completion or continuation
        return this.handleTaskCompletion(
            agentResult, 
            finalContent, 
            responseContent, 
            messages, 
            container
        );
    }

    private async handleNonToolResponse(
        agentResult: any,
        container: HTMLElement,
        responseContent: string,
        messages: Message[]
    ): Promise<string> {
        // No tools used, but may have reasoning
        if (agentResult.reasoning) {
            const enhancedMessageData: Message = {
                role: 'assistant',
                content: responseContent,
                reasoning: agentResult.reasoning,
                taskStatus: agentResult.taskStatus
            };
            
            container.dataset.messageData = JSON.stringify(enhancedMessageData);
            this.messageRenderer.updateMessageWithEnhancedData(container, enhancedMessageData);
        }
        
        // Check if this was just a reasoning step and we need to continue
        if (responseContent.includes('"action"') && responseContent.includes('"thought"')) {
            return await this.handleReasoningContinuation(responseContent, messages, container);
        }

        return responseContent;
    }

    private async handleTaskCompletion(
        agentResult: any,
        finalContent: string,
        responseContent: string,
        messages: Message[],
        container: HTMLElement
    ): Promise<string> {
        // Show tool limit warning if needed
        if (agentResult.shouldShowLimitWarning) {
            const warning = this.agentResponseHandler!.createToolLimitWarning();
            this.messagesContainer.appendChild(warning);
            
            // Add continue task event listener
            this.messagesContainer.addEventListener('continueTask', () => {
                this.handleContinueTask(messages, container, responseContent, finalContent, agentResult.toolResults);
            });
        }
        
        // Show completion notification if task completed
        if (agentResult.taskStatus.status === 'completed') {
            this.agentResponseHandler!.showTaskCompletionNotification(
                `Task completed successfully! Used ${agentResult.taskStatus.toolExecutionCount} tools.`,
                'success'
            );
            return finalContent;
        } else if (agentResult.taskStatus.status === 'limit_reached') {
            this.agentResponseHandler!.showTaskCompletionNotification(
                'Tool execution limit reached. You can continue the task or increase the limit in settings.',
                'warning'
            );
        }        // Continue task execution until finished (only if not at limit)
        if (!agentResult.shouldShowLimitWarning) {
            // Use task continuation logic
            const taskContinuation = new TaskContinuation(
                this.plugin,
                this.agentResponseHandler,
                this.messagesContainer,
                this.component
            );
            
            return await taskContinuation.continueTaskUntilFinished(
                messages, 
                container, 
                responseContent, 
                finalContent, 
                agentResult.toolResults
            );
        } else {
            return finalContent;
        }
    }

    private async handleReasoningContinuation(
        responseContent: string,
        messages: Message[],
        container: HTMLElement
    ): Promise<string> {
        // This looks like a tool command that wasn't properly formatted, continue anyway
        messages.push({ role: 'assistant', content: responseContent });
        messages.push({ role: 'system', content: 'Please continue with the actual task execution based on your reasoning.' });
        
        const continuationContent = await this.getContinuationResponse(messages, container);
        if (continuationContent.trim()) {
            const updatedContent = responseContent + '\n\n' + continuationContent;
            container.dataset.rawContent = updatedContent;
            const contentEl = container.querySelector('.message-content') as HTMLElement;
            if (contentEl) {
                contentEl.empty();
                            await MarkdownRenderer.render(
                                this.plugin.app,
                                updatedContent,
                                contentEl,
                                '',
                                this.component || null as any
                            );
                this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
            }
            return updatedContent;
        }
        return responseContent;
    }

    /**
     * Get continuation response after tool execution
     */
    async getContinuationResponse(
        messages: Message[],
        container: HTMLElement
    ): Promise<string> {
        try {
            console.log('ResponseStreamer: Getting continuation response after tool execution');
            
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
                    abortController: this.activeStream || undefined
                }
            );

            console.log('ResponseStreamer: Continuation response received:', continuationContent.length, 'characters');
            return continuationContent;
        } catch (error) {
            console.error('ResponseStreamer: Error getting continuation response:', error);
            if (error.name !== 'AbortError') {
                // Return a fallback message instead of throwing
                return `*[Error getting continuation: ${error.message}]*`;
            }
            return '';
        }
    }

    /**
     * Handle continue task after tool limit reached
     */
    private async handleContinueTask(
        messages: Message[], 
        container: HTMLElement, 
        responseContent: string, 
        finalContent: string, 
        toolResults: Array<{ command: ToolCommand; result: ToolResult }>
    ): Promise<void> {        // Reset execution count and continue task
        if (this.agentResponseHandler) {
            this.agentResponseHandler.resetExecutionCount();
            
            // Use task continuation logic
            const taskContinuation = new TaskContinuation(
                this.plugin,
                this.agentResponseHandler,
                this.messagesContainer,
                this.component
            );
            
            // Continue task execution
            const continuedContent = await taskContinuation.continueTaskUntilFinished(
                messages,
                container,
                responseContent,
                finalContent,
                toolResults
            );
            
            // Update the container with continued content
            container.dataset.rawContent = continuedContent;
            const contentEl = container.querySelector('.message-content') as HTMLElement;
            if (contentEl) {
                contentEl.empty();
                await MarkdownRenderer.render(
                    this.plugin.app,
                    continuedContent,
                    contentEl,
                    '',
                    this.component || null as any
                );
                this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
            }
        }
    }
}
