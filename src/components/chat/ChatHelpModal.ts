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
        
        
        const originalContent = this.contentEl;
        this.contentEl = content;
        contentCallback();
        this.contentEl = originalContent;
        
        return sectionContainer;
    }

    onOpen() {
        this.titleEl.setText('AI Chat Help');
        this.contentEl.empty();
        
        
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
        
        
        this.contentEl.appendChild(this.createCollapsibleSection('Keyboard Shortcuts (when chat window or input is focused)', () => {
            this.contentEl.innerHTML = `
                <code>Ctrl+Shift+X</code> – Clear chat<br>
                <code>Ctrl+Shift+C</code> – Copy all chat<br>
                <code>Ctrl+Shift+S</code> – Save as note<br>
                <code>Ctrl+Shift+O</code> – Open settings<br>
                <code>Ctrl+Shift+H</code> – Show this help<br>
                <code>Ctrl+Shift+R</code> – Toggle referencing current note<br>
                <br>
            `;
        }));
          
        this.contentEl.appendChild(this.createCollapsibleSection('Other', () => {
            this.contentEl.innerHTML = `
                <code>Enter</code> – Send message<br>
                <code>Shift+Enter</code> – Newline<br>
                <br>
                You can also use the buttons at the top of the chat window.
            `;
        }));

        
        this.contentEl.appendChild(this.createCollapsibleSection('Reference Current Note', () => {
            this.contentEl.innerHTML = `
                <strong>What is it?</strong><br>
                When enabled, the AI can see the content of your currently active note during chat. This helps the AI give more relevant, context-aware responses.<br><br>

                <strong>How to use:</strong><br>
                <ul style="margin-top:0;margin-bottom:0.5em;">
                  <li>Click the <code>📝</code> button at the top of the chat window to toggle referencing the current note.</li>
                  <li>Or use the slash command <code>/ref</code> or keyboard shortcut <code>Ctrl+Shift+R</code>.</li>
                  <li>The name of the referenced note will appear in faded small text below the buttons when enabled.</li>
                </ul>

                <strong>Notes:</strong><br>
                - When referencing is enabled, the AI receives:<br>
                <ul style="margin-top:0;margin-bottom:0.5em;">
                  <li>The system prompt (always)</li>
                  <li>Context notes (if enabled in settings)</li>
                  <li>The content of the currently active note</li>
                  <li>The chat history (all previous user/assistant messages)</li>
                </ul>
                - Only the currently active note is shared in addition to the above context.<br>
                - You can turn this on or off at any time.<br>
                - No other notes or personal data are accessed.<br>
                - The <code>📝</code> button will show "On" or "Off" to indicate the current state.
            `;
        }));
    }
}

/**
 * Chat Help Modal
 *
 * Reference Current Note:
 * - Use the "📝" button at the top of the chat to toggle referencing the current note.
 * - You can also use the slash command "/ref" or the keyboard shortcut Ctrl+Shift+R.
 * - When enabled, the note name appears below the button.
 * - Other context (system prompt, context notes, chat history) may also be sent.
 */
