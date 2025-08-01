/**
 * @file ChatUIManager.ts
 * 
 * Chat UI Manager service for managing chat interface components.
 * Extracted from ChatView to follow single responsibility principle.
 */

import { App } from 'obsidian';
import { IChatUIManager, IEventBus } from '../interfaces';
import { ChatMessage } from '../../components/chat/ChatHistoryManager';
import { createChatUI, ChatUIElements } from '../../components/chat/ui';
import MyPlugin from '../../main';

export interface UIState {
    isStreaming: boolean;
    isTyping: boolean;
    currentModel: string;
    referenceNoteEnabled: boolean;
    referenceNoteFile?: string;
    agentModeEnabled: boolean;
    obsidianLinksEnabled: boolean;
    contextNotesEnabled: boolean;
    contextNotesList: string[];
}

/**
 * Manages the chat user interface components and state
 */
export class ChatUIManager implements IChatUIManager {
    private uiElements: ChatUIElements | null = null;
    private uiState: UIState = {
        isStreaming: false,
        isTyping: false,
        currentModel: 'Unknown Model',
        referenceNoteEnabled: false,
        agentModeEnabled: false,
        obsidianLinksEnabled: false,
        contextNotesEnabled: false,
        contextNotesList: []
    };

    constructor(
        private app: App,
        private eventBus: IEventBus,
        private plugin: MyPlugin
    ) {
        this.setupEventListeners();
    }

    /**
     * Creates the main chat interface
     */
    createChatInterface(): HTMLElement {
        const container = document.createElement('div');
        container.addClass('ai-chat-view');

        this.uiElements = createChatUI(this.app, container);
        this.setupUIEventHandlers();
        this.updateAllDisplays();

        this.eventBus.publish('chat.ui.created', {
            timestamp: Date.now()
        });

        return container;
    }

    /**
     * Updates message display in the chat
     */
    updateMessageDisplay(message: ChatMessage): void {
        if (!this.uiElements) {
            console.warn('[ChatUIManager] UI elements not initialized');
            return;
        }

        // This will be implemented to work with the message rendering system
        this.eventBus.publish('chat.ui.message_updated', {
            messageId: message.timestamp,
            sender: message.sender,
            content: message.content,
            timestamp: Date.now()
        });
    }

    /**
     * Scrolls chat to bottom
     */
    scrollToBottom(): void {
        if (!this.uiElements) return;

        const messagesContainer = this.uiElements.messagesContainer;
        if (messagesContainer) {
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
            
            this.eventBus.publish('chat.ui.scrolled', {
                scrollTop: messagesContainer.scrollTop,
                scrollHeight: messagesContainer.scrollHeight,
                timestamp: Date.now()
            });
        }
    }

    /**
     * Shows typing indicator
     */
    showTypingIndicator(): void {
        if (!this.uiElements) return;

        this.uiState.isTyping = true;
        this.updateTypingIndicator();

        this.eventBus.publish('chat.ui.typing_started', {
            timestamp: Date.now()
        });
    }

    /**
     * Hides typing indicator
     */
    hideTypingIndicator(): void {
        if (!this.uiElements) return;

        this.uiState.isTyping = false;
        this.updateTypingIndicator();

        this.eventBus.publish('chat.ui.typing_stopped', {
            timestamp: Date.now()
        });
    }

    /**
     * Updates model display
     */
    updateModelDisplay(modelName: string): void {
        this.uiState.currentModel = modelName;
        
        if (this.uiElements?.modelNameDisplay) {
            this.uiElements.modelNameDisplay.textContent = `Model: ${modelName}`;
        }

        this.eventBus.publish('chat.ui.model_updated', {
            modelName,
            timestamp: Date.now()
        });
    }

    /**
     * Updates reference note indicator
     */
    updateReferenceNoteIndicator(isEnabled: boolean, fileName?: string): void {
        this.uiState.referenceNoteEnabled = isEnabled;
        this.uiState.referenceNoteFile = fileName;

        if (!this.uiElements) return;

        const indicator = this.uiElements.referenceNoteIndicator;
        const button = this.uiElements.referenceNoteButton;

        if (isEnabled && fileName) {
            indicator.setText(`📝 Referencing: ${fileName}`);
            indicator.style.display = 'block';
            button?.classList.add('active');
        } else {
            indicator.style.display = 'none';
            button?.classList.remove('active');
        }

        this.eventBus.publish('chat.ui.reference_note_updated', {
            isEnabled,
            fileName,
            timestamp: Date.now()
        });
    }

    /**
     * Updates agent mode display
     */
    updateAgentModeDisplay(isEnabled: boolean): void {
        this.uiState.agentModeEnabled = isEnabled;

        if (!this.uiElements) return;

        const button = this.uiElements.agentModeButton;
        if (button) {
            if (isEnabled) {
                button.classList.add('active');
                button.setAttribute('title', 'Agent Mode: ON - AI can use tools');
            } else {
                button.classList.remove('active');
                button.setAttribute('title', 'Agent Mode: OFF - Regular chat');
            }
        }

        this.eventBus.publish('chat.ui.agent_mode_updated', {
            isEnabled,
            timestamp: Date.now()
        });
    }

