import { Plugin } from 'obsidian';
import { registerCommand } from '../../utils/pluginUtils';
import { showNotice } from '../../utils/generalUtils';
import { MyPluginSettings } from '../../types';

/**
 * Registers toggle commands for various plugin settings.
 * These commands allow users to quickly enable or disable specific features.
 * 
 * @param plugin The Obsidian plugin instance.
 * @param settings The plugin's current settings.
 */
export function registerToggleCommands(
    plugin: Plugin,
    settings: MyPluginSettings
) {
    /**
     * Registers the 'Toggle Enable Obsidian Links' command.
     * This command toggles the `enableObsidianLinks` setting.
     */
    registerCommand(
        plugin,
        {
            id: 'toggle-enable-obsidian-links',
            name: 'Toggle Enable Obsidian Links',
            callback: async () => {
                settings.enableObsidianLinks = !settings.enableObsidianLinks;
                await (plugin as any).saveSettings(); // Persist the setting change
                
                const status = settings.enableObsidianLinks ? 'enabled' : 'disabled';
                showNotice(`Obsidian Links ${status}`); // Provide user feedback
            }
        }
    );

    /**
     * Registers the 'Toggle Enable Context Notes' command.
     * This command toggles the `enableContextNotes` setting.
     */
    registerCommand(
        plugin,
        {
            id: 'toggle-enable-context-notes',
            name: 'Toggle Enable Context Notes',
            callback: async () => {
                settings.enableContextNotes = !settings.enableContextNotes;
                await (plugin as any).saveSettings(); // Persist the setting change
                
                const status = settings.enableContextNotes ? 'enabled' : 'disabled';
                showNotice(`Context Notes ${status}`); // Provide user feedback
            }
        }
    );
}
