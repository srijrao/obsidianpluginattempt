import { ToolCommand, ToolResult } from '../../types';
import { ICommandProcessor, IToolExecutionEngine, IExecutionLimitManager, IToolDisplayManager, IEventBus } from '../interfaces';
import { App } from 'obsidian';

/**
 * Agent Orchestrator
 * 
 * Top-level service that coordinates all agent operations.
 * Manages the complete workflow from command parsing to result display.
 */
export class AgentOrchestrator {
    constructor(
        private app: App,
        private commandProcessor: ICommandProcessor,
        private executionEngine: IToolExecutionEngine,
        private limitManager: IExecutionLimitManager,
        private displayManager: IToolDisplayManager,
        private eventBus: IEventBus
    ) {
        this.setupEventListeners();
    }

    /**
     * Main orchestration method for processing AI agent responses.
     * Handles the complete workflow from parsing to display.
     */
    async processAgentResponse(
        response: string,
        context?: {
            maxExecutions?: number;
            timeoutMs?: number;
            skipLimitCheck?: boolean;
            displayResults?: boolean;
        }
    ): Promise<{
        commands: ToolCommand[];
        results: Array<{ command: ToolCommand; result: ToolResult }>;
        limitReached: boolean;
        statistics: any;
    }> {
        const startTime = Date.now();
        const config = {
            maxExecutions: 10,
            timeoutMs: 30000,
            skipLimitCheck: false,
            displayResults: true,
            ...context
        };

        try {
            // Publish processing start event
            this.eventBus.publish('agent.processing_started', {
                responseLength: response.length,
                config,
                timestamp: startTime
            });

            // Phase 1: Parse commands from response
            const allCommands = this.commandProcessor.parseCommands(response);
            
            if (allCommands.length === 0) {
                return this.createEmptyResult();
            }

            // Phase 2: Validate commands
            const validation = this.commandProcessor.validateCommands(allCommands);
            
            if (!validation.validCommands || validation.validCommands.length === 0) {
                this.eventBus.publish('agent.no_valid_commands', {
                    totalCommands: allCommands.length,
                    invalidCommands: validation.invalidCommands,
                    timestamp: Date.now()
                });
                return this.createEmptyResult();
            }

            // Phase 3: Check execution limits
            if (!config.skipLimitCheck && this.limitManager.isLimitReached()) {
                this.eventBus.publish('agent.execution_limit_reached', {
                    commandCount: validation.validCommands.length,
                    limitStatus: this.limitManager.getStatus(),
                    timestamp: Date.now()
                });
                return {
                    commands: validation.validCommands,
                    results: [],
                    limitReached: true,
                    statistics: this.gatherStatistics(startTime)
                };
            }

            // Phase 4: Filter out already executed commands (if applicable)
            const commandsToExecute = validation.validCommands.slice(0, config.maxExecutions);

            // Phase 5: Execute commands
            const results = await this.executeCommands(commandsToExecute, config);

            // Phase 6: Create displays if requested
            if (config.displayResults) {
                this.createDisplaysForResults(results);
            }

            // Phase 7: Publish completion event
            this.eventBus.publish('agent.processing_completed', {
                commandCount: commandsToExecute.length,
                successfulExecutions: results.filter(r => r.result.success).length,
                failedExecutions: results.filter(r => !r.result.success).length,
                processingTime: Date.now() - startTime,
                timestamp: Date.now()
            });

            return {
                commands: commandsToExecute,
                results,
                limitReached: this.limitManager.isLimitReached(),
                statistics: this.gatherStatistics(startTime)
            };

        } catch (error: any) {
            this.eventBus.publish('agent.processing_error', {
                error: error.message,
                response: response.substring(0, 200), // Truncate for logging
                timestamp: Date.now()
            });

            throw error;
        }
    }

    /**
     * Executes a single command with full orchestration.
     */
    async executeSingleCommand(command: ToolCommand): Promise<ToolResult> {
        // Check execution limits
        if (!this.limitManager.canExecute(1)) {
            throw new Error('Execution limit reached. Cannot execute more tools.');
        }

        // Validate command
        const validation = this.commandProcessor.validateCommands([command]);
        if (!validation.validCommands || validation.validCommands.length === 0) {
            throw new Error('Invalid command provided');
        }

        // Execute
        const result = await this.executionEngine.executeCommand(command);

        // Create display
        this.displayManager.createDisplay(command, result);

        return result;
    }

    /**
     * Re-executes a command (typically triggered by display re-run buttons).
     */
    async reexecuteCommand(originalCommand: ToolCommand, displayId?: string): Promise<ToolResult> {
        const newCommand = {
            ...originalCommand,
            requestId: `rerun_${Date.now()}_${originalCommand.requestId || 'unknown'}`
        };

        const result = await this.executeSingleCommand(newCommand);

        // Update display if ID provided
        if (displayId) {
            this.displayManager.updateDisplay(displayId, result);
        }

        // Publish reexecution event
        this.eventBus.publish('agent.command_reexecuted', {
            originalCommand,
            newCommand,
            result,
            displayId,
            timestamp: Date.now()
        });

        return result;
    }

