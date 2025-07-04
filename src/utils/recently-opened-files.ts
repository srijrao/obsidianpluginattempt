// recently-opened-files.ts
// Utility for tracking recently opened files in the vault with timestamps.

import { App, TFile } from 'obsidian';
import { debugLog } from './logger';

export interface RecentlyOpenedFile {
    path: string;
    basename: string;
}

export interface RecentFilesDataJson {
    recentFiles: RecentlyOpenedFile[];
    omittedPaths: string[];
    omittedTags: string[];
    updateOn: 'file-open' | 'file-edit';
    omitBookmarks: boolean;
    maxLength: number | null;
}


const RECENTLY_OPENED_FILENAME = 'recently-opened-files.json';

// Returns the path to recently-opened-files.json in the vault root
function getRecentlyOpenedFilePath(app: App): string {
    // Determine the base path of the vault (Obsidian's root folder)
    // @ts-ignore
    const adapter = app.vault.adapter;
    const dataDir = adapter instanceof Object && 'basePath' in adapter
        ? (adapter as any).basePath
        : '';
    return `${dataDir}/${RECENTLY_OPENED_FILENAME}`;
}

export async function recordFileOpened(app: App, file: TFile, debugMode = false) {
    const filePath = getRecentlyOpenedFilePath(app);
    let data: RecentFilesDataJson = {
        recentFiles: [],
        omittedPaths: [],
        omittedTags: [],
        updateOn: 'file-open',
        omitBookmarks: false,
        maxLength: null
    };
    try {
        // @ts-ignore
        if (await app.vault.adapter.exists(filePath)) {
            // @ts-ignore
            const raw = await app.vault.adapter.read(filePath);
            const parsed = JSON.parse(raw);
            // Defensive: if parsed is not an object, reset to default
            if (typeof parsed === 'object' && parsed !== null) {
                data = {
                    recentFiles: Array.isArray(parsed.recentFiles) ? parsed.recentFiles : [],
                    omittedPaths: Array.isArray(parsed.omittedPaths) ? parsed.omittedPaths : [],
                    omittedTags: Array.isArray(parsed.omittedTags) ? parsed.omittedTags : [],
                    updateOn: typeof parsed.updateOn === 'string' ? parsed.updateOn : 'file-open',
                    omitBookmarks: typeof parsed.omitBookmarks === 'boolean' ? parsed.omitBookmarks : false,
                    maxLength: typeof parsed.maxLength === 'number' || parsed.maxLength === null ? parsed.maxLength : null
                };
            }
        }
    } catch (e) {
        debugLog(debugMode, 'warn', '[recently-opened-files] Failed to read existing records', e);
    }
    // Remove any previous entry for this file
    data.recentFiles = data.recentFiles.filter(r => r.path !== file.path);
    // Add new record to the front
    data.recentFiles.unshift({ path: file.path, basename: file.basename });
    // Optionally limit to last N (e.g., 100)
    if (data.recentFiles.length > 100) data.recentFiles = data.recentFiles.slice(0, 100);
    try {
        // @ts-ignore
        await app.vault.adapter.write(filePath, JSON.stringify(data, null, 2));
    } catch (e) {
        debugLog(debugMode, 'error', '[recently-opened-files] Failed to write records', e);
    }
}



/**
 * Returns recently opened files, preferring the recent-files-obsidian plugin if present and enabled.
 * Falls back to this plugin's own record if not. If neither is present, sets up a file-open listener.
 */
