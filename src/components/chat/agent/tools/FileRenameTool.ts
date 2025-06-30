

import { App, TFile } from 'obsidian';
import { Tool, ToolResult } from '../ToolRegistry';
import { PathValidator } from './pathValidation';

export interface FileRenameParams {
    path: string;
    newName: string;
    overwrite?: boolean;
}

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

    async execute(params: FileRenameParams & { newPath?: string }, context: any): Promise<ToolResult> {
        
        const { path: inputPath, newName, newPath, overwrite = false } = params;
        const finalNewName = newName || newPath;

        if (inputPath === undefined || inputPath === null || 
            finalNewName === undefined || finalNewName === null) {
            return {
                success: false,
                error: 'Both path and newName (or newPath) parameters are required'
            };
        }

        
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
            const file = vault.getAbstractFileByPath(path);
            if (!file || !(file instanceof TFile)) {
                return {
                    success: false,
                    error: 'File not found: ' + path
                };
            }
            const parent = file.parent;
            if (!parent) {
                return {
                    success: false,
                    error: 'Parent folder not found for file: ' + path
                };
            }
            const newPathFull = parent.path ? `${parent.path}/${finalNewName}` : finalNewName;
            if (!overwrite && vault.getAbstractFileByPath(newPathFull)) {
                return {
                    success: false,
                    error: 'A file with the new name already exists: ' + newPathFull
                };
            }
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
