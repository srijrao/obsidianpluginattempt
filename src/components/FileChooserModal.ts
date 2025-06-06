import { App, Modal, TFile, TFolder, Vault, FuzzySuggestModal } from 'obsidian';

/**
 * Utility to get all files in a folder, optionally recursively and/or markdown only.
 */
function getFilesInFolder(folder: TFolder, recursive = false, markdownOnly = false): TFile[] {
    let files: TFile[] = [];
    for (const child of folder.children) {
        if (child instanceof TFile) {
            if (!markdownOnly || child.extension === 'md') files.push(child);
        } else if (recursive && child instanceof TFolder) {
            files = files.concat(getFilesInFolder(child, true, markdownOnly));
        }
    }
    return files;
}

/**
 * Utility to get all folders in the vault (recursively).
 */
function getAllFolders(root: TFolder): TFolder[] {
    const folders: TFolder[] = [];
    function recurse(folder: TFolder) {
        folders.push(folder);
        for (const child of folder.children) {
            if (child instanceof TFolder) recurse(child);
        }
    }
    recurse(root);
    return folders;
}

/**
 * Opens a modal to let the user search and choose a file from the vault.
 * Resolves with the selected TFile, or null if cancelled.
 */
export function chooseFile(app: App): Promise<TFile | null> {
    return new Promise((resolve) => {
        class FileSuggestModal extends FuzzySuggestModal<TFile> {
            constructor(app: App) { super(app); }
            getItems(): TFile[] { return app.vault.getMarkdownFiles(); }
            getItemText(item: TFile): string { return item.path; }
            onChooseItem(item: TFile) { resolve(item); }
            onClose() { resolve(null); }
        }
        new FileSuggestModal(app).open();
    });
}

/**
 * Search for files in the vault by path or basename (case-insensitive).
 * Returns a readable string of matches or a message if none found.
 */
export function searchFiles(app: App, query: string, options?: { maxResults?: number, markdownOnly?: boolean }): string {
    const files = options?.markdownOnly === false ? app.vault.getFiles() : app.vault.getMarkdownFiles();
    const lowerQuery = query.toLowerCase();
    const results = files.filter(f => f.path.toLowerCase().includes(lowerQuery) || f.basename.toLowerCase().includes(lowerQuery));
    if (!results.length) return `No files found matching: "${query}"`;
    return results.slice(0, options?.maxResults).map(f => `- ${f.path}`).join('\n');
}

/**
 * Search for folders in the vault by path or name (case-insensitive).
 * Returns a readable string of matches or a message if none found.
 */
export function searchFolders(app: App, query: string, options?: { maxResults?: number }): string {
    const allFolders = getAllFolders(app.vault.getRoot());
    const lowerQuery = query.toLowerCase();
    const results = allFolders.filter(folder => folder.path.toLowerCase().includes(lowerQuery) || folder.name.toLowerCase().includes(lowerQuery));
    if (!results.length) return `No folders found matching: "${query}"`;
    return results.slice(0, options?.maxResults).map(f => `- ${f.path}`).join('\n');
}

/**
 * List all files and folders in a folder (non-recursive).
 * Returns a readable string or a message if empty.
 */
export function listFilesInFolderNonRecursive(app: App, folderPath: string, options?: { markdownOnly?: boolean }): string {
    const folder = app.vault.getAbstractFileByPath(folderPath);
    if (!folder || !(folder instanceof TFolder)) return `Folder not found: "${folderPath}"`;
    const files = folder.children.filter(f => f instanceof TFile && (!options?.markdownOnly || f.extension === 'md')) as TFile[];
    const subfolders = folder.children.filter(f => f instanceof TFolder) as TFolder[];
    if (!files.length && !subfolders.length) return `No files or folders found in folder: "${folderPath}"`;
    const fileLines = files.map(f => `- [File] ${f.path}`);
    const folderLines = subfolders.map(sf => `- [Folder] ${sf.path}`);
    return [...folderLines, ...fileLines].join('\n');
}

/**
 * Recursively list all files in a folder and its subfolders.
 * Returns a readable string or a message if empty.
 */
export function listFilesInFolderRecursive(app: App, folderPath: string, options?: { markdownOnly?: boolean }): string {
    const folder = app.vault.getAbstractFileByPath(folderPath);
    if (!folder || !(folder instanceof TFolder)) return `Folder not found: "${folderPath}"`;
    const files = getFilesInFolder(folder, true, !!options?.markdownOnly);
    if (!files.length) return `No files found in folder (recursively): "${folderPath}"`;
    return files.map(f => `- ${f.path}`).join('\n');
}

/**
 * Search all files in the vault for a string (case-insensitive).
 * Returns a readable string of file paths containing the string, or a message if none found.
 */
export async function searchVaultForString(app: App, searchString: string, options?: { markdownOnly?: boolean, maxResults?: number }): Promise<string> {
    const files = options?.markdownOnly === false ? app.vault.getFiles() : app.vault.getMarkdownFiles();
    const lowerSearch = searchString.toLowerCase();
    const matches: string[] = [];
    for (const file of files) {
        const content = await app.vault.read(file);
        if (content.toLowerCase().includes(lowerSearch)) {
            matches.push(file.path);
            if (options?.maxResults && matches.length >= options.maxResults) break;
        }
    }
    if (!matches.length) return `No files found containing: "${searchString}"`;
    return matches.map(p => `- ${p}`).join('\n');
}

/**
 * Search for a string in files in a folder (optionally recursive), returning context and file path.
 * Returns the first N most recently modified results (default 5), with 20 words before and after the match.
 */
export async function searchStringInFolder(
    app: App,
    searchString: string,
    options?: { folderPath?: string, recursive?: boolean, markdownOnly?: boolean, maxResults?: number }
): Promise<string> {
    const folderPath = options?.folderPath ?? '';
    const recursive = options?.recursive ?? false;
    const markdownOnly = options?.markdownOnly ?? false;
    const maxResults = options?.maxResults ?? 5;
    const lowerSearch = searchString.toLowerCase();
    let files: TFile[] = [];
    if (folderPath) {
        const abs = app.vault.getAbstractFileByPath(folderPath);
        if (!abs || !(abs instanceof TFolder)) return `Folder not found: "${folderPath}"`;
        files = getFilesInFolder(abs, recursive, markdownOnly);
    } else {
        files = markdownOnly ? app.vault.getMarkdownFiles() : app.vault.getFiles();
    }
    files.sort((a, b) => b.stat.mtime - a.stat.mtime);
    const results: { path: string, context: string, mtime: number }[] = [];
    for (const file of files) {
        const content = await app.vault.read(file);
        const contentLower = content.toLowerCase();
        let idx = 0;
        while (true) {
            idx = contentLower.indexOf(lowerSearch, idx);
            if (idx === -1) break;
            const before = content.slice(0, idx).split(/\s+/).slice(-20).join(' ');
            const after = content.slice(idx + searchString.length).split(/\s+/).slice(0, 20).join(' ');
            const match = content.substr(idx, searchString.length);
            const context = `${before}>>${match}<<${after}`;
            results.push({ path: file.path, context, mtime: file.stat.mtime });
            idx += searchString.length;
            if (results.length >= maxResults) break;
        }
        if (results.length >= maxResults) break;
    }
    if (!results.length) return `No matches found for: "${searchString}"`;
    return results.slice(0, maxResults).map(r => `- ${r.path}\n  ...${r.context}...`).join('\n\n');
}
