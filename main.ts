import { Plugin, App, Notice } from "obsidian";
import { ChatHistoryManager, ChatMessage } from "./src/ChatHistoryManager";

export default class ObsidianPluginAttempt extends Plugin {
  private chatHistoryManager: ChatHistoryManager;

  async onload() {
    this.chatHistoryManager = new ChatHistoryManager(this.app.vault);

    this.addCommand({
      id: "add-chat-message",
      name: "Add Chat Message",
      callback: async () => {
        const message: ChatMessage = {
          timestamp: new Date().toISOString(),
          sender: "user",
          content: "Test message"
        };
        await this.chatHistoryManager.addMessage(message);
        new Notice("Chat message added.");
      }
    });

    this.addCommand({
      id: "show-chat-history",
      name: "Show Chat History",
      callback: async () => {
        const history = await this.chatHistoryManager.getHistory();
        if (history.length === 0) {
          new Notice("Chat history is empty.");
        } else {
          const messages = history.map(m => `[${m.timestamp}] ${m.sender}: ${m.content}`).join("\n");
          new Notice(messages, 10000);
        }
      }
    });

    this.addCommand({
      id: "clear-chat-history",
      name: "Clear Chat History",
      callback: async () => {
        await this.chatHistoryManager.clearHistory();
        new Notice("Chat history cleared.");
      }
    });
  }
}
