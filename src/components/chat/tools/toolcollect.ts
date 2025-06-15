// toolcollect.ts
// Centralized static tool loader for all agent tool consumers
import { FileSearchTool } from './FileSearchTool';
import { FileReadTool } from './FileReadTool';
import { FileWriteTool } from './FileWriteTool';
import { FileDiffTool } from './FileDiffTool';
import { FileMoveTool } from './FileMoveTool';
import { ThoughtTool } from './ThoughtTool';
import { FileListTool } from './FileListTool';

export function getAllToolClasses(): any[] {
    // Static list of all available tool classes
    const toolClasses = [
        FileSearchTool,
        FileReadTool,
        FileWriteTool,
        FileDiffTool,
        FileMoveTool,
        ThoughtTool,
        FileListTool
    ];
    
    console.log('[AI Assistant] Loading agent tools:', toolClasses.map(tc => tc.name));
    return toolClasses;
}

// Static tool metadata for system prompt generation (without needing to instantiate)
export function getToolMetadata(): Array<{name: string, description: string, parameters: any}> {
    return [
        {
            name: 'file_search',
            description: 'Search for files in the vault by name or path',
            parameters: {
                query: { type: 'string', description: 'Search query to find files (searches filename and path)', required: false },
                filterType: { type: 'string', enum: ['markdown', 'image', 'all'], description: 'Type of files to show', default: 'markdown' },
                maxResults: { type: 'number', description: 'Maximum number of results to return', default: 10 }
            }
        },        {
            name: 'file_read',
            description: 'Read file contents from the vault',
            parameters: {
                path: { type: 'string', description: 'Path to the file to read (relative to vault root)', required: true },
                maxSize: { type: 'number', description: 'Maximum file size in bytes (default 1MB)', default: 1024 * 1024 }
            }
        },        {
            name: 'file_write',
            description: 'Write or create files in the vault',
            parameters: {
                path: { type: 'string', description: 'Path where to write the file (relative to vault root)', required: true },
                content: { type: 'string', description: 'Content to write to the file', required: true },
                createIfNotExists: { type: 'boolean', description: 'Whether to create the file if it does not exist', default: true },
                backup: { type: 'boolean', description: 'Whether to create a backup before modifying existing files', default: true }
            }
        },        {
            name: 'file_diff',
            description: 'Compare and suggest changes to files',
            parameters: {
                path: { type: 'string', description: 'Path to the file to compare/modify (relative to vault root)', required: true },
                originalContent: { type: 'string', description: 'Original content for comparison (if not provided, reads from file)', required: false },
                suggestedContent: { type: 'string', description: 'Suggested new content for the file', required: true },
                action: { type: 'string', enum: ['compare', 'apply', 'suggest'], description: 'Action to perform: compare files, apply changes, or show suggestion UI', required: false },
                insertPosition: { type: 'number', description: 'Position to insert suggestion (optional)', required: false }
            }
        },
        {
            name: 'file_move',
            description: 'Move or rename files within the vault',
            parameters: {
                sourcePath: { type: 'string', description: 'Path to the source file (relative to vault root)', required: true },
                destinationPath: { type: 'string', description: 'Destination path for the file (relative to vault root)', required: true },
                createFolders: { type: 'boolean', description: 'Whether to create parent folders if they don\'t exist', default: true },
                overwrite: { type: 'boolean', description: 'Whether to overwrite destination if it exists', default: false }
            }
        },        {
            name: 'thought',
            description: 'Internal reasoning and planning tool - provide either "thought" or "reasoning" parameter',
            parameters: {
                thought: { type: 'string', description: 'The reasoning or thought process', required: false },
                reasoning: { type: 'string', description: 'Alias for thought parameter (legacy support)', required: false },
                step: { type: 'number', description: 'Current step number in the thought process', required: false },
                totalSteps: { type: 'number', description: 'Total expected steps in the thought process', required: false },
                category: { type: 'string', enum: ['analysis', 'planning', 'problem-solving', 'reflection', 'conclusion', 'reasoning'], description: 'Category of thought for better organization', default: 'analysis' },
                confidence: { type: 'number', description: 'Confidence level (1-10 scale)', required: false },
                enableStructuredReasoning: { type: 'boolean', description: 'Enable structured multi-step reasoning', required: false },
                reasoningDepth: { type: 'string', enum: ['shallow', 'medium', 'deep'], description: 'Depth of reasoning: shallow, medium, or deep', required: false }
            }
        },        {
            name: 'file_list',
            description: 'List all files in a specified folder in the vault',
            parameters: {
                path: { type: 'string', description: 'Path to the folder (relative to vault root)', required: true },
                recursive: { type: 'boolean', description: 'Whether to list files recursively', default: false }
            }
        }
    ];
}

// Create tool instances with proper app context
export function createToolInstances(app: any): any[] {
    const toolClasses = getAllToolClasses();
    return toolClasses.map(ToolClass => new ToolClass(app));
}
