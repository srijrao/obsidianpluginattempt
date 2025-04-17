import { ItemView, WorkspaceLeaf, Notice, Modal, App, Setting, MarkdownRenderer } from 'obsidian';
import MyPlugin from './main';
import { Message } from './types';
import { createProvider } from './providers';
import { EventManager } from './utils';

export const VIEW_TYPE_CHAT = 'chat-view';

class SettingsModal extends Modal {
    plugin: MyPlugin;

    constructor(app: App, plugin: MyPlugin) {
        super(app);
        this.plugin = plugin;
        this.titleEl.setText('AI Model Settings');
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('ai-settings-modal');
    
        // Provider selection
        new Setting(contentEl)
            .setName('AI Provider')
            .setDesc('Choose which AI provider to use')
            .addDropdown(dropdown => {
                dropdown
                    .addOption('openai', 'OpenAI')
                    .addOption('anthropic', 'Anthropic (Claude)')
                    .addOption('gemini', 'Google (Gemini)')
                    .addOption('ollama', 'Ollama (Local AI)')
                    .setValue(this.plugin.settings.provider)
                    .onChange(async (value: 'openai' | 'anthropic' | 'gemini' | 'ollama') => {
                        this.plugin.settings.provider = value;
                        await this.plugin.saveSettings();
                        this.onOpen(); // Refresh view to show provider-specific settings
                    });
            });
    
        // System message
        new Setting(contentEl)
            .setName('System Message')
            .setDesc('Set the system message for the AI')
            .addTextArea(text => text
                .setPlaceholder('You are a helpful assistant.')
                .setValue(this.plugin.settings.systemMessage)
                .onChange(async (value) => {
                    this.plugin.settings.systemMessage = value;
                    await this.plugin.saveSettings();
                }));
    
        // Include date with system message
        new Setting(contentEl)
            .setName('Include Date with System Message')
            .setDesc('Add the current date to the system message')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.includeDateWithSystemMessage)
                .onChange(async (value) => {
                    this.plugin.settings.includeDateWithSystemMessage = value;
                    await this.plugin.saveSettings();
                }));
    
        // Include time with system message
        new Setting(contentEl)
            .setName('Include Time with System Message')
            .setDesc('Add the current time along with the date to the system message')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.includeTimeWithSystemMessage)
                .onChange(async (value) => {
                    this.plugin.settings.includeTimeWithSystemMessage = value;
                    await this.plugin.saveSettings();
                }));
    
        // Enable Obsidian links
        new Setting(contentEl)
            .setName('Enable Obsidian Links')
            .setDesc('Read Obsidian links in messages using [[filename]] syntax')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableObsidianLinks)
                .onChange(async (value) => {
                    this.plugin.settings.enableObsidianLinks = value;
                    await this.plugin.saveSettings();
                }));
    
        // Enable context notes
        new Setting(contentEl)
            .setName('Enable Context Notes')
            .setDesc('Attach specified note content to chat messages')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableContextNotes)
                .onChange(async (value) => {
                    this.plugin.settings.enableContextNotes = value;
                    await this.plugin.saveSettings();
                }));
    
        // Context notes
        new Setting(contentEl)
            .setName('Context Notes')
            .setDesc('Notes to attach as context (supports [[filename]] and [[filename#header]] syntax)')
            .addTextArea(text => {
                text.setPlaceholder('[[Note Name]]\n[[Another Note#Header]]')
                    .setValue(this.plugin.settings.contextNotes || '')
                    .onChange(async (value) => {
                        this.plugin.settings.contextNotes = value;
                        await this.plugin.saveSettings();
                    });
                text.inputEl.rows = 4;
            });
    
        // Enable streaming
        new Setting(contentEl)
            .setName('Enable Streaming')
            .setDesc('Enable or disable streaming for completions')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableStreaming)
                .onChange(async (value) => {
                    this.plugin.settings.enableStreaming = value;
                    await this.plugin.saveSettings();
                }));
    
        // Temperature
        new Setting(contentEl)
            .setName('Temperature')
            .setDesc('Set the randomness of the model\'s output (0-1)')
            .addSlider(slider => slider
                .setLimits(0, 1, 0.1)
                .setValue(this.plugin.settings.temperature)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.plugin.settings.temperature = value;
                    await this.plugin.saveSettings();
                }));
    
        // Max tokens
        new Setting(contentEl)
            .setName('Max Tokens')
            .setDesc('Set the maximum length of the model\'s output')
            .addText(text => text
                .setPlaceholder('4000')
                .setValue(String(this.plugin.settings.maxTokens))
                .onChange(async (value) => {
                    const numValue = Number(value);
                    if (!isNaN(numValue)) {
                        this.plugin.settings.maxTokens = numValue;
                        await this.plugin.saveSettings();
                    }
                }));
    
        // Add "Reference Current Note" toggle
        new Setting(contentEl)
            .setName('Reference Current Note')
            .setDesc('Include the content of the current note in the chat context.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.referenceCurrentNote)
                .onChange(async (value) => {
                    this.plugin.settings.referenceCurrentNote = value;
                    await this.plugin.saveSettings();
                }));
    
        // Provider-specific settings
        contentEl.createEl('h3', { text: `${this.plugin.settings.provider.toUpperCase()} Settings` });
    
        switch (this.plugin.settings.provider) {
            case 'openai': {
                const settings = this.plugin.settings.openaiSettings;
                new Setting(contentEl)
                    .setName('Model')
                    .setDesc('Choose the OpenAI model to use')
                    .addDropdown(dropdown => {
                        for (const model of settings.availableModels) {
                            dropdown.addOption(model, model);
                        }
                        dropdown
                            .setValue(settings.model)
                            .onChange(async (value) => {
                                settings.model = value;
                                await this.plugin.saveSettings();
                            });
                    });
                break;
            }
            case 'anthropic': {
                const settings = this.plugin.settings.anthropicSettings;
                new Setting(contentEl)
                    .setName('Model')
                    .setDesc('Choose the Anthropic model to use')
                    .addDropdown(dropdown => {
                        for (const model of settings.availableModels) {
                            dropdown.addOption(model, model);
                        }
                        dropdown
                            .setValue(settings.model)
                            .onChange(async (value) => {
                                settings.model = value;
                                await this.plugin.saveSettings();
                            });
                    });
                break;
            }
            case 'gemini': {
                const settings = this.plugin.settings.geminiSettings;
                new Setting(contentEl)
                    .setName('Model')
                    .setDesc('Choose the Gemini model to use')
                    .addDropdown(dropdown => {
                        for (const model of settings.availableModels) {
                            dropdown.addOption(model, model);
                        }
                        dropdown
                            .setValue(settings.model)
                            .onChange(async (value) => {
                                settings.model = value;
                                await this.plugin.saveSettings();
                            });
                    });
                break;
            }
            case 'ollama': {
                const settings = this.plugin.settings.ollamaSettings;
                new Setting(contentEl)
                    .setName('Model')
                    .setDesc('Choose the Ollama model to use')
                    .addDropdown(dropdown => {
                        for (const model of settings.availableModels) {
                            dropdown.addOption(model, model);
                        }
                        dropdown
                            .setValue(settings.model)
                            .onChange(async (value) => {
                                settings.model = value;
                                await this.plugin.saveSettings();
                            });
                    });
                break;
            }
        }
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}

