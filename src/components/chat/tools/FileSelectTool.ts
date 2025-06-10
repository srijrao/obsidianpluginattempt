import { App, TFile } from 'obsidian';
import { Tool, ToolResult } from '../ToolRegistry';
import { searchFiles } from '../../FileChooserModal';

export interface FileSelectParams {
    query?: string;
    filterType?: 'markdown' | 'image' | 'all';
    maxResults?: number;
}

export class FileSelectTool implements Tool {
    name = 'file_select';
    description = 'Search and select files from the vault programmatically';
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

    async execute(params: FileSelectParams, context: any): Promise<ToolResult> {
        const { query = '', filterType = 'markdown', maxResults = 10 } = params;

        try {
            // Use searchFiles to find matching files programmatically
            const searchResult = searchFiles(this.app, query, {
                maxResults,
                markdownOnly: filterType === 'markdown'
            });

            // Parse the search result to extract file paths
            if (searchResult.startsWith('No files found')) {
                return {
                    success: false,
                    error: `No files found matching query: "${query}"`
                };
            }

            // Extract file paths from the search result
            const filePaths = searchResult.split('\n')
                .filter(line => line.startsWith('- '))
                .map(line => line.substring(2));

            if (filePaths.length === 0) {
                return {
                    success: false,
                    error: `No files found matching query: "${query}"`
                };
            }

            // Get file objects for the found paths
            const files = filePaths.map(path => {
                const file = this.app.vault.getAbstractFileByPath(path);
                if (file instanceof TFile) {
                    return {
                        path: file.path,
                        name: file.name,
                        basename: file.basename,
                        extension: file.extension,
                        size: file.stat?.size || 0,
                        created: file.stat?.ctime || 0,
                        modified: file.stat?.mtime || 0
                    };
                }
                return null;
            }).filter(file => file !== null);

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
