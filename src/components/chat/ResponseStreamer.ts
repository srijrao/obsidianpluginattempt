import { Notice, MarkdownRenderer, Component } from 'obsidian';
import { Message, ToolCommand, ToolResult } from '../../types';
import { createProvider, createProviderFromUnifiedModel } from '../../../providers';
import MyPlugin from '../../main';
import { AgentResponseHandler } from './agent/AgentResponseHandler';
import { MessageRenderer } from './MessageRenderer';
import { TaskContinuation } from './agent/TaskContinuation';

/**
 * Parameters for task continuation.
 */
interface ContinuationParams {
    messages: Message[]; // Message history for the continuation request
    container: HTMLElement; // The message container element
    responseContent: string; // The current response content
    finalContent: string; // The final content after initial processing
    toolResults: Array<{ command: ToolCommand; result: ToolResult }>; // Tool results from the previous step
    additionalTools?: number; // Number of additional tool executions allowed (if resetting limit)
    chatHistory?: any[]; // Optional chat history for context
}

/**
 * Handles streaming responses from AI providers and processing agent tasks.
 * Manages the complete lifecycle of AI responses including streaming, tool execution,
 * and task continuation with tool limit management.
 */
export class ResponseStreamer {
    private messageRenderer: MessageRenderer;

    /**
     * @param plugin The main plugin instance (for settings, logging, etc.)
     * @param agentResponseHandler Handler for agent responses and tool execution (null if agent mode is off)
     * @param messagesContainer The container element for chat messages
     * @param activeStream The current AbortController for streaming (shared reference)
     * @param component Optional parent component for Markdown rendering context
     */
    constructor(
        private plugin: MyPlugin,
        private agentResponseHandler: AgentResponseHandler | null,
        private messagesContainer: HTMLElement,
        private activeStream: AbortController | null,
        private component?: Component
    ) {
        this.messageRenderer = new MessageRenderer(plugin.app);
    }

    /**
     * Streams AI assistant response with optional agent processing.
     * Handles agent mode integration, tool execution, and task continuation.
     * @param messages The conversation history/messages to send to the provider
     * @param container The message container element to update with the streamed response
     * @param originalTimestamp Optional timestamp for history update
     * @param originalContent Optional original content for history update
     * @param chatHistory Optional chat history for context
     * @returns Promise resolving to the final response content string
     */
    async streamAssistantResponse(
        messages: Message[],
        container: HTMLElement,
        originalTimestamp?: string,
        originalContent?: string,
        chatHistory?: any[]
    ): Promise<string> {
        this.plugin.debugLog('info', '[ResponseStreamer] streamAssistantResponse called', { messages, originalTimestamp });
        let responseContent = '';
        // Create a new AbortController for this stream
        this.activeStream = new AbortController();

        // Add agent system prompt if agent mode is enabled
        await this.addAgentSystemPrompt(messages);

        try {
            // Create the AI provider instance
            const provider = this.createProvider();

            // Get completion from the provider, streaming the response
            await provider.getCompletion(messages, {
                temperature: this.plugin.settings.temperature,
                maxTokens: this.plugin.settings.maxTokens,
                streamCallback: async (chunk: string) => {
                    responseContent += chunk;
                    // Update the UI with the streamed chunk
                    await this.updateMessageContent(container, responseContent);
                },
                abortController: this.activeStream || undefined // Pass the abort controller
            });

            // If agent mode is enabled, process the full response for tools/reasoning
            if (this.plugin.agentModeManager.isAgentModeEnabled() && this.agentResponseHandler) {
                responseContent = await this.processAgentResponse(responseContent, container, messages, "streamer-main", chatHistory);
            }

            return responseContent;
        } catch (error) {
            // If the error is not an AbortError (user stopped), re-throw
            if (error.name !== 'AbortError') {
                throw error;
            }
            // If it's an AbortError, return empty string
            return '';
        } finally {
            // Hide task progress indicator when streaming finishes (either success or error)
            this.agentResponseHandler?.hideTaskProgress();
        }
    }

    /**
     * Creates AI provider instance based on current settings.
     */
    private createProvider() {
        return this.plugin.settings.selectedModel 
            ? createProviderFromUnifiedModel(this.plugin.settings, this.plugin.settings.selectedModel)
            : createProvider(this.plugin.settings);
    }

