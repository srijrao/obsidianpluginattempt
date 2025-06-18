import { App, TFile } from 'obsidian';
import { FileBackup, BackupData } from '../types';

/**
 * Manages file backups stored in the plugin's data folder
 */
export class BackupManager {
    private app: App;
    private backupFilePath: string;
    private maxBackupsPerFile: number = 10; // Limit backups to prevent excessive storage

    constructor(app: App, pluginDataPath: string) {
        this.app = app;
        this.backupFilePath = `${pluginDataPath}/backups.json`;
    }    /**
     * Creates a backup of a file's current content before modification
     */
    async createBackup(filePath: string, currentContent: string): Promise<void> {
        try {
            const backupData = await this.loadBackupData();
            
            if (!backupData.backups[filePath]) {
                backupData.backups[filePath] = [];
            }

            const timestamp = Date.now();
            const readableTimestamp = new Date(timestamp).toLocaleString();

            const backup: FileBackup = {
                filePath,
                content: currentContent,
                timestamp,
                readableTimestamp
            };

            // Add backup to the beginning of the array (most recent first)
            backupData.backups[filePath].unshift(backup);

            // Limit the number of backups per file
            if (backupData.backups[filePath].length > this.maxBackupsPerFile) {
                backupData.backups[filePath] = backupData.backups[filePath].slice(0, this.maxBackupsPerFile);
            }

            await this.saveBackupData(backupData);
            console.log(`[AI Assistant] Backup created for ${filePath} at ${readableTimestamp}`);
        } catch (error) {
            console.error('Failed to create backup:', error);
            // Don't throw the error to prevent file operations from failing
        }
    }

    /**
     * Gets all backups for a specific file
     */
    async getBackupsForFile(filePath: string): Promise<FileBackup[]> {
        try {
            const backupData = await this.loadBackupData();
            return backupData.backups[filePath] || [];
        } catch (error) {
            console.error('Failed to get backups for file:', error);
            return [];
        }
    }

    /**
     * Gets all files that have backups
     */
    async getAllBackupFiles(): Promise<string[]> {
        try {
            const backupData = await this.loadBackupData();
            return Object.keys(backupData.backups).filter(path => 
                backupData.backups[path] && backupData.backups[path].length > 0
            );
        } catch (error) {
            console.error('Failed to get backup files:', error);
            return [];
        }
    }

