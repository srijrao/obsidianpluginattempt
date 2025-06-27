import { Editor, Plugin } from 'obsidian';

/**
 * Registers a command with Obsidian, optionally adding a ribbon icon.
 * @param plugin The plugin instance
 * @param options Command options including id, name, callback/editorCallback.
 * @param ribbonIcon Optional icon ID for a ribbon button.
 * @param ribbonTitle Optional tooltip title for the ribbon button.
 */
export function registerCommand(
    plugin: Plugin,
    options: {
        id: string;
        name: string;
        callback?: () => void;
        editorCallback?: (editor: Editor) => void;
    },
    ribbonIcon?: string,
    ribbonTitle?: string
) {
    plugin.addCommand(options);
    if (ribbonIcon && ribbonTitle) {
        plugin.addRibbonIcon(ribbonIcon, ribbonTitle, options.callback || (() => {}));
    }
}
