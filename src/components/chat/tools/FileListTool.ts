// FileListTool.ts
// Tool for listing files in a specified folder in the vault
import { App, TFile, TFolder, Vault } from 'obsidian';
import { Tool, ToolResult } from '../agent/ToolRegistry';

export interface FileListParams {
    path: string; // Path to the folder
    folderPath?: string; // Alias for path for backward compatibility
    recursive?: boolean;
}

export class FileListTool implements Tool {
    name = 'file_list';
    description = 'List all files in a specified folder in the vault';
    parameters = {
        path: { type: 'string', description: 'Path to the folder (relative to vault root)', required: true },
        recursive: { type: 'boolean', description: 'Whether to list files recursively', default: false }
    };

    constructor(private app: App) {}

    async execute(params: FileListParams, context: any): Promise<ToolResult> {
        // Normalize parameter names for backward compatibility
        const folderPath = params.path || params.folderPath;
        const { recursive = false } = params;
        
        if (!folderPath) {
            return {
                success: false,
                error: 'path parameter is required'
            };
        }
        
        const vault: Vault = this.app.vault;
        const folder = vault.getAbstractFileByPath(folderPath);
        
        if (!folder || !(folder instanceof TFolder)) {
            return {
                success: false,
                error: 'Folder not found: ' + folderPath
            };
        }

        const filesFound: string[] = [];
        const walk = (currentFolder: TFolder) => {
            for (const child of currentFolder.children) {
                if (child instanceof TFile) {
                    filesFound.push(child.path);
                } else if (child instanceof TFolder && recursive) {
                    walk(child);
                }
            }
        };

        try {
            walk(folder);
            return {
                success: true,
                data: { files: filesFound, count: filesFound.length, path: folderPath, recursive }
            };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }
}
