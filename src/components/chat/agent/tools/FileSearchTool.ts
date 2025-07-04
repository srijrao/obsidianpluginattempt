import { App, TFile } from 'obsidian';
import { Tool, ToolResult } from '../ToolRegistry';

/**
 * Parameters for searching files in the vault.
 */
export interface FileSearchParams {
    query?: string; // Search query string (optional)
    filterType?: 'markdown' | 'image' | 'all'; // Type of files to filter (optional)
    maxResults?: number; // Maximum number of results to return (optional)
    searchContent?: boolean; // Whether to search within file contents (optional)
}

/**
 * Tool for searching files in the vault by query and file type.
 * Supports filtering by markdown, image, or all files, and result limiting.
 */
export class FileSearchTool implements Tool {
    name = 'file_search';
    description = 'Searches for files within the vault based on a query and specified file types, returning a limited number of results. This tool is useful for quickly locating relevant documents and assets.';
    parameters = {
        query: {
            type: 'string',
            description: 'Search query for files.',
            required: false
        },
        filterType: {
            type: 'string',
            enum: ['markdown', 'image', 'all'],
            description: 'Type of files to include.',
            default: 'markdown'
        },
        maxResults: {
            type: 'number',
            description: 'Maximum number of results.',
            default: 10
        },
        searchContent: {
            type: 'boolean',
            description: 'Whether to search within file contents. Defaults to false.',
            required: false
        }
    };

    constructor(private app: App) {}

    /**
     * Executes the file search operation.
     * Filters files by type, applies the search query, and returns results.
     * @param params FileSearchParams
     * @param context Execution context (unused)
     * @returns ToolResult with matching files or error
     */
    async execute(params: FileSearchParams, context: any): Promise<ToolResult> {
        const { query = '', filterType = 'markdown', maxResults = 10, searchContent = false } = params;

        try {
            // Get all files based on filterType
            const allFiles = filterType === 'markdown' ? 
                this.app.vault.getMarkdownFiles() : 
                filterType === 'image' ? 
                    this.app.vault.getFiles().filter(f => ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'].includes(f.extension?.toLowerCase())) :
                    this.app.vault.getFiles();

            let matchingFiles: TFile[] = [];

            // If a query is provided, filter files by query
            if (query.trim()) {
                const normalizedQuery = query.toLowerCase();
                const queryWords = normalizedQuery.split(/\s+/).filter(word => word.length > 0);

                for (const file of allFiles) {
                    let contentMatch = true;
                    if (searchContent && file.extension === 'md') { // Only search content for markdown files
                        const fileContent = await this.app.vault.read(file);
                        contentMatch = queryWords.every(word => fileContent.toLowerCase().includes(word));
                    }

                    const searchText = `${file.path} ${file.basename}`.toLowerCase();
                    const searchTextNormalized = searchText.replace(/_/g, ' ');
                    // Match if all query words are present in path or basename
                    if ((queryWords.every(word => searchText.includes(word) || searchTextNormalized.includes(word))) || contentMatch) {
                        matchingFiles.push(file);
                        if (matchingFiles.length >= maxResults) break;
                    }
                }
            } else {
                // No query: just take the first maxResults files
                matchingFiles = allFiles.slice(0, maxResults);
            }

            if (matchingFiles.length === 0) {
                return {
                    success: false,
                    error: `No files found matching query: "${query}"`
                };
            }

            // Sort by modified time (descending) and limit results
            const limitedFiles = matchingFiles
                .sort((a, b) => (b.stat?.mtime || 0) - (a.stat?.mtime || 0))
                .slice(0, maxResults);

            // Map file objects to a simple structure for output
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

    /**
     * Returns a filter function for files based on filterType.
     * Not used in main logic, but available for extension.
     * @param filterType The type of files to filter
     * @returns A function that returns true if the file matches the filter
     */
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
