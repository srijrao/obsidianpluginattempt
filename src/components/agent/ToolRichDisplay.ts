import { Component } from 'obsidian';
import { ToolCommand, ToolResult } from '../../types';

/**
 * Options for displaying a tool result in the UI.
 */
export interface ToolDisplayOptions {
    command: ToolCommand;         // The tool command that was executed
    result: ToolResult;           // The result of the tool execution
    onRerun?: () => void;         // Optional callback for re-running the tool
    onCopy?: () => void;          // Optional callback for copying the result
}

/**
 * ToolRichDisplay is a UI component for rendering tool results in a rich, interactive format.
 * Supports summary, details, copy, and re-run actions.
 */
export class ToolRichDisplay extends Component {
    private element: HTMLElement;
    private options: ToolDisplayOptions;

    /**
     * Constructs a ToolRichDisplay instance.
     * @param options ToolDisplayOptions for rendering and actions
     */
    constructor(options: ToolDisplayOptions) {
        super();
        this.options = options;
        // Debug logging if available
        if ((window as any).aiAssistantPlugin && typeof (window as any).aiAssistantPlugin.debugLog === 'function') {
            (window as any).aiAssistantPlugin.debugLog('debug', '[ToolRichDisplay] constructor called', { options });
        }
        this.element = this.createToolDisplay();
    }

    /**
     * Returns the root element for this display.
     */
    getElement(): HTMLElement {
        return this.element;
    }

    /**
     * Creates the main display element for the tool result.
     * @returns HTMLElement representing the tool result
     */
    private createToolDisplay(): HTMLElement {
        if ((window as any).aiAssistantPlugin && typeof (window as any).aiAssistantPlugin.debugLog === 'function') {
            (window as any).aiAssistantPlugin.debugLog('debug', '[ToolRichDisplay] createToolDisplay called', { command: this.options.command, result: this.options.result });
        }
        return ToolRichDisplay.createDisplayElement(this.options.command, this.options.result, {
            onRerun: this.options.onRerun,
            onCopy: this.options.onCopy
        });
    }

    /**
     * Returns an emoji icon for the tool action.
     */
    private getToolIcon(): string {
        const iconMap: Record<string, string> = {
            'file_search': '🔍',
            'file_read': '📖',
            'file_write': '✍️',
            'file_diff': '🔄',
            'file_move': '📁',
            'file_rename': '🏷️',
            'file_list': '📋',
            'thought': '🧠',
            'get_user_feedback': '❓'
        };
        return iconMap[this.options.command.action] || '🔧';
    }

    /**
     * Returns a human-readable display name for the tool action.
     */
    private getToolDisplayName(): string {
        const nameMap: Record<string, string> = {
            'file_search': 'File Search',
            'file_read': 'File Read',
            'file_write': 'File Write',
            'file_diff': 'File Diff',
            'file_move': 'File Move',
            'file_rename': 'File Rename',
            'file_list': 'File List',
            'thought': 'Thought Process',
            'get_user_feedback': 'User Feedback'
        };
        return nameMap[this.options.command.action] || this.options.command.action;
    }

    /**
     * Formats the tool parameters for display.
     */
    private formatParameters(): string {
        const params = this.options.command.parameters;
        const formatted = Object.entries(params)
            .map(([key, value]) => `${key}: ${typeof value === 'string' && value.length > 50 
                ? value.substring(0, 50) + '...' 
                : JSON.stringify(value)}`)
            .join(', ');
        return `<code>${formatted}</code>`;
    }