export async function getRecentlyOpenedFiles(app: App): Promise<RecentlyOpenedFile[]> {
    // Always listen for file-open events to keep our own file up to date
    // @ts-ignore
    if (app.workspace && typeof app.workspace.on === 'function' && !app.__recentlyOpenedListenerRegistered) {
        // @ts-ignore
        app.workspace.on('file-open', (file: TFile) => {
            if (file) recordFileOpened(app, file);
        });
        // @ts-ignore
        app.__recentlyOpenedListenerRegistered = true;
    }

    // Try to use recent-files-obsidian plugin's data.json if present and enabled
    // This is always at .obsidian/plugins/recent-files-obsidian/data.json (relative to vault root)
    // @ts-ignore
    const adapter = app.vault.adapter;
    const dataDir = adapter instanceof Object && 'basePath' in adapter
        ? (adapter as any).basePath
        : '';
    const recentFilesPluginPath = `${dataDir}/.obsidian/plugins/recent-files-obsidian/data.json`;
    let pluginEnabled = false;
    // Check if the plugin is enabled in Obsidian
    // @ts-ignore
    if (app.plugins && typeof app.plugins.enabledPlugins === 'object') {
        // @ts-ignore
        pluginEnabled = app.plugins.enabledPlugins.has('recent-files-obsidian');
    }
    // If the plugin is enabled, import its recent files into our own file
    if (pluginEnabled) {
        try {
            // @ts-ignore
            if (await app.vault.adapter.exists(recentFilesPluginPath)) {
                // @ts-ignore
                const raw = await app.vault.adapter.read(recentFilesPluginPath);
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed.recentFiles)) {
                    // Import into our own file for backup/merge
                    const fallbackFilePath = getRecentlyOpenedFilePath(app);
                    let data: RecentFilesDataJson = {
                        recentFiles: [],
                        omittedPaths: [],
                        omittedTags: [],
                        updateOn: 'file-open',
                        omitBookmarks: false,
                        maxLength: null
                    };
                    try {
                        // @ts-ignore
                        if (await app.vault.adapter.exists(fallbackFilePath)) {
                            // @ts-ignore
                            const raw2 = await app.vault.adapter.read(fallbackFilePath);
                            const parsed2 = JSON.parse(raw2);
                            if (typeof parsed2 === 'object' && parsed2 !== null) {
                                data = {
                                    recentFiles: Array.isArray(parsed2.recentFiles) ? parsed2.recentFiles : [],
                                    omittedPaths: Array.isArray(parsed2.omittedPaths) ? parsed2.omittedPaths : [],
                                    omittedTags: Array.isArray(parsed2.omittedTags) ? parsed2.omittedTags : [],
                                    updateOn: typeof parsed2.updateOn === 'string' ? parsed2.updateOn : 'file-open',
                                    omitBookmarks: typeof parsed2.omitBookmarks === 'boolean' ? parsed2.omitBookmarks : false,
                                    maxLength: typeof parsed2.maxLength === 'number' || parsed2.maxLength === null ? parsed2.maxLength : null
                                };
                            }
                        }
                    } catch (e) {}
                    // Merge plugin's recent files into our own, avoiding duplicates
                    const seen = new Set(data.recentFiles.map(f => f.path));
                    for (const f of parsed.recentFiles) {
                        if (!seen.has(f.path)) {
                            data.recentFiles.push({ path: f.path, basename: f.basename });
                        }
                    }
                    // Optionally limit to last N (e.g., 100)
                    if (data.recentFiles.length > 100) data.recentFiles = data.recentFiles.slice(0, 100);
                    try {
                        // @ts-ignore
                        await app.vault.adapter.write(fallbackFilePath, JSON.stringify(data, null, 2));
                    } catch (e) {}
                    // Return the plugin's list for compatibility
                    return parsed.recentFiles.map((f: any) => ({
                        path: f.path,
                        basename: f.basename
                    }));
                }
            }
        } catch (e) {
            debugLog(true, 'warn', '[recently-opened-files] Failed to read recent-files-obsidian plugin data', e);
        }
    }
    // Fallback to our own file
    const fallbackFilePath = getRecentlyOpenedFilePath(app);
    try {
        // @ts-ignore
        if (await app.vault.adapter.exists(fallbackFilePath)) {
            // @ts-ignore
            const raw = await app.vault.adapter.read(fallbackFilePath);
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed.recentFiles)) {
                return parsed.recentFiles;
            }
        }
    } catch (e) { }
    return [];
}
