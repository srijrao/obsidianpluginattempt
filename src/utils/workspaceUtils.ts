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
        app.workspace.iterateAllLeaves((leaf: WorkspaceLeaf) => {
            if (leaf.view.getViewType() === 'markdown') {
                const file = (leaf.view as any)?.file;
                // Accept both real TFile instances and mock objects with required properties
                if (file && (file instanceof TFile || (file.path && file.basename))) {
                    openFiles.add(file as TFile);
                }
            }
        });
    } else {
        // Fallback for test environments - only gets initialized leaves
        const leaves = app.workspace.getLeavesOfType('markdown');
        for (const leaf of leaves) {
            const file = (leaf.view as any)?.file;
            if (file && (file instanceof TFile || (file.path && file.basename))) {
                openFiles.add(file as TFile);
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
