/**
 * @file RefactoredChatView.ts
 * 
 * Refactored ChatView that uses decomposed services instead of handling everything directly.
 * This demonstrates the new architecture with focused, single-responsibility services.
 */

import { ItemView, WorkspaceLeaf } from 'obsidian';
import { ChatUIManager } from './ChatUIManager';
import { ChatEventCoordinator } from './ChatEventCoordinator';
import { MessageManager } from './MessageManager';
import { StreamCoordinator } from './StreamCoordinator';
import { AIService } from '../core/AIService';
import { IEventBus } from '../interfaces';
import { ChatMessage } from '../../components/chat/ChatHistoryManager';
import { loadChatYamlAndApplySettings } from '../../components/chat/chatPersistence';
import { renderChatHistory } from '../../components/chat/chatHistoryUtils';
import type MyPlugin from '../../main';

export const VIEW_TYPE_REFACTORED_CHAT = 'refactored-chat-view';

/**
 * Refactored ChatView using the new service-oriented architecture
 */
export class RefactoredChatView extends ItemView {
    private uiManager: ChatUIManager;
    private eventCoordinator: ChatEventCoordinator;
    private messageManager: MessageManager;
    private streamCoordinator: StreamCoordinator;
    private isInitialized = false;

    constructor(
        leaf: WorkspaceLeaf,
        private plugin: MyPlugin,
        private eventBus: IEventBus,
        private aiService: AIService
    ) {
        super(leaf);
        
        // Initialize services
        this.uiManager = new ChatUIManager(this.app, this.eventBus);
        this.streamCoordinator = new StreamCoordinator(this.plugin, this.eventBus, this.aiService);
        this.messageManager = new MessageManager(
            this.app,
            this.plugin,
            this.eventBus,
            (messageElement: HTMLElement) => this.regenerateResponse(messageElement)
        );
        this.eventCoordinator = new ChatEventCoordinator(
            this.app,
            this.plugin,
            this.eventBus,
            this.uiManager,
            this.messageManager,
            this.streamCoordinator
        );

        this.setupServiceIntegration();
    }

    getViewType(): string {
        return VIEW_TYPE_REFACTORED_CHAT;
    }

    getDisplayText(): string {
        return 'AI Chat (Refactored)';
    }

    getIcon(): string {
        return 'message-square';
    }

    async onOpen() {
        const { contentEl } = this;
        
        try {
            // Prepare the view
            contentEl.empty();
            contentEl.addClass('ai-chat-view');

            // Create the UI
            const chatInterface = this.uiManager.createChatInterface();
            contentEl.appendChild(chatInterface);

            // Set up the messages container for the message manager
            const uiElements = this.uiManager.getUIElements();
            if (uiElements) {
                this.messageManager.setMessagesContainer(uiElements.messagesContainer);
            }

            // Set up event handlers
            this.eventCoordinator.setupEventHandlers();

            // Load and render chat history
            await this.loadAndRenderHistory();

            // Update UI state
            this.updateUIState();

            // Register workspace events
            this.registerWorkspaceEvents();

            this.isInitialized = true;

            this.eventBus.publish('chat.view.opened', {
                viewType: this.getViewType(),
                timestamp: Date.now()
            });

        } catch (error: any) {
            console.error('Failed to open refactored chat view:', error);
            this.eventBus.publish('chat.view.open_failed', {
                error: error.message,
                timestamp: Date.now()
            });
        }
    }

    async onClose() {
        if (!this.isInitialized) return;

        try {
            // Cleanup services
            this.eventCoordinator.cleanup();
            this.streamCoordinator.dispose();
            this.messageManager.dispose();
            this.uiManager.dispose();

            this.eventBus.publish('chat.view.closed', {
                viewType: this.getViewType(),
                timestamp: Date.now()
            });

        } catch (error: any) {
            console.error('Error closing refactored chat view:', error);
        }
    }

    /**
     * Clears all messages in the chat
     */
    public clearMessages(): void {
        this.messageManager.clearHistory();
    }

    /**
     * Scrolls messages to bottom
     */
    public scrollMessagesToBottom(): void {
        this.uiManager.scrollToBottom();
    }

    /**
     * Stops any active streaming
     */
    public stopActiveStream(): void {
        this.streamCoordinator.stopStream();
    }

    /**
     * Checks if there's an active stream
     */
    public hasActiveStream(): boolean {
        return this.streamCoordinator.isStreaming();
    }

    /**
     * Adds a message to the chat
     */
    public async addMessage(
        role: 'user' | 'assistant',
        content: string,
        isError: boolean = false,
        enhancedData?: any
    ): Promise<void> {
        const message: ChatMessage = {
            timestamp: new Date().toISOString(),
            sender: role,
            content,
            ...(enhancedData || {})
        };

        await this.messageManager.addMessage(message, {
            animate: true,
            scrollToView: true,
            highlight: isError
        });
    }

