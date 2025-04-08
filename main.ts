import { App, Plugin, PluginSettingTab, Setting, WorkspaceLeaf, ItemView, Notice, TFile } from 'obsidian';
import { MyPluginSettings, Message, DEFAULT_SETTINGS } from './types';
import { createProvider } from './providers';

const VIEW_TYPE_MODEL_SETTINGS = 'model-settings-view';

/**
 * AI Model Settings View
 * 
 * This view provides a user interface for configuring AI model settings.
 * It allows users to:
 * - Select their preferred AI provider (OpenAI, Anthropic, Gemini, Ollama)
 * - Configure provider-specific settings like API keys and models
 * - Adjust common settings like temperature and token limits
 * - Test API connections and refresh available models
 */
class ModelSettingsView extends ItemView {
    plugin: MyPlugin;

    constructor(leaf: WorkspaceLeaf, plugin: MyPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType(): string {
        return VIEW_TYPE_MODEL_SETTINGS;
    }

    getDisplayText(): string {
        return 'AI Model Settings';
    }

    async onOpen() {
        const { contentEl } = this;
        contentEl.empty();

        contentEl.createEl('h2', { text: 'AI Model Settings' });

        // Common Settings Section
        contentEl.createEl('h3', { text: 'Common Settings' });

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
                        // Refresh view to show provider-specific settings
                        this.onOpen();
                    });
            });

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

        new Setting(contentEl)
            .setName('Include Date with System Message')
            .setDesc('Add the current date to the system message')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.includeDateWithSystemMessage)
                .onChange(async (value) => {
                    this.plugin.settings.includeDateWithSystemMessage = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(contentEl)
            .setName('Include Time with System Message')
            .setDesc('Add the current time along with the date to the system message')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.includeTimeWithSystemMessage)
                .onChange(async (value) => {
                    this.plugin.settings.includeTimeWithSystemMessage = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(contentEl)
            .setName('Enable Obsidian Links')
            .setDesc('Read Obsidian links in messages using [[filename]] syntax')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableObsidianLinks)
                .onChange(async (value) => {
                    this.plugin.settings.enableObsidianLinks = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(contentEl)
            .setName('Enable Context Notes')
            .setDesc('Attach specified note content to chat messages')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableContextNotes)
                .onChange(async (value) => {
                    this.plugin.settings.enableContextNotes = value;
                    await this.plugin.saveSettings();
                }));

        const contextNotesContainer = contentEl.createDiv('context-notes-container');
        contextNotesContainer.style.marginBottom = '24px';
        
        new Setting(contextNotesContainer)
            .setName('Context Notes')
            .setDesc('Notes to attach as context (supports [[filename]] and [[filename#header]] syntax)')
            .addTextArea(text => {
                text.setPlaceholder('[[Note Name]]\n[[Another Note#Header]]')
                    .setValue(this.plugin.settings.contextNotes || '')
                    .onChange(async (value) => {
                        this.plugin.settings.contextNotes = value;
                        await this.plugin.saveSettings();
                    });
                
                // Enable larger text area
                text.inputEl.rows = 4;
                text.inputEl.style.width = '100%';
                
                // Add autocomplete functionality
                this.setupNoteAutocomplete(text.inputEl);
            });

        new Setting(contentEl)
            .setName('Enable Streaming')
            .setDesc('Enable or disable streaming for completions')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableStreaming)
                .onChange(async (value) => {
                    this.plugin.settings.enableStreaming = value;
                    await this.plugin.saveSettings();
                }));

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

        // Provider-specific settings section
        contentEl.createEl('h3', { text: `${this.plugin.settings.provider.toUpperCase()} Settings` });

        switch (this.plugin.settings.provider) {
            case 'openai':
                this.renderOpenAISettings(contentEl);
                break;
            case 'anthropic':
                this.renderAnthropicSettings(contentEl);
                break;
            case 'gemini':
                this.renderGeminiSettings(contentEl);
                break;
            case 'ollama':
                this.renderOllamaSettings(contentEl);
                break;
        }
    }

    private renderOpenAISettings(containerEl: HTMLElement) {
        const settings = this.plugin.settings.openaiSettings;

        new Setting(containerEl)
            .setName('Test Connection')
            .setDesc('Verify your API key and fetch available models')
            .addButton(button => button
                .setButtonText('Test')
                .onClick(async () => {
                    button.setButtonText('Testing...');
                    button.setDisabled(true);

                    try {
                        const provider = createProvider(this.plugin.settings);
                        const result = await provider.testConnection();

                        if (result.success && result.models) {
                            settings.availableModels = result.models;
                            await this.plugin.saveSettings();
                            settings.lastTestResult = {
                                timestamp: Date.now(),
                                success: true,
                                message: result.message
                            };
                            new Notice(result.message);
                            this.onOpen(); // Refresh view
                        } else {
                            settings.lastTestResult = {
                                timestamp: Date.now(),
                                success: false,
                                message: result.message
                            };
                            new Notice(result.message);
                        }
                    } catch (error) {
                        new Notice(`Error: ${error.message}`);
                    } finally {
                        button.setButtonText('Test');
                        button.setDisabled(false);
                    }
                }));

        if (settings.lastTestResult) {
            const date = new Date(settings.lastTestResult.timestamp);
            containerEl.createEl('div', {
                text: `Last test: ${date.toLocaleString()} - ${settings.lastTestResult.message}`,
                cls: settings.lastTestResult.success ? 'success' : 'error'
            });
        }

        new Setting(containerEl)
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
    }

    private renderAnthropicSettings(containerEl: HTMLElement) {
        const settings = this.plugin.settings.anthropicSettings;

        new Setting(containerEl)
            .setName('Test Connection')
            .setDesc('Verify your API key and fetch available models')
            .addButton(button => button
                .setButtonText('Test')
                .onClick(async () => {
                    button.setButtonText('Testing...');
                    button.setDisabled(true);

                    try {
                        const provider = createProvider(this.plugin.settings);
                        const result = await provider.testConnection();

                        if (result.success && result.models) {
                            settings.availableModels = result.models;
                            await this.plugin.saveSettings();
                            settings.lastTestResult = {
                                timestamp: Date.now(),
                                success: true,
                                message: result.message
                            };
                            new Notice(result.message);
                            this.onOpen(); // Refresh view
                        } else {
                            settings.lastTestResult = {
                                timestamp: Date.now(),
                                success: false,
                                message: result.message
                            };
                            new Notice(result.message);
                        }
                    } catch (error) {
                        new Notice(`Error: ${error.message}`);
                    } finally {
                        button.setButtonText('Test');
                        button.setDisabled(false);
                    }
                }));

        if (settings.lastTestResult) {
            const date = new Date(settings.lastTestResult.timestamp);
            containerEl.createEl('div', {
                text: `Last test: ${date.toLocaleString()} - ${settings.lastTestResult.message}`,
                cls: settings.lastTestResult.success ? 'success' : 'error'
            });
        }

        new Setting(containerEl)
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
    }

    private renderGeminiSettings(containerEl: HTMLElement) {
        const settings = this.plugin.settings.geminiSettings;

        new Setting(containerEl)
            .setName('Test Connection')
            .setDesc('Verify your API key and fetch available models')
            .addButton(button => button
                .setButtonText('Test')
                .onClick(async () => {
                    button.setButtonText('Testing...');
                    button.setDisabled(true);

                    try {
                        const provider = createProvider(this.plugin.settings);
                        const result = await provider.testConnection();

                        if (result.success && result.models) {
                            settings.availableModels = result.models;
                            await this.plugin.saveSettings();
                            settings.lastTestResult = {
                                timestamp: Date.now(),
                                success: true,
                                message: result.message
                            };
                            new Notice(result.message);
                            this.onOpen(); // Refresh view
                        } else {
                            settings.lastTestResult = {
                                timestamp: Date.now(),
                                success: false,
                                message: result.message
                            };
                            new Notice(result.message);
                        }
                    } catch (error) {
                        new Notice(`Error: ${error.message}`);
                    } finally {
                        button.setButtonText('Test');
                        button.setDisabled(false);
                    }
                }));

        if (settings.lastTestResult) {
            const date = new Date(settings.lastTestResult.timestamp);
            containerEl.createEl('div', {
                text: `Last test: ${date.toLocaleString()} - ${settings.lastTestResult.message}`,
                cls: settings.lastTestResult.success ? 'success' : 'error'
            });
        }

        new Setting(containerEl)
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
    }

    private renderOllamaSettings(containerEl: HTMLElement) {
        const settings = this.plugin.settings.ollamaSettings;

        new Setting(containerEl)
            .setName('Test Connection')
            .setDesc('Check server connection and fetch available models')
            .addButton(button => button
                .setButtonText('Test')
                .onClick(async () => {
                    button.setButtonText('Testing...');
                    button.setDisabled(true);

                    try {
                        const provider = createProvider(this.plugin.settings);
                        const result = await provider.testConnection();

                        if (result.success && result.models) {
                            settings.availableModels = result.models;
                            await this.plugin.saveSettings();
                            settings.lastTestResult = {
                                timestamp: Date.now(),
                                success: true,
                                message: result.message
                            };
                            new Notice(result.message);
                            this.onOpen(); // Refresh view
                        } else {
                            settings.lastTestResult = {
                                timestamp: Date.now(),
                                success: false,
                                message: result.message
                            };
                            new Notice(result.message);
                        }
                    } catch (error) {
                        new Notice(`Error: ${error.message}`);
                    } finally {
                        button.setButtonText('Test');
                        button.setDisabled(false);
                    }
                }));

        if (settings.lastTestResult) {
            const date = new Date(settings.lastTestResult.timestamp);
            containerEl.createEl('div', {
                text: `Last test: ${date.toLocaleString()} - ${settings.lastTestResult.message}`,
                cls: settings.lastTestResult.success ? 'success' : 'error'
            });
        }

        new Setting(containerEl)
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

        // Add help text for Ollama setup
        containerEl.createEl('div', {
            cls: 'setting-item-description',
            text: 'To use Ollama:'
        });
        const steps = containerEl.createEl('ol');
        steps.createEl('li', { text: 'Install Ollama from https://ollama.ai' });
        steps.createEl('li', { text: 'Start the Ollama server' });
        steps.createEl('li', { text: 'Pull models using "ollama pull model-name"' });
        steps.createEl('li', { text: 'Test connection to see available models' });
    }

    async onClose() {
        // Clean up any resources if needed
    }

    /**
     * Setup autocompletion for notes and headers
     * 
     * @param inputEl The input element to attach autocompletion to
     */
    private setupNoteAutocomplete(inputEl: HTMLTextAreaElement) {
        // Current cursor position tracking
        let currentStartPos = 0;
        let currentEndPos = 0;
        
        // Track when the user is typing a link
        let isTypingLink = false;
        
        inputEl.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key === '[' && inputEl.selectionStart === inputEl.selectionEnd) {
                const prevChar = inputEl.value.charAt(inputEl.selectionStart - 1);
                if (prevChar === '[') {
                    isTypingLink = true;
                    currentStartPos = inputEl.selectionStart;
                }
            } else if (e.key === ']' && isTypingLink && inputEl.selectionStart === inputEl.selectionEnd) {
                const nextChar = inputEl.value.charAt(inputEl.selectionStart);
                if (nextChar === ']') {
                    isTypingLink = false;
                    currentEndPos = inputEl.selectionStart;
                    this.showNoteSuggestions(inputEl, currentStartPos, currentEndPos);
                }
            } else if (e.key === 'Escape' && isTypingLink) {
                isTypingLink = false;
                // Hide suggestions if there's a suggestion UI
            }
        });
    }
    
    /**
     * Display note and header suggestions
     * 
     * @param inputEl The input element
     * @param startPos The start position of the link text
     * @param endPos The end position of the link text
     */
    private showNoteSuggestions(inputEl: HTMLTextAreaElement, startPos: number, endPos: number) {
        // Get the text being typed inside [[ ]]
        const linkText = inputEl.value.substring(startPos, endPos);
        
        // Get all markdown files in the vault
        const files = this.app.vault.getMarkdownFiles();
        
        // Find files matching the link text
        const matchingFiles = files.filter(file => {
            // Check if the file path or name matches the link text
            return file.path.toLowerCase().includes(linkText.toLowerCase()) || 
                   file.basename.toLowerCase().includes(linkText.toLowerCase());
        });
        
        if (matchingFiles.length === 0) return;
        
        // Create suggestion element
        const suggestionEl = document.createElement('div');
        suggestionEl.className = 'note-autocomplete-suggestions';
        suggestionEl.style.position = 'absolute';
        suggestionEl.style.zIndex = '1000';
        suggestionEl.style.background = 'var(--background-primary)';
        suggestionEl.style.border = '1px solid var(--background-modifier-border)';
        suggestionEl.style.borderRadius = '4px';
        suggestionEl.style.boxShadow = '0 2px 8px var(--background-modifier-box-shadow)';
        suggestionEl.style.maxHeight = '200px';
        suggestionEl.style.overflow = 'auto';
        
        // Position the suggestion element
        const rect = inputEl.getBoundingClientRect();
        const lineHeight = parseInt(getComputedStyle(inputEl).lineHeight);
        const coords = this.getCaretCoordinates(inputEl, endPos);
        
        suggestionEl.style.left = `${rect.left + coords.left}px`;
        suggestionEl.style.top = `${rect.top + coords.top + lineHeight}px`;
        
        // Add matching files to suggestion element
        matchingFiles.slice(0, 10).forEach(file => {
            const item = document.createElement('div');
            item.className = 'note-autocomplete-item';
            item.textContent = file.basename;
            item.style.padding = '8px 12px';
            item.style.cursor = 'pointer';
            
            item.addEventListener('mouseenter', () => {
                item.style.backgroundColor = 'var(--background-secondary)';
            });
            
            item.addEventListener('mouseleave', () => {
                item.style.backgroundColor = '';
            });
            
            item.addEventListener('click', async () => {
                // Insert the selected file name
                const replacement = file.basename;
                const newValue = 
                    inputEl.value.substring(0, startPos - 2) + 
                    '[[' + replacement + ']]' + 
                    inputEl.value.substring(endPos + 2);
                
                inputEl.value = newValue;
                
                // Update plugin settings
                this.plugin.settings.contextNotes = inputEl.value;
                await this.plugin.saveSettings();
                
                // Remove suggestion element
                document.body.removeChild(suggestionEl);
                
                // Set cursor position after the inserted text
                const newPos = startPos - 2 + 2 + replacement.length + 2;
                inputEl.setSelectionRange(newPos, newPos);
                inputEl.focus();
            });
            
            suggestionEl.appendChild(item);
            
            // Add headers from the file if available
            this.addHeaderSuggestions(file, suggestionEl, startPos, endPos, inputEl);
        });
        
        // Add suggestion element to the DOM
        document.body.appendChild(suggestionEl);
        
        // Handle click outside to close suggestions
        const handleClickOutside = (e: MouseEvent) => {
            if (!suggestionEl.contains(e.target as Node) && e.target !== inputEl) {
                document.body.removeChild(suggestionEl);
                document.removeEventListener('click', handleClickOutside);
            }
        };
        
        document.addEventListener('click', handleClickOutside);
    }
    
    /**
     * Add header suggestions for a file
     * 
     * @param file The file to get headers from
     * @param suggestionEl The suggestion container element
     * @param startPos Start position in the input
     * @param endPos End position in the input
     * @param inputEl The input element
     */
    private async addHeaderSuggestions(
        file: TFile, 
        suggestionEl: HTMLElement, 
        startPos: number, 
        endPos: number, 
        inputEl: HTMLTextAreaElement
    ) {
        // Get file cache to extract headers
        const cache = this.app.metadataCache.getFileCache(file);
        if (!cache || !cache.headings) return;
        
        // Add a separator
        const separator = document.createElement('div');
        separator.style.height = '1px';
        separator.style.backgroundColor = 'var(--background-modifier-border)';
        separator.style.margin = '4px 0';
        suggestionEl.appendChild(separator);
        
        // Add headers as suggestions
        cache.headings.forEach(heading => {
            const item = document.createElement('div');
            item.className = 'note-autocomplete-item';
            
            // Indent based on heading level
            const indent = '&nbsp;'.repeat((heading.level - 1) * 2);
            item.innerHTML = `${indent}# ${heading.heading}`;
            
            item.style.padding = '6px 12px';
            item.style.cursor = 'pointer';
            
            item.addEventListener('mouseenter', () => {
                item.style.backgroundColor = 'var(--background-secondary)';
            });
            
            item.addEventListener('mouseleave', () => {
                item.style.backgroundColor = '';
            });
            
            item.addEventListener('click', async () => {
                // Insert the selected file name with heading
                const replacement = `${file.basename}#${heading.heading}`;
                const newValue = 
                    inputEl.value.substring(0, startPos - 2) + 
                    '[[' + replacement + ']]' + 
                    inputEl.value.substring(endPos + 2);
                
                inputEl.value = newValue;
                
                // Update plugin settings
                this.plugin.settings.contextNotes = inputEl.value;
                await this.plugin.saveSettings();
                
                // Remove suggestion element
                document.body.removeChild(suggestionEl);
                
                // Set cursor position after the inserted text
                const newPos = startPos - 2 + 2 + replacement.length + 2;
                inputEl.setSelectionRange(newPos, newPos);
                inputEl.focus();
            });
            
            suggestionEl.appendChild(item);
        });
    }
    
    /**
     * Get caret coordinates in a textarea
     * Simplified version to get approximate position
     */
    private getCaretCoordinates(element: HTMLTextAreaElement, position: number) {
        const text = element.value.substring(0, position);
        const lines = text.split('\n');
        const lineIndex = lines.length - 1;
        const charIndex = lines[lineIndex].length;
        
        // Approximate position based on character and line index
        const lineHeight = parseInt(getComputedStyle(element).lineHeight);
        const charWidth = 8; // Approximate character width
        
        return {
            top: lineIndex * lineHeight,
            left: charIndex * charWidth,
        };
    }
}

