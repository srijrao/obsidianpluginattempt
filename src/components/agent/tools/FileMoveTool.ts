import { App, TFile, TFolder } from 'obsidian';
import { Tool, ToolResult } from '../ToolRegistry';
import { PathValidator } from './pathValidation';
import { isTFile } from '../../../utils/typeGuards';
import { getTFileByPath, getTFolderByPath } from '../../../utils/fileUtils'; // Import the new utilities
import { debugLog } from '../../../utils/logger';

/**
 * Parameters for moving or renaming a file.
 */
export interface FileMoveParams {
    sourcePath?: string;         // Path of the source file
    path?: string;               // Alias for sourcePath
    destinationPath?: string;    // New path for the file
    newName?: string;            // New name for the file (if renaming within same folder)
    createFolders?: boolean;    // Whether to create parent folders if they don't exist
    overwrite?: boolean;        // Whether to overwrite destination if it exists
}

/**
 * Tool for moving or renaming files within the vault.
 * Supports folder creation and overwrite options.
 */
export class FileMoveTool implements Tool {
    name = 'file_move';
    description = 'Relocates or renames files within the vault, providing options to create necessary directories and handle existing files. This tool is vital for organizing and restructuring content.';
    parameters = {
        sourcePath: {
            type: 'string',
            description: 'Path of the source file.',
            required: false
        },
        path: {
            type: 'string',
            description: 'Alias for sourcePath.',
            required: false
        },
        destinationPath: {
            type: 'string',
            description: 'New path for the file.',
            required: false
        },
        newName: {
            type: 'string',
            description: 'New name for the file (if renaming within same folder). If provided, destinationPath is ignored.',
            required: false
        },
        createFolders: {
            type: 'boolean',
            description: 'Create parent folders if they don\'t exist.',
            default: true
        },
        overwrite: {
            type: 'boolean',
            description: 'Whether to overwrite destination if it exists.',
            default: false
        }
    };

    private pathValidator: PathValidator;

    constructor(private app: App) {
        this.pathValidator = new PathValidator(app);
    }

    /**
     * Executes the file move/rename operation.
     * @param params FileMoveParams (with possible legacy/alias keys)
     * @param context Execution context (unused)
     * @returns ToolResult indicating success or failure
     */
    async execute(params: FileMoveParams & Record<string, any>, context: any): Promise<ToolResult> {
        const debugMode = context?.plugin?.settings?.debugMode ?? true;

        let inputSourcePath = params.sourcePath || params.path;
        let inputDestinationPath = params.destinationPath;
        const newName = params.newName;

        const { createFolders = true, overwrite = false } = params;

        if (!inputSourcePath) {
            return {
                success: false,
                error: 'sourcePath or path parameter is required.'
            };
        }

        let sourcePath: string;
        try {
            sourcePath = this.pathValidator.validateAndNormalizePath(inputSourcePath);
        } catch (error: any) {
            return {
                success: false,
                error: `Path validation failed for sourcePath: ${error.message}`
            };
        }

        let finalDestinationPath: string;

        if (newName) {
            const sourceFile = getTFileByPath(this.app, sourcePath, debugMode); // Use utility
            if (!sourceFile) {
                return {
                    success: false,
                    error: `Source file not found or is not a file: ${sourcePath}`
                };
            }
            const parent = sourceFile.parent;
            if (!parent) {
                return {
                    success: false,
                    error: `Parent folder not found for file: ${sourcePath}`
                };
            }
            finalDestinationPath = parent.path ? `${parent.path}/${newName}` : newName;
        } else if (inputDestinationPath) {
            try {
                finalDestinationPath = this.pathValidator.validateAndNormalizePath(inputDestinationPath);
            } catch (error: any) {
                return {
                    success: false,
                    error: `Path validation failed for destinationPath: ${error.message}`
                };
            }
        } else {
            return {
                success: false,
                error: 'destinationPath or newName parameter is required.'
            };
        }

        try {
            const sourceFile = getTFileByPath(this.app, sourcePath, debugMode); // Use utility
            if (!sourceFile) {
                return {
                    success: false,
                    error: `Source file not found: ${sourcePath}`
                };
            }

            const destinationExists = this.app.vault.getAbstractFileByPath(finalDestinationPath);
            if (destinationExists && !overwrite) {
                return {
                    success: false,
                    error: `Destination already exists and overwrite is not enabled: ${finalDestinationPath}`
                };
            }

            const lastSlashIndex = finalDestinationPath.lastIndexOf('/');
            const destinationFolder = lastSlashIndex !== -1 
                ? finalDestinationPath.substring(0, lastSlashIndex) 
                : '';

            if (destinationFolder && createFolders) {
                const folderExists = getTFolderByPath(this.app, destinationFolder, debugMode); // Use utility
                if (!folderExists) {
                    await this.app.vault.createFolder(destinationFolder);
                } else if (!(folderExists instanceof TFolder)) {
                    return {
                        success: false,
                        error: `Destination parent path is not a folder: ${destinationFolder}`
                    };
                }
            }

            await this.app.fileManager.renameFile(sourceFile, finalDestinationPath);

            return {
                success: true,
                data: {
                    action: 'moved',
                    sourcePath,
                    destinationPath: finalDestinationPath
                }
            };
        } catch (error) {
            return {
                success: false,
                error: `Failed to move/rename file: ${error instanceof Error ? error.message : String(error)}`
            };
        }
    }
}
