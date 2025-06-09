import { App, Plugin, Setting, WorkspaceLeaf, ItemView, Notice, TFile } from 'obsidian';
import { MyPluginSettings, Message, DEFAULT_SETTINGS } from './types';
import { createProvider, createProviderFromUnifiedModel } from '../providers';
import { MyPluginSettingTab } from './settings';
import { ChatView, VIEW_TYPE_CHAT } from './components/chat';
import { parseSelection } from './components/parseSelection';
import { ModelSettingsView } from './components/ModelSettingsView';
import { processMessages, getContextNotesContent } from './components/noteUtils';
import { debounce } from './components/utils';
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
        this.addRibbonIcon('file-sliders', 'Open AI Settings', () => {
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
                
                // Get the content of the line where we want to insert the separator
                const lineContent = editor.getLine(insertPosition.line) ?? '';
                
                // This variable will hold a newline character if we need to add one before the separator
                let prefix = '';
                
                // If the current line is not empty (has text), add a newline before the separator
                if (lineContent.trim() !== '') {
                    prefix = '\n';
                }
                
                // Insert the separator with a single blank line before and after
                editor.replaceRange(`${prefix}\n${this.settings.chatSeparator}\n`, insertPosition);
                
                // Calculate the new position for the cursor after inserting the separator
                // - If we added a prefix, move down one line
                // - Move down one line for the newline before separator
                // - Move down one line for the separator itself
                let currentPosition = {
                    line: insertPosition.line + (prefix ? 1 : 0) + 2,
                    ch: 0
                };

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

        this.addCommand({
            id: 'copy-active-note-name',
            name: 'Copy Active Note Name',
            callback: async () => {
                const activeFile = this.app.workspace.getActiveFile();
                if (activeFile) {
                    const noteName = `[[${activeFile.basename}]]`;
                    try {
                        await navigator.clipboard.writeText(noteName);
                        new Notice(`Copied to clipboard: ${noteName}`);
                    } catch (error) {
                        new Notice('Failed to copy to clipboard');
                        console.error('Clipboard error:', error);
                    }
                } else {
                    new Notice('No active note found');
                }
            }
        });

        this.addCommand({
            id: 'insert-chat-start-string',
            name: 'Insert Chat Start String',
            editorCallback: (editor) => {
                const chatStartString = this.settings.chatStartString ?? '';
                if (!chatStartString) {
                    new Notice('chatStartString is not set in settings.');
                    return;
                }
                const cursor = editor.getCursor();
                editor.replaceRange(chatStartString, cursor);

                // Move cursor to the end of the inserted chatStartString
                const lines = chatStartString.split('\n');
                if (lines.length === 1) {
                    // Single line insert
                    editor.setCursor({
                        line: cursor.line,
                        ch: cursor.ch + chatStartString.length
                    });
                } else {
                    // Multi-line insert
                    editor.setCursor({
                        line: cursor.line + lines.length - 1,
                        ch: lines[lines.length - 1].length
                    });
                }
            }
        });

        // Generate Note Title Command
        this.addCommand({
            id: 'generate-note-title',
            name: 'Generate Note Title',
            callback: async () => {
                // Import here to avoid circular dependency issues if any
                const { generateNoteTitle } = await import("./filechanger");
                await generateNoteTitle(
                    this.app,
                    this.settings,
                    (messages) => this.processMessages(messages)
                );
            }
        });

        // this.addCommand({
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

        this.addCommand({
            id: 'load-chat-note-into-chat',
            name: 'Load Chat Note into Chat',
            callback: async () => {
                let file: TFile | null = this.app.workspace.getActiveFile();
                if (!file) {
                    new Notice('No active note found. Please open a note to load as chat.');
                    return;
                }
                let content = await this.app.vault.read(file);
                const messages = parseSelection(content, this.settings.chatSeparator);
                if (!messages.length) {
                    new Notice('No chat messages found in the selected note.');
                    return;
                }
                await this.activateChatView();
                const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_CHAT);
                if (!leaves.length) {
                    new Notice('Could not find chat view.');
                    return;
                }
                const chatView = leaves[0].view as ChatView;
                // Clear chat UI (and history will be rebuilt as we add messages)
                chatView.clearMessages();
                // Add each parsed message
                for (const msg of messages) {
                    if (msg.role === 'user' || msg.role === 'assistant') {
                        await chatView["addMessage"](msg.role, msg.content);
                    }
                }
                chatView.scrollMessagesToBottom();
                new Notice('Loaded chat note into chat.');
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
                this.addCommand({
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
}