/**
 * Parses a given text selection into an array of message objects
 * 
 * The function interprets lines of text separated by '----' as boundaries
 * between user and assistant messages.
 * 
 * @param selection - The text selection to parse
 * @returns Array of message objects with roles and content
 */
function parseSelection(selection: string, chatSeparator: string): Message[] {
    const lines = selection.split('\n');
    let messages: Message[] = [];
    let currentRole: 'user' | 'assistant' = 'user';
    let currentContent = '';


    for (const line of lines) {
        if (line.trim() === chatSeparator) {
            // If we hit a separator, save the current message and switch roles
            if (currentContent.trim()) {
                messages.push({ role: currentRole, content: currentContent.trim() });
            }
            currentRole = currentRole === 'user' ? 'assistant' : 'user';
            currentContent = '';
        } else {
            currentContent += line + '\n';
        }
    }

    if (currentContent.trim()) {
        messages.push({ role: currentRole, content: currentContent.trim() });
    }

    return messages;
}

/**
 * AI Assistant Plugin
 * 
 * This plugin adds AI capabilities to Obsidian, supporting multiple providers:
 * - OpenAI (GPT-3.5, GPT-4)
 * - Anthropic (Claude)
 * - Google (Gemini)
 * - Ollama (Local AI)
 * 
 * Features:
 * - Chat with AI models
 * - Stream responses in real-time
 * - Configure model settings
 * - Test API connections
 * - Use local AI models through Ollama
 */
