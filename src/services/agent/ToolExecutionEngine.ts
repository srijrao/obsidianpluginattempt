import { ToolCommand, ToolResult } from '../../types';
import { ToolRegistry } from '../../components/agent/ToolRegistry';
import { IToolExecutionEngine, ExecutionStats, IEventBus } from '../interfaces';
import { createToolInstances } from '../../components/agent/tools/toolcollect';
import { App } from 'obsidian';
import MyPlugin from '../../main';

/**
 * Tool Execution Engine with Pipeline
 * 
 * Implements a pluggable pipeline for tool execution with stages:
 * Validation → Execution → Post-processing → Notification
 */
export class ToolExecutionEngine implements IToolExecutionEngine {
    private toolRegistry: ToolRegistry;
    private executionStats: ExecutionStats;
    private pipeline: IToolPipelineStage[] = [];

    constructor(
        private app: App,
        private plugin: MyPlugin,
        private eventBus: IEventBus
    ) {
        this.toolRegistry = new ToolRegistry(plugin);
        this.executionStats = {
            executionCount: 0,
            maxExecutions: plugin.agentModeManager?.getAgentModeSettings()?.maxToolCalls || 10,
            remaining: 0,
            averageExecutionTime: 0,
            successfulExecutions: 0,
            failedExecutions: 0,
            totalExecutions: 0
        };
        
        this.initializeTools();
        this.setupDefaultPipeline();
    }

    /**
     * Executes a tool command through the pipeline.
     */
    async executeCommand(command: ToolCommand): Promise<ToolResult> {
        const startTime = Date.now();
        
        try {
            // Create pipeline context
            let context: PipelineContext = {
                command,
                result: null,
                metadata: {
                    startTime,
                    stage: 'initial'
                }
            };

            // Process through pipeline stages
            for (const stage of this.pipeline) {
                context = await stage.process(context);
                if (context.result && !context.result.success) {
                    break; // Stop on error
                }
            }

            // Update execution stats
            const executionTime = Date.now() - startTime;
            this.updateExecutionStats(executionTime, context.result?.success || false);

            // Publish execution event
            this.eventBus.publish('tool.executed', {
                command,
                result: context.result,
                executionTime,
                timestamp: Date.now()
            });

            return context.result || this.createErrorResult(command, 'Pipeline execution failed');

        } catch (error: any) {
            const errorResult = this.createErrorResult(command, error.message);
            
            // Update stats for failed execution
            const executionTime = Date.now() - startTime;
            this.updateExecutionStats(executionTime, false);
            
            this.eventBus.publish('tool.execution_failed', {
                command,
                error: error.message,
                timestamp: Date.now()
            });

            return errorResult;
        }
    }

    /**
     * Checks if a tool can be executed.
     */
    canExecute(command: ToolCommand): boolean {
        if (!command || !command.action) {
            return false;
        }

        // Check if tool is registered by getting available tools
        const availableTools = this.toolRegistry.getAvailableTools();
        return availableTools.some(tool => tool.name === command.action);
    }

    /**
     * Gets current execution statistics.
     */
    getExecutionStats(): ExecutionStats {
        this.executionStats.remaining = Math.max(0, this.executionStats.maxExecutions - this.executionStats.executionCount);
        return { ...this.executionStats };
    }

    /**
     * Registers a new tool.
     */
    registerTool(tool: any): void {
        this.toolRegistry.register(tool);
    }

    /**
     * Unregisters a tool.
     * Note: Current ToolRegistry doesn't support unregistration
     */
    unregisterTool(toolName: string): void {
        // TODO: Implement when ToolRegistry supports unregistration
        console.warn(`Tool unregistration not supported: ${toolName}`);
    }

    /**
     * Adds a pipeline stage.
     */
    addPipelineStage(stage: IToolPipelineStage): void {
        this.pipeline.push(stage);
    }

    /**
     * Removes a pipeline stage.
     */
    removePipelineStage(stageName: string): void {
        this.pipeline = this.pipeline.filter(stage => stage.name !== stageName);
    }

    /**
     * Gets current pipeline stages.
     */
    getPipelineStages(): IToolPipelineStage[] {
        return [...this.pipeline];
    }

    /**
     * Resets execution statistics.
     */
    resetStats(): void {
        this.executionStats.executionCount = 0;
        this.executionStats.averageExecutionTime = 0;
        this.executionStats.remaining = this.executionStats.maxExecutions;
    }

