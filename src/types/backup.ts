/**
 * Represents a single backup entry for a file
 */
export interface FileBackup {
    filePath: string;        // Relative path to the file in the vault
    content?: string;        // The backed up content (only for text files)
    timestamp: number;       // Unix timestamp when backup was created
    readableTimestamp: string; // Human-readable timestamp
    isBinary: boolean;       // Whether this is a binary file
    fileSize?: number;       // Original file size in bytes
    backupFilePath?: string; // Path to the backup file (for binary files stored separately)
}

/**
 * Structure of the backups.json file
 */
export interface BackupData {
    backups: Record<string, FileBackup[]>; // Key is file path, value is array of backups for that file
}
