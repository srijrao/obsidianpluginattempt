import { Notice, MarkdownRenderer, Component } from "obsidian";
import { Message, ToolCommand, ToolResult } from "../../types";
import { AIDispatcher } from "../../utils/aiDispatcher";
import MyPlugin from "../../main";

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
 * Handles streaming responses from AI providers.
 * Manages the complete lifecycle of AI responses including streaming.
 */
export class ResponseStreamer {
  private streamId: string | null = null;

  /**
   * @param plugin The main plugin instance (for settings, logging, etc.)
   * @param messagesContainer The container element for chat messages
   * @param activeStream The current AbortController for streaming (shared reference) - may be updated by this class
   * @param component Optional parent component for Markdown rendering context
   */
  constructor(
    private plugin: MyPlugin,
    private messagesContainer: HTMLElement,
    private activeStream: AbortController | null,
    private component?: Component
  ) {
    // No longer need MessageRenderer or AgentResponseHandler
  }

  /**
   * Check if this ResponseStreamer has an active stream
   */
  isStreaming(): boolean {
    return this.streamId !== null;
  }

  /**
   * Streams AI assistant response with basic functionality
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
    
    // Create a bridge AbortController to maintain compatibility with legacy stop button
    const bridgeController = new AbortController();
    this.activeStream = bridgeController; // Update the shared reference for legacy compatibility
    this.streamId = Math.random().toString(36).substr(2, 9); // Generate unique stream ID
    
    // Use AIDispatcher's stream management with centralized abort control
    const aiDispatcher = new AIDispatcher(this.plugin.app.vault, this.plugin);
    
    try {
      await aiDispatcher.getCompletion(messages, {
        temperature: this.plugin.settings.temperature,
        streamCallback: async (chunk: string) => {
          responseContent += chunk;
          // Update the UI with the streamed chunk
          await this.updateMessageContent(container, responseContent);
        },
        abortController: bridgeController // Pass our bridge controller to AIDispatcher
      });

      return responseContent;
    } catch (error) {
      // If the error is not an AbortError (user stopped), re-throw
      if (error.name !== 'AbortError') {
        throw error;
      }
      // If it's an AbortError, return empty string
      return '';
    } finally {
      // Clear stream ID and activeStream reference
      this.streamId = null;
      this.activeStream = null;
    }
  }

  /**
   * Updates message content in the UI with markdown rendering.
   * @param container The message DOM element
   * @param content The new content string
   */
  private async updateMessageContent(
    container: HTMLElement,
    content: string
  ): Promise<void> {
    const contentEl = container.querySelector(
      ".message-content"
    ) as HTMLElement;
    if (!contentEl) return;

    // Update dataset for raw content
    this.updateContainerDataset(container, content);
    // Clear and re-render markdown
    contentEl.empty();
    await MarkdownRenderer.render(
      this.plugin.app,
      content,
      contentEl,
      "",
      this.component || new Component()
    );
    // Scroll to bottom
    this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
  }

  /**
   * Handles responses.
   * Updates the message with reasoning display.
   * @param container The message DOM element
   * @param responseContent The raw response content
   * @param messages The message history
   * @param chatHistory Optional chat history
   * @returns Promise resolving to the final content after handling
   */
  private async handleResponse(
    container: HTMLElement,
    responseContent: string,
    messages: Message[],
    chatHistory?: any[]
  ): Promise<string> {
    // The processed text
    return responseContent;
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
    // MessageRenderer functionality removed - enhanced data rendering disabled
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
    // Only update if we have more content than before (preserve partial responses)
    if (
      !container.dataset.rawContent ||
      rawContent.length >= container.dataset.rawContent.length
    ) {
      container.dataset.rawContent = rawContent;
    }
    if (messageData) {
      container.dataset.messageData = JSON.stringify(messageData);
    }
  }

  /**
   * Creates new bot message for continuation response.
   * @returns Promise resolving to the new BotMessage instance
   */
  private async createNewBotMessage() {
    // Dynamically import BotMessage
    const { BotMessage } = await import("./BotMessage");
    const newBotMessage = new BotMessage(this.plugin.app, this.plugin, "");
    this.messagesContainer.appendChild(newBotMessage.getElement());
    this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    return newBotMessage;
  }
}
