import { Plugin } from 'obsidian';
import { registerCommand } from '../utils/pluginUtils';
import { activateView } from '../managers/viewManager';
import { VIEW_TYPE_CHAT } from '../components/chat';

export const VIEW_TYPE_MODEL_SETTINGS = 'model-settings-view';

/**
 * Registers view-related commands.
 * @param plugin The plugin instance.
 */
export function registerViewCommands(plugin: Plugin) {
    registerCommand(
        plugin,
        {
            id: 'show-ai-settings',
            name: 'Show AI Settings',
            callback: () => activateView(plugin.app, VIEW_TYPE_MODEL_SETTINGS)
        },
        'file-sliders',
        'Open AI Settings'
    );

    registerCommand(
        plugin,
        {
            id: 'show-ai-chat',
            name: 'Show AI Chat',
            callback: () => activateView(plugin.app, VIEW_TYPE_CHAT)
        },
        'message-square',
        'Open AI Chat'
    );
}
