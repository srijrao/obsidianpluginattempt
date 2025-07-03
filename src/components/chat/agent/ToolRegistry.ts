import { ToolCommand, ToolResult } from '../../../types';
import { debugLog } from '../../../utils/logger'; // Import debugLog

/**
 * Interface for a Tool.
 * Each tool must have a name, description, parameters, and an execute method.
 */
export interface Tool {
    name: string;
    description: string;
    parameters: Record<string, any>;
    execute(params: any, context: any): Promise<ToolResult>;
}

/**
 * Context object passed to tools (not widely used in current implementation).
 */
export interface ToolContext {
    app: any;
    plugin: any;
}

export type { ToolResult };

/**
 * ToolRegistry manages registration and execution of all available tools.
 * It also injects context (such as editor) for certain tools if needed.
 */
export class ToolRegistry {
    private tools: Map<string, Tool> = new Map();
    private plugin: any;

    /**
     * @param plugin The plugin instance (for settings, logging, and app access)
     */
    constructor(plugin: any) {
        this.plugin = plugin;
    }

    /**
     * Registers a tool instance by its name.
     * @param tool The tool instance to register
     */
    register(tool: Tool): void {
        this.tools.set(tool.name, tool);
        if (this.plugin && this.plugin.settings) {
            debugLog(this.plugin.settings.debugMode ?? false, 'debug', '[ToolRegistry] Registering tool:', tool.name); // Use debugLog
        }
    }

    /**
     * Executes a tool command by looking up the tool and calling its execute method.
     * Handles special context injection for certain tools (e.g., file_diff/editor).
     * @param command The ToolCommand to execute
     * @returns ToolResult with the result or error
     */
    async execute(command: ToolCommand): Promise<ToolResult> {
        const tool = this.tools.get(command.action);
        if (!tool) {
            if (this.plugin && this.plugin.settings) {
                debugLog(this.plugin.settings.debugMode ?? false, 'debug', '[ToolRegistry] Tool not found', { action: command.action }); // Use debugLog
            }
            return {
                success: false,
                error: `Tool not found: ${command.action}`,
                requestId: command.requestId,
            };
        }
        try {
            if (this.plugin && this.plugin.settings) {
                debugLog(this.plugin.settings.debugMode ?? false, 'debug', '[ToolRegistry] Executing tool', { command }); // Use debugLog
            }

            // Clone parameters to avoid mutation
            let parameters = { ...command.parameters };

            // Special handling: inject editor for file_diff tool if not provided
            if (tool.name === 'file_diff' && !parameters.editor) {
                const app = this.plugin?.app;
                let editor = null;

                // Try to get the active editor from the workspace
                try {
                    if (app?.workspace?.activeLeaf?.view?.editor) {
                        editor = app.workspace.activeLeaf.view.editor;
                    }
                } catch (error) {
                    // Ignore errors, fallback to next method
                }

                // Try to get the active markdown view's editor
                if (!editor) {
                    try {
                        const activeView = app?.workspace?.getActiveViewOfType?.(app?.workspace?.viewRegistry?.getTypeByID?.('markdown'));
                        if (activeView?.editor) {
                            editor = activeView.editor;
                        }
                    } catch (error) {
                        // Ignore errors, fallback to next method
                    }
                }

                // Try to get any open markdown editor
                if (!editor) {
                    try {
                        const leaves = app?.workspace?.getLeavesOfType?.('markdown');
                        if (leaves && leaves.length > 0) {
                            for (const leaf of leaves) {
                                if (leaf.view?.editor) {
                                    editor = leaf.view.editor;
                                    break;
                                }
                            }
                        }
                    } catch (error) {
                        // Ignore errors, fallback to no editor
                    }
                }

                // Inject editor if found
                if (editor) {
                    parameters.editor = editor;
                    if (this.plugin && this.plugin.settings) {
                        debugLog(this.plugin.settings.debugMode ?? false, 'debug', '[ToolRegistry] Injected editor for file_diff tool'); // Use debugLog
                    }
                } else {
                    if (this.plugin && this.plugin.settings) {
                        debugLog(this.plugin.settings.debugMode ?? false, 'debug', '[ToolRegistry] No editor available for file_diff tool, will use fallback mode'); // Use debugLog
                    }
                }
            }

            const result = await tool.execute(parameters, {});
            if (this.plugin && this.plugin.settings) {
                debugLog(this.plugin.settings.debugMode ?? false, 'debug', '[ToolRegistry] Tool execution result', { command, result }); // Use debugLog
            }
            return {
                ...result,
                requestId: command.requestId,
            };
        } catch (error: any) {
            if (this.plugin && this.plugin.settings) {
                debugLog(this.plugin.settings.debugMode ?? false, 'error', '[ToolRegistry] Tool execution error', { command, error }); // Use debugLog
            }
            return {
                success: false,
                error: error.message || String(error),
                requestId: command.requestId,
            };
        }
    }

    /**
     * Returns an array of all registered tool instances.
     * @returns Array of Tool objects
     */
    getAvailableTools(): Tool[] {
        return Array.from(this.tools.values());
    }
}
