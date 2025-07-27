import { MarkdownRenderer, App, Component } from 'obsidian';
import { Message, TaskStatus, ToolCommand, ToolResult, ToolExecutionResult } from '../../types';
import { ToolRichDisplay } from './ToolRichDisplay';
import { debugLog } from '../../utils/logger';

/**
 * MessageRenderer handles rendering of chat message content,
 * including enhanced reasoning, task status, and tool execution results.
 */
export class MessageRenderer {
    constructor(private app: App) {}

    /**
     * Updates a message container with enhanced reasoning and task status data.
     * Renders reasoning and task status sections above the message content.
     * @param container The message DOM element
     * @param messageData The message data (may include reasoning/taskStatus)
     * @param component Optional parent component for Markdown rendering
     */
    async updateMessageWithEnhancedData(container: HTMLElement, messageData: Message, component?: Component): Promise<void> {
        debugLog(true, 'debug', '[MessageRenderer] updateMessageWithEnhancedData called', { messageData });

        // Remove existing reasoning/task status sections if present
        const existingReasoning = container.querySelector('.reasoning-container');
        const existingTaskStatus = container.querySelector('.task-status-container');
        if (existingReasoning) existingReasoning.remove();
        if (existingTaskStatus) existingTaskStatus.remove();

        const messageContainer = container.querySelector('.message-container');
        if (!messageContainer) return;

        // Render reasoning section if present
        if (messageData.reasoning) {
            const reasoningEl = this.createReasoningSection(messageData.reasoning);
            messageContainer.insertBefore(reasoningEl, messageContainer.firstChild);
        }

        // Render task status section if present
        if (messageData.taskStatus) {
            const taskStatusEl = this.createTaskStatusSection(messageData.taskStatus);
            messageContainer.insertBefore(taskStatusEl, messageContainer.firstChild);
        }

        // Render the main message content using the appropriate method
        if (messageData.toolResults && messageData.toolResults.length > 0) {
            // Use renderMessage which will handle tool displays properly
            await this.renderMessage(messageData, container, component);
        } else {
            // Render regular content
            const contentEl = container.querySelector('.message-content') as HTMLElement;
            if (contentEl) {
                contentEl.empty();
                MarkdownRenderer.render(
                    this.app,
                    messageData.content,
                    contentEl,
                    '',
                    component || new Component()
                ).catch((error) => {
                    contentEl.textContent = messageData.content;
                });
            }
        }
    }

    /**
     * Creates a reasoning section element for display above the message.
     * Supports structured and summary reasoning.
     * @param reasoning The reasoning data object
     * @returns HTMLElement for the reasoning section
     */
    createReasoningSection(reasoning: any): HTMLElement {
        debugLog(true, 'debug', '[MessageRenderer] createReasoningSection called', { reasoning });
        const reasoningContainer = document.createElement('div');
        reasoningContainer.className = 'reasoning-container';

        const header = document.createElement('div');
        header.className = 'reasoning-summary';

        const toggle = document.createElement('span');
        toggle.className = 'reasoning-toggle';
        toggle.textContent = reasoning.isCollapsed ? '▶' : '▼';

        const headerText = document.createElement('span');
        const typeLabel = reasoning.type === 'structured' ? 'STRUCTURED REASONING' : 'REASONING';
        const stepCount = reasoning.steps?.length || 0;
        headerText.innerHTML = `<strong>🧠 ${typeLabel}</strong>`;
        if (stepCount > 0) {
            headerText.innerHTML += ` (${stepCount} steps)`;
        }
        headerText.innerHTML += ` - <em>Click to ${reasoning.isCollapsed ? 'expand' : 'collapse'}</em>`;

        header.appendChild(toggle);
        header.appendChild(headerText);

        const details = document.createElement('div');
        details.className = 'reasoning-details';
        if (!reasoning.isCollapsed) {
            details.classList.add('expanded');
        }

        // Render structured steps or summary
        if (reasoning.type === 'structured' && reasoning.steps) {
            if (reasoning.problem) {
                const problemDiv = document.createElement('div');
                problemDiv.className = 'reasoning-problem';
                problemDiv.innerHTML = `<strong>Problem:</strong> ${reasoning.problem}`;
                details.appendChild(problemDiv);
            }

            reasoning.steps.forEach((step: any) => {
                const stepDiv = document.createElement('div');
                stepDiv.className = `reasoning-step ${step.category}`;
                stepDiv.innerHTML = `
                    <div class="step-header">
                        ${this.getStepEmoji(step.category)} Step ${step.step}: ${step.title.toUpperCase()}
                    </div>
                    <div class="step-confidence">
                        Confidence: ${step.confidence}/10
                    </div>
                    <div class="step-content">
                        ${step.content}
                    </div>
                `;
                details.appendChild(stepDiv);
            });
        } else if (reasoning.summary) {
            const summaryDiv = document.createElement('div');
            summaryDiv.className = 'reasoning-completion';
            summaryDiv.textContent = reasoning.summary;
            details.appendChild(summaryDiv);
        }

        // Toggle expand/collapse on header click
        header.addEventListener('click', () => {
            const isExpanded = details.classList.contains('expanded');
            if (isExpanded) {
                details.classList.remove('expanded');
                toggle.textContent = '▶';
                reasoning.isCollapsed = true;
            } else {
                details.classList.add('expanded');
                toggle.textContent = '▼';
                reasoning.isCollapsed = false;
            }
        });

        reasoningContainer.appendChild(header);
        reasoningContainer.appendChild(details);

        return reasoningContainer;
    }

