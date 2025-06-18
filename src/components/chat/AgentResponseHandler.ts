import { App, Notice, MarkdownRenderer } from 'obsidian';
import MyPlugin from '../../main';
import { ToolCommand, ToolResult, Message, ReasoningData, TaskStatus, ToolExecutionResult } from '../../types';
import { CommandParser } from './CommandParser';
import { ToolRegistry } from './ToolRegistry';
import { ToolRichDisplay } from './ToolRichDisplay';
// Import all tool management from toolcollect for dynamic tool loading
import { getAllToolClasses, createToolInstances } from './tools/toolcollect';

export interface AgentContext {
    app: App;
    plugin: MyPlugin;
    messagesContainer: HTMLElement;
    onToolResult: (toolResult: ToolResult, command: ToolCommand) => void;
    onToolDisplay?: (display: ToolRichDisplay) => void;
}

export class AgentResponseHandler {
    private commandParser: CommandParser;
    private toolRegistry: ToolRegistry;
    private executionCount: number = 0;
    private temporaryMaxToolCalls?: number; // Temporary increase for tool call limit
    private toolDisplays: Map<string, ToolRichDisplay> = new Map(); // Track tool displays

    constructor(private context: AgentContext) {
        this.commandParser = new CommandParser();
        this.toolRegistry = new ToolRegistry();
        this.initializeTools();
    }    private initializeTools() {
        // Register all available tools using the centralized tool creation function
        const tools = createToolInstances(this.context.app);
        for (const tool of tools) {
            this.toolRegistry.register(tool);
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
        // Essential debug: Log agent mode status and response content together
        console.log('AgentResponseHandler: processResponse called', {
            agentModeEnabled: this.context.plugin.isAgentModeEnabled(),
            response
        });
        
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
        
        // Essential debug: Log found commands only
        console.log('AgentResponseHandler: Found commands:', commands);

        if (commands.length === 0) {
            console.log('AgentResponseHandler: No commands found, returning original text');
            return {
                processedText: text,
                toolResults: [],
                hasTools: false
            };
        }        // Check execution limits
        const agentSettings = this.context.plugin.getAgentModeSettings();
        const effectiveLimit = this.getEffectiveToolLimit();
        if (this.executionCount >= effectiveLimit) {
            new Notice(`Agent mode: Maximum tool calls (${effectiveLimit}) reached`);
            return {
                processedText: text + `\n\n*${effectiveLimit} [Tool execution limit reached]*`,
                toolResults: [],
                hasTools: true
            };
        }

        // Execute tools
        const toolResults: Array<{ command: ToolCommand; result: ToolResult }> = [];
        
        for (const command of commands) {
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

                // Create and manage rich tool display
                this.createToolDisplay(command, result);

                // Notify context about tool result
                this.context.onToolResult(result, command);

                // Stop if we hit the effective limit
                if (this.executionCount >= effectiveLimit) {
                    console.log(`AgentResponseHandler: Reached maximum tool calls limit (${effectiveLimit})`);
                    break;
                }
            } catch (error: any) {
                console.error(`AgentResponseHandler: Tool '${command.action}' failed with error:`, error);
                
                const errorResult: ToolResult = {
                    success: false,
                    error: `Tool execution failed: ${error.message}`,
                    requestId: command.requestId                };
                toolResults.push({ command, result: errorResult });
                
                // Create tool display for error case too
                this.createToolDisplay(command, errorResult);
                
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
    }    /**
     * Reset execution count (call at start of new conversation)
     */
    resetExecutionCount() {
        this.executionCount = 0;
        this.temporaryMaxToolCalls = undefined; // Also reset temporary limit
        this.toolDisplays.clear(); // Clear all tool displays
        console.log('AgentResponseHandler: Execution count, temporary limits, and tool displays reset');
    }

    /**
     * Get available tools information
     */
    getAvailableTools() {
        return this.toolRegistry.getAvailableTools();
    }

    /**
     * Get all current tool displays
     */
    getToolDisplays(): Map<string, ToolRichDisplay> {
        return new Map(this.toolDisplays);
    }

    /**
     * Clear all tool displays
     */
    clearToolDisplays(): void {
        this.toolDisplays.clear();
    }

    /**
     * Get tool execution statistics
     */
    getExecutionStats() {
        const effectiveLimit = this.getEffectiveToolLimit();
        return {
            executionCount: this.executionCount,
            maxToolCalls: effectiveLimit,
            remaining: Math.max(0, effectiveLimit - this.executionCount)
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
     * Create and manage rich tool display
     */
    private createToolDisplay(command: ToolCommand, result: ToolResult): void {
        const displayId = `${command.action}-${command.requestId || Date.now()}`;
        
        const toolDisplay = new ToolRichDisplay({
            command,
            result,
            onRerun: () => {
                // Re-execute the tool with the same parameters
                this.rerunTool(command);
            },
            onCopy: async () => {
                const displayText = this.formatToolForCopy(command, result);
                try {
                    await navigator.clipboard.writeText(displayText);
                    console.log('Tool result copied to clipboard');
                } catch (error) {
                    console.error('Failed to copy tool result:', error);
                }
            }
        });

        // Store the display for later reference
        this.toolDisplays.set(displayId, toolDisplay);

        // Notify context if callback is available
        if (this.context.onToolDisplay) {
            this.context.onToolDisplay(toolDisplay);
        }
    }

    /**
     * Re-run a tool with the same parameters
     */
    private async rerunTool(originalCommand: ToolCommand): Promise<void> {
        try {
            const agentSettings = this.context.plugin.getAgentModeSettings();
            const result = await this.executeToolWithTimeout(originalCommand, agentSettings.timeoutMs);
            
            // Find and update the existing display
            const displayId = `${originalCommand.action}-${originalCommand.requestId || Date.now()}`;
            const existingDisplay = this.toolDisplays.get(displayId);
            if (existingDisplay) {
                existingDisplay.updateResult(result);
            }
            
            // Notify context about the new result
            this.context.onToolResult(result, originalCommand);
            
        } catch (error: any) {
            console.error(`Failed to re-run tool ${originalCommand.action}:`, error);
        }
    }

    /**
     * Format tool execution for clipboard copy
     */
    private formatToolForCopy(command: ToolCommand, result: ToolResult): string {
        const status = result.success ? 'SUCCESS' : 'ERROR';
        const params = JSON.stringify(command.parameters, null, 2);
        const resultData = result.success 
            ? JSON.stringify(result.data, null, 2)
            : result.error;
        
        return `TOOL EXECUTION: ${command.action}
STATUS: ${status}
PARAMETERS:
${params}
RESULT:
${resultData}`;
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
                                // Instead of creating collapsible element, always return formatted thought text
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
    }    /**
     * Check if tool execution limit has been reached
     */
    isToolLimitReached(): boolean {
        const effectiveLimit = this.getEffectiveToolLimit();
        return this.executionCount >= effectiveLimit;
    }

    /**
     * Get remaining tool executions
     */
    getRemainingToolExecutions(): number {
        const effectiveLimit = this.getEffectiveToolLimit();
        return Math.max(0, effectiveLimit - this.executionCount);
    }    /**
     * Create tool limit warning UI element
     */
    createToolLimitWarning(): HTMLElement {
        const warning = document.createElement('div');
        warning.className = 'tool-limit-warning';
        
        const agentSettings = this.context.plugin.getAgentModeSettings();
        const effectiveLimit = this.getEffectiveToolLimit();
        
        warning.innerHTML = `
            <div class="tool-limit-warning-text">
                <strong>⚠️ Tool execution limit reached</strong><br>
                Used ${this.executionCount}/${effectiveLimit} tool calls. 
                Choose how to proceed:
            </div>
            <div class="tool-limit-warning-actions">
                <div class="tool-limit-input-group">
                    <label for="additional-tools">Add more executions:</label>
                    <input type="number" id="additional-tools" min="1" max="50" value="${agentSettings.maxToolCalls}" placeholder="5">
                    <button class="ai-chat-add-tools-button">Add & Continue</button>
                </div>
                <div class="tool-limit-button-group">
                    <button class="ai-chat-continue-button">Reset & Continue</button>
                    <span class="tool-limit-settings-link">Open Settings</span>
                </div>
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

        const addToolsButton = warning.querySelector('.ai-chat-add-tools-button') as HTMLElement;
        if (addToolsButton) {
            addToolsButton.onclick = () => {
                const input = warning.querySelector('#additional-tools') as HTMLInputElement;
                const additionalTools = parseInt(input.value) || agentSettings.maxToolCalls;
                
                if (additionalTools > 0) {
                    this.addToolExecutions(additionalTools);
                    warning.remove();
                    // Trigger task continuation with additional tools
                    this.context.messagesContainer.dispatchEvent(new CustomEvent('continueTaskWithAdditionalTools', {
                        detail: { additionalTools }
                    }));
                }
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
        // Progress indicator removed
    }

    /**
     * Hide task progress indicator
     */
    hideTaskProgress(): void {
        // Progress indicator removed
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

    /**
     * Add additional tool executions to the current limit (temporary increase)
     */
    addToolExecutions(additionalCount: number) {
        const agentSettings = this.context.plugin.getAgentModeSettings();
        // Temporarily increase the limit for this session
        this.temporaryMaxToolCalls = (this.temporaryMaxToolCalls || agentSettings.maxToolCalls) + additionalCount;
        console.log(`AgentResponseHandler: Added ${additionalCount} tool executions. New limit: ${this.temporaryMaxToolCalls}`);
    }

    /**
     * Get current effective tool limit (considering temporary increases)
     */
    private getEffectiveToolLimit(): number {
        const agentSettings = this.context.plugin.getAgentModeSettings();
        return this.temporaryMaxToolCalls || agentSettings.maxToolCalls;
    }
}
