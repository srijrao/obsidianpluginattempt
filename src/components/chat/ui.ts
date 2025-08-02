import { App } from 'obsidian';

/**
 * Interface representing the key UI elements of the chat view.
 */
export interface ChatUIElements {
    contentEl: HTMLElement;             // The main content element of the view
    fadedHelp: HTMLElement;             // Element displaying faded help text
    topButtonContainer: HTMLElement;    // Container for top control buttons
    settingsButton: HTMLButtonElement;  // Button to open settings
    copyAllButton: HTMLButtonElement;   // Button to copy all chat messages
    saveNoteButton: HTMLButtonElement;  // Button to save chat as a note
    clearButton: HTMLButtonElement;     // Button to clear the chat
    messagesContainer: HTMLElement;     // Container for chat messages
    toolContinuationContainer: HTMLElement; // Container for agent tool continuation UI
    inputContainer: HTMLElement;        // Container for the chat input area
    textarea: HTMLTextAreaElement;      // The chat input textarea
    sendButton: HTMLButtonElement;      // Button to send the message
    stopButton: HTMLButtonElement;      // Button to stop generation
    helpButton: HTMLButtonElement;      // Button to show help modal
    agentModeButton: HTMLButtonElement; // Button to toggle agent mode
    referenceNoteButton: HTMLButtonElement; // Button to toggle referencing current note
    obsidianLinksButton: HTMLButtonElement; // Button to toggle Obsidian links
    contextNotesButton: HTMLButtonElement;  // Button to toggle context notes
    referenceNoteIndicator: HTMLElement; // Indicator showing referenced note name
    obsidianLinksIndicator: HTMLElement; // Indicator showing Obsidian Links status
    contextNotesIndicator: HTMLElement;  // Indicator showing context notes
    modelNameDisplay: HTMLElement;      // Display for the current model name
}

/**
 * Creates and structures the main UI elements for the chat view.
 * Appends elements to the provided content element.
 * @param app The Obsidian App instance.
 * @param contentEl The main content element of the view to append UI elements to.
 * @returns An object containing references to the created UI elements.
 */
