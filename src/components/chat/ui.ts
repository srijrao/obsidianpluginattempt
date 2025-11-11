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
    referenceAllOpenNotesButton: HTMLButtonElement; // Button to toggle referencing all open notes
    obsidianLinksButton: HTMLButtonElement; // Button to toggle Obsidian links
    contextNotesButton: HTMLButtonElement;  // Button to toggle context notes
    renderModeButton: HTMLButtonElement; // Button to toggle live/source rendering mode
    // New Context Notes action buttons (next to Agent Mode)
    contextClearButton: HTMLButtonElement; // Button to clear context notes
    contextAddCurrentButton: HTMLButtonElement; // Button to add current note to context
    contextAddAllOpenButton: HTMLButtonElement; // Button to add all open notes to context
    referenceNoteIndicator: HTMLElement; // Indicator showing referenced note name
    referenceAllOpenNotesIndicator: HTMLElement; // Indicator showing referenced open notes
    obsidianLinksIndicator: HTMLElement; // Indicator showing Obsidian Links status
    contextNotesIndicator: HTMLElement;  // Indicator showing context notes
    expandedLinkDisplay: HTMLElement;    // Display showing resolved/unresolved links
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
    
    // Configuration constants for consistent spacing
    const BUTTON_SIZE = '1.8em';
    const BUTTON_SPACING = 1.4; // Multiplier for positioning (1.8em * 1.4 = ~2.5em gap per button)
    const ABSOLUTE_BUTTON_TOP = '-2.2em';
    
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
        btn.style.width = BUTTON_SIZE;
        btn.style.height = BUTTON_SIZE;
        btn.style.marginBottom = '0.2em';
        btn.style.opacity = '0.7';
        if (options.className) btn.className = options.className;
        if (options.addClass) btn.classList.add(options.addClass);
        return btn;
    }
    
    function createAbsoluteButton(options: {
        text: string;
        ariaLabel: string;
        positionIndex: number; // 0 = rightmost, 1 = one left, 2 = two left, etc.
        addClass?: string;
    }): HTMLButtonElement {
        const btn = document.createElement('button');
        btn.setText(options.text);
        btn.setAttribute('aria-label', options.ariaLabel);
        btn.style.fontSize = '0.9em';
        btn.style.width = BUTTON_SIZE;
        btn.style.height = BUTTON_SIZE;
        btn.style.marginBottom = '0.2em';
        btn.style.opacity = '0.7';
        btn.style.position = 'absolute';
        btn.style.top = ABSOLUTE_BUTTON_TOP;
        btn.style.zIndex = '2';
        
        // Calculate right position based on index
        const baseOffset = 0.5; // em
        const buttonWidth = parseFloat(BUTTON_SIZE); // 1.8
        const rightPosition = baseOffset + (options.positionIndex * buttonWidth * BUTTON_SPACING);
        btn.style.right = `${rightPosition}em`;
        
        if (options.addClass) btn.classList.add(options.addClass);
        return btn;
    }

    function createIndicator(options: {
        className: string;
    }): HTMLElement {
        const div = document.createElement('div');
        div.className = options.className;
        div.style.textAlign = 'left';
        div.style.opacity = '0.5';
        div.style.fontSize = '0.75em';
        div.style.margin = '0.1em 0 0 0';
        div.style.display = 'none';
        div.style.whiteSpace = 'normal';
        div.style.wordBreak = 'break-word';
        div.style.overflowWrap = 'break-word';
        div.style.maxWidth = '100%';
        return div;
    }

    // --- Single unified header row: model info on left, buttons on right ---
    const topRowContainer = contentEl.createDiv('ai-chat-top-row');
    topRowContainer.style.display = 'flex';
    topRowContainer.style.flexDirection = 'row';
    topRowContainer.style.alignItems = 'center';
    topRowContainer.style.justifyContent = 'space-between';
    topRowContainer.style.gap = '1em';
    topRowContainer.style.margin = '0.5em 0';
    topRowContainer.style.borderBottom = '1px solid var(--background-modifier-border)';
    topRowContainer.style.paddingBottom = '0.5em';

    // Left column: Model name and indicators
    const modelInfoColumn = document.createElement('div');
    modelInfoColumn.style.display = 'flex';
    modelInfoColumn.style.flexDirection = 'column';
    modelInfoColumn.style.alignItems = 'flex-start';
    modelInfoColumn.style.gap = '0.2em';
    modelInfoColumn.style.flex = '1 1 0';
    modelInfoColumn.style.minWidth = '0';
    topRowContainer.appendChild(modelInfoColumn);

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

    // Tertiary button container (rendering mode toggle)
    const tertiaryButtonContainer = document.createElement('div');
    tertiaryButtonContainer.className = 'ai-chat-tertiary-buttons';
    tertiaryButtonContainer.style.display = 'flex';
    tertiaryButtonContainer.style.justifyContent = 'flex-end';
    tertiaryButtonContainer.style.gap = '0.5em';
    buttonColumn.appendChild(tertiaryButtonContainer);

    topRowContainer.appendChild(buttonColumn);
    contentEl.appendChild(topRowContainer);
    
    // Faded help text element (kept for compatibility, but hidden by default)
    const fadedHelp = document.createElement('div');
    fadedHelp.style.display = 'none'; // Hidden since we're showing model info instead

    // Button configs for DRY creation
    const mainTopButtons = [
        { key: 'settingsButton', text: '⚙️', ariaLabel: 'Toggle model settings' },
        { key: 'copyAllButton', text: '📋', ariaLabel: 'Copy all messages' },
        { key: 'saveNoteButton', text: '💾', ariaLabel: 'Save chat as note' },
        { key: 'clearButton', text: '🗑️', ariaLabel: 'Clear chat history' },
    ];
    const secondaryTopButtons = [
        { key: 'referenceNoteButton', text: '📝', ariaLabel: 'Toggle referencing current note', addClass: 'ai-chat-reference-button' },
        { key: 'referenceAllOpenNotesButton', text: '📖', ariaLabel: 'Toggle referencing all open notes', addClass: 'ai-chat-reference-all-open-button' },
        { key: 'obsidianLinksButton', text: '🔗', ariaLabel: 'Toggle Obsidian links', addClass: 'ai-chat-obsidian-links-button' },
        { key: 'contextNotesButton', text: '📚', ariaLabel: 'Toggle context notes', addClass: 'ai-chat-context-notes-button' },
    ];
    const tertiaryTopButtons = [
        { key: 'renderModeButton', text: '👁️', ariaLabel: 'Toggle live/source rendering mode', addClass: 'ai-chat-render-mode-button' },
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
    for (const btnCfg of tertiaryTopButtons) {
        const btn = createIconButton(btnCfg);
        tertiaryButtonContainer.appendChild(btn);
        buttonRefs[btnCfg.key] = btn;
    }

    // Indicator configs for DRY creation
    const referenceNoteIndicator = createIndicator({ className: 'ai-reference-note-indicator' });
    const referenceAllOpenNotesIndicator = createIndicator({ className: 'ai-reference-all-open-notes-indicator' });
    const obsidianLinksIndicator = createIndicator({ className: 'ai-obsidian-links-indicator' });
    const contextNotesIndicator = createIndicator({ className: 'ai-context-notes-indicator' });
    const expandedLinkDisplay = createIndicator({ className: 'ai-expanded-link-display' });

    // Model Name Display (now in left column of top row)
    const modelNameDisplay = document.createElement('div');
    modelNameDisplay.className = 'ai-model-name-display';
    modelNameDisplay.style.textAlign = 'left';
    modelNameDisplay.style.opacity = '0.7';
    modelNameDisplay.style.fontSize = '0.85em';
    modelNameDisplay.style.margin = '0';
    modelNameDisplay.style.fontWeight = 'bold';
    
    // Add model name and indicators to the left column
    modelInfoColumn.appendChild(modelNameDisplay);
    modelInfoColumn.appendChild(referenceNoteIndicator);
    modelInfoColumn.appendChild(referenceAllOpenNotesIndicator);
    modelInfoColumn.appendChild(obsidianLinksIndicator);
    modelInfoColumn.appendChild(contextNotesIndicator);
    modelInfoColumn.appendChild(expandedLinkDisplay);

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
    // --- Ensure stopButton is always clickable and visible when needed ---
    stopButton.disabled = false;
    stopButton.style.pointerEvents = '';
    stopButton.tabIndex = 0;
    stopButton.onclick = null;
    stopButton.style.zIndex = '10';
    stopButton.title = 'Stop AI response';
    // -----

    // Configure all absolutely-positioned buttons in one place
    inputContainer.style.position = 'relative';
    
    const absoluteButtons = [
        { key: 'helpButton', text: '?', ariaLabel: 'Show chat help', positionIndex: 0 },
        { key: 'agentModeButton', text: '🤖', ariaLabel: 'Toggle Agent Mode', positionIndex: 1, addClass: 'ai-agent-mode-btn' },
        { key: 'contextClearButton', text: '🧹', ariaLabel: 'Clear context notes', positionIndex: 2, addClass: 'ai-context-clear-btn' },
        { key: 'contextAddCurrentButton', text: '➕', ariaLabel: 'Add current note to context notes', positionIndex: 3, addClass: 'ai-context-add-current-btn' },
        { key: 'contextAddAllOpenButton', text: '🗃️', ariaLabel: 'Add all open notes to context notes', positionIndex: 4, addClass: 'ai-context-add-all-open-btn' },
    ];
    
    const absoluteButtonRefs: Record<string, HTMLButtonElement> = {};
    for (const btnCfg of absoluteButtons) {
        const btn = createAbsoluteButton(btnCfg);
        inputContainer.appendChild(btn);
        absoluteButtonRefs[btnCfg.key] = btn;
    }
    
    const helpButton = absoluteButtonRefs.helpButton;
    const agentModeButton = absoluteButtonRefs.agentModeButton;
    const contextClearButton = absoluteButtonRefs.contextClearButton;
    const contextAddCurrentButton = absoluteButtonRefs.contextAddCurrentButton;
    const contextAddAllOpenButton = absoluteButtonRefs.contextAddAllOpenButton;
    
    // Add agent mode active state toggle method
    function setAgentModeActive(isActive: boolean) {
        if (isActive) {
            agentModeButton.classList.add('active');
        } else {
            agentModeButton.classList.remove('active');
        }
    }
    (agentModeButton as any).setActive = setAgentModeActive;

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
        referenceAllOpenNotesButton: buttonRefs.referenceAllOpenNotesButton,
        obsidianLinksButton: buttonRefs.obsidianLinksButton,
        contextNotesButton: buttonRefs.contextNotesButton,
        renderModeButton: buttonRefs.renderModeButton,
        contextClearButton,
        contextAddCurrentButton,
        contextAddAllOpenButton,
        referenceNoteIndicator,
        referenceAllOpenNotesIndicator,
        obsidianLinksIndicator,
        contextNotesIndicator,
        expandedLinkDisplay,
        modelNameDisplay,
    };
}
