// TOOL DEVELOPMENT GUIDELINES FOR AI ASSISTANT PLUGIN
// ----------------------------------------------------
// To add a new tool for the agent system:
// 1. Create a new file in this folder (e.g., FileExampleTool.ts).
// 2. Implement the Tool interface from '../ToolRegistry':
//    - name: string (unique tool name, e.g., 'file_example')
//    - description: string (short summary for system prompt)
//    - parameters: object (parameter schema for the tool)
//    - execute(params, context): Promise<ToolResult> (main logic)
// 3. Use only instance properties (not static) for name/description/parameters.
// 4. Return ToolResult objects for all outcomes (no thrown errors).
// 5. Import and add your tool to getAllToolClasses() below.
// 6. Add tool metadata to getToolMetadata() for prompt generation.
// 7. Test tool registration and agent access in the plugin UI.
// 
// See FileMoveTool.ts or FileWriteTool.ts for good examples.
// ----------------------------------------------------

// toolcollect.ts
// Centralized static tool loader for all agent tool consumers
import { FileSearchTool } from './FileSearchTool';
import { FileReadTool } from './FileReadTool';
import { FileWriteTool } from './FileWriteTool';
import { FileDiffTool } from './FileDiffTool';
import { FileMoveTool } from './FileMoveTool';
import { ThoughtTool } from './ThoughtTool';
import { FileListTool } from './FileListTool';
import { FileRenameTool } from './FileRenameTool';

export function getAllToolClasses(): any[] {
    // Static list of all available tool classes
    const toolClasses = [
        FileSearchTool,
        FileReadTool,
        FileWriteTool,
        FileDiffTool,
        FileMoveTool,
        ThoughtTool,
        FileListTool,
        FileRenameTool
    ];
    
    console.log('[AI Assistant] getAllToolClasses: Checking tool classes...');
    toolClasses.forEach(tc => {
        // tc.name here refers to the class's actual name (e.g., "FileSearchTool")
        console.log(`[AI Assistant] Tool Class Name: ${tc.name}`); 
    });
    // The map tc => tc.name was for the console.log output, not for functionality.
    // It was intended to show the class names, which is what tc.name provides.
    console.log('[AI Assistant] Loading agent tools (class names):', toolClasses.map(tc => tc.name));
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
            description: 'Move or rename files within the vault. REQUIRED: Use parameter names sourcePath and destinationPath (not path/new_path).',
            parameters: {
                sourcePath: { type: 'string', description: 'Path to the source file (relative to vault root). REQUIRED. Example: "Katy Perry.md"', required: true },
                destinationPath: { type: 'string', description: 'Destination path for the file (relative to vault root). REQUIRED. Example: "popstar/Katy Perry.md"', required: true },
                createFolders: { type: 'boolean', description: 'Whether to create parent folders if they don\'t exist', default: true },
                overwrite: { type: 'boolean', description: 'Whether to overwrite destination if it exists', default: false }
            }
        },        {
            name: 'thought',
            description: 'Record and display a single AI reasoning step or thought process.',
            parameters: {
                thought: { type: 'string', description: 'The main thought or reasoning step to record', required: true },
                reasoning: { type: 'string', description: 'Alias for thought parameter (legacy support)', required: false },
                step: { type: 'number', description: 'Current step number in a multi-step process', required: false },
                totalSteps: { type: 'number', description: 'Total number of steps in the process', required: false },
                category: { type: 'string', enum: ['analysis', 'planning', 'problem-solving', 'reflection', 'conclusion'], description: 'Category of the thought for organization', default: 'analysis' },
                confidence: { type: 'number', description: 'Confidence level in this thought (1-10 scale)', default: 7 }
            }
        },        {
            name: 'file_list',
            description: 'List all files in a specified folder in the vault',
            parameters: {
                path: { type: 'string', description: 'Path to the folder (relative to vault root)', required: true },
                recursive: { type: 'boolean', description: 'Whether to list files recursively', default: false }
            }
        },        {
            name: 'file_rename',
            description: 'Rename a file within the vault (does not move directories)',
            parameters: {
                path: { type: 'string', description: 'Current path to the file (relative to vault root)', required: true },
                newName: { type: 'string', description: 'New name for the file (not a path, just the filename)', required: true },
                overwrite: { type: 'boolean', description: 'Whether to overwrite if a file with the new name exists', default: false }
            }
        }
    ];
}

// Returns a list of all tool action names for dynamic validation
export function getAllToolNames(): string[] {
    return getToolMetadata().map(tool => tool.name);
}

// Create tool instances with proper app context
export function createToolInstances(app: any, plugin?: any): any[] {
    const toolClasses = getAllToolClasses();
    console.log('[AI Assistant] createToolInstances: Instantiating tools...');
    return toolClasses.map(ToolClass => {
        // Pass plugin to tools that need it (like FileWriteTool for BackupManager)
        const instance = plugin && ToolClass.name === 'FileWriteTool' 
            ? new ToolClass(app, plugin.backupManager)
            : new ToolClass(app);
        // instance.name here refers to the 'file_search' style name property of the instance
        console.log(`[AI Assistant] Instantiated Tool instance name: ${instance.name}, from Class: ${ToolClass.name}`);
        return instance;
    });
}
