import { Plugin } from 'obsidian';
import { registerCommand } from '../../utils/pluginUtils';
import { showNotice } from '../../utils/generalUtils';
import { MyPluginSettings } from '../../types';

/**
 * Registers toggle commands for various settings.
 * @param plugin The plugin instance.
 * @param settings The plugin settings.
 */
export function registerToggleCommands(
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
}
