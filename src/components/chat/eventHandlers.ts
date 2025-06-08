import { copyToClipboard } from './Buttons';
import { saveChatAsNote, loadChatYamlAndApplySettings } from './chatPersistence';
import { ChatHelpModal } from './ChatHelpModal';
import { Notice, App } from 'obsidian';
import MyPlugin from '../../main';
import { ChatHistoryManager } from './ChatHistoryManager';

export function handleCopyAll(messagesContainer: HTMLElement, plugin: MyPlugin) {
    return async () => {
        const messages = messagesContainer.querySelectorAll('.ai-chat-message');
        let chatContent = '';
        messages.forEach((el, index) => {
            const content = el.querySelector('.message-content')?.textContent || '';
            chatContent += content;
            if (index < messages.length - 1) {
                chatContent += '\n\n' + plugin.settings.chatSeparator + '\n\n';
            }
        });
        await copyToClipboard(chatContent);
    };
}

export function handleSaveNote(messagesContainer: HTMLElement, plugin: MyPlugin, app: App) {
    return async () => {
        const provider = plugin.settings.provider;
        let model = '';
        if (provider === 'openai') model = plugin.settings.openaiSettings.model;
        else if (provider === 'anthropic') model = plugin.settings.anthropicSettings.model;
        else if (provider === 'gemini') model = plugin.settings.geminiSettings.model;
        else if (provider === 'ollama') model = plugin.settings.ollamaSettings.model;
        await saveChatAsNote({
            app,
            messages: messagesContainer.querySelectorAll('.ai-chat-message'),
            settings: plugin.settings,
            provider,
            model,
            chatSeparator: plugin.settings.chatSeparator,
            chatNoteFolder: plugin.settings.chatNoteFolder
        });
    };
}

export function handleClearChat(messagesContainer: HTMLElement, chatHistoryManager: ChatHistoryManager) {
    return async () => {
        messagesContainer.empty();
        try {
            await chatHistoryManager.clearHistory();
        } catch (e) {
            new Notice("Failed to clear chat history.");
        }
    };
}

export function handleSettings(app: App, plugin: MyPlugin) {
    return () => {
        // Lazy import to avoid circular dependency if needed
        const { SettingsModal } = require('./SettingsModal');
        const settingsModal = new SettingsModal(app, plugin);
        settingsModal.open();
    };
}

export function handleHelp(app: App) {
    return () => {
        new ChatHelpModal(app).open();
    };
}
