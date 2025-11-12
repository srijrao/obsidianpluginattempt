import { Setting, Notice } from 'obsidian';
import MyPlugin from '../../main';
import { AIDispatcher } from '../../utils/aiDispatcher';
import { ModelService } from '../../services/ModelService';

/**
 * SettingsSections provides methods to render different categories of plugin settings.
 * This class is used by settings modals and potentially other views to ensure consistent UI.
 */
export class SettingsSections {
    private plugin: MyPlugin;

    /**
     * @param plugin The plugin instance (for accessing/saving settings).
     */
    constructor(plugin: MyPlugin) {
        this.plugin = plugin;
    }

    /**
     * Date Settings Section.
     * Includes options for including date and time in the system message.
     * @param containerEl The HTML element to render the section into.
     */
    renderDateSettings(containerEl: HTMLElement): void {
        new Setting(containerEl)
            .setName('Include Time with System Message')
            .setDesc('Add the current time along with the date to the system message')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.includeTimeWithSystemMessage)
                .onChange(async (value) => {
                    this.plugin.settings.includeTimeWithSystemMessage = value;
                    await this.plugin.saveSettings();
                }));
    }

    /**
     * Note Reference Settings Section.
     * Includes options for Obsidian links, context notes, and recursive link expansion.
     * @param containerEl The HTML element to render the section into.
     */
    renderNoteReferenceSettings(containerEl: HTMLElement): void {
        new Setting(containerEl)
            .setName('Enable Obsidian Links')
            .setDesc('Read Obsidian links in messages using [[filename]] syntax')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableObsidianLinks)
                .onChange(async (value) => {
                    this.plugin.settings.enableObsidianLinks = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Enable Context Notes')
            .setDesc('Attach specified note content to chat messages')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableContextNotes)
                .onChange(async (value) => {
                    this.plugin.settings.enableContextNotes = value;
                    await this.plugin.saveSettings();
                }));

        const contextNotesContainer = containerEl.createDiv('context-notes-container');
        contextNotesContainer.style.marginBottom = '24px';

        new Setting(contextNotesContainer)
            .setName('Context Notes')
            .setDesc('Notes to attach as context (supports [[filename]] and [[filename#header]] syntax)')
            .addTextArea(text => {
                text.setPlaceholder('[[Note Name]]\n[[Another Note#Header]]')
                    .setValue(this.plugin.settings.contextNotes || '')
                    .onChange((value) => {
                        // Update setting value immediately on change
                        this.plugin.settings.contextNotes = value;
                    });
                // Save settings on blur
                text.inputEl.addEventListener('blur', async () => {
                    await this.plugin.saveSettings();
                });
                // Style textarea
                text.inputEl.rows = 4;
                text.inputEl.style.width = '100%';
                return text;
            });

        new Setting(containerEl)
            .setName('Expand Linked Notes Recursively')
            .setDesc('If enabled, when fetching a note, also fetch and expand links within that note recursively (prevents infinite loops).')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.expandLinkedNotesRecursively ?? false)
                .onChange(async (value) => {
                    this.plugin.settings.expandLinkedNotesRecursively = value;
                    await this.plugin.saveSettings();
                }));
    }

    /**
     * Provider Configuration Section.
     * Renders collapsible sections for each provider's specific settings and test buttons.
     * @param containerEl The HTML element to render the section into.
     */
    renderProviderConfiguration(containerEl: HTMLElement): void {
        containerEl.createEl('p', {
            text: 'API keys are configured in the main plugin settings. Use the test buttons below to verify connections and refresh available models.',
            cls: 'setting-item-description'
        });

        // Render collapsible sections for each provider
        this.renderOpenAIConfig(containerEl);
        this.renderAnthropicConfig(containerEl);
        this.renderGeminiConfig(containerEl);
        this.renderOllamaConfig(containerEl);
    }

    /**
     * Renders a collapsible section for provider configuration.
     * This is a helper method used by specific provider rendering methods.
     * @param containerEl The HTML element to render the section into.
     * @param providerType The type of the provider (e.g., 'openai', 'anthropic').
     * @param displayName The display name of the provider (e.g., 'OpenAI', 'Anthropic').
     * @param renderSpecificSettings A callback function to render provider-specific settings within the collapsible section.
     */
    private _renderCollapsibleProviderConfig(
        containerEl: HTMLElement,
        providerType: 'openai' | 'anthropic' | 'gemini' | 'ollama',
        displayName: string,
        renderSpecificSettings?: (contentEl: HTMLElement) => void
    ): void {
        const collapsibleContainer = containerEl.createDiv('provider-collapsible');
        const headerEl = collapsibleContainer.createEl('div', {
            cls: 'provider-header',
            text: `▶ ${displayName} Configuration`
        });
        Object.assign(headerEl.style, {
            cursor: 'pointer',
            userSelect: 'none',
            padding: '8px 0',
            fontWeight: 'bold'
        });

        const contentEl = collapsibleContainer.createDiv('provider-content');
        contentEl.style.display = 'none';
        contentEl.style.paddingLeft = '16px';

        let isExpanded = false;
        headerEl.addEventListener('click', () => {
            isExpanded = !isExpanded;
            contentEl.style.display = isExpanded ? 'block' : 'none';
            headerEl.textContent = `${isExpanded ? '▼' : '▶'} ${displayName} Configuration`;
        });

        // Display API key/Server URL status (configured in main settings)
        const settings = this.plugin.settings[`${providerType}Settings` as keyof typeof this.plugin.settings] as any;
        const apiKeyStatus = settings.apiKey ?
            `API Key: ${settings.apiKey.substring(0, 8)}...` :
            'No API Key configured';
        const serverUrlStatus = settings.serverUrl ?
            `Server URL: ${settings.serverUrl}` :
            'No Server URL configured';

        contentEl.createEl('div', {
            cls: 'setting-item-description',
            text: `${settings.apiKey ? apiKeyStatus : serverUrlStatus} (Configure in main plugin settings)`
        });

        // Render provider-specific settings if callback is provided
        if (renderSpecificSettings) {
            renderSpecificSettings(contentEl);
        }

        // Render the connection test section for this provider
        this.renderProviderTestSection(contentEl, providerType, displayName);
    }

    /**
     * Renders the OpenAI configuration section.
     * @param containerEl The HTML element to render the section into.
     */
    private renderOpenAIConfig(containerEl: HTMLElement): void {
        this._renderCollapsibleProviderConfig(containerEl, 'openai', 'OpenAI', (contentEl) => {
            new Setting(contentEl)
                .setName('OpenAI Base URL')
                .setDesc('Custom base URL for OpenAI API (optional)')
                .addText(text => {
                    text.setPlaceholder('https://api.openai.com/v1')
                        .setValue(this.plugin.settings.openaiSettings.baseUrl || '')
                        .onChange((value) => {
                            // Update setting value immediately on change
                            this.plugin.settings.openaiSettings.baseUrl = value;
                        });
                    // Save settings on blur
                    text.inputEl.addEventListener('blur', async () => {
                        await this.plugin.saveSettings();
                    });
                    return text;
                });
        });
    }

    /**
     * Renders the Anthropic configuration section.
     * @param containerEl The HTML element to render the section into.
     */
    private renderAnthropicConfig(containerEl: HTMLElement): void {
        this._renderCollapsibleProviderConfig(containerEl, 'anthropic', 'Anthropic');
    }

    /**
     * Renders the Gemini configuration section.
     * @param containerEl The HTML element to render the section into.
     */
    private renderGeminiConfig(containerEl: HTMLElement): void {
        this._renderCollapsibleProviderConfig(containerEl, 'gemini', 'Gemini');
    }

    /**
     * Renders the Ollama configuration section.
     * @param containerEl The HTML element to render the section into.
     */
    private renderOllamaConfig(containerEl: HTMLElement): void {
        this._renderCollapsibleProviderConfig(containerEl, 'ollama', 'Ollama', (contentEl) => {
            contentEl.createEl('div', {
                cls: 'setting-item-description',
                text: 'To use Ollama:'
            });
            const steps = contentEl.createEl('ol');
            steps.createEl('li', { text: 'Install Ollama from https://ollama.ai' });
            steps.createEl('li', { text: 'Start the Ollama server' });
            steps.createEl('li', { text: 'Pull models using "ollama pull model-name"' });
            steps.createEl('li', { text: 'Test connection to see available models' });
        });
    }

    /**
     * Renders the provider connection test section.
     * Includes a test button and displays the last test result and available models.
     * @param containerEl The HTML element to render the section into.
     * @param provider The internal identifier for the provider (e.g., 'openai').
     * @param displayName The user-friendly name of the provider (e.g., 'OpenAI').
     */
    private renderProviderTestSection(containerEl: HTMLElement, provider: 'openai' | 'anthropic' | 'gemini' | 'ollama', displayName: string): void {
        const settings = this.plugin.settings[`${provider}Settings` as keyof typeof this.plugin.settings] as any;

        new Setting(containerEl)
            .setName('Test Connection')
            .setDesc(`Verify your API key and fetch available models for ${displayName}`)
            .addButton(button => button
                .setButtonText('Test')
                .onClick(async () => {
                    button.setButtonText('Testing...');
                    button.setDisabled(true);
                    try {
                        // Use dispatcher for connection testing
                        const aiDispatcher = new AIDispatcher(this.plugin.app.vault, this.plugin);
                        const result = await aiDispatcher.testConnection(provider);

                        // Update available models and last test result
                        if (result.success && result.models) {
                            settings.availableModels = result.models;
                            settings.lastTestResult = {
                                timestamp: Date.now(),
                                success: true,
                                message: result.message
                            };
                            await this.plugin.saveSettings();

                            // Refresh the combined list of available models with rich metadata after a successful test
                            const modelService = ModelService.getInstance();
                            this.plugin.settings.availableModels = await modelService.getAllModelsWithMetadata(this.plugin.settings, false);
                            await this.plugin.saveSettings();

                            new Notice(result.message);
                        } else {
                            settings.lastTestResult = {
                                timestamp: Date.now(),
                                success: false,
                                message: result.message
                            };
                            new Notice(result.message);
                        }
                    } catch (error) {
                        const err = error as Error;
                        new Notice(`Error: ${err.message}`);
                         // Update last test result with error message if test throws
                         settings.lastTestResult = {
                            timestamp: Date.now(),
                            success: false,
                            message: `Test failed: ${err.message}`
                        };
                    } finally {
                        button.setButtonText('Test');
                        button.setDisabled(false);
                    }
                }));

        // Display last test result
        if (settings.lastTestResult) {
            const date = new Date(settings.lastTestResult.timestamp);
            containerEl.createEl('div', {
                text: `Last test: ${date.toLocaleString()} - ${settings.lastTestResult.message}`,
                cls: settings.lastTestResult.success ? 'success' : 'error'
            });
        }

        // Display available models fetched from this provider
        if (settings.availableModels && settings.availableModels.length > 0) {
            containerEl.createEl('div', {
                text: `Available models: ${settings.availableModels.map((m: any) => m.name || m.id).join(', ')}`,
                cls: 'setting-item-description'
            });
        }
    }

    /**
     * Debug Mode Section.
     * Includes a toggle for enabling/disabling debug mode.
     * @param containerEl The HTML element to render the section into.
     */
    renderDebugModeSettings(containerEl: HTMLElement): void {
        new Setting(containerEl)
            .setName('Debug Mode')
            .setDesc('Enable verbose logging and debug UI features')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.debugMode ?? false)
                .onChange(async (value) => {
                    this.plugin.settings.debugMode = value;
                    await this.plugin.saveSettings();
                }));
    }

    /**
     * Renders all settings sections in order for a modal or view.
     * This method orchestrates the rendering of all distinct setting categories.
     * Note: AI Model Settings should be rendered separately using AIModelConfigurationSection.
     * @param containerEl The HTML element to render the sections into.
     * @param options Optional settings, e.g., onRefresh callback.
     */
    async renderAllSettings(containerEl: HTMLElement, options?: { onRefresh?: () => void }) {
        // Note: renderAIModelSettings has been removed to avoid duplication with AIModelConfigurationSection
        // The caller should use AIModelConfigurationSection.render() directly for AI model settings
        this.renderDateSettings(containerEl);
        this.renderNoteReferenceSettings(containerEl);
        this.renderProviderConfiguration(containerEl);
        this.renderDebugModeSettings(containerEl);
    }
}
