import { App, TFile } from 'obsidian';
import { Tool, ToolResult } from '../ToolRegistry';
import { readFile } from '../../FileChooserModal';

export interface FileReadParams {
    path: string;
    filePath?: string; // Legacy support
    maxSize?: number; // Maximum file size in bytes (default 1MB)
}

export class FileReadTool implements Tool {
    name = 'file_read';
    description = 'Read file contents from the vault';    parameters = {
        path: {
            type: 'string',
            description: 'Path to the file to read (relative to vault root)',
            required: true
        },
        maxSize: {
            type: 'number',
            description: 'Maximum file size in bytes (default 1MB)',
            default: 1024 * 1024
        }
    };

    constructor(private app: App) {}    async execute(params: FileReadParams, context: any): Promise<ToolResult> {
        // Normalize parameter names for backward compatibility
        const filePath = params.path || params.filePath;
        
        const { maxSize = 1024 * 1024 } = params;

        if (!filePath) {
            return {
                success: false,
                error: 'path parameter is required'
            };
        }

        try {
            // Check file size before reading
            const file = this.app.vault.getAbstractFileByPath(filePath);
            if (file && file instanceof TFile && file.stat?.size && file.stat.size > maxSize) {
                return {
                    success: false,
                    error: `File too large (${file.stat.size} bytes, max ${maxSize} bytes): ${filePath}`
                };
            }

            // Use existing utility function from FileChooserModal
            const content = await readFile(this.app, filePath);

            // Check if content indicates an error (readFile returns error strings)
            if (content.startsWith('File not found') || content.startsWith('Failed to read')) {
                return {
                    success: false,
                    error: content
                };
            }

            return {
                success: true,
                data: {
                    content,
                    filePath,
                    size: (file instanceof TFile) ? (file.stat?.size || 0) : 0,
                    modified: (file instanceof TFile) ? (file.stat?.mtime || 0) : 0,
                    extension: (file instanceof TFile) ? file.extension : undefined
                }
            };
        } catch (error: any) {
            return {
                success: false,
                error: `Failed to read file: ${error.message}`
            };
        }
    }
}
