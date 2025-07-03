import { Editor, Plugin, TFile } from 'obsidian';
import { registerCommand } from '../../utils/pluginUtils';
import { showNotice, copyToClipboard, moveCursorAfterInsert } from '../../utils/generalUtils';
import { parseSelection } from '../../utils/parseSelection';
import { MyPluginSettings, Message } from '../../types';

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
                const messages = parseSelection(content, settings.chatSeparator);
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
