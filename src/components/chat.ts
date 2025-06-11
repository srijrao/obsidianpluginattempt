import { ItemView, WorkspaceLeaf, Notice, MarkdownRenderer, App } from 'obsidian';
import MyPlugin from '../main';
import { Message, TaskStatus } from '../types';
import { createProvider, createProviderFromUnifiedModel } from '../../providers';
import { ChatHistoryManager, ChatMessage } from './chat/ChatHistoryManager';
import { createMessageElement } from './chat/Message';
import { createChatUI, ChatUIElements } from './chat/ui';
import { handleCopyAll, handleSaveNote, handleClearChat, handleSettings, handleHelp, handleReferenceNote } from './chat/eventHandlers';
import { saveChatAsNote, loadChatYamlAndApplySettings } from './chat/chatPersistence';
import { renderChatHistory } from './chat/chatHistoryUtils';
import { ChatHelpModal } from './chat/ChatHelpModal';
import { AgentResponseHandler, AgentContext } from './chat/AgentResponseHandler';
import { ToolCommand, ToolResult } from '../types';

export const VIEW_TYPE_CHAT = 'chat-view';

export class ChatView extends ItemView {
    private plugin: MyPlugin;
    private chatHistoryManager: ChatHistoryManager;
    private messagesContainer: HTMLElement;
    private inputContainer: HTMLElement;
    private activeStream: AbortController | null = null;
    private referenceNoteIndicator: HTMLElement; // Add this property
    private agentResponseHandler: AgentResponseHandler | null = null;

    constructor(leaf: WorkspaceLeaf, plugin: MyPlugin) {
        super(leaf);
        this.plugin = plugin;
        this.chatHistoryManager = new ChatHistoryManager(this.app.vault, this.plugin.manifest.id, "chat-history.json");
    }

    getViewType(): string {
        return VIEW_TYPE_CHAT;
    }

    getDisplayText(): string {
        return 'AI Chat';
    }

    getIcon(): string {
        return 'message-square';
    }

    async onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('ai-chat-view');

        // Load persistent chat history before UI setup
        let loadedHistory: ChatMessage[] = [];
        try {
            loadedHistory = await this.chatHistoryManager.getHistory();
        } catch (e) {
            new Notice("Failed to load chat history.");
            loadedHistory = [];
        }        // Modular UI creation
        const ui: ChatUIElements = createChatUI(this.app, contentEl);
        this.messagesContainer = ui.messagesContainer;
        this.inputContainer = ui.inputContainer;
        this.referenceNoteIndicator = ui.referenceNoteIndicator;
        
        // Update reference note indicator
        this.updateReferenceNoteIndicator();
        const textarea = ui.textarea;
        const sendButton = ui.sendButton;
        const stopButton = ui.stopButton;
        // Attach event handlers
        ui.copyAllButton.addEventListener('click', handleCopyAll(this.messagesContainer, this.plugin));
        ui.saveNoteButton.addEventListener('click', handleSaveNote(this.messagesContainer, this.plugin, this.app));        ui.clearButton.addEventListener('click', handleClearChat(this.messagesContainer, this.chatHistoryManager));
        ui.settingsButton.addEventListener('click', handleSettings(this.app, this.plugin));
        ui.helpButton.addEventListener('click', handleHelp(this.app));
        // ui.referenceNoteButton.addEventListener('click', handleReferenceNote(this.app, this.plugin));
        ui.referenceNoteButton.addEventListener('click', () => {
            this.plugin.settings.referenceCurrentNote = !this.plugin.settings.referenceCurrentNote;
            this.plugin.saveSettings();
            this.updateReferenceNoteIndicator();
        });
        // --- AGENT MODE INTEGRATION ---
        // Initialize agent response handler
        this.agentResponseHandler = new AgentResponseHandler({
            app: this.app,
            plugin: this.plugin,
            messagesContainer: this.messagesContainer,
            onToolResult: (toolResult: ToolResult, command: ToolCommand) => {
                // Handle tool results (could display inline notifications, etc.)
                if (toolResult.success) {
                    console.log(`Tool ${command.action} completed successfully`, toolResult.data);
                } else {
                    console.error(`Tool ${command.action} failed:`, toolResult.error);
                }
            }
        });

        // Agent mode button handler
        ui.agentModeButton.addEventListener('click', async () => {
            const isCurrentlyEnabled = this.plugin.isAgentModeEnabled();
            await this.plugin.setAgentModeEnabled(!isCurrentlyEnabled);
            
            if (this.plugin.isAgentModeEnabled()) {
                ui.agentModeButton.classList.add('active');
                ui.agentModeButton.setAttribute('title', 'Agent Mode: ON - AI can use tools');
                new Notice('Agent Mode enabled - AI can now use tools');
                
                // Reset execution count for new session
                if (this.agentResponseHandler) {
                    this.agentResponseHandler.resetExecutionCount();
                }
            } else {
                ui.agentModeButton.classList.remove('active');
                ui.agentModeButton.setAttribute('title', 'Agent Mode: OFF - Regular chat');
                new Notice('Agent Mode disabled');
            }
        });

