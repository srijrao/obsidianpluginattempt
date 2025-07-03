import { Plugin } from 'obsidian';
import { MyPluginSettings, Message, DEFAULT_SETTINGS, AgentModeSettings } from './types';
import { MyPluginSettingTab } from './settings';
import { ChatView, VIEW_TYPE_CHAT } from './chat';
import { ModelSettingsView } from './components/ModelSettingsView';
import { processMessages, getContextNotesContent } from './utils/noteUtils';
import { getSystemMessage } from './utils/systemMessage';
import { showNotice } from './utils/generalUtils';
import { log } from './utils/logger'; // Changed from debugLog to log
import { activateView } from './utils/viewManager';
import { AgentModeManager } from './components/chat/agent/agentModeManager';
import { BackupManager } from './components/BackupManager';
import { ToolRichDisplay } from './components/chat/agent/ToolRichDisplay';
import { registerAllCommands } from './commands/commandRegistry';
import { VIEW_TYPE_MODEL_SETTINGS } from './components/commands/viewCommands';
import { registerYamlAttributeCommands } from './YAMLHandler';

/**
 * AI Assistant Plugin
 *
 * This plugin adds AI capabilities to Obsidian, supporting multiple providers:
 * - OpenAI (ChatGPT)
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
    /**
     * Plugin settings object, loaded from disk or defaults.
     */
    settings: MyPluginSettings;
    /**
     * Reference to the model settings view, if open.
     */
    modelSettingsView: ModelSettingsView | null = null;
    /**
     * Reference to the current active streaming controller (for aborting AI responses).
     */
    activeStream: AbortController | null = null;
    /**
     * List of registered YAML attribute command IDs for cleanup/re-registration.
     */
    private _yamlAttributeCommandIds: string[] = [];
    /**
     * Listeners for settings changes (for reactive UI updates).
     */
    private settingsListeners: Array<() => void> = [];
    /**
     * Backup manager instance for handling plugin data backups.
     */
    public backupManager: BackupManager;
    /**
     * Agent mode manager instance for handling agent-related settings and logic.
     */
    public agentModeManager: AgentModeManager;

    /**
     * Register a callback to be called when settings change.
     * @param listener Callback function
     */
    onSettingsChange(listener: () => void) {
        this.settingsListeners.push(listener);
    }

    /**
     * Remove a previously registered settings change callback.
     * @param listener Callback function
     */
    offSettingsChange(listener: () => void) {
        this.settingsListeners = this.settingsListeners.filter(l => l !== listener);
    }

    /**
     * Notify all registered listeners that settings have changed.
     */
    private emitSettingsChange() {
        for (const listener of this.settingsListeners) {
            try { listener(); } catch (e) { console.error(e); }
        }
    }

    /**
     * Static set to track registered view types and avoid duplicate registration.
     */
    private static registeredViewTypes = new Set<string>();

    /**
     * Helper to activate the chat view and load messages into it.
     * @param messages An array of messages to load.
     */
    private async activateChatViewAndLoadMessages(messages: Message[]) {
        this.debugLog('info', '[main.ts] activateChatViewAndLoadMessages called', { messageCount: messages.length });
        await activateView(this.app, VIEW_TYPE_CHAT);
        const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_CHAT);
        if (!leaves.length) {
            showNotice('Could not find chat view.');
            this.debugLog('warn', '[main.ts] No chat view found');
            return;
        }
        const chatView = leaves[0].view as ChatView;
        chatView.clearMessages();
        
        // Dynamically import the message renderer to avoid circular dependencies
        const { MessageRenderer } = require('./components/chat/MessageRenderer');
        const messageRenderer = new MessageRenderer(this.app);

        for (const msg of messages) {
            if (msg.role === 'user' || msg.role === 'assistant') {
                // Parse tool data if present in the message content
                const toolData = messageRenderer.parseToolDataFromContent(msg.content);
                
                if (toolData) {
                    // Clean the content to remove tool data markup
                    const cleanContent = messageRenderer.cleanContentFromToolData(msg.content);
                    // Add the message with tool data to the chat view
                    await chatView["addMessage"](msg.role, cleanContent, false, {
                        toolResults: toolData.toolResults,
                        reasoning: toolData.reasoning,
                        taskStatus: toolData.taskStatus
                    });
                    this.debugLog('debug', '[main.ts] Added message with tool data', { role: msg.role, toolData });
                } else {
                    // Add a regular message
                    await chatView["addMessage"](msg.role, msg.content);
                    this.debugLog('debug', '[main.ts] Added regular message', { role: msg.role });
                }
            }
        }
        chatView.scrollMessagesToBottom();
        showNotice('Loaded chat note into chat.');
        this.debugLog('info', '[main.ts] Chat note loaded into chat view');
    }

    /**
     * Registers a view type with Obsidian, ensuring no duplicate registration.
     * @param viewType The type of the view.
     * @param viewCreator The function that creates the view.
     */
    private registerPluginView(viewType: string, viewCreator: (leaf: any) => any) {
        if (!MyPlugin.registeredViewTypes.has(viewType)) {
            this.registerView(viewType, viewCreator);
            MyPlugin.registeredViewTypes.add(viewType);
        }
    }

    /**
     * Called by Obsidian when the plugin is loaded.
     * Handles initialization, settings, view registration, and command registration.
     */
    async onload() {
        await this.loadSettings();

        // Compute the plugin data path for storing backups
        const pluginDataPath = this.app.vault.configDir + '/plugins/ai-assistant-for-obsidian';
        this.backupManager = new BackupManager(this.app, pluginDataPath);
        
        // Initialize backup manager (loads or creates backup files)
        await this.backupManager.initialize();
        
        // Initialize agent mode manager for handling agent mode logic
        this.agentModeManager = new AgentModeManager(
            this.settings,
            () => this.saveSettings(),
            () => this.emitSettingsChange(),
            (level, ...args) => log(this.settings.debugMode ?? false, level, ...args) // Changed from debugLog to log
        );
        
        // Add the plugin's settings tab to Obsidian's settings UI
        this.addSettingTab(new MyPluginSettingTab(this.app, this));

        // Register custom views for model settings and chat
        this.registerPluginView(VIEW_TYPE_CHAT, (leaf) => new ChatView(leaf, this));
        this.registerPluginView(VIEW_TYPE_MODEL_SETTINGS, (leaf) => new ModelSettingsView(leaf, this));

        // Register all commands using the new centralized function
        this._yamlAttributeCommandIds = registerAllCommands(
            this,
            this.settings,
            (messages: Message[]) => this.processMessages(messages),
            (messages: Message[]) => this.activateChatViewAndLoadMessages(messages),
            { current: this.activeStream },
            (stream: AbortController | null) => { this.activeStream = stream; },
            this._yamlAttributeCommandIds
        );

        // Optionally auto-open the model settings view on layout ready
        this.app.workspace.onLayoutReady(() => {
            if (this.settings.autoOpenModelSettings) {
                activateView(this.app, VIEW_TYPE_MODEL_SETTINGS);
            }
        });

        // Register a markdown post-processor to handle tool execution blocks in preview/live mode
        this.registerMarkdownPostProcessor((element, context) => {
            this.processToolExecutionBlocks(element, context);
        });

        // Register a code block processor for 'ai-tool-execution' code blocks
        this.registerMarkdownCodeBlockProcessor("ai-tool-execution", (source, el, ctx) => {
            this.processToolExecutionCodeBlock(source, el, ctx);
        });

        log(this.settings.debugMode ?? false, 'info', 'AI Assistant Plugin loaded.'); // Changed from debugLog to log
    }

    /**
     * Enhanced debug logger for the plugin.
     * @param level Log level: 'debug' | 'info' | 'warn' | 'error'. Defaults to 'debug'.
     * @param args Arguments to log.
     */
    debugLog(level: 'debug' | 'info' | 'warn' | 'error' = 'debug', ...args: any[]) {
        log(this.settings.debugMode ?? false, level, ...args); // Changed from debugLog to log
    }

    /**
     * Loads plugin settings from data.
     * Merges loaded data with default settings.
     */
    public async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await (this as Plugin).loadData());
    }

    /**
     * Saves plugin settings to data.
     * Also re-registers YAML attribute commands and emits a settings change event.
     */
    public async saveSettings() {
        await (this as Plugin).saveData(this.settings);
        // Re-register YAML attribute commands to reflect any changes
        this._yamlAttributeCommandIds = registerYamlAttributeCommands(
            this,
            this.settings,
            (messages) => this.processMessages(messages),
            this._yamlAttributeCommandIds,
            (level, ...args) => log(this.settings.debugMode ?? false, level, ...args) // Changed from debugLog to log
        );
        this.emitSettingsChange(); 
    }

    /**
     * Processes an array of messages, potentially adding context notes.
     * @param messages The messages to process.
     * @returns A promise that resolves to the processed messages.
     */
    private async processMessages(messages: Message[]): Promise<Message[]> {
        return processMessages(messages, this.app, this.settings);
    }

    /**
     * Called when the plugin is unloaded.
     * Unregisters views to prevent issues on reload.
     */
    onunload() {
        MyPlugin.registeredViewTypes.delete(VIEW_TYPE_MODEL_SETTINGS);
        MyPlugin.registeredViewTypes.delete(VIEW_TYPE_CHAT);
    }

    /**
     * Process ai-tool-execution code blocks specifically for Live Preview mode
     * @param source The code block source string (should be JSON)
     * @param element The HTML element to render into
     * @param context The Obsidian context object
     */
    private processToolExecutionCodeBlock(source: string, element: HTMLElement, context: any) {
        try {
            // Parse the code block as JSON
            const toolData = JSON.parse(source);
            // Render the tool execution block using the rich display component
            ToolRichDisplay.renderToolExecutionBlock(toolData, element, async (resultText: string) => {
                try {
                    await navigator.clipboard.writeText(resultText);
                    showNotice('Copied to clipboard!');
                } catch (error) {
                    console.error('Failed to copy to clipboard:', error);
                    showNotice('Failed to copy to clipboard');
                }
            });
        } catch (error) {
            // If parsing fails, show the raw code block
            console.error('Failed to parse ai-tool-execution code block:', error);
            this.debugLog('error', '[main.ts] Failed to parse ai-tool-execution code block', { error });
            const pre = document.createElement('pre');
            const code = document.createElement('code');
            code.textContent = source;
            pre.appendChild(code);
            element.innerHTML = '';
            element.appendChild(pre);
        }
    }

    /**
     * Process ai-tool-execution blocks in markdown and replace them with rich tool displays
     * @param element The root HTML element containing markdown content
     * @param context The Obsidian context object
     */
    private processToolExecutionBlocks(element: HTMLElement, context: any) {
        const codeBlocks = element.querySelectorAll('pre > code');
        for (const codeBlock of Array.from(codeBlocks)) {
            const codeElement = codeBlock as HTMLElement;
            const preElement = codeElement.parentElement as HTMLPreElement;
            // Get the code block text and check if it looks like an ai-tool-execution block
            const text = codeElement.textContent?.trim() || '';
            const isAIToolExecution = codeElement.className.includes('language-ai-tool-execution') ||
                text.startsWith('{"toolResults"');
            if (isAIToolExecution) {
                try {
                    // Parse the code block as JSON
                    const toolData = JSON.parse(text);
                    // Create a container for the rich display
                    const toolContainer = document.createElement('div');
                    toolContainer.className = 'ai-tool-execution-container';
                    // Render the tool execution block
                    ToolRichDisplay.renderToolExecutionBlock(toolData, toolContainer, async (resultText: string) => {
                        try {
                            await navigator.clipboard.writeText(resultText);
                            showNotice('Copied to clipboard!');
                        } catch (error) {
                            console.error('Failed to copy to clipboard:', error);
                            showNotice('Failed to copy to clipboard');
                        }
                    });
                    // Replace the original code block with the rich display
                    preElement.replaceWith(toolContainer);
                } catch (error) {
                    // If parsing fails, log and skip
                    console.error('Failed to parse ai-tool-execution block:', error);
                    this.debugLog('error', '[main.ts] Failed to parse ai-tool-execution block', { error });
                }
            }
        }
    }
}
