import { App, Plugin, Setting, WorkspaceLeaf, ItemView, Notice, TFile } from 'obsidian';
import { MyPluginSettings, Message, DEFAULT_SETTINGS } from './types';
import { createProvider } from './providers';
import { MyPluginSettingTab } from './settings';
import { ChatView, VIEW_TYPE_CHAT } from './chat';
import { parseSelection } from './parseSelection';

const VIEW_TYPE_MODEL_SETTINGS = 'model-settings-view';

/**
 * Creates a debounced version of a function that delays invoking func until after wait milliseconds
 * have elapsed since the last time the debounced function was invoked.
 * 
 * @param func The function to debounce
 * @param wait The number of milliseconds to delay
 */
function debounce<T extends (...args: any[]) => any>(func: T, wait: number): (...args: Parameters<T>) => void {
    let timeout: NodeJS.Timeout;
    return (...args: Parameters<T>) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => func(...args), wait);
    };
}

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

    private renderProviderSettings(containerEl: HTMLElement, settings: any, providerName: string, testConnectionCallback: () => Promise<void>) {
        new Setting(containerEl)
            .setName('Test Connection')
            .setDesc(`Verify your API key and fetch available models for ${providerName}`)
            .addButton(button => button
                .setButtonText('Test')
                .onClick(async () => {
                    button.setButtonText('Testing...');
                    button.setDisabled(true);

                    try {
                        await testConnectionCallback();
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
            .setDesc(`Choose the ${providerName} model to use`)
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

    private renderOpenAISettings(containerEl: HTMLElement) {
        this.renderProviderSettings(containerEl, this.plugin.settings.openaiSettings, 'OpenAI', async () => {
            const provider = createProvider(this.plugin.settings);
            const result = await provider.testConnection();

            if (result.success && result.models) {
                this.plugin.settings.openaiSettings.availableModels = result.models;
                await this.plugin.saveSettings();
                this.plugin.settings.openaiSettings.lastTestResult = {
                    timestamp: Date.now(),
                    success: true,
                    message: result.message
                };
                new Notice(result.message);
                this.onOpen(); // Refresh view
            } else {
                this.plugin.settings.openaiSettings.lastTestResult = {
                    timestamp: Date.now(),
                    success: false,
                    message: result.message
                };
                new Notice(result.message);
            }
        });
    }

    private renderAnthropicSettings(containerEl: HTMLElement) {
        this.renderProviderSettings(containerEl, this.plugin.settings.anthropicSettings, 'Anthropic', async () => {
            const provider = createProvider(this.plugin.settings);
            const result = await provider.testConnection();

            if (result.success && result.models) {
                this.plugin.settings.anthropicSettings.availableModels = result.models;
                await this.plugin.saveSettings();
                this.plugin.settings.anthropicSettings.lastTestResult = {
                    timestamp: Date.now(),
                    success: true,
                    message: result.message
                };
                new Notice(result.message);
                this.onOpen(); // Refresh view
            } else {
                this.plugin.settings.anthropicSettings.lastTestResult = {
                    timestamp: Date.now(),
                    success: false,
                    message: result.message
                };
                new Notice(result.message);
            }
        });
    }

    private renderGeminiSettings(containerEl: HTMLElement) {
        this.renderProviderSettings(containerEl, this.plugin.settings.geminiSettings, 'Gemini', async () => {
            const provider = createProvider(this.plugin.settings);
            const result = await provider.testConnection();

            if (result.success && result.models) {
                this.plugin.settings.geminiSettings.availableModels = result.models;
                await this.plugin.saveSettings();
                this.plugin.settings.geminiSettings.lastTestResult = {
                    timestamp: Date.now(),
                    success: true,
                    message: result.message
                };
                new Notice(result.message);
                this.onOpen(); // Refresh view
            } else {
                this.plugin.settings.geminiSettings.lastTestResult = {
                    timestamp: Date.now(),
                    success: false,
                    message: result.message
                };
                new Notice(result.message);
            }
        });
    }

    private renderOllamaSettings(containerEl: HTMLElement) {
        this.renderProviderSettings(containerEl, this.plugin.settings.ollamaSettings, 'Ollama', async () => {
            const provider = createProvider(this.plugin.settings);
            const result = await provider.testConnection();

            if (result.success && result.models) {
                this.plugin.settings.ollamaSettings.availableModels = result.models;
                await this.plugin.saveSettings();
                this.plugin.settings.ollamaSettings.lastTestResult = {
                    timestamp: Date.now(),
                    success: true,
                    message: result.message
                };
                new Notice(result.message);
                this.onOpen(); // Refresh view
            } else {
                this.plugin.settings.ollamaSettings.lastTestResult = {
                    timestamp: Date.now(),
                    success: false,
                    message: result.message
                };
                new Notice(result.message);
            }
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
        let suggestionEl: HTMLElement | null = null;
        
        const cleanupSuggestions = () => {
            if (suggestionEl && document.body.contains(suggestionEl)) {
                document.body.removeChild(suggestionEl);
                suggestionEl = null;
            }
        };
        
        // Handle link detection with manual input tracking
        inputEl.addEventListener('input', (e) => {
            const cursorPos = inputEl.selectionStart;
            const text = inputEl.value;
            
            // Check if we're potentially inside a link
            const beforeCursor = text.substring(0, cursorPos);
            const lastOpenBrackets = beforeCursor.lastIndexOf("[[");
            const lastCloseBrackets = beforeCursor.lastIndexOf("]]");
            
            // If we have open brackets after the last close brackets
            if (lastOpenBrackets > lastCloseBrackets && lastOpenBrackets !== -1) {
                isTypingLink = true;
                currentStartPos = lastOpenBrackets + 2; // Start after the [[
                
                // Check if we have matching ]] ahead
                const afterCursor = text.substring(cursorPos);
                const nextCloseBrackets = afterCursor.indexOf("]]");
                
                if (nextCloseBrackets !== -1) {
                    currentEndPos = cursorPos;
                    // Get the text being typed inside [[ ]]
                    const linkText = text.substring(currentStartPos, currentEndPos);
                    
                    // Show suggestions if we have at least 1 character typed
                    if (linkText.length > 0) {
                        // Clean up previous suggestions
                        cleanupSuggestions();
                        this.showNoteSuggestions(inputEl, currentStartPos, currentEndPos);
                    }
                }
            } else {
                isTypingLink = false;
                cleanupSuggestions();
            }
        });
        
        // Close suggestions on Escape key
        inputEl.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                isTypingLink = false;
                cleanupSuggestions();
            }
        });
        
        // Close suggestions when clicking outside or focusing elsewhere
        document.addEventListener('click', (e) => {
            if (e.target !== inputEl && suggestionEl && !suggestionEl.contains(e.target as Node)) {
                cleanupSuggestions();
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
        
        if (linkText.length === 0) return;
        
        // Get all markdown files in the vault
        const files = this.app.vault.getMarkdownFiles();
        
        // Find files matching the link text
        const matchingFiles = files.filter(file => {
            return file.basename.toLowerCase().includes(linkText.toLowerCase()) || 
                   file.path.toLowerCase().includes(linkText.toLowerCase());
        });
        
        if (matchingFiles.length === 0) return;
        
        // Create suggestion element
        const suggestionEl = document.createElement('div');
        suggestionEl.className = 'note-autocomplete-suggestions';
        suggestionEl.style.position = 'fixed'; // Use fixed positioning
        suggestionEl.style.zIndex = '1000';
        suggestionEl.style.background = 'var(--background-primary)';
        suggestionEl.style.border = '1px solid var(--background-modifier-border)';
        suggestionEl.style.borderRadius = '4px';
        suggestionEl.style.boxShadow = '0 2px 8px var(--background-modifier-box-shadow)';
        suggestionEl.style.maxHeight = '200px';
        suggestionEl.style.width = '300px'; // Fixed width for better visibility
        suggestionEl.style.overflow = 'auto';
        suggestionEl.style.padding = '8px';
        
        // Debug information at the top
        const debugInfo = document.createElement('div');
        debugInfo.style.fontSize = '10px';
        debugInfo.style.color = 'var(--text-muted)';
        debugInfo.style.marginBottom = '4px';
        debugInfo.style.borderBottom = '1px solid var(--background-modifier-border)';
        debugInfo.textContent = `Searching for: "${linkText}" - Found ${matchingFiles.length} matches`;
        suggestionEl.appendChild(debugInfo);
        
        // Position the element based on input coordinates
        const rect = inputEl.getBoundingClientRect();
        const lineHeight = parseInt(getComputedStyle(inputEl).lineHeight) || 20;
        
        // Get text up to cursor position to calculate vertical position
        const textUpToCursor = inputEl.value.substring(0, endPos);
        const lines = textUpToCursor.split('\n');
        const lineNumber = lines.length - 1;
        
        // Position below the line where cursor is
        suggestionEl.style.left = `${rect.left}px`;
        suggestionEl.style.top = `${rect.top + (lineNumber + 1) * lineHeight}px`;
        
        // Add matching files to suggestion element
        matchingFiles.slice(0, 10).forEach(file => {
            const item = document.createElement('div');
            item.className = 'note-autocomplete-item';
            item.textContent = file.basename;
            item.style.padding = '8px 12px';
            item.style.cursor = 'pointer';
            item.style.borderRadius = '4px';
            
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
        if (!cache || !cache.headings || cache.headings.length === 0) return;
        
        // Add a separator
        const separator = document.createElement('div');
        separator.style.height = '1px';
        separator.style.backgroundColor = 'var(--background-modifier-border)';
        separator.style.margin = '4px 0';
        suggestionEl.appendChild(separator);
        
        // Add a label for headers
        const headerLabel = document.createElement('div');
        headerLabel.style.fontSize = '10px';
        headerLabel.style.color = 'var(--text-muted)';
        headerLabel.style.padding = '2px 12px';
        headerLabel.textContent = 'Headers:';
        suggestionEl.appendChild(headerLabel);
        
        // Add headers as suggestions
        cache.headings.forEach(heading => {
            const item = document.createElement('div');
            item.className = 'note-autocomplete-item';
            
            // Indent based on heading level
            const indent = '&nbsp;'.repeat((heading.level - 1) * 2);
            item.innerHTML = `${indent}# ${heading.heading}`;
            
            item.style.padding = '6px 12px';
            item.style.cursor = 'pointer';
            item.style.borderRadius = '4px';
            
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

        // Register views
        this.registerView(
            VIEW_TYPE_MODEL_SETTINGS,
            (leaf) => new ModelSettingsView(leaf, this)
        );

        this.registerView(
            VIEW_TYPE_CHAT,
            (leaf) => new ChatView(leaf, this)
        );

        // Add ribbon icons
        this.addRibbonIcon('gear', 'Open AI Settings', () => {
            this.activateView();
        });

        this.addRibbonIcon('message-square', 'Open AI Chat', () => {
            this.activateChatView();
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
                let text: string;
                let insertPosition;

                if (editor.somethingSelected()) {
                    // Use the selected text
                    text = editor.getSelection();
                    insertPosition = editor.getCursor('to');
                } else {
                    // Fallback to extracting text up to the current cursor line
                    const lineNumber = editor.getCursor().line + 1;
                    const documentText = editor.getValue();
                    let startIndex = 0;
                    let endIndex = editor.posToOffset({
                        line: lineNumber,
                        ch: editor.getLine(lineNumber).length // Include the full cursor line
                    });

                    // Use chatStartString and chatEndString if defined
                    if (this.settings.chatStartString) {
                        const startStringIndex = documentText.indexOf(this.settings.chatStartString);
                        if (startStringIndex !== -1) {
                            startIndex = startStringIndex + this.settings.chatStartString.length;
                        }
                    }

                    if (this.settings.chatEndString) {
                        const endStringIndex = documentText.indexOf(this.settings.chatEndString, startIndex);
                        if (endStringIndex !== -1 && endStringIndex < endIndex) {
                            endIndex = endStringIndex;
                        }
                    }

                    // If no chatStartString or chatEndString is found, use the entire document up to the cursor line
                    if (!this.settings.chatStartString && !this.settings.chatEndString) {
                        endIndex = editor.posToOffset({ line: lineNumber, ch: 0 });
                    }

                    text = documentText.substring(startIndex, endIndex).trim();
                    insertPosition = { line: lineNumber + 1, ch: 0 };
                }

                // Debugging: Log the extracted text
                console.log('Extracted text for completion:', text);

                // Parse the selection into messages
                const messages = parseSelection(text, this.settings.chatSeparator);

                // Ensure there are messages to send
                if (messages.length === 0) {
                    new Notice('No valid messages found in the selection.');
                    return;
                }

                // Insert a separator for the AI's response
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

        this.addCommand({
            id: 'show-ai-chat',
            name: 'Show AI Chat',
            callback: () => {
                this.activateChatView();
            }
        });
    }

    public getSystemMessage(): string {
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

    async activateView(viewType: string = VIEW_TYPE_MODEL_SETTINGS) {
        this.app.workspace.detachLeavesOfType(viewType);

        let leaf = this.app.workspace.getRightLeaf(false);
        if (leaf) {
            await leaf.setViewState({
                type: viewType,
                active: true,
            });
            this.app.workspace.revealLeaf(leaf);
        } else {
            leaf = this.app.workspace.getLeaf(true);
            await leaf.setViewState({
                type: viewType,
                active: true,
            });
        }
    }

    async activateChatView() {
        await this.activateView(VIEW_TYPE_CHAT);
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
                                                 f.basename.toLowerCase() === filePath.toLowerCase() ||
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
