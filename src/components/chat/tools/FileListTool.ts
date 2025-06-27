// FileListTool.ts
// Tool for listing files in a specified folder in the vault
import { App, TFile, TFolder, Vault } from 'obsidian';
import { Tool, ToolResult } from '../agent/ToolRegistry';
import { PathValidator } from './pathValidation';

export interface FileListParams {
    path: string; // Path to the folder
    folderPath?: string; // Alias for path for backward compatibility
    recursive?: boolean;
}

export class FileListTool implements Tool {
    name = 'file_list';
    description = 'List all files in a specified folder in the vault';
    parameters = {
        path: { type: 'string', description: 'Path to the folder (relative to vault root or absolute path within vault). Defaults to vault root if not provided.', required: false },
        recursive: { type: 'boolean', description: 'Whether to list files recursively', default: false }
    };

    private pathValidator: PathValidator;

    constructor(private app: App) {
        this.pathValidator = new PathValidator(app);
    }

    async execute(params: FileListParams, context: any): Promise<ToolResult> {
        // Normalize parameter names for backward compatibility - include 'folder' which AI often sends
        // Default to root if no path is provided
        const inputPath = params.path || params.folderPath || (params as any).folder || '';
        const { recursive = false } = params;

        // Validate and normalize the path to ensure it's within the vault
        let folderPath: string;
        try {
            folderPath = this.pathValidator.validateAndNormalizePath(inputPath);
        } catch (error: any) {
            return {
                success: false,
                error: `Path validation failed: ${error.message}`
            };
        }
        
        const vault: Vault = this.app.vault;
        let folder;
        
        // Handle root folder case
        if (folderPath === '' || folderPath === '/') {
            folder = vault.getRoot();
        } else {
            folder = vault.getAbstractFileByPath(folderPath);
        }
        
        if (!folder || !(folder instanceof TFolder)) {
            return {
                success: false,
                error: 'Folder not found: ' + (folderPath || '(root)')
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
