import { App, Plugin, Notice, TFile, Editor } from 'obsidian';
import { MyPluginSettings, Message, DEFAULT_SETTINGS, AgentModeSettings } from './types';
import { createProvider, createProviderFromUnifiedModel } from '../providers';
import { MyPluginSettingTab } from './settings';
import { ChatView, VIEW_TYPE_CHAT } from './components/chat';
import { parseSelection } from './components/parseSelection';
import { ModelSettingsView } from './components/ModelSettingsView';
import { processMessages, getContextNotesContent } from './components/noteUtils';
import { getSystemMessage } from './components/systemMessage';
import { showNotice, copyToClipboard, moveCursorAfterInsert, insertSeparator } from './components/utils';
import { BackupManager } from './components/BackupManager';

export const VIEW_TYPE_MODEL_SETTINGS = 'model-settings-view';

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

    /**
     * Registers a command with Obsidian, optionally adding a ribbon icon.
     * @param options Command options including id, name, callback/editorCallback.
     * @param ribbonIcon Optional icon ID for a ribbon button.
     * @param ribbonTitle Optional tooltip title for the ribbon button.
     */
    private registerCommand(options: {
        id: string;
        name: string;
        callback?: () => void;
        editorCallback?: (editor: Editor) => void;
    }, ribbonIcon?: string, ribbonTitle?: string) {
        this.addCommand(options);
        if (ribbonIcon && ribbonTitle) {
            this.addRibbonIcon(ribbonIcon, ribbonTitle, options.callback || (() => {}));
        }
    }

    // --- Agent Mode State Integration ---

    getAgentModeSettings(): AgentModeSettings {
        return this.settings.agentMode || {
            enabled: false,
            maxToolCalls: 5,
            timeoutMs: 30000
        };
    }

    isAgentModeEnabled(): boolean {
        return this.getAgentModeSettings().enabled;
    }

    async setAgentModeEnabled(enabled: boolean) {
        if (!this.settings.agentMode) {
            this.settings.agentMode = {
                enabled: false,
                maxToolCalls: 5,
                timeoutMs: 30000
            };
        }
        this.settings.agentMode.enabled = enabled;
        await this.saveSettings();
        this.emitSettingsChange();
    }



    /**
     * Helper to activate the chat view and load messages into it.
     * @param messages An array of messages to load.
     */    private async activateChatViewAndLoadMessages(messages: Message[]) {
        await this.activateView(VIEW_TYPE_CHAT);
        const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_CHAT);
        if (!leaves.length) {
            showNotice('Could not find chat view.');
            return;
        }
        const chatView = leaves[0].view as ChatView;
        chatView.clearMessages();
        
        // Import MessageRenderer to parse embedded tool data
        const { MessageRenderer } = require('./components/chat/MessageRenderer');
        const messageRenderer = new MessageRenderer(this.app);        for (const msg of messages) {
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
                } else {
                    // Regular message without tool data
                    await chatView["addMessage"](msg.role, msg.content);
                }
            }
        }
        chatView.scrollMessagesToBottom();
        showNotice('Loaded chat note into chat.');
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

    /**
     * Handles the AI completion logic for the editor.
     * Extracts text, sends to AI, and streams response back to editor.
     * @param editor The editor instance.
     */
    private async handleAICompletion(editor: Editor) {
        let text: string;
        let insertPosition;

        if (editor.somethingSelected()) {
            text = editor.getSelection();
            insertPosition = editor.getCursor('to');
        } else {
            const currentLineNumber = editor.getCursor().line;
            let lines: string[] = [];
            for (let i = 0; i <= currentLineNumber; i++) {
                lines.push(editor.getLine(i));
            }

            const chatStartString = this.settings.chatStartString;
            if (chatStartString) {
                const startIdx = lines.findIndex(line => line.trim() === chatStartString.trim());
                if (startIdx !== -1) {
                    lines = lines.slice(startIdx + 1);
                }
            }
            text = lines.join('\n');
            insertPosition = { line: currentLineNumber + 1, ch: 0 };
        }

        const messages = parseSelection(text, this.settings.chatSeparator);
        if (messages.length === 0) {
            showNotice('No valid messages found in the selection.');
            return;
        }

        const sepLine = insertSeparator(editor, insertPosition, this.settings.chatSeparator);
        let currentPosition = { line: sepLine, ch: 0 };

        this.activeStream = new AbortController();
        try {
            const provider = this.settings.selectedModel
                ? createProviderFromUnifiedModel(this.settings, this.settings.selectedModel)
                : createProvider(this.settings);
            const processedMessages = await this.processMessages([
                { role: 'system', content: this.getSystemMessage() },
                ...messages
            ]);

            let bufferedChunk = '';
            const flushBuffer = () => {
                if (bufferedChunk) {
                    editor.replaceRange(bufferedChunk, currentPosition);
                    currentPosition = editor.offsetToPos(
                        editor.posToOffset(currentPosition) + bufferedChunk.length
                    );
                    bufferedChunk = '';
                }
            };

            await provider.getCompletion(
                processedMessages,
                {
                    temperature: this.settings.temperature,
                    maxTokens: this.settings.maxTokens,
                    streamCallback: (chunk: string) => {
                        bufferedChunk += chunk;
                        setTimeout(flushBuffer, 100);
                    },
                    abortController: this.activeStream
                }
            );

            flushBuffer();

            const endLineContent = editor.getLine(currentPosition.line) ?? '';
            const endPrefix = endLineContent.trim() !== '' ? '\n' : '';
            editor.replaceRange(`${endPrefix}\n${this.settings.chatSeparator}\n\n`, currentPosition);
            const newCursorPos = editor.offsetToPos(
                editor.posToOffset(currentPosition) + (endPrefix ? 1 : 0) + 1 + this.settings.chatSeparator.length + 1
            );
            editor.setCursor(newCursorPos);
        } catch (error: any) {
            showNotice(`Error: ${error.message}`);
            const errLineContent = editor.getLine(currentPosition.line) ?? '';
            const errPrefix = errLineContent.trim() !== '' ? '\n' : '';
            editor.replaceRange(`Error: ${error.message}\n${errPrefix}\n${this.settings.chatSeparator}\n\n`, currentPosition);
        } finally {
            this.activeStream = null;
        }
    }    async onload() {
        await this.loadSettings();        // Initialize backup manager
        const pluginDataPath = this.app.vault.configDir + '/plugins/ai-assistant-for-obsidian';
        this.backupManager = new BackupManager(this.app, pluginDataPath);
        
        // Initialize backup system
        await this.backupManager.initialize();
        
        this.addSettingTab(new MyPluginSettingTab(this.app, this));

        this.registerPluginView(VIEW_TYPE_MODEL_SETTINGS, (leaf) => new ModelSettingsView(leaf, this));
        this.registerPluginView(VIEW_TYPE_CHAT, (leaf) => new ChatView(leaf, this));

        this.registerCommand({
            id: 'show-ai-settings',
            name: 'Show AI Settings',
            callback: () => this.activateView(VIEW_TYPE_MODEL_SETTINGS)
        }, 'file-sliders', 'Open AI Settings');

        this.registerCommand({
            id: 'show-ai-chat',
            name: 'Show AI Chat',
            callback: () => this.activateView(VIEW_TYPE_CHAT)
        }, 'message-square', 'Open AI Chat');

        this.app.workspace.onLayoutReady(() => {
            if (this.settings.autoOpenModelSettings) {
                this.activateView(VIEW_TYPE_MODEL_SETTINGS);
            }
        });

        this.registerCommand({
            id: 'ai-completion',
            name: 'Get AI Completion',
            editorCallback: (editor) => this.handleAICompletion(editor)
        });

        this.registerCommand({
            id: 'end-ai-stream',
            name: 'End AI Stream',
            callback: () => {
                if (this.activeStream) {
                    this.activeStream.abort();
                    this.activeStream = null;
                    showNotice('AI stream ended');
                } else {
                    showNotice('No active AI stream to end');
                }
            }
        });

        this.registerCommand({
            id: 'copy-active-note-name',
            name: 'Copy Active Note Name',
            callback: async () => {
                const activeFile = this.app.workspace.getActiveFile();
                if (activeFile) {
                    const noteName = `[[${activeFile.basename}]]`;
                    await copyToClipboard(noteName, `Copied to clipboard: ${noteName}`, 'Failed to copy to clipboard');
                } else {
                    showNotice('No active note found');
                }
            }
        });

        this.registerCommand({
            id: 'insert-chat-start-string',
            name: 'Insert Chat Start String',
            editorCallback: (editor: Editor) => {
                const chatStartString = this.settings.chatStartString ?? '';
                if (!chatStartString) {
                    showNotice('chatStartString is not set in settings.');
                    return;
                }
                const cursor = editor.getCursor();
                editor.replaceRange(chatStartString, cursor);
                moveCursorAfterInsert(editor, cursor, chatStartString);
            }
        });

        this.registerCommand({
            id: 'generate-note-title',
            name: 'Generate Note Title',
            callback: async () => {
                const { generateNoteTitle } = await import("./YAMLHandler");
                await generateNoteTitle(
                    this.app,
                    this.settings,
                    (messages) => this.processMessages(messages)
                );
            }
        });

        this.registerCommand({
            id: 'load-chat-note-into-chat',
            name: 'Load Chat Note into Chat',
            callback: async () => {
                let file: TFile | null = this.app.workspace.getActiveFile();
                if (!file) {
                    showNotice('No active note found. Please open a note to load as chat.');
                    return;
                }
                let content = await this.app.vault.read(file);
                const messages = parseSelection(content, this.settings.chatSeparator);
                if (!messages.length) {
                    showNotice('No chat messages found in the selected note.');
                    return;
                }
                await this.activateChatViewAndLoadMessages(messages);
            }
        });
        this.registerYamlAttributeCommands();
    }

    /**
     * Register YAML attribute generator commands dynamically based on settings.
     * Unregisters previous commands before registering new ones.
     */
    private registerYamlAttributeCommands() {
        if (this._yamlAttributeCommandIds && this._yamlAttributeCommandIds.length > 0) {
            for (const id of this._yamlAttributeCommandIds) {
                // @ts-ignore: Obsidian Plugin API has undocumented method
                this.app.commands.removeCommand(id);
            }
        }
        this._yamlAttributeCommandIds = [];
        if (this.settings.yamlAttributeGenerators && Array.isArray(this.settings.yamlAttributeGenerators)) {
            for (const gen of this.settings.yamlAttributeGenerators) {
                if (!gen.attributeName || !gen.prompt || !gen.commandName) continue;
                const id = `generate-yaml-attribute-${gen.attributeName}`;
                this.registerCommand({ // Use the new registerCommand
                    id,
                    name: gen.commandName,
                    callback: async () => {
                        const { generateYamlAttribute } = await import("./YAMLHandler");
                        await generateYamlAttribute(
                            this.app,
                            this.settings,
                            (messages) => this.processMessages(messages),
                            gen.attributeName,
                            gen.prompt,
                            gen.outputMode
                        );
                    }
                });
                this._yamlAttributeCommandIds.push(id);
            }
        }
    }

    // Enhanced debug logging utility with log levels and timestamps
    /**
     * Enhanced debug logger for the plugin.
     * @param level Log level: 'debug' | 'info' | 'warn' | 'error'. Defaults to 'debug'.
     * @param args Arguments to log.
     */
    debugLog(level: 'debug' | 'info' | 'warn' | 'error' = 'debug', ...args: any[]) {
        if (!this.settings.debugMode) return;
        const timestamp = new Date().toISOString();
        const prefix = `[AI Assistant ${level.toUpperCase()} ${timestamp}]`;
        switch (level) {
            case 'info':
                // eslint-disable-next-line no-console
                console.info(prefix, ...args);
                break;
            case 'warn':
                // eslint-disable-next-line no-console
                console.warn(prefix, ...args);
                break;
            case 'error':
                // eslint-disable-next-line no-console
                console.error(prefix, ...args);
                break;
            default:
                // eslint-disable-next-line no-console
                console.debug(prefix, ...args);
        }
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
        this.app.workspace.detachLeavesOfType(viewType);

        let leaf = this.app.workspace.getRightLeaf(false) || this.app.workspace.getLeaf(true);
        await leaf.setViewState({
            type: viewType,
            active: true,
        });

        if (reveal) {
            this.app.workspace.revealLeaf(leaf);
        }
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
        this.registerYamlAttributeCommands(); // Update commands after saving settings
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