class ConfirmationModal extends Modal {
    private onConfirm: (confirmed: boolean) => void;
    private message: string;

    constructor(app: App, title: string, message: string, onConfirm: (confirmed: boolean) => void) {
        super(app);
        this.titleEl.setText(title);
        this.message = message;
        this.onConfirm = onConfirm;
    }

    onOpen() {
        const { contentEl } = this;

        contentEl.createEl('p', { text: this.message });

        const buttonContainer = contentEl.createDiv('modal-button-container');
        buttonContainer.style.display = 'flex';
        buttonContainer.style.justifyContent = 'flex-end';
        buttonContainer.style.gap = '8px';
        buttonContainer.style.marginTop = '16px';

        buttonContainer.createEl('button', { text: 'Cancel' })
            .addEventListener('click', () => {
                this.onConfirm(false);
                this.close();
            });

        const confirmButton = buttonContainer.createEl('button', {
            text: 'Delete',
            cls: 'mod-warning'
        });
        confirmButton.addEventListener('click', () => {
            this.onConfirm(true);
            this.close();
        });
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}

// State enum for chat UI
export enum ChatUIState {
    IDLE = 'idle',
    LOADING = 'loading',
    STREAMING = 'streaming',
    ERROR = 'error'
}

// ChatService class to handle chat logic
export class ChatService {
    private eventManager: EventManager;
    private activeStream: AbortController | null = null;