    /**
     * Returns a summary string for the tool result.
     */
    private getResultSummary(): string {
        if (!this.options.result.success) {
            return `<span class="tool-error">${this.options.result.error || 'Unknown error'}</span>`;
        }
        const data = this.options.result.data;
        // ...existing code for summary by action...
        if (this.options.command.action === 'file_write' && data) {
            const action = data.action || 'modified';
            const filePath = data.filePath || 'unknown file';
            const size = data.size ? ` (${data.size} bytes)` : '';
            if (action === 'created') {
                return `<span class="tool-success">📝 Created file: <strong>${filePath}</strong>${size}</span>`;
            } else {
                return `<span class="tool-success">💾 Saved file: <strong>${filePath}</strong>${size}</span>`;
            }
        }
        if (this.options.command.action === 'file_read' && data) {
            const filePath = data.filePath || this.options.command.parameters.path;
            const size = data.content ? ` (${data.content.length} chars)` : '';
            return `<span class="tool-success">📖 Read file: <strong>${filePath}</strong>${size}</span>`;
        }
        if (this.options.command.action === 'file_search' && data) {
            const count = data.count || (Array.isArray(data.files) ? data.files.length : 0);
            return `<span class="tool-success">🔍 Found ${count} file${count !== 1 ? 's' : ''}</span>`;
        }
        if (this.options.command.action === 'file_list' && data) {
            const count = data.count || (Array.isArray(data.files) ? data.files.length : 0);
            const path = data.path || this.options.command.parameters.path;
            return `<span class="tool-success">📋 Listed ${count} file${count !== 1 ? 's' : ''} in <strong>${path}</strong></span>`;
        }
        if (this.options.command.action === 'file_move' && data) {
            const from = this.options.command.parameters.sourcePath;
            const to = this.options.command.parameters.destinationPath;
            return `<span class="tool-success">📁 Moved <strong>${from}</strong> → <strong>${to}</strong></span>`;
        }
        if (this.options.command.action === 'file_rename' && data) {
            const oldName = this.options.command.parameters.path;
            const newName = this.options.command.parameters.newName;
            return `<span class="tool-success">🏷️ Renamed <strong>${oldName}</strong> → <strong>${newName}</strong></span>`;
        }
        if (this.options.command.action === 'thought' && data) {
            const thought = data.thought || data.reasoning || '';
            return `<span class="tool-success">🧠 ${thought}</span>`;
        }
        if (this.options.command.action === 'get_user_feedback' && data) {
            if (data.status === 'completed') {
                const answer = data.answer || '';
                const responseTime = data.responseTimeMs ? ` (responded in ${Math.round(data.responseTimeMs / 1000)}s)` : '';
                return `<span class="tool-success">❓ User responded: <strong>${answer}</strong>${responseTime}</span>`;
            } else if (data.status === 'failed') {
                return `<span class="tool-error">❓ Failed to get user response</span>`;
            } else {
                // Still waiting for response
                return `<span class="tool-pending">❓ Waiting for user response...</span>`;
            }
        }
        if (typeof data === 'string') {
            return data;
        }
        if (Array.isArray(data)) {
            return `${data.length} items returned`;
        }
        if (typeof data === 'object' && data !== null) {
            const keys = Object.keys(data);
            return `Object with ${keys.length} properties`;
        }
        return 'Success';
    }

    /**
     * Returns a detailed string (JSON or plain) for the tool result.
     */
    private getDetailedResult(): string | null {
        if (!this.options.result.success) {
            return this.options.result.error || 'Unknown error occurred';
        }
        if (this.options.result.data) {
            return typeof this.options.result.data === 'string' 
                ? this.options.result.data
                : JSON.stringify(this.options.result.data, null, 2);
        }
        return null;
    }

    /**
     * Updates the display with a new tool result.
     * @param result The new ToolResult to display
     */
    updateResult(result: ToolResult) {
        this.options.result = result;
        const newElement = ToolRichDisplay.createDisplayElement(this.options.command, this.options.result, {
            onRerun: this.options.onRerun,
            onCopy: this.options.onCopy
        });
        this.element.replaceWith(newElement);
        this.element = newElement;
    }

    /**
     * Converts the tool display to markdown format for saving to notes.
     * @returns Markdown string representing the tool result
     */
    toMarkdown(): string {
        const { command, result } = this.options;
        const status = result.success ? '✅' : '❌';
        const toolName = this.getToolDisplayName();
        const icon = this.getToolIcon();

        let markdown = `\n### ${icon} ${toolName} ${status}\n\n`;

        // Parameters
        if (command.parameters && Object.keys(command.parameters).length > 0) {
            markdown += `**Parameters:**\n`;
            Object.entries(command.parameters).forEach(([key, value]) => {
                const displayValue = typeof value === 'string' && value.length > 100 
                    ? value.substring(0, 100) + '...'
                    : JSON.stringify(value);
                markdown += `- **${key}:** \`${displayValue}\`\n`;
            });
            markdown += '\n';
        }

        // Result
        if (result.success) {
            markdown += `**Result:** ${this.getResultSummary()}\n\n`;
            const details = this.getDetailedResult();
            if (details && details !== this.getResultSummary()) {
                if (details.length <= 200) {
                    markdown += `**Details:** \`${details}\`\n\n`;
                } else {
                    markdown += `<details>\n<summary>Show Details</summary>\n\n\`\`\`\n${details}\n\`\`\`\n\n</details>\n\n`;
                }
            }
        } else {
            markdown += `**Error:** ${result.error}\n\n`;
        }

        return markdown;
    }