    /**
     * Initializes available tools.
     */
    private initializeTools(): void {
        const tools = createToolInstances(this.app, this.plugin);
        for (const tool of tools) {
            this.toolRegistry.register(tool);
        }
    }

    /**
     * Sets up the default execution pipeline.
     */
    private setupDefaultPipeline(): void {
        this.pipeline = [
            new ValidationStage(),
            new ExecutionStage(this.toolRegistry),
            new PostProcessingStage(),
            new NotificationStage(this.eventBus)
        ];
    }

    /**
     * Updates execution statistics.
     */
    private updateExecutionStats(executionTime: number, success: boolean = true): void {
        this.executionStats.executionCount++;
        this.executionStats.totalExecutions++;
        
        if (success) {
            this.executionStats.successfulExecutions++;
        } else {
            this.executionStats.failedExecutions++;
        }
        
        // Update average execution time
        const totalTime = this.executionStats.averageExecutionTime * (this.executionStats.executionCount - 1) + executionTime;
        this.executionStats.averageExecutionTime = totalTime / this.executionStats.executionCount;
        
        this.executionStats.remaining = Math.max(0, this.executionStats.maxExecutions - this.executionStats.executionCount);
    }

    /**
     * Creates an error result.
     */
    private createErrorResult(command: ToolCommand, error: string): ToolResult {
        return {
            success: false,
            error: `Tool execution failed: ${error}`,
            requestId: command.requestId
        };
    }
}

// ============================================================================
// Pipeline Interfaces and Stages
// ============================================================================

export interface PipelineContext {
    command: ToolCommand;
    result: ToolResult | null;
    metadata: {
        startTime: number;
        stage: string;
        [key: string]: any;
    };
}

export interface IToolPipelineStage {
    name: string;
    process(context: PipelineContext): Promise<PipelineContext>;
}

/**
 * Validation Stage - Validates command structure and parameters
 */
class ValidationStage implements IToolPipelineStage {
    name = 'validation';

    async process(context: PipelineContext): Promise<PipelineContext> {
        const { command } = context;

        // Basic validation
        if (!command.action || typeof command.action !== 'string') {
            return {
                ...context,
                result: {
                    success: false,
                    error: 'Invalid command: action is required',
                    requestId: command.requestId
                },
                metadata: { ...context.metadata, stage: this.name }
            };
        }

        if (!command.parameters || typeof command.parameters !== 'object') {
            return {
                ...context,
                result: {
                    success: false,
                    error: 'Invalid command: parameters are required',
                    requestId: command.requestId
                },
                metadata: { ...context.metadata, stage: this.name }
            };
        }

        return {
            ...context,
            metadata: { ...context.metadata, stage: this.name }
        };
    }
}

/**
 * Execution Stage - Actually executes the tool
 */
class ExecutionStage implements IToolPipelineStage {
    name = 'execution';

    constructor(private toolRegistry: ToolRegistry) {}

    async process(context: PipelineContext): Promise<PipelineContext> {
        const { command } = context;

        try {
            const result = await this.toolRegistry.execute(command);
            return {
                ...context,
                result,
                metadata: { ...context.metadata, stage: this.name }
            };
        } catch (error: any) {
            return {
                ...context,
                result: {
                    success: false,
                    error: error.message || 'Tool execution failed',
                    requestId: command.requestId
                },
                metadata: { ...context.metadata, stage: this.name }
            };
        }
    }
}

/**
 * Post-Processing Stage - Handles result formatting and enrichment
 */
class PostProcessingStage implements IToolPipelineStage {
    name = 'post-processing';

    async process(context: PipelineContext): Promise<PipelineContext> {
        const { result } = context;

        if (result) {
            // Ensure requestId matches command
            if (!result.requestId && context.command.requestId) {
                result.requestId = context.command.requestId;
            }
        }

        return {
            ...context,
            metadata: { ...context.metadata, stage: this.name }
        };
    }
}

/**
 * Notification Stage - Publishes events and notifications
 */
class NotificationStage implements IToolPipelineStage {
    name = 'notification';

    constructor(private eventBus: IEventBus) {}

    async process(context: PipelineContext): Promise<PipelineContext> {
        const { command, result } = context;

        if (result) {
            // Publish stage completion event
            this.eventBus.publish('tool.pipeline.stage_completed', {
                stage: this.name,
                command,
                result,
                success: result.success,
                timestamp: Date.now()
            });
        }

        return {
            ...context,
            metadata: { ...context.metadata, stage: this.name }
        };
    }
}