    constructor(
        private app: App,
        private view: ChatView
    ) {
        this.eventManager = new EventManager();
    }

    public async sendMessage(content: string): Promise<void> {
        if (!content.trim()) return;

        try {
            const userMessage = await this.createAndAppendMessage('user', content);
            const assistantMessage = await this.createAndAppendMessage('assistant', '');
            
            await this.view.streamResponse(assistantMessage, content);
        } catch (error) {
            new Notice(`Error: ${error.message}`);
        }
    }

    private async createAndAppendMessage(role: 'user' | 'assistant', content: string): Promise<HTMLElement> {
        const messageEl = document.createElement('div');
        messageEl.classList.add('chat-message', role);
        
        const contentEl = document.createElement('div');
        contentEl.classList.add('message-content');
        contentEl.innerHTML = content;
        
        messageEl.appendChild(contentEl);
        return messageEl;
    }

    public stop(): void {
        if (this.activeStream) {
            this.activeStream.abort();
            this.activeStream = null;
        }
    }

    public destroy(): void {
        this.stop();
        this.eventManager.cleanup();
    }
}

export class ChatView extends ItemView {
    plugin: MyPlugin;
    private messagesContainer: HTMLElement;
    private inputContainer: HTMLElement;
    private eventManager: EventManager;
    private chatService: ChatService;
    private debouncedSendMessage: Function;
    private messageHistory: Message[] = [];
    private settingsContainer: HTMLElement | null = null;
    private activeStream: AbortController | null = null;

    constructor(leaf: WorkspaceLeaf, plugin: MyPlugin) {
        super(leaf);
        this.plugin = plugin;
        this.eventManager = new EventManager();
        this.chatService = new ChatService(this.app, this); // Fix: Use this.app instead of plugin
        this.debouncedSendMessage = this.debounce(this.chatService.sendMessage.bind(this.chatService), 400);
        this.messagesContainer = createDiv('ai-chat-messages');
        this.inputContainer = createDiv('ai-chat-input-container');
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

        // Create UI components
        this.createMessagesContainer(contentEl);
        this.createInputArea(contentEl);

        // Register workspace events
        this.registerEvent(
            this.app.workspace.on('active-leaf-change', this.handleActiveLeafChange.bind(this))
        );

        // Initial greeting
        await this.addMessage('assistant', 'Hello! How can I help you today?');
    }

    private createMessagesContainer(parentEl: HTMLElement) {
        this.messagesContainer = parentEl.createDiv('ai-chat-messages');
        this.messagesContainer.style.flex = '1';
        this.messagesContainer.style.overflow = 'auto';
        this.messagesContainer.style.padding = '16px';
    }