    /**
     * Static method to create a tool display element for notes (without re-run functionality).
     */
    static createNoteDisplay(command: ToolCommand, result: ToolResult, options?: { onCopy?: () => void }): HTMLElement {
        return ToolRichDisplay.createDisplayElement(command, result, {
            ...options,
            isNote: true
        });
    }

    /**
     * Static method to create a tool display element with customizable options.
     * @param command The tool command
     * @param result The tool result
     * @param options Optional callbacks and flags
     * @returns HTMLElement representing the tool result
     */
    static createDisplayElement(command: ToolCommand, result: ToolResult, options?: {
        onRerun?: () => void;
        onCopy?: () => void;
        isNote?: boolean;
    }): HTMLElement {
        const container = document.createElement('div');
        container.className = options?.isNote ? 'tool-rich-display tool-rich-display-note' : 'tool-rich-display';

        // Icon
        const iconDiv = document.createElement('div');
        iconDiv.className = 'tool-rich-icon';
        iconDiv.innerHTML = ToolRichDisplay.getStaticToolIcon(command.action);
        container.appendChild(iconDiv);

        // Info
        const infoDiv = document.createElement('div');
        infoDiv.className = 'tool-rich-info';

        // Title and status
        const titleDiv = document.createElement('div');
        titleDiv.className = 'tool-rich-title';
        titleDiv.innerText = ToolRichDisplay.getStaticToolDisplayName(command.action);

        const statusSpan = document.createElement('span');
        statusSpan.className = `tool-rich-status ${result.success ? 'success' : 'error'}`;
        statusSpan.innerText = result.success ? 'Success' : 'Error';
        titleDiv.appendChild(statusSpan);
        infoDiv.appendChild(titleDiv);

        // Parameters
        if (command.parameters && Object.keys(command.parameters).length > 0) {
            const paramsDiv = document.createElement('div');
            paramsDiv.innerHTML = `<strong>Parameters:</strong> ${ToolRichDisplay.formatStaticParameters(command.parameters)}`;
            infoDiv.appendChild(paramsDiv);
        }

        // Result summary
        const resultDiv = document.createElement('div');
        resultDiv.innerHTML = `<strong>Result:</strong> ${ToolRichDisplay.getStaticResultSummary(command, result)}`;
        infoDiv.appendChild(resultDiv);

        // Special handling for user feedback tool - add interactive elements if waiting for response
        if (command.action === 'get_user_feedback' && result.data && 
            (result.data.status === 'pending' || (!result.data.status && result.data.requestId))) {
            // This is a pending feedback request - create interactive UI
            const feedbackDiv = ToolRichDisplay.createUserFeedbackUI(command, result);
            if (feedbackDiv) {
                infoDiv.appendChild(feedbackDiv);
            }
        }

        // Details (expandable)
        const details = ToolRichDisplay.getStaticDetailedResult(result);
        if (details) {
            const toggle = document.createElement('div');
            toggle.className = 'tool-rich-details-toggle';
            toggle.innerText = 'Show details ▼';

            const detailsDiv = document.createElement('div');
            detailsDiv.className = 'tool-rich-details';
            detailsDiv.style.display = 'none'; 
            detailsDiv.innerHTML = `<pre>${details}</pre>`;

            toggle.onclick = () => {
                const isExpanded = detailsDiv.classList.contains('expanded');
                if (isExpanded) {
                    detailsDiv.classList.remove('expanded');
                    detailsDiv.style.display = 'none';
                    toggle.innerText = 'Show details ▼';
                } else {
                    detailsDiv.classList.add('expanded');
                    detailsDiv.style.display = 'block';
                    toggle.innerText = 'Hide details ▲';
                }
            };

            infoDiv.appendChild(toggle);
            infoDiv.appendChild(detailsDiv);
        }

        // Actions (re-run, copy, copy result)
        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'tool-rich-actions';

        if (!options?.isNote && options?.onRerun) {
            const rerunBtn = document.createElement('button');
            rerunBtn.className = 'tool-rich-action-btn';
            rerunBtn.innerText = 'Re-run';
            rerunBtn.onclick = options.onRerun;
            actionsDiv.appendChild(rerunBtn);
        }

        if (options?.onCopy) {
            const copyBtn = document.createElement('button');
            copyBtn.className = 'tool-rich-action-btn';
            copyBtn.innerText = 'Copy';
            copyBtn.onclick = options.onCopy;
            actionsDiv.appendChild(copyBtn);
        }

        const copyResultBtn = document.createElement('button');
        copyResultBtn.className = 'tool-rich-action-btn';
        copyResultBtn.innerText = 'Copy Result';
        copyResultBtn.onclick = async () => {
            const resultText = result.success 
                ? JSON.stringify(result.data, null, 2)
                : result.error || 'Unknown error';
            try {
                await navigator.clipboard.writeText(resultText);
                copyResultBtn.innerText = 'Copied!';
                setTimeout(() => {
                    copyResultBtn.innerText = 'Copy Result';
                }, 2000);
            } catch (error) {
                console.error('Failed to copy to clipboard:', error);
            }
        };
        actionsDiv.appendChild(copyResultBtn);

        infoDiv.appendChild(actionsDiv);
        container.appendChild(infoDiv);

        return container;
    }

