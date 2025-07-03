import { Plugin } from 'obsidian';
import { registerCommand } from '../../utils/pluginUtils';
import { activateView } from '../../utils/viewManager';
import { VIEW_TYPE_CHAT } from '../../chat';

/**
 * Defines the view type for the model settings view.
 */
export const VIEW_TYPE_MODEL_SETTINGS = 'model-settings-view';

/**
 * Registers view-related commands for the plugin.
 * These commands allow users to open specific plugin views (settings, chat).
 *
 * @param plugin The Obsidian plugin instance.
 */
export function registerViewCommands(plugin: Plugin) {
    /**
     * Registers the 'Show AI Settings' command.
     * This command activates and displays the AI settings view.
     */
    registerCommand(
        plugin,
        {
            id: 'show-ai-settings',
            name: 'Show AI Settings',
            callback: () => activateView(plugin.app, VIEW_TYPE_MODEL_SETTINGS)
        },
        'file-sliders', // Icon ID for the command palette
        'Open AI Settings' // Display name in the command palette
    );

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
