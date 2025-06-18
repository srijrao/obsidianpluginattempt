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

export function handleSaveNote(messagesContainer: HTMLElement, plugin: MyPlugin, app: App, agentResponseHandler?: any) {
    return async () => {
        // With unified model approach, we no longer need to determine provider/model here
        // The buildChatYaml function will handle this based on settings.selectedModel
        await saveChatAsNote({
            app,
            messages: messagesContainer.querySelectorAll('.ai-chat-message'),
            settings: plugin.settings,
            chatSeparator: plugin.settings.chatSeparator,
            chatNoteFolder: plugin.settings.chatNoteFolder,
            agentResponseHandler: agentResponseHandler
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

export function handleReferenceNote(app: App, plugin: MyPlugin) {
    return () => {
        plugin.settings.referenceCurrentNote = !plugin.settings.referenceCurrentNote;
        plugin.saveSettings();
        new Notice(`Reference current note: ${plugin.settings.referenceCurrentNote ? 'ON' : 'OFF'}`);
        // Optionally, trigger a custom event for immediate UI update
        app.workspace.trigger('ai-assistant:reference-note-toggled');
    };
}
