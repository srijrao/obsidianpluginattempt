import { Vault, TFile, TFolder, normalizePath } from "obsidian";
import { ReasoningData, TaskStatus, ToolExecutionResult } from '../../types';

/**
 * Represents a single chat message in the chat history.
 */
export interface ChatMessage {
  timestamp: string;                // ISO timestamp of the message
  sender: string;                   // Sender identifier (e.g., "user" or "assistant")
  role: 'system' | 'user' | 'assistant'; // Message role for AI processing
  content: string;                  // Message content (markdown or plain text)
  reasoning?: ReasoningData;        // Optional reasoning data (for agent mode)
  taskStatus?: TaskStatus;          // Optional task status (for agent mode)
  toolResults?: ToolExecutionResult[]; // Optional tool execution results (for agent mode)
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
   * Ensures the directory for the history file exists, creating it if needed.
   */
  private async ensureDirectoryExists(): Promise<void> {
    const dirPath = this.historyFilePath.substring(0, this.historyFilePath.lastIndexOf('/'));
    if (!dirPath) return;

    try {
      const abstractFile = this.vault.getAbstractFileByPath(dirPath);
      if (abstractFile === null) {
        // Directory does not exist, create it
        await this.vault.createFolder(dirPath);
      } else if (!(abstractFile instanceof TFolder)) {
        // Path exists but is not a folder
        console.error(`Path ${dirPath} exists but is not a folder.`);
        throw new Error(`Path ${dirPath} exists but is not a folder.`);
      }
    } catch (e) {
      // Ignore "folder already exists" errors
      if (e.message && e.message.toLowerCase().includes("folder already exists")) {
        return;
      }
      console.error(`Failed to ensure directory ${dirPath} exists:`, e);
      throw e;
    }
  }

  /**
   * Loads chat history from the history file.
   * If the file does not exist or is invalid, returns an empty array.
   * @returns Promise resolving to the chat history array
   */
  async loadHistory(): Promise<ChatMessage[]> {
    try {
      const exists = await this.vault.adapter.exists(this.historyFilePath);
      if (exists) {
        const data = await this.vault.adapter.read(this.historyFilePath);
        try {
          this.history = JSON.parse(data) as ChatMessage[];
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
   * Optionally updates reasoning, taskStatus, and toolResults.
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
      message.content = newContent;
      if (enhancedData) {
        if ('reasoning' in enhancedData) message.reasoning = enhancedData.reasoning;
        if ('taskStatus' in enhancedData) message.taskStatus = enhancedData.taskStatus;
        if ('toolResults' in enhancedData) message.toolResults = enhancedData.toolResults;
      }
      await this.saveHistory();
    } else {
      // Message not found; do nothing
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
