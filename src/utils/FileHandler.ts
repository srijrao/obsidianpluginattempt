import { App, Modal, TFile, TFolder, Vault, FuzzySuggestModal } from 'obsidian';
import * as yaml from 'js-yaml';

/**
 * Retrieves a TFile or TFolder from the vault by path, with type checking and error handling.
 * @template T - The expected type, either TFile or TFolder.
 * @param {App} app - The Obsidian App instance.
 * @param {string} path - The path to the file or folder.
 * @param {'file' | 'folder'} type - The expected type ('file' or 'folder').
 * @returns {T | null} The TFile or TFolder if found and matches the type, otherwise null.
 */
function getVaultItem<T extends TFile | TFolder>(app: App, path: string, type: 'file' | 'folder'): T | null {
    const item = app.vault.getAbstractFileByPath(path);
    if (!item) {
        return null; // Item not found
    }
    if (type === 'file' && item instanceof TFile) {
        return item as T;
    }
    if (type === 'folder' && item instanceof TFolder) {
        return item as T;
    }
    return null; // Item found but wrong type
}

/**
 * Standardized error message for item not found or wrong type.
 * @param {string} path - The path that was searched.
 * @param {'file' | 'folder'} type - The expected type.
 * @returns {string} A formatted error string.
 */
function itemNotFoundError(path: string, type: 'file' | 'folder'): string {
    return `${type.charAt(0).toUpperCase() + type.slice(1)} not found or is not a ${type}: "${path}"`;
}

/**
 * Utility to get all files in a folder, optionally recursively and/or markdown only.
 * @param {TFolder} folder - The folder to search within.
 * @param {boolean} [recursive=false] - Whether to search subfolders recursively.
 * @param {boolean} [markdownOnly=false] - Whether to return only markdown files.
 * @returns {TFile[]} An array of TFile objects.
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
 * @param {TFolder} root - The root folder of the vault.
 * @returns {TFolder[]} An array of TFolder objects.
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
 * Filters and formats a list of TFiles or TFolders based on a query.
 * @template T - The type of items in the array (TFile or TFolder).
 * @param {T[]} items - The array of TFile or TFolder objects to search.
 * @param {string} query - The search string.
 * @param {(item: T) => string} getItemText - A function to extract the text to search against from each item.
 * @param {{ maxResults?: number }} [options] - Optional parameters for maxResults.
 * @param {string} [noResultsMessage] - The message to return if no results are found.
 * @returns {string} A formatted string of results or a noResultsMessage.
 */
function filterAndFormatResults<T extends TFile | TFolder>(
    items: T[],
    query: string,
    getItemText: (item: T) => string,
    options?: { maxResults?: number },
    noResultsMessage?: string
): string {
    const lowerQuery = query.toLowerCase();
    const results = items.filter(item => getItemText(item).toLowerCase().includes(lowerQuery));

    if (!results.length) {
        return noResultsMessage || `No results found matching: "${query}"`;
    }

    return results.slice(0, options?.maxResults).map(item => `- ${item.path}`).join('\n');
}

/**
 * Opens a modal to let the user search and choose a file from the vault.
 * Resolves with the selected TFile, or null if cancelled.
 * @param {App} app - The Obsidian App instance.
 * @returns {Promise<TFile | null>} A promise that resolves with the selected TFile or null.
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
 * @param {App} app - The Obsidian App instance.
 * @param {string} query - The search query.
 * @param {{ maxResults?: number, markdownOnly?: boolean }} [options] - Optional parameters.
 * @returns {string} A readable string of matches or a message if none found.
 */
export function searchFiles(app: App, query: string, options?: { maxResults?: number, markdownOnly?: boolean }): string {
    const files = options?.markdownOnly === false ? app.vault.getFiles() : app.vault.getMarkdownFiles();
    return filterAndFormatResults(
        files,
        query,
        (f) => `${f.path} ${f.basename}`,
        options,
        `No files found matching: "${query}"`
    );
}

/**
 * Search for folders in the vault by path or name (case-insensitive).
 * @param {App} app - The Obsidian App instance.
 * @param {string} query - The search query.
 * @param {{ maxResults?: number }} [options] - Optional parameters.
 * @returns {string} A readable string of matches or a message if none found.
 */
export function searchFolders(app: App, query: string, options?: { maxResults?: number }): string {
    const allFolders = getAllFolders(app.vault.getRoot());
    return filterAndFormatResults(
        allFolders,
        query,
        (folder) => `${folder.path} ${folder.name}`,
        options,
        `No folders found matching: "${query}"`
    );
}

/**
 * List all files and folders in a folder (non-recursive).
 * @param {App} app - The Obsidian App instance.
 * @param {string} folderPath - The path to the folder.
 * @param {{ markdownOnly?: boolean }} [options] - Optional parameters.
 * @returns {string} A readable string or a message if empty.
 */