    /**
     * Restores a backup to the vault, overwriting the current file
     */
    async restoreBackup(backup: FileBackup): Promise<{ success: boolean; error?: string }> {
        try {
            const file = this.app.vault.getAbstractFileByPath(backup.filePath);
            
            if (!file) {
                // File doesn't exist, create it
                await this.app.vault.create(backup.filePath, backup.content);
                return { success: true };
            }

            if (!(file instanceof TFile)) {
                return { success: false, error: `Path is not a file: ${backup.filePath}` };
            }

            // Overwrite the existing file
            await this.app.vault.modify(file, backup.content);
            return { success: true };
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    }

    /**
     * Deletes all backups for a specific file
     */
    async deleteBackupsForFile(filePath: string): Promise<void> {
        try {
            const backupData = await this.loadBackupData();
            delete backupData.backups[filePath];
            await this.saveBackupData(backupData);
        } catch (error) {
            console.error('Failed to delete backups for file:', error);
        }
    }

    /**
     * Deletes a specific backup entry
     */
    async deleteSpecificBackup(filePath: string, timestamp: number): Promise<void> {
        try {
            const backupData = await this.loadBackupData();
            if (backupData.backups[filePath]) {
                backupData.backups[filePath] = backupData.backups[filePath].filter(
                    backup => backup.timestamp !== timestamp
                );
                
                // If no backups left for this file, remove the file entry
                if (backupData.backups[filePath].length === 0) {
                    delete backupData.backups[filePath];
                }
                
                await this.saveBackupData(backupData);
            }
        } catch (error) {
            console.error('Failed to delete specific backup:', error);
        }
    }

    /**
     * Checks if content is different from the most recent backup
     */
    async shouldCreateBackup(filePath: string, newContent: string): Promise<boolean> {
        try {
            const backups = await this.getBackupsForFile(filePath);
            if (backups.length === 0) {
                return true; // No backups exist, so we should create one
            }

            const mostRecentBackup = backups[0];
            return mostRecentBackup.content !== newContent;
        } catch (error) {
            console.error('Failed to check if backup should be created:', error);
            return true; // Default to creating backup on error
        }
    }    /**
     * Loads backup data from the JSON file
     */
    private async loadBackupData(): Promise<BackupData> {
        try {
            const adapter = this.app.vault.adapter;
            if (await adapter.exists(this.backupFilePath)) {
                const content = await adapter.read(this.backupFilePath);
                const parsed = JSON.parse(content);
                // Ensure the structure is correct
                if (parsed && typeof parsed === 'object' && parsed.backups) {
                    return parsed;
                }
            }
        } catch (error) {
            console.error('Failed to load backup data:', error);
        }

        // Return empty backup data if file doesn't exist or can't be read
        return { backups: {} };
    }    /**
     * Saves backup data to the JSON file
     */
    private async saveBackupData(backupData: BackupData): Promise<void> {
        try {
            const adapter = this.app.vault.adapter;
            
            // Ensure the directory exists
            const backupDir = this.backupFilePath.substring(0, this.backupFilePath.lastIndexOf('/'));
            try {
                if (!await adapter.exists(backupDir)) {
                    await adapter.mkdir(backupDir);
                }
            } catch (mkdirError) {
                // Directory might already exist or there might be permission issues
                console.warn('Could not create backup directory:', mkdirError);
            }
            
            await adapter.write(this.backupFilePath, JSON.stringify(backupData, null, 2));
        } catch (error) {
            console.error('Failed to save backup data:', error);
            throw error;
        }
    }

    /**
     * Gets the total number of backups across all files
     */
    async getTotalBackupCount(): Promise<number> {
        try {
            const backupData = await this.loadBackupData();
            return Object.values(backupData.backups).reduce((total, backups) => total + backups.length, 0);
        } catch (error) {
            console.error('Failed to get total backup count:', error);
            return 0;
        }
    }

    /**
     * Gets the total size of all backups in bytes (approximate)
     */
    async getTotalBackupSize(): Promise<number> {
        try {
            const backupData = await this.loadBackupData();
            let totalSize = 0;
            
            Object.values(backupData.backups).forEach(backups => {
                backups.forEach(backup => {
                    totalSize += backup.content.length;
                });
            });
            
            return totalSize;
        } catch (error) {
            console.error('Failed to get total backup size:', error);
            return 0;
        }
    }

    /**
     * Initializes the backup system by ensuring the directory exists
     */
    async initialize(): Promise<void> {
        try {
            const adapter = this.app.vault.adapter;
            const backupDir = this.backupFilePath.substring(0, this.backupFilePath.lastIndexOf('/'));
            
            if (!await adapter.exists(backupDir)) {
                await adapter.mkdir(backupDir);
                console.log('[AI Assistant] Created backup directory:', backupDir);
            }
            
            // Ensure the backup file exists with proper structure
            if (!await adapter.exists(this.backupFilePath)) {
                await this.saveBackupData({ backups: {} });
                console.log('[AI Assistant] Created backup file:', this.backupFilePath);
            }
        } catch (error) {
            console.error('Failed to initialize backup system:', error);
        }
    }

    /**
     * Cleans up old backups to prevent unlimited growth
     * Removes backups older than specified days (default: 30 days)
     */
    async cleanupOldBackups(maxDays: number = 30): Promise<void> {
        try {
            const backupData = await this.loadBackupData();
            const cutoffTime = Date.now() - (maxDays * 24 * 60 * 60 * 1000);
            let cleaned = false;

            for (const filePath in backupData.backups) {
                const originalLength = backupData.backups[filePath].length;
                backupData.backups[filePath] = backupData.backups[filePath].filter(
                    backup => backup.timestamp > cutoffTime
                );
                
                if (backupData.backups[filePath].length < originalLength) {
                    cleaned = true;
                    console.log(`[AI Assistant] Cleaned ${originalLength - backupData.backups[filePath].length} old backups for ${filePath}`);
                }

                // Remove empty file entries
                if (backupData.backups[filePath].length === 0) {
                    delete backupData.backups[filePath];
                }
            }

            if (cleaned) {
                await this.saveBackupData(backupData);
            }
        } catch (error) {
            console.error('Failed to cleanup old backups:', error);
        }
    }
}
