import { App, TFile } from 'obsidian';
import { Tool, ToolResult } from '../ToolRegistry';
import { BackupManager } from '../../../BackupManager';
import { PathValidator } from './pathValidation';
import { getTFileByPath, ensureFolderExists } from '../../../../utils/fileUtils';
import { debugLog } from '../../../../utils/logger';

/**
 * Parameters for writing to a file.
 */
export interface FileWriteParams {
    path: string;                  // Path to the file
    filePath?: string;             // Alternate/legacy path parameter
    content: string;               // Content to write
    createIfNotExists?: boolean;   // Whether to create the file if it doesn't exist
    backup?: boolean;              // Whether to create a backup before modifying
    createParentFolders?: boolean;  // Whether to create parent folders if they don't exist
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
            default: true // Changed default to true
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
        const debugMode = context?.plugin?.settings?.debugMode ?? true;

        // Use either 'path', 'filePath', or 'filename'
        const inputPath = params.path || params.filePath || params.filename;
        const { content, createIfNotExists = true, backup = true, createParentFolders = true } = params; // Default createParentFolders to true

        if (inputPath === undefined || inputPath === null) {
            debugLog(debugMode, 'warn', '[FileWriteTool] Missing path parameter');
            return {
                success: false,
                error: 'path parameter is required'
            };
        }

        // Validate and normalize the file path
        let filePath: string;
        try {
            filePath = this.pathValidator.validateAndNormalizePath(inputPath);
            debugLog(debugMode, 'debug', '[FileWriteTool] Normalized filePath:', filePath);
        } catch (error: any) {
            debugLog(debugMode, 'error', '[FileWriteTool] Path validation failed:', error);
            return {
                success: false,
                error: `Path validation failed: ${error.message}`
            };
        }

        if (content === undefined || content === null) {
            debugLog(debugMode, 'warn', '[FileWriteTool] Missing content parameter');
            return {
                success: false,
                error: 'content parameter is required'
            };
        }

        try {
            let file = getTFileByPath(this.app, filePath, debugMode);

            if (!file) {
                // File does not exist: create it if allowed
                if (!createIfNotExists) {
                    debugLog(debugMode, 'warn', '[FileWriteTool] File not found and createIfNotExists is false', { filePath });
                    return {
                        success: false,
                        error: `File not found and createIfNotExists is false: ${filePath}`
                    };
                }

                // Ensure parent folders exist if required
                if (createParentFolders) {
                    const parentPath = filePath.substring(0, filePath.lastIndexOf('/'));
                    if (parentPath && !await ensureFolderExists(this.app, parentPath, debugMode)) {
                        return {
                            success: false,
                            error: `Failed to create parent folder(s) for ${filePath}`
                        };
                    }
                } else {
                    // If not creating parent folders, check if parent exists
                    const parentPath = filePath.substring(0, filePath.lastIndexOf('/'));
                    if (parentPath && !getTFileByPath(this.app, parentPath, debugMode)) { // Check if parent is a folder
                        return {
                            success: false,
                            error: `Parent folder does not exist for ${filePath} and createParentFolders is false`
                        };
                    }
                }

                // Create the file
                try {
                    file = await this.app.vault.create(filePath, content);
                    debugLog(debugMode, 'info', '[FileWriteTool] Created file', { filePath });
                    return {
                        success: true,
                        data: {
                            action: 'created',
                            filePath,
                            size: content.length
                        }
                    };
                } catch (createError: any) {
                    debugLog(debugMode, 'error', '[FileWriteTool] Failed to create file', { filePath, createError });
                    return {
                        success: false,
                        error: `Failed to create file: ${createError.message}`
                    };
                }
            }

            // If file exists, ensure it's a TFile
            if (!(file instanceof TFile)) {
                debugLog(debugMode, 'warn', '[FileWriteTool] Path is not a file', { filePath });
                return {
                    success: false,
                    error: `Path is not a file: ${filePath}`
                };
            }

            // Optionally backup the original content
            let originalContent: string | undefined = undefined;
            if (backup) {
                originalContent = await this.app.vault.read(file);
                const shouldBackup = await this.backupManager.shouldCreateBackup(filePath, content);
                if (shouldBackup) {
                    await this.backupManager.createBackup(filePath, originalContent);
                    debugLog(debugMode, 'info', '[FileWriteTool] Created backup', { filePath });
                }
            }

            // If content is unchanged, return early
            if (originalContent === content) {
                debugLog(debugMode, 'info', '[FileWriteTool] Content unchanged, skipping write', { filePath });
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
            try {
                await this.app.vault.modify(file, content);
                debugLog(debugMode, 'info', '[FileWriteTool] Modified file', { filePath });
                return {
                    success: true,
                    data: {
                        action: 'modified',
                        filePath,
                        size: content.length,
                        backupCreated: backup
                    }
                };
            } catch (modifyError: any) {
                debugLog(debugMode, 'error', '[FileWriteTool] Failed to modify file', { filePath, modifyError });
                return {
                    success: false,
                    error: `Failed to write file: ${modifyError.message}`
                };
            }
        } catch (error: any) {
            debugLog(debugMode, 'error', '[FileWriteTool] Unexpected error during file write', { filePath, error });
            return {
                success: false,
                error: `Failed to write file: ${error.message}`
            };
        }
    }
}
