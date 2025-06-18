import { MarkdownRenderer, App, Component } from 'obsidian';
import { Message, TaskStatus, ToolCommand, ToolResult } from '../../types';
import { ToolRichDisplay } from './ToolRichDisplay';

/**
 * Handles rendering of message content and enhanced message data (reasoning, task status)
 */
export class MessageRenderer {
    constructor(private app: App) {}

    /**
     * Update message container with enhanced reasoning and task status data
     */
    updateMessageWithEnhancedData(container: HTMLElement, messageData: Message, component?: Component): void {
        // Remove existing reasoning and task status elements
        const existingReasoning = container.querySelector('.reasoning-container');
        const existingTaskStatus = container.querySelector('.task-status-container');
        if (existingReasoning) existingReasoning.remove();
        if (existingTaskStatus) existingTaskStatus.remove();

        const messageContainer = container.querySelector('.message-container');
        if (!messageContainer) return;

        // Add reasoning section if present
        if (messageData.reasoning) {
            const reasoningEl = this.createReasoningSection(messageData.reasoning);
            messageContainer.insertBefore(reasoningEl, messageContainer.firstChild);
        }

        // Add task status section if present
        if (messageData.taskStatus) {
            const taskStatusEl = this.createTaskStatusSection(messageData.taskStatus);
            messageContainer.insertBefore(taskStatusEl, messageContainer.firstChild);
        }

        // Update main content
        const contentEl = container.querySelector('.message-content') as HTMLElement;
        if (contentEl) {
            contentEl.empty();
            MarkdownRenderer.render(
                this.app,
                messageData.content,
                contentEl,
                '',
                component || null as any
            ).catch((error) => {
                contentEl.textContent = messageData.content;
            });
        }
    }

    /**
     * Create reasoning section element
     */
    createReasoningSection(reasoning: any): HTMLElement {
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

        // Add reasoning content based on type
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

        // Add toggle functionality
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
     * Create task status section element
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

        // Add tool execution count
        if (taskStatus.toolExecutionCount > 0) {
            const toolInfo = document.createElement('div');
            toolInfo.className = 'task-tool-info';
            toolInfo.textContent = `Tools used: ${taskStatus.toolExecutionCount}/${taskStatus.maxToolExecutions}`;
            statusContainer.appendChild(toolInfo);
        }

        return statusContainer;
    }

    /**
     * Get emoji for reasoning step categories
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
     * Get task status text
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
     * Get task status icon
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
     * Render a complete message with tool displays if present
     */
    async renderMessage(message: Message, container: HTMLElement, component?: Component): Promise<void> {
        // Check if this message has tool results that need rich display rendering
        if (message.toolResults && message.toolResults.length > 0) {
            await this.renderMessageWithToolDisplays(message, container, component);
        } else {
            // Regular message rendering
            await this.renderRegularMessage(message, container, component);
        }
    }

    /**
     * Render message with embedded tool displays
     */
    private async renderMessageWithToolDisplays(message: Message, container: HTMLElement, component?: Component): Promise<void> {
        const messageContent = container.querySelector('.message-content') as HTMLElement;
        if (!messageContent) return;        // Clear existing content
        messageContent.empty();
        
        // Add class to indicate this message has rich tool displays
        container.classList.add('has-rich-tools');

        // Parse the message content to extract tool calls and regular content
        const parts = this.parseMessageWithTools(message.content);

        for (const part of parts) {
            if (part.type === 'text' && part.content?.trim()) {
                // Render regular text content
                const textDiv = document.createElement('div');
                textDiv.className = 'message-text-part';
                await MarkdownRenderer.render(this.app, part.content, textDiv, '', component || null as any);
                messageContent.appendChild(textDiv);            } else if (part.type === 'tool' && part.command && message.toolResults) {
                // Find the corresponding tool result
                const toolExecutionResult = message.toolResults.find(tr => 
                    tr.command.action === part.command!.action && 
                    this.compareToolParams(tr.command.parameters, part.command!.parameters)
                );

                if (toolExecutionResult) {
                    // Create rich display for this tool
                    const richDisplay = new ToolRichDisplay({
                        command: part.command,
                        result: toolExecutionResult.result,
                        onRerun: () => {
                            // Re-run functionality can be added later if needed
                            console.log('Re-run tool:', part.command);
                        },
                        onCopy: async () => {
                            const displayText = this.formatToolForCopy(part.command!, toolExecutionResult.result);
                            try {
                                await navigator.clipboard.writeText(displayText);
                            } catch (error) {
                                console.error('Failed to copy tool result:', error);
                            }
                        }
                    });

                    // Create wrapper and append
                    const toolWrapper = document.createElement('div');
                    toolWrapper.className = 'embedded-tool-display';
                    toolWrapper.appendChild(richDisplay.getElement());
                    messageContent.appendChild(toolWrapper);
                }
            }
        }
    }

    /**
     * Render regular message without tool displays
     */
    private async renderRegularMessage(message: Message, container: HTMLElement, component?: Component): Promise<void> {
        const messageContent = container.querySelector('.message-content') as HTMLElement;
        if (!messageContent) return;

        messageContent.empty();
        await MarkdownRenderer.render(this.app, message.content, messageContent, '', component || null as any);
    }