export default class MyPlugin extends Plugin {
    settings: MyPluginSettings;
    modelSettingsView: ModelSettingsView | null = null;
    activeStream: AbortController | null = null;

    async onload() {
        await this.loadSettings();

        this.addSettingTab(new MyPluginSettingTab(this.app, this));

        this.registerView(
            VIEW_TYPE_MODEL_SETTINGS,
            (leaf) => new ModelSettingsView(leaf, this)
        );

        this.addRibbonIcon('gear', 'Open AI Settings', () => {
            this.activateView();
        });

        this.app.workspace.onLayoutReady(() => {
            if (this.settings.autoOpenModelSettings) {
                this.activateView();
            }
        });

        this.addCommand({
            id: 'ai-completion',
            name: 'Get AI Completion',
            editorCallback: async (editor) => {
                let text;
                let insertPosition;

                if (editor.somethingSelected()) {
                    text = editor.getSelection();
                    insertPosition = editor.getCursor('to');
                } else {
                    const lineNumber = editor.getCursor().line;
                    const documentText = editor.getValue();
                    let startIndex = 0;
                    let endIndex = editor.posToOffset({ line: lineNumber, ch: editor.getLine(lineNumber).length });

                    if (this.settings.chatStartString) {
                        const startStringIndex = documentText.indexOf(this.settings.chatStartString);
                        if (startStringIndex !== -1) {
                            startIndex = startStringIndex + this.settings.chatStartString.length;
                        }
                    }

                    if (this.settings.chatEndString) {
                        const endStringIndex = documentText.indexOf(this.settings.chatEndString);
                        if (endStringIndex !== -1 && endStringIndex < endIndex) {
                            endIndex = endStringIndex;
                        }
                    }

                    text = documentText.substring(startIndex, endIndex);
                    insertPosition = { line: lineNumber + 1, ch: 0 };
                }

                const messages = parseSelection(text, this.settings.chatSeparator);

                editor.replaceRange(`\n\n${this.settings.chatSeparator}\n\n`, insertPosition);
                let currentPosition = {
                    line: insertPosition.line + 3,
                    ch: 0
                };

                this.activeStream = new AbortController();

                try {
                    const provider = createProvider(this.settings);
                    const processedMessages = await this.processMessages([
                        { role: 'system', content: this.getSystemMessage() },
                        ...messages
                    ]);
                    let bufferedChunk = ''; // Accumulate chunks
                    const flushBuffer = () => {
                        if (bufferedChunk) {
                            editor.replaceRange(bufferedChunk, currentPosition);
                            currentPosition = editor.offsetToPos(
                                editor.posToOffset(currentPosition) + bufferedChunk.length
                            );
                            bufferedChunk = ''; // Clear buffer
                        }
                    };

                    await provider.getCompletion(
                        processedMessages,
                        {
                            temperature: this.settings.temperature,
                            maxTokens: this.settings.maxTokens,
                            streamCallback: (chunk: string) => {
                                bufferedChunk += chunk; // Accumulate the chunk
                                // Flush buffer every 100ms
                                setTimeout(flushBuffer, 100);
                            },
                            abortController: this.activeStream
                        }
                    );

                    // Final flush after completion
                    flushBuffer();

                    editor.replaceRange(`\n\n${this.settings.chatSeparator}\n\n`, currentPosition);
                    const newCursorPos = editor.offsetToPos(
                        editor.posToOffset(currentPosition) + this.settings.chatSeparator.length + 4
                    );
                    editor.setCursor(newCursorPos);
                } catch (error) {
                    new Notice(`Error: ${error.message}`);
                    editor.replaceRange(`Error: ${error.message}\n\n${this.settings.chatSeparator}\n\n`, currentPosition);
                } finally {
                    this.activeStream = null;
                }
            }
        });

        this.addCommand({
            id: 'end-ai-stream',
            name: 'End AI Stream',
            callback: () => {
                if (this.activeStream) {
                    this.activeStream.abort();
                    this.activeStream = null;
                    new Notice('AI stream ended');
                } else {
                    new Notice('No active AI stream to end');
                }
            }
        });

        this.addCommand({
            id: 'show-ai-settings',
            name: 'Show AI Settings',
            callback: () => {
                this.activateView();
            }
        });
    }

