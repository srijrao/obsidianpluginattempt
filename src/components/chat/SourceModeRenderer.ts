import { App } from 'obsidian';

/**
 * SourceModeRenderer handles displaying raw markdown content in source mode.
 * Shows the actual markdown text including ai-tool-execution JSON blocks.
 */
export class SourceModeRenderer {
    private app: App;

    constructor(app: App) {
        this.app = app;
    }

    /**
     * Renders raw markdown content in source mode.
     * @param content Raw markdown content
     * @param container The container element to render into
     */
    renderSourceMode(content: string, container: HTMLElement): void {
        // Clear existing content
        container.empty();

        // Create pre element for monospace display
        const pre = document.createElement('pre');
        pre.style.whiteSpace = 'pre-wrap';
        pre.style.fontFamily = 'var(--font-monospace)';
        pre.style.fontSize = '0.9em';
        pre.style.background = 'var(--background-secondary)';
        pre.style.padding = '0.5em';
        pre.style.borderRadius = '4px';
        pre.style.border = '1px solid var(--background-modifier-border)';
        pre.style.margin = '0';
        pre.style.width = '100%';
        pre.style.boxSizing = 'border-box';

        // Set the raw markdown content
        pre.textContent = content;

        // Add syntax highlighting for JSON blocks if available
        this.addSyntaxHighlighting(pre);

        container.appendChild(pre);
    }

    /**
     * Adds basic syntax highlighting for ai-tool-execution JSON blocks.
     * @param preElement The pre element containing the markdown
     */
    private addSyntaxHighlighting(preElement: HTMLElement): void {
        const content = preElement.textContent || '';
        if (!content.includes('```ai-tool-execution')) {
            return;
        }

        // Simple syntax highlighting for JSON blocks
        const highlightedContent = content.replace(
            /```ai-tool-execution\n([\s\S]*?)\n```/g,
            (match, jsonContent) => {
                try {
                    // Parse and re-stringify for consistent formatting
                    const parsed = JSON.parse(jsonContent);
                    const formatted = JSON.stringify(parsed, null, 2);

                    // Create highlighted version
                    const highlighted = this.highlightJSON(formatted);
                    return `<div style="background: var(--background-secondary-alt); border-left: 3px solid var(--interactive-accent); padding: 0.5em; margin: 0.5em 0;">
                        <div style="color: var(--text-muted); font-size: 0.8em; margin-bottom: 0.25em;">ai-tool-execution</div>
                        <pre style="margin: 0; white-space: pre-wrap; font-family: var(--font-monospace); font-size: 0.85em;">${highlighted}</pre>
                    </div>`;
                } catch (e) {
                    // If JSON parsing fails, show as plain text
                    return `<div style="background: var(--background-secondary-alt); border-left: 3px solid var(--text-error); padding: 0.5em; margin: 0.5em 0;">
                        <div style="color: var(--text-error); font-size: 0.8em; margin-bottom: 0.25em;">ai-tool-execution (invalid JSON)</div>
                        <pre style="margin: 0; white-space: pre-wrap; font-family: var(--font-monospace); font-size: 0.85em;">${jsonContent}</pre>
                    </div>`;
                }
            }
        );

        preElement.innerHTML = highlightedContent;
    }

    /**
     * Basic JSON syntax highlighting.
     * @param jsonString The JSON string to highlight
     * @returns HTML string with syntax highlighting
     */
    private highlightJSON(jsonString: string): string {
        return jsonString
            .replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g, (match) => {
                let cls = 'json-number';
                if (/^"/.test(match)) {
                    if (/:$/.test(match)) {
                        cls = 'json-key';
                    } else {
                        cls = 'json-string';
                    }
                } else if (/true|false/.test(match)) {
                    cls = 'json-boolean';
                } else if (/null/.test(match)) {
                    cls = 'json-null';
                }

                const colorMap: { [key: string]: string } = {
                    'json-key': 'var(--text-accent)',
                    'json-string': 'var(--text-success)',
                    'json-number': 'var(--text-accent-hover)',
                    'json-boolean': 'var(--interactive-accent)',
                    'json-null': 'var(--text-error)'
                };

                return `<span style="color: ${colorMap[cls] || 'var(--text-normal)'}">${match}</span>`;
            });
    }

    /**
     * Gets the current raw content from source mode display.
     * @param container The container element
     * @returns The raw markdown content
     */
    getRawContent(container: HTMLElement): string {
        const pre = container.querySelector('pre');
        if (pre) {
            return pre.textContent || '';
        }
        return container.textContent || '';
    }

    /**
     * Updates the content in source mode.
     * @param content New raw markdown content
     * @param container The container element
     */
    updateContent(content: string, container: HTMLElement): void {
        this.renderSourceMode(content, container);
    }
}