import { Plugin } from 'obsidian';
import { MyPluginSettings, Message, DEFAULT_SETTINGS, AgentModeSettings } from './types';
import { MyPluginSettingTab } from './settings';
import { ChatView, VIEW_TYPE_CHAT } from './chat';
import { ModelSettingsView } from './components/ModelSettingsView';
import { processMessages, getContextNotesContent } from './utils/noteUtils';
import { getSystemMessage } from './utils/systemMessage';
import { showNotice } from './utils/generalUtils';
import { debugLog } from './utils/logger';
import { activateView } from './utils/viewManager';
import { AgentModeManager } from './components/chat/agent/agentModeManager';
import { BackupManager } from './components/BackupManager';
import { ToolRichDisplay } from './components/chat/agent/ToolRichDisplay';
import {
    registerViewCommands,
    registerAIStreamCommands,
    registerNoteCommands,
    registerGenerateNoteTitleCommand,
    VIEW_TYPE_MODEL_SETTINGS
} from './components/commands';
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
    settings: MyPluginSettings;
    modelSettingsView: ModelSettingsView | null = null;
    activeStream: AbortController | null = null;
    private _yamlAttributeCommandIds: string[] = [];
    private settingsListeners: Array<() => void> = [];
    public backupManager: BackupManager;
    public agentModeManager: AgentModeManager;

    onSettingsChange(listener: () => void) {
        this.settingsListeners.push(listener);
    }

    offSettingsChange(listener: () => void) {
        this.settingsListeners = this.settingsListeners.filter(l => l !== listener);
    }

    private emitSettingsChange() {
        for (const listener of this.settingsListeners) {
            try { listener(); } catch (e) { console.error(e); }
        }
    }

    private static registeredViewTypes = new Set<string>();

    // --- Agent Mode State Integration ---

    getAgentModeSettings(): AgentModeSettings {
        return this.settings.agentMode || {
            enabled: false,
            maxToolCalls: 5,
            timeoutMs: 30000,
            maxIterations: 10
        };
    }

    isAgentModeEnabled(): boolean {
        return this.getAgentModeSettings().enabled;
    }

    // Debug: Log when agent mode is toggled
    async setAgentModeEnabled(enabled: boolean) {
        this.debugLog('info', '[main.ts] setAgentModeEnabled called', { enabled });
        if (!this.settings.agentMode) {
            this.settings.agentMode = {
                enabled: false,
                maxToolCalls: 5,
                timeoutMs: 30000,
                maxIterations: 10
            };
            this.debugLog('debug', '[main.ts] Initialized agentMode settings');
        }
        this.settings.agentMode.enabled = enabled;
        await this.saveSettings();
        this.emitSettingsChange();
        this.debugLog('info', '[main.ts] Agent mode enabled state set', { enabled });
    }

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
        
        // Import MessageRenderer to parse embedded tool data
        const { MessageRenderer } = require('./components/chat/MessageRenderer');
        const messageRenderer = new MessageRenderer(this.app);

        for (const msg of messages) {
            if (msg.role === 'user' || msg.role === 'assistant') {
                // Parse embedded tool data from content
                const toolData = messageRenderer.parseToolDataFromContent(msg.content);
                
                if (toolData) {
                    // Clean the content by removing the tool data blocks
                    const cleanContent = messageRenderer.cleanContentFromToolData(msg.content);
                    
                    // Add message with enhanced data
                    await chatView["addMessage"](msg.role, cleanContent, false, {
                        toolResults: toolData.toolResults,
                        reasoning: toolData.reasoning,
                        taskStatus: toolData.taskStatus
                    });
                    this.debugLog('debug', '[main.ts] Added message with tool data', { role: msg.role, toolData });
                } else {
                    // Regular message without tool data
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
     * Registers a view type with Obsidian.
     * @param viewType The type of the view.
     * @param viewCreator The function that creates the view.
     */
    private registerPluginView(viewType: string, viewCreator: (leaf: any) => any) {
        if (!MyPlugin.registeredViewTypes.has(viewType)) {
            this.registerView(viewType, viewCreator);
            MyPlugin.registeredViewTypes.add(viewType);
        }
    }

    async onload() {
        await this.loadSettings();

        // Initialize backup manager
        const pluginDataPath = this.app.vault.configDir + '/plugins/ai-assistant-for-obsidian';
        this.backupManager = new BackupManager(this.app, pluginDataPath);
        
        // Initialize backup system
        await this.backupManager.initialize();
        
        // Initialize agent mode manager
        this.agentModeManager = new AgentModeManager(
            this.settings,
            () => this.saveSettings(),
            () => this.emitSettingsChange(),
            (level, ...args) => debugLog(this.settings.debugMode ?? false, level, ...args)
        );
        
        this.addSettingTab(new MyPluginSettingTab(this.app, this));

        this.registerPluginView(VIEW_TYPE_MODEL_SETTINGS, (leaf) => new ModelSettingsView(leaf, this));
        this.registerPluginView(VIEW_TYPE_CHAT, (leaf) => new ChatView(leaf, this));

        // Register commands using the new command modules
        registerViewCommands(this);
        
        registerAIStreamCommands(
            this,
            this.settings,
            (messages) => this.processMessages(messages),
            { current: this.activeStream },
            (stream) => { this.activeStream = stream; }
        );
        
        registerNoteCommands(
            this,
            this.settings,
            (messages) => this.activateChatViewAndLoadMessages(messages)
        );
        
        registerGenerateNoteTitleCommand(
            this,
            this.settings,
            (messages) => this.processMessages(messages)
        );

        this.app.workspace.onLayoutReady(() => {
            if (this.settings.autoOpenModelSettings) {
                activateView(this.app, VIEW_TYPE_MODEL_SETTINGS);
            }
        });

        // Register YAML attribute commands
        this._yamlAttributeCommandIds = registerYamlAttributeCommands(
            this,
            this.settings,
            (messages) => this.processMessages(messages),
            this._yamlAttributeCommandIds,
            (level, ...args) => debugLog(this.settings.debugMode ?? false, level, ...args)
        );

        // Register markdown post-processor for ai-tool-execution blocks
        this.registerMarkdownPostProcessor((element, context) => {
            this.processToolExecutionBlocks(element, context);
        });

        // Register code block post-processor for Live Preview mode
        this.registerMarkdownCodeBlockProcessor('ai-tool-execution', (source, el, ctx) => {
            this.processToolExecutionCodeBlock(source, el, ctx);
        });
    }

    /**
     * Enhanced debug logger for the plugin.
     * @param level Log level: 'debug' | 'info' | 'warn' | 'error'. Defaults to 'debug'.
     * @param args Arguments to log.
     */
    debugLog(level: 'debug' | 'info' | 'warn' | 'error' = 'debug', ...args: any[]) {
        debugLog(this.settings.debugMode ?? false, level, ...args);
    }

    /**
     * Loads plugin settings from data.
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
        // Update YAML attribute commands after saving settings
        this._yamlAttributeCommandIds = registerYamlAttributeCommands(
            this,
            this.settings,
            (messages) => this.processMessages(messages),
            this._yamlAttributeCommandIds,
            (level, ...args) => debugLog(this.settings.debugMode ?? false, level, ...args)
        );
        this.emitSettingsChange(); // Notify listeners
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
     */
    private processToolExecutionCodeBlock(source: string, element: HTMLElement, context: any) {
        this.debugLog('debug', '[main.ts] processToolExecutionCodeBlock called for Live Preview', { source: source.substring(0, 100) + '...', element, context });
        try {
            // Parse the JSON data from the code block source
            const toolData = JSON.parse(source);
            this.debugLog('debug', '[main.ts] Parsed tool data from code block', { toolData });
            // Use the unified static method for rendering
            ToolRichDisplay.renderToolExecutionBlock(toolData, element, async (resultText: string) => {
                try {
                    await navigator.clipboard.writeText(resultText);
                    showNotice('Copied to clipboard!');
                } catch (error) {
                    console.error('Failed to copy to clipboard:', error);
                    showNotice('Failed to copy to clipboard');
                }
            });
            this.debugLog('info', '[main.ts] Rendered tool displays in Live Preview');
        } catch (error) {
            // If parsing fails, show the original content
            console.error('Failed to parse ai-tool-execution code block:', error);
            this.debugLog('error', '[main.ts] Failed to parse ai-tool-execution code block', { error });
            // Create fallback display
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
     */
    private processToolExecutionBlocks(element: HTMLElement, context: any) {
        this.debugLog('debug', '[main.ts] processToolExecutionBlocks called', { element, context });
        const codeBlocks = element.querySelectorAll('pre > code');
        this.debugLog('debug', '[main.ts] Found code blocks', { count: codeBlocks.length });
        for (const codeBlock of Array.from(codeBlocks)) {
            const codeElement = codeBlock as HTMLElement;
            const preElement = codeElement.parentElement as HTMLPreElement;
            this.debugLog('debug', '[main.ts] Checking code block', {
                className: codeElement.className,
                textContent: codeElement.textContent?.substring(0, 100) + '...'
            });
            // Check if this is an ai-tool-execution block
            // Check both by class name and by content pattern
            const text = codeElement.textContent?.trim() || '';
            const isAIToolExecution = codeElement.className.includes('language-ai-tool-execution') ||
                text.startsWith('{"toolResults"') ||
                text.startsWith('{\n  "toolResults"');
            if (isAIToolExecution) {
                this.debugLog('info', '[main.ts] Found ai-tool-execution block');
                try {
                    // Parse the JSON data
                    const toolData = JSON.parse(text);
                    this.debugLog('debug', '[main.ts] Parsed tool data', { toolData });
                    // Create a container for all tool displays
                    const toolContainer = document.createElement('div');
                    toolContainer.className = 'ai-tool-execution-container';
                    // Use the unified static method for rendering
                    ToolRichDisplay.renderToolExecutionBlock(toolData, toolContainer, async (resultText: string) => {
                        try {
                            await navigator.clipboard.writeText(resultText);
                            showNotice('Copied to clipboard!');
                        } catch (error) {
                            console.error('Failed to copy to clipboard:', error);
                            showNotice('Failed to copy to clipboard');
                        }
                    });
                    // Replace the code block with the rich display
                    preElement.replaceWith(toolContainer);
                    this.debugLog('info', '[main.ts] Replaced code block with tool displays');
                } catch (error) {
                    // If parsing fails, leave the original code block
                    console.error('Failed to parse ai-tool-execution block:', error);
                    this.debugLog('error', '[main.ts] Failed to parse ai-tool-execution block', { error });
                }
            }
        }
    }
}
