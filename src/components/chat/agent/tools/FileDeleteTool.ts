// FileDeleteTool.ts
// Tool for deleting files and folders from the vault with backup functionality
import { App, TFile, TFolder } from 'obsidian';
import { Tool, ToolResult } from '../ToolRegistry';
import { BackupManager } from '../../../BackupManager';
import { PathValidator } from './pathValidation';

export interface FileDeleteParams {
    path: string; // Path to the file or folder to delete
    filePath?: string; // Legacy support
    backup?: boolean; // Whether to create backup before deletion
    confirmDeletion?: boolean; // Extra confirmation step
    useTrash?: boolean; // Whether to move to trash instead of permanent deletion
}

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

    constructor(private app: App, backupManager?: BackupManager) {
        // Initialize backup manager with provided instance or create a default one
        const defaultPath = app.vault.configDir + '/plugins/ai-assistant-for-obsidian';
        this.backupManager = backupManager || new BackupManager(app, defaultPath);
        this.pathValidator = new PathValidator(app);
    }

    async execute(params: FileDeleteParams, context: any): Promise<ToolResult> {
        // Normalize parameter names for backward compatibility
        const inputPath = params.path || params.filePath;
        const { backup = true, confirmDeletion = true, useTrash = true } = params;

        if (inputPath === undefined || inputPath === null) {
            return {
                success: false,
                error: 'path parameter is required'
            };
        }

        // Validate and normalize the path to ensure it's within the vault
        let filePath: string;
        try {
            filePath = this.pathValidator.validateAndNormalizePath(inputPath);
        } catch (error: any) {
            return {
                success: false,
                error: `Path validation failed: ${error.message}`
            };
        }

        if (confirmDeletion !== true) {
            return {
                success: false,
                error: 'confirmDeletion must be set to true to proceed with deletion. This is a safety measure.'
            };
        }

        try {
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

            if (target instanceof TFile) {
                // Handle single file deletion
                let originalContent = '';

                // Create backup if requested
                if (backup) {
                    try {
                        originalContent = await this.app.vault.read(target);
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

                // Handle deletion based on useTrash parameter
                let actionTaken = '';
                let trashPath = '';
                
                if (useTrash) {
                    // Move to trash (soft delete)
                    try {
                        trashPath = await this.moveToTrash(target, filePath);
                        actionTaken = 'moved to trash';
                    } catch (trashError: any) {
                        return {
                            success: false,
                            error: `Failed to move file to trash: ${trashError.message}`
                        };
                    }
                } else {
                    // Permanent deletion
                    try {
                        await this.app.vault.delete(target);
                        actionTaken = 'permanently deleted';
                    } catch (deleteError: any) {
                        // For files, if standard delete fails, try adapter
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

            } else if (target instanceof TFolder) {
                // Handle folder deletion with recursive backup
                if (backup) {
                    try {
                        const result = await this.createFolderBackups(target, '');
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

                // Handle deletion based on useTrash parameter
                let actionTaken = '';
                let trashPath = '';
                
                if (useTrash) {
                    // Move to trash (soft delete)
                    try {
                        trashPath = await this.moveToTrash(target, filePath);
                        actionTaken = 'moved to trash';
                    } catch (trashError: any) {
                        return {
                            success: false,
                            error: `Failed to move folder to trash: ${trashError.message}`
                        };
                    }
                } else {
                    // Permanent deletion - use multiple strategies for better Windows compatibility
                    try {
                        await this.app.vault.delete(target);
                        actionTaken = 'permanently deleted';
                    } catch (deleteError: any) {
                        // If the standard delete fails (common on Windows with EPERM), try alternative approaches
                        if (deleteError.message && deleteError.message.includes('EPERM')) {
                            try {
                                // Try using the adapter directly for better Windows compatibility
                                await this.app.vault.adapter.rmdir(filePath, true);
                                actionTaken = 'permanently deleted';
                            } catch (adapterError: any) {
                                // If adapter also fails, try recursive manual deletion
                                try {
                                    await this.recursivelyDeleteFolder(target);
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
                return {
                    success: false,
                    error: `Unsupported file type: ${filePath}`
                };
            }

        } catch (error: any) {
            return {
                success: false,
                error: `Failed to delete: ${error.message}`
            };
        }
    }

    /**
     * Recursively creates backups for all files in a folder
     */
    private async createFolderBackups(folder: TFolder, basePath: string): Promise<{backupCreated: boolean, backupCount: number, totalSize: number}> {
        let backupCount = 0;
        let totalSize = 0;
        let anyBackupCreated = false;

        for (const child of folder.children) {
            if (child instanceof TFile) {
                try {
                    const content = await this.app.vault.read(child);
                    const childPath = basePath ? `${basePath}/${child.name}` : child.path;
                    await this.backupManager.createBackup(childPath, content);
                    backupCount++;
                    totalSize += content.length;
                    anyBackupCreated = true;
                } catch (error) {
                    console.error(`Failed to backup file ${child.path}:`, error);
                    // Continue with other files even if one fails
                }
            } else if (child instanceof TFolder) {
                const subResult = await this.createFolderBackups(child, basePath ? `${basePath}/${child.name}` : child.path);
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
     * Recursively deletes a folder by deleting all its contents first
     * This is a fallback method for Windows permission issues
     */
    private async recursivelyDeleteFolder(folder: TFolder): Promise<void> {
        // Delete all children first
        for (const child of [...folder.children]) { // Use spread to avoid modifying array during iteration
            if (child instanceof TFile) {
                try {
                    await this.app.vault.delete(child);
                } catch (error) {
                    // Try adapter as fallback
                    await this.app.vault.adapter.remove(child.path);
                }
            } else if (child instanceof TFolder) {
                await this.recursivelyDeleteFolder(child);
            }
        }
        
        // Now delete the empty folder
        try {
            await this.app.vault.delete(folder);
        } catch (error) {
            // Try adapter as fallback
            await this.app.vault.adapter.rmdir(folder.path, false);
        }
    }

    /**
     * Ensures the .trash folder exists in the vault root
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
     * Generates a unique name for the trash item to avoid conflicts
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
     * Moves a file or folder to the trash folder instead of permanently deleting it
     */
    private async moveToTrash(target: TFile | TFolder, originalPath: string): Promise<string> {
        const trashPath = await this.ensureTrashFolderExists();
        const trashName = this.generateTrashName(originalPath);
        const destinationPath = `${trashPath}/${trashName}`;
        
        // Use the file manager to move the item
        await this.app.fileManager.renameFile(target, destinationPath);
        
        return destinationPath;
    }
}