    /**
     * Updates Obsidian Links indicator
     */
    updateObsidianLinksIndicator(isEnabled: boolean): void {
        this.uiState.obsidianLinksEnabled = isEnabled;

        if (!this.uiElements) return;

        const indicator = this.uiElements.obsidianLinksIndicator;

        if (isEnabled) {
            indicator.setText('🔗 Obsidian Links: ON');
            indicator.style.display = 'block';
        } else {
            indicator.style.display = 'none';
        }

        this.eventBus.publish('chat.ui.obsidian_links_updated', {
            isEnabled,
            timestamp: Date.now()
        });
    }

    /**
     * Updates context notes indicator
     */
    updateContextNotesIndicator(isEnabled: boolean, contextNotes?: string): void {
        this.uiState.contextNotesEnabled = isEnabled;
        
        // Parse context notes to extract note names
        const notesList: string[] = [];
        if (contextNotes) {
            const linkRegex = /\[\[(.*?)\]\]/g;
            let match;
            while ((match = linkRegex.exec(contextNotes)) !== null) {
                if (match[1]) {
                    // Extract just the note name (before any # for sections)
                    const [noteName] = match[1].split('#');
                    if (noteName && !notesList.includes(noteName.trim())) {
                        notesList.push(noteName.trim());
                    }
                }
            }
        }
        this.uiState.contextNotesList = notesList;

        if (!this.uiElements) return;

        const indicator = this.uiElements.contextNotesIndicator;

        if (isEnabled && notesList.length > 0) {
            const notesText = notesList.length === 1 
                ? notesList[0] 
                : `${notesList.length} notes`;
            indicator.setText(`📚 Context: ${notesText}`);
            indicator.style.display = 'block';
            indicator.setAttribute('title', `Context Notes: ${notesList.join(', ')}`);
        } else {
            indicator.style.display = 'none';
        }

        this.eventBus.publish('chat.ui.context_notes_updated', {
            isEnabled,
            notesList,
            timestamp: Date.now()
        });
    }

    /**
     * Updates streaming state display
     */
    updateStreamingState(isStreaming: boolean): void {
        this.uiState.isStreaming = isStreaming;

        if (!this.uiElements) return;

        const sendButton = this.uiElements.sendButton;
        const stopButton = this.uiElements.stopButton;
        const textarea = this.uiElements.textarea;

        if (isStreaming) {
            sendButton?.classList.add('hidden');
            stopButton?.classList.remove('hidden');
            if (textarea) textarea.disabled = true;
        } else {
            sendButton?.classList.remove('hidden');
            stopButton?.classList.add('hidden');
            if (textarea) {
                textarea.disabled = false;
                textarea.focus();
            }
        }

        this.eventBus.publish('chat.ui.streaming_state_updated', {
            isStreaming,
            timestamp: Date.now()
        });
    }

    /**
     * Gets current UI state
     */
    getUIState(): UIState {
        return { ...this.uiState };
    }

    /**
     * Gets UI elements for external access
     */
    getUIElements(): ChatUIElements | null {
        return this.uiElements;
    }

    /**
     * Enables or disables UI elements
     */
    setUIEnabled(enabled: boolean): void {
        if (!this.uiElements) return;

        const elements = [
            this.uiElements.textarea,
            this.uiElements.sendButton,
            this.uiElements.clearButton,
            this.uiElements.copyAllButton,
            this.uiElements.saveNoteButton,
            this.uiElements.referenceNoteButton,
            this.uiElements.agentModeButton,
            this.uiElements.settingsButton
        ];

        elements.forEach(element => {
            if (element) {
                if (enabled) {
                    element.removeAttribute('disabled');
                    element.classList.remove('disabled');
                } else {
                    element.setAttribute('disabled', 'true');
                    element.classList.add('disabled');
                }
            }
        });

        this.eventBus.publish('chat.ui.enabled_state_changed', {
            enabled,
            timestamp: Date.now()
        });
    }

    /**
     * Shows or hides UI elements
     */
    setUIVisibility(visible: boolean): void {
        if (!this.uiElements) return;

        const container = this.uiElements.messagesContainer.parentElement;
        if (container) {
            container.style.display = visible ? 'block' : 'none';
        }

        this.eventBus.publish('chat.ui.visibility_changed', {
            visible,
            timestamp: Date.now()
        });
    }

