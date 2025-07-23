import { ToolCommand, ToolResult } from '../../types';
import { CommandParser } from '../../components/agent/CommandParser';
import { ICommandProcessor, ValidationResult } from '../interfaces';
import MyPlugin from '../../main';

/**
 * Command Processor Service
 * 
 * Handles parsing and validation of tool commands from AI responses.
 * Implements command filtering and deduplication logic.
 */
export class CommandProcessor implements ICommandProcessor {
    private commandParser: CommandParser;

    constructor(private plugin: MyPlugin) {
        this.commandParser = new CommandParser(plugin);
    }

    /**
     * Parses tool commands from an AI response string.
     */
    parseCommands(response: string): ToolCommand[] {
        const { commands } = this.commandParser.parseResponse(response);
        return commands;
    }

    /**
     * Validates an array of tool commands.
     */
    validateCommands(commands: ToolCommand[]): ValidationResult {
        const validCommands: ToolCommand[] = [];
        const invalidCommands: Array<{ command: ToolCommand; reason: string }> = [];

        for (const command of commands) {
            if (this.validateSingleCommand(command)) {
                validCommands.push(command);
            } else {
                invalidCommands.push({
                    command,
                    reason: 'Invalid command structure or missing required fields'
                });
            }
        }

        return {
            isValid: invalidCommands.length === 0,
            validCommands,
            invalidCommands,
            totalCount: commands.length,
            validCount: validCommands.length
        };
    }

    /**
     * Filters out commands that have already been executed in chat history.
     */
    filterExecutedCommands(commands: ToolCommand[], history: any[]): ToolCommand[] {
        if (!history || history.length === 0) {
            return commands;
        }

        // Extract executed commands from history
        const executedCommands = new Set<string>();
        
        for (const entry of history) {
            if (entry.toolExecutionResults) {
                for (const result of entry.toolExecutionResults) {
                    if (result.command) {
                        executedCommands.add(this.generateCommandSignature(result.command));
                    }
                }
            }
        }

        // Filter out already executed commands
        return commands.filter(command => 
            !executedCommands.has(this.generateCommandSignature(command))
        );
    }

    /**
     * Generates text and commands from a response.
     */
    parseResponse(response: string): { text: string; commands: ToolCommand[] } {
        return this.commandParser.parseResponse(response);
    }

    /**
     * Validates a single tool command.
     */
    private validateSingleCommand(command: ToolCommand): boolean {
        if (!command || typeof command !== 'object') {
            return false;
        }

        // Check required fields
        if (!command.action || typeof command.action !== 'string') {
            return false;
        }

        if (!command.parameters || typeof command.parameters !== 'object') {
            return false;
        }

        // Additional validation can be added here
        return true;
    }

    /**
     * Generates a unique signature for a command to detect duplicates.
     */
    private generateCommandSignature(command: ToolCommand): string {
        return `${command.action}:${JSON.stringify(command.parameters)}`;
    }

    /**
     * Gets existing tool results for commands from history.
     */
    getExistingToolResults(
        commands: ToolCommand[], 
        history: any[]
    ): Array<{ command: ToolCommand; result: ToolResult }> {
        const results: Array<{ command: ToolCommand; result: ToolResult }> = [];
        
        for (const command of commands) {
            const signature = this.generateCommandSignature(command);
            
            for (const entry of history) {
                if (entry.toolExecutionResults) {
                    for (const toolResult of entry.toolExecutionResults) {
                        if (toolResult.command && 
                            this.generateCommandSignature(toolResult.command) === signature) {
                            results.push({
                                command,
                                result: toolResult.result || { success: true, data: 'Previously executed' }
                            });
                            break;
                        }
                    }
                }
            }
        }
        
        return results;
    }
}
