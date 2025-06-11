import { App, Notice } from 'obsidian';
import MyPlugin from '../../main';
import { ToolCommand, ToolResult, Message } from '../../types';
import { CommandParser } from './CommandParser';
import { ToolRegistry } from './ToolRegistry';
import { FileSelectTool } from './tools/FileSelectTool';
import { FileReadTool } from './tools/FileReadTool';
import { FileWriteTool } from './tools/FileWriteTool';
import { FileDiffTool } from './tools/FileDiffTool';
import { ThoughtTool } from './tools/ThoughtTool';

export interface AgentContext {
    app: App;
    plugin: MyPlugin;
    messagesContainer: HTMLElement;
    onToolResult: (toolResult: ToolResult, command: ToolCommand) => void;
}

export class AgentResponseHandler {
    private commandParser: CommandParser;
    private toolRegistry: ToolRegistry;
    private executionCount: number = 0;

    constructor(private context: AgentContext) {
        this.commandParser = new CommandParser();
        this.toolRegistry = new ToolRegistry();
        this.initializeTools();
    }

    private initializeTools() {
        // Register all available tools
        this.toolRegistry.register(new FileSelectTool(this.context.app));
        this.toolRegistry.register(new FileReadTool(this.context.app));
        this.toolRegistry.register(new FileWriteTool(this.context.app));
        this.toolRegistry.register(new FileDiffTool(this.context.app));
        this.toolRegistry.register(new ThoughtTool(this.context.app));
    }

    /**
     * Process an AI response and handle any tool commands
     * @param response The AI response text
     * @returns Object containing processed text and execution results
     */
    async processResponse(response: string): Promise<{
        processedText: string;
        toolResults: Array<{ command: ToolCommand; result: ToolResult }>;
        hasTools: boolean;
    }> {
        console.log('AgentResponseHandler: Processing response, agent mode enabled:', this.context.plugin.isAgentModeEnabled());
        console.log('AgentResponseHandler: Response content:', response);
        
        // Check if agent mode is enabled
        if (!this.context.plugin.isAgentModeEnabled()) {
            console.log('AgentResponseHandler: Agent mode disabled, returning original response');
            return {
                processedText: response,
                toolResults: [],
                hasTools: false
            };
        }

        // Parse response for tool commands
        const { text, commands } = this.commandParser.parseResponse(response);
        
        console.log('AgentResponseHandler: Parsed text:', text);
        console.log('AgentResponseHandler: Found commands:', commands);
        
        if (commands.length === 0) {
            console.log('AgentResponseHandler: No commands found, returning original text');
            return {
                processedText: text,
                toolResults: [],
                hasTools: false
            };
        }

        // Check execution limits
        const agentSettings = this.context.plugin.getAgentModeSettings();
        if (this.executionCount >= agentSettings.maxToolCalls) {
            new Notice(`Agent mode: Maximum tool calls (${agentSettings.maxToolCalls}) reached`);
            return {
                processedText: text + '\n\n*[Tool execution limit reached]*',
                toolResults: [],
                hasTools: true
            };
        }

        // Execute tools
        const toolResults: Array<{ command: ToolCommand; result: ToolResult }> = [];
        
        for (const command of commands) {
            try {
                const result = await this.executeToolWithTimeout(command, agentSettings.timeoutMs);
                toolResults.push({ command, result });
                this.executionCount++;

                // Notify context about tool result
                this.context.onToolResult(result, command);

                // Stop if we hit the limit
                if (this.executionCount >= agentSettings.maxToolCalls) {
                    break;
                }
            } catch (error: any) {
                const errorResult: ToolResult = {
                    success: false,
                    error: `Tool execution failed: ${error.message}`,
                    requestId: command.requestId
                };
                toolResults.push({ command, result: errorResult });
                this.context.onToolResult(errorResult, command);
            }
        }

        return {
            processedText: text,
            toolResults,
            hasTools: true
        };
    }

    /**
     * Execute a tool command with timeout
     */
    private async executeToolWithTimeout(command: ToolCommand, timeoutMs: number): Promise<ToolResult> {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error(`Tool execution timed out after ${timeoutMs}ms`));
            }, timeoutMs);

            this.toolRegistry.execute(command)
                .then(result => {
                    clearTimeout(timeout);
                    resolve(result);
                })
                .catch(error => {
                    clearTimeout(timeout);
                    reject(error);
                });
        });
    }

    /**
     * Reset execution count (call at start of new conversation)
     */
    resetExecutionCount() {
        this.executionCount = 0;
    }

    /**
     * Get available tools information
     */
    getAvailableTools() {
        return this.toolRegistry.getAvailableTools();
    }

    /**
     * Get tool execution statistics
     */
    getExecutionStats() {
        const agentSettings = this.context.plugin.getAgentModeSettings();
        return {
            executionCount: this.executionCount,
            maxToolCalls: agentSettings.maxToolCalls,
            remaining: Math.max(0, agentSettings.maxToolCalls - this.executionCount)
        };
    }

    /**
     * Create a message with tool execution results for context
     */
    createToolResultMessage(toolResults: Array<{ command: ToolCommand; result: ToolResult }>): Message | null {
        if (toolResults.length === 0) {
            return null;
        }

        const resultText = toolResults.map(({ command, result }) => {
            const status = result.success ? '✓' : '✗';
            const data = result.success ? JSON.stringify(result.data, null, 2) : result.error;
            return `${status} Tool: ${command.action}\nParameters: ${JSON.stringify(command.parameters, null, 2)}\nResult: ${data}`;
        }).join('\n\n');

        return {
            role: 'system',
            content: `Tool execution results:\n\n${resultText}`
        };
    }

    /**
     * Format tool results for display in chat
     */
    formatToolResultsForDisplay(toolResults: Array<{ command: ToolCommand; result: ToolResult }>): string {
        if (toolResults.length === 0) {
            return '';
        }

        const resultText = toolResults.map(({ command, result }) => {
            const status = result.success ? '✅' : '❌';
            const action = command.action.replace('_', ' ');
            
            if (result.success) {
                let context = '';
                
                // Add specific context based on the tool and result data
                if (result.data) {
                    switch (command.action) {
                        case 'file_write':
                            if (result.data.filePath) {
                                context = ` [[${result.data.filePath}]]`;
                            }
                            break;
                        case 'file_read':
                            if (result.data.filePath) {
                                context = ` [[${result.data.filePath}]]`;
                            }
                            break;
                        case 'file_select':
                            if (result.data.count !== undefined) {
                                context = ` [[${result.data.count} files found]]`;
                            }
                            break;
                        case 'file_diff':
                            if (result.data.filePath) {
                                context = ` [[${result.data.filePath}]]`;
                            }
                            break;
                        case 'thought':
                            // For thought tool, display the formatted thought content instead of just "completed successfully"
                            if (result.data && result.data.formattedThought) {
                                return result.data.formattedThought;
                            }
                            break;
                    }
                }
                
                return `${status} **${action}** completed successfully${context}`;
            } else {
                return `${status} **${action}** failed: ${result.error}`;
            }
        }).join('\n');

        return `\n\n**Tool Execution:**\n${resultText}`;
    }
}
