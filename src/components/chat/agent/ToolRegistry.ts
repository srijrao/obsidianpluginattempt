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

    register(tool: Tool): void {
        this.tools.set(tool.name, tool);
    }

    async execute(command: ToolCommand): Promise<ToolResult> {
        const tool = this.tools.get(command.action);
        if (!tool) {
            return {
                success: false,
                error: `Tool not found: ${command.action}`,
                requestId: command.requestId,
            };
        }
        try {
            const result = await tool.execute(command.parameters, {});
            return {
                ...result,
                requestId: command.requestId,
            };
        } catch (error: any) {
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
