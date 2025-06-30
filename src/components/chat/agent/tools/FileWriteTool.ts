import { App, TFile } from 'obsidian';
import { Tool, ToolResult } from '../ToolRegistry';
import { BackupManager } from '../../../BackupManager';
import { PathValidator } from './pathValidation';
import { isTFile } from '../../../../utils/typeguards'; 

async function createFileWithParents(app: App, filePath: string, content = ''): Promise<string> {
    const parts = filePath.split('/');
    parts.pop(); 
    let current = '';
    for (const part of parts) {
        current = current ? `${current}/${part}` : part;
        if (current && !app.vault.getAbstractFileByPath(current)) {
            try {
                await app.vault.createFolder(current);
            } catch (err: any) {
                
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

export interface FileWriteParams {
    path: string;
    filePath?: string; 
    content: string;
    createIfNotExists?: boolean;
    backup?: boolean;
    createParentFolders: boolean; 
}

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
        
        const defaultPath = app.vault.configDir + '/plugins/ai-assistant-for-obsidian';
        this.backupManager = backupManager || new BackupManager(app, defaultPath);
        this.pathValidator = new PathValidator(app);
    }
    async execute(params: any, context: any): Promise<ToolResult> {
        
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
                
                if (!createIfNotExists) {
                    return {
                        success: false,
                        error: `File not found and createIfNotExists is false: ${filePath}`
                    };
                }
                
                let result: string;
                if (createParentFolders) {
                    result = await createFileWithParents(this.app, filePath, content);
                } else {
                    
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