export function createChatUI(app: App, contentEl: HTMLElement): ChatUIElements {


    // --- DRY Helper Functions ---
    function createIconButton(options: {
        text: string;
        ariaLabel: string;
        className?: string;
        addClass?: string;
    }): HTMLButtonElement {
        const btn = document.createElement('button');
        btn.setText(options.text);
        btn.setAttribute('aria-label', options.ariaLabel);
        btn.style.fontSize = '0.85em';
        btn.style.fontFamily = 'inherit';
        btn.style.width = '1.8em';
        btn.style.height = '1.8em';
        btn.style.marginBottom = '0.2em';
        btn.style.opacity = '0.7';
        if (options.className) btn.className = options.className;
        if (options.addClass) btn.classList.add(options.addClass);
        return btn;
    }

    function createIndicator(options: {
        className: string;
    }): HTMLElement {
        const div = document.createElement('div');
        div.className = options.className;
        div.style.textAlign = 'center';
        div.style.opacity = '0.5';
        div.style.fontSize = '0.85em';
        div.style.margin = '0.1em 0 0.2em 0';
        div.style.display = 'none';
        div.style.whiteSpace = 'normal';
        div.style.wordBreak = 'break-word';
        div.style.overflowWrap = 'break-word';
        div.style.maxWidth = '100%';
        return div;
    }

    // --- Two-column flex row for help and buttons ---
    const topRowContainer = contentEl.createDiv('ai-chat-top-row');
    topRowContainer.style.display = 'flex';
    topRowContainer.style.flexDirection = 'row';
    topRowContainer.style.alignItems = 'flex-start';
    topRowContainer.style.justifyContent = 'space-between';
    topRowContainer.style.gap = '1em';
    topRowContainer.style.margin = '0.5em 0 0.2em 0';

    // Faded help text element (left column)
    const fadedHelp = document.createElement('div');
    fadedHelp.setText('Tip: Type /help or press Ctrl+Shift+H for chat commands and shortcuts. Use Ctrl+Shift+X to clear chat and Ctrl+Shift+C to copy.');
    fadedHelp.style.textAlign = 'left';
    fadedHelp.style.opacity = '0.6';
    fadedHelp.style.fontSize = '0.95em';
    fadedHelp.style.flex = '1 1 0';
    fadedHelp.style.minWidth = '0';
    topRowContainer.appendChild(fadedHelp);

    // Button containers (right column, vertical stack)
    const buttonColumn = document.createElement('div');
    buttonColumn.style.display = 'flex';
    buttonColumn.style.flexDirection = 'column';
    buttonColumn.style.alignItems = 'flex-end';
    buttonColumn.style.gap = '0.2em';
    buttonColumn.style.flex = '0 0 auto';

    // Top button container (main buttons)
    const topButtonContainer = document.createElement('div');
    topButtonContainer.className = 'ai-chat-buttons';
    topButtonContainer.style.display = 'flex';
    topButtonContainer.style.gap = '0.5em';
    buttonColumn.appendChild(topButtonContainer);

    // Secondary button container (reference/link/context)
    const secondaryButtonContainer = document.createElement('div');
    secondaryButtonContainer.className = 'ai-chat-secondary-buttons';
    secondaryButtonContainer.style.display = 'flex';
    secondaryButtonContainer.style.justifyContent = 'flex-end';
    secondaryButtonContainer.style.gap = '0.5em';
    buttonColumn.appendChild(secondaryButtonContainer);

    topRowContainer.appendChild(buttonColumn);
    contentEl.appendChild(topRowContainer);

    // Button configs for DRY creation
    const mainTopButtons = [
        { key: 'settingsButton', text: '⚙️', ariaLabel: 'Toggle model settings' },
        { key: 'copyAllButton', text: '📋', ariaLabel: 'Copy all messages' },
        { key: 'saveNoteButton', text: '💾', ariaLabel: 'Save chat as note' },
        { key: 'clearButton', text: '🗑️', ariaLabel: 'Clear chat history' },
    ];
    const secondaryTopButtons = [
        { key: 'referenceNoteButton', text: '📝', ariaLabel: 'Toggle referencing current note', addClass: 'ai-chat-reference-button' },
        { key: 'obsidianLinksButton', text: '🔗', ariaLabel: 'Toggle Obsidian links', addClass: 'ai-chat-obsidian-links-button' },
        { key: 'contextNotesButton', text: '📚', ariaLabel: 'Toggle context notes', addClass: 'ai-chat-context-notes-button' },
    ];

    // Store button references
    const buttonRefs: Record<string, HTMLButtonElement> = {};
    for (const btnCfg of mainTopButtons) {
        const btn = createIconButton(btnCfg);
        topButtonContainer.appendChild(btn);
        buttonRefs[btnCfg.key] = btn;
    }
    for (const btnCfg of secondaryTopButtons) {
        const btn = createIconButton(btnCfg);
        secondaryButtonContainer.appendChild(btn);
        buttonRefs[btnCfg.key] = btn;
    }

    // Indicator configs for DRY creation
    const referenceNoteIndicator = createIndicator({ className: 'ai-reference-note-indicator' });
    const obsidianLinksIndicator = createIndicator({ className: 'ai-obsidian-links-indicator' });
    const contextNotesIndicator = createIndicator({ className: 'ai-context-notes-indicator' });

    // Model Name Display Container (separate line from buttons)
    const modelDisplayContainer = contentEl.createDiv('ai-model-display-container');
    modelDisplayContainer.style.textAlign = 'center';
    modelDisplayContainer.style.margin = '0.5em 0';
    modelDisplayContainer.style.borderBottom = '1px solid var(--background-modifier-border)';
    modelDisplayContainer.style.paddingBottom = '0.5em';

    // Model Name Display
    const modelNameDisplay = document.createElement('div');
    modelNameDisplay.className = 'ai-model-name-display';
    modelNameDisplay.style.textAlign = 'center';
    modelNameDisplay.style.opacity = '0.7';
    modelNameDisplay.style.fontSize = '0.75em';
    modelNameDisplay.style.margin = '0';
    modelNameDisplay.style.fontWeight = 'bold';
    modelDisplayContainer.appendChild(modelNameDisplay);
    // Add all indicators to the model display container (same line as model)
    modelDisplayContainer.appendChild(referenceNoteIndicator);
    modelDisplayContainer.appendChild(obsidianLinksIndicator);
    modelDisplayContainer.appendChild(contextNotesIndicator);

    // Messages container (where chat messages are displayed)
    const messagesContainer = contentEl.createDiv('ai-chat-messages');
    messagesContainer.setAttribute('tabindex', '0'); // Make it focusable for keyboard shortcuts

    // Tool Continuation Container (for agent mode UI like "Continue" buttons)
    const toolContinuationContainer = contentEl.createDiv('ai-tool-continuation-container');
    toolContinuationContainer.style.display = 'none'; // Hidden by default

    // Input container (holds textarea and input buttons)
    const inputContainer = contentEl.createDiv('ai-chat-input-container');

    // Textarea for user input
    const textarea = inputContainer.createEl('textarea', {
        cls: 'ai-chat-input',
        attr: {
            placeholder: 'Type your message...',
            rows: '3'
        }
    });

    // Send button
    const sendButton = inputContainer.createEl('button', {
        text: 'Send',
        cls: 'mod-cta'
    });

    // Stop button (initially hidden)
    const stopButton = inputContainer.createEl('button', {
        text: 'Stop',
    });
    stopButton.classList.add('hidden');
    // --- Fix: Ensure stopButton is always clickable and visible when needed ---
    stopButton.disabled = false;
    stopButton.style.pointerEvents = '';
    stopButton.tabIndex = 0;
    stopButton.onclick = null;
    stopButton.style.zIndex = '10';
    stopButton.title = 'Stop AI response';
    // --- End fix ---

    // Help button (?)
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

    // Agent Mode button (🤖)
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
    agentModeButton.style.right = '2.8em'; // Position next to help button
    agentModeButton.style.top = '-2.2em';
    agentModeButton.style.zIndex = '2';
    agentModeButton.classList.add('ai-agent-mode-btn');
    function setAgentModeActive(isActive: boolean) {
        if (isActive) {
            agentModeButton.classList.add('active');
        } else {
            agentModeButton.classList.remove('active');
        }
    }
    (agentModeButton as any).setActive = setAgentModeActive;
    inputContainer.appendChild(agentModeButton);
    inputContainer.style.position = 'relative';

    // Return all created UI elements
    return {
        contentEl,
        fadedHelp,
        topButtonContainer,
        settingsButton: buttonRefs.settingsButton,
        copyAllButton: buttonRefs.copyAllButton,
        saveNoteButton: buttonRefs.saveNoteButton,
        clearButton: buttonRefs.clearButton,
        messagesContainer,
        toolContinuationContainer,
        inputContainer,
        textarea,
        sendButton,
        stopButton,
        helpButton,
        agentModeButton,
        referenceNoteButton: buttonRefs.referenceNoteButton,
        obsidianLinksButton: buttonRefs.obsidianLinksButton,
        contextNotesButton: buttonRefs.contextNotesButton,
        referenceNoteIndicator,
        obsidianLinksIndicator,
        contextNotesIndicator,
        modelNameDisplay,
    };
}
