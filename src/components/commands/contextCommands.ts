import { Plugin, TFile } from 'obsidian';
import { registerCommand } from '../../utils/pluginUtils';
import { showNotice } from '../../utils/generalUtils';
import { MyPluginSettings } from '../../types';

/**
 * Registers context-related commands for various settings and operations.
 * @param plugin The plugin instance.
 * @param settings The plugin settings.
 */
export function registerContextCommands(
    plugin: Plugin,
    settings: MyPluginSettings
) {
    
    registerCommand(
        plugin,
        {
            id: 'toggle-enable-obsidian-links',
            name: 'Toggle Enable Obsidian Links',
            callback: async () => {
                settings.enableObsidianLinks = !settings.enableObsidianLinks;
                await (plugin as any).saveSettings();
                
                const status = settings.enableObsidianLinks ? 'enabled' : 'disabled';
                showNotice(`Obsidian Links ${status}`);
            }
        }
    );

    
    registerCommand(
        plugin,
        {
            id: 'toggle-enable-context-notes',
            name: 'Toggle Enable Context Notes',
            callback: async () => {
                settings.enableContextNotes = !settings.enableContextNotes;
                await (plugin as any).saveSettings();
                
                const status = settings.enableContextNotes ? 'enabled' : 'disabled';
                showNotice(`Context Notes ${status}`);
            }
        }
    );

    
    registerCommand(
        plugin,
        {
            id: 'clear-context-notes',
            name: 'Clear Context Notes',
            callback: async () => {
                settings.contextNotes = '';
                await (plugin as any).saveSettings();
                showNotice('Context Notes cleared');
            }
        }
    );

    
    registerCommand(
        plugin,
        {
            id: 'copy-context-notes-to-clipboard',
            name: 'Copy Context Notes to Clipboard',
            callback: async () => {
                if (!settings.contextNotes || settings.contextNotes.trim().length === 0) {
                    showNotice('No context notes to copy');
                    return;
                }

                try {
                    await navigator.clipboard.writeText(settings.contextNotes);
                    showNotice('Context notes copied to clipboard');
                } catch (error) {
                    console.error('Failed to copy context notes to clipboard:', error);
                    showNotice('Failed to copy context notes to clipboard');
                }
            }
        }
    );

    
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

                
                if (settings.contextNotes && settings.contextNotes.includes(wikiLink)) {
                    showNotice(`"${noteTitle}" is already in context notes`);
                    return;
                }

                
                if (settings.contextNotes && settings.contextNotes.trim().length > 0) {
                    settings.contextNotes += `\n${wikiLink}`;
                } else {
                    settings.contextNotes = wikiLink;
                }

                await (plugin as any).saveSettings();
                showNotice(`Added "${noteTitle}" to context notes`);
            }
        }
    );
}
