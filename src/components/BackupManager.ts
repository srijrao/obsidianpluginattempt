import { App, TFile } from 'obsidian';
import { FileBackup, BackupData } from '../types';
import { isTFile } from '../utils/typeGuards';

/**
 * Manages file backups stored in the plugin's data folder.
 * Supports both text and binary file backups, with configurable limits and cleanup.
 */
export class BackupManager {
    private app: App;
    private backupFilePath: string;
    private binaryBackupFolder: string;
    private maxBackupsPerFile: number = 10; // Maximum number of backups to keep per file

    /**
     * @param app The Obsidian App instance.
     * @param pluginDataPath The absolute path to the plugin's data folder.
     */
    constructor(app: App, pluginDataPath: string) {
        this.app = app;
        // Path to the JSON file storing metadata about backups
        this.backupFilePath = `${pluginDataPath}/backups.json`;
        // Folder for storing actual binary file contents
        this.binaryBackupFolder = `${pluginDataPath}/binary-backups`;
    }

    /**
     * Determines if a file is binary based on its extension.
     * Uses a whitelist of known text extensions - everything else is treated as binary.
     * @param filePath The path of the file.
     * @returns True if the file is considered binary, false otherwise.
     */
    private isBinaryFile(filePath: string): boolean {
        const textExtensions = [
            // Markdown and text files
            '.md', '.txt', '.text', '.rtf',
            // Code files
            '.js', '.ts', '.jsx', '.tsx', '.html', '.htm', '.css', '.scss', '.sass', '.less',
            '.json', '.xml', '.yaml', '.yml', '.toml', '.ini', '.conf', '.config',
            '.py', '.java', '.c', '.cpp', '.h', '.hpp', '.cs', '.php', '.rb', '.go', '.rs', '.swift',
            '.kt', '.scala', '.clj', '.hs', '.elm', '.dart', '.r', '.m', '.pl', '.sh', '.bash', '.zsh',
            '.fish', '.ps1', '.bat', '.cmd',
            // Other common text formats
            '.svg', '.csv', '.tsv', '.log', '.sql', '.graphql', '.gql',
            // Documentation/markup
            '.tex', '.latex', '.bib', '.org', '.rst', '.asciidoc', '.adoc',
            // Config/dotfiles
            '.gitignore', '.gitattributes', '.editorconfig', '.env', '.properties',
            // No extension
            ''
        ];

        const extension = filePath.toLowerCase().substring(filePath.lastIndexOf('.'));
        return !textExtensions.includes(extension);
    }

    /**
     * Generates a unique backup file path for binary files.
     * Replaces slashes in the original file path to create a flat name.
     * @param filePath The original file path.
     * @param timestamp The timestamp for the backup.
     * @returns The generated backup file path.
     */
    private generateBinaryBackupPath(filePath: string, timestamp: number): string {
        const fileName = filePath.replace(/[\/\\]/g, '_'); // Replace slashes with underscores
        const extension = filePath.substring(filePath.lastIndexOf('.'));
        const nameWithoutExt = fileName.substring(0, fileName.lastIndexOf('.'));
        return `${this.binaryBackupFolder}/${nameWithoutExt}_${timestamp}${extension}`;
    }

