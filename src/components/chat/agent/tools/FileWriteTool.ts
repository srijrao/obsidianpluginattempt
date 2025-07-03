import { App, TFile } from 'obsidian';
import { Tool, ToolResult } from '../ToolRegistry';
import { BackupManager } from '../../../BackupManager';
import { PathValidator } from './pathValidation';
import { isTFile } from '../../../../utils/typeguards'; 

/**
 * Creates a file and all necessary parent folders if they do not exist.
 * @param app Obsidian App instance
 * @param filePath Path to the file to create
 * @param content Content to write to the file
 * @returns Status message string
 */
async function createFileWithParents(app: App, filePath: string, content = ''): Promise<string> {
    const parts = filePath.split('/');
    parts.pop(); // Remove file name
    let current = '';
    for (const part of parts) {
        current = current ? `${current}/${part}` : part;
        if (current && !app.vault.getAbstractFileByPath(current)) {
            try {
                await app.vault.createFolder(current);
            } catch (err: any) {
                // Ignore "already exists" errors, fail on others
                if (!/already exists/i.test(err?.message || '')) {
                    return `Failed to create parent folder: ${err?.message || err}`;
                }
            }
        }
    }
    try {
        await app.vault.create(filePath, content);
        return `Created file '${filePath}'.`;
    } catch (err: any) {
        return `Failed to create file: ${err?.message || err}`;
    }
}

/**
 * Creates a file directly (without creating parent folders).
 * @param app Obsidian App instance
 * @param filePath Path to the file to create
 * @param content Content to write to the file
 * @returns Status message string
 */
async function createFileDirect(app: App, filePath: string, content = ''): Promise<string> {
    try {
        await app.vault.create(filePath, content);
        return `Created file '${filePath}'.`;
    } catch (err: any) {
        return `Failed to create file: ${err?.message || err}`;
    }
}

/**
 * Writes content to an existing file.
 * @param app Obsidian App instance
 * @param filePath Path to the file to write
 * @param content Content to write
 * @returns Status message string
 */
async function writeFileDirect(app: App, filePath: string, content: string): Promise<string> {
    const file = app.vault.getAbstractFileByPath(filePath);
    if (!file || !isTFile(file)) {
        return `File not found or is not a file: "${filePath}"`;
    }
    try {
        await app.vault.modify(file, content);
        return `Wrote to file '${filePath}'.`;
    } catch (err: any) {
        return `Failed to write file: ${err?.message || err}`;
    }
}

/**
 * Parameters for writing to a file.
 */
export interface FileWriteParams {
    path: string;                  // Path to the file
    filePath?: string;             // Alternate/legacy path parameter
    content: string;               // Content to write
    createIfNotExists?: boolean;   // Whether to create the file if it doesn't exist
    backup?: boolean;              // Whether to create a backup before modifying
    createParentFolders: boolean;  // Whether to create parent folders if they don't exist
}

/**
 * Tool for writing or modifying the content of a file in the vault.
 * Supports file creation, backup, and parent folder creation.
 */
export class FileWriteTool implements Tool {
    name = 'file_write';
    description = 'Writes or modifies the content of a file in the vault, with options for creating new files, backing up existing ones, and creating parent directories. This tool is essential for managing file content.';
    parameters = {
        path: {
            type: 'string',
            description: 'Path to the file.',
            required: true
        },
        content: {
            type: 'string',
            description: 'Content to write.',
            required: true
        },
        createIfNotExists: {
            type: 'boolean',
            description: 'Create file if it doesn\'t exist.',
            default: true
        },
        backup: {
            type: 'boolean',
            description: 'Create backup before modifying.',
            default: true
        },
        createParentFolders: {
            type: 'boolean',
            description: 'Create parent folders if they don\'t exist.',
            required: true
        }
    };

    private backupManager: BackupManager;
    private pathValidator: PathValidator;

    constructor(private app: App, backupManager?: BackupManager) {
        // Use plugin config directory for default backup location
        const defaultPath = app.vault.configDir + '/plugins/ai-assistant-for-obsidian';
        this.backupManager = backupManager || new BackupManager(app, defaultPath);
        this.pathValidator = new PathValidator(app);
    }

    /**
     * Executes the file write operation.
     * Handles file creation, backup, and content writing.
     * @param params FileWriteParams (with legacy/alternate keys supported)
     * @param context Execution context (unused)
     * @returns ToolResult indicating success or failure
     */
    async execute(params: any, context: any): Promise<ToolResult> {
        // Use either 'path', 'filePath', or 'filename'
        const inputPath = params.path || params.filePath || params.filename;
        const { content, createIfNotExists = true, backup = true, createParentFolders } = params;

        if (inputPath === undefined || inputPath === null) {
            return {
                success: false,
                error: 'path parameter is required'
            };
        }
        if (typeof createParentFolders !== 'boolean') {
            return {
                success: false,
                error: 'createParentFolders parameter is required and must be boolean'
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

        if (content === undefined || content === null) {
            return {
                success: false,
                error: 'content parameter is required'
            };
        }

        try {
            const file = this.app.vault.getAbstractFileByPath(filePath);
            if (!file) {
                // File does not exist: create it if allowed
                if (!createIfNotExists) {
                    return {
                        success: false,
                        error: `File not found and createIfNotExists is false: ${filePath}`
                    };
                }
                // Create file, with or without parent folders
                let result: string;
                if (createParentFolders) {
                    result = await createFileWithParents(this.app, filePath, content);
                } else {
                    // Check parent folder existence
                    const parentPath = filePath.split('/').slice(0, -1).join('/');
                    if (parentPath && !this.app.vault.getAbstractFileByPath(parentPath)) {
                        return {
                            success: false,
                            error: `Parent folder does not exist: ${parentPath}`
                        };
                    }
                    result = await createFileDirect(this.app, filePath, content);
                }
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
            if (!isTFile(file)) {
                return {
                    success: false,
                    error: `Path is not a file: ${filePath}`
                };
            }
            // Optionally backup the original content
            let originalContent: string | undefined = undefined;
            if (backup || true) {
                originalContent = await this.app.vault.read(file);
            }
            if (backup) {
                const shouldBackup = await this.backupManager.shouldCreateBackup(filePath, content);
                if (shouldBackup) {
                    await this.backupManager.createBackup(filePath, originalContent);
                }
            }
            // If content is unchanged, return early
            if (originalContent === content) {
                return {
                    success: true,
                    data: {
                        action: 'unchanged',
                        filePath,
                        size: content.length,
                        backupCreated: backup
                    }
                };
            }
            // Write new content to file
            const result = await writeFileDirect(this.app, filePath, content);
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
