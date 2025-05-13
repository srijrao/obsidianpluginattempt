import { App, Plugin, Setting, WorkspaceLeaf, ItemView, Notice, TFile } from 'obsidian';
import { MyPluginSettings, Message, DEFAULT_SETTINGS } from './types';
import { createProvider } from './providers';
import { MyPluginSettingTab } from './settings';
import { ChatView, VIEW_TYPE_CHAT } from './chat';
import { parseSelection } from './parseSelection';
import { ModelSettingsView } from './ModelSettingsView';

const VIEW_TYPE_MODEL_SETTINGS = 'model-settings-view';

/**
 * Creates a debounced version of a function that delays invoking func until after wait milliseconds
 * have elapsed since the last time the debounced function was invoked.
 * 
 * @param func The function to debounce
 * @param wait The number of milliseconds to delay
 */
function debounce<T extends (...args: any[]) => any>(func: T, wait: number): (...args: Parameters<T>) => void {
    let timeout: NodeJS.Timeout;
    return (...args: Parameters<T>) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => func(...args), wait);
    };
}

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
                    // Fallback to extracting text up to the current cursor line
                    const lineNumber = editor.getCursor().line + 1;
                    const documentText = editor.getValue();
                    let startIndex = 0;
                    let endIndex = editor.posToOffset({
                        line: lineNumber,
                        ch: editor.getLine(lineNumber).length // Include the full cursor line
                    });

                    // Use chatStartString and chatEndString if defined
                    if (this.settings.chatStartString) {
                        const startStringIndex = documentText.indexOf(this.settings.chatStartString);
                        if (startStringIndex !== -1) {
                            startIndex = startStringIndex + this.settings.chatStartString.length;
                        }
                    }

                    if (this.settings.chatEndString) {
                        const endStringIndex = documentText.indexOf(this.settings.chatEndString, startIndex);
                        if (endStringIndex !== -1 && endStringIndex < endIndex) {
                            endIndex = endStringIndex;
                        }
                    }

                    // If no chatStartString or chatEndString is found, use the entire document up to the cursor line
                    if (!this.settings.chatStartString && !this.settings.chatEndString) {
                        endIndex = editor.posToOffset({ line: lineNumber, ch: 0 });
                    }

                    text = documentText.substring(startIndex, endIndex).trim();
                    insertPosition = { line: lineNumber + 1, ch: 0 };
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

                // Ensure correct spacing before inserting the separator for the AI's response
                
                // Get the content of the line where we want to insert the separator
                const lineContent = editor.getLine(insertPosition.line) ?? '';
                
                // This variable will hold a newline character if we need to add one before the separator
                let prefix = '';
                
                // If the current line is not empty (has text), add a newline before the separator
                if (lineContent.trim() !== '') {
                    prefix = '\n';
                }
                
                // Get the content of the line after the insertion point
                const nextLineContent = editor.getLine(insertPosition.line + 1) ?? '';
                
                // This variable will hold a newline character if we need to add one after the separator
                let suffix = '';
                
                // If the next line is not empty and does NOT start with a header (doesn't start with '#'),
                // add a newline after the separator to keep things tidy
                if (nextLineContent.trim() !== '' && !nextLineContent.trim().startsWith('#')) {
                    suffix = '\n';
                }
                
                // Insert the separator into the editor, with newlines before and/or after as needed
                editor.replaceRange(`${prefix}${this.settings.chatSeparator}\n${suffix}`, insertPosition);
                
                // Calculate the new position for the cursor after inserting the separator
                // - If we added a prefix, move down one line
                // - Always move down one line for the separator itself
                // - If we added a suffix, move down one more line
                let currentPosition = {
                    line: insertPosition.line + (prefix ? 1 : 0) + 1 + (suffix ? 1 : 0),
                    ch: 0
                };

                this.activeStream = new AbortController();

                try {
                    const provider = createProvider(this.settings);
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

                    // Insert the ending separator with correct spacing
                    const endLineContent = editor.getLine(currentPosition.line) ?? '';
                    let endPrefix = '';
                    if (endLineContent.trim() !== '') {
                        endPrefix = '\n';
                    }
                    editor.replaceRange(`${endPrefix}${this.settings.chatSeparator}\n`, currentPosition);
                    const newCursorPos = editor.offsetToPos(
                        editor.posToOffset(currentPosition) + this.settings.chatSeparator.length + (endPrefix ? 1 : 0) + 1
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
                    editor.replaceRange(`Error: ${error.message}\n${errPrefix}${this.settings.chatSeparator}\n`, currentPosition);
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
    }

    public getSystemMessage(): string {
        let systemMessage = this.settings.systemMessage;

        if (this.settings.includeDateWithSystemMessage) {
            const currentDate = new Date().toISOString().split('T')[0];
            systemMessage = `${systemMessage}\n\nThe current date is ${currentDate}.`;
        }

        if (this.settings.includeTimeWithSystemMessage) {
            const now = new Date();
            const timeZoneOffset = now.getTimezoneOffset();
            const offsetHours = Math.abs(timeZoneOffset) / 60;
            const offsetMinutes = Math.abs(timeZoneOffset) % 60;
            const sign = timeZoneOffset > 0 ? '-' : '+';

            const currentTime = now.toLocaleTimeString();
            const timeZoneString = `UTC${sign}${offsetHours.toString().padStart(2, '0')}:${offsetMinutes.toString().padStart(2, '0')}`;
            systemMessage = `${systemMessage}\n\nThe current time is ${currentTime} ${timeZoneString}.`;
        }

        return systemMessage;
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
    }

    /**
     * Processes a message content to include Obsidian note contents
     * 
     * If a link is found, retrieves the note content and appends it after the link.
     * 
     * @param content The message content to process
     * @returns The processed content with note contents included
     */
    /**
     * Process an array of messages to include Obsidian note contents
     * 
     * @param messages Array of messages to process
     * @returns Promise resolving to processed messages
     */
    private async processMessages(messages: Message[]): Promise<Message[]> {
        const processedMessages: Message[] = [];

        // Prepend context notes if enabled
        if (this.settings.enableContextNotes && this.settings.contextNotes) {
            const contextContent = await this.processContextNotes(this.settings.contextNotes);

            if (contextContent) {
                // Add context as part of the system message or as a separate system message
                if (messages.length > 0 && messages[0].role === 'system') {
                    processedMessages.push({
                        role: 'system',
                        content: `${messages[0].content}\n\nHere is additional context:\n${contextContent}`
                    });
                    messages = messages.slice(1);
                } else {
                    processedMessages.push({
                        role: 'system',
                        content: `Here is context for our conversation:\n${contextContent}`
                    });
                }
            }
        }

        // Process the rest of the messages with Obsidian links if enabled
        for (const message of messages) {
            const processedContent = await this.processObsidianLinks(message.content);
            processedMessages.push({
                role: message.role,
                content: processedContent
            });
        }

        return processedMessages;
    }

    /**
     * Process a single message content to include Obsidian note contents
     * 
     * @param content The message content to process
     * @returns Promise resolving to processed content
     */
    private async processObsidianLinks(content: string): Promise<string> {
        if (!this.settings.enableObsidianLinks) return content;

        const linkRegex = /\[\[(.*?)\]\]/g;
        let match;
        let processedContent = content;

        while ((match = linkRegex.exec(content)) !== null) {
            if (match && match[0] && match[1]) {
                // Split by pipe to handle [[path|display]] format
                const parts = match[1].split('|');
                const filePath = parts[0].trim(); // Get the path part (before pipe)
                const displayText = parts.length > 1 ? parts[1].trim() : filePath; // Get display text if present

                try {
                    // Attempt to retrieve the file by its relative path
                    let file = this.app.vault.getAbstractFileByPath(filePath) || this.app.vault.getAbstractFileByPath(`${filePath}.md`);

                    // If not found, search the entire vault for a matching file name
                    if (!file) {
                        const allFiles = this.app.vault.getFiles();
                        file = allFiles.find(f => f.name === filePath || f.name === `${filePath}.md` ||
                            f.basename.toLowerCase() === filePath.toLowerCase() ||
                            f.path === filePath || f.path === `${filePath}.md`) || null;
                    }

                    // Extract header if specified
                    const headerMatch = filePath.match(/(.*?)#(.*)/);
                    let extractedContent = "";

                    if (file && file instanceof TFile) {
                        const noteContent = await this.app.vault.cachedRead(file);

                        if (headerMatch) {
                            // Extract content under the specified header
                            extractedContent = this.extractContentUnderHeader(
                                noteContent,
                                headerMatch[2].trim()
                            );
                        } else {
                            extractedContent = noteContent;
                        }

                        processedContent = processedContent.replace(
                            match[0],
                            `${match[0]}\n\n---\nNote Name: ${filePath}\nContent:\n${extractedContent}\n---\n`
                        );
                    } else {
                        new Notice(`File not found: ${filePath}. Ensure the file name and path are correct.`);
                    }
                } catch (error) {
                    new Notice(`Error processing link for ${filePath}: ${error.message}`);
                }
            }
        }
        return processedContent;
    }

    /**
     * Extract content under a specific header in a note
     * 
     * @param content The note content
     * @param headerText The header text to find
     * @returns The content under the header until the next header or end of note
     */
    private extractContentUnderHeader(content: string, headerText: string): string {
        const lines = content.split('\n');
        let foundHeader = false;
        let extractedContent = [];
        let headerLevel = 0;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            // Check if this line is a header
            const headerMatch = line.match(/^(#+)\s+(.*?)$/);

            if (headerMatch) {
                const currentHeaderLevel = headerMatch[1].length;
                const currentHeaderText = headerMatch[2].trim();

                if (foundHeader) {
                    // If we already found our target header and now found another header
                    // at the same or higher level, stop extraction
                    if (currentHeaderLevel <= headerLevel) {
                        break;
                    }
                } else if (currentHeaderText.toLowerCase() === headerText.toLowerCase()) {
                    // Found our target header
                    foundHeader = true;
                    headerLevel = currentHeaderLevel;
                    extractedContent.push(line); // Include the header itself
                    continue;
                }
            }

            if (foundHeader) {
                extractedContent.push(line);
            }
        }

        return extractedContent.join('\n');
    }

    public async getContextNotesContent(contextNotesText: string): Promise<string> {
        return this.processContextNotes(contextNotesText);
    }

    /**
     * Process context notes specified in the settings
     * 
     * @param contextNotesText The context notes text with [[note]] syntax
     * @returns The processed context text
     */
    private async processContextNotes(contextNotesText: string): Promise<string> {
        const linkRegex = /\[\[(.*?)\]\]/g;
        let match;
        let contextContent = "";

        while ((match = linkRegex.exec(contextNotesText)) !== null) {
            if (match && match[1]) {
                const fileName = match[1].trim();

                try {
                    // Check if there's a header specified
                    const headerMatch = fileName.match(/(.*?)#(.*)/);
                    const baseFileName = headerMatch ? headerMatch[1].trim() : fileName;
                    const headerName = headerMatch ? headerMatch[2].trim() : null;

                    // Find the file
                    let file = this.app.vault.getAbstractFileByPath(baseFileName) ||
                        this.app.vault.getAbstractFileByPath(`${baseFileName}.md`);

                    if (!file) {
                        const allFiles = this.app.vault.getFiles();
                        file = allFiles.find(f =>
                            f.basename.toLowerCase() === baseFileName.toLowerCase() ||
                            f.name.toLowerCase() === `${baseFileName.toLowerCase()}.md`
                        ) || null;
                    }

                    if (file && file instanceof TFile) {
                        const noteContent = await this.app.vault.cachedRead(file);

                        contextContent += `---\nFrom note: ${file.basename}\n\n`;

                        if (headerName) {
                            // Extract content under the specified header
                            const headerContent = this.extractContentUnderHeader(noteContent, headerName);
                            contextContent += headerContent;
                        } else {
                            contextContent += noteContent;
                        }

                        contextContent += '\n\n';
                    } else {
                        contextContent += `Note not found: ${fileName}\n\n`;
                    }
                } catch (error) {
                    contextContent += `Error processing note ${fileName}: ${error.message}\n\n`;
                }
            }
        }

        return contextContent;
    }
}
