import { App, WorkspaceLeaf, ItemView, Setting, Notice, TFile } from 'obsidian';
import MyPlugin from './main'; // Import MyPlugin
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
export class ModelSettingsView extends ItemView {
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

    getIcon(): string {
        return 'file-sliders';
    }

    async onOpen() {
        const { contentEl } = this;
        contentEl.empty();

        // Settings Section
        contentEl.createEl('h2', { text: 'AI Model Settings' });

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
        // Date Settings Section
        contentEl.createEl('h4', { text: 'Date Settings' });

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
        // Note Reference Settings Section
        contentEl.createEl('h4', { text: 'Note Reference Settings' });
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

        // Provider-specific settings section
        contentEl.createEl('h2', { text: 'Provider Settings' });
        new Setting(contentEl)
            .setName('AI Provider')
            .setDesc('Choose which AI provider to use')
            .addDropdown(dropdown => {
                dropdown
                    .addOption('openai', 'OpenAI (ChatGPT)')
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