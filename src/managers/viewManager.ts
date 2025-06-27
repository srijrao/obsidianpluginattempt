import { App, Plugin } from 'obsidian';

/**
 * Activates and reveals a specific view type in the workspace.
 * @param app The Obsidian app instance
 * @param viewType The type of view to activate.
 * @param reveal Whether to reveal the leaf after setting its view state. Defaults to true.
 */
export async function activateView(app: App, viewType: string, reveal: boolean = true) {
    app.workspace.detachLeavesOfType(viewType);

    let leaf = app.workspace.getRightLeaf(false) || app.workspace.getLeaf(true);
    await leaf.setViewState({
        type: viewType,
        active: true,
    });

    if (reveal) {
        app.workspace.revealLeaf(leaf);
    }
}
