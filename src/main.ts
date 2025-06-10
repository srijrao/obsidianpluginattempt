import { App, Plugin, Notice, TFile } from 'obsidian';
import { MyPluginSettings, Message, DEFAULT_SETTINGS } from './types';
import { createProvider, createProviderFromUnifiedModel } from '../providers';
import { MyPluginSettingTab } from './settings';
import { ChatView, VIEW_TYPE_CHAT } from './components/chat';
import { parseSelection } from './components/parseSelection';
import { ModelSettingsView } from './components/ModelSettingsView';
import { processMessages, getContextNotesContent } from './components/noteUtils';
import { getSystemMessage } from './components/systemMessage';

const VIEW_TYPE_MODEL_SETTINGS = 'model-settings-view';

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
     * Helper to add a ribbon icon.
     * @param icon The icon ID.
     * @param title The tooltip title.
     * @param callback The function to call when the icon is clicked.
     */
    private addRibbon(icon: string, title: string, callback: () => void) {
        this.addRibbonIcon(icon, title, callback);
    }

    /**
     * Helper to add a command.
     * @param options Command options including id, name, and callback/editorCallback.
     */
    private addPluginCommand(options: {
        id: string;
        name: string;
        callback?: () => void;
        editorCallback?: (editor: any) => void;
    }) {
        this.addCommand(options);
    }

    /**
     * Helper to insert a separator with correct spacing in the editor.
     * @param editor The editor instance.
     * @param position The position to insert the separator.
     * @param separator The separator string.
     * @returns The line number after the inserted separator.
     */
    private insertSeparator(editor: any, position: any, separator: string): number {
        const lineContent = editor.getLine(position.line) ?? '';
        const prefix = lineContent.trim() !== '' ? '\n' : '';
        editor.replaceRange(`${prefix}\n${separator}\n`, position);
        return position.line + (prefix ? 1 : 0) + 2;
    }

    /**
     * Helper to move the cursor after inserting text in the editor.
     * @param editor The editor instance.
     * @param startPos The starting position of the insertion.
     * @param insertText The text that was inserted.
     */
    private moveCursorAfterInsert(editor: any, startPos: any, insertText: string) {
        const lines = insertText.split('\n');
        if (lines.length === 1) {
            editor.setCursor({
                line: startPos.line,
                ch: startPos.ch + insertText.length
            });
        } else {
            editor.setCursor({
                line: startPos.line + lines.length - 1,
                ch: lines[lines.length - 1].length
            });
        }
    }

    /**
     * Helper to show an Obsidian notice.
     * @param message The message to display.
     */
    private showNotice(message: string) {
        new Notice(message);
    }

    /**
     * Helper for clipboard actions with a notice.
     * @param text The text to copy.
     * @param successMsg The message to show on success.
     * @param failMsg The message to show on failure.
     */
    private async copyToClipboard(text: string, successMsg: string, failMsg: string) {
        try {
            await navigator.clipboard.writeText(text);
            this.showNotice(successMsg);
        } catch (error) {
            this.showNotice(failMsg);
            console.error('Clipboard error:', error);
        }
    }

    /**
     * Helper to activate the chat view and load messages into it.
     * @param messages An array of messages to load.
     */
    private async activateChatViewAndLoadMessages(messages: Message[]) {
        await this.activateChatView();
        const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_CHAT);
        if (!leaves.length) {
            this.showNotice('Could not find chat view.');
            return;
        }
        const chatView = leaves[0].view as ChatView;
        chatView.clearMessages();
        for (const msg of messages) {
            if (msg.role === 'user' || msg.role === 'assistant') {
                await chatView["addMessage"](msg.role, msg.content);
            }
        }
        chatView.scrollMessagesToBottom();
        this.showNotice('Loaded chat note into chat.');
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
    private async handleAICompletion(editor: any) {
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

        console.log('Extracted text for completion:', text);

        const messages = parseSelection(text, this.settings.chatSeparator);
        if (messages.length === 0) {
            this.showNotice('No valid messages found in the selection.');
            return;
        }

        const sepLine = this.insertSeparator(editor, insertPosition, this.settings.chatSeparator);
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
            this.showNotice(`Error: ${error.message}`);
            const errLineContent = editor.getLine(currentPosition.line) ?? '';
            const errPrefix = errLineContent.trim() !== '' ? '\n' : '';
            editor.replaceRange(`Error: ${error.message}\n${errPrefix}\n${this.settings.chatSeparator}\n\n`, currentPosition);
        } finally {
            this.activeStream = null;
        }
    }

    async onload() {
        await this.loadSettings();
        this.addSettingTab(new MyPluginSettingTab(this.app, this));

        this.registerPluginView(VIEW_TYPE_MODEL_SETTINGS, (leaf) => new ModelSettingsView(leaf, this));
        this.registerPluginView(VIEW_TYPE_CHAT, (leaf) => new ChatView(leaf, this));

        this.addRibbon('file-sliders', 'Open AI Settings', () => this.activateView());
        this.addRibbon('message-square', 'Open AI Chat', () => this.activateChatView());

        this.app.workspace.onLayoutReady(() => {
            if (this.settings.autoOpenModelSettings) {
                this.activateView();
            }
        });

        this.addPluginCommand({
            id: 'ai-completion',
            name: 'Get AI Completion',
            editorCallback: (editor) => this.handleAICompletion(editor)
        });

        this.addPluginCommand({
            id: 'end-ai-stream',
            name: 'End AI Stream',
            callback: () => {
                if (this.activeStream) {
                    this.activeStream.abort();
                    this.activeStream = null;
                    this.showNotice('AI stream ended');
                } else {
                    this.showNotice('No active AI stream to end');
                }
            }
        });

        this.addPluginCommand({
            id: 'show-ai-settings',
            name: 'Show AI Settings',
            callback: () => this.activateView()
        });

        this.addPluginCommand({
            id: 'show-ai-chat',
            name: 'Show AI Chat',
            callback: () => this.activateChatView()
        });

        this.addPluginCommand({
            id: 'copy-active-note-name',
            name: 'Copy Active Note Name',
            callback: async () => {
                const activeFile = this.app.workspace.getActiveFile();
                if (activeFile) {
                    const noteName = `[[${activeFile.basename}]]`;
                    await this.copyToClipboard(noteName, `Copied to clipboard: ${noteName}`, 'Failed to copy to clipboard');
                } else {
                    this.showNotice('No active note found');
                }
            }
        });

        this.addPluginCommand({
            id: 'insert-chat-start-string',
            name: 'Insert Chat Start String',
            editorCallback: (editor) => {
                const chatStartString = this.settings.chatStartString ?? '';
                if (!chatStartString) {
                    this.showNotice('chatStartString is not set in settings.');
                    return;
                }
                const cursor = editor.getCursor();
                editor.replaceRange(chatStartString, cursor);
                this.moveCursorAfterInsert(editor, cursor, chatStartString);
            }
        });

        this.addPluginCommand({
            id: 'generate-note-title',
            name: 'Generate Note Title',
            callback: async () => {
                const { generateNoteTitle } = await import("./filechanger");
                await generateNoteTitle(
                    this.app,
                    this.settings,
                    (messages) => this.processMessages(messages)
                );
            }
        });

        this.addPluginCommand({
            id: 'load-chat-note-into-chat',
            name: 'Load Chat Note into Chat',
            callback: async () => {
                let file: TFile | null = this.app.workspace.getActiveFile();
                if (!file) {
                    this.showNotice('No active note found. Please open a note to load as chat.');
                    return;
                }
                let content = await this.app.vault.read(file);
                const messages = parseSelection(content, this.settings.chatSeparator);
                if (!messages.length) {
                    this.showNotice('No chat messages found in the selected note.');
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
                this.addPluginCommand({
                    id,
                    name: gen.commandName,
                    callback: async () => {
                        const { generateYamlAttribute } = await import("./filechanger");
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

    /**
     * Retrieves the system message based on current plugin settings.
     * @returns The system message string.
     */
    public getSystemMessage(): string {
        return getSystemMessage(this.settings);
    }

    /**
     * Activates and reveals a specific view type in the workspace.
     * Defaults to the model settings view.
     * @param viewType The type of view to activate.
     */
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

    /**
     * Activates and reveals the chat view.
     */
    async activateChatView() {
        await this.activateView(VIEW_TYPE_CHAT);
    }

    /**
     * Loads plugin settings from data.
     */
    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    /**
     * Saves plugin settings to data.
     * Also re-registers YAML attribute commands and emits a settings change event.
     */
    async saveSettings() {
        await this.saveData(this.settings);
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