    /**
     * Parse message content to extract tool calls and text parts
     */
    private parseMessageWithTools(content: string): Array<{type: 'text' | 'tool', content?: string, command?: ToolCommand}> {
        const parts: Array<{type: 'text' | 'tool', content?: string, command?: ToolCommand}> = [];

        // Look for tool call patterns in the content
        const toolCallRegex = /```json\s*\{[^}]*"action":\s*"([^"]+)"[^}]*\}[^`]*```/g;

        let lastIndex = 0;
        let match;

        while ((match = toolCallRegex.exec(content)) !== null) {
            // Add text before this tool call
            if (match.index > lastIndex) {
                const textContent = content.slice(lastIndex, match.index).trim();
                if (textContent) {
                    parts.push({ type: 'text', content: textContent });
                }
            }

            // Parse the tool command
            try {
                const toolJson = match[0].replace(/```json\s*/, '').replace(/\s*```[\s\S]*?$/, '');
                const command = JSON.parse(toolJson) as ToolCommand;
                parts.push({ type: 'tool', command });
            } catch (e) {
                // If parsing fails, treat as regular text
                parts.push({ type: 'text', content: match[0] });
            }

            lastIndex = match.index + match[0].length;
        }

        // Add remaining text
        if (lastIndex < content.length) {
            const remainingContent = content.slice(lastIndex).trim();
            if (remainingContent) {
                parts.push({ type: 'text', content: remainingContent });
            }
        }

        // If no tool calls found, return the entire content as text
        if (parts.length === 0) {
            parts.push({ type: 'text', content });
        }

        return parts;
    }

    /**
     * Compare tool parameters for matching
     */
    private compareToolParams(params1: any, params2: any): boolean {
        try {
            return JSON.stringify(params1) === JSON.stringify(params2);
        } catch {
            return false;
        }
    }    /**
     * Format tool execution for clipboard copy
     */    private formatToolForCopy(command: ToolCommand, result: ToolResult): string {
        const status = result.success ? '✅' : '❌';
        const statusText = result.success ? 'SUCCESS' : 'ERROR';
        
        let output = `${status} **${command.action}** ${statusText}`;
        
        // Add parameters section
        if (command.parameters && Object.keys(command.parameters).length > 0) {
            output += `\n\n**Parameters:**\n\`\`\`json\n${JSON.stringify(command.parameters, null, 2)}\n\`\`\``;
        }
        
        // Add result section
        if (result.success) {
            output += `\n\n**Result:**\n\`\`\`json\n${JSON.stringify(result.data, null, 2)}\n\`\`\``;
        } else {
            output += `\n\n**Error:**\n${result.error}`;
        }
        
        return output;
    }    /**
     * Get message content formatted for clipboard copy, including tool results
     */    getMessageContentForCopy(messageData: Message): string {
        if (!messageData.toolResults || messageData.toolResults.length === 0) {
            return messageData.content;
        }

        // Check if content is mostly empty (just whitespace/newlines) 
        const trimmedContent = messageData.content.trim();
        const isContentMostlyEmpty = trimmedContent === '' || 
            trimmedContent.startsWith('*[Tool execution limit reached') ||
            /^[\s\n]*\*.*\*[\s\n]*$/.test(trimmedContent);

        if (isContentMostlyEmpty) {
            // Generate content directly from toolResults
            let result = '';
            
            for (const toolResult of messageData.toolResults) {
                result += `\n\n**Tool Execution:** ${toolResult.command.action}\n`;
                result += `**Status:** ${toolResult.result.success ? 'SUCCESS' : 'ERROR'}\n\n`;
                
                if (toolResult.command.parameters && Object.keys(toolResult.command.parameters).length > 0) {
                    result += `**Parameters:**\n\`\`\`json\n${JSON.stringify(toolResult.command.parameters, null, 2)}\n\`\`\`\n\n`;
                }
                
                if (toolResult.result.success && toolResult.result.data) {
                    result += `**Result:**\n\`\`\`json\n${JSON.stringify(toolResult.result.data, null, 2)}\n\`\`\`\n`;
                } else if (!toolResult.result.success && toolResult.result.error) {
                    result += `**Error:**\n${toolResult.result.error}\n`;
                }
            }

            // Add any meaningful content if it exists
            if (trimmedContent && !trimmedContent.startsWith('*[Tool execution limit reached')) {
                result = trimmedContent + result;
            }

            return result.trim();
        }

        // Original logic for content with tool placeholders
        const parts = this.parseMessageWithTools(messageData.content);
        let result = '';

        for (const part of parts) {
            if (part.type === 'text') {
                result += part.content;
            } else if (part.type === 'tool' && part.command) {
                // Find the matching tool result
                const toolResult = messageData.toolResults.find(tr => 
                    tr.command.action === part.command?.action &&
                    this.compareToolParams(tr.command.parameters, part.command?.parameters)
                );                
                if (toolResult) {
                    result += `\n\n**Tool Execution:** ${part.command.action}\n`;
                    result += `**Status:** ${toolResult.result.success ? 'SUCCESS' : 'ERROR'}\n\n`;
                    
                    if (part.command.parameters && Object.keys(part.command.parameters).length > 0) {
                        result += `**Parameters:**\n\`\`\`json\n${JSON.stringify(part.command.parameters, null, 2)}\n\`\`\`\n\n`;
                    }
                    
                    if (toolResult.result.success) {
                        result += `**Result:**\n\`\`\`json\n${JSON.stringify(toolResult.result.data, null, 2)}\n\`\`\`\n`;
                    } else {
                        result += `**Error:**\n${toolResult.result.error}\n`;
                    }
                }
            }
        }

        return result;
    }
}
