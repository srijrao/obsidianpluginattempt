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

    // Faded help text element
    const fadedHelp = contentEl.createDiv();
    fadedHelp.setText('Tip: Type /help or press Ctrl+Shift+H for chat commands and shortcuts. Use Ctrl+Shift+X to clear chat and Ctrl+Shift+C to copy.');
    fadedHelp.style.textAlign = 'center';
    fadedHelp.style.opacity = '0.6';
    fadedHelp.style.fontSize = '0.95em';
    fadedHelp.style.margin = '0.5em 0 0.2em 0';

    // Top button container
    const topButtonContainer = contentEl.createDiv('ai-chat-buttons');

    // Settings button
    const settingsButton = document.createElement('button');
    settingsButton.setText('⚙️');
    settingsButton.setAttribute('aria-label', 'Toggle model settings');
    settingsButton.style.fontSize = '0.85em';
    settingsButton.style.fontFamily = 'inherit';
    settingsButton.style.width = '1.8em';
    settingsButton.style.height = '1.8em';
    settingsButton.style.marginBottom = '0.2em';
    settingsButton.style.opacity = '0.7';
    topButtonContainer.appendChild(settingsButton);

    // Copy All button
    const copyAllButton = document.createElement('button');
    copyAllButton.setText('📋');
    copyAllButton.setAttribute('aria-label', 'Copy all messages');
    copyAllButton.style.fontSize = '0.85em';
    copyAllButton.style.fontFamily = 'inherit';
    copyAllButton.style.width = '1.8em';
    copyAllButton.style.height = '1.8em';
    copyAllButton.style.marginBottom = '0.2em';
    copyAllButton.style.opacity = '0.7';
    topButtonContainer.appendChild(copyAllButton);

    // Save as Note button
    const saveNoteButton = document.createElement('button');
    saveNoteButton.setText('💾');
    saveNoteButton.setAttribute('aria-label', 'Save chat as note');
    saveNoteButton.style.fontSize = '0.85em';
    saveNoteButton.style.fontFamily = 'inherit';
    saveNoteButton.style.width = '1.8em';
    saveNoteButton.style.height = '1.8em';
    saveNoteButton.style.marginBottom = '0.2em';
    saveNoteButton.style.opacity = '0.7';
    topButtonContainer.appendChild(saveNoteButton);

    // Clear Chat button
    const clearButton = document.createElement('button');
    clearButton.setText('🗑️');
    clearButton.setAttribute('aria-label', 'Clear chat history');
    clearButton.style.fontSize = '0.85em';
    clearButton.style.fontFamily = 'inherit';
    clearButton.style.width = '1.8em';
    clearButton.style.height = '1.8em';
    clearButton.style.marginBottom = '0.2em';
    clearButton.style.opacity = '0.7';
    topButtonContainer.appendChild(clearButton);

    // Reference Current Note button (📝)
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

    // Obsidian Links button (🔗)
    const obsidianLinksButton = document.createElement('button');
    obsidianLinksButton.setText('🔗');
    obsidianLinksButton.setAttribute('aria-label', 'Toggle Obsidian links');
    obsidianLinksButton.addClass('ai-chat-obsidian-links-button');
    obsidianLinksButton.style.fontSize = '0.85em';
    obsidianLinksButton.style.fontFamily = 'inherit';
    obsidianLinksButton.style.width = '1.8em';
    obsidianLinksButton.style.height = '1.8em';
    obsidianLinksButton.style.marginBottom = '0.2em';
    obsidianLinksButton.style.opacity = '0.7';
    topButtonContainer.appendChild(obsidianLinksButton);

    // Context Notes button (📚)
    const contextNotesButton = document.createElement('button');
    contextNotesButton.setText('📚');
    contextNotesButton.setAttribute('aria-label', 'Toggle context notes');
    contextNotesButton.addClass('ai-chat-context-notes-button');
    contextNotesButton.style.fontSize = '0.85em';
    contextNotesButton.style.fontFamily = 'inherit';
    contextNotesButton.style.width = '1.8em';
    contextNotesButton.style.height = '1.8em';
    contextNotesButton.style.marginBottom = '0.2em';
    contextNotesButton.style.opacity = '0.7';
    topButtonContainer.appendChild(contextNotesButton);

    // Reference Note Indicator (shows name of referenced note)
    const referenceNoteIndicator = document.createElement('div');
    referenceNoteIndicator.className = 'ai-reference-note-indicator';
    referenceNoteIndicator.style.textAlign = 'center';
    referenceNoteIndicator.style.opacity = '0.5';
    referenceNoteIndicator.style.fontSize = '0.85em';
    referenceNoteIndicator.style.margin = '0.1em 0 0.2em 0';
    referenceNoteIndicator.style.display = 'none'; // Hidden by default
    referenceNoteIndicator.style.whiteSpace = 'normal'; // Allow wrapping
    referenceNoteIndicator.style.wordBreak = 'break-word'; // Break long words
    referenceNoteIndicator.style.overflowWrap = 'break-word'; // Modern property for word breaking
    referenceNoteIndicator.style.maxWidth = '100%'; // Ensure it doesn't exceed container width

    // Obsidian Links Indicator (shows if Obsidian Links are enabled)
    const obsidianLinksIndicator = document.createElement('div');
    obsidianLinksIndicator.className = 'ai-obsidian-links-indicator';
    obsidianLinksIndicator.style.textAlign = 'center';
    obsidianLinksIndicator.style.opacity = '0.5';
    obsidianLinksIndicator.style.fontSize = '0.85em';
    obsidianLinksIndicator.style.margin = '0.1em 0 0.2em 0';
    obsidianLinksIndicator.style.display = 'none'; // Hidden by default
    obsidianLinksIndicator.style.whiteSpace = 'normal'; // Allow wrapping
    obsidianLinksIndicator.style.wordBreak = 'break-word'; // Break long words
    obsidianLinksIndicator.style.overflowWrap = 'break-word'; // Modern property for word breaking
    obsidianLinksIndicator.style.maxWidth = '100%'; // Ensure it doesn't exceed container width

    // Context Notes Indicator (shows context notes if enabled)
    const contextNotesIndicator = document.createElement('div');
    contextNotesIndicator.className = 'ai-context-notes-indicator';
    contextNotesIndicator.style.textAlign = 'center';
    contextNotesIndicator.style.opacity = '0.5';
    contextNotesIndicator.style.fontSize = '0.85em';
    contextNotesIndicator.style.margin = '0.1em 0 0.2em 0';
    contextNotesIndicator.style.display = 'none'; // Hidden by default
    contextNotesIndicator.style.whiteSpace = 'normal'; // Allow wrapping
    contextNotesIndicator.style.wordBreak = 'break-word'; // Break long words
    contextNotesIndicator.style.overflowWrap = 'break-word'; // Modern property for word breaking
    contextNotesIndicator.style.maxWidth = '100%'; // Ensure it doesn't exceed container width

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
    // Remove any pointer-events:none or accidental disables
    stopButton.disabled = false;
    stopButton.style.pointerEvents = '';
    stopButton.tabIndex = 0;
    // Remove any accidental event listeners that might stop propagation
    stopButton.onclick = null;
    // Ensure the button is not covered by other elements
    stopButton.style.zIndex = '10';
    // Optionally, add a title for accessibility
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

    // Add a class for styling agent mode button state
    agentModeButton.classList.add('ai-agent-mode-btn');

    // Add a helper function to the button element to easily set active state
    function setAgentModeActive(isActive: boolean) {
        if (isActive) {
            agentModeButton.classList.add('active');
        } else {
            agentModeButton.classList.remove('active');
        }
    }
    // Attach the helper function to the button element
    (agentModeButton as any).setActive = setAgentModeActive;

    // Append the agent mode button to the input container
    inputContainer.appendChild(agentModeButton);

    // Set input container position to relative for absolute positioning of help/agent buttons
    inputContainer.style.position = 'relative';

    // Return all created UI elements
    return {
        contentEl,
        fadedHelp,
        topButtonContainer,
        settingsButton,
        copyAllButton,
        saveNoteButton,
        clearButton,
        messagesContainer,
        toolContinuationContainer,
        inputContainer,
        textarea,
        sendButton,
        stopButton,
        helpButton,
        agentModeButton,
        referenceNoteButton,
        obsidianLinksButton,
        contextNotesButton,
        referenceNoteIndicator,
        obsidianLinksIndicator,
        contextNotesIndicator,
        modelNameDisplay,
    };
}
