import { Vault, TFile, TFolder, normalizePath } from "obsidian";
import { ReasoningData, TaskStatus, ToolExecutionResult } from '../../types';
import { embedToolDataInMarkdown } from '../../utils/messageContentParser';

/**
 * Represents a single chat message in the chat history.
 * NEW FORMAT: Content is always raw markdown, tool data embedded as JSON blocks.
 */
export interface ChatMessage {
  timestamp: string;                // ISO timestamp of the message
  sender: string;                   // Sender identifier (e.g., "user" or "assistant")
  role: 'system' | 'user' | 'assistant'; // Message role for AI processing
  content: string;                  // RAW MARKDOWN - complete message content including embedded tool JSON blocks
  reasoning?: ReasoningData;        // Optional reasoning data (for agent mode)
  taskStatus?: TaskStatus;          // Optional task status (for agent mode)
  toolResults?: ToolExecutionResult[]; // DEPRECATED - tool data now embedded in content as `ai-tool-execution` JSON blocks
  actualSystemMessage?: string;     // Optional actual system message sent to AI (includes agent tools if enabled)
}

/**
 * ChatHistoryManager handles persistent storage and management of chat history.
 * Stores messages in a JSON file in the plugin's data folder.
 */
export class ChatHistoryManager {
  private vault: Vault;
  private historyFilePath: string;
  private history: ChatMessage[] = [];
  private isLoaded: boolean = false;

  /**
   * @param vault The Obsidian Vault instance
   * @param pluginId The plugin ID (used for folder path)
   * @param historyFilePath Optional custom file path for history storage
   */
  constructor(vault: Vault, pluginId?: string, historyFilePath?: string) {
    this.vault = vault;
    let effectivePluginId = pluginId;
    if (!pluginId) {
      // Warn if pluginId is missing (should not happen in production)
      console.error("CRITICAL: ChatHistoryManager instantiated without pluginId! Using placeholder. This will likely lead to incorrect file paths.");
      effectivePluginId = "unknown-plugin-id-error";
    }
    const fPath = historyFilePath || "chat-history.json";
    // Store history in the plugin's data folder
    this.historyFilePath = normalizePath(`.obsidian/plugins/${effectivePluginId}/${fPath}`);

    // (Legacy/placeholder for possible Notice usage)
    // @ts-ignore
    if (typeof window !== "undefined" && window.Notice) {
      // @ts-ignore
    }
  }

  /**
   * Loads chat history from the history file.
   * If the file does not exist or is invalid, returns an empty array.
   * Automatically migrates old format messages to new format.
   * @returns Promise resolving to the chat history array
   */
  async loadHistory(): Promise<ChatMessage[]> {
    try {
      const exists = await this.vault.adapter.exists(this.historyFilePath);
      if (exists) {
        const data = await this.vault.adapter.read(this.historyFilePath);
        try {
          const rawHistory = JSON.parse(data) as ChatMessage[];
          // Migrate old format messages to new format
          this.history = rawHistory.map(msg => this.migrateMessageToNewFormat(msg));
        } catch (parseError) {
          console.error('Failed to parse chat history:', parseError);
          this.history = [];
        }
      } else {
        this.history = [];
      }
    } catch (e) {
      console.error('Failed to load chat history:', e);
      this.history = [];
    }
    return this.history;
  }

  /**
   * Adds a new message to the chat history and saves it.
   * @param message The ChatMessage to add
   */
  async addMessage(message: ChatMessage): Promise<void> {
    const currentHistory = await this.loadHistory();
    currentHistory.push(message);
    this.history = currentHistory;
    await this.saveHistory();
  }

  /**
   * Returns the current chat history (loads from disk if needed).
   * @returns Promise resolving to the chat history array
   */
  async getHistory(): Promise<ChatMessage[]> {
    return await this.loadHistory();
  }

  /**
   * Clears the chat history and saves the empty history.
   */
  async clearHistory(): Promise<void> {
    this.history = [];
    await this.saveHistory();
  }

