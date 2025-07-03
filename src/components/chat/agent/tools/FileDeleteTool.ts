import { App, TFile, TFolder } from 'obsidian';
import { Tool, ToolResult } from '../ToolRegistry';
import { BackupManager } from '../../../BackupManager';
import { PathValidator } from './pathValidation';
import { isTFile, isTFolder } from '../../../../utils/typeguards';

/**
 * Parameters for file/folder deletion.
 */
export interface FileDeleteParams {
    path: string; // Path to the file or folder to delete (required)
    filePath?: string; // Legacy/alternate path parameter
    backup?: boolean; // Whether to create a backup before deletion
    confirmDeletion?: boolean; // Extra confirmation for safety
    useTrash?: boolean; // Whether to move to .trash instead of permanent deletion
}

/**
 * Tool for safely deleting files or folders from the vault.
 * Supports backup, trash, and permanent deletion with safety checks.
 */
export class FileDeleteTool implements Tool {
    name = 'file_delete';
    description = 'Safely deletes files or folders from the vault by moving them to a .trash folder (default) or permanently deleting them. The trash option provides safer file management and allows restoration. For folders, creates backups of all contained files before deletion.';
    parameters = {
        path: {
            type: 'string',
            description: 'Path to the file or folder to delete.',
            required: true
        },
        backup: {
            type: 'boolean',
            description: 'Create backup before deletion.',
            default: true
        },
        confirmDeletion: {
            type: 'boolean',
            description: 'Extra confirmation that deletion is intended.',
            default: true
        },
        useTrash: {
            type: 'boolean',
            description: 'Move to .trash folder instead of permanent deletion (default: true for safety).',
            default: true
        }
    };

    private backupManager: BackupManager;
    private pathValidator: PathValidator;

    /**
     * Constructor for FileDeleteTool.
     * @param app Obsidian App instance
     * @param backupManager Optional custom BackupManager
     */
    constructor(private app: App, backupManager?: BackupManager) {
        // Default backup location is the plugin's config directory
        const defaultPath = app.vault.configDir + '/plugins/ai-assistant-for-obsidian';
        this.backupManager = backupManager || new BackupManager(app, defaultPath);
        this.pathValidator = new PathValidator(app);
    }

