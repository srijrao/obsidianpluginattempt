import { App, TFile } from 'obsidian';
import { FileBackup, BackupData } from '../types';

/**
 * Manages file backups stored in the plugin's data folder
 */
export class BackupManager {
    private app: App;
    private backupFilePath: string;
    private binaryBackupFolder: string;
    private maxBackupsPerFile: number = 10; // Limit backups to prevent excessive storage

    constructor(app: App, pluginDataPath: string) {
        this.app = app;
        this.backupFilePath = `${pluginDataPath}/backups.json`;
        this.binaryBackupFolder = `${pluginDataPath}/binary-backups`;
    }

    /**
     * Determines if a file is binary based on its extension
     * Uses a whitelist of known text extensions - everything else is treated as binary
     */
    private isBinaryFile(filePath: string): boolean {
        const textExtensions = [
            // Markdown and text
            '.md', '.txt', '.text', '.rtf',
            // Code and markup
            '.js', '.ts', '.jsx', '.tsx', '.html', '.htm', '.css', '.scss', '.sass', '.less',
            '.json', '.xml', '.yaml', '.yml', '.toml', '.ini', '.conf', '.config',
            // Programming languages
            '.py', '.java', '.c', '.cpp', '.h', '.hpp', '.cs', '.php', '.rb', '.go', '.rs', '.swift',
            '.kt', '.scala', '.clj', '.hs', '.elm', '.dart', '.r', '.m', '.pl', '.sh', '.bash', '.zsh',
            '.fish', '.ps1', '.bat', '.cmd',
            // Web and data
            '.svg', '.csv', '.tsv', '.log', '.sql', '.graphql', '.gql',
            // Documentation
            '.tex', '.latex', '.bib', '.org', '.rst', '.asciidoc', '.adoc',
            // Configuration and other text formats
            '.gitignore', '.gitattributes', '.editorconfig', '.env', '.properties',
            // No extension (often text files like README, LICENSE, etc.)
            ''
        ];

        const extension = filePath.toLowerCase().substring(filePath.lastIndexOf('.'));
        return !textExtensions.includes(extension);
    }

    /**
     * Generates a unique backup file name for binary files
     */
    private generateBinaryBackupPath(filePath: string, timestamp: number): string {
        const fileName = filePath.replace(/[\/\\]/g, '_'); // Replace path separators with underscores
        const extension = filePath.substring(filePath.lastIndexOf('.'));
        const nameWithoutExt = fileName.substring(0, fileName.lastIndexOf('.'));
        return `${this.binaryBackupFolder}/${nameWithoutExt}_${timestamp}${extension}`;
    }

