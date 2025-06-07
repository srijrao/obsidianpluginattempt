import { App, Modal, TFile, TFolder, Vault, FuzzySuggestModal } from 'obsidian';
import * as yaml from 'js-yaml';

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
    if (!results.length) return `No results found for: "${searchString}"`;
    return results.map(r => `- ${r.path}\n  Context: ${r.context}`).join('\n');
}

/**
 * Move a file or folder to another folder in the vault.
 * @param app Obsidian App instance
 * @param sourcePath Path to the file or folder to move (relative to vault root)
 * @param destFolderPath Path to the destination folder (relative to vault root)
 * @returns Promise<string> describing the result
 */
export async function moveFileOrFolder(app: App, sourcePath: string, destFolderPath: string): Promise<string> {
    const src = app.vault.getAbstractFileByPath(sourcePath);
    const destFolder = app.vault.getAbstractFileByPath(destFolderPath);
    if (!src) return `Source not found: "${sourcePath}"`;
    if (!destFolder || !(destFolder instanceof TFolder)) return `Destination folder not found: "${destFolderPath}"`;
    const newPath = destFolderPath.replace(/\/$/, '') + '/' + src.name;
    try {
        await app.vault.rename(src, newPath);
        return `Moved '${sourcePath}' to '${newPath}'.`;
    } catch (err: any) {
        return `Failed to move: ${err?.message || err}`;
    }
}

/**
 * Copy a file or folder to another folder in the vault.
 * @param app Obsidian App instance
 * @param sourcePath Path to the file or folder to copy (relative to vault root)
 * @param destFolderPath Path to the destination folder (relative to vault root)
 * @returns Promise<string> describing the result
 */
export async function copyFileOrFolder(app: App, sourcePath: string, destFolderPath: string): Promise<string> {
    const src = app.vault.getAbstractFileByPath(sourcePath);
    const destFolder = app.vault.getAbstractFileByPath(destFolderPath);
    if (!src) return `Source not found: "${sourcePath}"`;
    if (!destFolder || !(destFolder instanceof TFolder)) return `Destination folder not found: "${destFolderPath}"`;
    const newPath = destFolderPath.replace(/\/$/, '') + '/' + src.name;
    try {
        if (src instanceof TFile) {
            const data = await app.vault.read(src);
            await app.vault.create(newPath, data);
            return `Copied file '${sourcePath}' to '${newPath}'.`;
        } else if (src instanceof TFolder) {
            await copyFolderRecursive(app, src, newPath);
            return `Copied folder '${sourcePath}' to '${newPath}'.`;
        } else {
            return `Source is neither file nor folder: "${sourcePath}"`;
        }
    } catch (err: any) {
        return `Failed to copy: ${err?.message || err}`;
    }
}

/**
 * Helper to recursively copy a folder and its contents.
 */
async function copyFolderRecursive(app: App, srcFolder: TFolder, destPath: string): Promise<void> {
    await app.vault.createFolder(destPath);
    for (const child of srcFolder.children) {
        const childDestPath = destPath + '/' + child.name;
        if (child instanceof TFile) {
            const data = await app.vault.read(child);
            await app.vault.create(childDestPath, data);
        } else if (child instanceof TFolder) {
            await copyFolderRecursive(app, child, childDestPath);
        }
    }
}

/**
 * Delete a file or folder (recursively for folders).
 * @param app Obsidian App instance
 * @param path Path to the file or folder to delete (relative to vault root)
 * @returns Promise<string> describing the result
 */
export async function deleteFileOrFolder(app: App, path: string): Promise<string> {
    const target = app.vault.getAbstractFileByPath(path);
    if (!target) return `Target not found: "${path}"`;
    try {
        await app.vault.delete(target, true);
        return `Deleted '${path}'.`;
    } catch (err: any) {
        return `Failed to delete: ${err?.message || err}`;
    }
}

/**
 * Rename or move a file or folder to a new path.
 * @param app Obsidian App instance
 * @param oldPath Current path of the file or folder (relative to vault root)
 * @param newPath New path (relative to vault root)
 * @returns Promise<string> describing the result
 */