    /**
     * Returns a static emoji icon for a tool action.
     */
    private static getStaticToolIcon(action: string): string {
        const iconMap: Record<string, string> = {
            'file_search': '🔍',
            'file_read': '📖',
            'file_write': '✍️',
            'file_diff': '🔄',
            'file_move': '📁',
            'file_rename': '🏷️',
            'file_list': '📋',
            'thought': '🧠',
            'get_user_feedback': '❓'
        };
        return iconMap[action] || '🔧';
    }

    /**
     * Returns a static display name for a tool action.
     */
    private static getStaticToolDisplayName(action: string): string {
        const nameMap: Record<string, string> = {
            'file_search': 'File Search',
            'file_read': 'File Read',
            'file_write': 'File Write',
            'file_diff': 'File Diff',
            'file_move': 'File Move',
            'file_rename': 'File Rename',
            'file_list': 'File List',
            'thought': 'Thought Process',
            'get_user_feedback': 'User Feedback'
        };
        return nameMap[action] || action;
    }

    /**
     * Formats parameters for static display.
     */
    private static formatStaticParameters(params: any): string {
        const formatted = Object.entries(params)
            .map(([key, value]) => `${key}: ${typeof value === 'string' && value.length > 50 
                ? value.substring(0, 50) + '...' 
                : JSON.stringify(value)}`)
            .join(', ');
        return `<code>${formatted}</code>`;
    }

