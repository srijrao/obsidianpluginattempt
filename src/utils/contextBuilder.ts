import { App } from 'obsidian';
import { Message } from '../types';
import MyPlugin from '../main';
import { getSystemMessage } from './systemMessage';
import { processContextNotes } from './noteUtils';
import { getRecentlyOpenedFiles } from './recently-opened-files';
import { calculateTotalTokenCount } from './tokenCounter';

/**
 * Centralized utility for building context messages for AI conversations.
 * This function constructs the system message, appends context, and optionally includes the current note content.
 * All context-building logic for the plugin should be routed through here for DRYness and maintainability.
 */
export async function buildContextMessages({
    app,
    plugin,
    includeCurrentNote = true,
    includeContextNotes = true,
    debug = false,
    forceNoCurrentNote = false
}: {
    app: App,
    plugin: MyPlugin,
    includeCurrentNote?: boolean,
    includeContextNotes?: boolean,
    debug?: boolean,
    forceNoCurrentNote?: boolean
}): Promise<Message[]> {
    // Start with the system message.
    const messages: Message[] = [
        { role: 'system', content: getSystemMessage(plugin.settings) }
    ];

    // Add the list of recently opened files to the system message if enabled.
    if (plugin.settings.includeRecentlyOpenedNotes) {
        const recentlyOpenedFiles = await getRecentlyOpenedFiles(app);
        if (recentlyOpenedFiles.length > 0) {
            messages[0].content += `\n\nRecently Opened Files:\n${recentlyOpenedFiles.slice(0, 3).map(f => f.path).join('\n')}`;
        }
    }

    // Optionally append context notes to the system message.
    if (includeContextNotes && plugin.settings.enableContextNotes && plugin.settings.contextNotes) {
        const contextContent = await processContextNotes(plugin.settings.contextNotes, app);
        messages[0].content += `\n\nContext Notes:\n${contextContent}`;
    }

    // Optionally add the content of the current note as a separate system message.
    if (!forceNoCurrentNote && includeCurrentNote && plugin.settings.referenceCurrentNote) {
        const currentFile = app.workspace.getActiveFile();
        if (currentFile) {
            const currentNoteContent = await app.vault.cachedRead(currentFile);
            messages.push({
                role: 'system',
                content: `Here is the content of the current note (${currentFile.path}):\n\n${currentNoteContent}`
            });
        }
    }

    // Debug logging for context building if enabled.
    if (debug || plugin.settings.debugMode) {
        plugin.debugLog?.('debug', '[contextBuilder] Building context messages', {
            enableContextNotes: plugin.settings.enableContextNotes,
            contextNotes: plugin.settings.contextNotes,
            referenceCurrentNote: plugin.settings.referenceCurrentNote
        });
    }

    return messages;
}

/**
 * Truncates messages to fit within the model's context window.
 * Keeps system messages and truncates from the oldest chat messages first.
 * @param messages Array of messages to potentially truncate
 * @param maxTokens Maximum tokens for the model (optional, uses default estimate if not provided)
 * @param plugin Plugin instance for debug logging
 * @returns Truncated messages array
 */
export function truncateMessagesForContext(
    messages: Message[], 
    maxTokens?: number,
    plugin?: MyPlugin
): Message[] {
    if (!messages || messages.length === 0) return messages;
    
    // Use a conservative default if no limit specified
    const contextLimit = maxTokens || 8192; // Conservative default for most models
    
    const currentTokens = calculateTotalTokenCount(messages);
    
    if (currentTokens <= contextLimit) {
        // No truncation needed
        if (plugin?.debugLog) {
            plugin.debugLog('debug', '[contextBuilder] No truncation needed', {
                currentTokens,
                contextLimit,
                messageCount: messages.length
            });
        }
        return messages;
    }
    
    // Separate system messages from chat messages
    const systemMessages: Message[] = [];
    const chatMessages: Message[] = [];
    
    for (const message of messages) {
        if (message.role === 'system') {
            systemMessages.push(message);
        } else {
            chatMessages.push(message);
        }
    }
    
    // Always keep system messages, start with them
    const truncatedMessages = [...systemMessages];
    let remainingTokens = contextLimit - calculateTotalTokenCount(systemMessages);
    
    if (plugin?.debugLog) {
        plugin.debugLog('debug', '[contextBuilder] Starting truncation', {
            totalMessages: messages.length,
            systemMessages: systemMessages.length,
            chatMessages: chatMessages.length,
            systemTokens: calculateTotalTokenCount(systemMessages),
            remainingTokens,
            contextLimit
        });
    }
    
    // Add chat messages from newest to oldest until we hit the limit
    for (let i = chatMessages.length - 1; i >= 0; i--) {
        const message = chatMessages[i];
        const messageTokens = calculateTotalTokenCount([message]);
        
        if (messageTokens <= remainingTokens) {
            truncatedMessages.push(message);
            remainingTokens -= messageTokens;
        } else {
            // This message would exceed the limit, stop here
            if (plugin?.debugLog) {
                plugin.debugLog('debug', '[contextBuilder] Stopping truncation at message', {
                    messageIndex: i,
                    messageTokens,
                    remainingTokens
                });
            }
            break;
        }
    }
    
    // Re-order chat messages chronologically (system messages first, then chat messages in order)
    const finalChatMessages = truncatedMessages
        .filter(m => m.role !== 'system')
        .sort((a, b) => {
            // If messages have timestamps, sort by them, otherwise maintain relative order
            const aTime = (a as any).timestamp || 0;
            const bTime = (b as any).timestamp || 0;
            return aTime - bTime;
        });
    
    const finalMessages = [...systemMessages, ...finalChatMessages];
    
    if (plugin?.debugLog) {
        plugin.debugLog('info', '[contextBuilder] Context truncation complete', {
            originalMessages: messages.length,
            originalTokens: currentTokens,
            truncatedMessages: finalMessages.length,
            truncatedTokens: calculateTotalTokenCount(finalMessages),
            tokensRemoved: currentTokens - calculateTotalTokenCount(finalMessages),
            messagesRemoved: messages.length - finalMessages.length
        });
    }
    
    return finalMessages;
}
