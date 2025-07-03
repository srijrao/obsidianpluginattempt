import { Plugin } from 'obsidian';
import { registerCommand } from '../../utils/pluginUtils';
import { MyPluginSettings, Message } from '../../types';

/**
 * Registers the 'Generate Note Title' command.
 * This command triggers an AI-powered generation of a note title based on the current note's content.
 * 
 * @param plugin The Obsidian plugin instance.
 * @param settings The plugin's current settings.
 * @param processMessages A function to process messages with context before sending them to the AI.
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
                // Dynamically import the generateNoteTitle function to avoid circular dependencies
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