    /**
     * Creates a backup of a file's current content before modification
     */
    async createBackup(filePath: string, currentContent?: string): Promise<void> {
        try {
            const backupData = await this.loadBackupData();
            
            if (!backupData.backups[filePath]) {
                backupData.backups[filePath] = [];
            }

            const timestamp = Date.now();
            const readableTimestamp = new Date(timestamp).toLocaleString();
            const isBinary = this.isBinaryFile(filePath);

            let backup: FileBackup;

            if (isBinary) {
                // For binary files, copy the file to the binary backup folder
                const file = this.app.vault.getAbstractFileByPath(filePath);
                if (file && file instanceof TFile) {
                    const fileBuffer = await this.app.vault.readBinary(file);
                    const backupFilePath = this.generateBinaryBackupPath(filePath, timestamp);
                    
                    // Ensure binary backup directory exists
                    const adapter = this.app.vault.adapter;
                    if (!await adapter.exists(this.binaryBackupFolder)) {
                        await adapter.mkdir(this.binaryBackupFolder);
                    }

                    // Write the binary file
                    await adapter.writeBinary(backupFilePath, fileBuffer);

                    backup = {
                        filePath,
                        timestamp,
                        readableTimestamp,
                        isBinary: true,
                        fileSize: fileBuffer.byteLength,
                        backupFilePath
                    };
                } else {
                    console.error('Binary file not found or not accessible:', filePath);
                    return;
                }
            } else {
                // For text files, store content directly
                if (currentContent === undefined) {
                    const file = this.app.vault.getAbstractFileByPath(filePath);
                    if (file && file instanceof TFile) {
                        currentContent = await this.app.vault.read(file);
                    } else {
                        console.error('Text file not found or not accessible:', filePath);
                        return;
                    }
                }

                backup = {
                    filePath,
                    content: currentContent,
                    timestamp,
                    readableTimestamp,
                    isBinary: false,
                    fileSize: currentContent.length
                };
            }

            // Add backup to the beginning of the array (most recent first)
            backupData.backups[filePath].unshift(backup);

            // Limit the number of backups per file
            if (backupData.backups[filePath].length > this.maxBackupsPerFile) {
                const removedBackups = backupData.backups[filePath].slice(this.maxBackupsPerFile);
                backupData.backups[filePath] = backupData.backups[filePath].slice(0, this.maxBackupsPerFile);
                
                // Clean up old binary backup files
                for (const removedBackup of removedBackups) {
                    if (removedBackup.isBinary && removedBackup.backupFilePath) {
                        try {
                            const adapter = this.app.vault.adapter;
                            if (await adapter.exists(removedBackup.backupFilePath)) {
                                await adapter.remove(removedBackup.backupFilePath);
                            }
                        } catch (error) {
                            console.error('Failed to clean up old binary backup:', error);
                        }
                    }
                }
            }

            await this.saveBackupData(backupData);
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
            
            if (backup.isBinary) {
                // Handle binary file restoration
                if (!backup.backupFilePath) {
                    return { success: false, error: 'Binary backup file path is missing' };
                }

                const adapter = this.app.vault.adapter;
                if (!await adapter.exists(backup.backupFilePath)) {
                    return { success: false, error: `Backup file not found: ${backup.backupFilePath}` };
                }

                const binaryData = await adapter.readBinary(backup.backupFilePath);
                
                if (!file) {
                    // File doesn't exist, create it
                    await this.app.vault.createBinary(backup.filePath, binaryData);
                    return { success: true };
                }

                if (!(file instanceof TFile)) {
                    return { success: false, error: `Path is not a file: ${backup.filePath}` };
                }

                // Overwrite the existing binary file
                await this.app.vault.modifyBinary(file, binaryData);
                return { success: true };
            } else {
                // Handle text file restoration
                if (!backup.content) {
                    return { success: false, error: 'Text backup content is missing' };
                }

                if (!file) {
                    // File doesn't exist, create it
                    await this.app.vault.create(backup.filePath, backup.content);
                    return { success: true };
                }

                if (!(file instanceof TFile)) {
                    return { success: false, error: `Path is not a file: ${backup.filePath}` };
                }

                // Overwrite the existing text file
                await this.app.vault.modify(file, backup.content);
                return { success: true };
            }
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
            const backups = backupData.backups[filePath];
            
            if (backups) {
                // Clean up binary backup files
                for (const backup of backups) {
                    if (backup.isBinary && backup.backupFilePath) {
                        try {
                            const adapter = this.app.vault.adapter;
                            if (await adapter.exists(backup.backupFilePath)) {
                                await adapter.remove(backup.backupFilePath);
                            }
                        } catch (error) {
                            console.error('Failed to clean up binary backup file:', error);
                        }
                    }
                }
            }
            
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
                const backupToDelete = backupData.backups[filePath].find(b => b.timestamp === timestamp);
                
                // Clean up binary backup file if it exists
                if (backupToDelete && backupToDelete.isBinary && backupToDelete.backupFilePath) {
                    try {
                        const adapter = this.app.vault.adapter;
                        if (await adapter.exists(backupToDelete.backupFilePath)) {
                            await adapter.remove(backupToDelete.backupFilePath);
                        }
                    } catch (error) {
                        console.error('Failed to clean up binary backup file:', error);
                    }
                }
                
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
     * Deletes all backups for all files
     */
    async deleteAllBackups(): Promise<void> {
        try {
            const backupData = await this.loadBackupData();
            
            // Clean up all binary backup files
            for (const filePath in backupData.backups) {
                const backups = backupData.backups[filePath];
                if (backups) {
                    for (const backup of backups) {
                        if (backup.isBinary && backup.backupFilePath) {
                            try {
                                const adapter = this.app.vault.adapter;
                                if (await adapter.exists(backup.backupFilePath)) {
                                    await adapter.remove(backup.backupFilePath);
                                }
                            } catch (error) {
                                console.error('Failed to clean up binary backup file:', error);
                            }
                        }
                    }
                }
            }
            
            // Clear all backups data
            await this.saveBackupData({ backups: {} });
        } catch (error) {
            console.error('Failed to delete all backups:', error);
            throw error;
        }
    }

    /**
     * Checks if content is different from the most recent backup
     */
    async shouldCreateBackup(filePath: string, newContent?: string): Promise<boolean> {
        try {
            const backups = await this.getBackupsForFile(filePath);
            if (backups.length === 0) {
                return true; // No backups exist, so we should create one
            }

            const mostRecentBackup = backups[0];
            
            if (mostRecentBackup.isBinary) {
                // For binary files, always create backup if content might have changed
                // We can't easily compare binary content without reading the full file
                return true;
            } else {
                // For text files, compare content
                if (newContent === undefined) {
                    const file = this.app.vault.getAbstractFileByPath(filePath);
                    if (file && file instanceof TFile) {
                        newContent = await this.app.vault.read(file);
                    } else {
                        return true; // File not found, create backup anyway
                    }
                }
                return mostRecentBackup.content !== newContent;
            }
        } catch (error) {
            console.error('Failed to check if backup should be created:', error);
            return true; // Default to creating backup on error
        }
    }

    /**
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
    }

    /**
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
            }
            // Only pretty-print if debug mode is enabled
            const debug = (window as any)?.aiAssistantPlugin?.debugMode;
            const json = debug ? JSON.stringify(backupData, null, 2) : JSON.stringify(backupData);
            await adapter.write(this.backupFilePath, json);
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
                    if (backup.fileSize) {
                        totalSize += backup.fileSize;
                    } else if (backup.content) {
                        totalSize += backup.content.length;
                    }
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
            }

            // Ensure binary backup directory exists
            if (!await adapter.exists(this.binaryBackupFolder)) {
                await adapter.mkdir(this.binaryBackupFolder);
            }
            
            // Ensure the backup file exists with proper structure
            if (!await adapter.exists(this.backupFilePath)) {
                await this.saveBackupData({ backups: {} });
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
                const removedBackups = backupData.backups[filePath].filter(
                    backup => backup.timestamp <= cutoffTime
                );
                
                backupData.backups[filePath] = backupData.backups[filePath].filter(
                    backup => backup.timestamp > cutoffTime
                );
                
                if (backupData.backups[filePath].length < originalLength) {
                    cleaned = true;
                    
                    // Clean up old binary backup files
                    for (const removedBackup of removedBackups) {
                        if (removedBackup.isBinary && removedBackup.backupFilePath) {
                            try {
                                const adapter = this.app.vault.adapter;
                                if (await adapter.exists(removedBackup.backupFilePath)) {
                                    await adapter.remove(removedBackup.backupFilePath);
                                }
                            } catch (error) {
                                console.error('Failed to clean up old binary backup:', error);
                            }
                        }
                    }
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