    /**
     * Adds agent system prompt to messages if agent mode is enabled.
     * Prepends the agent prompt to the existing system message or adds a new one.
     * @param messages The message array to modify
     */
    private async addAgentSystemPrompt(messages: Message[]) {
        this.plugin.debugLog('debug', '[ResponseStreamer] addAgentSystemPrompt called', { messages });
        if (!this.plugin.agentModeManager.isAgentModeEnabled()) return;

        // Dynamically import the agent prompt builder
        const { buildAgentSystemPrompt } = await import('../../promptConstants');

        // Build the agent-specific system prompt
        const agentPrompt = buildAgentSystemPrompt(
            this.plugin.settings.enabledTools, 
            this.plugin.settings.customAgentSystemMessage
        );

        // Find the existing system message
        const systemMessageIndex = messages.findIndex(msg => msg.role === 'system');
        if (systemMessageIndex !== -1) {
            // Prepend agent prompt to the existing system message
            const originalContent = messages[systemMessageIndex].content;
            messages[systemMessageIndex].content = agentPrompt + '\n\n' + originalContent;
        } else {
            // Add agent prompt as the first system message
            messages.unshift({
                role: 'system',
                content: agentPrompt
            });
        }
    }

    /**
     * Updates message content in the UI with markdown rendering.
     * @param container The message DOM element
     * @param content The new content string
     */
    private async updateMessageContent(container: HTMLElement, content: string): Promise<void> {
        const contentEl = container.querySelector('.message-content') as HTMLElement;
        if (!contentEl) return;

        // Update dataset for raw content
        this.updateContainerDataset(container, content);
        // Clear and re-render markdown
        contentEl.empty();
        await MarkdownRenderer.render(
            this.plugin.app,
            content,
            contentEl,
            '',
            this.component || null as any
        );
        // Scroll to bottom
        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    }

    /**
     * Processes agent response and handles tool execution or reasoning.
     * Calls the AgentResponseHandler to parse and execute tools.
     * @param responseContent The raw response content from the AI
     * @param container The message DOM element
     * @param messages The message history
     * @param contextLabel Label for the processing context
     * @param chatHistory Optional chat history
     * @returns Promise resolving to the final content after processing
     */
    private async processAgentResponse(
        responseContent: string,
        container: HTMLElement,
        messages: Message[],
        contextLabel: string = "streamer",
        chatHistory?: any[]
    ): Promise<string> {
        if (!this.agentResponseHandler) {
            // Should not happen if agent mode is checked, but as a safeguard
            return responseContent;
        }

        try {
            // Process the response, execute tools, and update UI
            const agentResult = await this.agentResponseHandler.processResponseWithUI(responseContent, contextLabel, chatHistory);

            // Handle based on whether tools were found/executed
            return agentResult.hasTools
                ? await this.handleToolExecution(agentResult, container, responseContent, messages, chatHistory)
                : await this.handleNonToolResponse(agentResult, container, responseContent, messages, chatHistory);
        } catch (error) {
            console.error('ResponseStreamer: Error processing agent response:', error);
            // Return original content if processing fails
            return responseContent;
        }
    }

    /**
     * Handles responses that include tool execution.
     * Updates the message with rich tool displays and handles task completion/continuation.
     * @param agentResult The result from AgentResponseHandler
     * @param container The message DOM element
     * @param responseContent The raw response content
     * @param messages The message history
     * @param chatHistory Optional chat history
     * @returns Promise resolving to the final content after handling
     */
    private async handleToolExecution(
        agentResult: any,
        container: HTMLElement,
        responseContent: string,
        messages: Message[],
        chatHistory?: any[]
    ): Promise<string> {
        // The processed text (without tool JSON)
        const finalContent = agentResult.processedText;

        // Create enhanced message data including tool results
        const enhancedMessageData = this.createEnhancedMessageData(
            finalContent,
            agentResult,
            agentResult.toolResults
        );

        // Update the container with the enhanced data and re-render
        this.updateContainerWithMessageData(container, enhancedMessageData, finalContent);

        // Handle task completion or continuation based on tool results
        return this.handleTaskCompletion(agentResult, finalContent, responseContent, messages, container, chatHistory);
    }

