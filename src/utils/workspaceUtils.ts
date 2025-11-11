import { App, TFile, WorkspaceLeaf } from 'obsidian';

/**
 * Get all open markdown files in the workspace, including those not yet focused/initialized.
 * Uses iterateAllLeaves() to catch all tabs in the workspace.
 */
export function getAllOpenMarkdownFiles(app: App): TFile[] {
    const openFiles = new Set<TFile>();
    
    // iterateAllLeaves() finds ALL leaves including unfocused tabs
    // Fall back to getLeavesOfType() only in test environments where iterateAllLeaves isn't mocked
    if (typeof app.workspace.iterateAllLeaves === 'function') {
        console.log('DEBUG: using iterateAllLeaves');
        app.workspace.iterateAllLeaves((leaf: WorkspaceLeaf) => {
                try {
                    if (leaf.view.getViewType() === 'markdown') {
                        let file = (leaf.view as any)?.file;

                        // If the leaf's view isn't initialized yet, try to recover a path from the
                        // stored view state and resolve it from the vault. This helps catch files
                        // for leaves that were open before restarting Obsidian but not yet loaded.
                        if (!file && typeof (leaf as any).getViewState === 'function') {
                            try {
                                const viewState = (leaf as any).getViewState();
                                const candidatePath = viewState?.state?.file || viewState?.state?.path || viewState?.file;
                                if (candidatePath && typeof app.vault?.getAbstractFileByPath === 'function') {
                                    const resolved = app.vault.getAbstractFileByPath(candidatePath);
                                    if (resolved && resolved instanceof TFile) {
                                        file = resolved as any;
                                    }
                                }
                            }
                            catch (e) {
                                // swallow viewState parsing errors - continue without this leaf
                            }
                        }

                        // Accept both real TFile instances and mock objects with required properties
                        if (file && (file instanceof TFile || (file.path && file.basename))) {
                            openFiles.add(file as TFile);
                        }
                    }
                }
                catch (e) {
                    // Be defensive: a single bad leaf/plugin shouldn't break the whole scan.
                }
            });
    } else {
        // Fallback for test environments - only gets initialized leaves
        const leaves = app.workspace.getLeavesOfType('markdown');
        for (const leaf of leaves) {
            try {
                let file = (leaf.view as any)?.file;
                if (!file && typeof (leaf as any).getViewState === 'function') {
                    try {
                        const viewState = (leaf as any).getViewState();
                        const candidatePath = viewState?.state?.file || viewState?.state?.path || viewState?.file;
                        if (candidatePath && typeof app.vault?.getAbstractFileByPath === 'function') {
                            const resolved = app.vault.getAbstractFileByPath(candidatePath);
                            if (resolved && resolved instanceof TFile) {
                                file = resolved as any;
                            }
                        }
                    }
                    catch (e) {
                        // ignore
                    }
                }

                if (file && (file instanceof TFile || (file.path && file.basename))) {
                    openFiles.add(file as TFile);
                }
            }
            catch (e) {
                // ignore leaf-level errors
            }
        }
    }
    
    return Array.from(openFiles);
}

/**
 * Get basenames of all open markdown files for display purposes
 */
export function getOpenMarkdownFileNames(app: App): string[] {
    const files = getAllOpenMarkdownFiles(app);
    return files.map(f => f.basename);
}

/**
 * Get paths of all open markdown files
 */
export function getOpenMarkdownFilePaths(app: App): string[] {
    const files = getAllOpenMarkdownFiles(app);
    return files.map(f => f.path).sort();
}
