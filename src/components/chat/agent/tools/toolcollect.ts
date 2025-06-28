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
// 6. Tool metadata is automatically collected via getToolMetadata().
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
    
    return [
        FileSearchTool,
        FileReadTool,
        FileWriteTool,
        FileDiffTool,
        FileMoveTool,
        ThoughtTool,
        FileListTool,
        FileRenameTool
    ];
}

export function getToolMetadata(): Array<{name: string, description: string, parameters: any, parameterDescriptions: Record<string, string>, parameterRequired: Record<string, boolean>}> {
    // Create mock app parameter for tools that require it
    const mockApp = {
        vault: {
            configDir: '',
            adapter: {
                basePath: '/mock/vault/path'
            },
            getAbstractFileByPath: () => null,
            read: () => Promise.resolve(''),
            create: () => Promise.resolve(null),
            modify: () => Promise.resolve()
        }
    };
    
    const metadata = getAllToolClasses().map(ToolClass => {
        let instance;
        try {
            // Try creating instance without parameters first
            instance = new ToolClass();
        } catch (e) {
            try {
                // Try with undefined parameters
                instance = new ToolClass(undefined, undefined);
            } catch (e2) {
                try {
                    // Try with mock app parameter for tools that require it
                    instance = new ToolClass(mockApp);
                } catch (e3) {
                    try {
                        // Try with mock app and backup manager
                        instance = new ToolClass(mockApp, undefined);
                    } catch (e4) {
                        console.warn(`Failed to instantiate tool class ${ToolClass.name} for metadata:`, e4);
                        return undefined;
                    }
                }
            }
        }
        if (!instance || !instance.name || !instance.description || !instance.parameters) {
            console.warn(`Tool instance missing required properties:`, {
                name: instance?.name,
                description: instance?.description,
                parameters: instance?.parameters
            });
            return undefined;
        }
        // Extract parameter descriptions and required status
        let parameterDescriptions: Record<string, string> = {};
        let parameterRequired: Record<string, boolean> = {};
        if (instance.parameters && typeof instance.parameters === 'object') {
            for (const [param, value] of Object.entries(instance.parameters)) {
                if (value && typeof value === 'object') {
                    if ('description' in value) {
                        parameterDescriptions[param] = typeof value.description === 'string' ? value.description : '';
                    }
                    if ('required' in value) {
                        parameterRequired[param] = Boolean(value.required);
                    }
                }
            }
        }
        return {
            name: instance.name,
            description: instance.description,
            parameters: instance.parameters,
            parameterDescriptions,
            parameterRequired
        };
    });
    
    const filteredMetadata = metadata.filter((item): item is {name: string, description: string, parameters: any, parameterDescriptions: Record<string, string>, parameterRequired: Record<string, boolean>} => !!item);
    console.log('[toolcollect] getToolMetadata result:', filteredMetadata.map(m => m.name));
    return filteredMetadata;
}

export function getAllToolNames(): string[] {
    return getToolMetadata().map(tool => tool.name);
}

export function createToolInstances(app: any, plugin?: any): any[] {
    if (plugin && typeof plugin.debugLog === 'function') {
        plugin.debugLog('info', '[toolcollect] createToolInstances called');
    }
    const toolClasses = getAllToolClasses();
    
    const tools = toolClasses.map(ToolClass => {
        
        const instance = plugin && ToolClass.name === 'FileWriteTool' 
            ? new ToolClass(app, plugin.backupManager)
            : new ToolClass(app);
        
        return instance;
    });
    if (plugin && typeof plugin.debugLog === 'function') {
        plugin.debugLog('debug', '[toolcollect] Tool instances created', { count: tools.length });
    }
    return tools;
}