    /**
     * Returns a static summary string for a tool result.
     */
    private static getStaticResultSummary(command: ToolCommand, result: ToolResult): string {
        if (!result.success) {
            return `<span class="tool-error">${result.error || 'Unknown error'}</span>`;
        }
        const data = result.data;
        // ...existing code for summary by action (same as getResultSummary)...
        if (command.action === 'file_write' && data) {
            const action = data.action || 'modified';
            const filePath = data.filePath || 'unknown file';
            const size = data.size ? ` (${data.size} bytes)` : '';
            if (action === 'created') {
                return `<span class="tool-success">📝 Created file: <strong>${filePath}</strong>${size}</span>`;
            } else {
                return `<span class="tool-success">💾 Saved file: <strong>${filePath}</strong>${size}</span>`;
            }
        }
        if (command.action === 'file_read' && data) {
            const filePath = data.filePath || command.parameters.path;
            const size = data.content ? ` (${data.content.length} chars)` : '';
            return `<span class="tool-success">📖 Read file: <strong>${filePath}</strong>${size}</span>`;
        }
        if (command.action === 'file_search' && data) {
            const count = data.count || (Array.isArray(data.files) ? data.files.length : 0);
            return `<span class="tool-success">🔍 Found ${count} file${count !== 1 ? 's' : ''}</span>`;
        }
        if (command.action === 'file_list' && data) {
            const count = data.count || (Array.isArray(data.files) ? data.files.length : 0);
            const path = data.path || command.parameters.path;
            return `<span class="tool-success">📋 Listed ${count} file${count !== 1 ? 's' : ''} in <strong>${path}</strong></span>`;
        }
        if (command.action === 'file_move' && data) {
            const from = command.parameters.sourcePath;
            const to = command.parameters.destinationPath;
            return `<span class="tool-success">📁 Moved <strong>${from}</strong> → <strong>${to}</strong></span>`;
        }
        if (command.action === 'file_rename' && data) {
            const oldName = command.parameters.path;
            const newName = command.parameters.newName;
            return `<span class="tool-success">🏷️ Renamed <strong>${oldName}</strong> → <strong>${newName}</strong></span>`;
        }
        if (command.action === 'thought' && data) {
            const thought = data.thought || data.reasoning || '';
            return `<span class="tool-success">🧠 ${thought}</span>`;
        }
        if (command.action === 'get_user_feedback' && data) {
            if (data.status === 'completed') {
                const answer = data.answer || '';
                const responseTime = data.responseTimeMs ? ` (responded in ${Math.round(data.responseTimeMs / 1000)}s)` : '';
                return `<span class="tool-success">❓ User responded: <strong>${answer}</strong>${responseTime}</span>`;
            } else if (data.status === 'failed') {
                return `<span class="tool-error">❓ Failed to get user response</span>`;
            } else {
                // Still waiting for response
                return `<span class="tool-pending">❓ Waiting for user response...</span>`;
            }
        }
        if (typeof data === 'string') {
            return data;
        }
        if (Array.isArray(data)) {
            return `${data.length} items returned`;
        }
        if (typeof data === 'object' && data !== null) {
            const keys = Object.keys(data);
            return `Object with ${keys.length} properties`;
        }
        return 'Success';
    }

    /**
     * Returns a static detailed string (JSON or plain) for a tool result.
     */
    private static getStaticDetailedResult(result: ToolResult): string | null {
        if (!result.success) {
            return result.error || 'Unknown error occurred';
        }
        if (result.data) {
            return typeof result.data === 'string' 
                ? result.data
                : JSON.stringify(result.data, null, 2);
        }
        return null;
    }

    /**
     * Render a tool execution block (array of toolResults) into a container element.
     * Used by both markdown and code block processors.
     * @param toolData Object containing toolResults array
     * @param container The container element to render into
     * @param onCopy Optional callback for copying a result
     */
    static renderToolExecutionBlock(toolData: any, container: HTMLElement, onCopy?: (result: any) => void) {
        container.innerHTML = '';
        container.className = 'ai-tool-execution-container';
        if (toolData.toolResults && Array.isArray(toolData.toolResults)) {
            for (const toolResult of toolData.toolResults) {
                if (toolResult.command && toolResult.result) {
                    const toolDisplay = ToolRichDisplay.createNoteDisplay(
                        toolResult.command,
                        toolResult.result,
                        {
                            onCopy: onCopy
                                ? () => onCopy(toolResult.result)
                                : undefined
                        }
                    );
                    container.appendChild(toolDisplay);
                }
            }
        }
    }