    private getSystemMessage(): string {
        let systemMessage = this.settings.systemMessage;

        if (this.settings.includeDateWithSystemMessage) {
            const currentDate = new Date().toISOString().split('T')[0];
            systemMessage = `${systemMessage}\n\nThe current date is ${currentDate}.`;
        }

        if (this.settings.includeTimeWithSystemMessage) {
            const now = new Date();
            const timeZoneOffset = now.getTimezoneOffset();
            const offsetHours = Math.abs(timeZoneOffset) / 60;
            const offsetMinutes = Math.abs(timeZoneOffset) % 60;
            const sign = timeZoneOffset > 0 ? '-' : '+';

            const currentTime = now.toLocaleTimeString();
            const timeZoneString = `UTC${sign}${offsetHours.toString().padStart(2, '0')}:${offsetMinutes.toString().padStart(2, '0')}`;
            systemMessage = `${systemMessage}\n\nThe current time is ${currentTime} ${timeZoneString}.`;
        }

        return systemMessage;
    }

    async activateView() {
        this.app.workspace.detachLeavesOfType(VIEW_TYPE_MODEL_SETTINGS);

        let leaf = this.app.workspace.getRightLeaf(false);
        if (leaf) {
            await leaf.setViewState({
                type: VIEW_TYPE_MODEL_SETTINGS,
                active: true,
            });
            this.app.workspace.revealLeaf(leaf);
        } else {
            leaf = this.app.workspace.getLeaf(true);
            await leaf.setViewState({
                type: VIEW_TYPE_MODEL_SETTINGS,
                active: true,
            });
        }
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    /**
     * Processes a message content to include Obsidian note contents
     * 
     * If a link is found, retrieves the note content and appends it after the link.
     * 
     * @param content The message content to process
     * @returns The processed content with note contents included
     */
    /**
     * Process an array of messages to include Obsidian note contents
     * 
     * @param messages Array of messages to process
     * @returns Promise resolving to processed messages
     */
    private async processMessages(messages: Message[]): Promise<Message[]> {
        const processedMessages: Message[] = [];

        // Prepend context notes if enabled
        if (this.settings.enableContextNotes && this.settings.contextNotes) {
            const contextContent = await this.processContextNotes(this.settings.contextNotes);
            
            if (contextContent) {
                // Add context as part of the system message or as a separate system message
                if (messages.length > 0 && messages[0].role === 'system') {
                    processedMessages.push({
                        role: 'system',
                        content: `${messages[0].content}\n\nHere is additional context:\n${contextContent}`
                    });
                    messages = messages.slice(1);
                } else {
                    processedMessages.push({
                        role: 'system',
                        content: `Here is context for our conversation:\n${contextContent}`
                    });
                }
            }
        }

        // Process the rest of the messages with Obsidian links if enabled
        for (const message of messages) {
            const processedContent = await this.processObsidianLinks(message.content);
            processedMessages.push({
                role: message.role,
                content: processedContent
            });
        }

        return processedMessages;
    }

    /**
     * Process a single message content to include Obsidian note contents
     * 
     * @param content The message content to process
     * @returns Promise resolving to processed content
     */
    private async processObsidianLinks(content: string): Promise<string> {
        if (!this.settings.enableObsidianLinks) return content;

        const linkRegex = /\[\[(.*?)\]\]/g;
        let match;
        let processedContent = content;

        while ((match = linkRegex.exec(content)) !== null) {
            if (match && match[0] && match[1]) {
                // Split by pipe to handle [[path|display]] format
                const parts = match[1].split('|');
                const filePath = parts[0].trim(); // Get the path part (before pipe)
                const displayText = parts.length > 1 ? parts[1].trim() : filePath; // Get display text if present
                
                try {
                    // Attempt to retrieve the file by its relative path
                    let file = this.app.vault.getAbstractFileByPath(filePath) || this.app.vault.getAbstractFileByPath(`${filePath}.md`);

                    // If not found, search the entire vault for a matching file name
                    if (!file) {
                        const allFiles = this.app.vault.getFiles();
                        file = allFiles.find(f => f.name === filePath || f.name === `${filePath}.md` || 
                                                 f.path === filePath || f.path === `${filePath}.md`) || null;
                    }

                    // Extract header if specified
                    const headerMatch = filePath.match(/(.*?)#(.*)/);
                    let extractedContent = "";
                    
                    if (file && file instanceof TFile) {
                        const noteContent = await this.app.vault.cachedRead(file);
                        
                        if (headerMatch) {
                            // Extract content under the specified header
                            extractedContent = this.extractContentUnderHeader(
                                noteContent, 
                                headerMatch[2].trim()
                            );
                        } else {
                            extractedContent = noteContent;
                        }
                        
                        processedContent = processedContent.replace(
                            match[0],
                            `${match[0]}\n\n---\nNote Name: ${filePath}\nContent:\n${extractedContent}\n---\n`
                        );
                    } else {
                        new Notice(`File not found: ${filePath}. Ensure the file name and path are correct.`);
                    }
                } catch (error) {
                    new Notice(`Error processing link for ${filePath}: ${error.message}`);
                }
            }
        }
        return processedContent;
    }

    /**
     * Extract content under a specific header in a note
     * 
     * @param content The note content
     * @param headerText The header text to find
     * @returns The content under the header until the next header or end of note
     */
    private extractContentUnderHeader(content: string, headerText: string): string {
        const lines = content.split('\n');
        let foundHeader = false;
        let extractedContent = [];
        let headerLevel = 0;
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            
            // Check if this line is a header
            const headerMatch = line.match(/^(#+)\s+(.*?)$/);
            
            if (headerMatch) {
                const currentHeaderLevel = headerMatch[1].length;
                const currentHeaderText = headerMatch[2].trim();
                
                if (foundHeader) {
                    // If we already found our target header and now found another header
                    // at the same or higher level, stop extraction
                    if (currentHeaderLevel <= headerLevel) {
                        break;
                    }
                } else if (currentHeaderText.toLowerCase() === headerText.toLowerCase()) {
                    // Found our target header
                    foundHeader = true;
                    headerLevel = currentHeaderLevel;
                    extractedContent.push(line); // Include the header itself
                    continue;
                }
            }
            
            if (foundHeader) {
                extractedContent.push(line);
            }
        }
        
        return extractedContent.join('\n');
    }

    /**
     * Process context notes specified in the settings
     * 
     * @param contextNotesText The context notes text with [[note]] syntax
     * @returns The processed context text
     */
    private async processContextNotes(contextNotesText: string): Promise<string> {
        const linkRegex = /\[\[(.*?)\]\]/g;
        let match;
        let contextContent = "";
        
        while ((match = linkRegex.exec(contextNotesText)) !== null) {
            if (match && match[1]) {
                const fileName = match[1].trim();
                
                try {
                    // Check if there's a header specified
                    const headerMatch = fileName.match(/(.*?)#(.*)/);
                    const baseFileName = headerMatch ? headerMatch[1].trim() : fileName;
                    const headerName = headerMatch ? headerMatch[2].trim() : null;
                    
                    // Find the file
                    let file = this.app.vault.getAbstractFileByPath(baseFileName) || 
                               this.app.vault.getAbstractFileByPath(`${baseFileName}.md`);
                    
                    if (!file) {
                        const allFiles = this.app.vault.getFiles();
                        file = allFiles.find(f => 
                            f.basename.toLowerCase() === baseFileName.toLowerCase() || 
                            f.name.toLowerCase() === `${baseFileName.toLowerCase()}.md`
                        ) || null;
                    }
                    
                    if (file && file instanceof TFile) {
                        const noteContent = await this.app.vault.cachedRead(file);
                        
                        contextContent += `### From note: ${file.basename}\n\n`;
                        
                        if (headerName) {
                            // Extract content under the specified header
                            const headerContent = this.extractContentUnderHeader(noteContent, headerName);
                            contextContent += headerContent;
                        } else {
                            contextContent += noteContent;
                        }
                        
                        contextContent += '\n\n';
                    } else {
                        contextContent += `Note not found: ${fileName}\n\n`;
                    }
                } catch (error) {
                    contextContent += `Error processing note ${fileName}: ${error.message}\n\n`;
                }
            }
        }
        
        return contextContent;
    }
}

/**
 * Plugin Settings Tab
 * 
 * This tab provides a user interface for configuring the plugin settings.
 * It automatically opens the model settings view when settings are changed.
 */
class MyPluginSettingTab extends PluginSettingTab {
    plugin: MyPlugin;

    constructor(app: App, plugin: MyPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    /**
     * Display the settings tab
     * 
     * Shows only the auto-open setting here since all other settings
     * are managed in the model settings view for better organization.
     */
    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        containerEl.createEl('h2', { text: 'AI Assistant Settings' });

        // API Keys Section
        containerEl.createEl('h3', { text: 'API Keys' });

        // OpenAI API Key
        new Setting(containerEl)
            .setName('OpenAI API Key')
            .setDesc('Enter your OpenAI API key')
            .addText(text => text
                .setPlaceholder('Enter your API key')
                .setValue(this.plugin.settings.openaiSettings.apiKey)
                .onChange(async (value) => {
                    this.plugin.settings.openaiSettings.apiKey = value;
                    await this.plugin.saveSettings();
                }));

        // Anthropic API Key
        new Setting(containerEl)
            .setName('Anthropic API Key')
            .setDesc('Enter your Anthropic API key')
            .addText(text => text
                .setPlaceholder('Enter your API key')
                .setValue(this.plugin.settings.anthropicSettings.apiKey)
                .onChange(async (value) => {
                    this.plugin.settings.anthropicSettings.apiKey = value;
                    await this.plugin.saveSettings();
                }));

        // Gemini API Key
        new Setting(containerEl)
            .setName('Google API Key')
            .setDesc('Enter your Google API key')
            .addText(text => text
                .setPlaceholder('Enter your API key')
                .setValue(this.plugin.settings.geminiSettings.apiKey)
                .onChange(async (value) => {
                    this.plugin.settings.geminiSettings.apiKey = value;
                    await this.plugin.saveSettings();
                }));

        // Ollama Server URL
        new Setting(containerEl)
            .setName('Ollama Server URL')
            .setDesc('Enter your Ollama server URL (default: http://localhost:11434)')
            .addText(text => text
                .setPlaceholder('http://localhost:11434')
                .setValue(this.plugin.settings.ollamaSettings.serverUrl)
                .onChange(async (value) => {
                    this.plugin.settings.ollamaSettings.serverUrl = value;
                    await this.plugin.saveSettings();
                }));

        // Model Settings Section
        containerEl.createEl('h3', { text: 'Model Settings' });

        new Setting(containerEl)
            .setName('Auto-open Model Settings')
            .setDesc('Automatically open model settings when Obsidian starts')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.autoOpenModelSettings)
                .onChange(async (value) => {
                    this.plugin.settings.autoOpenModelSettings = value;
                    await this.plugin.saveSettings();
                }));

        // Add a button to open model settings
        new Setting(containerEl)
            .setName('Open Model Settings')
            .setDesc('Open the model settings view')
            .addButton(button => button
                .setButtonText('Open')
                .onClick(() => {
                    this.plugin.activateView();
                }));

        new Setting(containerEl)
            .setName('Chat Separator')
            .setDesc('The string used to separate chat messages.')
            .addText(text => {
                text.setPlaceholder('----')
                    .setValue(this.plugin.settings.chatSeparator ?? '')
                    .onChange(async (value: string) => {
                        this.plugin.settings.chatSeparator = value;
                        await this.plugin.saveSettings();
                    });
            });

        new Setting(containerEl)
            .setName('Chat Start String')
            .setDesc('The string that indicates where to start taking the note for context.')
            .addText(text => {
                text.setPlaceholder('===START===')
                    .setValue(this.plugin.settings.chatStartString ?? '')
                    .onChange(async (value: string) => {
                        this.plugin.settings.chatStartString = value;
                        await this.plugin.saveSettings();
                    });
            });

        new Setting(containerEl)
            .setName('Chat End String')
            .setDesc('The string that indicates where to end taking the note for context.')
            .addText(text => {
                text.setPlaceholder('===END===')
                    .setValue(this.plugin.settings.chatEndString ?? '')
                    .onChange(async (value: string) => {
                        this.plugin.settings.chatEndString = value;
                        await this.plugin.saveSettings();
                    });
            });
    }
}