export async function renameFileOrFolder(app: App, oldPath: string, newPath: string): Promise<string> {
    const target = app.vault.getAbstractFileByPath(oldPath);
    if (!target) return `Target not found: "${oldPath}"`;
    try {
        await app.vault.rename(target, newPath);
        return `Renamed/moved '${oldPath}' to '${newPath}'.`;
    } catch (err: any) {
        return `Failed to rename/move: ${err?.message || err}`;
    }
}

/**
 * Create a new file with optional content.
 * @param app Obsidian App instance
 * @param filePath Path to the new file (relative to vault root)
 * @param content Optional initial content for the file
 * @returns Promise<string> describing the result
 */
export async function createFile(app: App, filePath: string, content = ''): Promise<string> {
    try {
        await app.vault.create(filePath, content);
        return `Created file '${filePath}'.`;
    } catch (err: any) {
        return `Failed to create file: ${err?.message || err}`;
    }
}

/**
 * Create a new folder.
 * @param app Obsidian App instance
 * @param folderPath Path to the new folder (relative to vault root)
 * @returns Promise<string> describing the result
 */
export async function createFolder(app: App, folderPath: string): Promise<string> {
    try {
        await app.vault.createFolder(folderPath);
        return `Created folder '${folderPath}'.`;
    } catch (err: any) {
        return `Failed to create folder: ${err?.message || err}`;
    }
}

/**
 * Read the contents of a file as a string.
 * @param app Obsidian App instance
 * @param filePath Path to the file (relative to vault root)
 * @returns Promise<string> with file contents or error message
 */
export async function readFile(app: App, filePath: string): Promise<string> {
    const file = app.vault.getAbstractFileByPath(filePath);
    if (!file || !(file instanceof TFile)) return `File not found: "${filePath}"`;
    try {
        return await app.vault.read(file);
    } catch (err: any) {
        return `Failed to read file: ${err?.message || err}`;
    }
}

/**
 * Overwrite the contents of a file.
 * @param app Obsidian App instance
 * @param filePath Path to the file (relative to vault root)
 * @param content New content to write
 * @returns Promise<string> describing the result
 */
export async function writeFile(app: App, filePath: string, content: string): Promise<string> {
    const file = app.vault.getAbstractFileByPath(filePath);
    if (!file || !(file instanceof TFile)) return `File not found: "${filePath}"`;
    try {
        await app.vault.modify(file, content);
        return `Wrote to file '${filePath}'.`;
    } catch (err: any) {
        return `Failed to write file: ${err?.message || err}`;
    }
}

/**
 * Append content to the end of a file.
 * @param app Obsidian App instance
 * @param filePath Path to the file (relative to vault root)
 * @param content Content to append
 * @returns Promise<string> describing the result
 */
export async function appendToFile(app: App, filePath: string, content: string): Promise<string> {
    const file = app.vault.getAbstractFileByPath(filePath);
    if (!file || !(file instanceof TFile)) return `File not found: "${filePath}"`;
    try {
        await app.vault.append(file, content);
        return `Appended to file '${filePath}'.`;
    } catch (err: any) {
        return `Failed to append to file: ${err?.message || err}`;
    }
}

/**
 * Read only the YAML frontmatter from a markdown file.
 * @param app Obsidian App instance
 * @param filePath Path to the markdown file (relative to vault root)
 * @returns Promise<string> with YAML as a string, or a message if not found/invalid
 */
export async function readYamlOnly(app: App, filePath: string): Promise<string> {
    const file = app.vault.getAbstractFileByPath(filePath);
    if (!file || !(file instanceof TFile)) return `File not found: "${filePath}"`;
    try {
        const content = await app.vault.read(file);
        const match = content.match(/^---\s*\n([\s\S]*?)\n---/);
        if (!match) return `No YAML frontmatter found in: "${filePath}"`;
        // Optionally parse and re-stringify for clean output
        try {
            const parsed = yaml.load(match[1]);
            return yaml.dump(parsed);
        } catch (e) {
            return match[1]; // Return raw YAML if parsing fails
        }
    } catch (err: any) {
        return `Failed to read YAML: ${err?.message || err}`;
    }
}
