/**
 * @file ChatEventCoordinator.ts
 * 
 * Chat Event Coordinator service for handling UI events and user interactions.
 * Extracted from ChatView to follow single responsibility principle.
 */

import { App } from 'obsidian';
import { IChatEventCoordinator, IEventBus } from '../interfaces';
import { ChatUIManager } from './ChatUIManager';
import { MessageManager } from './MessageManager';
import { StreamCoordinator } from './StreamCoordinator';
import { ChatUIElements } from '../../components/chat/ui';
import { handleCopyAll, handleSaveNote, handleClearChat, handleSettings, handleHelp } from '../../components/chat/eventHandlers';
import { setupInputHandler } from '../../components/chat/inputHandler';
import type MyPlugin from '../../main';

export interface EventHandlerConfig {
    enableKeyboardShortcuts?: boolean;
    enableSlashCommands?: boolean;
    enableAutoSave?: boolean;
    debounceMs?: number;
}

/**
 * Coordinates all chat-related events and user interactions
 */
export class ChatEventCoordinator implements IChatEventCoordinator {
    private eventListeners: Array<{
        element: HTMLElement;
        event: string;
        handler: EventListener;
    }> = [];
    private isSetup = false;
    private config: EventHandlerConfig;

    constructor(
        private app: App,
        private plugin: MyPlugin,
        private eventBus: IEventBus,
        private uiManager: ChatUIManager,
        private messageManager: MessageManager,
        private streamCoordinator: StreamCoordinator,
        config: EventHandlerConfig = {}
    ) {
        this.config = {
            enableKeyboardShortcuts: true,
            enableSlashCommands: true,
            enableAutoSave: true,
            debounceMs: 300,
            ...config
        };
        this.setupGlobalEventListeners();
    }

    /**
     * Sets up all event handlers for the chat interface
     */
    setupEventHandlers(): void {
        if (this.isSetup) {
            console.warn('[ChatEventCoordinator] Event handlers already set up');
            return;
        }

        const uiElements = this.uiManager.getUIElements();
        if (!uiElements) {
            throw new Error('UI elements not available for event setup');
        }

        this.setupButtonEventHandlers(uiElements);
        this.setupInputEventHandlers(uiElements);
        this.setupKeyboardEventHandlers(uiElements);
        this.setupSlashCommands(uiElements);
        this.setupContextMenus(uiElements);

        this.isSetup = true;

        this.eventBus.publish('chat.events.setup_completed', {
            handlerCount: this.eventListeners.length,
            timestamp: Date.now()
        });
    }

    /**
     * Handles sending a message
     */
    async handleSendMessage(content: string): Promise<void> {
        if (!content.trim()) {
            return;
        }

        try {
            this.eventBus.publish('chat.message.send_started', {
                content: content.substring(0, 100) + (content.length > 100 ? '...' : ''),
                length: content.length,
                timestamp: Date.now()
            });

            // Update UI state
            this.uiManager.updateStreamingState(true);
            this.uiManager.showTypingIndicator();

            // Add user message
            await this.messageManager.addMessage({
                timestamp: new Date().toISOString(),
                sender: 'user',
                role: 'user',
                content: content
            });

            // Start streaming response
            const messages = await this.messageManager.getMessageHistory();
            const responseContent = await this.streamCoordinator.startStream(messages);

            // Add assistant response
            if (responseContent.trim()) {
                await this.messageManager.addMessage({
                    timestamp: new Date().toISOString(),
                    sender: 'assistant',
                    role: 'assistant',
                    content: responseContent
                });
            }

            this.eventBus.publish('chat.message.send_completed', {
                responseLength: responseContent.length,
                timestamp: Date.now()
            });

        } catch (error: any) {
            this.eventBus.publish('chat.message.send_failed', {
                error: error.message,
                timestamp: Date.now()
            });

            // Add error message
            await this.messageManager.addMessage({
                timestamp: new Date().toISOString(),
                sender: 'assistant',
                role: 'assistant',
                content: `Error: ${error.message}`
            });

        } finally {
            this.uiManager.updateStreamingState(false);
            this.uiManager.hideTypingIndicator();
            this.uiManager.scrollToBottom();
        }
    }

