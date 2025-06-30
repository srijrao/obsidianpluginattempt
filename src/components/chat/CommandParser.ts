import { ToolCommand } from '../../types';

import { getAllToolNames } from './agent/tools/toolcollect';
import MyPlugin from '../../main';

/**
 * Parses AI responses to extract tool commands and regular text
 */
export class CommandParser {
    private validActions: string[];
    
    constructor(private plugin?: MyPlugin) {
        
        this.validActions = getAllToolNames();
        if (this.plugin) {
            this.plugin.debugLog('debug', '[CommandParser] Constructor - Valid actions loaded:', this.validActions);
        }
    }

    /**
     * Parse AI response to extract tool commands and regular text
     * @param response The AI response string
     * @returns Object containing separated text and commands
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

        
        const extractedCommands = this.extractCommands(response);
        
        if (this.plugin) {
            this.plugin.debugLog('debug', '[CommandParser] Extracted commands:', extractedCommands);
        }
        
        for (const command of extractedCommands) {
            if (this.plugin) {
                this.plugin.debugLog('debug', '[CommandParser] Validating command:', command.command);
            }
            if (this.validateCommand(command.command)) {
                if (this.plugin) {
                    this.plugin.debugLog('debug', '[CommandParser] Command is valid, adding to commands');
                }
                commands.push(command.command);
                
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
     * Validate that a command has the required structure
     * @param command The command to validate
     * @returns True if command is valid
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
     * Extract JSON commands from text
     * @param text The text to extract commands from
     * @returns Array of extracted commands with their original text
     */
    extractCommands(text: string): Array<{ command: ToolCommand; originalText: string }> {
        const commands: Array<{ command: ToolCommand; originalText: string }> = [];
        
        
        try {
            const parsed = JSON.parse(text.trim());
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
                    originalText: text.trim()
                });
                return commands;
            }
            
            else if (parsed.thought && parsed.nextTool) {
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
            
        }
        
        
        const patterns = [
            /```json\s*(\{[\s\S]*?\})\s*```/g,  
            /```\s*(\{[\s\S]*?\})\s*```/g,      
            /(\{[\s\S]*?\})/g                   
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
                    }
                    
                    else if (parsed.thought && parsed.nextTool) {
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
                    
                    continue;
                }
            }
            
            pattern.lastIndex = 0;
        }
        
        return commands;
    }

    /**
     * Generate a unique request ID
     * @returns A unique request ID string
     */
    private generateRequestId(): string {
        return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
}
