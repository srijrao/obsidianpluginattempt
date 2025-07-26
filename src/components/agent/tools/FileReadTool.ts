import { App, TFile } from 'obsidian';
import { Tool, ToolResult } from '../ToolRegistry';
import { PathValidator } from './pathValidation';
import { getTFileByPath } from '../../../utils/fileUtils';
import { debugLog } from '../../../utils/logger';

/**
 * Parameters for reading a file.
 */
export interface FileReadParams {
    path: string;           // Path to the file (required)
    filePath?: string;      // Alternate/legacy path parameter
    maxSize?: number;       // Maximum file size in bytes
}

/**
 * Tool for reading and retrieving the content of a file from the vault.
 * Supports file size limiting and basic content cleanup.
 */
export class FileReadTool implements Tool {
    name = 'file_read';
    description = 'Read file content from vault. Use before editing or when content analysis is needed. Supports size limits for large files.';
    parameters = {
        path: {
            type: 'string',
            description: 'File path relative to vault root',
            required: true
        },
        maxSize: {
            type: 'number',
            description: 'Maximum file size in bytes for large file handling',
            default: 1024 * 1024
        }
    };

    private pathValidator: PathValidator;

    constructor(private app: App) {
        this.pathValidator = new PathValidator(app);
    }

    /**
     * Executes the file read operation.
     * Validates the path, checks file size, reads content, and returns cleaned content.
     * @param params FileReadParams
     * @param context Execution context (unused)
     * @returns ToolResult with file content or error
     */
    async execute(params: FileReadParams, context: any): Promise<ToolResult> {
        const debugMode = context?.plugin?.settings?.debugMode ?? true;

        // Use either 'path' or legacy 'filePath'
        const inputPath = params.path || params.filePath;
        const { maxSize = 1024 * 1024 } = params;

        if (inputPath === undefined || inputPath === null) {
            debugLog(debugMode, 'warn', '[FileReadTool] Missing path parameter');
            return {
                success: false,
                error: 'path parameter is required'
            };
        }

        // Validate and normalize the file path
        let filePath: string;
        try {
            filePath = this.pathValidator.validateAndNormalizePath(inputPath);
            debugLog(debugMode, 'debug', '[FileReadTool] Normalized filePath:', filePath);
        } catch (error: any) {
            debugLog(debugMode, 'error', '[FileReadTool] Path validation failed:', error);
            return {
                success: false,
                error: `Path validation failed: ${error.message}`
            };
        }

        try {
            // Check file existence and size before reading
            const file = getTFileByPath(this.app, filePath, debugMode);
            if (!file) {
                debugLog(debugMode, 'warn', '[FileReadTool] File not found:', filePath);
                return {
                    success: false,
                    error: `File not found: ${filePath}`
                };
            }

            if (file.stat?.size && file.stat.size > maxSize) {
                debugLog(debugMode, 'warn', '[FileReadTool] File too large:', { filePath, size: file.stat.size, maxSize });
                return {
                    success: false,
                    error: `File too large (${file.stat.size} bytes, max ${maxSize} bytes): ${filePath}`
                };
            }

            // Read file content
            let content = await this.app.vault.read(file);
            debugLog(debugMode, 'info', '[FileReadTool] File content read', { filePath, size: content.length });

            // Clean up content: trim trailing whitespace, collapse multiple blank lines, etc.
            content = content
                .split('\n')
                .map(line => line.replace(/\s+$/g, '')) // Remove trailing spaces
                .join('\n')
                .replace(/\n{3,}/g, '\n\n')             // Collapse 3+ blank lines to 2
                .replace(/ {3,}/g, '  ')                // Collapse 3+ spaces to 2
                .replace(/-{6,}/g, '-----')             // Collapse 6+ dashes to 5
                .trim();

            return {
                success: true,
                data: {
                    content,
                    filePath,
                    size: file.stat?.size || 0,
                    modified: file.stat?.mtime || 0,
                    extension: file.extension
                }
            };
        } catch (error: any) {
            debugLog(debugMode, 'error', '[FileReadTool] Failed to read file:', error);
            return {
                success: false,
                error: `Failed to read file: ${error.message}`
            };
        }
    }
}