        // Initialize button state
        if (this.plugin.isAgentModeEnabled()) {
            ui.agentModeButton.classList.add('active');
            ui.agentModeButton.setAttribute('title', 'Agent Mode: ON - AI can use tools');
        } else {
            ui.agentModeButton.classList.remove('active');
            ui.agentModeButton.setAttribute('title', 'Agent Mode: OFF - Regular chat');
        }
        // All styling for messagesContainer and textarea is handled by CSS

        // --- HANDLE SEND MESSAGE ---
        const sendMessage = async () => {
            const content = textarea.value.trim();
            if (!content) return;

            // Reset tool execution count for new user message
            if (this.agentResponseHandler) {
                this.agentResponseHandler.resetExecutionCount();
            }

            // Disable input and show stop button
            textarea.disabled = true;
            sendButton.classList.add('hidden');
            stopButton.classList.remove('hidden');

            // Add user message
            const userMessageEl = await createMessageElement(this.app, 'user', content, this.chatHistoryManager, this.plugin, (el) => this.regenerateResponse(el), this);
            this.messagesContainer.appendChild(userMessageEl);
            this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
            textarea.value = '';

            try {
                // Build context and get chat history
                const messages = await this.buildContextMessages();

                // Get all existing messages
                const messageElements = this.messagesContainer.querySelectorAll('.ai-chat-message');
                messageElements.forEach(el => {
                    const role = el.classList.contains('user') ? 'user' : 'assistant';
                    const content = el.querySelector('.message-content')?.textContent || '';
                    messages.push({ role, content });
                });

                // Create temporary container for streaming display
                const tempContainer = document.createElement('div');
                tempContainer.addClass('ai-chat-message', 'assistant');
                tempContainer.createDiv('message-content');
                this.messagesContainer.appendChild(tempContainer);
                this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;

                const responseContent = await this.streamAssistantResponse(messages, tempContainer);

                // Remove temporary container and create permanent message
                tempContainer.remove();
                if (responseContent.trim() !== "") {
                    const messageEl = await createMessageElement(this.app, 'assistant', responseContent, this.chatHistoryManager, this.plugin, (el) => this.regenerateResponse(el), this);
                    this.messagesContainer.appendChild(messageEl);
                    await this.chatHistoryManager.addMessage({
                        timestamp: messageEl.dataset.timestamp || new Date().toISOString(),
                        sender: 'assistant',
                        content: responseContent
                    });
                }
            } catch (error) {
                if (error.name !== 'AbortError') {
                    new Notice(`Error: ${error.message}`);
                    await createMessageElement(this.app, 'assistant', `Error: ${error.message}`, this.chatHistoryManager, this.plugin, (el) => this.regenerateResponse(el), this);
                }
            } finally {
                // Re-enable input and hide stop button
                textarea.disabled = false;
                textarea.focus();
                stopButton.classList.add('hidden');
                sendButton.classList.remove('hidden');
                this.activeStream = null;
            }
        };

        // --- BUTTON EVENT LISTENERS ---
        sendButton.addEventListener('click', sendMessage);
        stopButton.addEventListener('click', () => {
            if (this.activeStream) {
                this.activeStream.abort();
                this.activeStream = null;
                textarea.disabled = false;
                textarea.focus();
                stopButton.classList.add('hidden');
                sendButton.classList.remove('hidden');
                // Hide progress indicator if present
                if (this.agentResponseHandler) {
                    this.agentResponseHandler.hideTaskProgress();
                }
            }
        });

        // Modular input handler for slash commands and keyboard shortcuts
        // (setupInputHandler will be imported from './chat/inputHandler')
        // @ts-ignore
        import('./chat/inputHandler').then(({ setupInputHandler }) => {
            setupInputHandler(
                textarea,
                this.messagesContainer, // Pass messagesContainer for keyboard shortcuts
                sendMessage,
                async (cmd: string) => {
                    switch (cmd) {
                        case '/clear':
                            ui.clearButton.click();
                            break;
                        case '/copy':
                            ui.copyAllButton.click();
                            break;
                        case '/save':
                            ui.saveNoteButton.click();
                            break;
                        case '/settings':
                            ui.settingsButton.click();
                            break;
                        case '/help':
                            ui.helpButton.click();
                            break;
                        case '/ref':
                            ui.referenceNoteButton.click();
                            break;
                    }
                },
                this.app,
                this.plugin,
                sendButton,
                stopButton
            );
        });

