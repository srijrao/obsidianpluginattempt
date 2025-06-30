/**
 * Represents a single backup entry for a file
 */
export interface FileBackup {
    filePath: string;        
    content?: string;        
    timestamp: number;       
    readableTimestamp: string; 
    isBinary: boolean;       
    fileSize?: number;       
    backupFilePath?: string; 
}

/**
 * Structure of the backups.json file
 */
export interface BackupData {
    backups: Record<string, FileBackup[]>; 
}