    /**
     * Handles stopping the current stream
     */
    handleStopStream(): void {
        this.streamCoordinator.stopStream();
        this.uiManager.updateStreamingState(false);
        this.uiManager.hideTypingIndicator();

        this.eventBus.publish('chat.stream.stopped_by_user', {
            timestamp: Date.now()
        });
    }

    /**
     * Handles clearing the chat
     */
    handleClearChat(): void {
        this.messageManager.clearHistory();
        this.uiManager.scrollToBottom();

        this.eventBus.publish('chat.cleared', {
            timestamp: Date.now()
        });
    }

    /**
     * Handles regenerating a message
     */
    async handleRegenerateMessage(messageId: string): Promise<void> {
        try {
            await this.messageManager.regenerateMessage(messageId);
            
            this.eventBus.publish('chat.message.regenerated', {
                messageId,
                timestamp: Date.now()
            });
        } catch (error: any) {
            this.eventBus.publish('chat.message.regenerate_failed', {
                messageId,
                error: error.message,
                timestamp: Date.now()
            });
        }
    }

    /**
     * Cleanup event handlers
     */
    cleanup(): void {
        // Remove all event listeners
        for (const { element, event, handler } of this.eventListeners) {
            element.removeEventListener(event, handler);
        }
        this.eventListeners = [];
        this.isSetup = false;

        this.eventBus.publish('chat.events.cleanup_completed', {
            timestamp: Date.now()
        });
    }

    /**
     * Sets up button event handlers
     */
    private setupButtonEventHandlers(uiElements: ChatUIElements): void {
        // Send button
        if (uiElements.sendButton) {
            this.addEventListenerWithCleanup(
                uiElements.sendButton,
                'click',
                async () => {
                    const content = uiElements.textarea?.value.trim() || '';
                    if (content) {
                        uiElements.textarea!.value = '';
                        await this.handleSendMessage(content);
                    }
                }
            );
        }

        // Stop button
        if (uiElements.stopButton) {
            this.addEventListenerWithCleanup(
                uiElements.stopButton,
                'click',
                () => this.handleStopStream()
            );
        }

        // Clear button
        if (uiElements.clearButton) {
            this.addEventListenerWithCleanup(
                uiElements.clearButton,
                'click',
                () => this.handleClearChat()
            );
        }

        // Copy all button
        if (uiElements.copyAllButton) {
            this.addEventListenerWithCleanup(
                uiElements.copyAllButton,
                'click',
                handleCopyAll(uiElements.messagesContainer, this.plugin)
            );
        }

        // Save note button
        if (uiElements.saveNoteButton) {
            this.addEventListenerWithCleanup(
                uiElements.saveNoteButton,
                'click',
                handleSaveNote(uiElements.messagesContainer, this.plugin, this.app, null)
            );
        }

        // Settings button
        if (uiElements.settingsButton) {
            this.addEventListenerWithCleanup(
                uiElements.settingsButton,
                'click',
                handleSettings(this.app, this.plugin)
            );
        }

        // Help button
        if (uiElements.helpButton) {
            this.addEventListenerWithCleanup(
                uiElements.helpButton,
                'click',
                handleHelp(this.app)
            );
        }

        // Reference note button
        if (uiElements.referenceNoteButton) {
            this.addEventListenerWithCleanup(
                uiElements.referenceNoteButton,
                'click',
                () => {
                    const currentState = this.plugin.settings.referenceCurrentNote;
                    this.plugin.settings.referenceCurrentNote = !currentState;
                    this.plugin.saveSettings();
                    
                    const currentFile = this.app.workspace.getActiveFile();
                    this.uiManager.updateReferenceNoteIndicator(
                        !currentState,
                        currentFile?.basename
                    );
                }
            );
        }

        // Agent mode button
        if (uiElements.agentModeButton) {
            this.addEventListenerWithCleanup(
                uiElements.agentModeButton,
                'click',
                async () => {
                    const agentManager = (this.plugin as any).agentModeManager;
                    if (agentManager) {
                        const currentState = agentManager.isAgentModeEnabled();
                        await agentManager.setAgentModeEnabled(!currentState);
                        this.uiManager.updateAgentModeDisplay(!currentState);
                    }
                }
            );
        }

        // Obsidian Links button
        if (uiElements.obsidianLinksButton) {
            this.addEventListenerWithCleanup(
                uiElements.obsidianLinksButton,
                'click',
                () => {
                    const currentState = this.plugin.settings.enableObsidianLinks;
                    this.plugin.settings.enableObsidianLinks = !currentState;
                    this.plugin.saveSettings();
                    
                    this.uiManager.updateObsidianLinksIndicator(!currentState);
                    
                    // Update button active state
                    if (!currentState) {
                        uiElements.obsidianLinksButton.classList.add('active');
                    } else {
                        uiElements.obsidianLinksButton.classList.remove('active');
                    }
                }
            );
        }

        // Context Notes button
        if (uiElements.contextNotesButton) {
            this.addEventListenerWithCleanup(
                uiElements.contextNotesButton,
                'click',
                () => {
                    const currentState = this.plugin.settings.enableContextNotes;
                    this.plugin.settings.enableContextNotes = !currentState;
                    this.plugin.saveSettings();
                    
                    this.uiManager.updateContextNotesIndicator(
                        !currentState,
                        this.plugin.settings.contextNotes
                    );
                    
                    // Update button active state
                    if (!currentState) {
                        uiElements.contextNotesButton.classList.add('active');
                    } else {
                        uiElements.contextNotesButton.classList.remove('active');
                    }
                }
            );
        }
    }

