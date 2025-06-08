import { Modal, App } from 'obsidian';

export class ChatHelpModal extends Modal {
    constructor(app: App) {
        super(app);
    }
    onOpen() {
        this.titleEl.setText('AI Chat Help');
        this.contentEl.innerHTML = `
            <div style="line-height:1.7;font-size:1em;">
                <b>Slash Commands:</b><br>
                <code>/clear</code> – Clear the chat<br>
                <code>/copy</code> – Copy all chat<br>
                <code>/save</code> – Save chat as note<br>
                <code>/settings</code> – Open settings<br>
                <code>/help</code> – Show this help<br>
                <br>
                <b>Keyboard Shortcuts (when input is focused):</b><br>
                <code>Ctrl+Shift+C</code> – Clear chat<br>
                <code>Ctrl+Shift+Y</code> – Copy all chat<br>
                <code>Ctrl+Shift+S</code> – Save as note<br>
                <code>Ctrl+Shift+O</code> – Open settings<br>
                <code>Ctrl+Shift+H</code> – Show this help<br>
                <br>
                <b>Other:</b><br>
                <code>Enter</code> – Send message<br>
                <code>Shift+Enter</code> – Newline<br>
                <br>
                You can also use the buttons at the top of the chat window.
            </div>
        `;
    }
}