    /**
     * Handles responses without tool execution but potentially with reasoning.
     * Updates the message with reasoning display and checks for reasoning continuation.
     * @param agentResult The result from AgentResponseHandler
     * @param container The message DOM element
     * @param responseContent The raw response content
     * @param messages The message history
     * @param chatHistory Optional chat history
     * @returns Promise resolving to the final content after handling
     */
    private async handleNonToolResponse(
        agentResult: any,
        container: HTMLElement,
        responseContent: string,
        messages: Message[],
        chatHistory?: any[]
    ): Promise<string> {
        // If reasoning is present, update the message display
        if (agentResult.reasoning) {
            const enhancedMessageData = this.createEnhancedMessageData(responseContent, agentResult);
            this.updateContainerWithMessageData(container, enhancedMessageData, responseContent);
        }

        // Check if the response indicates a reasoning step that requires continuation
        if (this.isReasoningStep(responseContent)) {
            return await this.handleReasoningContinuation(responseContent, messages, container, chatHistory);
        }

        // Otherwise, return the original response content
        return responseContent;
    }

    /**
     * Creates enhanced message data structure including reasoning, task status, and tool results.
     * @param content The main message content
     * @param agentResult The agent's processing result
     * @param toolResults Optional array of tool execution results
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
     * Updates container with enhanced message data and re-renders using MessageRenderer.
     * @param container The message DOM element
     * @param messageData The enhanced message data
     * @param rawContent The raw content string
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
     * DRY helper: Updates container dataset values for rawContent and messageData.
     * @param container The message DOM element
     * @param rawContent The raw content string
     * @param messageData Optional enhanced message data
     */
    private updateContainerDataset(
        container: HTMLElement,
        rawContent: string,
        messageData?: Message
    ): void {
        container.dataset.rawContent = rawContent;
        if (messageData) {
            container.dataset.messageData = JSON.stringify(messageData);
        }
    }

    /**
     * Checks if response content indicates a reasoning step (heuristic based on thought tool JSON).
     * @param responseContent The response content string
     * @returns True if it seems like a reasoning step, false otherwise
     */
    private isReasoningStep(responseContent: string): boolean {
        return responseContent.includes('"action"') && responseContent.includes('"thought"');
    }

    /**
     * Handles task completion, continuation, and tool limit management.
     * Determines if the task is finished, if continuation is needed, or if limits are reached.
     * @param agentResult The result from AgentResponseHandler
     * @param finalContent The processed content (without tool JSON)
     * @param responseContent The raw response content
     * @param messages The message history
     * @param container The message DOM element
     * @param chatHistory Optional chat history
     * @returns Promise resolving to the final content after handling
     */
    private async handleTaskCompletion(
        agentResult: any,
        finalContent: string,
        responseContent: string,
        messages: Message[],
        container: HTMLElement,
        chatHistory?: any[]
    ): Promise<string> {
        // If tool limit warning is needed, show it and stop continuation
        if (agentResult.shouldShowLimitWarning) {
            return this.handleToolLimitReached(messages, container, responseContent, finalContent, agentResult.toolResults, chatHistory);
        }

        // If task is explicitly completed, show notification
        if (agentResult.taskStatus.status === 'completed') {
            this.agentResponseHandler!.showTaskCompletionNotification(
                `Task completed successfully! Used ${agentResult.taskStatus.toolExecutionCount} tools.`,
                'success'
            );
            return finalContent;
        }

        // Otherwise, continue the task if possible
        return await this.continueTaskIfPossible(
            agentResult, messages, container, responseContent, finalContent, chatHistory
        );
    }

    /**
     * Handles tool limit reached scenario.
     * Displays a warning and sets up event listeners for user-driven continuation.
     * @param messages The message history
     * @param container The message DOM element
     * @param responseContent The raw response content
     * @param finalContent The processed content
     * @param toolResults Tool results from the last step
     * @param chatHistory Optional chat history
     * @returns The final content with the warning appended
     */
    private handleToolLimitReached(
        messages: Message[],
        container: HTMLElement,
        responseContent: string,
        finalContent: string,
        toolResults: any[],
        chatHistory?: any[]
    ): string {
        // Create and append the tool limit warning UI
        const warning = this.agentResponseHandler!.createToolLimitWarning();

        // Append warning to the appropriate container (either message or dedicated continuation container)
        const targetContainer = this.agentResponseHandler!.getContext().toolContinuationContainer || this.messagesContainer;
        targetContainer.appendChild(warning);

        // Ensure the continuation container is visible if used
        if (this.agentResponseHandler!.getContext().toolContinuationContainer) {
            this.agentResponseHandler!.getContext().toolContinuationContainer!.style.display = 'block';
        }

        // Setup event listeners on the messages container for user actions (continue/reset limit)
        this.setupContinuationEventListeners(messages, container, responseContent, finalContent, toolResults, chatHistory);

        // Show a notification
        this.agentResponseHandler!.showTaskCompletionNotification(
            'Tool execution limit reached. Choose how to continue above.',
            'warning'
        );

        // Return the final content (with warning UI appended separately)
        return finalContent;
    }

