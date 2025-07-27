// Import necessary types from Obsidian API
import { App, TFile } from 'obsidian';
// Import base Tool and ToolResult types for plugin tool integration
import { Tool, ToolResult } from '../ToolRegistry';

/**
 * Interface for the parameters you can pass to the file search tool.
 * - query: The search string or regex to look for in file names or content.
 * - filterType: What kind of files to search (markdown, image, or all).
 * - maxResults: The maximum number of results to return.
 * - searchContent: Whether to search inside the file contents (only for markdown files).
 * - useRegex: If true, treat the query as a regular expression (advanced).
 */
export interface FileSearchParams {
    query?: string;
    filterType?: 'markdown' | 'image' | 'all';
    maxResults?: number;
    searchContent?: boolean;
    useRegex?: boolean; // If true, treat query as regex
}

/**
 * FileSearchTool is a plugin tool for searching files in your Obsidian vault.
 * It lets you search by file name, file type, and even inside markdown file contents.
 *
 * Example usage:
 *   - Find all notes with "meeting" in the name
 *   - Find all images
 *   - Find notes containing a specific word in their text
 */
export class FileSearchTool implements Tool {
    // Name of the tool (used for referencing in the plugin system)
    name = 'file_search';
    // Description of what this tool does
    description = 'Searches files by name and type, with optional content search for markdown files.';
    // Parameters that can be passed to this tool
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
        },
        useRegex: {
            type: 'boolean',
            description: 'If true, treat the query as a regular expression.',
            required: false
        }
    };

    /**
     * The constructor takes the Obsidian app instance so we can access the vault.
     * @param app The main Obsidian app object
     */
    constructor(private app: App) {}

    /**
     * Main function to execute the file search.
     * @param params The search parameters (query, filterType, etc)
     * @param context (Unused, but required by Tool interface)
     * @returns ToolResult with matching files or an error message
     */
    async execute(params: FileSearchParams, context: any): Promise<ToolResult> {
        // Destructure parameters, set defaults if not provided
        const { query = '', filterType = 'markdown', maxResults = 10, searchContent = false, useRegex = false } = params;

        try {
            // Get all files from the vault, filtered by type
            // - markdown: only .md files
            // - image: only image files (png, jpg, etc)
            // - all: every file in the vault
            const allFiles = filterType === 'markdown' ? 
                this.app.vault.getMarkdownFiles() : 
                filterType === 'image' ? 
                    this.app.vault.getFiles().filter(f => ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'].includes(f.extension?.toLowerCase())) :
                    this.app.vault.getFiles();

            // This array will hold files that match the search
            let matchingFiles: TFile[] = [];

            // If a search query is provided, filter files by the query
            if (query.trim()) {
                // If useRegex is true, compile the regex (case-insensitive)
                let regex: RegExp | null = null;
                if (useRegex) {
                    try {
                        regex = new RegExp(query, 'i');
                    } catch (e) {
                        return {
                            success: false,
                            error: `Invalid regular expression: ${e.message}`
                        };
                    }
                }

                // If not using regex, prepare for word-based search
                const normalizedQuery = query.toLowerCase();
                const queryWords = useRegex ? [] : normalizedQuery.split(/\s+/).filter(word => word.length > 0);

                // Loop through all files and check if they match the query
                for (const file of allFiles) {
                    let contentMatch = false;
                    // If searchContent is true and the file is markdown, check inside the file's text
                    if (searchContent && file.extension === 'md') {
                        const fileContent = await this.app.vault.read(file);
                        if (useRegex && regex) {
                            // Regex match in content
                            contentMatch = regex.test(fileContent);
                        } else {
                            // Only match if ALL query words are found in the content
                            contentMatch = queryWords.every(word => fileContent.toLowerCase().includes(word));
                        }
                    }

                    // Build a string with the file's path and base name for searching
                    const searchText = `${file.path} ${file.basename}`.toLowerCase();
                    // Also normalize underscores to spaces for more flexible matching
                    const searchTextNormalized = searchText.replace(/_/g, ' ');
                    let pathAndNameMatch = false;
                    if (useRegex && regex) {
                        // Regex match in path or name
                        pathAndNameMatch = regex.test(file.path) || regex.test(file.basename);
                    } else {
                        // Check if ALL query words are in the path or name
                        pathAndNameMatch = queryWords.every(word => searchText.includes(word) || searchTextNormalized.includes(word));
                    }

                    // If the file matches by name/path or by content, add it to the results
                    if (pathAndNameMatch || contentMatch) {
                        matchingFiles.push(file);
                        // Stop if we've reached the max number of results
                        if (matchingFiles.length >= maxResults) break;
                    }
                }
            } else {
                // If no query, just return the first maxResults files
                matchingFiles = allFiles.slice(0, maxResults);
            }

            // If no files matched, return an error
            if (matchingFiles.length === 0) {
                return {
                    success: false,
                    error: `No files found matching query: "${query}"`
                };
            }

            // Sort the results by last modified time (most recent first) and limit to maxResults
            const limitedFiles = matchingFiles
                .sort((a, b) => (b.stat?.mtime || 0) - (a.stat?.mtime || 0))
                .slice(0, maxResults);

            // Map the file objects to a simpler structure for output
            const files = limitedFiles.map(file => ({
                path: file.path,           // Full path in the vault
                name: file.name,           // File name with extension
                basename: file.basename,   // File name without extension
                extension: file.extension, // File extension (e.g. 'md')
                size: file.stat?.size || 0,      // File size in bytes
                created: file.stat?.ctime || 0,  // Creation time (timestamp)
                modified: file.stat?.mtime || 0  // Last modified time (timestamp)
            }));

            // Return the results as a ToolResult object
            return {
                success: true,
                data: {
                    files,
                    count: files.length,
                    query: query || 'all files'
                }
            };
        } catch (error: any) {
            // If something goes wrong, return an error message
            return {
                success: false,
                error: `Failed to search files: ${error.message}`
            };
        }
    }

    /**
     * (Advanced) Returns a filter function for files based on filterType.
     * Not used in the main logic, but can be used for custom filtering.
     * @param filterType The type of files to filter ('markdown', 'image', 'all')
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
