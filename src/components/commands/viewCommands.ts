import { Plugin } from 'obsidian';
import { registerCommand } from '../../utils/pluginUtils';
import { activateView } from '../../utils/viewManager';
import { VIEW_TYPE_CHAT } from '../../chat';

/**
 * Registers view-related commands for the plugin.
 * These commands allow users to open specific plugin views (chat).
 *
 * @param plugin The Obsidian plugin instance.
 */
export function registerViewCommands(plugin: Plugin) {
    /**
     * Registers the 'Show AI Chat' command.
     * This command activates and displays the AI chat view.
     */
    registerCommand(
        plugin,
        {
            id: 'show-ai-chat',
            name: 'Show AI Chat',
            callback: () => activateView(plugin.app, VIEW_TYPE_CHAT)
        },
        'message-square', // Icon ID for the command palette
        'Open AI Chat' // Display name in the command palette
    );
}