    /**
     * Creates a backup of a file's current content.
     * For text files, content is stored directly in JSON. For binary files, content is saved to a separate file.
     * @param filePath The path of the file to backup.
     * @param currentContent Optional: The content of the file if already read (for text files).
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
                // Handle binary file backup
                const file = this.app.vault.getAbstractFileByPath(filePath);
                if (file && isTFile(file)) {
                    const fileBuffer = await this.app.vault.readBinary(file);
                    const backupFilePath = this.generateBinaryBackupPath(filePath, timestamp);

                    // Ensure binary backup folder exists
                    const adapter = this.app.vault.adapter;
                    if (!await adapter.exists(this.binaryBackupFolder)) {
                        await adapter.mkdir(this.binaryBackupFolder);
                    }

                    // Write binary content to a separate file
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
                // Handle text file backup
                if (currentContent === undefined) {
                    const file = this.app.vault.getAbstractFileByPath(filePath);
                    if (file && isTFile(file)) {
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

            // Add the new backup to the beginning of the list for this file
            backupData.backups[filePath].unshift(backup);

            // Enforce maxBackupsPerFile limit
            if (backupData.backups[filePath].length > this.maxBackupsPerFile) {
                const removedBackups = backupData.backups[filePath].slice(this.maxBackupsPerFile);
                backupData.backups[filePath] = backupData.backups[filePath].slice(0, this.maxBackupsPerFile);

                // Clean up physical binary backup files that are removed
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
            // Do not re-throw, backup failures should not block main operations
        }
    }

    /**
     * Gets all backups for a specific file.
     * @param filePath The path of the file.
     * @returns An array of FileBackup objects for the specified file.
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
     * Gets all file paths that currently have backups.
     * @returns An array of file paths.
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
     * Restores a specific backup to the vault, overwriting the current file.
     * Creates the file if it doesn't exist.
     * @param backup The FileBackup object to restore.
     * @returns An object indicating success or failure with an error message.
     */
    async restoreBackup(backup: FileBackup): Promise<{ success: boolean; error?: string }> {
        try {
            const file = this.app.vault.getAbstractFileByPath(backup.filePath);

            if (backup.isBinary) {
                // Restore binary file
                if (!backup.backupFilePath) {
                    return { success: false, error: 'Binary backup file path is missing' };
                }

                const adapter = this.app.vault.adapter;
                if (!await adapter.exists(backup.backupFilePath)) {
                    return { success: false, error: `Backup file not found: ${backup.backupFilePath}` };
                }

                const binaryData = await adapter.readBinary(backup.backupFilePath);

                if (!file) {
                    // Create new file if it doesn't exist
                    await this.app.vault.createBinary(backup.filePath, binaryData);
                    return { success: true };
                }

                if (!isTFile(file)) {
                    return { success: false, error: `Path is not a file: ${backup.filePath}` };
                }

                // Modify existing binary file
                await this.app.vault.modifyBinary(file, binaryData);
                return { success: true };
            } else {
                // Restore text file
                if (!backup.content) {
                    return { success: false, error: 'Text backup content is missing' };
                }

                if (!file) {
                    // Create new file if it doesn't exist
                    await this.app.vault.create(backup.filePath, backup.content);
                    return { success: true };
                }

                if (!isTFile(file)) {
                    return { success: false, error: `Path is not a file: ${backup.filePath}` };
                }

                // Modify existing text file
                await this.app.vault.modify(file, backup.content);
                return { success: true };
            }
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    }

    /**
     * Deletes all backups associated with a specific file.
     * Also removes physical binary backup files.
     * @param filePath The path of the file whose backups are to be deleted.
     */
    async deleteBackupsForFile(filePath: string): Promise<void> {
        try {
            const backupData = await this.loadBackupData();
            const backups = backupData.backups[filePath];

            if (backups) {
                // Remove associated binary files
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

            // Remove entry from metadata
            delete backupData.backups[filePath];
            await this.saveBackupData(backupData);
        } catch (error) {
            console.error('Failed to delete backups for file:', error);
        }
    }

    /**
     * Deletes a specific backup entry by file path and timestamp.
     * Also removes the physical binary backup file if applicable.
     * @param filePath The path of the file.
     * @param timestamp The timestamp of the specific backup to delete.
     */
    async deleteSpecificBackup(filePath: string, timestamp: number): Promise<void> {
        try {
            const backupData = await this.loadBackupData();
            if (backupData.backups[filePath]) {
                const backupToDelete = backupData.backups[filePath].find(b => b.timestamp === timestamp);

                // Remove associated binary file if it's a binary backup
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

                // Filter out the specific backup from the list
                backupData.backups[filePath] = backupData.backups[filePath].filter(
                    backup => backup.timestamp !== timestamp
                );

                // If no backups remain for this file, remove the file entry
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
     * Deletes all backups for all files.
     * Removes all metadata and all physical binary backup files.
     */
    async deleteAllBackups(): Promise<void> {
        try {
            const backupData = await this.loadBackupData();

            // Iterate through all backups and remove associated binary files
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

            // Save empty backup data to clear all records
            await this.saveBackupData({ backups: {} });
        } catch (error) {
            console.error('Failed to delete all backups:', error);
            throw error;
        }
    }

    /**
     * Checks if a new backup should be created for a file.
     * A backup is created if there are no existing backups, or if the new content differs from the most recent backup.
     * For binary files, it always returns true as content comparison is complex.
     * @param filePath The path of the file.
     * @param newContent Optional: The new content of the file (for text files).
     * @returns True if a backup should be created, false otherwise.
     */
    async shouldCreateBackup(filePath: string, newContent?: string): Promise<boolean> {
        try {
            const backups = await this.getBackupsForFile(filePath);
            if (backups.length === 0) {
                return true; // Always create a backup if none exist
            }

            const mostRecentBackup = backups[0];

            if (mostRecentBackup.isBinary) {
                // For binary files, always create a new backup as content comparison is not trivial
                return true;
            } else {
                // For text files, compare content
                if (newContent === undefined) {
                    const file = this.app.vault.getAbstractFileByPath(filePath);
                    if (file && isTFile(file)) {
                        newContent = await this.app.vault.read(file);
                    } else {
                        return true; // If file not found, assume content is different
                    }
                }
                return mostRecentBackup.content !== newContent;
            }
        } catch (error) {
            console.error('Failed to check if backup should be created:', error);
            return true; // Default to true on error to be safe
        }
    }

    /**
     * Loads backup data from the JSON file.
     * @returns A Promise resolving to the BackupData object.
     */
    private async loadBackupData(): Promise<BackupData> {
        try {
            const adapter = this.app.vault.adapter;
            if (await adapter.exists(this.backupFilePath)) {
                const content = await adapter.read(this.backupFilePath);
                const parsed = JSON.parse(content);

                // Basic validation of loaded data structure
                if (parsed && typeof parsed === 'object' && parsed.backups) {
                    return parsed;
                }
            }
        } catch (error) {
            console.error('Failed to load backup data:', error);
        }

        // Return empty data if file doesn't exist or parsing fails
        return { backups: {} };
    }

    /**
     * Saves backup data to the JSON file.
     * Ensures the backup directory exists before writing.
     * @param backupData The BackupData object to save.
     */
    private async saveBackupData(backupData: BackupData): Promise<void> {
        try {
            const adapter = this.app.vault.adapter;

            // Ensure backup directory exists
            const backupDir = this.backupFilePath.substring(0, this.backupFilePath.lastIndexOf('/'));
            try {
                if (!await adapter.exists(backupDir)) {
                    await adapter.mkdir(backupDir);
                }
            } catch (mkdirError) {
                // Ignore "already exists" errors in case of race conditions
            }

            // Stringify with pretty print in debug mode
            const debug = (window as any)?.aiAssistantPlugin?.debugMode;
            const json = debug ? JSON.stringify(backupData, null, 2) : JSON.stringify(backupData);
            await adapter.write(this.backupFilePath, json);
        } catch (error) {
            console.error('Failed to save backup data:', error);
            throw error;
        }
    }

    /**
     * Gets the total number of backups across all files.
     * @returns A Promise resolving to the total count.
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
     * Gets the total size of all backups in bytes (approximate).
     * For text files, it's content length. For binary, it's file size.
     * @returns A Promise resolving to the total size in bytes.
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
     * Initializes the backup system by ensuring necessary directories and files exist.
     */
    async initialize(): Promise<void> {
        try {
            const adapter = this.app.vault.adapter;
            const backupDir = this.backupFilePath.substring(0, this.backupFilePath.lastIndexOf('/'));

            // Ensure main backup metadata directory exists
            if (!await adapter.exists(backupDir)) {
                await adapter.mkdir(backupDir);
            }

            // Ensure binary backup content directory exists
            if (!await adapter.exists(this.binaryBackupFolder)) {
                await adapter.mkdir(this.binaryBackupFolder);
            }

            // Create empty backups.json if it doesn't exist
            if (!await adapter.exists(this.backupFilePath)) {
                await this.saveBackupData({ backups: {} });
            }
        } catch (error) {
            console.error('Failed to initialize backup system:', error);
        }
    }

    /**
     * Cleans up old backups to prevent unlimited growth.
     * Removes backups older than a specified number of days.
     * @param maxDays The maximum number of days to keep backups (default: 30 days).
     */
    async cleanupOldBackups(maxDays: number = 30): Promise<void> {
        try {
            const backupData = await this.loadBackupData();
            const cutoffTime = Date.now() - (maxDays * 24 * 60 * 60 * 1000);
            let cleaned = false;

            for (const filePath in backupData.backups) {
                const originalLength = backupData.backups[filePath].length;
                // Identify backups to remove
                const removedBackups = backupData.backups[filePath].filter(
                    backup => backup.timestamp <= cutoffTime
                );

                // Keep only backups newer than cutoff
                backupData.backups[filePath] = backupData.backups[filePath].filter(
                    backup => backup.timestamp > cutoffTime
                );

                if (backupData.backups[filePath].length < originalLength) {
                    cleaned = true;

                    // Clean up physical binary backup files
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

                // If no backups remain for this file, remove the file entry
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