    /**
     * Creates an interactive UI for user feedback tools.
     * This method creates the input elements and buttons for user interaction.
     * @param command The tool command requesting feedback
     * @param result The tool result (should contain request data)
     * @returns HTMLElement with the interactive feedback UI or null if not applicable
     */
    static createUserFeedbackUI(command: ToolCommand, result: ToolResult): HTMLElement | null {
        const params = command.parameters;
        const data = result.data;
        
        if (!params.question || !data || !data.requestId) {
            return null;
        }

        const feedbackContainer = document.createElement('div');
        feedbackContainer.className = 'user-feedback-ui';
        
        // Question display
        const questionDiv = document.createElement('div');
        questionDiv.className = 'feedback-question';
        questionDiv.innerHTML = `<strong>Question:</strong> ${params.question}`;
        feedbackContainer.appendChild(questionDiv);

        const responseContainer = document.createElement('div');
        responseContainer.className = 'feedback-response-container';

        // Create the pending request promise for this feedback
        const timeout = data.timeout || 300000;
        import('./tools/GetUserFeedback').then(({ GetUserFeedbackTool }) => {
            GetUserFeedbackTool.createPendingRequest(data.requestId, timeout).then((userResponse) => {
                // Update the UI to show the completed response
                responseContainer.innerHTML = `<div class="feedback-selected">✅ Response received: <strong>${userResponse.answer}</strong></div>`;
            }).catch((error) => {
                // Update the UI to show timeout or error
                responseContainer.innerHTML = `<div class="feedback-error">❌ ${error.message}</div>`;
            });
        });

        if (params.type === 'choice' && params.choices && Array.isArray(params.choices)) {
            // Multiple choice interface
            const choicesDiv = document.createElement('div');
            choicesDiv.className = 'feedback-choices';

            params.choices.forEach((choice: string, index: number) => {
                const choiceButton = document.createElement('button');
                choiceButton.className = 'feedback-choice-btn';
                choiceButton.textContent = choice;
                choiceButton.onclick = () => {
                    // Import and call the user feedback handler
                    import('./tools/GetUserFeedback').then(({ GetUserFeedbackTool }) => {
                        GetUserFeedbackTool.handleUserResponse(data.requestId, choice, index);
                        // Update UI to show selection was made
                        responseContainer.innerHTML = `<div class="feedback-selected">✅ Selected: <strong>${choice}</strong></div>`;
                    }).catch(error => {
                        console.error('Failed to handle user response:', error);
                    });
                };
                choicesDiv.appendChild(choiceButton);
            });

            responseContainer.appendChild(choicesDiv);

            // Custom answer option if allowed
            if (params.allowCustomAnswer) {
                const customDiv = document.createElement('div');
                customDiv.className = 'feedback-custom';
                customDiv.innerHTML = '<strong>Or provide a custom answer:</strong>';
                
                const customInput = document.createElement('input');
                customInput.type = 'text';
                customInput.className = 'feedback-custom-input';
                customInput.placeholder = params.placeholder || 'Enter your custom answer...';
                
                const customButton = document.createElement('button');
                customButton.className = 'feedback-submit-btn';
                customButton.textContent = 'Submit Custom Answer';
                customButton.onclick = () => {
                    const customAnswer = customInput.value.trim();
                    if (customAnswer) {
                        import('./tools/GetUserFeedback').then(({ GetUserFeedbackTool }) => {
                            GetUserFeedbackTool.handleUserResponse(data.requestId, customAnswer, undefined, true);
                            responseContainer.innerHTML = `<div class="feedback-selected">✅ Custom answer: <strong>${customAnswer}</strong></div>`;
                        }).catch(error => {
                            console.error('Failed to handle user response:', error);
                        });
                    }
                };

                customDiv.appendChild(customInput);
                customDiv.appendChild(customButton);
                responseContainer.appendChild(customDiv);
            }
        } else {
            // Text input interface
            const textDiv = document.createElement('div');
            textDiv.className = 'feedback-text';

            const textInput = document.createElement('textarea');
            textInput.className = 'feedback-text-input';
            textInput.placeholder = params.placeholder || 'Enter your answer...';
            textInput.rows = 3;

            const submitButton = document.createElement('button');
            submitButton.className = 'feedback-submit-btn';
            submitButton.textContent = 'Submit Answer';
            submitButton.onclick = () => {
                const answer = textInput.value.trim();
                if (answer) {
                    import('./tools/GetUserFeedback').then(({ GetUserFeedbackTool }) => {
                        GetUserFeedbackTool.handleUserResponse(data.requestId, answer);
                        responseContainer.innerHTML = `<div class="feedback-selected">✅ Answer submitted: <strong>${answer}</strong></div>`;
                    }).catch(error => {
                        console.error('Failed to handle user response:', error);
                    });
                }
            };

            // Allow Enter to submit (Shift+Enter for new line)
            textInput.onkeydown = (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    submitButton.click();
                }
            };

            textDiv.appendChild(textInput);
            textDiv.appendChild(submitButton);
            responseContainer.appendChild(textDiv);
        }

        feedbackContainer.appendChild(responseContainer);

        // Timeout indicator if specified
        if (data.timeout) {
            const timeoutDiv = document.createElement('div');
            timeoutDiv.className = 'feedback-timeout';
            const timeoutSeconds = Math.round(data.timeout / 1000);
            timeoutDiv.innerHTML = `<small>⏱️ Timeout: ${timeoutSeconds} seconds</small>`;
            feedbackContainer.appendChild(timeoutDiv);
        }

        return feedbackContainer;
    }
}
