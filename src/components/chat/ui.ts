import { App } from 'obsidian';

export interface ChatUIElements {
    contentEl: HTMLElement;
    fadedHelp: HTMLElement;
    topButtonContainer: HTMLElement;
    settingsButton: HTMLButtonElement;
    copyAllButton: HTMLButtonElement;
    saveNoteButton: HTMLButtonElement;
    clearButton: HTMLButtonElement;
    messagesContainer: HTMLElement;
    inputContainer: HTMLElement;
    textarea: HTMLTextAreaElement;
    sendButton: HTMLButtonElement;
    stopButton: HTMLButtonElement;
    helpButton: HTMLButtonElement;
}

export function createChatUI(app: App, contentEl: HTMLElement): ChatUIElements {
    // --- FADED HELP MESSAGE NEAR TOP ---
    const fadedHelp = contentEl.createDiv();
    fadedHelp.setText('Tip: Type /help or press Ctrl+Shift+H for chat commands and shortcuts.');
    fadedHelp.style.textAlign = 'center';
    fadedHelp.style.opacity = '0.6';
    fadedHelp.style.fontSize = '0.95em';
    fadedHelp.style.margin = '0.5em 0 0.2em 0';

    // --- BUTTONS ABOVE CHAT WINDOW ---
    const topButtonContainer = contentEl.createDiv('ai-chat-buttons');
    // Settings button
    const settingsButton = document.createElement('button');
    settingsButton.setText('Settings');
    settingsButton.setAttribute('aria-label', 'Toggle model settings');
    topButtonContainer.appendChild(settingsButton);
    // Copy All button
    const copyAllButton = document.createElement('button');
    copyAllButton.textContent = 'Copy All';
    topButtonContainer.appendChild(copyAllButton);
    // Save as Note button
    const saveNoteButton = document.createElement('button');
    saveNoteButton.textContent = 'Save as Note';
    topButtonContainer.appendChild(saveNoteButton);
    // Clear button
    const clearButton = document.createElement('button');
    clearButton.textContent = 'Clear Chat';
    topButtonContainer.appendChild(clearButton);

    // Messages container
    const messagesContainer = contentEl.createDiv('ai-chat-messages');

    // --- INPUT CONTAINER AT BOTTOM ---
    const inputContainer = contentEl.createDiv('ai-chat-input-container');
    // Textarea for input
    const textarea = inputContainer.createEl('textarea', {
        cls: 'ai-chat-input',
        attr: {
            placeholder: 'Type your message...',
            rows: '3'
        }
    });

    // Send button (now next to textarea)
    const sendButton = inputContainer.createEl('button', {
        text: 'Send',
        cls: 'mod-cta'
    });
    // Stop button (now next to textarea, hidden initially)
    const stopButton = inputContainer.createEl('button', {
        text: 'Stop',
    });
    stopButton.classList.add('hidden');

    // --- TINY HELP BUTTON ABOVE SEND BUTTON ---
    const helpButton = inputContainer.createEl('button', {
        text: '?',
    });
    helpButton.setAttr('aria-label', 'Show chat help');
    helpButton.style.fontSize = '0.9em';
    helpButton.style.width = '1.8em';
    helpButton.style.height = '1.8em';
    helpButton.style.marginBottom = '0.2em';
    helpButton.style.opacity = '0.7';
    helpButton.style.position = 'absolute';
    helpButton.style.right = '0.5em';
    helpButton.style.top = '-2.2em';
    helpButton.style.zIndex = '2';
    inputContainer.style.position = 'relative';

    return {
        contentEl,
        fadedHelp,
        topButtonContainer,
        settingsButton,
        copyAllButton,
        saveNoteButton,
        clearButton,
        messagesContainer,
        inputContainer,
        textarea,
        sendButton,
        stopButton,
        helpButton,
    };
}