    /**
     * Updates button states based on current context
     */
    updateButtonStates(): void {
        if (!this.uiElements) return;

        // Update send button based on textarea content
        const textarea = this.uiElements.textarea;
        const sendButton = this.uiElements.sendButton;
        
        if (textarea && sendButton) {
            const hasContent = textarea.value.trim().length > 0;
            sendButton.disabled = !hasContent || this.uiState.isStreaming;
        }

        // Update other buttons based on state
        this.updateAgentModeDisplay(this.uiState.agentModeEnabled);
        this.updateReferenceNoteIndicator(this.uiState.referenceNoteEnabled, this.uiState.referenceNoteFile);
        
        // Update indicators based on current plugin settings
        if (this.plugin?.settings) {
            this.updateObsidianLinksIndicator(this.plugin.settings.enableObsidianLinks);
            this.updateContextNotesIndicator(this.plugin.settings.enableContextNotes, this.plugin.settings.contextNotes);
            
            // Update button active states
            this.updateObsidianLinksButtonState(this.plugin.settings.enableObsidianLinks);
            this.updateContextNotesButtonState(this.plugin.settings.enableContextNotes);
        }
    }

    /**
     * Sets up event listeners for external events
     */
    private setupEventListeners(): void {
        // Listen for model changes
        this.eventBus.subscribe('ai.model.selected', (data: any) => {
            this.updateModelDisplay(data.modelId);
        });

        // Listen for agent mode changes
        this.eventBus.subscribe('agent.mode.changed', (data: any) => {
            this.updateAgentModeDisplay(data.enabled);
        });

        // Listen for streaming state changes
        this.eventBus.subscribe('stream.started', () => {
            this.updateStreamingState(true);
        });

        this.eventBus.subscribe('stream.completed', () => {
            this.updateStreamingState(false);
        });

        this.eventBus.subscribe('stream.aborted', () => {
            this.updateStreamingState(false);
        });

        // Listen for settings changes
        this.eventBus.subscribe('settings.changed', () => {
            if (this.plugin?.settings) {
                this.updateObsidianLinksIndicator(this.plugin.settings.enableObsidianLinks);
                this.updateContextNotesIndicator(this.plugin.settings.enableContextNotes, this.plugin.settings.contextNotes);
            }
        });
    }

    /**
     * Sets up UI event handlers
     */
    private setupUIEventHandlers(): void {
        if (!this.uiElements) return;

        // Textarea input handler
        this.uiElements.textarea?.addEventListener('input', () => {
            this.updateButtonStates();
        });

        // Button click handlers will be set up by the event coordinator
        // This manager focuses on UI state management
    }

    /**
     * Updates typing indicator display
     */
    private updateTypingIndicator(): void {
        if (!this.uiElements) return;

        // Create or update typing indicator
        let indicator = this.uiElements.messagesContainer.querySelector('.typing-indicator') as HTMLElement;
        
        if (this.uiState.isTyping) {
            if (!indicator) {
                indicator = document.createElement('div');
                indicator.className = 'typing-indicator';
                indicator.innerHTML = '<span>AI is typing</span><div class="typing-dots"><span></span><span></span><span></span></div>';
                this.uiElements.messagesContainer.appendChild(indicator);
            }
            this.scrollToBottom();
        } else {
            if (indicator) {
                indicator.remove();
            }
        }
    }

    /**
     * Updates all display elements
     */
    private updateAllDisplays(): void {
        this.updateModelDisplay(this.uiState.currentModel);
        this.updateReferenceNoteIndicator(this.uiState.referenceNoteEnabled, this.uiState.referenceNoteFile);
        this.updateAgentModeDisplay(this.uiState.agentModeEnabled);
        this.updateStreamingState(this.uiState.isStreaming);
        this.updateButtonStates();
        
        // Update new indicators based on plugin settings
        if (this.plugin?.settings) {
            this.updateObsidianLinksIndicator(this.plugin.settings.enableObsidianLinks);
            this.updateContextNotesIndicator(this.plugin.settings.enableContextNotes, this.plugin.settings.contextNotes);
        }
    }

    /**
     * Updates Obsidian Links button active state
     */
    private updateObsidianLinksButtonState(isEnabled: boolean): void {
        if (!this.uiElements?.obsidianLinksButton) return;

        if (isEnabled) {
            this.uiElements.obsidianLinksButton.classList.add('active');
        } else {
            this.uiElements.obsidianLinksButton.classList.remove('active');
        }
    }

    /**
     * Updates Context Notes button active state
     */
    private updateContextNotesButtonState(isEnabled: boolean): void {
        if (!this.uiElements?.contextNotesButton) return;

        if (isEnabled) {
            this.uiElements.contextNotesButton.classList.add('active');
        } else {
            this.uiElements.contextNotesButton.classList.remove('active');
        }
    }

    /**
     * Cleanup method for disposing the service
     */
    dispose(): void {
        this.uiElements = null;
        this.uiState = {
            isStreaming: false,
            isTyping: false,
            currentModel: 'Unknown Model',
            referenceNoteEnabled: false,
            agentModeEnabled: false,
            obsidianLinksEnabled: false,
            contextNotesEnabled: false,
            contextNotesList: []
        };
    }
}