export function listFilesInFolderNonRecursive(app: App, folderPath: string, options?: { markdownOnly?: boolean }): string {
    const folder = getVaultItem<TFolder>(app, folderPath, 'folder');
    if (!folder) return itemNotFoundError(folderPath, 'folder');

    const files = folder.children.filter(f => f instanceof TFile && (!options?.markdownOnly || f.extension === 'md')) as TFile[];
    const subfolders = folder.children.filter(f => f instanceof TFolder) as TFolder[];

    if (!files.length && !subfolders.length) return `No files or folders found in folder: "${folderPath}"`;

    const fileLines = files.map(f => `- [File] ${f.path}`);
    const folderLines = subfolders.map(sf => `- [Folder] ${sf.path}`);
    return [...folderLines, ...fileLines].join('\n');
}

/**
 * Recursively list all files in a folder and its subfolders.
 * @param {App} app - The Obsidian App instance.
 * @param {string} folderPath - The path to the folder.
 * @param {{ markdownOnly?: boolean }} [options] - Optional parameters.
 * @returns {string} A readable string or a message if empty.
 */
export function listFilesInFolderRecursive(app: App, folderPath: string, options?: { markdownOnly?: boolean }): string {
    const folder = getVaultItem<TFolder>(app, folderPath, 'folder');
    if (!folder) return itemNotFoundError(folderPath, 'folder');

    const files = getFilesInFolder(folder, true, !!options?.markdownOnly);
    if (!files.length) return `No files found in folder (recursively): "${folderPath}"`;
    return files.map(f => `- ${f.path}`).join('\n');
}

/**
 * Search all files in the vault for a string (case-insensitive).
 * @param {App} app - The Obsidian App instance.
 * @param {string} searchString - The string to search for.
 * @param {{ markdownOnly?: boolean, maxResults?: number }} [options] - Optional parameters.
 * @returns {Promise<string>} A readable string of file paths containing the string, or a message if none found.
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
 * @param {App} app - The Obsidian App instance.
 * @param {string} searchString - The string to search for.
 * @param {{ folderPath?: string, recursive?: boolean, markdownOnly?: boolean, maxResults?: number }} [options] - Optional parameters.
 * @returns {Promise<string>} A formatted string of results including context, or a message if none found.
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
        const abs = getVaultItem<TFolder>(app, folderPath, 'folder');
        if (!abs) return itemNotFoundError(folderPath, 'folder');
        files = getFilesInFolder(abs, recursive, markdownOnly);
    } else {
        files = markdownOnly ? app.vault.getMarkdownFiles() : app.vault.getFiles();
    }

    files.sort((a, b) => b.stat.mtime - a.stat.mtime); // Sort by most recently modified

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
 * Moves a file or folder to another folder in the vault.
 * @param {App} app - The Obsidian App instance.
 * @param {string} sourcePath - Path to the file or folder to move (relative to vault root).
 * @param {string} destFolderPath - Path to the destination folder (relative to vault root).
 * @returns {Promise<string>} A promise describing the result of the operation.
 */
export async function moveFileOrFolder(app: App, sourcePath: string, destFolderPath: string): Promise<string> {
    const src = app.vault.getAbstractFileByPath(sourcePath);
    const destFolder = getVaultItem<TFolder>(app, destFolderPath, 'folder');

    if (!src) return `Source not found: "${sourcePath}"`;
    if (!destFolder) return itemNotFoundError(destFolderPath, 'folder');

    const newPath = destFolderPath.replace(/\/$/, '') + '/' + src.name;
    try {
        await app.vault.rename(src, newPath);
        return `Moved '${sourcePath}' to '${newPath}'.`;
    } catch (err: any) {
        return `Failed to move: ${err?.message || err}`;
    }
}

/**
 * Copies a file or folder to another folder in the vault.
 * @param {App} app - The Obsidian App instance.
 * @param {string} sourcePath - Path to the file or folder to copy (relative to vault root).
 * @param {string} destFolderPath - Path to the destination folder (relative to vault root).
 * @returns {Promise<string>} A promise describing the result of the operation.
 */
