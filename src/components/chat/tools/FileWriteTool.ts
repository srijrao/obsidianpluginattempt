import { App, TFile } from 'obsidian';
import { Tool, ToolResult } from '../ToolRegistry';
import { createFile, writeFile } from '../../FileChooserModal';

export interface FileWriteParams {
    path: string;
    filePath?: string; // Legacy support
    content: string;
    createIfNotExists?: boolean;
    backup?: boolean;
}

export class FileWriteTool implements Tool {
    name = 'file_write';
    description = 'Write/modify file contents in the vault';    parameters = {
        path: {
            type: 'string',
            description: 'Path to the file to write (relative to vault root)',
            required: true
        },
        content: {
            type: 'string',
            description: 'Content to write to the file',
            required: true
        },
        createIfNotExists: {
            type: 'boolean',
            description: 'Whether to create the file if it does not exist',
            default: true
        },
        backup: {
            type: 'boolean',
            description: 'Whether to create a backup before modifying existing files',
            default: true
        }
    };

    constructor(private app: App) {}    async execute(params: any, context: any): Promise<ToolResult> {
        // Normalize parameter names for backward compatibility
        const filePath = params.path || params.filePath || params.filename;
        const { content, createIfNotExists = true, backup = true } = params;

        if (!filePath) {
            return {
                success: false,
                error: 'filePath or filename parameter is required'
            };
        }

        if (content === undefined || content === null) {
            return {
                success: false,
                error: 'content parameter is required'
            };
        }

        try {
            const file = this.app.vault.getAbstractFileByPath(filePath);
            
            if (!file) {
                // File doesn't exist
                if (!createIfNotExists) {
                    return {
                        success: false,
                        error: `File not found and createIfNotExists is false: ${filePath}`
                    };
                }

                // Use existing utility to create new file
                const result = await createFile(this.app, filePath, content);
                
                if (result.startsWith('Failed to create')) {
                    return {
                        success: false,
                        error: result
                    };
                }

                return {
                    success: true,
                    data: {
                        action: 'created',
                        filePath,
                        size: content.length
                    }
                };
            }

            if (!(file instanceof TFile)) {
                return {
                    success: false,
                    error: `Path is not a file: ${filePath}`
                };
            }

            // File exists, handle backup if requested
            if (backup) {
                const backupPath = `${filePath}.backup.${Date.now()}`;
                const originalContent = await this.app.vault.read(file);
                try {
                    await createFile(this.app, backupPath, originalContent);
                } catch (error) {
                    // If backup fails, warn but continue
                    console.warn(`Failed to create backup for ${filePath}:`, error);
                }
            }

            // Use existing utility to modify file
            const result = await writeFile(this.app, filePath, content);
            
            if (result.startsWith('Failed to write')) {
                return {
                    success: false,
                    error: result
                };
            }

            return {
                success: true,
                data: {
                    action: 'modified',
                    filePath,
                    size: content.length,
                    backupCreated: backup
                }
            };
        } catch (error: any) {
            return {
                success: false,
                error: `Failed to write file: ${error.message}`
            };
        }
    }
}
