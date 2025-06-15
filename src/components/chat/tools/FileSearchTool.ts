import { App, TFile } from 'obsidian';
import { Tool, ToolResult } from '../ToolRegistry';

export interface FileSearchParams {
    query?: string;
    filterType?: 'markdown' | 'image' | 'all';
    maxResults?: number;
}

export class FileSearchTool implements Tool {
    name = 'file_search';
    description = 'Search for files in the vault by name or path';
    parameters = {
        query: {
            type: 'string',
            description: 'Search query to find files (searches filename and path)',
            required: false
        },
        filterType: {
            type: 'string',
            enum: ['markdown', 'image', 'all'],
            description: 'Type of files to show',
            default: 'markdown'
        },
        maxResults: {
            type: 'number',
            description: 'Maximum number of results to return',
            default: 10
        }
    };

    constructor(private app: App) {}

    async execute(params: FileSearchParams, context: any): Promise<ToolResult> {
        const { query = '', filterType = 'markdown', maxResults = 10 } = params;

        try {
            // Get all files based on filter type
            const allFiles = filterType === 'markdown' ? 
                this.app.vault.getMarkdownFiles() : 
                filterType === 'image' ? 
                    this.app.vault.getFiles().filter(f => ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'].includes(f.extension?.toLowerCase())) :
                    this.app.vault.getFiles();

            let matchingFiles = allFiles;

            // If query is provided, filter files efficiently
            if (query.trim()) {
                const normalizedQuery = query.toLowerCase();
                const queryWords = normalizedQuery.split(/\s+/).filter(word => word.length > 0);
                
                matchingFiles = [];
                
                // First pass: look for exact matches (most efficient)
                for (const file of allFiles) {
                    const searchText = `${file.path} ${file.basename}`.toLowerCase();
                    const searchTextNormalized = searchText.replace(/_/g, ' ');
                    
                    // Check if all query words are present
                    if (queryWords.every(word => 
                        searchText.includes(word) || searchTextNormalized.includes(word)
                    )) {
                        matchingFiles.push(file);
                        
                        // Early termination if we have enough results
                        if (matchingFiles.length >= maxResults) {
                            break;
                        }
                    }
                }
            }

            if (matchingFiles.length === 0) {
                return {
                    success: false,
                    error: `No files found matching query: "${query}"`
                };
            }

            // Limit results and sort by modification time (most recent first)
            const limitedFiles = matchingFiles
                .sort((a, b) => (b.stat?.mtime || 0) - (a.stat?.mtime || 0))
                .slice(0, maxResults);

            // Get file objects with metadata
            const files = limitedFiles.map(file => ({
                path: file.path,
                name: file.name,
                basename: file.basename,
                extension: file.extension,
                size: file.stat?.size || 0,
                created: file.stat?.ctime || 0,
                modified: file.stat?.mtime || 0
            }));

            return {
                success: true,
                data: {
                    files,
                    count: files.length,
                    query: query || 'all files'
                }
            };
        } catch (error: any) {
            return {
                success: false,
                error: `Failed to search files: ${error.message}`
            };
        }
    }

    private getFileFilter(filterType: string): (file: any) => boolean {
        switch (filterType) {
            case 'markdown':
                return (file) => file.extension === 'md';
            case 'image':
                return (file) => ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'].includes(file.extension?.toLowerCase());
            case 'all':
            default:
                return () => true;
        }
    }
}
