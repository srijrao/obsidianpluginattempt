import { Vault, TFile, TFolder, normalizePath } from "obsidian";

export interface ChatMessage {
  timestamp: string;
  sender: string;
  content: string;
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
        effectivePluginId = "unknown-plugin-id-error"; // Placeholder
    }
    const fPath = historyFilePath || "chat-history.json";
    // Store in plugin data directory
    this.historyFilePath = normalizePath(`.obsidian/plugins/${effectivePluginId}/${fPath}`);
    console.log("[ChatHistoryManager] Using history file path:", this.historyFilePath);
    // Show a Notice in Obsidian so the user can see the path even if logs are stripped
    // @ts-ignore
    if (typeof window !== "undefined" && window.Notice) {
      // @ts-ignore
      new window.Notice("[ChatHistoryManager] Using history file path: " + this.historyFilePath);
    }
  }

  private async ensureDirectoryExists(): Promise<void> {
    const dirPath = this.historyFilePath.substring(0, this.historyFilePath.lastIndexOf('/'));
    if (!dirPath) return; // Should not happen with the current path structure

    try {
        const abstractFile = this.vault.getAbstractFileByPath(dirPath);
        if (abstractFile === null) {
            // Directory does not exist, create it
            await this.vault.createFolder(dirPath);
        } else if (!(abstractFile instanceof TFolder)) {
            // Path exists but is not a folder, this is an error
            console.error(`Path ${dirPath} exists but is not a folder.`);
            throw new Error(`Path ${dirPath} exists but is not a folder.`);
        }
        // If abstractFile is a TFolder, directory already exists, do nothing.
    } catch (e) {
        // If the error is specifically "folder already exists", we can assume it's safe to ignore.
        // This handles cases where createFolder throws even if the folder is already there.
        if (e.message && e.message.toLowerCase().includes("folder already exists")) {
            // Assuming the API is correct that the folder exists.
            // The previous check `this.vault.getAbstractFileByPath(dirPath) instanceof TFolder`
            // might fail due to caching or timing issues immediately after the error.
            // By returning here, we accept that the folder exists as per the error message.
            return; 
        }
        // For any other errors, or if the specific "folder already exists" message wasn't found.
        console.error(`Failed to ensure directory ${dirPath} exists:`, e);
        throw e; // Re-throw other errors
    }
}

  async loadHistory(): Promise<ChatMessage[]> {
    try {
      // Use adapter.exists for reliable file existence check
      const exists = await this.vault.adapter.exists(this.historyFilePath);
      if (exists) {
        // Use adapter.read for direct file access
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

  async updateMessage(timestamp: string, sender: string, oldContent: string, newContent: string): Promise<void> {
    await this.loadHistory();
    const message = this.history.find(msg => 
      msg.timestamp === timestamp && 
      msg.sender === sender && 
      msg.content === oldContent
    );
    if (message) {
      message.content = newContent;
      await this.saveHistory();
    } else {
      console.warn("ChatHistoryManager: updateMessage did not find a matching message to update.", {timestamp, sender, oldContent});
    }
  }

  private async saveHistory(): Promise<void> {
    try {
      await this.ensureDirectoryExists();
      const data = JSON.stringify(this.history, null, 2);

      // Check if path exists and is a folder (which would be an error)
      const abstractTarget = this.vault.getAbstractFileByPath(this.historyFilePath);
      if (abstractTarget instanceof TFolder) {
        throw new Error(`Path ${this.historyFilePath} is a directory, not a file.`);
      }

      // Use adapter.write which handles both creation and modification atomically
      await this.vault.adapter.write(this.historyFilePath, data);

      // After successful write, update vault cache if needed
      if (!abstractTarget || !(abstractTarget instanceof TFile)) {
        // Force vault to recognize the new file in its cache
        await this.vault.adapter.exists(this.historyFilePath);
      }
    } catch (e) {
      console.error(`Failed to save history to ${this.historyFilePath}:`, e);
      throw e;
    }
  }
}
