import { App, TFile } from 'obsidian';
import { Tool, ToolResult } from '../ToolRegistry';
import { PathValidator } from './pathValidation';
import { isTFile } from '../../../../utils/typeguards';

/**
 * Reads the content of a file directly from the vault.
 * Returns an error message string if the file is not found or not a file.
 * @param app Obsidian App instance
 * @param filePath Path to the file
 * @returns File content or error message string
 */
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
    description = 'Reads and retrieves the content of a specified file from the vault, with an option to limit the maximum file size. This tool is fundamental for accessing and processing file data.';
    parameters = {
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
    }

    /**
     * Executes the file read operation.
     * Validates the path, checks file size, reads content, and returns cleaned content.
     * @param params FileReadParams
     * @param context Execution context (unused)
     * @returns ToolResult with file content or error
     */
    async execute(params: FileReadParams, context: any): Promise<ToolResult> {
        // Use either 'path' or legacy 'filePath'
        const inputPath = params.path || params.filePath;
        const { maxSize = 1024 * 1024 } = params;

        if (inputPath === undefined || inputPath === null) {
            return {
                success: false,
                error: 'path parameter is required'
            };
        }

        // Validate and normalize the file path
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
            // Check file existence and size before reading
            const file = this.app.vault.getAbstractFileByPath(filePath);
            if (file && isTFile(file) && file.stat?.size && file.stat.size > maxSize) {
                return {
                    success: false,
                    error: `File too large (${file.stat.size} bytes, max ${maxSize} bytes): ${filePath}`
                };
            }

            // Read file content (returns error string if not found)
            let content = await readFileDirect(this.app, filePath);

            // If reading failed, return error
            if (content.startsWith('File not found') || content.startsWith('Failed to read')) {
                return {
                    success: false,
                    error: content
                };
            }

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
