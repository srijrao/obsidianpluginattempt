import { App, TFile, TFolder } from 'obsidian';
import { Tool, ToolResult } from '../ToolRegistry';

export interface FileMoveParams {
    sourcePath: string;
    destinationPath: string;
    createFolders?: boolean;
    overwrite?: boolean;
}

export class FileMoveTool implements Tool {
    name = 'file_move';
    description = 'Move or rename files within the vault';
    parameters = {
        sourcePath: {
            type: 'string',
            description: 'Path to the source file (relative to vault root)',
            required: true
        },
        destinationPath: {
            type: 'string',
            description: 'Destination path for the file (relative to vault root)',
            required: true
        },
        createFolders: {
            type: 'boolean',
            description: 'Whether to create parent folders if they don\'t exist',
            default: true
        },
        overwrite: {
            type: 'boolean',
            description: 'Whether to overwrite destination if it exists',
            default: false
        }
    };

    constructor(private app: App) {}

    async execute(params: FileMoveParams & Record<string, any>, context: any): Promise<ToolResult> {
        // Parameter aliasing for robustness
        let sourcePath = params.sourcePath;
        let destinationPath = params.destinationPath;
        // Accept legacy/incorrect parameter names as aliases
        if (!sourcePath && params.path) sourcePath = params.path;
        if (!destinationPath && (params.new_path || params.newPath)) destinationPath = params.new_path || params.newPath;

        const { createFolders = true, overwrite = false } = params;

        if (!sourcePath || !destinationPath) {
            return {
                success: false,
                error: 'Both sourcePath and destinationPath parameters are required (aliases: path, new_path, newPath)'
            };
        }

        try {
            // Check if source file exists
            const sourceFile = this.app.vault.getAbstractFileByPath(sourcePath);
            
            if (!sourceFile) {
                return {
                    success: false,
                    error: `Source file not found: ${sourcePath}`
                };
            }

            if (!(sourceFile instanceof TFile)) {
                return {
                    success: false,
                    error: `Source path is not a file: ${sourcePath}`
                };
            }

            // Check if destination exists
            const destinationExists = this.app.vault.getAbstractFileByPath(destinationPath);
            
            if (destinationExists && !overwrite) {
                return {
                    success: false,
                    error: `Destination already exists and overwrite is not enabled: ${destinationPath}`
                };
            }

            // Extract the destination folder path
            const lastSlashIndex = destinationPath.lastIndexOf('/');
            const destinationFolder = lastSlashIndex !== -1 
                ? destinationPath.substring(0, lastSlashIndex) 
                : '';

            // Create destination folders if needed
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

            // Perform the move operation
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