export async function copyFileOrFolder(app: App, sourcePath: string, destFolderPath: string): Promise<string> {
    const src = app.vault.getAbstractFileByPath(sourcePath);
    const destFolder = getVaultItem<TFolder>(app, destFolderPath, 'folder');

    if (!src) return `Source not found: "${sourcePath}"`;
    if (!destFolder) return itemNotFoundError(destFolderPath, 'folder');

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
 * @param {App} app - The Obsidian App instance.
 * @param {TFolder} srcFolder - The source folder to copy.
 * @param {string} destPath - The destination path for the copied folder.
 * @returns {Promise<void>} A promise that resolves when the copy is complete.
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
 * Deletes a file or folder (recursively for folders).
 * @param {App} app - The Obsidian App instance.
 * @param {string} path - Path to the file or folder to delete (relative to vault root).
 * @returns {Promise<string>} A promise describing the result of the operation.
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
 * Renames or moves a file or folder to a new path.
 * @param {App} app - The Obsidian App instance.
 * @param {string} oldPath - Current path of the file or folder (relative to vault root).
 * @param {string} newPath - New path (relative to vault root).
 * @returns {Promise<string>} A promise describing the result of the operation.
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
 * Creates a new file with optional content.
 * @param {App} app - The Obsidian App instance.
 * @param {string} filePath - Path to the new file (relative to vault root).
 * @param {string} [content=''] - Optional initial content for the file.
 * @returns {Promise<string>} A promise describing the result of the operation.
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
 * Creates a new folder.
 * @param {App} app - The Obsidian App instance.
 * @param {string} folderPath - Path to the new folder (relative to vault root).
 * @returns {Promise<string>} A promise describing the result of the operation.
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
 * Creates a new file with optional content, creating parent folders if needed.
 * @param {App} app - The Obsidian App instance.
 * @param {string} filePath - Path to the new file (relative to vault root).
 * @param {string} [content=''] - Optional initial content for the file.
 * @returns {Promise<string>} A promise describing the result of the operation.
 */
export async function createFileWithParents(app: App, filePath: string, content = ''): Promise<string> {
    const parts = filePath.split('/');
    parts.pop(); // remove file name
    let current = '';
    for (const part of parts) {
        current = current ? `${current}/${part}` : part;
        if (current && !app.vault.getAbstractFileByPath(current)) {
            try {
                await app.vault.createFolder(current);
            } catch (err: any) {
                // Ignore if already exists due to race, else fail
                if (!/already exists/i.test(err?.message || '')) {
                    return `Failed to create parent folder: ${err?.message || err}`;
                }
            }
        }
    }
    return createFile(app, filePath, content);
}

/**
 * Reads the contents of a file as a string.
 * @param {App} app - The Obsidian App instance.
 * @param {string} filePath - Path to the file (relative to vault root).
 * @returns {Promise<string>} A promise with file contents or an error message.
 */
export async function readFile(app: App, filePath: string): Promise<string> {
    const file = getVaultItem<TFile>(app, filePath, 'file');
    if (!file) return itemNotFoundError(filePath, 'file');
    try {
        return await app.vault.read(file);
    } catch (err: any) {
        return `Failed to read file: ${err?.message || err}`;
    }
}

/**
 * Overwrites the contents of a file.
 * @param {App} app - The Obsidian App instance.
 * @param {string} filePath - Path to the file (relative to vault root).
 * @param {string} content - New content to write.
 * @returns {Promise<string>} A promise describing the result of the operation.
 */
export async function writeFile(app: App, filePath: string, content: string): Promise<string> {
    const file = getVaultItem<TFile>(app, filePath, 'file');
    if (!file) return itemNotFoundError(filePath, 'file');
    try {
        await app.vault.modify(file, content);
        return `Wrote to file '${filePath}'.`;
    } catch (err: any) {
        return `Failed to write file: ${err?.message || err}`;
    }
}

/**
 * Appends content to the end of a file.
 * @param {App} app - The Obsidian App instance.
 * @param {string} filePath - Path to the file (relative to vault root).
 * @param {string} content - Content to append.
 * @returns {Promise<string>} A promise describing the result of the operation.
 */
export async function appendToFile(app: App, filePath: string, content: string): Promise<string> {
    const file = getVaultItem<TFile>(app, filePath, 'file');
    if (!file) return itemNotFoundError(filePath, 'file');
    try {
        await app.vault.append(file, content);
        return `Appended to file '${filePath}'.`;
    } catch (err: any) {
        return `Failed to append to file: ${err?.message || err}`;
    }
}

/**
 * Reads only the YAML frontmatter from a markdown file.
 * @param {App} app - The Obsidian App instance.
 * @param {string} filePath - Path to the markdown file (relative to vault root).
 * @returns {Promise<string>} A promise with YAML as a string, or a message if not found/invalid.
 */
export async function readYamlOnly(app: App, filePath: string): Promise<string> {
    const file = getVaultItem<TFile>(app, filePath, 'file');
    if (!file) return itemNotFoundError(filePath, 'file');
    try {
        const content = await app.vault.read(file);
        const match = content.match(/^---\s*\n([\s\S]*?)\n---/);
        if (!match) return `No YAML frontmatter found in: "${filePath}"`;
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
