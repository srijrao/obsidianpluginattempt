import { Modal, App } from 'obsidian';

export class ChatHelpModal extends Modal {
    constructor(app: App) {
        super(app);
    }    createCollapsibleSection(title: string, contentCallback: () => void, expanded = true): HTMLElement {
        const sectionContainer = createDiv();
        sectionContainer.addClass('ai-collapsible-section');
        
        const header = createDiv();
        header.addClass('ai-collapsible-header');
        
        const arrow = createSpan();
        arrow.addClass('ai-collapsible-arrow');
        arrow.textContent = expanded ? '▼' : '▶';
        
        const titleSpan = createSpan();
        titleSpan.textContent = title;
        
        header.appendChild(arrow);
        header.appendChild(titleSpan);
        
        const content = createDiv();
        content.addClass('ai-collapsible-content');
        content.style.display = expanded ? 'block' : 'none';
        
        header.addEventListener('click', () => {
            const isExpanded = content.style.display !== 'none';
            content.style.display = isExpanded ? 'none' : 'block';
            arrow.textContent = isExpanded ? '▶' : '▼';
        });
        
        sectionContainer.appendChild(header);
        sectionContainer.appendChild(content);
        
        // Set content as the context for the callback
        const originalContent = this.contentEl;
        this.contentEl = content;
        contentCallback();
        this.contentEl = originalContent;
        
        return sectionContainer;
    }

    onOpen() {
        this.titleEl.setText('AI Chat Help');
        this.contentEl.empty();
        
        // Slash Commands Section
        this.contentEl.appendChild(this.createCollapsibleSection('Slash Commands', () => {
            this.contentEl.innerHTML = `
                <code>/clear</code> – Clear the chat<br>
                <code>/copy</code> – Copy all chat<br>
                <code>/save</code> – Save chat as note<br>
                <code>/settings</code> – Open settings<br>
                <code>/help</code> – Show this help<br>
                <br>
            `;
        }));
        
        // Keyboard Shortcuts Section
        this.contentEl.appendChild(this.createCollapsibleSection('Keyboard Shortcuts (when input is focused)', () => {
            this.contentEl.innerHTML = `
                <code>Ctrl+Shift+C</code> – Clear chat<br>
                <code>Ctrl+Shift+Y</code> – Copy all chat<br>
                <code>Ctrl+Shift+S</code> – Save as note<br>
                <code>Ctrl+Shift+O</code> – Open settings<br>
                <code>Ctrl+Shift+H</code> – Show this help<br>
                <br>
            `;
        }));
        
        // Other Section
        this.contentEl.appendChild(this.createCollapsibleSection('Other', () => {
            this.contentEl.innerHTML = `
                <code>Enter</code> – Send message<br>
                <code>Shift+Enter</code> – Newline<br>
                <br>
                You can also use the buttons at the top of the chat window.
            `;
        }));
    }
}
