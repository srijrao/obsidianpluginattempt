import { copyToClipboard } from './Buttons';
import { saveChatAsNote, loadChatYamlAndApplySettings } from './chatPersistence';
import { ChatHelpModal } from './ChatHelpModal';
import { Notice, App } from 'obsidian';
import MyPlugin from '../../main';
import { ChatHistoryManager } from './ChatHistoryManager';
import { MessageRenderer } from './MessageRenderer';

export function handleCopyAll(messagesContainer: HTMLElement, plugin: MyPlugin) {
    return async () => {
        const messages = messagesContainer.querySelectorAll('.ai-chat-message');
        let chatContent = '';
        messages.forEach((el, index) => {
            const htmlElement = el as HTMLElement;
            
            // Skip tool display messages as they're handled inline now
            if (htmlElement.classList.contains('tool-display-message')) {
                return;
            }
            
            // Get the message data from the element's dataset
            let messageData = null;
            const messageDataStr = htmlElement.dataset.messageData;
            if (messageDataStr) {
                try {
                    messageData = JSON.parse(messageDataStr);
                } catch (e) {
                    // Fallback to textContent if parsing fails
                }
            }
              console.log('DEBUG handleCopyAll - Message data:', {
                hasMessageData: !!messageData,
                hasToolResults: messageData && messageData.toolResults && messageData.toolResults.length > 0,
                toolResultsLength: messageData?.toolResults?.length || 0,
                messageDataStr: messageDataStr?.substring(0, 200) + '...'
            });
            
            if (messageData && messageData.toolResults && messageData.toolResults.length > 0) {
                // Use MessageRenderer to get properly formatted content with tool results
                const renderer = new MessageRenderer(plugin.app);
                chatContent += renderer.getMessageContentForCopy(messageData);
            } else {
                // For regular messages, use raw content if available, otherwise text content
                const rawContent = htmlElement.dataset.rawContent;
                const content = rawContent !== undefined ? rawContent : el.querySelector('.message-content')?.textContent || '';
                chatContent += content;
            }
            
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
