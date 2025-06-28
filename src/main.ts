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
     * Retrieves the system message based on current plugin settings.
     * @returns The system message string.
     */
    public getSystemMessage(): string {
        return getSystemMessage(this.settings);
    }

    /**
     * Activates and reveals a specific view type in the workspace.
     * @param viewType The type of view to activate.
     * @param reveal Whether to reveal the leaf after setting its view state. Defaults to true.
     */
    async activateView(viewType: string, reveal: boolean = true) {
        await activateView(this.app, viewType, reveal);
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
     * Retrieves content from context notes.
     * @param contextNotesText The text containing context note links.
     * @returns A promise that resolves to the combined content of context notes.
     */
    public async getContextNotesContent(contextNotesText: string): Promise<string> {
        return getContextNotesContent(contextNotesText, this.app);
    }

    /**
     * Called when the plugin is unloaded.
     * Unregisters views to prevent issues on reload.
     */
    onunload() {
        MyPlugin.registeredViewTypes.delete(VIEW_TYPE_MODEL_SETTINGS);
        MyPlugin.registeredViewTypes.delete(VIEW_TYPE_CHAT);
    }
}
