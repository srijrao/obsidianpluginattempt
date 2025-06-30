

import { App, TFile, TFolder, Vault } from 'obsidian';
import { Tool, ToolResult } from '../ToolRegistry';
import { PathValidator } from './pathValidation';

export interface FileListParams {
    path: string; 
    folderPath?: string; 
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
        
        
        const inputPath = params.path || params.folderPath || (params as any).folder || '';
        const { recursive = false, maxResults = 100 } = params;

        
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
        
        
        if (folderPath === '' || folderPath === '/') {
            folder = vault.getRoot();
        } else {
            folder = vault.getAbstractFileByPath(folderPath);
            
            if (!folder) {
                const allFolders = vault.getAllLoadedFiles().filter(f => f instanceof TFolder);
                const match = allFolders.find(f => f.path.toLowerCase() === folderPath.toLowerCase());
                if (match) folder = match;
            }
        }
        
        if (!folder || !(folder instanceof TFolder)) {
            return {
                success: false,
                error: 'Folder not found: ' + (folderPath || '(root)')
            };
        }

        const itemsList: string[] = [];
        let totalItems = 0;
        
        const walk = (currentFolder: TFolder, indent: string = '', remainingLimit: number = maxResults) => {
            
            if (totalItems >= maxResults || remainingLimit <= 0) {
                return;
            }
            
            
            const files = currentFolder.children.filter(child => child instanceof TFile);
            const folders = currentFolder.children.filter(child => child instanceof TFolder);
            
            
            const folderCount = recursive ? folders.length : 0;
            const fileSlots = Math.max(1, Math.floor(remainingLimit / Math.max(1, folderCount + 1)));
            
            
            let filesAdded = 0;
            for (const file of files) {
                if (totalItems >= maxResults || filesAdded >= fileSlots) {
                    break;
                }
                itemsList.push(`${indent}📄${file.name}`);
                totalItems++;
                filesAdded++;
            }
            
            
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
