import { Editor, Plugin, TFile } from 'obsidian';
import { registerCommand } from '../../utils/pluginUtils';
import { showNotice, copyToClipboard, moveCursorAfterInsert } from '../../utils/generalUtils';
import { parseSelection } from '../parseSelection';
import { MyPluginSettings, Message } from '../../types';

/**
 * Registers note-related commands.
 * @param plugin The plugin instance.
 */
export function registerNoteCommands(
    plugin: Plugin,
    settings: MyPluginSettings,
    activateChatViewAndLoadMessages: (messages: Message[]) => Promise<void>
) {
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
                const messages = parseSelection(content, settings.chatSeparator);
                if (!messages.length) {
                    showNotice('No chat messages found in the selected note.');
                    return;
                }
                await activateChatViewAndLoadMessages(messages);
            }
        }
    );
}
