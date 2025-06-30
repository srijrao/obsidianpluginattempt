import { Vault, TFile, TFolder, normalizePath } from "obsidian";
import { ReasoningData, TaskStatus, ToolExecutionResult } from '../../types';

export interface ChatMessage {
  timestamp: string;
  sender: string;
  content: string;
  reasoning?: ReasoningData;
  taskStatus?: TaskStatus;
  toolResults?: ToolExecutionResult[];
}

export class ChatHistoryManager {
  private vault: Vault;
  private historyFilePath: string;
  private history: ChatMessage[] = [];
  private isLoaded: boolean = false;

  constructor(vault: Vault, pluginId?: string, historyFilePath?: string) {
    this.vault = vault;
    let effectivePluginId = pluginId;
    if (!pluginId) {
      console.error("CRITICAL: ChatHistoryManager instantiated without pluginId! Using placeholder. This will likely lead to incorrect file paths.");
      effectivePluginId = "unknown-plugin-id-error";
    }
    const fPath = historyFilePath || "chat-history.json";

    this.historyFilePath = normalizePath(`.obsidian/plugins/${effectivePluginId}/${fPath}`);

    // @ts-ignore
    if (typeof window !== "undefined" && window.Notice) {
      // @ts-ignore
    }
  }

  private async ensureDirectoryExists(): Promise<void> {
    const dirPath = this.historyFilePath.substring(0, this.historyFilePath.lastIndexOf('/'));
    if (!dirPath) return;

    try {
      const abstractFile = this.vault.getAbstractFileByPath(dirPath);
      if (abstractFile === null) {

        await this.vault.createFolder(dirPath);
      } else if (!(abstractFile instanceof TFolder)) {

        console.error(`Path ${dirPath} exists but is not a folder.`);
        throw new Error(`Path ${dirPath} exists but is not a folder.`);
      }

    } catch (e) {

      if (e.message && e.message.toLowerCase().includes("folder already exists")) {

        return;
      }

      console.error(`Failed to ensure directory ${dirPath} exists:`, e);
      throw e;
    }
  }

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

  async addMessage(message: ChatMessage): Promise<void> {
    const currentHistory = await this.loadHistory();
    currentHistory.push(message);
    this.history = currentHistory;
    await this.saveHistory();
  }

  async getHistory(): Promise<ChatMessage[]> {
    return await this.loadHistory();
  }

  async clearHistory(): Promise<void> {
    this.history = [];
    await this.saveHistory();
  }

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

    }
  }

  private async saveHistory(): Promise<void> {
    try {
      await this.ensureDirectoryExists();
      const data = JSON.stringify(this.history, null, 2);

      const abstractTarget = this.vault.getAbstractFileByPath(this.historyFilePath);
      if (abstractTarget instanceof TFolder) {
        throw new Error(`Path ${this.historyFilePath} is a directory, not a file.`);
      }

      await this.vault.adapter.write(this.historyFilePath, data);

      if (!abstractTarget || !(abstractTarget instanceof TFile)) {

        await this.vault.adapter.exists(this.historyFilePath);
      }
    } catch (e) {
      console.error(`Failed to save history to ${this.historyFilePath}:`, e);
      throw e;
    }
  }
}
