import { copyToClipboard } from './Buttons';
import { saveChatAsNote, loadChatYamlAndApplySettings } from './chatPersistence';
import { ChatHelpModal } from './ChatHelpModal';
import { Notice, App } from 'obsidian';
import MyPlugin from '../../main';
import { ChatHistoryManager } from './ChatHistoryManager';
import { MessageRenderer } from './MessageRenderer';

function getFormattedChatContent(messagesContainer: HTMLElement, plugin: MyPlugin, chatSeparator: string): string {
    const messages = messagesContainer.querySelectorAll('.ai-chat-message');
    let chatContent = '';
    const renderer = new MessageRenderer(plugin.app);
    messages.forEach((el, index) => {
        const htmlElement = el as HTMLElement;
        if (htmlElement.classList.contains('tool-display-message')) {
            return;
        }
        let messageData = null;
        const messageDataStr = htmlElement.dataset.messageData;
        if (messageDataStr) {
            try {
                messageData = JSON.parse(messageDataStr);
            } catch (e) {}
        }
        if (messageData && messageData.toolResults && messageData.toolResults.length > 0) {
            chatContent += renderer.getMessageContentForCopy(messageData);
        } else {
            const rawContent = htmlElement.dataset.rawContent;
            const content = rawContent !== undefined ? rawContent : el.querySelector('.message-content')?.textContent || '';
            chatContent += content;
        }
        if (index < messages.length - 1) {
            chatContent += '\n\n' + chatSeparator + '\n\n';
        }
    });
    return chatContent;
}

export function handleCopyAll(messagesContainer: HTMLElement, plugin: MyPlugin) {
    return async () => {
        const chatContent = getFormattedChatContent(messagesContainer, plugin, plugin.settings.chatSeparator);
        await copyToClipboard(chatContent);
    };
}

export function handleSaveNote(messagesContainer: HTMLElement, plugin: MyPlugin, app: App, agentResponseHandler?: any) {
    return async () => {
        const chatContent = getFormattedChatContent(messagesContainer, plugin, plugin.settings.chatSeparator);
        await saveChatAsNote({
            app,
            messages: undefined,
            settings: plugin.settings,
            chatSeparator: plugin.settings.chatSeparator,
            chatNoteFolder: plugin.settings.chatNoteFolder,
            agentResponseHandler: agentResponseHandler,
            chatContent
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
