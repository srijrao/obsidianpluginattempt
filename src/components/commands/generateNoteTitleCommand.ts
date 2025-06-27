import { Plugin } from 'obsidian';
import { registerCommand } from '../../utils/pluginUtils';
import { MyPluginSettings, Message } from '../../types';

/**
 * Registers the generate note title command.
 * @param plugin The plugin instance.
 * @param settings The plugin settings.
 * @param processMessages Function to process messages with context.
 */
export function registerGenerateNoteTitleCommand(
    plugin: Plugin,
    settings: MyPluginSettings,
    processMessages: (messages: Message[]) => Promise<Message[]>
) {
    registerCommand(
        plugin,
        {
            id: 'generate-note-title',
            name: 'Generate Note Title',
            callback: async () => {
                const { generateNoteTitle } = await import("../../YAMLHandler");
                await generateNoteTitle(
                    plugin.app,
                    settings,
                    processMessages
                );
            }
        }
    );
}