    /**
     * Creates a task status section element for display above the message.
     * @param taskStatus The task status object
     * @returns HTMLElement for the task status section
     */
    createTaskStatusSection(taskStatus: TaskStatus): HTMLElement {
        const statusContainer = document.createElement('div');
        statusContainer.className = 'task-status-container';
        statusContainer.dataset.taskStatus = taskStatus.status;

        const statusText = this.getTaskStatusText(taskStatus);
        const statusIcon = this.getTaskStatusIcon(taskStatus.status);

        statusContainer.innerHTML = `
            <div class="task-status-header">
                ${statusIcon} <strong>${statusText}</strong>
            </div>
        `;

        if (taskStatus.toolExecutionCount > 0) {
            const toolInfo = document.createElement('div');
            toolInfo.className = 'task-tool-info';
            toolInfo.textContent = `Tools used: ${taskStatus.toolExecutionCount}/${taskStatus.maxToolExecutions}`;
            statusContainer.appendChild(toolInfo);
        }

        return statusContainer;
    }

    /**
     * Returns an emoji for a reasoning step category.
     */
    private getStepEmoji(category: string): string {
        switch (category) {
            case 'analysis': return '🔍';
            case 'planning': return '📋';
            case 'problem-solving': return '🧩';
            case 'reflection': return '🤔';
            case 'conclusion': return '✅';
            case 'reasoning': return '🧠';
            case 'information': return '📊';
            case 'approach': return '🎯';
            case 'evaluation': return '⚖️';
            case 'synthesis': return '🔗';
            case 'validation': return '✅';
            case 'refinement': return '⚡';
            default: return '💭';
        }
    }

    /**
     * Returns a user-friendly status text for a task status.
     */
    private getTaskStatusText(taskStatus: TaskStatus): string {
        switch (taskStatus.status) {
            case 'idle': return 'Task Ready';
            case 'running': return 'Task In Progress';
            case 'stopped': return 'Task Stopped';
            case 'completed': return 'Task Completed';
            case 'limit_reached': return 'Tool Limit Reached';
            case 'waiting_for_user': return 'Waiting for User Input';
            default: return 'Unknown Status';
        }
    }

    /**
     * Returns an emoji icon for a task status.
     */
    private getTaskStatusIcon(status: string): string {
        switch (status) {
            case 'idle': return '⏸️';
            case 'running': return '🔄';
            case 'stopped': return '⏹️';
            case 'completed': return '✅';
            case 'limit_reached': return '⚠️';
            case 'waiting_for_user': return '⏳';
            default: return '❓';
        }
    }

    /**
     * Render a complete message with tool displays if present.
     * @param message The message object (may include toolResults)
     * @param container The message DOM element
     * @param component Optional parent component for Markdown rendering
     */
    async renderMessage(message: Message, container: HTMLElement, component?: Component): Promise<void> {
        if (message.toolResults && message.toolResults.length > 0) {
            await this.renderMessageWithToolDisplays(message, container, component);
        } else {
            await this.renderRegularMessage(message, container, component);
        }
    }

