import { ItemView, WorkspaceLeaf, Notice, Modal, App, Setting, MarkdownRenderer } from 'obsidian';
import MyPlugin from './main';
import { Message } from './types';
import { createProvider } from './providers';

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
                    .addOption('openai', 'OpenAI (GPT-3.5, GPT-4)')
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

export class ChatView extends ItemView {
    plugin: MyPlugin;
    messagesContainer: HTMLElement;
    inputContainer: HTMLElement;
    activeStream: AbortController | null = null;

    constructor(leaf: WorkspaceLeaf, plugin: MyPlugin) {
        super(leaf);
        this.plugin = plugin;
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

    private settingsContainer: HTMLElement | null = null;

    async onOpen() {
        const { contentEl } = this;
        contentEl.empty();

        // Create main container with flex layout
        contentEl.addClass('ai-chat-view');

        // Create settings button in the button container (will be added later)
        const settingsButton = document.createElement('button');
        settingsButton.setText('Settings');
        settingsButton.setAttribute('aria-label', 'Toggle model settings');
        
        // We'll add this button to the button container later
        
        // Messages container
        this.messagesContainer = contentEl.createDiv('ai-chat-messages');
        this.messagesContainer.style.flex = '1';
        this.messagesContainer.style.overflow = 'auto';
        this.messagesContainer.style.padding = '16px';

        // Input container at bottom
        this.inputContainer = contentEl.createDiv('ai-chat-input-container');
        this.inputContainer.style.borderTop = '1px solid var(--background-modifier-border)';
        this.inputContainer.style.padding = '16px';

        // Textarea for input
        const textarea = this.inputContainer.createEl('textarea', {
            cls: 'ai-chat-input',
            attr: {
                placeholder: 'Type your message...',
                rows: '3'
            }
        });

        // Style the textarea
        textarea.style.width = '100%';
        textarea.style.resize = 'none';
        textarea.style.border = '1px solid var(--background-modifier-border)';
        textarea.style.borderRadius = '4px';
        textarea.style.padding = '8px';
        textarea.style.backgroundColor = 'var(--background-primary)';
        textarea.style.color = 'var(--text-normal)';

        // Button container
        const buttonContainer = this.inputContainer.createDiv('ai-chat-buttons');
        buttonContainer.style.marginTop = '8px';
        buttonContainer.style.display = 'flex';
        buttonContainer.style.gap = '8px';
        buttonContainer.style.justifyContent = 'flex-end';

        // Send button
        const sendButton = buttonContainer.createEl('button', {
            text: 'Send',
            cls: 'mod-cta'
        });

        // Stop button (hidden initially)
        const stopButton = buttonContainer.createEl('button', {
            text: 'Stop',
        });
        stopButton.style.display = 'none';

        // Copy All button
        const copyAllButton = buttonContainer.createEl('button', {
            text: 'Copy All'
        });
        copyAllButton.addEventListener('click', async () => {
            const messages = this.messagesContainer.querySelectorAll('.ai-chat-message');
            let chatContent = '';
            messages.forEach((el, index) => {
                const content = el.querySelector('.message-content')?.textContent || '';
                chatContent += content;
                if (index < messages.length - 1) {
                    chatContent += '\n\n' + this.plugin.settings.chatSeparator + '\n\n';
                }
            });
            await this.copyToClipboard(chatContent);
        });

        // Clear button
        const clearButton = buttonContainer.createEl('button', {
            text: 'Clear Chat'
        });

        // Handle send message
        const sendMessage = async () => {
            const content = textarea.value.trim();
            if (!content) return;

            // Disable input and show stop button
            textarea.disabled = true;
            sendButton.style.display = 'none';
            stopButton.style.display = 'block';

            // Add user message
            this.addMessage('user', content);
            textarea.value = '';

            // Create abort controller for streaming
            this.activeStream = new AbortController();

            try {
                const provider = createProvider(this.plugin.settings);
                const messages: Message[] = [
                    { role: 'system', content: this.plugin.getSystemMessage() }
                ];

                // Include the current note's content if the toggle is enabled
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

                // Get all existing messages
                const messageElements = this.messagesContainer.querySelectorAll('.ai-chat-message');
                messageElements.forEach(el => {
                    const role = el.classList.contains('user') ? 'user' : 'assistant';
                    const content = el.querySelector('.message-content')?.textContent || '';
                    messages.push({ role, content });
                });

                // Create assistant message container for streaming
                const assistantContainer = this.createMessageElement('assistant', '');
                this.messagesContainer.appendChild(assistantContainer);
                this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;

                let responseContent = '';
                await provider.getCompletion(
                    messages,
                    {
                        temperature: this.plugin.settings.temperature,
                        maxTokens: this.plugin.settings.maxTokens,
                        streamCallback: async (chunk: string) => {
                            responseContent += chunk;
                            const contentEl = assistantContainer.querySelector('.message-content') as HTMLElement;
                            if (contentEl) {
                                // Update the data attribute with the current content
                                assistantContainer.dataset.rawContent = responseContent;
                                
                                // Render Markdown content dynamically
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
                        abortController: this.activeStream
                    }
                );
            } catch (error) {
                if (error.name !== 'AbortError') {
                    new Notice(`Error: ${error.message}`);
                    this.addMessage('assistant', `Error: ${error.message}`);
                }
            } finally {
                // Re-enable input and hide stop button
                textarea.disabled = false;
                textarea.focus();
                stopButton.style.display = 'none';
                sendButton.style.display = 'block';
                this.activeStream = null;
            }
        };

        // Event listeners
        textarea.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });

        sendButton.addEventListener('click', sendMessage);

        stopButton.addEventListener('click', () => {
            if (this.activeStream) {
                this.activeStream.abort();
                this.activeStream = null;
                textarea.disabled = false;
                textarea.focus();
                stopButton.style.display = 'none';
                sendButton.style.display = 'block';
            }
        });

        clearButton.addEventListener('click', () => {
            this.messagesContainer.empty();
        });

        // Add settings button to the button container
        buttonContainer.insertBefore(settingsButton, clearButton);
        
        // Settings button click handler
        settingsButton.addEventListener('click', () => {
            const settingsModal = new SettingsModal(this.app, this.plugin);
            settingsModal.open();
        });

        // Add initial system message
        this.addMessage('assistant', 'Hello! How can I help you today?');
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

    private createMessageElement(role: 'user' | 'assistant', content: string): HTMLElement {
        const messageEl = document.createElement('div');
        messageEl.addClass('ai-chat-message', role);
        messageEl.style.marginBottom = '16px';
        messageEl.style.padding = '12px';
        messageEl.style.borderRadius = '8px';
        messageEl.style.backgroundColor = role === 'user' 
            ? 'var(--background-modifier-hover)'
            : 'var(--background-secondary)';

        // Create message container with content and actions
        const messageContainer = messageEl.createDiv('message-container');

        // Create content element
        const contentEl = messageContainer.createDiv('message-content');
        contentEl.style.whiteSpace = 'pre-wrap';
        
        // Store the raw Markdown content as a data attribute
        messageEl.dataset.rawContent = content;

        // Render Markdown content
        MarkdownRenderer.render(
            this.app,
            content,
            contentEl,
            '',
            this
        ).catch((error) => {
            console.error('Markdown rendering error:', error);
            contentEl.textContent = content;
        });

        // Create actions container
        const actionsEl = messageContainer.createDiv('message-actions');
        actionsEl.style.display = 'none';

        // Add hover behavior to the message element
        messageEl.addEventListener('mouseenter', () => {
            actionsEl.style.display = 'flex';
        });
        messageEl.addEventListener('mouseleave', () => {
            actionsEl.style.display = 'none';
        });

        actionsEl.style.flexWrap = 'wrap';
        actionsEl.style.gap = '8px';
        actionsEl.style.marginTop = '8px';

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
            const wasEditing = contentEl.hasClass('editing');
            
            if (!wasEditing) {
                // Switch to edit mode
                const textarea = document.createElement('textarea');
                textarea.value = messageEl.dataset.rawContent || '';
                textarea.style.width = '100%';
                textarea.style.height = `${contentEl.offsetHeight}px`;
                textarea.style.minHeight = '100px';
                contentEl.empty();
                contentEl.appendChild(textarea);
                textarea.focus();
                contentEl.addClass('editing');
            } else {
                // Save edits
                const textarea = contentEl.querySelector('textarea');
                if (textarea) {
                    // Update the data attribute with the new content
                    messageEl.dataset.rawContent = textarea.value;
                    contentEl.empty();
                    MarkdownRenderer.render(this.app, textarea.value, contentEl, '', this).catch((error) => {
                        console.error('Markdown rendering error:', error);
                        contentEl.textContent = textarea.value;
                    });
                    contentEl.removeClass('editing');
                }
            }
        }));

