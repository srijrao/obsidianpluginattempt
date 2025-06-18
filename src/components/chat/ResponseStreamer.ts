import { Notice, MarkdownRenderer, Component } from 'obsidian';
import { Message, ToolCommand, ToolResult } from '../../types';
import { createProvider, createProviderFromUnifiedModel } from '../../../providers';
import MyPlugin from '../../main';
import { AgentResponseHandler } from './AgentResponseHandler';
import { MessageRenderer } from './MessageRenderer';
import { TaskContinuation } from './TaskContinuation';

interface ContinuationParams {
    messages: Message[];
    container: HTMLElement;
    responseContent: string;
    finalContent: string;
    toolResults: Array<{ command: ToolCommand; result: ToolResult }>;
    additionalTools?: number;
}

/**
 * Handles streaming responses from AI providers and processing agent tasks.
 * Manages the complete lifecycle of AI responses including streaming, tool execution,
 * and task continuation with tool limit management.
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
    }    /**
     * Streams AI assistant response with optional agent processing.
     * Handles agent mode integration, tool execution, and task continuation.
     */
    async streamAssistantResponse(
        messages: Message[],
        container: HTMLElement,
        originalTimestamp?: string,
        originalContent?: string
    ): Promise<string> {
        let responseContent = '';
        this.activeStream = new AbortController();

        await this.addAgentSystemPrompt(messages);

        try {
            const provider = this.createProvider();
            
            await provider.getCompletion(messages, {
                temperature: this.plugin.settings.temperature,
                maxTokens: this.plugin.settings.maxTokens,
                streamCallback: async (chunk: string) => {
                    responseContent += chunk;
                    await this.updateMessageContent(container, responseContent);
                },
                abortController: this.activeStream || undefined
            });

            if (this.plugin.isAgentModeEnabled() && this.agentResponseHandler) {
                responseContent = await this.processAgentResponse(responseContent, container, messages);
            }

            return responseContent;
        } catch (error) {
            if (error.name !== 'AbortError') {
                throw error;
            }
            return '';
        } finally {
            this.agentResponseHandler?.hideTaskProgress();
        }
    }

    /**
     * Creates AI provider instance based on current settings
     */
    private createProvider() {
        return this.plugin.settings.selectedModel 
            ? createProviderFromUnifiedModel(this.plugin.settings, this.plugin.settings.selectedModel)
            : createProvider(this.plugin.settings);
    }    /**
     * Adds agent system prompt to messages if agent mode is enabled
     */
    private async addAgentSystemPrompt(messages: Message[]): Promise<void> {
        if (!this.plugin.isAgentModeEnabled()) return;

        const { buildAgentSystemPrompt } = await import('../../promptConstants');
        // Build dynamic prompt based on current plugin settings
        const agentPrompt = buildAgentSystemPrompt(this.plugin.settings.enabledTools);
        
        // Essential debug: Log agent mode enabled and enabled tools
        console.log('ResponseStreamer: Agent mode enabled, enabled tools:', this.plugin.settings.enabledTools);
        
        const systemMessageIndex = messages.findIndex(msg => msg.role === 'system');
        if (systemMessageIndex !== -1) {
            const originalContent = messages[systemMessageIndex].content;
            messages[systemMessageIndex].content = agentPrompt + '\n\n' + originalContent;
        } else {
            // If no system message exists, create one
            messages.unshift({
                role: 'system',
                content: agentPrompt
            });
        }
        // Removed verbose logs for updated/created system message and prompt preview
    }

    /**
     * Updates message content in the UI with markdown rendering
     */
    private async updateMessageContent(container: HTMLElement, content: string): Promise<void> {
        const contentEl = container.querySelector('.message-content') as HTMLElement;
        if (!contentEl) return;

        container.dataset.rawContent = content;
        contentEl.empty();
        await MarkdownRenderer.render(
            this.plugin.app,
            content,
            contentEl,
            '',
            this.component || null as any
        );
        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    }    /**
     * Processes agent response and handles tool execution or reasoning
     */
    private async processAgentResponse(
        responseContent: string,
        container: HTMLElement,
        messages: Message[]
    ): Promise<string> {
        if (!this.agentResponseHandler) {
            console.log('ResponseStreamer: No agent response handler available');
            return responseContent;
        }

        // Essential debug: Log agent response processing and task status
        console.log('ResponseStreamer: Processing agent response');
        try {
            const agentResult = await this.agentResponseHandler.processResponseWithUI(responseContent);
            console.log('ResponseStreamer: Agent result taskStatus:', agentResult.taskStatus);
            return agentResult.hasTools 
                ? await this.handleToolExecution(agentResult, container, responseContent, messages)
                : await this.handleNonToolResponse(agentResult, container, responseContent, messages);
        } catch (error) {
            console.error('ResponseStreamer: Error processing agent response:', error);
            return responseContent;
        }
    }

    /**
     * Handles responses that include tool execution
     */
    private async handleToolExecution(
        agentResult: any,
        container: HTMLElement,
        responseContent: string,
        messages: Message[]
    ): Promise<string> {
        const finalContent = agentResult.processedText + 
            this.agentResponseHandler!.formatToolResultsForDisplay(agentResult.toolResults);
        
        const enhancedMessageData = this.createEnhancedMessageData(
            finalContent, 
            agentResult, 
            agentResult.toolResults
        );
        
        this.updateContainerWithMessageData(container, enhancedMessageData, finalContent);
        
        return this.handleTaskCompletion(agentResult, finalContent, responseContent, messages, container);
    }

    /**
     * Handles responses without tool execution but potentially with reasoning
     */
    private async handleNonToolResponse(
        agentResult: any,
        container: HTMLElement,
        responseContent: string,
        messages: Message[]
    ): Promise<string> {
        if (agentResult.reasoning) {
            const enhancedMessageData = this.createEnhancedMessageData(responseContent, agentResult);
            this.updateContainerWithMessageData(container, enhancedMessageData, responseContent);
        }
        
        if (this.isReasoningStep(responseContent)) {
            return await this.handleReasoningContinuation(responseContent, messages, container);
        }

        return responseContent;
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
        this.messageRenderer.updateMessageWithEnhancedData(container, messageData);
    }

    /**
     * Checks if response content indicates a reasoning step
     */
    private isReasoningStep(responseContent: string): boolean {
        return responseContent.includes('"action"') && responseContent.includes('"thought"');
    }    /**
     * Handles task completion, continuation, and tool limit management
     */
    private async handleTaskCompletion(
        agentResult: any,
        finalContent: string,
        responseContent: string,
        messages: Message[],
        container: HTMLElement
    ): Promise<string> {
        if (agentResult.shouldShowLimitWarning) {
            return this.handleToolLimitReached(messages, container, responseContent, finalContent, agentResult.toolResults);
        }
        
        if (agentResult.taskStatus.status === 'completed') {
            this.showTaskCompletionNotification(
                `Task completed successfully! Used ${agentResult.taskStatus.toolExecutionCount} tools.`,
                'success'
            );
            return finalContent;
        }

        return await this.continueTaskIfPossible(
            agentResult, messages, container, responseContent, finalContent
        );
    }

    /**
     * Handles tool limit reached scenario
     */
    private handleToolLimitReached(
        messages: Message[],
        container: HTMLElement,
        responseContent: string,
        finalContent: string,
        toolResults: any[]
    ): string {
        const warning = this.agentResponseHandler!.createToolLimitWarning();
        this.messagesContainer.appendChild(warning);
        
        this.setupContinuationEventListeners(messages, container, responseContent, finalContent, toolResults);
        
        this.showTaskCompletionNotification(
            'Tool execution limit reached. Choose how to continue above.',
            'warning'
        );
        
        return finalContent;
    }

    /**
     * Sets up event listeners for task continuation
     */
    private setupContinuationEventListeners(
        messages: Message[],
        container: HTMLElement,
        responseContent: string,
        finalContent: string,
        toolResults: any[]
    ): void {
        const continuationParams: ContinuationParams = {
            messages, container, responseContent, finalContent, toolResults
        };

        this.messagesContainer.addEventListener('continueTask', () => {
            this.executeContinuation(continuationParams);
        });
        
        this.messagesContainer.addEventListener('continueTaskWithAdditionalTools', (event: CustomEvent) => {
            this.executeContinuation({
                ...continuationParams,
                additionalTools: event.detail.additionalTools
            });
        });
    }

    /**
     * Continues task if no limits are reached
     */
    private async continueTaskIfPossible(
        agentResult: any,
        messages: Message[],
        container: HTMLElement,
        responseContent: string,
        finalContent: string
    ): Promise<string> {
        if (agentResult.shouldShowLimitWarning || this.agentResponseHandler?.isToolLimitReached()) {
            return finalContent;
        }

        const taskContinuation = this.createTaskContinuation();
        const continuationResult = await taskContinuation.continueTaskUntilFinished(
            messages, container, responseContent, finalContent, agentResult.toolResults
        );
        
        if (continuationResult.limitReachedDuringContinuation) {
            this.handleToolLimitReached(
                messages, container, responseContent, 
                continuationResult.content, agentResult.toolResults
            );
        }
        
        return continuationResult.content;
    }

    /**
     * Creates TaskContinuation instance
     */
    private createTaskContinuation(): TaskContinuation {
        return new TaskContinuation(
            this.plugin,
            this.agentResponseHandler,
            this.messagesContainer,
            this.component
        );
    }

    /**
     * Shows task completion notification
     */
    private showTaskCompletionNotification(message: string, type: 'success' | 'warning'): void {
        this.agentResponseHandler!.showTaskCompletionNotification(message, type);
    }    /**
     * Handles reasoning continuation when AI response contains reasoning steps
     */
    private async handleReasoningContinuation(
        responseContent: string,
        messages: Message[],
        container: HTMLElement
    ): Promise<string> {
        if (this.agentResponseHandler?.isToolLimitReached()) {
            console.log('ResponseStreamer: Tool limit reached, skipping reasoning continuation');
            return responseContent + '\n\n*[Tool execution limit reached - reasoning continuation stopped]*';
        }
        
        messages.push(
            { role: 'assistant', content: responseContent },
            { role: 'system', content: 'Please continue with the actual task execution based on your reasoning.' }
        );
        
        const continuationContent = await this.getContinuationResponse(messages, container);
        if (continuationContent.trim()) {
            const updatedContent = responseContent + '\n\n' + continuationContent;
            container.dataset.rawContent = updatedContent;
            await this.updateMessageContent(container, updatedContent);
            return updatedContent;
        }
        return responseContent;
    }

    /**
     * Gets continuation response after tool execution with error handling
     */
    async getContinuationResponse(messages: Message[], container: HTMLElement): Promise<string> {
        try {
            if (this.agentResponseHandler?.isToolLimitReached()) {
                console.log('ResponseStreamer: Tool limit reached, skipping continuation API call');
                return '*[Tool execution limit reached - no continuation response]*';
            }
            
            const provider = this.createProvider();
            let continuationContent = '';
            
            await provider.getCompletion(messages, {
                temperature: this.plugin.settings.temperature,
                maxTokens: this.plugin.settings.maxTokens,
                streamCallback: async (chunk: string) => {
                    continuationContent += chunk;
                },
                abortController: this.activeStream || undefined
            });

            // Removed verbose logs for getting/received continuation response
            return continuationContent;
        } catch (error) {
            console.error('ResponseStreamer: Error getting continuation response:', error);
            return error.name !== 'AbortError' 
                ? `*[Error getting continuation: ${error.message}]*`
                : '';
        }
    }

    /**
     * Executes task continuation with proper setup and error handling
     */
    private async executeContinuation(params: ContinuationParams): Promise<void> {
        if (!this.agentResponseHandler) return;

        const { messages, container, responseContent, finalContent, toolResults, additionalTools } = params;
        
        if (additionalTools) {
            console.log(`ResponseStreamer: Continuing task with ${additionalTools} additional tool executions`);
        } else {
            this.agentResponseHandler.resetExecutionCount();
            console.log('ResponseStreamer: Execution count reset, continuing task after user request');
        }

        const continueMessage = this.createContinuationMessage(additionalTools);
        await this.addContinuationNotice(continueMessage);
        
        messages.push({ role: 'assistant', content: finalContent }, continueMessage);
        
        const newBotMessage = await this.createNewBotMessage();
        const continuationResult = await this.executeTaskContinuation(
            messages, newBotMessage.getElement(), responseContent, toolResults
        );
        
        if (continuationResult.limitReachedDuringContinuation) {
            this.handleToolLimitReached(
                messages, newBotMessage.getElement(), responseContent, 
                continuationResult.content, toolResults
            );
        }
        
        newBotMessage.setContent(continuationResult.content);
    }

    /**
     * Creates continuation message based on type
     */
    private createContinuationMessage(additionalTools?: number): Message {
        const content = additionalTools 
            ? `Added ${additionalTools} additional tool executions. Continuing with the task...`
            : 'Tool execution limit was reset. Continuing with the task...';
            
        return { role: 'system', content };
    }

    /**
     * Adds continuation notice to chat
     */
    private async addContinuationNotice(continueMessage: Message): Promise<void> {
        const { BotMessage } = await import('./BotMessage');
        const continuationNotice = new BotMessage(this.plugin.app, this.plugin, continueMessage.content);
        const element = continuationNotice.getElement();
        element.style.opacity = '0.8';
        element.style.fontStyle = 'italic';
        this.messagesContainer.appendChild(element);
    }

    /**
     * Creates new bot message for continuation response
     */
    private async createNewBotMessage() {
        const { BotMessage } = await import('./BotMessage');
        const newBotMessage = new BotMessage(this.plugin.app, this.plugin, '');
        this.messagesContainer.appendChild(newBotMessage.getElement());
        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
        return newBotMessage;
    }

    /**
     * Executes task continuation logic
     */
    private async executeTaskContinuation(
        messages: Message[],
        container: HTMLElement,
        responseContent: string,
        toolResults: any[]
    ) {
        const taskContinuation = this.createTaskContinuation();
        return await taskContinuation.continueTaskUntilFinished(
            messages, container, responseContent, '', toolResults
        );
    }}
