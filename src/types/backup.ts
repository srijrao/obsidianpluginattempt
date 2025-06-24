/**
 * Represents a single backup entry for a file
 */
export interface FileBackup {
    filePath: string;        // Relative path to the file in the vault
    content: string;         // The backed up content
    timestamp: number;       // Unix timestamp when backup was created
    readableTimestamp: string; // Human-readable timestamp
}

/**
 * Structure of the backups.json file
 */
export interface BackupData {
    backups: Record<string, FileBackup[]>; // Key is file path, value is array of backups for that file
}
