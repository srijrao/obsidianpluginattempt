import { App, TFile, TFolder } from 'obsidian';
import { Tool, ToolResult } from '../ToolRegistry';
import { PathValidator } from './pathValidation';
import { isTFile } from '../../../../utils/typeguards';

/**
 * Parameters for moving or renaming a file.
 */
export interface FileMoveParams {
    sourcePath: string;         // Path of the source file
    destinationPath: string;    // New path for the file
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
            required: true
        },
        destinationPath: {
            type: 'string',
            description: 'New path for the file.',
            required: true
        },
        createFolders: {
            type: 'boolean',
            description: 'Create parent folders if they don\'t exist.',
            default: true
        },
        overwrite: {
            type: 'boolean',
            description: 'Overwrite destination if it exists.',
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
        // Support legacy/alias keys for source and destination
        let inputSourcePath = params.sourcePath;
        let inputDestinationPath = params.destinationPath;
        if (!inputSourcePath && params.path) inputSourcePath = params.path;
        if (!inputDestinationPath && (params.new_path || params.newPath)) inputDestinationPath = params.new_path || params.newPath;

        const { createFolders = true, overwrite = false } = params;

        // Validate required parameters
        if (inputSourcePath === undefined || inputSourcePath === null || 
            inputDestinationPath === undefined || inputDestinationPath === null) {
            return {
                success: false,
                error: 'Both sourcePath and destinationPath parameters are required (aliases: path, new_path, newPath)'
            };
        }

        // Validate and normalize paths
        let sourcePath: string;
        let destinationPath: string;
        try {
            sourcePath = this.pathValidator.validateAndNormalizePath(inputSourcePath);
            destinationPath = this.pathValidator.validateAndNormalizePath(inputDestinationPath);
        } catch (error: any) {
            return {
                success: false,
                error: `Path validation failed: ${error.message}`
            };
        }

        try {
            // Get the source file object
            const sourceFile = this.app.vault.getAbstractFileByPath(sourcePath);
            if (!sourceFile) {
                return {
                    success: false,
                    error: `Source file not found: ${sourcePath}`
                };
            }

            // Ensure the source is a file (not a folder)
            if (!isTFile(sourceFile)) {
                return {
                    success: false,
                    error: `Source path is not a file: ${sourcePath}`
                };
            }

            // Check if destination exists and handle overwrite option
            const destinationExists = this.app.vault.getAbstractFileByPath(destinationPath);
            if (destinationExists && !overwrite) {
                return {
                    success: false,
                    error: `Destination already exists and overwrite is not enabled: ${destinationPath}`
                };
            }

            // Determine the parent folder of the destination
            const lastSlashIndex = destinationPath.lastIndexOf('/');
            const destinationFolder = lastSlashIndex !== -1 
                ? destinationPath.substring(0, lastSlashIndex) 
                : '';

            // Create parent folders if needed
            if (destinationFolder && createFolders) {
                const folderExists = this.app.vault.getAbstractFileByPath(destinationFolder);
                if (!folderExists) {
                    await this.app.vault.createFolder(destinationFolder);
                } else if (!(folderExists instanceof TFolder)) {
                    return {
                        success: false,
                        error: `Destination parent path is not a folder: ${destinationFolder}`
                    };
                }
            }

            // Move (rename) the file
            await this.app.fileManager.renameFile(sourceFile, destinationPath);

            return {
                success: true,
                data: {
                    action: 'moved',
                    sourcePath,
                    destinationPath
                }
            };
        } catch (error) {
            return {
                success: false,
                error: `Failed to move file: ${error instanceof Error ? error.message : String(error)}`
            };
        }
    }
}
