

import { App, TFile, TFolder, Vault } from 'obsidian';
import { Tool, ToolResult } from '../ToolRegistry';
import { PathValidator } from './pathValidation';
import { isTFile, isTFolder } from '../../../../utils/typeguards';

export interface VaultTreeParams {
    path?: string; 
    maxDepth?: number; 
    maxItems?: number; 
    showFolders?: boolean; 
}

export class VaultTreeTool implements Tool {
    name = 'vault_tree';
    description = 'Generates a hierarchical tree view of the vault structure, showing only folders and their organization in a visual tree format. Perfect for understanding the overall vault organization.';
    parameters = {
        path: { type: 'string', description: 'Starting path for the tree (defaults to vault root)', required: false },
        maxDepth: { type: 'number', description: 'Maximum depth to traverse', default: 10 },
        maxItems: { type: 'number', description: 'Maximum total items to include', default: 200 },
        showFolders: { type: 'boolean', description: 'Whether to include folders in the tree', default: true }
    };

    private pathValidator: PathValidator;

    constructor(private app: App) {
        this.pathValidator = new PathValidator(app);
    }

    async execute(params: VaultTreeParams, context: any): Promise<ToolResult> {
        const {
            path = '',
            maxDepth = 10,
            maxItems = 200,
            showFolders = true
        } = params;

        
        let startPath: string;
        try {
            startPath = this.pathValidator.validateAndNormalizePath(path);
        } catch (error: any) {
            return {
                success: false,
                error: `Path validation failed: ${error.message}`
            };
        }

        const vault: Vault = this.app.vault;
        let startFolder;

        
        if (startPath === '' || startPath === '/') {
            startFolder = vault.getRoot();
        } else {
            startFolder = vault.getAbstractFileByPath(startPath);
        }

        if (!startFolder || !(startFolder instanceof TFolder)) {
            return {
                success: false,
                error: 'Folder not found: ' + (startPath || '(root)')
            };
        }

        const treeLines: string[] = [];
        let totalItems = 0;
        let truncated = false;

        const buildTree = (
            folder: TFolder,
            prefix: string = '',
            depth: number = 0
        ): void => {
            
            if (depth > maxDepth || totalItems >= maxItems) {
                if (totalItems >= maxItems) {
                    truncated = true;
                }
                return;
            }

            
            if (depth > 0 && showFolders) {
                const itemCount = folder.children.length;
                treeLines.push(`${prefix}📁${folder.name}/(${itemCount} items)`);
                totalItems++;
                if (totalItems >= maxItems) {
                    truncated = true;
                    return;
                }
            }

            
            const children = [...folder.children];
            children.sort((a, b) => {
                
                if (isTFolder(a) && isTFile(b)) return -1;
                if (isTFile(a) && isTFolder(b)) return 1;
                if (isTFile(a) && isTFile(b)) return 1;
                if (!isTFile(a) && isTFile(b)) return -1;
                
                return a.name.localeCompare(b.name);
            });

            
            const filteredChildren = children.filter(child => {
                if (isTFolder(child)) return showFolders;
                return false;
            });

            
            filteredChildren.forEach((child, index) => {
                if (totalItems >= maxItems) {
                    truncated = true;
                    return;
                }

                const newPrefix = depth > 0 
                    ? prefix + '  '
                    : '';

                if (isTFile(child)) {
                    
                } else if (isTFolder(child)) {
                    buildTree(child, newPrefix, depth + 1);
                }
            });
        };

        try {
            
            if (startPath === '' || startPath === '/') {
                const rootItemCount = startFolder.children.length;
                treeLines.push(`📁Vault Root/(${rootItemCount} items)`);
                totalItems++;
            }
            
            buildTree(startFolder, '', startPath === '' || startPath === '/' ? 0 : -1);

            const tree = treeLines.join(',\n');
            const stats = {
                totalItems,
                maxDepth,
                maxItems,
                truncated,
                startPath: startPath || '/',
                showFolders
            };

            return {
                success: true,
                data: {
                    tree,
                    stats,
                    
                    items: tree,
                    count: totalItems,
                    path: startPath || '/'
                }
            };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }

    private getFileIcon(extension: string): string {
        const iconMap: Record<string, string> = {
            'md': '📝',
            'txt': '📄',
            'pdf': '📕',
            'doc': '📘',
            'docx': '📘',
            'xls': '📊',
            'xlsx': '📊',
            'ppt': '📊',
            'pptx': '📊',
            'png': '🖼️',
            'jpg': '🖼️',
            'jpeg': '🖼️',
            'gif': '🖼️',
            'svg': '🖼️',
            'mp3': '🎵',
            'wav': '🎵',
            'mp4': '🎬',
            'avi': '🎬',
            'zip': '📦',
            'rar': '📦',
            'json': '⚙️',
            'yaml': '⚙️',
            'yml': '⚙️',
            'css': '🎨',
            'js': '⚡',
            'ts': '⚡',
            'html': '🌐',
            'xml': '🌐'
        };
        
        return iconMap[extension.toLowerCase()] || '📄';
    }
}