    /**
     * Sets up event listeners on the messages container for task continuation actions.
     * @param messages The message history
     * @param container The message DOM element
     * @param responseContent The raw response content
     * @param finalContent The processed content
     * @param toolResults Tool results from the last step
     * @param chatHistory Optional chat history
     */
    private setupContinuationEventListeners(
        messages: Message[],
        container: HTMLElement,
        responseContent: string,
        finalContent: string,
        toolResults: any[],
        chatHistory?: any[]
    ): void {
        const continuationParams: ContinuationParams = {
            messages, container, responseContent, finalContent, toolResults, chatHistory
        };

        // Listen for the 'continueTask' event (user clicks "Continue")
        this.messagesContainer.addEventListener('continueTask', () => {
            this.executeContinuation(continuationParams);
        });

        // Listen for the 'continueTaskWithAdditionalTools' event (user clicks "Reset Limit")
        this.messagesContainer.addEventListener('continueTaskWithAdditionalTools', (event: CustomEvent) => {
            this.executeContinuation({
                ...continuationParams,
                additionalTools: event.detail.additionalTools
            });
        });
    }

    /**
     * Continues task if no limits are reached and the task is not completed.
     * Creates a TaskContinuation instance and runs the continuation loop.
     * @param agentResult The result from AgentResponseHandler
     * @param messages The message history
     * @param container The message DOM element
     * @param responseContent The raw response content
     * @param finalContent The processed content
     * @param chatHistory Optional chat history
     * @returns Promise resolving to the final content after continuation
     */
    private async continueTaskIfPossible(
        agentResult: any,
        messages: Message[],
        container: HTMLElement,
        responseContent: string,
        finalContent: string,
        chatHistory?: any[]
    ): Promise<string> {
        // Do not continue if limit warning is already shown or limit is reached
        if (agentResult.shouldShowLimitWarning || this.agentResponseHandler?.isToolLimitReached()) {
            return finalContent;
        }

        // Create and execute the task continuation loop
        const taskContinuation = this.createTaskContinuation();
        const continuationResult = await taskContinuation.continueTaskUntilFinished(
            messages, container, responseContent, finalContent, agentResult.toolResults, chatHistory || []
        );

        // If the limit was reached *during* continuation, handle it
        if (continuationResult.limitReachedDuringContinuation) {
            this.handleToolLimitReached(
                messages, container, responseContent,
                continuationResult.content, agentResult.toolResults, chatHistory
            );
        }

        // Return the final content from the continuation
        return continuationResult.content;
    }

    /**
     * Creates a TaskContinuation instance.
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
     * Handles reasoning continuation when AI response contains reasoning steps.
     * Adds a system message to prompt the agent to continue with execution.
     * @param responseContent The raw response content (containing reasoning)
     * @param messages The message history
     * @param container The message DOM element
     * @param chatHistory Optional chat history
     * @returns Promise resolving to the updated content after continuation
     */
    private async handleReasoningContinuation(
        responseContent: string,
        messages: Message[],
        container: HTMLElement,
        chatHistory?: any[]
    ): Promise<string> {
        // Stop if tool limit is reached
        if (this.agentResponseHandler?.isToolLimitReached()) {
            return responseContent + '\n\n*[Tool execution limit reached - reasoning continuation stopped]*';
        }

        // Add the assistant's reasoning message and a system prompt to continue
        messages.push(
            { role: 'assistant', content: responseContent },
            { role: 'system', content: 'Please continue with the actual task execution based on your reasoning.' }
        );

        // Get the continuation response
        const continuationContent = await this.getContinuationResponse(messages, container);
        if (continuationContent.trim()) {
            // Append continuation content and update UI
            const updatedContent = responseContent + '\n\n' + continuationContent;
            await this.updateMessageContent(container, updatedContent);
            return updatedContent;
        }
        // Return original content if continuation fails
        return responseContent;
    }

