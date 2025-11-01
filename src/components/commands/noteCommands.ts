import { Editor, Plugin, TFile } from 'obsidian';
import { registerCommand } from '../../utils/pluginUtils';
import { showNotice, copyToClipboard, moveCursorAfterInsert } from '../../utils/generalUtils';
import { parseSelection } from '../../utils/parseSelection';
import { MyPluginSettings, Message } from '../../types';
import { debugLog } from '../../utils/logger';

/**
 * Parses chat note content that may contain YAML frontmatter and tool execution blocks.
 * Strips YAML frontmatter and reconstructs messages with tool results from ai-tool-execution blocks.
 * @param content The full content of the chat note
 * @param chatSeparator The chat separator string
 * @returns Array of parsed messages with tool results if present
 */
function parseChatNoteContent(content: string, chatSeparator: string): Message[] {
    debugLog(true, 'info', '[parseChatNoteContent] Parsing chat note content', { contentLength: content.length });

    // Strip YAML frontmatter if present
    let chatContent = content.replace(/^---\s*[\s\S]*?---\n?/, '');
    debugLog(true, 'debug', '[parseChatNoteContent] Stripped YAML frontmatter', { originalLength: content.length, strippedLength: chatContent.length });

    // Split by chat separator to get individual message blocks
    const messageBlocks = chatContent.split(new RegExp(`\\n${chatSeparator}\\n`, 'g'));
    const messages: Message[] = [];

    for (let i = 0; i < messageBlocks.length; i++) {
        const block = messageBlocks[i].trim();
        if (!block) continue;

        // Determine role based on position (even = user, odd = assistant)
        const role: 'user' | 'assistant' = i % 2 === 0 ? 'user' : 'assistant';

        // Check if this block contains tool execution data
        const toolExecutionMatch = block.match(/```ai-tool-execution\s*\n([\s\S]*?)\n```/);
        let messageContent = block;
        let toolResults: any[] = [];
        let reasoning: any = null;
        let taskStatus: any = null;

        if (toolExecutionMatch) {
            try {
                const toolData = JSON.parse(toolExecutionMatch[1]);
                toolResults = toolData.toolResults || [];
                reasoning = toolData.reasoning;
                taskStatus = toolData.taskStatus;

                // Remove the tool execution block from the message content
                messageContent = block.replace(toolExecutionMatch[0], '').trim();

                debugLog(true, 'debug', '[parseChatNoteContent] Parsed tool execution data', {
                    role,
                    hasToolResults: toolResults.length > 0,
                    hasReasoning: !!reasoning,
                    hasTaskStatus: !!taskStatus
                });
            } catch (e) {
                debugLog(true, 'warn', '[parseChatNoteContent] Failed to parse tool execution data', e);
                // Continue with the block as regular content
            }
        }

        // Create the message object
        const message: Message = {
            role,
            content: messageContent
        };

        // Add tool data if present
        if (toolResults.length > 0) {
            message.toolResults = toolResults;
        }
        if (reasoning) {
            message.reasoning = reasoning;
        }
        if (taskStatus) {
            message.taskStatus = taskStatus;
        }

        messages.push(message);
    }

    debugLog(true, 'info', '[parseChatNoteContent] Parsed messages', { messageCount: messages.length });
    return messages;
}

/**
 * Registers note-related commands for the plugin.
 * These commands provide utilities for interacting with notes, such as copying names,
 * inserting predefined strings, and loading chat history from notes.
 *
 * @param plugin The Obsidian plugin instance.
 * @param settings The plugin's current settings.
 * @param activateChatViewAndLoadMessages A function to activate the chat view and load messages into it.
 */
export function registerNoteCommands(
    plugin: Plugin,
    settings: MyPluginSettings,
    activateChatViewAndLoadMessages: (messages: Message[]) => Promise<void>
) {
    /**
     * Registers the 'Copy Active Note Name' command.
     * This command copies the wiki link of the currently active note to the clipboard.
     */
    registerCommand(
        plugin,
        {
            id: 'copy-active-note-name',
            name: 'Copy Active Note Name',
            callback: async () => {
                const activeFile = plugin.app.workspace.getActiveFile();
                if (activeFile) {
                    const noteName = `[[${activeFile.basename}]]`;
                    await copyToClipboard(noteName, `Copied to clipboard: ${noteName}`, 'Failed to copy to clipboard');
                } else {
                    showNotice('No active note found');
                }
            }
        }
    );

    /**
     * Registers the 'Insert Chat Start String' command.
     * This command inserts a predefined string (from plugin settings) at the current cursor position in the editor.
     */
    registerCommand(
        plugin,
        {
            id: 'insert-chat-start-string',
            name: 'Insert Chat Start String',
            editorCallback: (editor: Editor) => {
                const chatStartString = settings.chatStartString ?? '';
                if (!chatStartString) {
                    showNotice('chatStartString is not set in settings.');
                    return;
                }
                const cursor = editor.getCursor();
                editor.replaceRange(chatStartString, cursor);
                moveCursorAfterInsert(editor, cursor, chatStartString);
            }
        }
    );

    /**
     * Registers the 'Load Chat Note into Chat' command.
     * This command reads the content of the active note, parses it as chat messages,
     * and loads them into the chat view.
     */
    registerCommand(
        plugin,
        {
            id: 'load-chat-note-into-chat',
            name: 'Load Chat Note into Chat',
            callback: async () => {
                let file: TFile | null = plugin.app.workspace.getActiveFile();
                if (!file) {
                    showNotice('No active note found. Please open a note to load as chat.');
                    return;
                }
                let content = await plugin.app.vault.read(file);
                // Parse the note content into chat messages using the chat separator
                const messages = parseChatNoteContent(content, settings.chatSeparator);
                if (!messages.length) {
                    showNotice('No chat messages found in the selected note.');
                    return;
                }
                // Activate the chat view and load the parsed messages
                await activateChatViewAndLoadMessages(messages);
            }
        }
    );
}
