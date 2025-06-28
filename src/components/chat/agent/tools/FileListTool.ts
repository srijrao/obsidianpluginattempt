// FileListTool.ts
// Tool for listing files in a specified folder in the vault
import { App, TFile, TFolder, Vault } from 'obsidian';
import { Tool, ToolResult } from '../ToolRegistry';
import { PathValidator } from './pathValidation';

export interface FileListParams {
    path: string; // Path to the folder
    folderPath?: string; // Alias for path for backward compatibility
    recursive?: boolean;
    maxResults?: number;
}

export class FileListTool implements Tool {
    name = 'file_list';
    description = 'Retrieves a comprehensive list of files and folders within a specified directory, offering options for recursive traversal. This tool is crucial for understanding project structure and navigating the file system.';
    parameters = {
        path: { type: 'string', description: 'Path to the folder.', required: false },
        recursive: { type: 'boolean', description: 'List files recursively.', default: false },
        maxResults: { type: 'number', description: 'Maximum number of results to return.', default: 100 }
    };

    private pathValidator: PathValidator;

    constructor(private app: App) {
        this.pathValidator = new PathValidator(app);
    }

    async execute(params: FileListParams, context: any): Promise<ToolResult> {
        // Normalize parameter names for backward compatibility - include 'folder' which AI often sends
        // Default to root if no path is provided
        const inputPath = params.path || params.folderPath || (params as any).folder || '';
        const { recursive = false, maxResults = 100 } = params;

        // Validate and normalize the path to ensure it's within the vault
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
        let folder;
        
        // Handle root folder case
        if (folderPath === '' || folderPath === '/') {
            folder = vault.getRoot();
        } else {
            folder = vault.getAbstractFileByPath(folderPath);
        }
        
        if (!folder || !(folder instanceof TFolder)) {
            return {
                success: false,
                error: 'Folder not found: ' + (folderPath || '(root)')
            };
        }

        const itemsList: string[] = [];
        let totalItems = 0;
        
        const walk = (currentFolder: TFolder, indent: string = '') => {
            // Check if we've reached the limit
            if (totalItems >= maxResults) {
                return;
            }
            
            for (const child of currentFolder.children) {
                // Check limit before adding each item
                if (totalItems >= maxResults) {
                    break;
                }
                
                if (child instanceof TFile) {
                    itemsList.push(`${indent}📄${child.name}`);
                    totalItems++;
                } else if (child instanceof TFolder) {
                    itemsList.push(`${indent}📁${child.name}/(`);
                    totalItems++;
                    
                    if (recursive) {
                        walk(child, indent + '  ');
                        if (totalItems < maxResults) {
                            itemsList.push(`${indent})`);
                        }
                    } else {
                        itemsList.push(`${indent})`);
                    }
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