    private createInputArea(parentEl: HTMLElement) {
        this.inputContainer = parentEl.createDiv('ai-chat-input-container');
        this.inputContainer.style.borderTop = '1px solid var(--background-modifier-border)';
        this.inputContainer.style.padding = '16px';

        const textarea = this.createChatTextarea();
        const buttonContainer = this.createButtonContainer();
        
        this.inputContainer.appendChild(textarea);
        this.inputContainer.appendChild(buttonContainer);
    }

    private createChatTextarea(): HTMLTextAreaElement {
        const textarea = document.createElement('textarea');
        textarea.addClass('ai-chat-input');
        textarea.placeholder = 'Type your message...';
        textarea.rows = 3;
        textarea.style.width = '100%';
        textarea.style.resize = 'none';

        // Register event listeners with cleanup
        this.eventManager.addEventListener(textarea, 'keydown', (e: KeyboardEvent) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.debouncedSendMessage(textarea.value);
                textarea.value = '';
            }
        });

        return textarea;
    }

    private createButtonContainer(): HTMLElement {
        const container = document.createElement('div');
        container.addClass('ai-chat-buttons');
        container.style.marginTop = '8px';
        container.style.display = 'flex';
        container.style.gap = '8px';
        container.style.justifyContent = 'flex-end';

        // Send button
        const sendButton = this.createButton('Send', 'mod-cta');
        this.eventManager.addEventListener(sendButton, 'click', () => {
            const textarea = this.inputContainer.querySelector('textarea');
            if (textarea) {
                this.debouncedSendMessage(textarea.value);
                textarea.value = '';
            }
        });

        // Stop button
        const stopButton = this.createButton('Stop');
        stopButton.style.display = 'none';
        this.eventManager.addEventListener(stopButton, 'click', () => {
            this.chatService.stop();
        });

        // Clear button
        const clearButton = this.createButton('Clear Chat');
        this.eventManager.addEventListener(clearButton, 'click', () => {
            this.clearChat();
        });

        // Settings button
        const settingsButton = this.createButton('Settings');
        this.eventManager.addEventListener(settingsButton, 'click', () => {
            new SettingsModal(this.app, this.plugin).open();
        });

        container.appendChild(settingsButton);
        container.appendChild(sendButton);
        container.appendChild(stopButton);
        container.appendChild(clearButton);

        return container;
    }

    private createButton(text: string, cls?: string): HTMLButtonElement {
        const button = document.createElement('button');
        button.setText(text);
        if (cls) button.addClass(cls);
        return button;
    }

    clearChat() {
        this.messagesContainer.empty();
        this.addMessage('assistant', 'Chat cleared. How can I help you?');
    }

    private updateUIState(state: ChatUIState) {
        const textarea = this.inputContainer.querySelector('textarea');
        const sendButton = this.inputContainer.querySelector('button.mod-cta') as HTMLButtonElement;
        const stopButton = this.inputContainer.querySelector('button:nth-child(3)') as HTMLButtonElement;

        if (state === ChatUIState.STREAMING) {
            if (textarea) (textarea as HTMLTextAreaElement).disabled = true;
            if (sendButton) sendButton.disabled = true;
            if (stopButton) {
                stopButton.style.display = 'block';
                stopButton.disabled = false;
            }
        } else {
            if (textarea) (textarea as HTMLTextAreaElement).disabled = false;
            if (sendButton) sendButton.disabled = false;
            if (stopButton) {
                stopButton.style.display = 'none';
                stopButton.disabled = true;
            }
        }
    }

    private createActionButton(icon: string, label: string, tooltip: string, callback: () => void): HTMLElement {
        const button = document.createElement('button');
        button.addClass('ai-chat-action-button');
        button.setAttribute('aria-label', tooltip);
        button.style.display = 'flex';
        button.style.alignItems = 'center';
        button.style.gap = '4px'; // Add spacing between icon and label

        // Add icon
        const iconEl = document.createElement('svg');
        iconEl.classList.add('lucide-icon');
        iconEl.innerHTML = `<use href="#lucide-${icon}"></use>`;
        button.appendChild(iconEl);

        // Add label
        const labelEl = document.createElement('span');
        labelEl.textContent = label;
        button.appendChild(labelEl);

        button.addEventListener('click', callback);
        return button;
    }

    private async copyToClipboard(text: string): Promise<void> {
        try {
            await navigator.clipboard.writeText(text);
            new Notice('Copied to clipboard');
        } catch (error) {
            new Notice('Failed to copy to clipboard');
            console.error('Clipboard error:', error);
        }
    }

    public async createMessageElement(role: string, content: string): Promise<HTMLElement> {
        const messageEl = document.createElement('div');
        messageEl.addClass('chat-message', role);
        messageEl.dataset.rawContent = content;
        
        const contentEl = document.createElement('div');
        contentEl.addClass('message-content');
        
        // Render markdown content
        await MarkdownRenderer.render(this.app, content, contentEl, '', this);
        messageEl.appendChild(contentEl);
        
        // Add message actions
        const actionsEl = this.createMessageActions(messageEl, role);
        messageEl.appendChild(actionsEl);

        // Add to container and scroll
        this.messagesContainer.appendChild(messageEl);
        this.scrollToBottom();
        
        // Add to history
        this.messageHistory.push({ role: role as 'user' | 'assistant', content });

        return messageEl;
    }

    private createMessageActions(messageEl: HTMLElement, role: string): HTMLElement {
        const actionsEl = document.createElement('div');
        actionsEl.addClass('message-actions');
        actionsEl.style.display = 'none';
        actionsEl.style.flexWrap = 'wrap';
        actionsEl.style.gap = '8px';
        actionsEl.style.marginTop = '8px';

        // Add hover behavior
        messageEl.addEventListener('mouseenter', () => {
            actionsEl.style.display = 'flex';
        });
        messageEl.addEventListener('mouseleave', () => {
            actionsEl.style.display = 'none';
        });

        // Add copy button
        actionsEl.appendChild(this.createActionButton('copy', 'Copy', 'Copy message', () => {
            const currentContent = messageEl.dataset.rawContent || '';
            if (currentContent.trim() === '') {
                new Notice('No content to copy');
                return;
            }
            this.copyToClipboard(currentContent);
        }));

        // Add edit button
        actionsEl.appendChild(this.createActionButton('edit', 'Edit', 'Edit message', () => {
            this.handleMessageEdit(messageEl);
        }));

        // Add delete button
        actionsEl.appendChild(this.createActionButton('trash', 'Delete', 'Delete message', () => {
            this.handleMessageDelete(messageEl);
        }));

        // Add refresh button for assistant messages
        if (role === 'assistant') {
            actionsEl.appendChild(this.createActionButton('refresh-cw', 'Regenerate', 'Regenerate response', () => {
                this.handleMessageRegenerate(messageEl);
            }));
        }

        return actionsEl;
    }

    private scrollToBottom(): void {
        this.messagesContainer.scrollTo({
            top: this.messagesContainer.scrollHeight,
            behavior: 'smooth'
        });
    }

    public getMessageHistory(): Message[] {
        const messages: Message[] = [];
        const messageElements = this.messagesContainer.querySelectorAll('.chat-message');
        messageElements.forEach(el => {
            const role = el.classList.contains('user') ? 'user' : 'assistant';
            const content = (el as HTMLElement).dataset.rawContent || '';
            messages.push({ role, content });
        });
        return messages;
    }

    private async addMessage(role: 'user' | 'assistant', content: string) {
        const messageEl = await this.createMessageElement(role, content);
        this.messagesContainer.appendChild(messageEl);
        this.scrollToBottom();
        this.messageHistory.push({ role, content });
    }

    async onClose() {
        this.chatService.destroy();
        this.eventManager.cleanup();
    }

    private handleActiveLeafChange() {
        // Update context when active file changes
        if (this.plugin.settings.referenceCurrentNote) {
            const currentFile = this.app.workspace.getActiveFile();
            if (currentFile) {
                // TODO: Implement context update
                console.log('Context update not implemented yet');
            }
        }
    }

    private debounce(func: Function, wait: number) {
        let timeout: NodeJS.Timeout;
        return (...args: any[]) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), wait);
        };
    }

    private async sendMessage(content: string) {
        if (!content.trim()) return;
        
        // Update UI state to loading
        this.updateUIState(ChatUIState.STREAMING);
        
        // Cancel any existing stream
        if (this.activeStream) {
            this.activeStream.abort();
            this.activeStream = null;
        }

        // Create new abort controller for this request
        this.activeStream = new AbortController();

        // Get UI elements
        const textarea = this.inputContainer.querySelector('textarea');
        const sendButton = this.inputContainer.querySelector('button.mod-cta') as HTMLButtonElement;
        if (textarea) (textarea as HTMLTextAreaElement).disabled = true;
        if (sendButton) sendButton.disabled = true;

        try {
            const provider = createProvider(this.plugin.settings);
            const messages = await this.getMessageContext();
            
            // Add user message
            await this.addMessage('user', content);

            // Create assistant message container for streaming
            const assistantContainer = await this.createMessageElement('assistant', '');
            this.messagesContainer.appendChild(assistantContainer);
            
            let responseContent = '';
            await provider.getCompletion(messages, {
                temperature: this.plugin.settings.temperature,
                maxTokens: this.plugin.settings.maxTokens,
                streamCallback: async (chunk: string) => {
                    responseContent += chunk;
                    const contentEl = assistantContainer.querySelector('.message-content') as HTMLElement;
                    if (contentEl) {
                        assistantContainer.dataset.rawContent = responseContent;
                        contentEl.empty();
                        await MarkdownRenderer.render(this.app, responseContent, contentEl, '', this);
                        this.scrollToBottom();
                    }
                },
                abortController: this.activeStream
            });

        } catch (error) {
            if (error.name !== 'AbortError') {
                new Notice(`Error: ${error.message}`);
                await this.addMessage('assistant', `Error: ${error.message}`);
            }
        } finally {
            // Reset UI state
            this.updateUIState(ChatUIState.IDLE);
            // Re-enable input
            if (textarea) {
                textarea.disabled = false;
                textarea.focus();
            }
            if (sendButton) sendButton.disabled = false;
            this.activeStream = null;
        }
    }

    private async getMessageContext(): Promise<Message[]> {
        const messages: Message[] = [
            { role: 'system', content: this.plugin.getSystemMessage() }
        ];

        // Include current note context if enabled
        if (this.plugin.settings.referenceCurrentNote) {
            const currentFile = this.app.workspace.getActiveFile();
            if (currentFile) {
                const currentNoteContent = await this.app.vault.cachedRead(currentFile);
                messages.push({
                    role: 'system',
                    content: `Current note content:\n\n${currentNoteContent}`
                });
            }
        }

        // Add existing conversation history
        const messageElements = this.messagesContainer.querySelectorAll('.ai-chat-message');
        messageElements.forEach(el => {
            const role = el.classList.contains('user') ? 'user' : 'assistant';
            const content = (el as HTMLElement).dataset.rawContent || '';
            messages.push({ role, content });
        });

        return messages;
    }

    private createSettingsPanel(): HTMLElement {
        const container = document.createElement('div');
        container.addClass('ai-chat-settings-panel');

        // Add settings title
        container.createEl('h3', { text: 'AI Model Settings' });

        // Provider selection
        const providerContainer = container.createDiv();
        providerContainer.createEl('label', { text: 'AI Provider' });
        const providerSelect = providerContainer.createEl('select');
        providerSelect.createEl('option', { value: 'openai', text: 'OpenAI' });
        providerSelect.createEl('option', { value: 'anthropic', text: 'Anthropic (Claude)' });
        providerSelect.createEl('option', { value: 'gemini', text: 'Google (Gemini)' });
        providerSelect.createEl('option', { value: 'ollama', text: 'Ollama (Local AI)' });
        providerSelect.value = this.plugin.settings.provider;
        providerSelect.addEventListener('change', async () => {
            this.plugin.settings.provider = providerSelect.value as any;
            await this.plugin.saveSettings();
            // Refresh settings panel to show provider-specific settings
            if (this.settingsContainer) {
                this.settingsContainer.replaceWith(this.createSettingsPanel());
            }
        });

        // System message
        const systemMessageContainer = container.createDiv();
        systemMessageContainer.createEl('label', { text: 'System Message' });
        const systemMessageInput = systemMessageContainer.createEl('textarea');
        systemMessageInput.value = this.plugin.settings.systemMessage;
        systemMessageInput.addEventListener('change', async () => {
            this.plugin.settings.systemMessage = systemMessageInput.value;
            await this.plugin.saveSettings();
        });

        // Temperature
        const temperatureContainer = container.createDiv();
        temperatureContainer.createEl('label', { text: 'Temperature' });
        const temperatureInput = temperatureContainer.createEl('input', { type: 'range' });
        temperatureInput.min = '0';
        temperatureInput.max = '1';
        temperatureInput.step = '0.1';
        temperatureInput.value = String(this.plugin.settings.temperature);
        const temperatureValue = temperatureContainer.createSpan();
        temperatureValue.textContent = String(this.plugin.settings.temperature);
        temperatureInput.addEventListener('input', async () => {
            const value = Number(temperatureInput.value);
            temperatureValue.textContent = String(value);
            this.plugin.settings.temperature = value;
            await this.plugin.saveSettings();
        });

        // Max tokens
        const maxTokensContainer = container.createDiv();
        maxTokensContainer.createEl('label', { text: 'Max Tokens' });
        const maxTokensInput = maxTokensContainer.createEl('input', { type: 'number' });
        maxTokensInput.value = String(this.plugin.settings.maxTokens);
        maxTokensInput.addEventListener('change', async () => {
            const value = Number(maxTokensInput.value);
            if (!isNaN(value)) {
                this.plugin.settings.maxTokens = value;
                await this.plugin.saveSettings();
            }
        });

        // Provider-specific settings
        const providerSettings = container.createDiv();
        providerSettings.createEl('h4', { text: `${this.plugin.settings.provider.toUpperCase()} Settings` });

        switch (this.plugin.settings.provider) {
            case 'openai': {
                const settings = this.plugin.settings.openaiSettings;
                const modelSelect = providerSettings.createEl('select');
                settings.availableModels.forEach(model => {
                    modelSelect.createEl('option', { value: model, text: model });
                });
                modelSelect.value = settings.model;
                modelSelect.addEventListener('change', async () => {
                    settings.model = modelSelect.value;
                    await this.plugin.saveSettings();
                });
                break;
            }
            case 'anthropic': {
                const settings = this.plugin.settings.anthropicSettings;
                const modelSelect = providerSettings.createEl('select');
                settings.availableModels.forEach(model => {
                    modelSelect.createEl('option', { value: model, text: model });
                });
                modelSelect.value = settings.model;
                modelSelect.addEventListener('change', async () => {
                    settings.model = modelSelect.value;
                    await this.plugin.saveSettings();
                });
                break;
            }
            case 'gemini': {
                const settings = this.plugin.settings.geminiSettings;
                const modelSelect = providerSettings.createEl('select');
                settings.availableModels.forEach(model => {
                    modelSelect.createEl('option', { value: model, text: model });
                });
                modelSelect.value = settings.model;
                modelSelect.addEventListener('change', async () => {
                    settings.model = modelSelect.value;
                    await this.plugin.saveSettings();
                });
                break;
            }
            case 'ollama': {
                const settings = this.plugin.settings.ollamaSettings;
                const modelSelect = providerSettings.createEl('select');
                settings.availableModels.forEach(model => {
                    modelSelect.createEl('option', { value: model, text: model });
                });
                modelSelect.value = settings.model;
                modelSelect.addEventListener('change', async () => {
                    settings.model = modelSelect.value;
                    await this.plugin.saveSettings();
                });
                break;
            }
        }

        return container;
    }

    private async handleMessageEdit(messageEl: HTMLElement) {
        const currentContent = messageEl.dataset.rawContent || '';
        const contentEl = messageEl.querySelector('.message-content') as HTMLElement;
        if (!contentEl) return;

        // Create textarea for editing
        const textarea = document.createElement('textarea');
        textarea.value = currentContent;
        textarea.style.width = '100%';
        textarea.style.minHeight = '100px';

        // Replace content with textarea
        contentEl.empty();
        contentEl.appendChild(textarea);

        // Add save and cancel buttons
        const buttonContainer = document.createElement('div');
        buttonContainer.style.display = 'flex';
        buttonContainer.style.gap = '8px';
        buttonContainer.style.marginTop = '8px';

        const saveButton = this.createButton('Save', 'mod-cta');
        const cancelButton = this.createButton('Cancel');

        saveButton.addEventListener('click', async () => {
            const newContent = textarea.value;
            messageEl.dataset.rawContent = newContent;
            contentEl.empty();
            await MarkdownRenderer.render(this.app, newContent, contentEl, '', this);
            buttonContainer.remove();
        });

        cancelButton.addEventListener('click', async () => {
            contentEl.empty();
            await MarkdownRenderer.render(this.app, currentContent, contentEl, '', this);
            buttonContainer.remove();
        });

        buttonContainer.appendChild(saveButton);
        buttonContainer.appendChild(cancelButton);
        contentEl.appendChild(buttonContainer);
        textarea.focus();
    }

    private handleMessageDelete(messageEl: HTMLElement) {
        new ConfirmationModal(
            this.app,
            'Delete Message',
            'Are you sure you want to delete this message?',
            (confirmed: boolean) => {
                if (confirmed) {
                    messageEl.remove();
                }
            }
        ).open();
    }

    private async handleMessageRegenerate(messageEl: HTMLElement) {
        // Find the previous user message
        let prevMessage = messageEl.previousElementSibling;
        while (prevMessage && !prevMessage.classList.contains('user')) {
            prevMessage = prevMessage.previousElementSibling;
        }

        if (!prevMessage) {
            new Notice('No user message found to regenerate response');
            return;
        }

        // Get the user's message content
        const userContent = (prevMessage as HTMLElement).dataset.rawContent;
        if (!userContent) {
            new Notice('Cannot regenerate response: no user message content found');
            return;
        }

        // Remove the current assistant message
        messageEl.remove();

        // Send the message again
        await this.sendMessage(userContent);
    }

    public async streamResponse(messageEl: HTMLElement, prompt: string): Promise<void> {
        const provider = createProvider(this.plugin.settings);
        const messages = await this.getMessageContext();
    
        let responseContent = '';
        try {
            await provider.getCompletion(messages, {
                temperature: this.plugin.settings.temperature,
                maxTokens: this.plugin.settings.maxTokens,
                streamCallback: async (chunk: string) => {
                    responseContent += chunk;
                    const contentEl = messageEl.querySelector('.message-content') as HTMLElement;
                    if (contentEl) {
                        messageEl.dataset.rawContent = responseContent;
                        contentEl.empty();
                        await MarkdownRenderer.render(this.app, responseContent, contentEl, '', this);
                        this.scrollToBottom();
                    }
                },
                abortController: this.activeStream || undefined
            });
        } catch (error) {
            if (error.name !== 'AbortError') {
                new Notice(`Error: ${error.message}`);
            }
        } finally {
            this.updateUIState(ChatUIState.IDLE);
        }
    }
}
