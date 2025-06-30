import { App, TFile } from 'obsidian';
import { Tool, ToolResult } from '../ToolRegistry';
import { PathValidator } from './pathValidation';
import { isTFile } from '../../../../utils/typeguards';

async function readFileDirect(app: App, filePath: string): Promise<string> {
    const file = app.vault.getAbstractFileByPath(filePath);
    if (!file || !isTFile(file)) {
        return `File not found or is not a file: "${filePath}"`;
    }
    try {
        return await app.vault.read(file);
    } catch (err: any) {
        return `Failed to read file: ${err?.message || err}`;
    }
}

export interface FileReadParams {
    path: string;
    filePath?: string; 
    maxSize?: number; 
}

export class FileReadTool implements Tool {
    name = 'file_read';
    description = 'Reads and retrieves the content of a specified file from the vault, with an option to limit the maximum file size. This tool is fundamental for accessing and processing file data.';    parameters = {
        path: {
            type: 'string',
            description: 'Path to the file.',
            required: true
        },
        maxSize: {
            type: 'number',
            description: 'Maximum file size in bytes.',
            default: 1024 * 1024
        }
    };

    private pathValidator: PathValidator;

    constructor(private app: App) {
        this.pathValidator = new PathValidator(app);
    }    async execute(params: FileReadParams, context: any): Promise<ToolResult> {
        
        const inputPath = params.path || params.filePath;
        
        const { maxSize = 1024 * 1024 } = params;

        if (inputPath === undefined || inputPath === null) {
            return {
                success: false,
                error: 'path parameter is required'
            };
        }

        
        let filePath: string;
        try {
            filePath = this.pathValidator.validateAndNormalizePath(inputPath);
        } catch (error: any) {
            return {
                success: false,
                error: `Path validation failed: ${error.message}`
            };
        }

        try {
            
            const file = this.app.vault.getAbstractFileByPath(filePath);
            if (file && isTFile(file) && file.stat?.size && file.stat.size > maxSize) {
                return {
                    success: false,
                    error: `File too large (${file.stat.size} bytes, max ${maxSize} bytes): ${filePath}`
                };
            }

            
            let content = await readFileDirect(this.app, filePath);

            
            if (content.startsWith('File not found') || content.startsWith('Failed to read')) {
                return {
                    success: false,
                    error: content
                };
            }

            
            content = content
                .split('\n')
                .map(line => line.replace(/\s+$/g, '')) 
                .join('\n')
                .replace(/\n{3,}/g, '\n\n') 
                .replace(/ {3,}/g, '  ') 
                .replace(/-{6,}/g, '-----') 
                .trim(); 

            return {
                success: true,
                data: {
                    content,
                    filePath,
                    size: (isTFile(file)) ? (file.stat?.size || 0) : 0,
                    modified: (isTFile(file)) ? (file.stat?.mtime || 0) : 0,
                    extension: (isTFile(file)) ? file.extension : undefined
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
