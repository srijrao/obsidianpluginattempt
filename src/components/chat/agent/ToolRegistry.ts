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
            const result = await tool.execute(command.parameters, {});
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
