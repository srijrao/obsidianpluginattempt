export interface ToolCommand {
    action: string;
    parameters: Record<string, any>;
    requestId?: string;
    finished?: boolean;
}

export interface ToolResult {
    success: boolean;
    data?: any;
    error?: string;
    requestId?: string;
}

export interface ToolExecutionResult {
    command: ToolCommand;
    result: ToolResult;
    timestamp: string;
}

export interface AgentModeSettings {
    enabled: boolean;
    maxToolCalls: number;
    timeoutMs: number;
}
