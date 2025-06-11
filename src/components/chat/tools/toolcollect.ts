// toolcollect.ts
// Centralized static tool loader for all agent tool consumers
import { FileSelectTool } from './FileSelectTool';
import { FileReadTool } from './FileReadTool';
import { FileWriteTool } from './FileWriteTool';
import { FileDiffTool } from './FileDiffTool';
import { ThoughtTool } from './ThoughtTool';

export function getAllToolClasses(): any[] {
    // Static list of all available tool classes
    const toolClasses = [
        FileSelectTool,
        FileReadTool,
        FileWriteTool,
        FileDiffTool,
        ThoughtTool
    ];
    
    console.log('[AI Assistant] Loading agent tools:', toolClasses.map(tc => tc.name));
    return toolClasses;
}

// Static tool metadata for system prompt generation (without needing to instantiate)
export function getToolMetadata(): Array<{name: string, description: string, parameters: any}> {
    return [
        {
            name: 'file_select',
            description: 'Search and select files in the vault',
            parameters: {
                searchQuery: { type: 'string', description: 'Search query to find files', required: true },
                fileType: { type: 'string', description: 'Filter by file extension (optional)' },
                maxResults: { type: 'number', description: 'Maximum number of results to return (default 10)' }
            }
        },
        {
            name: 'file_read',
            description: 'Read file contents from the vault',
            parameters: {
                filePath: { type: 'string', description: 'Path to the file to read (relative to vault root)', required: true },
                maxSize: { type: 'number', description: 'Maximum file size in bytes (default 1MB)' }
            }
        },
        {
            name: 'file_write',
            description: 'Write or create files in the vault',
            parameters: {
                filePath: { type: 'string', description: 'Path where to write the file (relative to vault root)', required: true },
                content: { type: 'string', description: 'Content to write to the file', required: true },
                createDirs: { type: 'boolean', description: 'Create directories if they don\'t exist (default true)' }
            }
        },
        {
            name: 'file_diff',
            description: 'Show differences between file versions or compare content',
            parameters: {
                filePath: { type: 'string', description: 'Path to the file to analyze', required: true },
                compareWith: { type: 'string', description: 'Content to compare against (optional)' }
            }
        },
        {
            name: 'thought',
            description: 'Internal reasoning and planning tool',
            parameters: {
                thought: { type: 'string', description: 'The reasoning or thought process', required: true },
                enableStructuredReasoning: { type: 'boolean', description: 'Enable structured multi-step reasoning' },
                reasoningDepth: { type: 'string', description: 'Depth of reasoning: shallow, medium, or deep' },
                category: { type: 'string', description: 'Category of thought: planning, analysis, reflection, etc.' }
            }
        }
    ];
}

// Create tool instances with proper app context
export function createToolInstances(app: any): any[] {
    const toolClasses = getAllToolClasses();
    return toolClasses.map(ToolClass => new ToolClass(app));
}
