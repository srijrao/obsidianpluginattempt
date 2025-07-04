import { App } from 'obsidian';
import { Message } from '../types';
import MyPlugin from '../main';
import { getSystemMessage } from './systemMessage';
import { processContextNotes } from './noteUtils';

/**
 * Centralized utility for building context messages for AI conversations.
 * This function constructs the system message, appends context notes, and optionally includes the current note content.
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
