import { App, TFile, TFolder, Vault } from 'obsidian';
import { Tool, ToolResult } from '../ToolRegistry';
import { PathValidator } from './pathValidation';
import { getTFolderByPath } from '../../../utils/fileUtils'; // Import the new utility

/**
 * Parameters for listing files/folders.
 */
export interface FileListParams {
    path: string;              // Path to the folder to list (can be empty for root)
    folderPath?: string;       // Alternate/legacy folder path parameter
    recursive?: boolean;       // Whether to list recursively
    maxResults?: number;       // Maximum number of results to return
}

/**
 * Tool for listing files and folders in a directory.
 * Supports recursive traversal and result limiting.
 */
export class FileListTool implements Tool {
    name = 'file_list';
    description = 'Lists files and folders in a directory with optional recursive traversal.';
    parameters = {
        path: { type: 'string', description: 'Path to the folder.', required: false },
        recursive: { type: 'boolean', description: 'List files recursively.', default: false },
        maxResults: { type: 'number', description: 'Maximum number of results to return.', default: 100 }
    };

    private pathValidator: PathValidator;

    constructor(private app: App) {
        this.pathValidator = new PathValidator(app);
    }

    /**
     * Executes the file listing operation.
     * @param params FileListParams
     * @param context Execution context (unused)
     * @returns ToolResult with the list of files/folders or error
     */
    async execute(params: FileListParams, context: any): Promise<ToolResult> {
        const debugMode = context?.plugin?.settings?.debugMode ?? true;

        // Determine the input path (supporting legacy/alternate keys)
        const inputPath = params.path || params.folderPath || (params as any).folder || '';
        const { recursive = false, maxResults = 100 } = params;

        // Validate and normalize the folder path
        let folderPath: string;
        try {
            folderPath = this.pathValidator.validateAndNormalizePath(inputPath);
        } catch (error: any) {
            return {
                success: false,
                error: `Path validation failed: ${error.message}`
            };
        }

        const vault: Vault = this.app.vault;
        let folder: TFolder | undefined;

        // Use the new utility function to get the folder
        folder = getTFolderByPath(this.app, folderPath, debugMode);

        // If folder not found or not a TFolder, return error
        if (!folder) {
            return {
                success: false,
                error: 'Folder not found: ' + (folderPath || '(root)')
            };
        }

        const itemsList: string[] = [];
        let totalItems = 0;

        /**
         * Recursively walks the folder tree, collecting file/folder names.
         * @param currentFolder The folder to walk
         * @param indent Indentation for pretty-printing
         * @param remainingLimit Remaining slots for results
         */
        const walk = (currentFolder: TFolder, indent: string = '', remainingLimit: number = maxResults) => {
            if (totalItems >= maxResults || remainingLimit <= 0) {
                return;
            }

            // Separate files and folders
            const files = currentFolder.children.filter(child => child instanceof TFile);
            const folders = currentFolder.children.filter(child => child instanceof TFolder);

            // Calculate how many slots to allocate to files/folders
            const folderCount = recursive ? folders.length : 0;
            const fileSlots = Math.max(1, Math.floor(remainingLimit / Math.max(1, folderCount + 1)));

            // Add files up to the allowed slots
            let filesAdded = 0;
            for (const file of files) {
                if (totalItems >= maxResults || filesAdded >= fileSlots) {
                    break;
                }
                itemsList.push(`${indent}📄${file.name}`);
                totalItems++;
                filesAdded++;
            }

            // Handle folders
            if (recursive && folderCount > 0) {
                const remainingAfterFiles = remainingLimit - filesAdded;
                const perFolderLimit = Math.max(1, Math.floor(remainingAfterFiles / folderCount));
                for (const subfolder of folders) {
                    if (totalItems >= maxResults) {
                        break;
                    }
                    itemsList.push(`${indent}📁${subfolder.name}/(`);
                    totalItems++;
                    walk(subfolder as TFolder, indent + '  ', perFolderLimit);
                    if (totalItems < maxResults) {
                        itemsList.push(`${indent})`);
                    }
                }
            } else {
                // Non-recursive: just list folder names
                for (const subfolder of folders) {
                    if (totalItems >= maxResults) {
                        break;
                    }
                    itemsList.push(`${indent}📁${subfolder.name}/(`);
                    totalItems++;
                    itemsList.push(`${indent})`);
                }
            }
        };

        try {
            walk(folder);
            const truncated = totalItems >= maxResults;
            const listing = itemsList.join(',\n');
            return {
                success: true,
                data: { 
                    items: listing,
                    count: totalItems, 
                    path: folderPath, 
                    recursive,
                    maxResults,
                    truncated
                }
            };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }
}
