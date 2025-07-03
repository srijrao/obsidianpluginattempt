import { App, TFile } from 'obsidian';
import { Tool, ToolResult } from '../ToolRegistry';
import { PathValidator } from './pathValidation';

/**
 * Parameters for renaming a file.
 */
export interface FileRenameParams {
    path: string;         // Path to the file to rename
    newName: string;      // New name for the file (not a full path)
    overwrite?: boolean;  // Whether to overwrite if a file with the new name exists
}

/**
 * Tool for renaming a file within the vault.
 * Only changes the file's name, not its directory.
 */
export class FileRenameTool implements Tool {
    name = 'file_rename';
    description = 'Renames a file within the vault, allowing for simple name changes without altering its directory. This tool is useful for maintaining consistent naming conventions and improving file organization.';
    parameters = {
        path: {
            type: 'string',
            description: 'Path to the file.',
            required: true
        },
        newName: {
            type: 'string',
            description: 'New name for the file.',
            required: true
        },
        overwrite: {
            type: 'boolean',
            description: 'Overwrite if a file with the new name exists.',
            default: false
        }
    };

    private pathValidator: PathValidator;

    constructor(private app: App) {
        this.pathValidator = new PathValidator(app);
    }

    /**
     * Executes the file rename operation.
     * Validates the path, checks for conflicts, and renames the file.
     * @param params FileRenameParams (with optional newPath alias)
     * @param context Execution context (unused)
     * @returns ToolResult with old and new file paths or error
     */
    async execute(params: FileRenameParams & { newPath?: string }, context: any): Promise<ToolResult> {
        // Support both newName and newPath as the new file name
        const { path: inputPath, newName, newPath, overwrite = false } = params;
        const finalNewName = newName || newPath;

        // Validate required parameters
        if (inputPath === undefined || inputPath === null || 
            finalNewName === undefined || finalNewName === null) {
            return {
                success: false,
                error: 'Both path and newName (or newPath) parameters are required'
            };
        }

        // Validate and normalize the file path
        let path: string;
        try {
            path = this.pathValidator.validateAndNormalizePath(inputPath);
        } catch (error: any) {
            return {
                success: false,
                error: `Path validation failed: ${error.message}`
            };
        }

        try {
            const vault = this.app.vault;
            // Get the file object
            const file = vault.getAbstractFileByPath(path);
            if (!file || !(file instanceof TFile)) {
                return {
                    success: false,
                    error: 'File not found: ' + path
                };
            }
            // Get the parent folder of the file
            const parent = file.parent;
            if (!parent) {
                return {
                    success: false,
                    error: 'Parent folder not found for file: ' + path
                };
            }
            // Construct the new full path for the renamed file
            const newPathFull = parent.path ? `${parent.path}/${finalNewName}` : finalNewName;
            // Check for overwrite conflicts
            if (!overwrite && vault.getAbstractFileByPath(newPathFull)) {
                return {
                    success: false,
                    error: 'A file with the new name already exists: ' + newPathFull
                };
            }
            // Perform the rename operation
            await vault.rename(file, newPathFull);
            return {
                success: true,
                data: { oldPath: path, newPath: newPathFull }
            };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }
}
