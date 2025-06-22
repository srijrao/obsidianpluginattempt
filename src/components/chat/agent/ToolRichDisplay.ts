import { Component } from 'obsidian';
import { ToolCommand, ToolResult } from '../../../types';

export interface ToolDisplayOptions {
    command: ToolCommand;
    result: ToolResult;
    onRerun?: () => void;
    onCopy?: () => void;
}

export class ToolRichDisplay extends Component {
    private element: HTMLElement;
    private options: ToolDisplayOptions;

    constructor(options: ToolDisplayOptions) {
        super();
        this.options = options;
        this.element = this.createToolDisplay();
    }

    getElement(): HTMLElement {
        return this.element;
    }

    private createToolDisplay(): HTMLElement {
        const container = document.createElement('div');
        container.className = 'tool-rich-display';

        // Icon
        const iconDiv = document.createElement('div');
        iconDiv.className = 'tool-rich-icon';
        iconDiv.innerHTML = this.getToolIcon();
        container.appendChild(iconDiv);

        // Info section
        const infoDiv = document.createElement('div');
        infoDiv.className = 'tool-rich-info';

        // Title and status
        const titleDiv = document.createElement('div');
        titleDiv.className = 'tool-rich-title';
        titleDiv.innerText = this.getToolDisplayName();
        
        const statusSpan = document.createElement('span');
        statusSpan.className = `tool-rich-status ${this.options.result.success ? 'success' : 'error'}`;
        statusSpan.innerText = this.options.result.success ? 'Success' : 'Error';
        titleDiv.appendChild(statusSpan);
        infoDiv.appendChild(titleDiv);

        // Parameters display
        if (this.options.command.parameters && Object.keys(this.options.command.parameters).length > 0) {
            const paramsDiv = document.createElement('div');
            paramsDiv.innerHTML = `<strong>Parameters:</strong> ${this.formatParameters()}`;
            infoDiv.appendChild(paramsDiv);
        }

        // Result summary
        const resultDiv = document.createElement('div');
        resultDiv.innerHTML = `<strong>Result:</strong> ${this.getResultSummary()}`;
        infoDiv.appendChild(resultDiv);

        // Details toggle and content
        const details = this.getDetailedResult();
        if (details) {
            const toggle = document.createElement('div');
            toggle.className = 'tool-rich-details-toggle';
            toggle.innerText = 'Show details ▼';
            
            const detailsDiv = document.createElement('div');
            detailsDiv.className = 'tool-rich-details';
            detailsDiv.innerHTML = `<pre>${details}</pre>`;
            
            toggle.onclick = () => {
                const isExpanded = detailsDiv.classList.contains('expanded');
                if (isExpanded) {
                    detailsDiv.classList.remove('expanded');
                    toggle.innerText = 'Show details ▼';
                } else {
                    detailsDiv.classList.add('expanded');
                    toggle.innerText = 'Hide details ▲';
                }
            };
            
            infoDiv.appendChild(toggle);
            infoDiv.appendChild(detailsDiv);
        }

        // Actions
        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'tool-rich-actions';
        
        if (this.options.onRerun) {
            const rerunBtn = document.createElement('button');
            rerunBtn.className = 'tool-rich-action-btn';
            rerunBtn.innerText = 'Re-run';
            rerunBtn.onclick = this.options.onRerun;
            actionsDiv.appendChild(rerunBtn);
        }

        if (this.options.onCopy) {
            const copyBtn = document.createElement('button');
            copyBtn.className = 'tool-rich-action-btn';
            copyBtn.innerText = 'Copy';
            copyBtn.onclick = this.options.onCopy;
            actionsDiv.appendChild(copyBtn);
        }

        // Copy result button (always available)
        const copyResultBtn = document.createElement('button');
        copyResultBtn.className = 'tool-rich-action-btn';
        copyResultBtn.innerText = 'Copy Result';
        copyResultBtn.onclick = async () => {
            const resultText = this.options.result.success 
                ? JSON.stringify(this.options.result.data, null, 2)
                : this.options.result.error || 'Unknown error';
            
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

    private getToolIcon(): string {
        const iconMap: Record<string, string> = {
            'file_search': '🔍',
            'file_read': '📖',
            'file_write': '✍️',
            'file_diff': '🔄',
            'file_move': '📁',
            'file_rename': '🏷️',
            'file_list': '📋',
            'thought': '🧠'
        };
        
        return iconMap[this.options.command.action] || '🔧';
    }

    private getToolDisplayName(): string {
        const nameMap: Record<string, string> = {
            'file_search': 'File Search',
            'file_read': 'File Read',
            'file_write': 'File Write',
            'file_diff': 'File Diff',
            'file_move': 'File Move',
            'file_rename': 'File Rename',
            'file_list': 'File List',
            'thought': 'Thought Process'
        };
        
        return nameMap[this.options.command.action] || this.options.command.action;
    }

    private formatParameters(): string {
        const params = this.options.command.parameters;
        const formatted = Object.entries(params)
            .map(([key, value]) => `${key}: ${typeof value === 'string' && value.length > 50 
                ? value.substring(0, 50) + '...' 
                : JSON.stringify(value)}`)
            .join(', ');
        
        return `<code>${formatted}</code>`;
    }    private getResultSummary(): string {
        if (!this.options.result.success) {
            return `<span class="tool-error">${this.options.result.error || 'Unknown error'}</span>`;
        }
        
        const data = this.options.result.data;
        
        // Special handling for file operations
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
            const truncated = thought.length > 100 ? thought.substring(0, 100) + '...' : thought;
            return `<span class="tool-success">🧠 ${truncated}</span>`;
        }
        
        // Generic handling for other cases
        if (typeof data === 'string') {
            return data.length > 100 ? data.substring(0, 100) + '...' : data;
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
     * Update the display with new tool result
     */
    updateResult(result: ToolResult) {
        this.options.result = result;
        const newElement = this.createToolDisplay();
        this.element.replaceWith(newElement);
        this.element = newElement;
    }    /**
     * Convert the tool display to markdown format for saving to notes
     */
    toMarkdown(): string {
        const { command, result } = this.options;
        const status = result.success ? '✅' : '❌';
        const toolName = this.getToolDisplayName();
        const icon = this.getToolIcon();
        
        let markdown = `\n### ${icon} ${toolName} ${status}\n\n`;
        
        // Add parameters
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
        
        // Add result
        if (result.success) {
            markdown += `**Result:** ${this.getResultSummary()}\n\n`;
            
            // Add detailed result if available and different from summary
            const details = this.getDetailedResult();
            if (details && details !== this.getResultSummary()) {
                // Check if details are short enough to display inline
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
}