    /**
     * Render a message with embedded tool displays.
     * @param message The message object (with toolResults)
     * @param container The message DOM element
     * @param component Optional parent component for Markdown rendering
     */
    private async renderMessageWithToolDisplays(message: Message, container: HTMLElement, component?: Component): Promise<void> {
        const messageContent = container.querySelector('.message-content') as HTMLElement;
        if (!messageContent) {
            console.error('No .message-content element found in container');
            return;
        }

        messageContent.empty();
        container.classList.add('has-rich-tools');

        // Render each tool execution result as a rich display
        if (message.toolResults && message.toolResults.length > 0) {
            for (const toolExecutionResult of message.toolResults) {
                const richDisplay = new ToolRichDisplay({
                    command: toolExecutionResult.command,
                    result: toolExecutionResult.result,
                    onRerun: () => {
                        // Optional: implement re-run logic
                    },
                    onCopy: async () => {
                        const displayText = this.formatToolForCopy(toolExecutionResult.command, toolExecutionResult.result);
                        try {
                            await navigator.clipboard.writeText(displayText);
                        } catch (error) {
                            console.error('Failed to copy tool result:', error);
                        }
                    }
                });

                const toolWrapper = document.createElement('div');
                toolWrapper.className = 'embedded-tool-display';
                toolWrapper.appendChild(richDisplay.getElement());
                messageContent.appendChild(toolWrapper);
            }
        }

        // Render the main message content (if any), but strip trailing tool JSON blocks
        if (message.content && message.content.trim()) {
            // Remove trailing tool JSON code blocks and other tool command formats
            let cleanedContent = message.content
                // Remove ai-tool-execution blocks
                .replace(/\n*```ai-tool-execution[\s\S]*?```\s*$/g, '')
                // Remove trailing JSON code blocks that contain tool commands
                .replace(/\n*```json\s*\{[^}]*"action":\s*"[^"]+"[^}]*\}[^`]*```\s*$/g, '')
                // Remove any trailing raw JSON objects with action properties
                .replace(/\n*\{[^}]*"action":\s*"[^"]+"[^}]*\}\s*$/g, '')
                .trim();
            
            if (cleanedContent) {
                const textDiv = document.createElement('div');
                textDiv.className = 'message-text-part';
                await MarkdownRenderer.render(this.app, cleanedContent, textDiv, '', component || new Component());
                messageContent.appendChild(textDiv);
            }
        }
    }

    /**
     * Render a regular message without tool displays.
     * @param message The message object
     * @param container The message DOM element
     * @param component Optional parent component for Markdown rendering
     */
    private async renderRegularMessage(message: Message, container: HTMLElement, component?: Component): Promise<void> {
        const messageContent = container.querySelector('.message-content') as HTMLElement;
        if (!messageContent) return;

        messageContent.empty();
        await MarkdownRenderer.render(this.app, message.content, messageContent, '', component || new Component());
    }

    /**
     * Parse message content to extract tool calls and text parts.
     * Returns an array of text/tool parts for further processing.
     * @param content The message content string
     */
    private parseMessageWithTools(content: string): Array<{type: 'text' | 'tool', content?: string, command?: ToolCommand}> {
        const parts: Array<{type: 'text' | 'tool', content?: string, command?: ToolCommand}> = [];

        // Regex to match tool call JSON code blocks
        const toolCallRegex = /```json\s*\{[^}]*"action":\s*"([^"]+)"[^}]*\}[^`]*```/g;

        let lastIndex = 0;
        let match;

        while ((match = toolCallRegex.exec(content)) !== null) {
            // Add preceding text part
            if (match.index > lastIndex) {
                const textContent = content.slice(lastIndex, match.index).trim();
                if (textContent) {
                    parts.push({ type: 'text', content: textContent });
                }
            }

            // Try to parse the tool JSON
            try {
                const toolJson = match[0].replace(/```json\s*/, '').replace(/\s*```[\s\S]*?$/, '');
                const command = JSON.parse(toolJson) as ToolCommand;
                parts.push({ type: 'tool', command });
            } catch (e) {
                // If parsing fails, treat as text
                parts.push({ type: 'text', content: match[0] });
            }

            lastIndex = match.index + match[0].length;
        }

        // Add any remaining text after the last tool call
        if (lastIndex < content.length) {
            const remainingContent = content.slice(lastIndex).trim();
            if (remainingContent) {
                parts.push({ type: 'text', content: remainingContent });
            }
        }

        // If no parts found, treat the whole content as text
        if (parts.length === 0) {
            parts.push({ type: 'text', content });
        }

        return parts;
    }

    /**
     * Compare tool parameters for matching (deep equality).
     * @param params1 First parameters object
     * @param params2 Second parameters object
     * @returns True if parameters are deeply equal
     */
    private compareToolParams(params1: any, params2: any): boolean {
        try {
            return JSON.stringify(params1) === JSON.stringify(params2);
        } catch {
            return false;
        }
    }

    /**
     * Format a tool execution result for clipboard copy.
     * @param command The tool command
     * @param result The tool result
     * @returns Formatted string for copy
     */
    private formatToolForCopy(command: ToolCommand, result: ToolResult): string {
        const status = result.success ? '✅' : '❌';
        const statusText = result.success ? 'SUCCESS' : 'ERROR';

        let output = `${status} **${command.action}** ${statusText}`;

        // Parameters
        if (command.parameters && Object.keys(command.parameters).length > 0) {
            output += `\n\n**Parameters:**\n\`\`\`json\n${JSON.stringify(command.parameters, null, 2)}\n\`\`\``;
        }

        // Result or error
        if (result.success) {
            output += `\n\n**Result:**\n\`\`\`json\n${JSON.stringify(result.data, null, 2)}\n\`\`\``;
        } else {
            output += `\n\n**Error:**\n${result.error}`;
        }

        return output;
    }

    /**
     * Get message content formatted for clipboard copy, including tool results.
     * @param messageData The message data (may include toolResults)
     * @returns Formatted string for copy
     */
    getMessageContentForCopy(messageData: Message): string {
        let content = messageData.content;

        if (messageData.toolResults && messageData.toolResults.length > 0) {
            content += '\n\n```ai-tool-execution\n';
            content += JSON.stringify({
                toolResults: messageData.toolResults,
                reasoning: messageData.reasoning,
                taskStatus: messageData.taskStatus
            }, null, 2);
            content += '\n```\n';
        }

        return content;
    }

}