  /**
   * Deletes a specific message from the chat history by timestamp, sender, and content.
   * @param timestamp The timestamp of the message to delete
   * @param sender The sender of the message to delete
   * @param content The content of the message to delete
   */
  async deleteMessage(timestamp: string, sender: string, content: string): Promise<void> {
    await this.loadHistory();
    const index = this.history.findIndex(msg =>
      msg.timestamp === timestamp &&
      msg.sender === sender &&
      msg.content === content
    );
    if (index !== -1) {
      this.history.splice(index, 1);
      await this.saveHistory();
    }
  }

  /**
   * Updates a specific message in the chat history.
   * For new architecture, embeds tool data in content instead of storing separately.
   * @param timestamp The timestamp of the message to update
   * @param sender The sender of the message to update
   * @param oldContent The old content to match
   * @param newContent The new content to set
   * @param enhancedData Optional additional fields to update
   */
  async updateMessage(
    timestamp: string,
    sender: string,
    oldContent: string,
    newContent: string,
    enhancedData?: Partial<Pick<ChatMessage, 'reasoning' | 'taskStatus' | 'toolResults'>>
  ): Promise<void> {
    await this.loadHistory();
    const message = this.history.find(msg =>
      msg.timestamp === timestamp &&
      msg.sender === sender &&
      msg.content === oldContent
    );
    if (message) {
      // For new architecture, embed tool data in content if provided
      let contentToSave = newContent;
      if (enhancedData && enhancedData.toolResults && enhancedData.toolResults.length > 0) {
        contentToSave = embedToolDataInMarkdown(
          newContent,
          enhancedData.toolResults,
          enhancedData.reasoning,
          enhancedData.taskStatus
        );
      }

      message.content = contentToSave;

      // Clear old separate fields since they're now embedded (for new messages)
      if (enhancedData && enhancedData.toolResults) {
        message.toolResults = undefined;
        message.reasoning = undefined;
        message.taskStatus = undefined;
      }

      await this.saveHistory();
    } else {
      // Message not found; do nothing
    }
  }

  /**
   * Migrates old format messages to new embedded format.
   * Old format: toolResults, reasoning, taskStatus as separate fields
   * New format: tool data embedded in markdown content as JSON code blocks
   * @param message The message to migrate
   * @returns The migrated message
   */
  private migrateMessageToNewFormat(message: ChatMessage): ChatMessage {
    // Check if message already has embedded tool data (new format)
    if (message.content.includes('```ai-tool-execution')) {
      // Already migrated, return as-is
      return message;
    }

    // Check if message has old separate fields that need embedding
    if (message.toolResults && message.toolResults.length > 0) {
      // Migrate: embed tool data in content
      const migratedContent = embedToolDataInMarkdown(
        message.content,
        message.toolResults,
        message.reasoning,
        message.taskStatus
      );

      // Return migrated message with embedded content and cleared separate fields
      return {
        ...message,
        content: migratedContent,
        toolResults: undefined,
        reasoning: undefined,
        taskStatus: undefined
      };
    }

    // No tool data to migrate, return as-is
    return message;
  }

  /**
   * Ensures the directory exists before writing.
   */
  private async ensureDirectoryExists(): Promise<void> {
    const dirPath = this.historyFilePath.substring(0, this.historyFilePath.lastIndexOf('/'));
    if (dirPath) {
      try {
        await this.vault.adapter.mkdir(dirPath);
      } catch (e) {
        const err = e as Error;
        // Directory might already exist, ignore error
        if (!err.message.includes('already exists')) {
          throw e;
        }
      }
    }
  }

  /**
   * Saves the current chat history to the history file.
   * Ensures the directory exists before writing.
   */
  private async saveHistory(): Promise<void> {
    try {
      await this.ensureDirectoryExists();
      const data = JSON.stringify(this.history, null, 2);

      const abstractTarget = this.vault.getAbstractFileByPath(this.historyFilePath);
      if (abstractTarget instanceof TFolder) {
        throw new Error(`Path ${this.historyFilePath} is a directory, not a file.`);
      }

      await this.vault.adapter.write(this.historyFilePath, data);

      // Optionally, check file existence after writing
      if (!abstractTarget || !(abstractTarget instanceof TFile)) {
        await this.vault.adapter.exists(this.historyFilePath);
      }
    } catch (e) {
      console.error(`Failed to save history to ${this.historyFilePath}:`, e);
      throw e;
    }
  }
}
