import { copyToClipboard } from './Buttons';
import { saveChatAsNote, loadChatYamlAndApplySettings } from './chatPersistence';
import { ChatHelpModal } from './ChatHelpModal';
import { Notice, App, MarkdownRenderer } from 'obsidian';
import MyPlugin from '../../main';
import { ChatHistoryManager } from './ChatHistoryManager';
import { MessageRenderer } from '../agent/MessageRenderer';
import { ConfirmationModal } from './ConfirmationModal';

/**
 * Formats the chat content from the messages container for copying or saving.
 * Handles both plain and tool-rich messages.
 * @param messagesContainer The chat messages container element
 * @param plugin The plugin instance
 * @param chatSeparator Separator string between messages
 * @returns The formatted chat content as a string
 */
function getFormattedChatContent(messagesContainer: HTMLElement, plugin: MyPlugin, chatSeparator: string): string {
    const messages = messagesContainer.querySelectorAll('.ai-chat-message');
    let chatContent = '';
    const renderer = new MessageRenderer(plugin.app);
    messages.forEach((el, index) => {
        const htmlElement = el as HTMLElement;
        // Skip tool display messages
        if (htmlElement.classList.contains('tool-display-message')) {
            return;
        }
        // Try to parse enhanced message data if present
        let messageData = null;
        const messageDataStr = htmlElement.dataset.messageData;
        if (messageDataStr) {
            try {
                messageData = JSON.parse(messageDataStr);
            } catch (e) {}
        }
        // If toolResults are present, use formatted content
        if (messageData && messageData.toolResults && messageData.toolResults.length > 0) {
            chatContent += renderer.getMessageContentForCopy(messageData);
        } else {
            // Otherwise, use raw content or fallback to text content
            const rawContent = htmlElement.dataset.rawContent;
            const content = rawContent !== undefined ? rawContent : el.querySelector('.message-content')?.textContent || '';
            chatContent += content;
        }
        // Add separator between messages
        if (index < messages.length - 1) {
            chatContent += '\n\n' + chatSeparator + '\n\n';
        }
    });
    return chatContent;
}

/**
 * Handler for copying all chat messages to the clipboard.
 */
export function handleCopyAll(messagesContainer: HTMLElement, plugin: MyPlugin) {
    return async () => {
        const chatContent = getFormattedChatContent(messagesContainer, plugin, plugin.settings.chatSeparator);
        await copyToClipboard(chatContent);
    };
}

/**
 * Handler for saving the chat as a note.
 */
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

/**
 * Handler for clearing the chat and chat history.
 */
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

/**
 * Handler for opening the settings modal.
 */
export function handleSettings(app: App, plugin: MyPlugin) {
    return () => {
        // Dynamically import SettingsModal to avoid circular dependencies
        const { SettingsModal } = require('./SettingsModal');
        const settingsModal = new SettingsModal(app, plugin);
        settingsModal.open();
    };
}

/**
 * Handler for opening the help modal.
 */
export function handleHelp(app: App) {
    return () => {
        new ChatHelpModal(app).open();
    };
}

/**
 * Handler for toggling reference to the current note.
 */
export function handleReferenceNote(app: App, plugin: MyPlugin) {
    return () => {
        plugin.settings.referenceCurrentNote = !plugin.settings.referenceCurrentNote;
        plugin.saveSettings();
        new Notice(`Reference current note: ${plugin.settings.referenceCurrentNote ? 'ON' : 'OFF'}`);
        app.workspace.trigger('ai-assistant:reference-note-toggled');
    };
}

/**
 * Handler for copying a single message to the clipboard.
 */
export function handleCopyMessage(messageEl: HTMLElement, plugin: MyPlugin) {
    return async () => {
        let contentToCopy = '';
        const messageData = messageEl.dataset.messageData;
        if (messageData) {
            try {
                const parsedData = JSON.parse(messageData);
                const renderer = new MessageRenderer(plugin.app);
                contentToCopy = renderer.getMessageContentForCopy(parsedData);
            } catch (e) {
                contentToCopy = messageEl.dataset.rawContent || '';
            }
        } else {
            contentToCopy = messageEl.dataset.rawContent || '';
        }
        if (contentToCopy.trim() === '') {
            new Notice('No content to copy');
            return;
        }
        await copyToClipboard(contentToCopy);
        new Notice('Message copied to clipboard');
    };
}

/**
 * Handler for editing a single message in the chat and updating history.
 */
export function handleEditMessage(messageEl: HTMLElement, chatHistoryManager: ChatHistoryManager, plugin: MyPlugin) {
    return async () => {
        const contentEl = messageEl.querySelector('.message-content') as HTMLElement;
        if (!contentEl) return;
        if (!contentEl.hasClass('editing')) {
            // Enter edit mode: replace content with textarea
            const textarea = document.createElement('textarea');
            textarea.value = messageEl.dataset.rawContent || '';
            textarea.className = 'message-content editing';
            contentEl.empty();
            contentEl.appendChild(textarea);
            textarea.focus();
            contentEl.addClass('editing');
            textarea.addEventListener('keydown', async (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    textarea.blur();
                }
            });
            textarea.addEventListener('blur', async () => {
                const oldContent = messageEl.dataset.rawContent;
                const newContent = textarea.value;
                let enhancedData = undefined;
                if (messageEl.dataset.messageData) {
                    try {
                        enhancedData = JSON.parse(messageEl.dataset.messageData);
                    } catch {}
                }
                try {
                    await chatHistoryManager.updateMessage(
                        messageEl.dataset.timestamp || new Date().toISOString(),
                        messageEl.classList.contains('user') ? 'user' : 'assistant',
                        oldContent || '',
                        newContent,
                        enhancedData
                    );
                    messageEl.dataset.rawContent = newContent;
                    contentEl.empty();
                    if (enhancedData && enhancedData.toolResults) {
                        const renderer = new MessageRenderer(plugin.app);
                        await renderer.renderMessage({
                            role: messageEl.classList.contains('user') ? 'user' : 'assistant',
                            content: newContent,
                            toolResults: enhancedData.toolResults
                        } as any, messageEl, undefined);
                    } else {
                        await MarkdownRenderer.render(plugin.app, newContent, contentEl, '', undefined as any);
                    }
                    contentEl.removeClass('editing');
                } catch (e) {
                    new Notice('Failed to save edited message.');
                    messageEl.dataset.rawContent = oldContent || '';
                    contentEl.empty();
                    await MarkdownRenderer.render(plugin.app, oldContent || '', contentEl, '', undefined as any);
                    contentEl.removeClass('editing');
                }
            });
        }
    };
}

/**
 * Handler for deleting a single message from the chat and history.
 */
export function handleDeleteMessage(messageEl: HTMLElement, chatHistoryManager: ChatHistoryManager, app: App) {
    return () => {
        const modal = new ConfirmationModal(app, 'Delete message', 'Are you sure you want to delete this message?', (confirmed: boolean) => {
            if (confirmed) {
                chatHistoryManager.deleteMessage(
                    messageEl.dataset.timestamp || new Date().toISOString(),
                    messageEl.classList.contains('user') ? 'user' : 'assistant',
                    messageEl.dataset.rawContent || ''
                ).then(() => {
                    messageEl.remove();
                }).catch(() => {
                    new Notice('Failed to delete message from history.');
                });
            }
        });
        modal.open();
    };
}

/**
 * Handler for regenerating an AI response for a given message element.
 */
export function handleRegenerateMessage(messageEl: HTMLElement, regenerateCallback: (messageEl: HTMLElement) => void) {
    return () => {
        regenerateCallback(messageEl);
    };
}