    /**
     * Sets up input event handlers
     */
    private setupInputEventHandlers(uiElements: ChatUIElements): void {
        if (!uiElements.textarea) return;

        // Set up the input handler from the existing system
        setupInputHandler(
            uiElements.textarea,
            uiElements.messagesContainer,
            async () => uiElements.sendButton?.click(),
            async (cmd: string) => this.handleSlashCommand(cmd),
            this.app,
            this.plugin,
            uiElements.sendButton!,
            uiElements.stopButton!
        );

        // Input change handler for button state updates
        this.addEventListenerWithCleanup(
            uiElements.textarea,
            'input',
            () => this.uiManager.updateButtonStates()
        );

        // Focus handler
        this.addEventListenerWithCleanup(
            uiElements.textarea,
            'focus',
            () => {
                this.eventBus.publish('chat.input.focused', {
                    timestamp: Date.now()
                });
            }
        );

        // Blur handler
        this.addEventListenerWithCleanup(
            uiElements.textarea,
            'blur',
            () => {
                this.eventBus.publish('chat.input.blurred', {
                    timestamp: Date.now()
                });
            }
        );
    }

    /**
     * Sets up keyboard event handlers
     */
    private setupKeyboardEventHandlers(uiElements: ChatUIElements): void {
        if (!this.config.enableKeyboardShortcuts) return;

        // Global keyboard shortcuts
        this.addEventListenerWithCleanup(
            document,
            'keydown',
            (event: KeyboardEvent) => {
                // Ctrl/Cmd + Enter to send message
                if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                    event.preventDefault();
                    uiElements.sendButton?.click();
                }

                // Escape to stop streaming
                if (event.key === 'Escape' && this.streamCoordinator.isStreaming()) {
                    event.preventDefault();
                    this.handleStopStream();
                }

                // Ctrl/Cmd + K to clear chat
                if ((event.ctrlKey || event.metaKey) && event.key === 'k') {
                    event.preventDefault();
                    this.handleClearChat();
                }
            }
        );
    }

    /**
     * Sets up slash command handling
     */
    private setupSlashCommands(uiElements: ChatUIElements): void {
        if (!this.config.enableSlashCommands) return;

        // Slash commands are handled by the input handler
        // This method can be extended for additional slash command functionality
    }

    /**
     * Sets up context menus
     */
    private setupContextMenus(uiElements: ChatUIElements): void {
        // Context menu for messages
        this.addEventListenerWithCleanup(
            uiElements.messagesContainer,
            'contextmenu',
            (event: MouseEvent) => {
                const messageElement = (event.target as HTMLElement).closest('.ai-chat-message');
                if (messageElement) {
                    event.preventDefault();
                    this.showMessageContextMenu(event, messageElement as HTMLElement);
                }
            }
        );
    }

    /**
     * Shows context menu for messages
     */
    private showMessageContextMenu(event: MouseEvent, messageElement: HTMLElement): void {
        // Create context menu
        const menu = document.createElement('div');
        menu.className = 'chat-context-menu';
        menu.style.position = 'fixed';
        menu.style.left = `${event.clientX}px`;
        menu.style.top = `${event.clientY}px`;
        menu.style.zIndex = '1000';

        // Add menu items
        const copyItem = document.createElement('div');
        copyItem.textContent = 'Copy Message';
        copyItem.className = 'context-menu-item';
        copyItem.addEventListener('click', () => {
            const content = messageElement.querySelector('.message-content')?.textContent || '';
            navigator.clipboard.writeText(content);
            menu.remove();
        });

        const regenerateItem = document.createElement('div');
        regenerateItem.textContent = 'Regenerate';
        regenerateItem.className = 'context-menu-item';
        regenerateItem.addEventListener('click', () => {
            const messageId = messageElement.dataset.timestamp || '';
            this.handleRegenerateMessage(messageId);
            menu.remove();
        });

        menu.appendChild(copyItem);
        if (messageElement.classList.contains('assistant')) {
            menu.appendChild(regenerateItem);
        }

        document.body.appendChild(menu);

        // Remove menu on click outside
        const removeMenu = (e: MouseEvent) => {
            if (!menu.contains(e.target as Node)) {
                menu.remove();
                document.removeEventListener('click', removeMenu);
            }
        };
        setTimeout(() => document.addEventListener('click', removeMenu), 0);
    }

    /**
     * Handles slash commands
     */
    private async handleSlashCommand(command: string): Promise<void> {
        const uiElements = this.uiManager.getUIElements();
        if (!uiElements) return;

        switch (command) {
            case '/clear':
                this.handleClearChat();
                break;
            case '/copy':
                uiElements.copyAllButton?.click();
                break;
            case '/save':
                uiElements.saveNoteButton?.click();
                break;
            case '/settings':
                uiElements.settingsButton?.click();
                break;
            case '/help':
                uiElements.helpButton?.click();
                break;
            case '/ref':
                uiElements.referenceNoteButton?.click();
                break;
            case '/agent':
                uiElements.agentModeButton?.click();
                break;
            case '/links':
                uiElements.obsidianLinksButton?.click();
                break;
            case '/context':
                uiElements.contextNotesButton?.click();
                break;
            default:
                this.eventBus.publish('chat.slash_command.unknown', {
                    command,
                    timestamp: Date.now()
                });
        }
    }

    /**
     * Sets up global event listeners
     */
    private setupGlobalEventListeners(): void {
        // Listen for workspace changes
        this.eventBus.subscribe('workspace.active_file_changed', () => {
            const currentFile = this.app.workspace.getActiveFile();
            this.uiManager.updateReferenceNoteIndicator(
                this.plugin.settings.referenceCurrentNote,
                currentFile?.basename
            );
        });

        // Listen for settings changes
        this.eventBus.subscribe('settings.changed', () => {
            this.uiManager.updateReferenceNoteIndicator(
                this.plugin.settings.referenceCurrentNote,
                this.app.workspace.getActiveFile()?.basename
            );
        });
    }

    /**
     * Adds event listener with automatic cleanup tracking
     */
    private addEventListenerWithCleanup(
        element: HTMLElement | Document,
        event: string,
        handler: EventListener
    ): void {
        element.addEventListener(event, handler);
        this.eventListeners.push({
            element: element as HTMLElement,
            event,
            handler
        });
    }
}