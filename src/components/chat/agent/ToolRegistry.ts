import { ToolCommand, ToolResult } from '../../../types';

export interface Tool {
    name: string;
    description: string;
    parameters: Record<string, any>;
    execute(params: any, context: any): Promise<ToolResult>;
}

export interface ToolContext {
    app: any;
    plugin: any;
}

export type { ToolResult };

export class ToolRegistry {
    private tools: Map<string, Tool> = new Map();
    private plugin: any;
    constructor(plugin: any) {
        this.plugin = plugin;
    }

    register(tool: Tool): void {
        this.tools.set(tool.name, tool);
        if (this.plugin && this.plugin.settings && this.plugin.settings.debugMode) {
            this.plugin.debugLog('[ToolRegistry] Registering tool', { tool });
        }
    }

    async execute(command: ToolCommand): Promise<ToolResult> {
        const tool = this.tools.get(command.action);
        if (!tool) {
            if (this.plugin && this.plugin.settings && this.plugin.settings.debugMode) {
                this.plugin.debugLog('[ToolRegistry] Tool not found', { action: command.action });
            }
            return {
                success: false,
                error: `Tool not found: ${command.action}`,
                requestId: command.requestId,
            };
        }
        try {
            if (this.plugin && this.plugin.settings && this.plugin.settings.debugMode) {
                this.plugin.debugLog('[ToolRegistry] Executing tool', { command });
            }
            // Inject editor for file_diff tool if not present
            let parameters = { ...command.parameters };
            if (tool.name === 'file_diff' && !parameters.editor) {
                const app = this.plugin?.app;
                
                // Try multiple approaches to get an active editor
                let editor = null;
                
                // Method 1: Try activeLeaf view editor
                try {
                    if (app?.workspace?.activeLeaf?.view?.editor) {
                        editor = app.workspace.activeLeaf.view.editor;
                    }
                } catch (error) {
                    // Ignore errors
                }
                
                // Method 2: Try getting active markdown view
                if (!editor) {
                    try {
                        const activeView = app?.workspace?.getActiveViewOfType?.(app?.workspace?.viewRegistry?.getTypeByID?.('markdown'));
                        if (activeView?.editor) {
                            editor = activeView.editor;
                        }
                    } catch (error) {
                        // Ignore errors
                    }
                }
                
                // Method 3: Try getting any markdown view with an editor
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
                        // Ignore errors
                    }
                }
                
                // Only add editor if we found one - FileDiffTool will handle the case where no editor is available
                if (editor) {
                    parameters.editor = editor;
                    if (this.plugin && this.plugin.settings && this.plugin.settings.debugMode) {
                        this.plugin.debugLog('[ToolRegistry] Injected editor for file_diff tool');
                    }
                } else {
                    if (this.plugin && this.plugin.settings && this.plugin.settings.debugMode) {
                        this.plugin.debugLog('[ToolRegistry] No editor available for file_diff tool, will use fallback mode');
                    }
                }
            }
            const result = await tool.execute(parameters, {});
            if (this.plugin && this.plugin.settings && this.plugin.settings.debugMode) {
                this.plugin.debugLog('[ToolRegistry] Tool execution result', { command, result });
            }
            return {
                ...result,
                requestId: command.requestId,
            };
        } catch (error: any) {
            if (this.plugin && this.plugin.settings && this.plugin.settings.debugMode) {
                this.plugin.debugLog('[ToolRegistry] Tool execution error', { command, error });
            }
            return {
                success: false,
                error: error.message || String(error),
                requestId: command.requestId,
            };
        }
    }

    getAvailableTools(): Tool[] {
        return Array.from(this.tools.values());
    }
}
