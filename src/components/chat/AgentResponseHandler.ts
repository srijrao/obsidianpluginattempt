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
            console.log(`AgentResponseHandler: Executing tool '${command.action}' with parameters:`, command.parameters);
            
            try {
                const startTime = Date.now();
                const result = await this.executeToolWithTimeout(command, agentSettings.timeoutMs);
                const executionTime = Date.now() - startTime;
                
                console.log(`AgentResponseHandler: Tool '${command.action}' completed in ${executionTime}ms:`, {
                    success: result.success,
                    hasData: !!result.data,
                    error: result.error
                });
                
                toolResults.push({ command, result });
                this.executionCount++;

                // Notify context about tool result
                this.context.onToolResult(result, command);

                // Stop if we hit the limit
                if (this.executionCount >= agentSettings.maxToolCalls) {
                    console.log(`AgentResponseHandler: Reached maximum tool calls limit (${agentSettings.maxToolCalls})`);
                    break;
                }
            } catch (error: any) {
                console.error(`AgentResponseHandler: Tool '${command.action}' failed with error:`, error);
                
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
     * Helper to ensure a file path is relative to the vault root and strips .md extension for Obsidian links
     */
    private getRelativePath(filePath: string): string {
        const adapter: any = this.context.app.vault.adapter;
        const vaultRoot = adapter?.basePath ? adapter.basePath.replace(/\\/g, '/') : '';
        let relPath = filePath.replace(/\\/g, '/');
        if (vaultRoot && relPath.startsWith(vaultRoot)) {
            relPath = relPath.slice(vaultRoot.length);
            if (relPath.startsWith('/')) relPath = relPath.slice(1);
        }
        // Strip .md extension for Obsidian links
        if (relPath.toLowerCase().endsWith('.md')) {
            relPath = relPath.slice(0, -3);
        }
        return relPath;
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
                        case 'file_read':
                        case 'file_diff':
                            if (result.data.filePath) {
                                const relPath = this.getRelativePath(result.data.filePath);
                                context = ` [[${relPath}]]`;
                            }
                            break;
                        case 'file_select':
                            if (result.data.count !== undefined) {
                                context = ` [[${result.data.count} files found]]`;
                            }
                            break;
                        case 'thought':
                            if (result.data && result.data.formattedThought) {
                                // Check if this was structured reasoning
                                if (result.data.reasoning === 'structured') {
                                    return this.createCollapsibleReasoning(result.data);
                                }
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

    /**
     * Create a collapsible reasoning display for structured reasoning results
     */
    private createCollapsibleReasoning(reasoningData: any): string {
        const { problem, steps, totalSteps, depth } = reasoningData;
        const collapsibleId = 'reasoning-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
        
        // Create placeholder that will be replaced with interactive UI
        let html = `<div id="reasoning-placeholder-${collapsibleId}" class="reasoning-placeholder">`;
        html += `🧠 REASONING SESSION (${totalSteps} steps, ${depth} depth) - Loading interactive display...`;
        html += `</div>`;
        
        // Inject the interactive UI asynchronously
        setTimeout(() => {
            this.injectReasoningUI(collapsibleId, problem, steps, totalSteps, depth);
        }, 100);
        
        return html;
    }

    /**
     * Inject interactive reasoning UI into the DOM
     */
    private injectReasoningUI(
        collapsibleId: string, 
        problem: string, 
        steps: any[], 
        totalSteps: number, 
        depth: string
    ) {
        const placeholder = this.context.messagesContainer.querySelector(`#reasoning-placeholder-${collapsibleId}`);
        if (!placeholder) return;

        // Create the main container
        const container = document.createElement('div');
        container.className = 'reasoning-container';

        // Create the summary/header (clickable)
        const summary = document.createElement('div');
        summary.className = 'reasoning-summary';
        
        const toggle = document.createElement('span');
        toggle.className = 'reasoning-toggle';
        toggle.textContent = '▶';

        const summaryText = document.createElement('span');
        summaryText.innerHTML = `<strong>🧠 REASONING SESSION</strong> (${totalSteps} steps, ${depth} depth) - <em>Click to view details</em>`;
        
        summary.appendChild(toggle);
        summary.appendChild(summaryText);

        // Create the details container (initially hidden)
        const details = document.createElement('div');
        details.className = 'reasoning-details';

        // Add problem statement
        const problemDiv = document.createElement('div');
        problemDiv.className = 'reasoning-problem';
        problemDiv.innerHTML = `<strong>Problem:</strong> ${problem || 'No problem statement provided'}`;
        details.appendChild(problemDiv);

        // Add reasoning steps
        if (steps && steps.length > 0) {
            steps.forEach((step: any) => {
                const stepDiv = document.createElement('div');
                stepDiv.className = `reasoning-step ${step.category}`;

                const categoryEmoji = this.getStepEmoji(step.category);
                const confidenceBar = '●'.repeat(Math.floor(step.confidence || 5)) + '○'.repeat(10 - Math.floor(step.confidence || 5));

                stepDiv.innerHTML = `
                    <div class="step-header">
                        ${categoryEmoji} Step ${step.step}: ${step.title?.toUpperCase() || 'UNTITLED'}
                    </div>
                    <div class="step-confidence">
                        Confidence: ${step.confidence || 5}/10 <span class="confidence-bar">${confidenceBar}</span>
                    </div>
                    <div class="step-content">
                        ${step.content || 'No content provided'}
                    </div>
                `;

                details.appendChild(stepDiv);
            });
        }

        // Add completion message
        const completion = document.createElement('div');
        completion.className = 'reasoning-completion';
        completion.textContent = `✅ Analysis completed in ${totalSteps} structured steps`;
        details.appendChild(completion);

        // Add click handler for toggle
        let isExpanded = false;
        summary.addEventListener('click', () => {
            isExpanded = !isExpanded;
            if (isExpanded) {
                details.classList.add('expanded');
                toggle.textContent = '▼';
                summaryText.innerHTML = `<strong>🧠 REASONING SESSION</strong> (${totalSteps} steps, ${depth} depth) - <em>Click to collapse</em>`;
            } else {
                details.classList.remove('expanded');
                toggle.textContent = '▶';
                summaryText.innerHTML = `<strong>🧠 REASONING SESSION</strong> (${totalSteps} steps, ${depth} depth) - <em>Click to view details</em>`;
            }
        });

        // Assemble the UI
        container.appendChild(summary);
        container.appendChild(details);

        // Replace the placeholder
        placeholder.replaceWith(container);
    }

    /**
     * Get color for reasoning step categories
     */
    private getStepColor(category: string): string {
        switch (category) {
            case 'analysis': return '#4f46e5';
            case 'information': return '#059669';
            case 'approach': return '#dc2626';
            case 'evaluation': return '#7c2d12';
            case 'synthesis': return '#7c3aed';
            case 'validation': return '#16a34a';
            case 'refinement': return '#ea580c';
            case 'conclusion': return '#1d4ed8';
            case 'planning': return '#be123c';
            default: return '#6b7280';
        }
    }

    /**
     * Get emoji for reasoning step categories
     */
    private getStepEmoji(category: string): string {
        switch (category) {
            case 'analysis': return '🔍';
            case 'information': return '📊';
            case 'approach': return '🎯';
            case 'evaluation': return '⚖️';
            case 'synthesis': return '🔗';
            case 'validation': return '✅';
            case 'refinement': return '⚡';
            case 'conclusion': return '🎯';
            case 'planning': return '📋';
            default: return '💭';
        }
    }
}
