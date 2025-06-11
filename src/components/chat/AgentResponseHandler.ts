import { App, Notice, MarkdownRenderer } from 'obsidian';
import MyPlugin from '../../main';
import { ToolCommand, ToolResult, Message, ReasoningData, TaskStatus, ToolExecutionResult } from '../../types';
import { CommandParser } from './CommandParser';
import { ToolRegistry } from './ToolRegistry';
import { FileSelectTool } from './tools/FileSelectTool';
import { FileReadTool } from './tools/FileReadTool';
import { FileWriteTool } from './tools/FileWriteTool';
import { FileDiffTool } from './tools/FileDiffTool';
import { ThoughtTool } from './tools/ThoughtTool';
import * as fs from 'fs';
import * as path from 'path';
import { getAllToolClasses } from './tools/toolcollect';

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
        // Register all available tools dynamically using toolcollect
        const toolClasses = getAllToolClasses();
        for (const ToolClass of toolClasses) {
            this.toolRegistry.register(new ToolClass(this.context.app));
        }
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
                                    return this.createCollapsibleReasoningElement(result.data);
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
     * Create a collapsible reasoning display for structured reasoning results (returns DOM element, not HTML string)
     */
    private async createCollapsibleReasoningElement(reasoningData: any): Promise<HTMLElement> {
        const { problem, steps, totalSteps, depth } = reasoningData;
        const collapsibleId = 'reasoning-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);

        const container = document.createElement('div');
        container.className = 'reasoning-container';
        container.id = collapsibleId;

        const summary = document.createElement('div');
        summary.className = 'reasoning-summary';
        
        const toggle = document.createElement('span');
        toggle.className = 'reasoning-toggle';
        toggle.textContent = '▶';

        const summaryText = document.createElement('span');
        summaryText.innerHTML = `<strong>🧠 REASONING SESSION</strong> (${totalSteps} steps, ${depth} depth) - <em>Click to view details</em>`;
        
        summary.appendChild(toggle);
        summary.appendChild(summaryText);

        const details = document.createElement('div');
        details.className = 'reasoning-details';

        const problemDiv = document.createElement('div');
        problemDiv.className = 'reasoning-problem';
        problemDiv.innerHTML = `<strong>Problem:</strong> ${problem || 'No problem statement provided'}`;
        details.appendChild(problemDiv);

        if (steps && steps.length > 0) {
            for (const step of steps) {
                const stepDiv = document.createElement('div');
                stepDiv.className = `reasoning-step ${step.category}`;
                const categoryEmoji = this.getStepEmoji(step.category);
                const confidenceBar = '●'.repeat(Math.floor(step.confidence || 5)) + '○'.repeat(10 - Math.floor(step.confidence || 5));
                stepDiv.innerHTML = `
                    <div class="step-header">${categoryEmoji} Step ${step.step}: ${step.title?.toUpperCase() || 'UNTITLED'}</div>
                    <div class="step-confidence">Confidence: ${step.confidence || 5}/10 <span class="confidence-bar">${confidenceBar}</span></div>
                    <div class="step-content"></div>
                `;
                // Render step content as Markdown
                const contentDiv = stepDiv.querySelector('.step-content');
                if (contentDiv) {
                    await MarkdownRenderer.render(
                        this.context.app,
                        step.content || 'No content provided',
                        contentDiv as HTMLElement,
                        '',
                        this.context.plugin
                    );
                }
                details.appendChild(stepDiv);
            }
        }

        const completion = document.createElement('div');
        completion.className = 'reasoning-completion';
        completion.textContent = `✅ Analysis completed in ${totalSteps} structured steps`;
        details.appendChild(completion);

        summary.addEventListener('click', () => {
            const isExpanded = details.classList.toggle('expanded');
            toggle.textContent = isExpanded ? '▼' : '▶';
            summaryText.innerHTML = `<strong>🧠 REASONING SESSION</strong> (${totalSteps} steps, ${depth} depth) - <em>Click to ${isExpanded ? 'collapse' : 'view details'}</em>`;
        });

        container.appendChild(summary);
        container.appendChild(details);

        return container;
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

    /**
     * Process tool results and extract reasoning data for enhanced message display
     */
    processToolResultsForMessage(toolResults: Array<{ command: ToolCommand; result: ToolResult }>): {
        reasoning?: ReasoningData;
        toolExecutionResults: ToolExecutionResult[];
    } {
        const toolExecutionResults: ToolExecutionResult[] = toolResults.map(({ command, result }) => ({
            command,
            result,
            timestamp: new Date().toISOString()
        }));

        // Look for reasoning from ThoughtTool results
        let reasoning: ReasoningData | undefined;
        
        for (const { command, result } of toolResults) {
            if (command.action === 'thought' && result.success && result.data) {
                reasoning = this.convertThoughtToolResultToReasoning(result.data);
                break; // Use the first reasoning result found
            }
        }

        return {
            reasoning,
            toolExecutionResults
        };
    }

    /**
     * Convert ThoughtTool result data to structured ReasoningData
     */
    private convertThoughtToolResultToReasoning(thoughtData: any): ReasoningData {
        const reasoningId = 'reasoning-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
        
        if (thoughtData.reasoning === 'structured' && thoughtData.steps) {
            // Structured reasoning from ThoughtTool
            return {
                id: reasoningId,
                timestamp: thoughtData.timestamp || new Date().toISOString(),
                type: 'structured',
                problem: thoughtData.problem,
                steps: thoughtData.steps.map((step: any) => ({
                    step: step.step,
                    category: step.category as any,
                    title: step.title,
                    content: step.content,
                    confidence: step.confidence
                })),
                confidence: thoughtData.steps[thoughtData.steps.length - 1]?.confidence || 7,
                depth: thoughtData.depth,
                isCollapsed: this.context.plugin.settings.uiBehavior?.collapseOldReasoning || false
            };
        } else {
            // Simple reasoning
            return {
                id: reasoningId,
                timestamp: thoughtData.timestamp || new Date().toISOString(),
                type: 'simple',
                summary: thoughtData.thought || thoughtData.formattedThought,
                confidence: thoughtData.confidence || 7,
                isCollapsed: this.context.plugin.settings.uiBehavior?.collapseOldReasoning || false
            };
        }
    }

    /**
     * Create task status object based on current execution state
     */
    createTaskStatus(status: TaskStatus['status'], progress?: TaskStatus['progress']): TaskStatus {
        const agentSettings = this.context.plugin.getAgentModeSettings();
        
        return {
            status,
            progress,
            toolExecutionCount: this.executionCount,
            maxToolExecutions: agentSettings.maxToolCalls,
            canContinue: status === 'limit_reached' || status === 'stopped',
            lastUpdateTime: new Date().toISOString()
        };
    }

    /**
     * Check if tool execution limit has been reached
     */
    isToolLimitReached(): boolean {
        const agentSettings = this.context.plugin.getAgentModeSettings();
        return this.executionCount >= agentSettings.maxToolCalls;
    }

    /**
     * Get remaining tool executions
     */
    getRemainingToolExecutions(): number {
        const agentSettings = this.context.plugin.getAgentModeSettings();
        return Math.max(0, agentSettings.maxToolCalls - this.executionCount);
    }

    /**
     * Create tool limit warning UI element
     */
    createToolLimitWarning(): HTMLElement {
        const warning = document.createElement('div');
        warning.className = 'tool-limit-warning';
        
        const agentSettings = this.context.plugin.getAgentModeSettings();
        
        warning.innerHTML = `
            <div class="tool-limit-warning-text">
                <strong>⚠️ Tool execution limit reached</strong><br>
                Used ${this.executionCount}/${agentSettings.maxToolCalls} tool calls. 
                You can increase the limit in settings or continue to resume the task.
            </div>
            <div class="tool-limit-warning-actions">
                <span class="tool-limit-settings-link" onclick="this.openSettings()">Settings</span>
                <button class="ai-chat-continue-button" onclick="this.continueTask()">Continue</button>
            </div>
        `;

        // Add event handlers
        const settingsLink = warning.querySelector('.tool-limit-settings-link') as HTMLElement;
        if (settingsLink) {
            settingsLink.onclick = () => {
                // Open plugin settings
                (this.context.app as any).setting.open();
                (this.context.app as any).setting.openTabById(this.context.plugin.manifest.id);
            };
        }

        const continueButton = warning.querySelector('.ai-chat-continue-button') as HTMLElement;
        if (continueButton) {
            continueButton.onclick = () => {
                this.resetExecutionCount();
                warning.remove();
                // Trigger task continuation (this would need to be handled by the chat view)
                this.context.messagesContainer.dispatchEvent(new CustomEvent('continueTask'));
            };
        }

        return warning;
    }

    /**
     * Create task completion notification
     */
    createTaskCompletionNotification(
        message: string, 
        type: 'success' | 'error' | 'warning' = 'success'
    ): HTMLElement {
        const notification = document.createElement('div');
        notification.className = `task-completion-notification ${type}`;
        
        notification.innerHTML = `
            <div style="display: flex; align-items: center; gap: 8px;">
                <span>${type === 'success' ? '✅' : type === 'error' ? '❌' : '⚠️'}</span>
                <span>${message}</span>
            </div>
        `;

        // Auto-remove after 5 seconds
        setTimeout(() => {
            notification.classList.add('show');
        }, 100);

        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => notification.remove(), 300);
        }, 5000);

        return notification;
    }

    /**
     * Show task completion notification
     */
    showTaskCompletionNotification(
        message: string, 
        type: 'success' | 'error' | 'warning' = 'success'
    ): void {
        if (!this.context.plugin.settings.uiBehavior?.showCompletionNotifications) {
            return;
        }

        const notification = this.createTaskCompletionNotification(message, type);
        document.body.appendChild(notification);
    }

    /**
     * Update task progress in UI
     */
    updateTaskProgress(current: number, total?: number, description?: string): void {
        // Find existing progress indicator or create new one
        let progressEl = this.context.messagesContainer.querySelector('.ai-chat-task-progress') as HTMLElement;
        
        if (!progressEl) {
            progressEl = document.createElement('div');
            progressEl.className = 'ai-chat-task-progress';
            
            // Insert before the input container
            const inputContainer = this.context.messagesContainer.parentElement?.querySelector('.ai-chat-input-container');
            if (inputContainer) {
                inputContainer.parentElement?.insertBefore(progressEl, inputContainer);
            }
        }

        // Update progress content
        let progressText = description || 'Processing...';
        if (total) {
            progressText = `${progressText} (${current}/${total})`;
        }

        progressEl.innerHTML = `
            <div class="spinner"></div>
            <span>${progressText}</span>
        `;

        progressEl.classList.add('active');
    }

    /**
     * Hide task progress indicator
     */
    hideTaskProgress(): void {
        const progressEl = this.context.messagesContainer.querySelector('.ai-chat-task-progress') as HTMLElement;
        if (progressEl) {
            progressEl.classList.remove('active');
            // Remove after animation
            setTimeout(() => progressEl.remove(), 300);
        }
    }

    /**
     * Enhanced tool result processing with UI integration
     */
    async processResponseWithUI(response: string): Promise<{
        processedText: string;
        toolResults: Array<{ command: ToolCommand; result: ToolResult }>;
        hasTools: boolean;
        reasoning?: ReasoningData;
        taskStatus: TaskStatus;
        shouldShowLimitWarning: boolean;
    }> {
        // Process the response normally
        const result = await this.processResponse(response);
        
        // Create task status
        let status: TaskStatus['status'] = 'completed';
        if (result.hasTools) {
            if (this.isToolLimitReached()) {
                status = 'limit_reached';
            } else {
                status = 'running';
            }
        }

        const taskStatus = this.createTaskStatus(status);
        
        // Extract reasoning from tool results
        const { reasoning } = this.processToolResultsForMessage(result.toolResults);
        
        // Determine if we should show limit warning
        const shouldShowLimitWarning = this.isToolLimitReached() && result.hasTools;

        return {
            ...result,
            reasoning,
            taskStatus,
            shouldShowLimitWarning
        };
    }
}
