import { App, Notice, MarkdownRenderer } from 'obsidian';
import MyPlugin from '../../../main';
import { ToolCommand, ToolResult, Message, ReasoningData, TaskStatus, ToolExecutionResult } from '../../../types';
import { CommandParser } from '../CommandParser';
import { ToolRegistry } from './ToolRegistry';
import { ToolRichDisplay } from './ToolRichDisplay';
// Import all tool management from toolcollect for dynamic tool loading
import { createToolInstances } from './tools/toolcollect';

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
    private toolMarkdownCache: Map<string, string> = new Map(); // Cache markdown representations

    constructor(private context: AgentContext) {
        if (this.context.plugin && typeof this.context.plugin.debugLog === 'function') {
            this.context.plugin.debugLog('debug', '[AgentResponseHandler] constructor called');
        }
        this.commandParser = new CommandParser(this.context.plugin);
        this.toolRegistry = new ToolRegistry(this.context.plugin);
        this.initializeTools();
    }

    private initializeTools() {
        if (this.context.plugin && typeof this.context.plugin.debugLog === 'function') {
            this.context.plugin.debugLog('debug', '[AgentResponseHandler] initializeTools called');
        }
        // Register all available tools using the centralized tool creation function
        const tools = createToolInstances(this.context.app, this.context.plugin);
        for (const tool of tools) {
            this.toolRegistry.register(tool);
        }
    }

    /**
     * Process an AI response and handle any tool commands
     * @param response The AI response text
     * @param contextLabel Label for debugging
     * @param chatHistory Optional chat history to check for already executed commands
     * @returns Object containing processed text and execution results
     */
    async processResponse(response: string, contextLabel: string = "main", chatHistory?: any[]): Promise<{
        processedText: string;
        toolResults: Array<{ command: ToolCommand; result: ToolResult }>;
        hasTools: boolean;
    }> {
        if (this.context.plugin.settings.debugMode) {
            this.context.plugin.debugLog('debug', `[AgentResponseHandler][${contextLabel}] Processing response`, { response });
        }

        // Check if agent mode is enabled
        if (!this.context.plugin.isAgentModeEnabled()) {
            return {
                processedText: response,
                toolResults: [],
                hasTools: false
            };
        }

        // Parse response for tool commands
        const { text, commands } = this.commandParser.parseResponse(response);

        if (commands.length === 0) {
            if (this.context.plugin.settings.debugMode) {
                this.context.plugin.debugLog('debug', `[AgentResponseHandler][${contextLabel}] No tool commands found in response`);
            }
            return {
                processedText: text,
                toolResults: [],
                hasTools: false
            };
        }

        // Filter out commands that have already been executed (check chat history)
        const commandsToExecute = chatHistory ? 
            this.filterAlreadyExecutedCommands(commands, chatHistory, contextLabel) : 
            commands;

        if (commandsToExecute.length === 0) {
            if (this.context.plugin.settings.debugMode) {
                this.context.plugin.debugLog('debug', `[AgentResponseHandler][${contextLabel}] All commands already executed, skipping`);
            }
            
            // Return existing results from chat history if available
            const existingResults = this.getExistingToolResults(commands, chatHistory || []);
            return {
                processedText: text,
                toolResults: existingResults,
                hasTools: true
            };
        }        // Check execution limits
        const agentSettings = this.context.plugin.getAgentModeSettings();
        const effectiveLimit = this.getEffectiveToolLimit();
        if (this.executionCount >= effectiveLimit) {
            if (this.context.plugin.settings.debugMode) {
                this.context.plugin.debugLog('debug', `[AgentResponseHandler][${contextLabel}] Tool execution limit reached`, { executionCount: this.executionCount, effectiveLimit });
            }
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
                if (this.context.plugin.settings.debugMode) {
                    this.context.plugin.debugLog('debug', `[AgentResponseHandler][${contextLabel}] Executing tool`, { command });
                }
                const result = await this.executeToolWithTimeout(command, agentSettings.timeoutMs);
                const executionTime = Date.now() - startTime;
                if (this.context.plugin.settings.debugMode) {
                    this.context.plugin.debugLog('debug', `[AgentResponseHandler][${contextLabel}] Tool execution result`, { command, result, executionTime });
                }
                toolResults.push({ command, result });
                this.executionCount++;

                // Create and display tool result in real-time
                if (this.context.onToolDisplay) {
                    const richDisplay = new ToolRichDisplay({
                        command,
                        result,
                        onRerun: () => this.rerunTool(command),
                        onCopy: async () => {
                            const displayText = this.generateToolMarkdown(command, result);
                            try {
                                await navigator.clipboard.writeText(displayText);
                            } catch (error) {
                                console.error('Failed to copy tool result:', error);
                            }
                        }
                    });
                    this.context.onToolDisplay(richDisplay);
                }

                // Also cache markdown for message content persistence
                this.cacheToolMarkdown(command, result);

                // Notify context about tool result
                this.context.onToolResult(result, command);

                // Stop if we hit the effective limit
                if (this.executionCount >= effectiveLimit) {
                    // Removed redundant console.log for cleaner production code.
                    break;
                }
            } catch (error: any) {
                if (this.context.plugin.settings.debugMode) {
                    this.context.plugin.debugLog('debug', `[AgentResponseHandler][${contextLabel}] Tool execution error`, { command, error });
                }
                console.error(`AgentResponseHandler: Tool '${command.action}' failed with error:`, error);
                
                const errorResult: ToolResult = {
                    success: false,
                    error: `Tool execution failed: ${error.message}`,
                    requestId: command.requestId                };
                toolResults.push({ command, result: errorResult });
                
                // Create and display error result in real-time
                if (this.context.onToolDisplay) {
                    const richDisplay = new ToolRichDisplay({
                        command,
                        result: errorResult,
                        onRerun: () => this.rerunTool(command),
                        onCopy: async () => {
                            const displayText = this.generateToolMarkdown(command, errorResult);
                            try {
                                await navigator.clipboard.writeText(displayText);
                            } catch (error) {
                                console.error('Failed to copy tool result:', error);
                            }
                        }
                    });
                    this.context.onToolDisplay(richDisplay);
                }
                
                // Also cache markdown for message content persistence
                this.cacheToolMarkdown(command, errorResult);
                
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
        this.toolMarkdownCache.clear(); // Clear markdown cache
        // Removed redundant console.log for cleaner production code.
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
        this.toolMarkdownCache.clear();
    }

    /**
     * Get all tool markdown representations
     */
    getToolMarkdown(): string[] {
        return Array.from(this.toolMarkdownCache.values());
    }    /**
     * Get combined tool markdown for saving
     */
    getCombinedToolMarkdown(): string {
        const markdowns = this.getToolMarkdown();
        // Removed redundant console.log for cleaner production code.
        return markdowns.join('\n');
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
     * Shared formatter for tool results (for DRY)
     */
    private formatToolResultLine(command: ToolCommand, result: ToolResult, opts?: { markdown?: boolean }): string {
        const status = result.success ? (opts?.markdown ? '✅' : '✓') : (opts?.markdown ? '❌' : '✗');
        const action = command.action.replace('_', ' ');
        let context = '';
        if (result.success && result.data) {
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
                        return result.data.formattedThought;
                    }
                    break;
            }
        }
        if (opts?.markdown) {
            return `${status} **${action}** completed successfully${context}`;
        } else {
            const data = result.success ? JSON.stringify(result.data, null, 2) : result.error;
            return `${status} Tool: ${command.action}\nParameters: ${JSON.stringify(command.parameters, null, 2)}\nResult: ${data}`;
        }
    }

    /**
     * Format tool results for display in chat (markdown style)
     */
    formatToolResultsForDisplay(toolResults: Array<{ command: ToolCommand; result: ToolResult }>): string {
        if (toolResults.length === 0) {
            return '';
        }
        const resultText = toolResults.map(({ command, result }) => this.formatToolResultLine(command, result, { markdown: true })).join('\n');
        return `\n\n**Tool Execution:**\n${resultText}`;
    }

    /**
     * Create a message with tool execution results for context (plain style)
     */
    createToolResultMessage(toolResults: Array<{ command: ToolCommand; result: ToolResult }>): Message | null {
        if (toolResults.length === 0) {
            return null;
        }
        const resultText = toolResults.map(({ command, result }) => this.formatToolResultLine(command, result)).join('\n\n');
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
                    // Removed redundant console.log for cleaner production code.
                } catch (error) {
                    console.error('Failed to copy tool result:', error);
                }
            }
        });        // Store the display for later reference
        this.toolDisplays.set(displayId, toolDisplay);
          // Cache the markdown representation
        const markdown = toolDisplay.toMarkdown();
        this.toolMarkdownCache.set(displayId, markdown);
        // Removed redundant console.log for cleaner production code.

        // Notify context if callback is available
        if (this.context.onToolDisplay) {
            this.context.onToolDisplay(toolDisplay);
        }

        // Cache the markdown representation
        this.cacheToolMarkdown(command, result);
    }

    /**
     * Cache tool markdown representation
     */
    private cacheToolMarkdown(command: ToolCommand, result: ToolResult): void {
        const cacheKey = `${command.action}-${command.requestId}`;
        const markdown = this.generateToolMarkdown(command, result);
        this.toolMarkdownCache.set(cacheKey, markdown);
    }

    /**
     * Generate markdown for tool display
     */
    private generateToolMarkdown(command: ToolCommand, result: ToolResult): string {
        const status = result.success ? 'SUCCESS' : 'ERROR';
        const params = JSON.stringify(command.parameters, null, 2);
        const resultData = result.success 
            ? JSON.stringify(result.data, null, 2)
            : result.error;
        
        return `### TOOL EXECUTION: ${command.action}
**Status:** ${status}

**Parameters:**
\`\`\`json
${params}
\`\`\`

**Result:**
\`\`\`json
${resultData}
\`\`\``;
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
                // Update cached markdown
                this.toolMarkdownCache.set(displayId, existingDisplay.toMarkdown());
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
                    title: step.title,
                    content: step.content
                })),
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
    async processResponseWithUI(response: string, contextLabel: string = "ui", chatHistory?: any[]): Promise<{
        processedText: string;
        toolResults: Array<{ command: ToolCommand; result: ToolResult }>;
        hasTools: boolean;
        reasoning?: ReasoningData;
        taskStatus: TaskStatus;
        shouldShowLimitWarning: boolean;
    }> {
        // Process the response normally with chat history check
        const result = await this.processResponse(response, contextLabel, chatHistory);
        
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
        // Removed redundant console.log for cleaner production code.
    }

    /**
     * Get current effective tool limit (considering temporary increases)
     */
    private getEffectiveToolLimit(): number {
        const agentSettings = this.context.plugin.getAgentModeSettings();
        return this.temporaryMaxToolCalls || agentSettings.maxToolCalls;
    }

    /**
     * Filter out commands that have already been executed based on chat history
     */
    private filterAlreadyExecutedCommands(commands: ToolCommand[], chatHistory: any[], contextLabel: string): ToolCommand[] {
        const filteredCommands: ToolCommand[] = [];
        
        for (const command of commands) {
            const commandKey = this.generateCommandKey(command);
            const alreadyExecuted = this.isCommandInChatHistory(commandKey, chatHistory);
            
            if (alreadyExecuted) {
                if (this.context.plugin.settings.debugMode) {
                    this.context.plugin.debugLog('debug', `[AgentResponseHandler][${contextLabel}] Skipping already executed command`, { command, commandKey });
                }
            } else {
                filteredCommands.push(command);
            }
        }
        
        return filteredCommands;
    }

    /**
     * Get existing tool results from chat history for already executed commands
     */
    private getExistingToolResults(commands: ToolCommand[], chatHistory: any[]): Array<{ command: ToolCommand; result: ToolResult }> {
        const existingResults: Array<{ command: ToolCommand; result: ToolResult }> = [];
        
        for (const command of commands) {
            const commandKey = this.generateCommandKey(command);
            const existingResult = this.findToolResultInChatHistory(commandKey, chatHistory);
            
            if (existingResult) {
                existingResults.push({ command, result: existingResult });
            }
        }
        
        return existingResults;
    }

    /**
     * Generate a unique key for a command to check for duplicates
     */
    private generateCommandKey(command: ToolCommand): string {
        // Create a key based on action, parameters, and requestId
        const params = JSON.stringify(command.parameters || {});
        return `${command.action}:${params}:${command.requestId || 'no-id'}`;
    }

    /**
     * Check if a command has already been executed by looking in chat history
     */
    private isCommandInChatHistory(commandKey: string, chatHistory: any[]): boolean {
        for (const message of chatHistory) {
            if (message.sender === 'assistant' && message.toolResults) {
                for (const toolResult of message.toolResults) {
                    const existingKey = this.generateCommandKey(toolResult.command);
                    if (existingKey === commandKey) {
                        return true;
                    }
                }
            }
        }
        return false;
    }

    /**
     * Find existing tool result in chat history
     */
    private findToolResultInChatHistory(commandKey: string, chatHistory: any[]): ToolResult | null {
        for (const message of chatHistory) {
            if (message.sender === 'assistant' && message.toolResults) {
                for (const toolResult of message.toolResults) {
                    const existingKey = this.generateCommandKey(toolResult.command);
                    if (existingKey === commandKey) {
                        return toolResult.result;
                    }
                }
            }
        }
        return null;
    }
}