    /**
     * Gets comprehensive status of all agent systems.
     */
    getSystemStatus(): {
        executionEngine: any;
        limitManager: any;
        displayManager: any;
        overallHealth: 'healthy' | 'warning' | 'error';
    } {
        const engineStats = this.executionEngine.getExecutionStats();
        const limitStatus = this.limitManager.getStatus();
        const displayStats = this.displayManager.getDisplayStats();

        // Determine overall health
        let overallHealth: 'healthy' | 'warning' | 'error' = 'healthy';
        
        if (limitStatus.isLimitReached) {
            overallHealth = 'warning';
        }
        
        if (engineStats.failedExecutions > engineStats.successfulExecutions) {
            overallHealth = 'error';
        }

        return {
            executionEngine: engineStats,
            limitManager: limitStatus,
            displayManager: displayStats,
            overallHealth
        };
    }

    /**
     * Resets all managed systems.
     */
    resetAllSystems(): void {
        this.limitManager.resetLimit();
        this.displayManager.clearDisplays();
        
        this.eventBus.publish('agent.systems_reset', {
            timestamp: Date.now()
        });
    }

    /**
     * Configures system-wide settings.
     */
    configure(settings: {
        executionLimit?: number;
        autoResetInterval?: number;
        enableAutoReset?: boolean;
    }): void {
        if (settings.executionLimit !== undefined) {
            this.limitManager.setLimit(settings.executionLimit);
        }

        if (settings.autoResetInterval !== undefined || settings.enableAutoReset !== undefined) {
            this.limitManager.setAutoReset(
                settings.enableAutoReset ?? true,
                settings.autoResetInterval
            );
        }

        this.eventBus.publish('agent.configuration_updated', {
            settings,
            timestamp: Date.now()
        });
    }

    /**
     * Executes multiple commands sequentially with proper error handling.
     */
    private async executeCommands(
        commands: ToolCommand[],
        config: { timeoutMs: number }
    ): Promise<Array<{ command: ToolCommand; result: ToolResult }>> {
        const results: Array<{ command: ToolCommand; result: ToolResult }> = [];

        for (const command of commands) {
            try {
                // Check if we can still execute (limit may have been reached)
                if (!this.limitManager.canExecute(1)) {
                    break; // Stop execution if limit reached
                }

                const result = await this.executionEngine.executeCommand(command);
                results.push({ command, result });

                // Stop on critical errors (optional, could be configurable)
                if (!result.success && this.isCriticalError(result)) {
                    break;
                }

            } catch (error: any) {
                const errorResult: ToolResult = {
                    success: false,
                    error: `Execution failed: ${error.message}`,
                    requestId: command.requestId
                };
                results.push({ command, result: errorResult });
            }
        }

        return results;
    }

    /**
     * Creates displays for execution results.
     */
    private createDisplaysForResults(results: Array<{ command: ToolCommand; result: ToolResult }>): void {
        for (const { command, result } of results) {
            try {
                this.displayManager.createDisplay(command, result);
            } catch (error) {
                console.error('[AgentOrchestrator] Failed to create display:', error);
            }
        }
    }

    /**
     * Determines if an error is critical enough to stop execution.
     */
    private isCriticalError(result: ToolResult): boolean {
        // Define critical error patterns
        const criticalPatterns = [
            /authentication failed/i,
            /permission denied/i,
            /network unreachable/i,
            /system error/i
        ];

        return criticalPatterns.some(pattern => 
            result.error && pattern.test(result.error)
        );
    }

    /**
     * Gathers execution statistics.
     */
    private gatherStatistics(startTime: number): any {
        return {
            processingTime: Date.now() - startTime,
            engineStats: this.executionEngine.getExecutionStats(),
            limitStatus: this.limitManager.getStatus(),
            displayStats: this.displayManager.getDisplayStats(),
            timestamp: Date.now()
        };
    }

    /**
     * Creates an empty result object.
     */
    private createEmptyResult(): {
        commands: ToolCommand[];
        results: Array<{ command: ToolCommand; result: ToolResult }>;
        limitReached: boolean;
        statistics: any;
    } {
        return {
            commands: [],
            results: [],
            limitReached: false,
            statistics: this.gatherStatistics(Date.now())
        };
    }

    /**
     * Sets up event listeners for cross-component coordination.
     */
    private setupEventListeners(): void {
        // Listen for display rerun requests
        this.eventBus.subscribe('tool_display.rerun_requested', async (data: any) => {
            if (data?.command && data?.displayId) {
                try {
                    await this.reexecuteCommand(data.command, data.displayId);
                } catch (error) {
                    console.error('[AgentOrchestrator] Failed to reexecute command:', error);
                }
            }
        });

        // Listen for limit warnings to potentially adjust behavior
        this.eventBus.subscribe('execution_limit.warning', (data: any) => {
            console.warn('[AgentOrchestrator] Execution limit warning:', data);
        });

        // Listen for limit reached events
        this.eventBus.subscribe('execution_limit.limit_reached', (data: any) => {
            console.warn('[AgentOrchestrator] Execution limit reached:', data);
        });
    }

    /**
     * Cleanup method for when the orchestrator is being destroyed.
     */
    destroy(): void {
        this.displayManager.destroy();
        this.limitManager.destroy();
        // Event bus subscriptions should be cleaned up automatically
    }
}
