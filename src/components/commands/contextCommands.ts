import { Plugin, TFile } from 'obsidian';
import { registerCommand } from '../../utils/pluginUtils';
import { showNotice } from '../../utils/generalUtils';
import { MyPluginSettings } from '../../types';

/**
 * Registers context-related commands for various settings and operations.
 * These commands allow users to control how context notes and Obsidian links are handled.
 * 
 * @param plugin The Obsidian plugin instance.
 * @param settings The plugin's current settings.
 */
export function registerContextCommands(
    plugin: Plugin,
    settings: MyPluginSettings
) {


    /**
     * Registers the 'Clear Context Notes' command.
     * This command clears all content from the context notes setting.
     */
    registerCommand(
        plugin,
        {
            id: 'clear-context-notes',
            name: 'Clear Context Notes',
            callback: async () => {
                settings.contextNotes = ''; // Clear context notes
                await (plugin as any).saveSettings(); // Save updated settings
                showNotice('Context Notes cleared');
            }
        }
    );

    /**
     * Registers the 'Copy Context Notes to Clipboard' command.
     * This command copies the content of the context notes setting to the user's clipboard.
     */
    registerCommand(
        plugin,
        {
            id: 'copy-context-notes-to-clipboard',
            name: 'Copy Context Notes to Clipboard',
            callback: async () => {
                // Check if there are any context notes to copy
                if (!settings.contextNotes || settings.contextNotes.trim().length === 0) {
                    showNotice('No context notes to copy');
                    return;
                }

                try {
                    await navigator.clipboard.writeText(settings.contextNotes); // Copy to clipboard
                    showNotice('Context notes copied to clipboard');
                } catch (error) {
                    console.error('Failed to copy context notes to clipboard:', error);
                    showNotice('Failed to copy context notes to clipboard');
                }
            }
        }
    );

    /**
     * Registers the 'Add Current Note to Context Notes' command.
     * This command adds a wiki link to the currently active note to the context notes setting.
     */
    registerCommand(
        plugin,
        {
            id: 'add-current-note-to-context',
            name: 'Add Current Note to Context Notes',
            callback: async () => {
                const activeFile = plugin.app.workspace.getActiveFile();
                if (!activeFile) {
                    showNotice('No active note to add to context');
                    return;
                }

                const noteTitle = activeFile.basename;
                const wikiLink = `[[${noteTitle}]]`;

                // Check if the note is already in context notes to avoid duplicates
                if (settings.contextNotes && settings.contextNotes.includes(wikiLink)) {
                    showNotice(`"${noteTitle}" is already in context notes`);
                    return;
                }

                // Append the wiki link to existing context notes or set it if empty
                if (settings.contextNotes && settings.contextNotes.trim().length > 0) {
                    settings.contextNotes += `\n${wikiLink}`;
                } else {
                    settings.contextNotes = wikiLink;
                }

                await (plugin as any).saveSettings(); // Save updated settings
                showNotice(`Added "${noteTitle}" to context notes`);
            }
        }
    );
}