    /**
     * Gets the current UI state
     */
    public getUIState(): any {
        return this.uiManager.getUIState();
    }

    /**
     * Gets streaming statistics
     */
    public getStreamStats(): any {
        return this.streamCoordinator.getStreamStats();
    }

    /**
     * Gets message statistics
     */
    public getMessageStats(): any {
        return this.messageManager.getMessageStats();
    }

    /**
     * Exports chat history
     */
    public async exportHistory(format: 'json' | 'markdown' | 'text' = 'json'): Promise<string> {
        return await this.messageManager.exportHistory(format);
    }

    /**
     * Imports chat history
     */
    public async importHistory(data: string): Promise<void> {
        await this.messageManager.importHistory(data);
    }

    /**
     * Sets up integration between services
     */
    private setupServiceIntegration(): void {
        // Listen for stream events to update UI
        this.eventBus.subscribe('stream.started', () => {
            this.uiManager.updateStreamingState(true);
            this.uiManager.showTypingIndicator();
        });

        this.eventBus.subscribe('stream.completed', () => {
            this.uiManager.updateStreamingState(false);
            this.uiManager.hideTypingIndicator();
        });

        this.eventBus.subscribe('stream.aborted', () => {
            this.uiManager.updateStreamingState(false);
            this.uiManager.hideTypingIndicator();
        });

        this.eventBus.subscribe('stream.error', () => {
            this.uiManager.updateStreamingState(false);
            this.uiManager.hideTypingIndicator();
        });

        // Listen for message events to update UI
        this.eventBus.subscribe('chat.message.added', () => {
            this.uiManager.scrollToBottom();
        });

        // Listen for agent mode changes
        this.eventBus.subscribe('agent.mode.changed', (data: any) => {
            this.uiManager.updateAgentModeDisplay(data.enabled);
        });

        // Listen for model changes
        this.eventBus.subscribe('ai.model.selected', (data: any) => {
            this.uiManager.updateModelDisplay(data.modelId);
        });
    }

    /**
     * Loads and renders chat history
     */
    private async loadAndRenderHistory(): Promise<void> {
        try {
            const history = await this.messageManager.getMessageHistory();
            
            if (history.length > 0) {
                // Load YAML settings if available
                const file = this.app.workspace.getActiveFile();
                if (file) {
                    await loadChatYamlAndApplySettings({
                        app: this.app,
                        plugin: this.plugin,
                        settings: this.plugin.settings,
                        file
                    });
                }

                // Render history using existing utility
                const uiElements = this.uiManager.getUIElements();
                if (uiElements) {
                    await renderChatHistory({
                        messagesContainer: uiElements.messagesContainer,
                        loadedHistory: history,
                        chatHistoryManager: (this.messageManager as any).chatHistoryManager,
                        plugin: this.plugin,
                        regenerateResponse: (el: HTMLElement) => this.regenerateResponse(el),
                        scrollToBottom: true
                    });
                }
            }

        } catch (error: any) {
            console.error('Failed to load chat history:', error);
            this.eventBus.publish('chat.history.load_failed', {
                error: error.message,
                timestamp: Date.now()
            });
        }
    }

    /**
     * Updates UI state based on current plugin state
     */
    private updateUIState(): void {
        // Update model display
        const modelName = this.getCurrentModelName();
        this.uiManager.updateModelDisplay(modelName);

        // Update reference note indicator
        const currentFile = this.app.workspace.getActiveFile();
        this.uiManager.updateReferenceNoteIndicator(
            this.plugin.settings.referenceCurrentNote,
            currentFile?.basename
        );

        // Update agent mode display
        const agentManager = (this.plugin as any).agentModeManager;
        if (agentManager) {
            this.uiManager.updateAgentModeDisplay(agentManager.isAgentModeEnabled());
        }
    }

    /**
     * Gets the current model name for display
     */
    private getCurrentModelName(): string {
        const settings = this.plugin.settings;
        
        if (settings.selectedModel && settings.availableModels) {
            const found = settings.availableModels.find((m: any) => m.id === settings.selectedModel);
            if (found) return found.name;
            return settings.selectedModel;
        } else if (settings.selectedModel) {
            return settings.selectedModel;
        }
        
        return 'Unknown Model';
    }

    /**
     * Registers workspace event listeners
     */
    private registerWorkspaceEvents(): void {
        this.registerEvent(
            this.app.workspace.on('active-leaf-change', () => {
                this.updateUIState();
            })
        );

        // Listen for settings changes
        this.plugin.onSettingsChange(() => {
            this.updateUIState();
        });
    }

    /**
     * Regenerates a response for a message
     */
    private async regenerateResponse(messageElement: HTMLElement): Promise<void> {
        const messageId = messageElement.dataset.timestamp;
        if (messageId) {
            await this.eventCoordinator.handleRegenerateMessage(messageId);
        }
    }
}