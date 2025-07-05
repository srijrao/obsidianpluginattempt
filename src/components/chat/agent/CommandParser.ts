import { ToolCommand } from '../../../types';
import { getAllToolNames } from './tools/toolcollect';
import MyPlugin from '../../../main';

/**
 * CommandParser is responsible for parsing AI responses to extract tool commands
 * and separating them from regular text. It validates commands against the list
 * of available tool actions and supports multiple JSON extraction patterns.
 */
export class CommandParser {
    private validActions: string[];

    /**
     * @param plugin Optional plugin instance for debug logging.
     */
    constructor(private plugin?: MyPlugin) {
        // Load all valid tool action names for validation.
        this.validActions = getAllToolNames();
        if (this.plugin) {
            this.plugin.debugLog('debug', '[CommandParser] Constructor - Valid actions loaded:', this.validActions);
        }
    }

    /**
     * Parse AI response to extract tool commands and regular text.
     * @param response The AI response string.
     * @returns Object containing separated text and commands.
     */
    parseResponse(response: string): {
        text: string;
        commands: ToolCommand[];
    } {
        const commands: ToolCommand[] = [];
        let cleanText = response;

        if (this.plugin) {
            this.plugin.debugLog('debug', '[CommandParser] Parsing response:', response);
            this.plugin.debugLog('debug', '[CommandParser] Valid actions:', this.validActions);
        }

        // Extract commands from the response.
        const extractedCommands = this.extractCommands(response);

        if (this.plugin) {
            this.plugin.debugLog('debug', '[CommandParser] Extracted commands:', extractedCommands);
        }

        // Validate and collect commands, removing their text from the response.
        for (const command of extractedCommands) {
            if (this.plugin) {
                this.plugin.debugLog('debug', '[CommandParser] Validating command:', command.command);
            }
            if (this.validateCommand(command.command)) {
                if (this.plugin) {
                    this.plugin.debugLog('debug', '[CommandParser] Command is valid, adding to commands');
                }
                commands.push(command.command);
                // Remove the command JSON from the text.
                cleanText = cleanText.replace(command.originalText, '').trim();
            } else {
                if (this.plugin) {
                    this.plugin.debugLog('debug', '[CommandParser] Command is invalid');
                }
            }
        }

        if (this.plugin) {
            this.plugin.debugLog('debug', '[CommandParser] Final commands:', commands);
        }

        return {
            text: cleanText,
            commands
        };
    }

    /**
     * Validate that a command has the required structure and is a known action.
     * @param command The command to validate.
     * @returns True if command is valid.
     */
    validateCommand(command: ToolCommand): boolean {
        if (this.plugin) {
            this.plugin.debugLog('debug', '[CommandParser] validateCommand called with:', command);
        }

        if (!command || typeof command !== 'object') {
            if (this.plugin) {
                this.plugin.debugLog('debug', '[CommandParser] Command is not an object');
            }
            return false;
        }

        if (!command.action || typeof command.action !== 'string') {
            if (this.plugin) {
                this.plugin.debugLog('debug', '[CommandParser] Command missing action field:', command.action);
            }
            return false;
        }

        if (!command.parameters || typeof command.parameters !== 'object') {
            if (this.plugin) {
                this.plugin.debugLog('debug', '[CommandParser] Command missing parameters field:', command.parameters);
            }
            return false;
        }

        if (!this.validActions.includes(command.action)) {
            if (this.plugin) {
                this.plugin.debugLog('debug', '[CommandParser] Command action not in valid actions:', command.action, 'Valid actions:', this.validActions);
            }
            return false;
        }

        if (this.plugin) {
            this.plugin.debugLog('debug', '[CommandParser] Command is valid');
        }
        return true;
    }

    /**
     * Extract JSON commands from text using several patterns.
     * Handles both inline and code block JSON, as well as "thought" objects.
     * @param text The text to extract commands from.
     * @returns Array of extracted commands with their original text.
     */
    extractCommands(text: string): Array<{ command: ToolCommand; originalText: string }> {
        const commands: Array<{ command: ToolCommand; originalText: string }> = [];

        // Try to parse the entire text as a single JSON command.
        try {
            const parsed = JSON.parse(text.trim());
            if (parsed.action) {
                let parameters = parsed.parameters;
                // If parameters are missing, use all fields except action/requestId.
                if (!parameters) {
                    parameters = { ...parsed };
                    delete parameters.action;
                    delete parameters.requestId;
                }
                commands.push({
                    command: {
                        action: parsed.action,
                        parameters: parameters,
                        requestId: parsed.requestId || this.generateRequestId(),
                        finished: parsed.finished || false
                    },
                    originalText: text.trim()
                });
                return commands;
            } else if (parsed.thought && parsed.nextTool) {
                commands.push({
                    command: {
                        action: 'thought',
                        parameters: {
                            thought: parsed.thought,
                            nextTool: parsed.nextTool,
                            nextActionDescription: parsed.nextActionDescription,
                            step: parsed.step,
                            totalSteps: parsed.totalSteps
                        },
                        requestId: this.generateRequestId(),
                        finished: parsed.nextTool?.toLowerCase() === 'finished'
                    },
                    originalText: text.trim()
                });
                return commands;
            }
        } catch (error) {
            // Ignore parse errors, try regex extraction below.
        }

        // Patterns for extracting JSON blocks from text/code blocks.
        const patterns = [
            /```json\s*(\{[\s\S]*?\})\s*```/g,  // ```json ... ```
            /```\s*(\{[\s\S]*?\})\s*```/g,      // ``` ... ```
            /(\{[\s\S]*?\})/g                   // Inline {...}
        ];

        for (const pattern of patterns) {
            let match;
            while ((match = pattern.exec(text)) !== null) {
                const jsonText = match[1];
                const originalText = match[0];
                try {
                    const parsed = JSON.parse(jsonText);
                    if (parsed.action) {
                        let parameters = parsed.parameters;
                        if (!parameters) {
                            parameters = { ...parsed };
                            delete parameters.action;
                            delete parameters.requestId;
                        }
                        commands.push({
                            command: {
                                action: parsed.action,
                                parameters: parameters,
                                requestId: parsed.requestId || this.generateRequestId(),
                                finished: parsed.finished || false
                            },
                            originalText
                        });
                    } else if (parsed.thought && parsed.nextTool) {
                        commands.push({
                            command: {
                                action: 'thought',
                                parameters: {
                                    thought: parsed.thought,
                                    nextTool: parsed.nextTool,
                                    nextActionDescription: parsed.nextActionDescription,
                                    step: parsed.step,
                                    totalSteps: parsed.totalSteps
                                },
                                requestId: this.generateRequestId(),
                                finished: parsed.nextTool?.toLowerCase() === 'finished'
                            },
                            originalText
                        });
                    }
                } catch (error) {
                    // Ignore parse errors for this match.
                    continue;
                }
            }
            // Reset regex state for next pattern.
            pattern.lastIndex = 0;
        }

        return commands;
    }

    /**
     * Generate a unique request ID for tool commands.
     * @returns A unique request ID string.
     */
    private generateRequestId(): string {
        return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
}
