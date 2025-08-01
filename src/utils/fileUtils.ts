import { App, TAbstractFile, TFile, TFolder } from 'obsidian';
import { debugLog } from './logger';
import { isTFile, isTFolder } from './typeguards';

/**
 * Retrieves a TFile or TFolder object from the vault based on its path.
 * Handles case-insensitive matching for folders if the exact path is not found.
 * @param app The Obsidian App instance.
 * @param path The path to the file or folder.
 * @param debugMode Whether to log debug output.
 * @returns The TFile or TFolder object if found, otherwise undefined.
 */
export function getFileOrFolderByPath(app: App, path: string, debugMode: boolean): TFile | TFolder | undefined {
    debugLog(debugMode, 'debug', '[fileUtils] Attempting to get file or folder by path:', path);
    let fileOrFolder: TAbstractFile | null = null;

    if (path === '' || path === '/') {
        fileOrFolder = app.vault.getRoot();
    } else {
        fileOrFolder = app.vault.getAbstractFileByPath(path);
        // Try case-insensitive match if not found and it's a folder path
        if (!fileOrFolder && path.endsWith('/')) {
            const allFolders = app.vault.getAllLoadedFiles().filter(f => f instanceof TFolder);
            const match = allFolders.find(f => f.path.toLowerCase() === path.toLowerCase());
            if (match) fileOrFolder = match;
        }
    }

    if (fileOrFolder) {
        debugLog(debugMode, 'debug', '[fileUtils] Found file or folder:', fileOrFolder.path);
        return fileOrFolder as TFile | TFolder;
    }

    debugLog(debugMode, 'warn', '[fileUtils] File or folder not found:', path);
    return undefined;
}

/**
 * Validates if a given path corresponds to an existing TFile.
 * @param app The Obsidian App instance.
 * @param path The path to the file.
 * @param debugMode Whether to log debug output.
 * @returns The TFile object if found and is a file, otherwise undefined.
 */
export function getTFileByPath(app: App, path: string, debugMode: boolean): TFile | undefined {
    const fileOrFolder = getFileOrFolderByPath(app, path, debugMode);
    if (fileOrFolder && isTFile(fileOrFolder)) {
        return fileOrFolder;
    }
    debugLog(debugMode, 'warn', '[fileUtils] Path does not point to a valid TFile:', path);
    return undefined;
}

/**
 * Validates if a given path corresponds to an existing TFolder.
 * @param app The Obsidian App instance.
 * @param path The path to the folder.
 * @param debugMode Whether to log debug output.
 * @returns The TFolder object if found and is a folder, otherwise undefined.
 */
export function getTFolderByPath(app: App, path: string, debugMode: boolean): TFolder | undefined {
    const fileOrFolder = getFileOrFolderByPath(app, path, debugMode);
    if (fileOrFolder && isTFolder(fileOrFolder)) {
        return fileOrFolder;
    }
    debugLog(debugMode, 'warn', '[fileUtils] Path does not point to a valid TFolder:', path);
    return undefined;
}

/**
 * Ensures that a folder exists, creating it and any necessary parent folders if they don't.
 * @param app The Obsidian App instance.
 * @param folderPath The path to the folder to ensure exists.
 * @param debugMode Whether to log debug output.
 * @returns A Promise that resolves to true if the folder exists or was created, false otherwise.
 */
export async function ensureFolderExists(app: App, folderPath: string, debugMode: boolean): Promise<boolean> {
    debugLog(debugMode, 'debug', '[fileUtils] Ensuring folder exists:', folderPath);
    if (!folderPath) return true; // Root path always exists

    const folder = app.vault.getAbstractFileByPath(folderPath);
    if (folder) {
        if (isTFolder(folder)) {
            debugLog(debugMode, 'debug', '[fileUtils] Folder already exists:', folderPath);
            return true;
        } else {
            debugLog(debugMode, 'warn', '[fileUtils] Path exists but is not a folder:', folderPath);
            return false; // Path exists but is a file
        }
    }

    try {
        await app.vault.createFolder(folderPath);
        debugLog(debugMode, 'info', '[fileUtils] Created folder:', folderPath);
        return true;
    } catch (error: any) {
        // Check if the error is due to the folder already existing (race condition)
        if (error.message && /already exists/i.test(error.message)) {
            debugLog(debugMode, 'warn', '[fileUtils] Folder already exists (race condition):', folderPath);
            return true;
        }
        debugLog(debugMode, 'error', '[fileUtils] Failed to create folder:', folderPath, error);
        return false;
    }
}
