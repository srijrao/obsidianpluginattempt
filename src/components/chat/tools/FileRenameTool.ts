// FileRenameTool.ts
// Tool for renaming files within the vault

import { App, TFile } from 'obsidian';
import { Tool, ToolResult } from '../agent/ToolRegistry';

export interface FileRenameParams {
    path: string;
    newName: string;
    overwrite?: boolean;
}

export class FileRenameTool implements Tool {
    name = 'file_rename';
    description = 'Rename a file within the vault (does not move directories)';
    parameters = {
        path: {
            type: 'string',
            description: 'Current path to the file (relative to vault root)',
            required: true
        },
        newName: {
            type: 'string',
            description: 'New name for the file (not a path, just the filename)',
            required: true
        },
        overwrite: {
            type: 'boolean',
            description: 'Whether to overwrite if a file with the new name exists',
            default: false
        }
    };

    constructor(private app: App) {}

    async execute(params: FileRenameParams & { newPath?: string }, context: any): Promise<ToolResult> {
        // Accept both newName and newPath for compatibility
        const { path, newName, newPath, overwrite = false } = params;
        const finalNewName = newName || newPath;

        if (!path || !finalNewName) {
            return {
                success: false,
                error: 'Both path and newName (or newPath) parameters are required'
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
