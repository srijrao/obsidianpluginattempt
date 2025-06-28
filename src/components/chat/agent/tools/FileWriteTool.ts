import { App, TFile } from 'obsidian';
import { Tool, ToolResult } from '../ToolRegistry';
import { BackupManager } from '../../../BackupManager';
import { PathValidator } from './pathValidation';

// Helper to create parent folders for a file path
async function createFileWithParents(app: App, filePath: string, content = ''): Promise<string> {
    const parts = filePath.split('/');
    parts.pop(); // remove file name
    let current = '';
    for (const part of parts) {
        current = current ? `${current}/${part}` : part;
        if (current && !app.vault.getAbstractFileByPath(current)) {
            try {
                await app.vault.createFolder(current);
            } catch (err: any) {
                // Ignore if already exists due to race, else fail
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

async function createFileDirect(app: App, filePath: string, content = ''): Promise<string> {
    try {
        await app.vault.create(filePath, content);
        return `Created file '${filePath}'.`;
    } catch (err: any) {
        return `Failed to create file: ${err?.message || err}`;
    }
}

async function writeFileDirect(app: App, filePath: string, content: string): Promise<string> {
    const file = app.vault.getAbstractFileByPath(filePath);
    if (!file || !(file instanceof TFile)) {
        return `File not found or is not a file: "${filePath}"`;
    }
    try {
        await app.vault.modify(file, content);
        return `Wrote to file '${filePath}'.`;
    } catch (err: any) {
        return `Failed to write file: ${err?.message || err}`;
    }
}

export interface FileWriteParams {
    path: string;
    filePath?: string; // Legacy support
    content: string;
    createIfNotExists?: boolean;
    backup?: boolean;
    createParentFolders: boolean; // Now required
}

export class FileWriteTool implements Tool {
    name = 'file_write';
    description = 'Write/modify file contents in the vault';
    parameters = {
        path: {
            type: 'string',
            description: 'Path to the file to write (relative to vault root or absolute path within vault)',
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
        },
        createParentFolders: {
            type: 'boolean',
            description: 'Whether to create parent folders if they do not exist',
            required: true
        }
    };
    private backupManager: BackupManager;
    private pathValidator: PathValidator;
    constructor(private app: App, backupManager?: BackupManager) {
        // Initialize backup manager with provided instance or create a default one
        const defaultPath = app.vault.configDir + '/plugins/ai-assistant-for-obsidian';
        this.backupManager = backupManager || new BackupManager(app, defaultPath);
        this.pathValidator = new PathValidator(app);
    }
    async execute(params: any, context: any): Promise<ToolResult> {
        // Normalize parameter names for backward compatibility
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

        // Validate and normalize the path to ensure it's within the vault
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
                // File doesn't exist
                if (!createIfNotExists) {
                    return {
                        success: false,
                        error: `File not found and createIfNotExists is false: ${filePath}`
                    };
                }
                // Use direct logic to create file, with or without parent folders
                let result: string;
                if (createParentFolders) {
                    result = await createFileWithParents(this.app, filePath, content);
                } else {
                    // Check if parent exists
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
            if (!(file instanceof TFile)) {
                return {
                    success: false,
                    error: `Path is not a file: ${filePath}`
                };
            }
            // File exists, handle backup if requested
            if (backup) {
                const originalContent = await this.app.vault.read(file);
                // Only create backup if content is actually changing
                const shouldBackup = await this.backupManager.shouldCreateBackup(filePath, content);
                if (shouldBackup) {
                    await this.backupManager.createBackup(filePath, originalContent);
                }
            }
            // Use direct logic to modify file
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