        // Render loaded chat history
        if (loadedHistory.length > 0) {
            this.messagesContainer.empty();
            // If loading from a note, check for YAML frontmatter and update settings
            const file = this.app.workspace.getActiveFile();
            if (file) {
                await loadChatYamlAndApplySettings({
                    app: this.app,
                    plugin: this.plugin,
                    settings: this.plugin.settings,
                    file
                });
            }
            await renderChatHistory({
                messagesContainer: this.messagesContainer,
                loadedHistory,
                chatHistoryManager: this.chatHistoryManager,
                plugin: this.plugin,
                regenerateResponse: (el) => this.regenerateResponse(el),
                scrollToBottom: true
            });        }

        this.updateReferenceNoteIndicator(); // Update indicator on open
        
        // Listen for active file changes to update the indicator
        this.registerEvent(this.app.workspace.on('active-leaf-change', () => {
            this.updateReferenceNoteIndicator();
        }));
        
        // Listen for settings changes to update the indicator  
        this.plugin.onSettingsChange(() => {
            this.updateReferenceNoteIndicator();
        });
    }

    private async addMessage(role: 'user' | 'assistant', content: string, isError: boolean = false, enhancedData?: Partial<Pick<Message, 'reasoning' | 'taskStatus' | 'toolResults'>>): Promise<void> {
        const messageEl = await createMessageElement(this.app, role, content, this.chatHistoryManager, this.plugin, (el) => this.regenerateResponse(el), this, enhancedData ? { role, content, ...enhancedData } : undefined);
        const uiTimestamp = messageEl.dataset.timestamp || new Date().toISOString();
        this.messagesContainer.appendChild(messageEl);
        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
        try {
            await this.chatHistoryManager.addMessage({
                timestamp: uiTimestamp,
                sender: role,
                content,
                ...(enhancedData || {})
            });
        } catch (e) {
            new Notice("Failed to save chat message: " + e.message);
        }
    }

    async onClose() {
        if (this.activeStream) {
            this.activeStream.abort();
            this.activeStream = null;
        }
    }

    private async regenerateResponse(messageEl: HTMLElement) {
        // Disable input during regeneration
        const textarea = this.inputContainer.querySelector('textarea');
        if (textarea) textarea.disabled = true;

        // Find all message elements
        const allMessages = Array.from(this.messagesContainer.querySelectorAll('.ai-chat-message'));
        const currentIndex = allMessages.indexOf(messageEl);
        const isUserClicked = messageEl.classList.contains('user');

        // Find the target AI message to overwrite
        let targetIndex = -1;
        if (isUserClicked) {
            // If user message: find the next AI message after this user message
            for (let i = currentIndex + 1; i < allMessages.length; i++) {
                if (allMessages[i].classList.contains('assistant')) {
                    targetIndex = i;
                    break;
                }
                if (allMessages[i].classList.contains('user')) {
                    break; // Stop if another user message is found first
                }
            }
        } else {
            // If AI message: target is this message
            targetIndex = currentIndex;
        }

        // Gather context up to and including the relevant user message
        let userMsgIndex = currentIndex;
        if (!isUserClicked) {
            userMsgIndex = currentIndex - 1;
            while (userMsgIndex >= 0 && !allMessages[userMsgIndex].classList.contains('user')) {
                userMsgIndex--;
            }
        }

        // Build context messages and include prior chat history
        const messages = await this.buildContextMessages();
        for (let i = 0; i <= userMsgIndex; i++) {
            const el = allMessages[i];
            const role = el.classList.contains('user') ? 'user' : 'assistant';
            const content = (el as HTMLElement).dataset.rawContent || '';
            messages.push({ role, content });
        }

        // Remove the old AI message if overwriting
        let originalTimestamp = new Date().toISOString();
        let originalContent = '';
        let insertAfterNode: HTMLElement | null = null;
        if (targetIndex !== -1) {
            const targetEl = allMessages[targetIndex] as HTMLElement;
            originalTimestamp = targetEl.dataset.timestamp || originalTimestamp;
            originalContent = targetEl.dataset.rawContent || '';
            insertAfterNode = targetEl.previousElementSibling as HTMLElement;
            targetEl.remove();
        } else if (isUserClicked) {
            // No AI message to overwrite, insert after user message
            insertAfterNode = messageEl;
        } else {
            // No user message found, insert at top
            insertAfterNode = null;
        }

        // Create new assistant message container for streaming
        const assistantContainer = await createMessageElement(this.app, 'assistant', '', this.chatHistoryManager, this.plugin, (el) => this.regenerateResponse(el), this);
        assistantContainer.dataset.timestamp = originalTimestamp;
        if (insertAfterNode && insertAfterNode.nextSibling) {
            this.messagesContainer.insertBefore(assistantContainer, insertAfterNode.nextSibling);
        } else {
            this.messagesContainer.appendChild(assistantContainer);
        }
        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;

        try {
            await this.streamAssistantResponse(messages, assistantContainer, originalTimestamp, originalContent);
        } catch (error) {
            if (error.name !== 'AbortError') {
                new Notice(`Error: ${error.message}`);
                assistantContainer.remove();
            }
        } finally {
            if (textarea) {
                textarea.disabled = false;
                textarea.focus();
            }
            this.activeStream = null;
        }
    }

    private updateReferenceNoteIndicator() {
        if (!this.referenceNoteIndicator) return;
        
        const currentFile = this.app.workspace.getActiveFile();
        const isReferenceEnabled = this.plugin.settings.referenceCurrentNote;
        const button = this.referenceNoteIndicator.previousElementSibling as HTMLButtonElement;
        if (isReferenceEnabled && currentFile) {
            this.referenceNoteIndicator.setText(`📝 Referencing: ${currentFile.basename}`);
            this.referenceNoteIndicator.style.display = 'block';
            if (button && button.getAttribute('aria-label') === 'Toggle referencing current note') {
                button.setText('📝');
                button.classList.add('active');
            }
        } else {
            this.referenceNoteIndicator.style.display = 'none';
            if (button && button.getAttribute('aria-label') === 'Toggle referencing current note') {
                button.setText('📝');
                button.classList.remove('active');
            }
        }
    }

    private async buildContextMessages(): Promise<Message[]> {
        const messages: Message[] = [
            { role: 'system', content: this.plugin.getSystemMessage() }
        ];

        // Add context notes if enabled
        if (this.plugin.settings.enableContextNotes && this.plugin.settings.contextNotes) {
            const contextContent = await this.plugin.getContextNotesContent(this.plugin.settings.contextNotes);
            messages[0].content += `\n\nContext Notes:\n${contextContent}`;
        }

        // Add current note content if enabled
        if (this.plugin.settings.referenceCurrentNote) {
            const currentFile = this.app.workspace.getActiveFile();
            if (currentFile) {
                const currentNoteContent = await this.app.vault.cachedRead(currentFile);
                messages.push({
                    role: 'system',
                    content: `Here is the content of the current note:\n\n${currentNoteContent}`
                });
            }
        }

        return messages;
    }

    private async streamAssistantResponse(
        messages: Message[],
        container: HTMLElement,
        originalTimestamp?: string,
        originalContent?: string
    ): Promise<string> {
        let responseContent = '';
        this.activeStream = new AbortController();

        // Add agent system prompt if agent mode is enabled
        if (this.plugin.isAgentModeEnabled()) {
            // Import agent system prompt and prepend to system message
            const { AGENT_SYSTEM_PROMPT } = await import('../promptConstants');
            const systemMessageIndex = messages.findIndex(msg => msg.role === 'system');
            if (systemMessageIndex !== -1) {
                messages[systemMessageIndex].content = AGENT_SYSTEM_PROMPT + '\n\n' + messages[systemMessageIndex].content;
            }
        }

        try {
            // Use unified model if available, fallback to legacy provider selection
            const provider = this.plugin.settings.selectedModel 
                ? createProviderFromUnifiedModel(this.plugin.settings, this.plugin.settings.selectedModel)
                : createProvider(this.plugin.settings);
            await provider.getCompletion(
                messages,
                {
                    temperature: this.plugin.settings.temperature,
                    maxTokens: this.plugin.settings.maxTokens,
                    streamCallback: async (chunk: string) => {
                        responseContent += chunk;
                        const contentEl = container.querySelector('.message-content') as HTMLElement;
                        if (contentEl) {
                            container.dataset.rawContent = responseContent;
                            contentEl.empty();
                            await MarkdownRenderer.render(
                                this.app,
                                responseContent,
                                contentEl,
                                '',
                                this
                            );
                            this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
                        }
                    },
                    abortController: this.activeStream || undefined
                }
            );

            // Process response for agent tools if agent mode is enabled
            if (this.plugin.isAgentModeEnabled() && this.agentResponseHandler) {
                // Always hide any previous progress indicator before starting a new one
                this.agentResponseHandler.hideTaskProgress();
                // Show task progress indicator
                this.agentResponseHandler.updateTaskProgress(1, undefined, 'Processing AI response...');
                try {
                    // Use enhanced processing with UI integration
                    const agentResult = await this.agentResponseHandler.processResponseWithUI(responseContent);
                    // Hide task progress after processing
                    this.agentResponseHandler.hideTaskProgress();
                    if (agentResult.hasTools) {
                        // Update the display with processed text and tool execution results
                        const finalContent = agentResult.processedText + 
                            this.agentResponseHandler.formatToolResultsForDisplay(agentResult.toolResults);
                        
                        // Update container with enhanced message data
                        const enhancedMessageData: Message = {
                            role: 'assistant',
                            content: finalContent,
                            reasoning: agentResult.reasoning,
                            taskStatus: agentResult.taskStatus,
                            toolResults: agentResult.toolResults.map(({ command, result }) => ({
                                command,
                                result,
                                timestamp: new Date().toISOString()
                            }))
                        };
                        
                        // Store enhanced message data in container
                        container.dataset.messageData = JSON.stringify(enhancedMessageData);
                        container.dataset.rawContent = finalContent;
                        
                        // Update UI to show reasoning and task status
                        this.updateMessageWithEnhancedData(container, enhancedMessageData);
                        
                        // Show tool limit warning if needed
                        if (agentResult.shouldShowLimitWarning) {
                            const warning = this.agentResponseHandler.createToolLimitWarning();
                            this.messagesContainer.appendChild(warning);
                            
                            // Add continue task event listener
                            this.messagesContainer.addEventListener('continueTask', () => {
                                this.handleContinueTask(messages, container, responseContent, finalContent, agentResult.toolResults);
                            });
                        }
                        
                        // Show completion notification if task completed
                        if (agentResult.taskStatus.status === 'completed') {
                            this.agentResponseHandler.showTaskCompletionNotification(
                                `Task completed successfully! Used ${agentResult.taskStatus.toolExecutionCount} tools.`,
                                'success'
                            );
                            // Stop further processing if task is completed
                            responseContent = finalContent;
                            return responseContent;
                        } else if (agentResult.taskStatus.status === 'limit_reached') {
                            this.agentResponseHandler.showTaskCompletionNotification(
                                'Tool execution limit reached. You can continue the task or increase the limit in settings.',
                                'warning'
                            );
                        }

                        // Continue task execution until finished (only if not at limit)
                        if (!agentResult.shouldShowLimitWarning) {
                            responseContent = await this.continueTaskUntilFinished(
                                messages, 
                                container, 
                                responseContent, 
                                finalContent, 
                                agentResult.toolResults
                            );
                        } else {
                            responseContent = finalContent;
                        }
                    } else {
                        // No tools used, but may have reasoning
                        if (agentResult.reasoning) {
                            const enhancedMessageData: Message = {
                                role: 'assistant',
                                content: responseContent,
                                reasoning: agentResult.reasoning,
                                taskStatus: agentResult.taskStatus
                            };
                            
                            container.dataset.messageData = JSON.stringify(enhancedMessageData);
                            this.updateMessageWithEnhancedData(container, enhancedMessageData);
                        }
                        
                        // Check if this was just a reasoning step and we need to continue
                        if (responseContent.includes('"action"') && responseContent.includes('"thought"')) {
                            // This looks like a tool command that wasn't properly formatted, continue anyway
                            messages.push({ role: 'assistant', content: responseContent });
                            messages.push({ role: 'system', content: 'Please continue with the actual task execution based on your reasoning.' });
                            
                            const continuationContent = await this.getContinuationResponse(messages, container);
                            if (continuationContent.trim()) {
                                const updatedContent = responseContent + '\n\n' + continuationContent;
                                container.dataset.rawContent = updatedContent;
                                const contentEl = container.querySelector('.message-content') as HTMLElement;
                                if (contentEl) {
                                    contentEl.empty();
                                    await MarkdownRenderer.render(
                                        this.app,
                                        updatedContent,
                                        contentEl,
                                        '',
                                        this
                                    );
                                    this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
                                }
                                responseContent = updatedContent;
                            }
                        }
                    }
                } finally {
                    // Ensure progress indicator is always hidden, even on error
                    this.agentResponseHandler.hideTaskProgress();
                }
            }

            // Update chat history if we have a timestamp
            if (originalTimestamp && responseContent.trim() !== "") {
                // If enhanced message data exists, save it to history
                let messageData: any = undefined;
                if (container.dataset.messageData) {
                    try {
                        messageData = JSON.parse(container.dataset.messageData);
                    } catch {}
                }
                await this.chatHistoryManager.updateMessage(
                    originalTimestamp,
                    'assistant',
                    originalContent || '',
                    responseContent,
                    messageData // Pass enhanced data (reasoning, taskStatus, toolResults)
                );
            }

            return responseContent;
        } catch (error) {
            if (error.name !== 'AbortError') {
                throw error;
            }
            return '';
        }
    }

    public clearMessages() {
        this.messagesContainer.empty();
        // Reset tool execution count when chat is cleared
        if (this.agentResponseHandler) {
            this.agentResponseHandler.resetExecutionCount();
        }
    }

    public scrollMessagesToBottom() {
        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    }

    /**
     * Continue task execution until finished parameter is true
     */
    private async continueTaskUntilFinished(
        messages: Message[],
        container: HTMLElement,
        initialResponseContent: string,
        currentContent: string,
        initialToolResults: Array<{ command: ToolCommand; result: ToolResult }>
    ): Promise<string> {
        let responseContent = currentContent;
        let maxIterations = 10; // Prevent infinite loops
        let iteration = 0;
        
        // Check if any of the initial tool results indicate finished: true
        let isFinished = this.checkIfTaskFinished(initialToolResults);
        
        while (!isFinished && iteration < maxIterations) {
            iteration++;
            // Only log high-level iteration info here
            console.log(`ChatView: Task continuation iteration ${iteration}`);
            
            // Add tool results to context and continue conversation
            const toolResultMessage = this.agentResponseHandler?.createToolResultMessage(initialToolResults);
            if (toolResultMessage) {
                // Removed redundant: console.log('Tool results for context:', toolResultMessage);
                
                // Continue the conversation with tool results
                messages.push({ role: 'assistant', content: initialResponseContent });
                messages.push(toolResultMessage);
                messages.push({ 
                    role: 'system', 
                    content: 'Continue with the remaining parts of the task. Check your progress and continue until ALL parts of the user\'s request are complete. Set finished: true only when everything is done.'
                });
                
                // Get continuation response
                const continuationContent = await this.getContinuationResponse(messages, container);
                if (continuationContent.trim()) {
                    // Process continuation for additional tool commands
                    if (this.agentResponseHandler) {
                        const continuationResult = await this.agentResponseHandler.processResponse(continuationContent);
                        let continuationDisplay = continuationContent;
                        
                        if (continuationResult.hasTools) {
                            continuationDisplay = continuationResult.processedText + 
                                this.agentResponseHandler.formatToolResultsForDisplay(continuationResult.toolResults);
                            
                            // Check if this iteration is finished
                            isFinished = this.checkIfTaskFinished(continuationResult.toolResults);
                            
                            // Use the new tool results for next iteration
                            initialToolResults.push(...continuationResult.toolResults);
                        } else {
                            // If no tools were used, assume the task might be finished
                            isFinished = true;
                        }
                        
                        const updatedContent = responseContent + '\n\n' + continuationDisplay;
                        container.dataset.rawContent = updatedContent;
                        const contentEl = container.querySelector('.message-content') as HTMLElement;
                        if (contentEl) {
                            contentEl.empty();
                            await MarkdownRenderer.render(
                                this.app,
                                updatedContent,
                                contentEl,
                                '',
                                this
                            );
                            this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
                        }
                        responseContent = updatedContent;
                        
                        // Update initialResponseContent for next iteration
                        initialResponseContent = continuationContent;
                    } else {
                        const updatedContent = responseContent + '\n\n' + continuationContent;
                        container.dataset.rawContent = updatedContent;
                        const contentEl = container.querySelector('.message-content') as HTMLElement;
                        if (contentEl) {
                            contentEl.empty();
                            await MarkdownRenderer.render(
                                this.app,
                                updatedContent,
                                contentEl,
                                '',
                                this
                            );
                            this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
                        }
                        responseContent = updatedContent;
                        isFinished = true; // If no agent handler, consider finished
                    }
                } else {
                    // No continuation content, task might be finished
                    isFinished = true;
                }
            } else {
                // No tool results to continue with
                isFinished = true;
            }
        }
        
        if (iteration >= maxIterations) {
            console.warn('ChatView: Task continuation reached maximum iterations');
            responseContent += '\n\n*[Task continuation reached maximum iterations - stopping to prevent infinite loop]*';
        }
        
        // Only log once at the end
        console.log(`ChatView: Task continuation completed after ${iteration} iterations`);
        return responseContent;
    }

    /**
     * Check if any tool results indicate the task is finished
     */
    private checkIfTaskFinished(toolResults: Array<{ command: ToolCommand; result: ToolResult }>): boolean {
        return toolResults.some(({ command }) => {
            // Check if the command has finished: true parameter
            return (command as any).finished === true;
        });
    }

    /**
     * Get continuation response after tool execution
     */
    private async getContinuationResponse(
        messages: Message[],
        container: HTMLElement
    ): Promise<string> {
        try {
            console.log('ChatView: Getting continuation response after tool execution');
            
            // Use the same provider setup as the main response
            const provider = this.plugin.settings.selectedModel 
                ? createProviderFromUnifiedModel(this.plugin.settings, this.plugin.settings.selectedModel)
                : createProvider(this.plugin.settings);

            let continuationContent = '';
            
            await provider.getCompletion(
                messages,
                {
                    temperature: this.plugin.settings.temperature,
                    maxTokens: this.plugin.settings.maxTokens,
                    streamCallback: async (chunk: string) => {
                        continuationContent += chunk;
                        // Don't update the UI during continuation streaming
                        // The caller will handle the final update
                    },
                    abortController: this.activeStream || undefined
                }
            );

            console.log('ChatView: Continuation response received:', continuationContent.length, 'characters');
            return continuationContent;
        } catch (error) {
            console.error('ChatView: Error getting continuation response:', error);
            if (error.name !== 'AbortError') {
                // Return a fallback message instead of throwing
                return `*[Error getting continuation: ${error.message}]*`;
            }
            return '';
        }
    }

    /**
     * Update message container with enhanced reasoning and task status data
     */
    private updateMessageWithEnhancedData(container: HTMLElement, messageData: Message): void {
        // Remove existing reasoning and task status elements
        const existingReasoning = container.querySelector('.reasoning-container');
        const existingTaskStatus = container.querySelector('.task-status-container');
        if (existingReasoning) existingReasoning.remove();
        if (existingTaskStatus) existingTaskStatus.remove();

        const messageContainer = container.querySelector('.message-container');
        if (!messageContainer) return;

        // Add reasoning section if present
        if (messageData.reasoning) {
            const reasoningEl = this.createReasoningSection(messageData.reasoning);
            messageContainer.insertBefore(reasoningEl, messageContainer.firstChild);
        }

        // Add task status section if present
        if (messageData.taskStatus) {
            const taskStatusEl = this.createTaskStatusSection(messageData.taskStatus);
            messageContainer.insertBefore(taskStatusEl, messageContainer.firstChild);
        }

        // Update main content
        const contentEl = container.querySelector('.message-content') as HTMLElement;
        if (contentEl) {
            contentEl.empty();
            MarkdownRenderer.render(
                this.app,
                messageData.content,
                contentEl,
                '',
                this
            ).catch((error) => {
                contentEl.textContent = messageData.content;
            });
        }
    }

    /**
     * Create reasoning section element
     */
    private createReasoningSection(reasoning: any): HTMLElement {
        // Import the helper function from Message.ts (we'll need to export it)
        // For now, create a simplified version
        const reasoningContainer = document.createElement('div');
        reasoningContainer.className = 'reasoning-container';
        
        const header = document.createElement('div');
        header.className = 'reasoning-summary';
        
        const toggle = document.createElement('span');
        toggle.className = 'reasoning-toggle';
        toggle.textContent = reasoning.isCollapsed ? '▶' : '▼';

        const headerText = document.createElement('span');
        const typeLabel = reasoning.type === 'structured' ? 'STRUCTURED REASONING' : 'REASONING';
        const stepCount = reasoning.steps?.length || 0;
        headerText.innerHTML = `<strong>🧠 ${typeLabel}</strong>`;
        if (stepCount > 0) {
            headerText.innerHTML += ` (${stepCount} steps)`;
        }
        headerText.innerHTML += ` - <em>Click to ${reasoning.isCollapsed ? 'expand' : 'collapse'}</em>`;

        header.appendChild(toggle);
        header.appendChild(headerText);

        const details = document.createElement('div');
        details.className = 'reasoning-details';
        if (!reasoning.isCollapsed) {
            details.classList.add('expanded');
        }

        // Add reasoning content based on type
        if (reasoning.type === 'structured' && reasoning.steps) {
            if (reasoning.problem) {
                const problemDiv = document.createElement('div');
                problemDiv.className = 'reasoning-problem';
                problemDiv.innerHTML = `<strong>Problem:</strong> ${reasoning.problem}`;
                details.appendChild(problemDiv);
            }

            reasoning.steps.forEach((step: any) => {
                const stepDiv = document.createElement('div');
                stepDiv.className = `reasoning-step ${step.category}`;
                stepDiv.innerHTML = `
                    <div class="step-header">
                        ${this.getStepEmoji(step.category)} Step ${step.step}: ${step.title.toUpperCase()}
                    </div>
                    <div class="step-confidence">
                        Confidence: ${step.confidence}/10
                    </div>
                    <div class="step-content">
                        ${step.content}
                    </div>
                `;
                details.appendChild(stepDiv);
            });
        } else if (reasoning.summary) {
            const summaryDiv = document.createElement('div');
            summaryDiv.className = 'reasoning-completion';
            summaryDiv.textContent = reasoning.summary;
            details.appendChild(summaryDiv);
        }

        // Add toggle functionality
        header.addEventListener('click', () => {
            const isExpanded = details.classList.contains('expanded');
            if (isExpanded) {
                details.classList.remove('expanded');
                toggle.textContent = '▶';
                reasoning.isCollapsed = true;
            } else {
                details.classList.add('expanded');
                toggle.textContent = '▼';
                reasoning.isCollapsed = false;
            }
        });

        reasoningContainer.appendChild(header);
        reasoningContainer.appendChild(details);
        
        return reasoningContainer;
    }

    /**
     * Create task status section element
     */
    private createTaskStatusSection(taskStatus: TaskStatus): HTMLElement {
        const statusContainer = document.createElement('div');
        statusContainer.className = 'task-status-container';
        statusContainer.dataset.taskStatus = taskStatus.status;

        const statusText = this.getTaskStatusText(taskStatus);
        const statusIcon = this.getTaskStatusIcon(taskStatus.status);

        statusContainer.innerHTML = `
            <div class="task-status-header">
                ${statusIcon} <strong>${statusText}</strong>
            </div>
        `;

        // Add progress bar if available
        if (taskStatus.progress) {
            const progressContainer = document.createElement('div');
            progressContainer.className = 'task-progress-container';
            
            if (taskStatus.progress.total) {
                const progressBar = document.createElement('div');
                progressBar.className = 'task-progress-bar';
                const progressFill = document.createElement('div');
                progressFill.className = 'task-progress-fill';
                const progressPercent = (taskStatus.progress.current / taskStatus.progress.total) * 100;
                progressFill.style.width = `${progressPercent}%`;
                progressBar.appendChild(progressFill);
                progressContainer.appendChild(progressBar);
                
                const progressText = document.createElement('div');
                progressText.className = 'task-progress-text';
                progressText.textContent = `${taskStatus.progress.current}/${taskStatus.progress.total}`;
                if (taskStatus.progress.description) {
                    progressText.textContent += ` - ${taskStatus.progress.description}`;
                }
                progressContainer.appendChild(progressText);
            }
            
            statusContainer.appendChild(progressContainer);
        }

        // Add tool execution count
        if (taskStatus.toolExecutionCount > 0) {
            const toolInfo = document.createElement('div');
            toolInfo.className = 'task-tool-info';
            toolInfo.textContent = `Tools used: ${taskStatus.toolExecutionCount}/${taskStatus.maxToolExecutions}`;
            statusContainer.appendChild(toolInfo);
        }

        return statusContainer;
    }

    /**
     * Handle continue task after tool limit reached
     */
    private async handleContinueTask(
        messages: Message[], 
        container: HTMLElement, 
        responseContent: string, 
        finalContent: string, 
        toolResults: Array<{ command: ToolCommand; result: ToolResult }>
    ): Promise<void> {
        // Reset execution count and continue task
        if (this.agentResponseHandler) {
            this.agentResponseHandler.resetExecutionCount();
            
            // Continue task execution
            const continuedContent = await this.continueTaskUntilFinished(
                messages,
                container,
                responseContent,
                finalContent,
                toolResults
            );
            
            // Update the container with continued content
            container.dataset.rawContent = continuedContent;
            const contentEl = container.querySelector('.message-content') as HTMLElement;
            if (contentEl) {
                contentEl.empty();
                await MarkdownRenderer.render(
                    this.app,
                    continuedContent,
                    contentEl,
                    '',
                    this
                );
                this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
            }
        }
    }

    /**
     * Get emoji for reasoning step categories
     */
    private getStepEmoji(category: string): string {
        switch (category) {
            case 'analysis': return '🔍';
            case 'planning': return '📋';
            case 'problem-solving': return '🧩';
            case 'reflection': return '🤔';
            case 'conclusion': return '✅';
            case 'reasoning': return '🧠';
            case 'information': return '📊';
            case 'approach': return '🎯';
            case 'evaluation': return '⚖️';
            case 'synthesis': return '🔗';
            case 'validation': return '✅';
            case 'refinement': return '⚡';
            default: return '💭';
        }
    }

    /**
     * Get task status text
     */
    private getTaskStatusText(taskStatus: TaskStatus): string {
        switch (taskStatus.status) {
            case 'idle': return 'Task Ready';
            case 'running': return 'Task In Progress';
            case 'stopped': return 'Task Stopped';
            case 'completed': return 'Task Completed';
            case 'limit_reached': return 'Tool Limit Reached';
            case 'waiting_for_user': return 'Waiting for User Input';
            default: return 'Unknown Status';
        }
    }

    /**
     * Get task status icon
     */
    private getTaskStatusIcon(status: string): string {
        switch (status) {
            case 'idle': return '⏸️';
            case 'running': return '🔄';
            case 'stopped': return '⏹️';
            case 'completed': return '✅';
            case 'limit_reached': return '⚠️';
            case 'waiting_for_user': return '⏳';
            default: return '❓';
        }
    }
}

// --- HELP MODAL --- // This class is now in a separate file: ChatHelpModal.ts
