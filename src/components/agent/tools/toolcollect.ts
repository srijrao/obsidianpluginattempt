import { FileSearchTool } from './FileSearchTool';
import { FileReadTool } from './FileReadTool';
import { FileWriteTool } from './FileWriteTool';
import { FileDiffTool } from './FileDiffTool';
import { FileMoveTool } from './FileMoveTool';
import { ThoughtTool } from './ThoughtTool';
import { FileListTool } from './FileListTool';
import { FileDeleteTool } from './FileDeleteTool';
import { GetUserFeedbackTool } from './GetUserFeedback';

/**
 * Returns an array of all tool classes.
 * Used for dynamic instantiation and metadata extraction.
 */
export function getAllToolClasses(): any[] {
    // List all tool classes here
    return [
        FileSearchTool,
        FileReadTool,
        FileWriteTool,
        FileDiffTool,
        FileMoveTool,
        ThoughtTool,
        FileListTool,
        FileDeleteTool,
        GetUserFeedbackTool
    ];
}

/**
 * Returns metadata for all tools, including name, description, parameters,
 * parameter descriptions, and which parameters are required.
 * Used for documentation, UI, and validation.
 */
export function getToolMetadata(): Array<{
    name: string,
    description: string,
    parameters: any,
    parameterDescriptions: Record<string, string>,
    parameterRequired: Record<string, boolean>
}> {
    // Mock app for instantiating tools that require an app instance
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

    // Try to instantiate each tool class and extract metadata
    const metadata = getAllToolClasses().map(ToolClass => {
        let instance;
        try {
            // Try no-arg constructor
            instance = new ToolClass();
        } catch (e) {
            try {
                // Try with undefineds
                instance = new ToolClass(undefined, undefined);
            } catch (e2) {
                try {
                    // Try with mock app
                    instance = new ToolClass(mockApp);
                } catch (e3) {
                    try {
                        // Try with mock app and undefined
                        instance = new ToolClass(mockApp, undefined);
                    } catch (e4) {
                        // If all fail, log and skip
                        console.warn(`Failed to instantiate tool class ${ToolClass.name} for metadata:`, e4);
                        return undefined;
                    }
                }
            }
        }
        // Ensure instance has required properties
        if (!instance || !instance.name || !instance.description || !instance.parameters) {
            console.warn(`Tool instance missing required properties:`, {
                name: instance?.name,
                description: instance?.description,
                parameters: instance?.parameters
            });
            return undefined;
        }

        // Extract parameter descriptions and required flags
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

    // Filter out failed instantiations
    const filteredMetadata = metadata.filter((item): item is {
        name: string,
        description: string,
        parameters: any,
        parameterDescriptions: Record<string, string>,
        parameterRequired: Record<string, boolean>
    } => !!item);

    // Log tool names for debugging
    console.log('[toolcollect] getToolMetadata result:', filteredMetadata.map(m => m.name));
    return filteredMetadata;
}

/**
 * Returns an array of all tool names.
 * Used for UI, selection, and validation.
 */
export function getAllToolNames(): string[] {
    return getToolMetadata().map(tool => tool.name);
}

/**
 * Instantiates all tool classes with the provided app and (optionally) plugin.
 * Some tools may require a backupManager from the plugin.
 * @param app The Obsidian app instance.
 * @param plugin Optional plugin instance (for backupManager and debugLog).
 * @returns Array of tool instances.
 */
export function createToolInstances(app: any, plugin?: any): any[] {
    if (plugin && typeof plugin.debugLog === 'function') {
        plugin.debugLog('info', '[toolcollect] createToolInstances called');
    }
    const toolClasses = getAllToolClasses();

    // Instantiate each tool, passing backupManager if needed
    const tools = toolClasses.map(ToolClass => {
        // FileWriteTool and FileDeleteTool may require backupManager
        const instance = plugin && (ToolClass.name === 'FileWriteTool' || ToolClass.name === 'FileDeleteTool')
            ? new ToolClass(app, plugin.backupManager)
            : new ToolClass(app);

        return instance;
    });
    if (plugin && typeof plugin.debugLog === 'function') {
        plugin.debugLog('debug', '[toolcollect] Tool instances created', { count: tools.length });
    }
    return tools;
}
