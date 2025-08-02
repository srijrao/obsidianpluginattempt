import { copyToClipboard } from './Buttons';
import { saveChatAsNote, loadChatYamlAndApplySettings } from './chatPersistence';
import { ChatHelpModal } from './ChatHelpModal';
import { Notice, App, MarkdownRenderer, Component } from 'obsidian';
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
        
        // DIAGNOSTIC: Log edit attempt
        plugin.debugLog('debug', '[EventHandlers] Edit message clicked', {
            hasContentEl: !!contentEl,
            isEditing: contentEl.hasClass('editing'),
            rawContent: messageEl.dataset.rawContent,
            hasMessageData: !!messageEl.dataset.messageData
        });
        
        if (!contentEl.hasClass('editing')) {
            // BACKUP: Store original content before editing
            const originalContent = messageEl.dataset.rawContent || '';
            const originalMessageData = messageEl.dataset.messageData;
            
            // Enter edit mode: replace content with textarea
            const textarea = document.createElement('textarea');
            textarea.value = originalContent;
            textarea.className = 'message-content editing';
            
            // BACKUP: Store original HTML content for restoration if needed
            const originalHTML = contentEl.innerHTML;
            contentEl.dataset.originalHTML = originalHTML;
            
            contentEl.empty();
            contentEl.appendChild(textarea);
            textarea.focus();
            contentEl.addClass('editing');
            
            plugin.debugLog('debug', '[EventHandlers] Entered edit mode', {
                originalContentLength: originalContent.length,
                hasOriginalHTML: !!originalHTML
            });
            textarea.addEventListener('keydown', async (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    textarea.blur();
                }
            });
            textarea.addEventListener('blur', async () => {
                const oldContent = messageEl.dataset.rawContent;
                const newContent = textarea.value;
                const originalHTML = contentEl.dataset.originalHTML;
                let enhancedData = undefined;
                
                plugin.debugLog('debug', '[EventHandlers] Edit blur - saving changes', {
                    oldContentLength: oldContent?.length || 0,
                    newContentLength: newContent.length,
                    hasEnhancedData: !!messageEl.dataset.messageData
                });
                
                if (messageEl.dataset.messageData) {
                    try {
                        enhancedData = JSON.parse(messageEl.dataset.messageData);
                    } catch (e) {
                        plugin.debugLog('warn', '[EventHandlers] Failed to parse message data', e);
                    }
                }
                
                try {
                    await chatHistoryManager.updateMessage(
                        messageEl.dataset.timestamp || new Date().toISOString(),
                        messageEl.classList.contains('user') ? 'user' : 'assistant',
                        oldContent || '',
                        newContent,
                        enhancedData
                    );
                    
                    // Update the raw content
                    messageEl.dataset.rawContent = newContent;
                    
                    // Clear editing state and restore content
                    contentEl.empty();
                    contentEl.removeClass('editing');
                    
                    // Render the updated content properly
                    if (enhancedData && enhancedData.toolResults && enhancedData.toolResults.length > 0) {
                        plugin.debugLog('debug', '[EventHandlers] Rendering with tool results');
                        const renderer = new MessageRenderer(plugin.app);
                        await renderer.renderMessage({
                            role: messageEl.classList.contains('user') ? 'user' : 'assistant',
                            content: newContent,
                            toolResults: enhancedData.toolResults,
                            reasoning: enhancedData.reasoning,
                            taskStatus: enhancedData.taskStatus
                        } as any, messageEl, new Component());
                    } else {
                        plugin.debugLog('debug', '[EventHandlers] Rendering as markdown');
                        await MarkdownRenderer.render(plugin.app, newContent, contentEl, '', new Component());
                    }
                    
                    plugin.debugLog('debug', '[EventHandlers] Edit saved successfully');
                    
                } catch (e) {
                    plugin.debugLog('error', '[EventHandlers] Failed to save edited message', e);
                    new Notice('Failed to save edited message.');
                    
                    // RESTORE: Use original HTML if available, otherwise fallback to old content
                    contentEl.empty();
                    contentEl.removeClass('editing');
                    
                    if (originalHTML) {
                        plugin.debugLog('debug', '[EventHandlers] Restoring original HTML content');
                        contentEl.innerHTML = originalHTML;
                    } else {
                        plugin.debugLog('debug', '[EventHandlers] Restoring old content as markdown');
                        await MarkdownRenderer.render(plugin.app, oldContent || '', contentEl, '', new Component());
                    }
                    
                    // Restore original raw content
                    messageEl.dataset.rawContent = oldContent || '';
                }
                
                // Clean up backup data
                delete contentEl.dataset.originalHTML;
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