    /**
     * Executes the file/folder deletion operation.
     * @param params FileDeleteParams
     * @param context Execution context (unused)
     * @returns ToolResult indicating success or failure
     */
    async execute(params: FileDeleteParams, context: any): Promise<ToolResult> {
        // Use either 'path' or legacy 'filePath'
        const inputPath = params.path || params.filePath;
        const { backup = true, confirmDeletion = true, useTrash = true } = params;

        if (inputPath === undefined || inputPath === null) {
            return {
                success: false,
                error: 'path parameter is required'
            };
        }

        // Validate and normalize the input path
        let filePath: string;
        try {
            filePath = this.pathValidator.validateAndNormalizePath(inputPath);
        } catch (error: any) {
            return {
                success: false,
                error: `Path validation failed: ${error.message}`
            };
        }

        // Safety check: require explicit confirmation
        if (confirmDeletion !== true) {
            return {
                success: false,
                error: 'confirmDeletion must be set to true to proceed with deletion. This is a safety measure.'
            };
        }

        try {
            // Get the file or folder object from the vault
            const target = this.app.vault.getAbstractFileByPath(filePath);
            
            if (!target) {
                return {
                    success: false,
                    error: `File or folder not found: ${filePath}`
                };
            }

            let backupCreated = false;
            let totalSize = 0;
            let backupCount = 0;

            // --- Handle file deletion ---
            if (isTFile(target)) {
                let originalContent = '';

                // Optionally create a backup before deletion
                if (backup) {
                    try {
                        originalContent = await this.app.vault.read(target as TFile);
                        await this.backupManager.createBackup(filePath, originalContent);
                        backupCreated = true;
                        backupCount = 1;
                    } catch (backupError: any) {
                        return {
                            success: false,
                            error: `Failed to create backup before deletion: ${backupError.message}`
                        };
                    }
                }

                let actionTaken = '';
                let trashPath = '';
                
                if (useTrash) {
                    // Move file to .trash folder
                    try {
                        trashPath = await this.moveToTrash(target as TFile, filePath);
                        actionTaken = 'moved to trash';
                    } catch (trashError: any) {
                        return {
                            success: false,
                            error: `Failed to move file to trash: ${trashError.message}`
                        };
                    }
                } else {
                    // Permanently delete the file
                    try {
                        await this.app.vault.delete(target as TFile);
                        actionTaken = 'permanently deleted';
                    } catch (deleteError: any) {
                        // Fallback for Windows permission issues
                        if (deleteError.message && deleteError.message.includes('EPERM')) {
                            try {
                                await this.app.vault.adapter.remove(filePath);
                                actionTaken = 'permanently deleted';
                            } catch (adapterError: any) {
                                return {
                                    success: false,
                                    error: `Failed to delete file (tried multiple methods): ${deleteError.message}. Adapter error: ${adapterError.message}`
                                };
                            }
                        } else {
                            return {
                                success: false,
                                error: `Failed to delete file: ${deleteError.message}`
                            };
                        }
                    }
                }

                totalSize = originalContent.length;

                // Return success result for file deletion
                return {
                    success: true,
                    data: {
                        action: actionTaken,
                        type: 'file',
                        filePath,
                        trashPath: useTrash ? trashPath : undefined,
                        size: totalSize,
                        backupCreated,
                        backupCount,
                        message: `File '${filePath}' has been ${actionTaken}${backupCreated ? ' (backup created)' : ''}${useTrash ? `. Location: ${trashPath}` : ''}.`
                    }
                };

            // --- Handle folder deletion ---
            } else if (isTFolder(target)) {
                // Optionally create backups for all files in the folder
                if (backup) {
                    try {
                        const result = await this.createFolderBackups(target as TFolder, '');
                        backupCreated = result.backupCreated;
                        backupCount = result.backupCount;
                        totalSize = result.totalSize;
                    } catch (backupError: any) {
                        return {
                            success: false,
                            error: `Failed to create backups before folder deletion: ${backupError.message}`
                        };
                    }
                }

                let actionTaken = '';
                let trashPath = '';
                
                if (useTrash) {
                    // Move folder to .trash folder
                    try {
                        trashPath = await this.moveToTrash(target as TFolder, filePath);
                        actionTaken = 'moved to trash';
                    } catch (trashError: any) {
                        return {
                            success: false,
                            error: `Failed to move folder to trash: ${trashError.message}`
                        };
                    }
                } else {
                    // Permanently delete the folder
                    try {
                        await this.app.vault.delete(target as TFolder);
                        actionTaken = 'permanently deleted';
                    } catch (deleteError: any) {
                        // Fallback for Windows permission issues
                        if (deleteError.message && deleteError.message.includes('EPERM')) {
                            try {
                                // Try using adapter's rmdir
                                await this.app.vault.adapter.rmdir(filePath, true);
                                actionTaken = 'permanently deleted';
                            } catch (adapterError: any) {
                                // As a last resort, recursively delete all contents
                                try {
                                    await this.recursivelyDeleteFolder(target as TFolder);
                                    actionTaken = 'permanently deleted';
                                } catch (recursiveError: any) {
                                    return {
                                        success: false,
                                        error: `Failed to delete folder (tried multiple methods): ${deleteError.message}. Last attempt: ${recursiveError.message}`
                                    };
                                }
                            }
                        } else {
                            return {
                                success: false,
                                error: `Failed to delete folder: ${deleteError.message}`
                            };
                        }
                    }
                }

                // Return success result for folder deletion
                return {
                    success: true,
                    data: {
                        action: actionTaken,
                        type: 'folder',
                        filePath,
                        trashPath: useTrash ? trashPath : undefined,
                        size: totalSize,
                        backupCreated,
                        backupCount,
                        message: `Folder '${filePath}' has been ${actionTaken}${backupCreated ? ` (${backupCount} files backed up)` : ''}${useTrash ? `. Location: ${trashPath}` : ''}.`
                    }
                };

            } else {
                // Unsupported file type (should not occur)
                return {
                    success: false,
                    error: `Unsupported file type: ${filePath}`
                };
            }

        } catch (error: any) {
            // Catch-all for unexpected errors
            return {
                success: false,
                error: `Failed to delete: ${error.message}`
            };
        }
    }

