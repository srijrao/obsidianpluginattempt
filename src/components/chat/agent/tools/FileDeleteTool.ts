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
}

export class FileDeleteTool implements Tool {
    name = 'file_delete';
    description = 'Deletes files or folders from the vault with optional backup creation. For folders, creates backups of all contained files before deletion. Use with caution as this permanently removes files/folders from the vault.';
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
        const { backup = true, confirmDeletion = true } = params;

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

                // Delete the file
                try {
                    await this.app.vault.delete(target);
                } catch (deleteError: any) {
                    return {
                        success: false,
                        error: `Failed to delete file: ${deleteError.message}`
                    };
                }

                totalSize = originalContent.length;

                return {
                    success: true,
                    data: {
                        action: 'deleted',
                        type: 'file',
                        filePath,
                        size: totalSize,
                        backupCreated,
                        backupCount,
                        message: `File '${filePath}' has been deleted${backupCreated ? ' (backup created)' : ''}.`
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

                // Delete the folder
                try {
                    await this.app.vault.delete(target);
                } catch (deleteError: any) {
                    return {
                        success: false,
                        error: `Failed to delete folder: ${deleteError.message}`
                    };
                }

                return {
                    success: true,
                    data: {
                        action: 'deleted',
                        type: 'folder',
                        filePath,
                        size: totalSize,
                        backupCreated,
                        backupCount,
                        message: `Folder '${filePath}' has been deleted${backupCreated ? ` (${backupCount} files backed up)` : ''}.`
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
}