        // Add delete button
        actionsEl.appendChild(this.createActionButton('trash', 'Delete', 'Delete message', () => {
            const modal = new ConfirmationModal(
                this.app,
                'Delete message',
                'Are you sure you want to delete this message?',
                async (confirmed) => {
                    if (confirmed) {
                        messageEl.remove();
                    }
                }
            );
            modal.open();
        }));

        // Add refresh button for assistant messages
        if (role === 'assistant') {
            actionsEl.appendChild(this.createActionButton('refresh-cw', 'Regenerate', 'Regenerate response', async () => {
                // Find this message element
                const currentMessage = messageEl;
                
                // Disable input during regeneration
                const textarea = this.inputContainer.querySelector('textarea');
                if (textarea) textarea.disabled = true;
                
                // Find all previous messages to maintain context
                const allMessages = Array.from(this.messagesContainer.querySelectorAll('.ai-chat-message'));
                const currentIndex = allMessages.indexOf(currentMessage);
                
                // Get system message and all previous messages up to current
                const messages: Message[] = [
                    { role: 'system', content: this.plugin.getSystemMessage() }
                ];
                
                for (let i = 0; i < currentIndex; i++) {
                    const el = allMessages[i];
                    const role = el.classList.contains('user') ? 'user' : 'assistant';
                    const content = (el as HTMLElement).dataset.rawContent || '';
                    messages.push({ role, content });
                }
                
                // Remove the current response
                currentMessage.remove();
                
                // Create new assistant message for streaming
                const assistantContainer = this.createMessageElement('assistant', '');
                this.messagesContainer.appendChild(assistantContainer);
                this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
                
                // Create abort controller for streaming
                this.activeStream = new AbortController();
                
                try {
                    const provider = createProvider(this.plugin.settings);
                    let responseContent = '';
                    await provider.getCompletion(
                        messages,
                        {
                            temperature: this.plugin.settings.temperature,
                            maxTokens: this.plugin.settings.maxTokens,
                            streamCallback: async (chunk: string) => {
                                responseContent += chunk;
                                const contentEl = assistantContainer.querySelector('.message-content') as HTMLElement;
                                if (contentEl) {
                                    // Update the data attribute with the current content
                                    assistantContainer.dataset.rawContent = responseContent;
                                    
                                    // Render Markdown content dynamically
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
                            abortController: this.activeStream
                        }
                    );
                } catch (error) {
                    if (error.name !== 'AbortError') {
                        new Notice(`Error: ${error.message}`);
                        this.addMessage('assistant', `Error: ${error.message}`);
                    }
                } finally {
                    // Re-enable input
                    if (textarea) {
                        textarea.disabled = false;
                        textarea.focus();
                    }
                    this.activeStream = null;
                }
            }));
        }

        // Append actions container to message container
        messageContainer.appendChild(actionsEl);

        return messageEl;
    }

    private addMessage(role: 'user' | 'assistant', content: string) {
        const messageEl = this.createMessageElement(role, content);
        this.messagesContainer.appendChild(messageEl);
        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    }

    async onClose() {
        if (this.activeStream) {
            this.activeStream.abort();
            this.activeStream = null;
        }
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
        providerSelect.createEl('option', { value: 'openai', text: 'OpenAI (GPT-3.5, GPT-4)' });
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
}
