import { Plugin } from 'obsidian';
import { MyPluginSettings, Message, DEFAULT_SETTINGS, AgentModeSettings } from './types';
import { MyPluginSettingTab } from './settings';
import { ChatView, VIEW_TYPE_CHAT } from './chat';
import { ModelSettingsView } from './components/ModelSettingsView';
import { processMessages } from './utils/noteUtils'; // Removed getContextNotesContent
import { showNotice } from './utils/generalUtils';
import { debugLog } from './utils/logger'; // Changed from log to debugLog
import { activateView } from './utils/viewManager';
import { AgentModeManager } from './components/agent/agentModeManager';
import { BackupManager } from './components/BackupManager';
import { ToolRichDisplay } from './components/agent/ToolRichDisplay';
import { registerAllCommands } from './components/commands/commandRegistry';
import { VIEW_TYPE_MODEL_SETTINGS } from './components/commands/viewCommands';
import { registerYamlAttributeCommands } from './YAMLHandler';
import { AIDispatcher } from './utils/aiDispatcher';
import { MessageContextPool, PreAllocatedArrays } from './utils/objectPool';
import { Priority3IntegrationManager } from './integration/priority3Integration';
import { parseToolDataFromContent, cleanContentFromToolData } from './utils/messageContentParser';
import { isVaultAdapterWithBasePath, validatePluginSettings } from './utils/typeguards';
import { RecentlyOpenedFilesManager } from './utils/recently-opened-files';
import { PerformanceDashboardModal } from './utils/PerformanceDashboard';

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
     * Central AI dispatcher for managing all AI requests and streams.
     */
    aiDispatcher: AIDispatcher | null = null;
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
     * Priority 3 optimizations integration manager.
     */
    public priority3Manager: Priority3IntegrationManager;
    /**
     * Recently opened files manager for tracking file access.
     */
    public recentlyOpenedFilesManager: RecentlyOpenedFilesManager;

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
        
        for (const msg of messages) {
            if (msg.role === 'user' || msg.role === 'assistant') {
                // Parse tool data if present in the message content
                const toolData = parseToolDataFromContent(msg.content);
                
                if (toolData) {
                    // Clean the content to remove tool data markup
                    const cleanContent = cleanContentFromToolData(msg.content);
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

        // Safely get vault path with proper type checking
        let vaultPath = '';
        try {
            const adapter = this.app.vault.adapter;
            if (isVaultAdapterWithBasePath(adapter)) {
                vaultPath = adapter.basePath;
            } else {
                debugLog(this.settings.debugMode ?? false, 'warn', '[main.ts] Vault adapter does not have basePath property');
            }
        } catch (error) {
            debugLog(this.settings.debugMode ?? false, 'error', '[main.ts] Failed to get vault path:', error);
        }

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
            (level, ...args) => debugLog(this.settings.debugMode ?? false, level, ...args) // Changed from log to debugLog
        );
        
        // Initialize central AI dispatcher for managing all AI requests and streams
        this.aiDispatcher = new AIDispatcher(this.app.vault, this);
        
        // Initialize Priority 3 optimizations (dependency injection, state management, stream management)
        this.priority3Manager = new Priority3IntegrationManager(this);
        await this.priority3Manager.initialize();
        
        // Initialize recently opened files manager for tracking file access
        this.recentlyOpenedFilesManager = RecentlyOpenedFilesManager.getInstance(this.app);
        
        debugLog(this.settings.debugMode ?? false, 'info', 'Priority 3 optimizations initialized');
        
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


        // Register performance dashboard command
        this.addCommand({
            id: 'open-performance-dashboard',
            name: 'Open Performance Dashboard',
            callback: () => {
                new PerformanceDashboardModal(this).open();
            }
        });

        // Add ribbon icon for performance dashboard
        this.addRibbonIcon('activity', 'Performance Dashboard', () => {
            new PerformanceDashboardModal(this).open();
        });

        // Register test commands (only in debug mode)
        if (this.settings.debugMode) {
            try {
                const { registerTestCommands } = await import('../tests/testRunner');
                registerTestCommands(this);
                debugLog(this.settings.debugMode ?? false, 'info', 'Test commands registered');
            } catch (error) {
                debugLog(this.settings.debugMode ?? false, 'warn', 'Failed to register test commands:', error);
            }
        }

        // Archive AI call logs by date (compress old files) - non-blocking
        if (this.settings.debugMode) {
            // Only run archival in debug mode to avoid startup issues
            try {
                const { archiveAICallsByDate } = await import('./utils/saveAICalls');
                await archiveAICallsByDate(this);
                debugLog(this.settings.debugMode ?? false, 'info', 'AI call archival completed');
            } catch (error) {
                debugLog(this.settings.debugMode ?? false, 'warn', 'AI call archival failed:', error);
            }
        }

        debugLog(this.settings.debugMode ?? false, 'info', 'AI Assistant Plugin loaded.'); // Changed from log to debugLog
    }

    /**
     * Enhanced debug logger for the plugin.
     * @param level Log level: 'debug' | 'info' | 'warn' | 'error'. Defaults to 'debug'.
     * @param args Arguments to log.
     */
    debugLog(level: 'debug' | 'info' | 'warn' | 'error' = 'debug', ...args: any[]) {
        debugLog(this.settings.debugMode ?? false, level, ...args); // Changed from log to debugLog
    }

    /**
     * Loads plugin settings from data.
     * Merges loaded data with default settings with runtime validation.
     */
    public async loadSettings() {
        try {
            const loadedData = await (this as Plugin).loadData();
            
            // Validate loaded data before merging
            if (loadedData !== null && loadedData !== undefined) {
                const validatedData = validatePluginSettings(loadedData);
                this.settings = Object.assign({}, DEFAULT_SETTINGS, validatedData);
            } else {
                this.settings = Object.assign({}, DEFAULT_SETTINGS);
            }
            
            debugLog(this.settings.debugMode ?? false, 'info', '[main.ts] Settings loaded and validated successfully');
        } catch (error) {
            debugLog(true, 'error', '[main.ts] Failed to load settings, using defaults:', error);
            this.settings = Object.assign({}, DEFAULT_SETTINGS);
        }
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
            (level, ...args) => debugLog(this.settings.debugMode ?? false, level, ...args) // Changed from log to debugLog
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
        
        // Clean up Priority 3 optimizations
        if (this.priority3Manager) {
            this.priority3Manager.dispose();
        }
        
        // Clean up recently opened files manager
        if (this.recentlyOpenedFilesManager) {
            this.recentlyOpenedFilesManager.destroy();
        }
        
        // Clean up object pools to free memory
        MessageContextPool.getInstance().clear();
        PreAllocatedArrays.getInstance().clear();
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

    /**
     * Check if there are any active AI streams.
     * @returns True if there are active streams, false otherwise.
     */
    hasActiveAIStreams(): boolean {
        // Check the legacy activeStream property
        if (this.activeStream) {
            return true;
        }
        
        // Check the central AI dispatcher
        if (this.aiDispatcher && this.aiDispatcher.hasActiveStreams()) {
            return true;
        }
        
        return false;
    }

    /**
     * Stop all active AI streams across the plugin.
     * This includes streams from chat, editor completions, and agent mode.
     */
    stopAllAIStreams(): void {
        // Stop legacy active stream
        if (this.activeStream) {
            this.activeStream.abort();
            this.activeStream = null;
        }
        
        // Stop all streams managed by the central AI dispatcher
        if (this.aiDispatcher) {
            this.aiDispatcher.abortAllStreams();
        }
        
        debugLog(this.settings.debugMode ?? false, 'info', '[MyPlugin] All AI streams stopped');
    }

    /**
     * Debug method to get information about active streams.
     */
    getStreamDebugInfo(): string {
        const info = [];
        
        if (this.activeStream) {
            info.push('Main plugin activeStream: active');
        } else {
            info.push('Main plugin activeStream: null');
        }
        
        if (this.aiDispatcher) {
            const count = this.aiDispatcher.getActiveStreamCount();
            info.push(`AIDispatcher streams: ${count}`);
        } else {
            info.push('AIDispatcher: not initialized');
        }
        
        const chatLeaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_CHAT);
        info.push(`Chat views: ${chatLeaves.length}`);
        
        chatLeaves.forEach((leaf, index) => {
            const chatView = leaf.view as ChatView;
            if (chatView && typeof chatView.hasActiveStream === 'function') {
                const hasStream = chatView.hasActiveStream();
                info.push(`  Chat view ${index}: ${hasStream ? 'has stream' : 'no stream'}`);
            }
        });
        
        return info.join('\n');
    }

    /**
     * Test Priority 3 optimizations to demonstrate their functionality.
     */
    private async testPriority3Optimizations(): Promise<void> {
        try {
            if (!this.priority3Manager) {
                showNotice('Priority 3 optimizations not initialized');
                return;
            }

            // Get system status
            const status = this.priority3Manager.getStatus();
            
            // Import the required modules
            const { ServiceLocator } = await import('./utils/dependencyInjection');
            const { globalStateManager } = await import('./utils/stateManager');
            const { globalStreamManager, StreamUtils } = await import('./utils/streamManager');

            // Test 1: Dependency Injection
            console.log('🔧 Testing Dependency Injection...');
            const stateManager = ServiceLocator.resolve('stateManager');
            const streamManager = ServiceLocator.resolve('streamManager');
            console.log('✅ Services resolved successfully');

            // Test 2: State Management
            console.log('📊 Testing State Management...');
            globalStateManager.setState('test.priority3.demo', {
                timestamp: Date.now(),
                message: 'Priority 3 optimizations are working!',
                features: ['dependency-injection', 'state-management', 'stream-management']
            }, { persistent: true });

            const testData = globalStateManager.getState('test.priority3.demo');
            console.log('✅ State set and retrieved:', testData);

            // Test 3: Stream Management
            console.log('🌊 Testing Stream Management...');
            const testStream = globalStreamManager.createStream(
                'priority3-test',
                StreamUtils.fromArray(['Hello', ' ', 'Priority', ' ', '3', ' ', 'Optimizations!']),
                { timeout: 10000 }
            );

            let streamResult = '';
            testStream.on('data', (chunk: string) => {
                streamResult += chunk;
            });

            testStream.on('end', () => {
                console.log('✅ Stream completed:', streamResult);
                showNotice(`Priority 3 Test Complete! Check console for details. Status: ${status.services.length} services, ${status.stateKeys} state keys, ${status.activeStreams} active streams`);
            });

            await testStream.start();

            // Show comprehensive status
            console.log('📈 Priority 3 Status:', status);
            console.log('🎯 All Priority 3 optimizations tested successfully!');

        } catch (error) {
            console.error('❌ Priority 3 test failed:', error);
            showNotice('Priority 3 test failed - check console for details');
        }
    }
}
