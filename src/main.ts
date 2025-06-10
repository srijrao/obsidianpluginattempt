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

    // --- Settings change event emitter ---
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

    // Track view registration to prevent duplicate registration errors
    private static registeredViewTypes = new Set<string>();

    // DRY: Helper to add a ribbon icon
    private addRibbon(icon: string, title: string, callback: () => void) {
        this.addRibbonIcon(icon, title, callback);
    }

    // DRY: Helper to add a command
    private addPluginCommand(options: {
        id: string;
        name: string;
        callback?: () => void;
        editorCallback?: (editor: any) => void;
    }) {
        this.addCommand(options);
    }

    // DRY: Helper to insert separator with correct spacing
    private insertSeparator(editor: any, position: any, separator: string) {
        const lineContent = editor.getLine(position.line) ?? '';
        let prefix = '';
        if (lineContent.trim() !== '') {
            prefix = '\n';
        }
        editor.replaceRange(`${prefix}\n${separator}\n`, position);
        return position.line + (prefix ? 1 : 0) + 2;
    }

    // DRY: Helper to move cursor after inserting text
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

    // DRY: Helper to show a notice
    private showNotice(message: string) {
        new Notice(message);
    }

    // DRY: Helper for clipboard actions with notice
    private async copyToClipboard(text: string, successMsg: string, failMsg: string) {
        try {
            await navigator.clipboard.writeText(text);
            this.showNotice(successMsg);
        } catch (error) {
            this.showNotice(failMsg);
            console.error('Clipboard error:', error);
        }
    }

    // DRY: Helper to activate chat view and load messages
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

    async onload() {
        await this.loadSettings();
        this.addSettingTab(new MyPluginSettingTab(this.app, this));

        // Register views only if not already registered
        if (!MyPlugin.registeredViewTypes.has(VIEW_TYPE_MODEL_SETTINGS)) {
            this.registerView(
                VIEW_TYPE_MODEL_SETTINGS,
                (leaf) => new ModelSettingsView(leaf, this)
            );
            MyPlugin.registeredViewTypes.add(VIEW_TYPE_MODEL_SETTINGS);
        }

        if (!MyPlugin.registeredViewTypes.has(VIEW_TYPE_CHAT)) {
            this.registerView(
                VIEW_TYPE_CHAT,
                (leaf) => new ChatView(leaf, this)
            );
            MyPlugin.registeredViewTypes.add(VIEW_TYPE_CHAT);
        }

        // DRY: Add ribbon icons
        this.addRibbon('file-sliders', 'Open AI Settings', () => this.activateView());
        this.addRibbon('message-square', 'Open AI Chat', () => this.activateChatView());

        this.app.workspace.onLayoutReady(() => {
            if (this.settings.autoOpenModelSettings) {
                this.activateView();
            }
        });

        // DRY: Add commands
        this.addPluginCommand({
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
                    // Use the current cursor line as the request
                    const currentLineNumber = editor.getCursor().line;
                    // Get all lines from the top of the file up to and including the current line
                    let lines: string[] = [];
                    for (let i = 0; i <= currentLineNumber; i++) {
                        lines.push(editor.getLine(i));
                    }

                    // Check for chatStartString in the lines and slice if found
                    const chatStartString = this.settings.chatStartString;
                    if (chatStartString) {
                        const startIdx = lines.findIndex(line => line.trim() === chatStartString.trim());
                        if (startIdx !== -1) {
                            // Exclude the chatStartString line itself from the context
                            lines = lines.slice(startIdx + 1);
                        }
                    }

                    text = lines.join('\n');

                    // Set insertion point to be immediately after the current line
                    insertPosition = { line: currentLineNumber + 1, ch: 0 };
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

                // Ensure there's a clear separation between user request and AI response
                
                // Use DRY helper for separator insertion
                const sepLine = this.insertSeparator(editor, insertPosition, this.settings.chatSeparator);
                let currentPosition = { line: sepLine, ch: 0 };

                this.activeStream = new AbortController();                try {
                    // Use unified model if available, fallback to legacy provider selection
                    const provider = this.settings.selectedModel 
                        ? createProviderFromUnifiedModel(this.settings, this.settings.selectedModel)
                        : createProvider(this.settings);
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

                    // Insert the separator after the AI response with correct spacing
                    const endLineContent = editor.getLine(currentPosition.line) ?? '';
                    let endPrefix = '';
                    if (endLineContent.trim() !== '') {
                        endPrefix = '\n';
                    }
                    editor.replaceRange(`${endPrefix}\n${this.settings.chatSeparator}\n\n`, currentPosition);
                    const newCursorPos = editor.offsetToPos(
                        editor.posToOffset(currentPosition) + (endPrefix ? 1 : 0) + 1 + this.settings.chatSeparator.length + 1
                    );
                    editor.setCursor(newCursorPos);
                } catch (error) {
                    new Notice(`Error: ${error.message}`);
                    // Insert error with correct spacing
                    const errLineContent = editor.getLine(currentPosition.line) ?? '';
                    let errPrefix = '';
                    if (errLineContent.trim() !== '') {
                        errPrefix = '\n';
                    }
                    editor.replaceRange(`Error: ${error.message}\n${errPrefix}\n${this.settings.chatSeparator}\n\n`, currentPosition);
                } finally {
                    this.activeStream = null;
                }
            }
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

        // this.addPluginCommand({
        //     id: 'generate-note-summary',
        //     name: 'Generate Note Summary',
        //     callback: async () => {
        //         const { generateNoteSummary } = await import("./filechanger");
        //         await generateNoteSummary(
        //             this.app,
        //             this.settings,
        //             (messages) => this.processMessages(messages)
        //         );
        //     }
        // });
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
        // --- Register YAML Attribute Generator Commands ---
        this.registerYamlAttributeCommands();
    }

    /**
     * Register YAML attribute generator commands dynamically based on settings.
     * Unregisters previous commands before registering new ones.
     */
    private registerYamlAttributeCommands() {
        // Unregister previous commands
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

    public getSystemMessage(): string {
        return getSystemMessage(this.settings);
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
        this.registerYamlAttributeCommands(); // Update commands after saving settings
        this.emitSettingsChange(); // Notify listeners
    }

    private async processMessages(messages: Message[]): Promise<Message[]> {
        return processMessages(messages, this.app, this.settings);
    }

    public async getContextNotesContent(contextNotesText: string): Promise<string> {
        return getContextNotesContent(contextNotesText, this.app);
    }

    onunload() {
        // Unregister views to allow re-registration on reload
        MyPlugin.registeredViewTypes.delete(VIEW_TYPE_MODEL_SETTINGS);
        MyPlugin.registeredViewTypes.delete(VIEW_TYPE_CHAT);
    }
}
