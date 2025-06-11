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
    agentModeButton: HTMLButtonElement; // <-- add to interface
    referenceNoteButton: HTMLButtonElement;
    referenceNoteIndicator: HTMLElement;
}

export function createChatUI(app: App, contentEl: HTMLElement): ChatUIElements {
    // --- FADED HELP MESSAGE NEAR TOP ---
    const fadedHelp = contentEl.createDiv();
    fadedHelp.setText('Tip: Type /help or press Ctrl+Shift+H for chat commands and shortcuts. Use Ctrl+Shift+X to clear chat and Ctrl+Shift+C to copy.');
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
    // --- REFERENCE NOTE BUTTON ---
    const referenceNoteButton = document.createElement('button');
    referenceNoteButton.setText('📝');
    referenceNoteButton.setAttribute('aria-label', 'Toggle referencing current note');
    referenceNoteButton.addClass('ai-chat-reference-button');
    referenceNoteButton.style.fontSize = '0.85em';
    referenceNoteButton.style.fontFamily = 'inherit';
    referenceNoteButton.style.width = '1.8em';
    referenceNoteButton.style.height = '1.8em';
    referenceNoteButton.style.marginBottom = '0.2em';
    referenceNoteButton.style.opacity = '0.7';
    topButtonContainer.appendChild(referenceNoteButton);
    // --- REFERENCE NOTE INDICATOR (now under the button) ---
    const referenceNoteIndicator = document.createElement('div');
    referenceNoteIndicator.className = 'ai-reference-note-indicator';
    referenceNoteIndicator.style.textAlign = 'center';
    referenceNoteIndicator.style.opacity = '0.5';
    referenceNoteIndicator.style.fontSize = '0.85em';
    referenceNoteIndicator.style.margin = '0.1em 0 0.2em 0';
    referenceNoteIndicator.style.display = 'none';
    topButtonContainer.appendChild(referenceNoteIndicator);

    // Messages container - add tabindex to make it focusable for keyboard events
    const messagesContainer = contentEl.createDiv('ai-chat-messages');
    messagesContainer.setAttribute('tabindex', '0');

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
    stopButton.classList.add('hidden');    // --- TINY HELP BUTTON ABOVE SEND BUTTON ---
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

    // --- AGENT MODE BUTTON NEXT TO HELP BUTTON ---
    const agentModeButton = inputContainer.createEl('button', {
        text: '🤖',
    });
    agentModeButton.setAttr('aria-label', 'Toggle Agent Mode');
    agentModeButton.style.fontSize = '0.9em';
    agentModeButton.style.width = '1.8em';
    agentModeButton.style.height = '1.8em';
    agentModeButton.style.marginBottom = '0.2em';
    agentModeButton.style.opacity = '0.7';
    agentModeButton.style.position = 'absolute';
    agentModeButton.style.right = '2.8em'; // Position to the left of help button
    agentModeButton.style.top = '-2.2em';
    agentModeButton.style.zIndex = '2';

    // Add a class for agent mode active state
    agentModeButton.classList.add('ai-agent-mode-btn');

    // Utility to set agent mode button appearance
    function setAgentModeActive(isActive: boolean) {
        if (isActive) {
            agentModeButton.classList.add('active');
        } else {
            agentModeButton.classList.remove('active');
        }
    }
    // Expose the setter on the button for easy access
    (agentModeButton as any).setActive = setAgentModeActive;

    inputContainer.appendChild(agentModeButton);
    
    inputContainer.style.position = 'relative';

    // After all button creations in topButtonContainer, apply consistent font size and font family
    [topButtonContainer.querySelectorAll('button')].forEach(btns => {
      btns.forEach(btn => {
        btn.style.fontSize = '0.85em';
        btn.style.fontFamily = 'inherit';
      });
    });

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
        agentModeButton, // <-- add to return object
        referenceNoteButton,
        referenceNoteIndicator,
    };
}