    /**
     * Recursively creates backups for all files in a folder.
     * @param folder TFolder to backup
     * @param basePath Relative path for backup naming
     * @returns Object with backupCreated, backupCount, and totalSize
     */
    private async createFolderBackups(folder: TFolder, basePath: string): Promise<{backupCreated: boolean, backupCount: number, totalSize: number}> {
        let backupCount = 0;
        let totalSize = 0;
        let anyBackupCreated = false;

        for (const child of folder.children) {
            if (isTFile(child)) {
                try {
                    const content = await this.app.vault.read(child as TFile);
                    const childPath = basePath ? `${basePath}/${child.name}` : child.path;
                    await this.backupManager.createBackup(childPath, content);
                    backupCount++;
                    totalSize += content.length;
                    anyBackupCreated = true;
                } catch (error) {
                    // Log backup errors but continue with other files
                    console.error(`Failed to backup file ${child.path}:`, error);
                }
            } else if (isTFolder(child)) {
                // Recursively backup subfolders
                const subResult = await this.createFolderBackups(child as TFolder, basePath ? `${basePath}/${child.name}` : child.path);
                backupCount += subResult.backupCount;
                totalSize += subResult.totalSize;
                if (subResult.backupCreated) {
                    anyBackupCreated = true;
                }
            }
        }

        return {
            backupCreated: anyBackupCreated,
            backupCount,
            totalSize
        };
    }

    /**
     * Recursively deletes a folder by deleting all its contents first.
     * This is a fallback method for Windows permission issues.
     * @param folder TFolder to delete
     */
    private async recursivelyDeleteFolder(folder: TFolder): Promise<void> {
        // Delete all children first
        for (const child of [...folder.children]) { 
            if (isTFile(child)) {
                try {
                    await this.app.vault.delete(child as TFile);
                } catch (error) {
                    // Fallback to adapter remove if vault.delete fails
                    await this.app.vault.adapter.remove(child.path);
                }
            } else if (isTFolder(child)) {
                await this.recursivelyDeleteFolder(child as TFolder);
            }
        }
        // Delete the folder itself
        try {
            await this.app.vault.delete(folder);
        } catch (error) {
            // Fallback to adapter rmdir if vault.delete fails
            await this.app.vault.adapter.rmdir(folder.path, false);
        }
    }

    /**
     * Ensures the .trash folder exists in the vault root.
     * @returns Path to the .trash folder
     */
    private async ensureTrashFolderExists(): Promise<string> {
        const trashPath = '.trash';
        const existingTrash = this.app.vault.getAbstractFileByPath(trashPath);
        
        if (!existingTrash) {
            await this.app.vault.createFolder(trashPath);
        } else if (!(existingTrash instanceof TFolder)) {
            throw new Error('A file named ".trash" already exists - cannot create trash folder');
        }
        
        return trashPath;
    }

    /**
     * Generates a unique name for the trash item to avoid conflicts.
     * @param originalPath Original file/folder path
     * @returns Unique trash name
     */
    private generateTrashName(originalPath: string): string {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const basename = originalPath.split('/').pop() || 'unknown';
        const extension = basename.includes('.') ? '' : '';
        const nameWithoutExt = basename.replace(/\.[^/.]+$/, '');
        const ext = basename.includes('.') ? basename.substring(basename.lastIndexOf('.')) : '';
        
        return `${nameWithoutExt}_deleted_${timestamp}${ext}`;
    }

    /**
     * Moves a file or folder to the trash folder instead of permanently deleting it.
     * @param target TFile or TFolder to move
     * @param originalPath Original path for naming
     * @returns New path in the .trash folder
     */
    private async moveToTrash(target: TFile | TFolder, originalPath: string): Promise<string> {
        const trashPath = await this.ensureTrashFolderExists();
        const trashName = this.generateTrashName(originalPath);
        const destinationPath = `${trashPath}/${trashName}`;
        
        // Use fileManager.renameFile to move to trash
        await this.app.fileManager.renameFile(target, destinationPath);
        
        return destinationPath;
    }
}