    /**
     * Gets continuation response after tool execution with error handling.
     * Used internally for task continuation loops.
     * @param messages The message history for the continuation request
     * @param container The message DOM element
     * @returns Promise resolving to the continuation response content string
     */
    async getContinuationResponse(messages: Message[], container: HTMLElement): Promise<string> {
        try {
            // Stop if tool limit is reached
            if (this.agentResponseHandler?.isToolLimitReached()) {
                return '*[Tool execution limit reached - no continuation response]*';
            }

            // Create provider and get completion
            const provider = this.createProvider();
            let continuationContent = '';

            await provider.getCompletion(messages, {
                temperature: this.plugin.settings.temperature,
                maxTokens: this.plugin.settings.maxTokens,
                streamCallback: async (chunk: string) => {
                    continuationContent += chunk;
                    // Note: UI update during streaming is handled by the main streamer,
                    // not typically needed for internal continuation steps unless desired.
                },
                abortController: this.activeStream || undefined
            });

            return continuationContent;
        } catch (error) {
            console.error('ResponseStreamer: Error getting continuation response:', error);
            // Return error message or empty string on AbortError
            return error.name !== 'AbortError'
                ? `*[Error getting continuation: ${error.message}]*`
                : '';
        }
    }

    /**
     * Executes task continuation with proper setup and error handling.
     * Called when the user triggers continuation from the UI after a limit is reached.
     * @param params ContinuationParams
     */
    private async executeContinuation(params: ContinuationParams): Promise<void> {
        if (!this.agentResponseHandler) return;

        const { messages, container, responseContent, finalContent, toolResults, additionalTools, chatHistory } = params;

        // Reset tool execution count if not adding additional tools
        if (additionalTools) {
            // Logic for adding tools could go here if needed, currently just resets count
        } else {
            this.agentResponseHandler.resetExecutionCount();
        }

        // Create and add a message indicating continuation
        const continueMessage = this.createContinuationMessage(additionalTools);
        await this.addContinuationNotice(continueMessage);

        // Add the previous assistant message and the continuation system message to history
        messages.push({ role: 'assistant', content: finalContent }, continueMessage);

        // Create a new bot message element for the continuation response
        const newBotMessage = await this.createNewBotMessage();

        // Execute the task continuation loop
        const continuationResult = await this.executeTaskContinuation(
            messages, newBotMessage.getElement(), responseContent, toolResults, chatHistory
        );

        // If the limit is reached during this continuation, handle it
        if (continuationResult.limitReachedDuringContinuation) {
            this.handleToolLimitReached(
                messages, newBotMessage.getElement(), responseContent,
                continuationResult.content, toolResults, chatHistory
            );
        }

        // Set the final content of the new bot message
        newBotMessage.setContent(continuationResult.content);
    }

    /**
     * Creates continuation message based on type (reset limit vs add tools).
     * @param additionalTools Optional number of additional tools
     * @returns Message object for the continuation notice
     */
    private createContinuationMessage(additionalTools?: number): Message {
        const content = additionalTools
            ? `Added ${additionalTools} additional tool executions. Continuing with the task...`
            : 'Tool execution limit was reset. Continuing with the task...';

        return { role: 'system', content };
    }

    /**
     * Adds continuation notice to chat UI.
     * @param continueMessage The message object for the notice
     */
    private async addContinuationNotice(continueMessage: Message): Promise<void> {
        // Dynamically import BotMessage
        const { BotMessage } = await import('./BotMessage');
        const continuationNotice = new BotMessage(this.plugin.app, this.plugin, continueMessage.content);
        const element = continuationNotice.getElement();
        element.style.opacity = '0.8';
        element.style.fontStyle = 'italic';
        this.messagesContainer.appendChild(element);
        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    }

    /**
     * Creates new bot message for continuation response.
     * @returns Promise resolving to the new BotMessage instance
     */
    private async createNewBotMessage() {
        // Dynamically import BotMessage
        const { BotMessage } = await import('./BotMessage');
        const newBotMessage = new BotMessage(this.plugin.app, this.plugin, '');
        this.messagesContainer.appendChild(newBotMessage.getElement());
        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
        return newBotMessage;
    }

    /**
     * Executes task continuation logic using TaskContinuation.
     * @param messages The message history
     * @param container The message DOM element
     * @param responseContent The raw response content
     * @param toolResults Tool results from the last step
     * @param chatHistory Optional chat history
     * @returns Promise resolving to the result from TaskContinuation
     */
    private async executeTaskContinuation(
        messages: Message[],
        container: HTMLElement,
        responseContent: string,
        toolResults: any[],
        chatHistory?: any[]
    ) {
        const taskContinuation = this.createTaskContinuation();
        return await taskContinuation.continueTaskUntilFinished(
            messages, container, responseContent, '', toolResults, chatHistory || []
        );
    }
}
