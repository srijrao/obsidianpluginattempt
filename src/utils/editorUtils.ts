import { App, Editor, TFile } from 'obsidian';
import { debugLog } from './logger';

/**
 * Gets an editor for the specified file, opening it if necessary.
 * If the file is already open in a markdown view, returns its editor.
 * Otherwise, opens the file in a new leaf and returns the editor after a short delay.
 * @param app The Obsidian App instance.
 * @param file The TFile to get or open.
 * @param debugMode Whether to log debug output.
 * @returns The Editor instance, or undefined if not available.
 */
export async function getOrOpenFileEditor(app: App, file: TFile, debugMode: boolean): Promise<Editor | undefined> {
    debugLog(debugMode, 'debug', '[editorUtils] Attempting to get or open editor for file:', file.path);
    try {
        // Search for an existing markdown leaf with the file open
        const leaves = app.workspace.getLeavesOfType('markdown');
        for (const leaf of leaves) {
            if (leaf.view && 'file' in leaf.view && leaf.view.file === file) {
                debugLog(debugMode, 'debug', '[editorUtils] Found existing editor for file');
                if ('editor' in leaf.view && leaf.view.editor) {
                    app.workspace.setActiveLeaf(leaf);
                    return leaf.view.editor as Editor;
                  }
            }
        }
        // If not open, open the file in a new leaf and get the editor
        debugLog(debugMode, 'debug', '[editorUtils] File not open, attempting to open it');
        const leaf = app.workspace.getUnpinnedLeaf();
        if (leaf) {
            await leaf.openFile(file);
            // Wait for the editor to be ready
            await new Promise(resolve => setTimeout(resolve, 100));
            if (leaf.view && 'editor' in leaf.view && leaf.view.editor) {
                debugLog(debugMode, 'debug', '[editorUtils] Successfully opened file and got editor');
                return leaf.view.editor as Editor;
            }
        }
        debugLog(debugMode, 'warn', '[editorUtils] Could not get or create editor for file');
        return undefined;
    } catch (error) {
        debugLog(debugMode, 'error', '[editorUtils] Error getting or opening editor:', error);
        return undefined;
    }
}
