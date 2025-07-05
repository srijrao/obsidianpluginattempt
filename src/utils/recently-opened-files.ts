// recently-opened-files.ts
// Utility for tracking recently opened files in the vault with timestamps.

import { App, TFile, EventRef } from 'obsidian';
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

/**
 * Singleton class for tracking recently opened files in Obsidian.
 * Handles integration with the recent-files-obsidian plugin if available.
 */
export class RecentlyOpenedFilesManager {
    private static instance: RecentlyOpenedFilesManager;
    private app: App;
    private listenerRef: EventRef | null = null;
    private readonly FILENAME = 'recently-opened-files.json';
    private readonly MAX_FILES = 100;

    private constructor(app: App) {
        this.app = app;
        this.setupFileListener();
    }

    public static getInstance(app?: App): RecentlyOpenedFilesManager {
        if (!RecentlyOpenedFilesManager.instance) {
            if (!app) {
                throw new Error('App instance required for first initialization');
            }
            RecentlyOpenedFilesManager.instance = new RecentlyOpenedFilesManager(app);
        }
        return RecentlyOpenedFilesManager.instance;
    }

    private setupFileListener(): void {
        if (this.listenerRef) {
            return; // Already set up
        }

        this.listenerRef = this.app.workspace.on('file-open', (file: TFile) => {
            if (file) {
                this.recordFileOpened(file);
            }
        });
    }

    private getFilePath(): string {
        return `${this.app.vault.configDir}/${this.FILENAME}`;
    }

    private async recordFileOpened(file: TFile, debugMode = false): Promise<void> {
        const filePath = this.getFilePath();
        let data: RecentFilesDataJson = {
            recentFiles: [],
            omittedPaths: [],
            omittedTags: [],
            updateOn: 'file-open',
            omitBookmarks: false,
            maxLength: null
        };

        try {
            if (await this.app.vault.adapter.exists(filePath)) {
                const raw = await this.app.vault.adapter.read(filePath);
                const parsed = JSON.parse(raw);
                if (this.isValidDataJson(parsed)) {
                    data = parsed;
                }
            }
        } catch (e) {
            debugLog(debugMode, 'warn', '[recently-opened-files] Failed to read existing records', e);
        }

        // Remove any previous entry for this file
        data.recentFiles = data.recentFiles.filter(r => r.path !== file.path);
        
        // Add new record to the front
        data.recentFiles.unshift({ 
            path: file.path, 
            basename: file.basename 
        });

        // Limit to max files
        if (data.recentFiles.length > this.MAX_FILES) {
            data.recentFiles = data.recentFiles.slice(0, this.MAX_FILES);
        }

        try {
            await this.app.vault.adapter.write(filePath, JSON.stringify(data, null, 2));
        } catch (e) {
            debugLog(debugMode, 'error', '[recently-opened-files] Failed to write records', e);
        }
    }

    private isValidDataJson(data: any): data is RecentFilesDataJson {
        return (
            typeof data === 'object' &&
            data !== null &&
            Array.isArray(data.recentFiles) &&
            Array.isArray(data.omittedPaths) &&
            Array.isArray(data.omittedTags) &&
            typeof data.updateOn === 'string' &&
            typeof data.omitBookmarks === 'boolean' &&
            (typeof data.maxLength === 'number' || data.maxLength === null)
        );
    }

    public async getRecentlyOpenedFiles(): Promise<RecentlyOpenedFile[]> {
        // Try to use recent-files-obsidian plugin's data first if enabled
        const pluginFiles = await this.getRecentFilesFromPlugin();
        if (pluginFiles.length > 0) {
            return pluginFiles;
        }

        // Fallback to our own file
        return this.getRecentFilesFromOwnFile();
    }

    private async getRecentFilesFromPlugin(): Promise<RecentlyOpenedFile[]> {
        const pluginId = 'recent-files-obsidian';
        const pluginDataPath = `${this.app.vault.configDir}/plugins/${pluginId}/data.json`;

        try {
            // Check if plugin data file exists (indicates plugin is installed and has data)
            if (await this.app.vault.adapter.exists(pluginDataPath)) {
                const raw = await this.app.vault.adapter.read(pluginDataPath);
                const parsed = JSON.parse(raw);
                
                if (Array.isArray(parsed.recentFiles)) {
                    // Sync with our own file for backup
                    await this.syncWithOwnFile(parsed.recentFiles);
                    
                    return parsed.recentFiles.map((f: any) => ({
                        path: f.path,
                        basename: f.basename
                    }));
                }
            }
        } catch (e) {
            debugLog(true, 'warn', '[recently-opened-files] Failed to read recent-files-obsidian plugin data', e);
        }

        return [];
    }

    private async syncWithOwnFile(pluginFiles: RecentlyOpenedFile[]): Promise<void> {
        const filePath = this.getFilePath();
        let data: RecentFilesDataJson = {
            recentFiles: [],
            omittedPaths: [],
            omittedTags: [],
            updateOn: 'file-open',
            omitBookmarks: false,
            maxLength: null
        };

        try {
            if (await this.app.vault.adapter.exists(filePath)) {
                const raw = await this.app.vault.adapter.read(filePath);
                const parsed = JSON.parse(raw);
                if (this.isValidDataJson(parsed)) {
                    data = parsed;
                }
            }
        } catch (e) {
            // Continue with default data
        }

        // Merge plugin files with our own, avoiding duplicates
        const seen = new Set(data.recentFiles.map(f => f.path));
        for (const file of pluginFiles) {
            if (!seen.has(file.path)) {
                data.recentFiles.push({
                    path: file.path,
                    basename: file.basename
                });
            }
        }

        // Limit and save
        if (data.recentFiles.length > this.MAX_FILES) {
            data.recentFiles = data.recentFiles.slice(0, this.MAX_FILES);
        }

        try {
            await this.app.vault.adapter.write(filePath, JSON.stringify(data, null, 2));
        } catch (e) {
            // Silent failure for sync operation
        }
    }

    private async getRecentFilesFromOwnFile(): Promise<RecentlyOpenedFile[]> {
        const filePath = this.getFilePath();
        
        try {
            if (await this.app.vault.adapter.exists(filePath)) {
                const raw = await this.app.vault.adapter.read(filePath);
                const parsed = JSON.parse(raw);
                
                if (this.isValidDataJson(parsed)) {
                    return parsed.recentFiles;
                }
            }
        } catch (e) {
            debugLog(true, 'warn', '[recently-opened-files] Failed to read own file', e);
        }

        return [];
    }

    public destroy(): void {
        if (this.listenerRef) {
            this.app.workspace.offref(this.listenerRef);
            this.listenerRef = null;
        }
    }
}

// Convenience functions for backward compatibility
export async function getRecentlyOpenedFiles(app: App): Promise<RecentlyOpenedFile[]> {
    const manager = RecentlyOpenedFilesManager.getInstance(app);
    return manager.getRecentlyOpenedFiles();
}

export async function recordFileOpened(app: App, file: TFile, debugMode = false): Promise<void> {
    // This is now handled automatically by the manager's file listener
    // Keeping this function for backward compatibility, but it's essentially a no-op
}
