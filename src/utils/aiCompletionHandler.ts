import { Editor, Vault } from 'obsidian';
import { MyPluginSettings, Message } from '../types';
import { parseSelection } from './parseSelection';
import { showNotice, insertSeparator } from './generalUtils';
import { debugLog } from '../utils/logger';
import { AIDispatcher } from './aiDispatcher';
import { buildContextMessages } from './contextBuilder';

/**
 * Handles the AI completion logic for the editor.
 * This function extracts text from the editor, sends it to an AI model via the dispatcher,
 * and streams the AI's response back into the editor.
 *
 * The dispatcher automatically handles:
 * - Request/response caching
 * - Rate limiting and queuing
 * - Retry logic with circuit breaker
 * - Request validation and preprocessing
 * - Automatic saving of all AI calls
 * - Stream management
 *
 * @param editor The current Obsidian editor instance.
 * @param settings The plugin settings, containing configurations for AI models and behavior.
 * @param processMessages An asynchronous function to process and potentially modify messages before sending to the AI.
 * @param getSystemMessage A function that returns the system message to be included in the AI prompt.
 * @param vault The Obsidian vault instance for file operations.
 * @param plugin The plugin instance for accessing settings and save functionality.
 * @param activeStream Legacy parameter - now managed by dispatcher (kept for compatibility).
 * @param setActiveStream Legacy parameter - now managed by dispatcher (kept for compatibility).
 * @param app The Obsidian app instance for accessing workspace and files (optional, will use plugin.app if not provided).
 */
export async function handleAICompletion(
    editor: Editor,
    settings: MyPluginSettings,
    processMessages: (messages: Message[]) => Promise<Message[]>,
    getSystemMessage: () => string,
    vault: Vault,
    plugin: { settings: MyPluginSettings; saveSettings: () => Promise<void> },
    activeStream: { current: AbortController | null },
    setActiveStream: (stream: AbortController | null) => void,
    app?: any
) {
    let text: string;
    let insertPosition;

    // If the user has selected text, use that as the prompt and insert after the selection.
    if (editor.somethingSelected()) {
        text = editor.getSelection();
        insertPosition = editor.getCursor('to');
    } else {
        // Otherwise, use all lines up to the current line as the prompt.
        const currentLineNumber = editor.getCursor().line;
        let lines: string[] = [];
        for (let i = 0; i <= currentLineNumber; i++) {
            lines.push(editor.getLine(i));
        }

        // If a chat start string is configured, only use lines after that marker.
        const chatStartString = settings.chatStartString;
        if (chatStartString) {
            const startIdx = lines.findIndex(line => line.trim() === chatStartString.trim());
            if (startIdx !== -1) {
                lines = lines.slice(startIdx + 1);
            }
        }
        text = lines.join('\n');
        // Insert after the current line.
        insertPosition = { line: currentLineNumber + 1, ch: 0 };
    }

    // Parse the selected text into messages using the configured separator.
    const messages = parseSelection(text, settings.chatSeparator);
    if (messages.length === 0) {
        showNotice('No valid messages found in the selection.');
        return;
    }

    // Insert a separator line at the insertion position and update the cursor.
    const sepLine = insertSeparator(editor, insertPosition, settings.chatSeparator);
    let currentPosition = { line: sepLine, ch: 0 };

    try {
        // Use the plugin's central AI dispatcher if available, otherwise create one
        const myPlugin = plugin as any;
        const dispatcher = myPlugin.aiDispatcher || new AIDispatcher(vault, plugin);

        // Build context messages for editor completion: include context notes, but never the full current note.
        const contextMessages = await buildContextMessages({
            app: app || myPlugin.app,
            plugin: myPlugin,
            includeCurrentNote: false,
            includeContextNotes: true,
            forceNoCurrentNote: true
        });

        // Preprocess messages, adding the context messages at the start.
        const processedMessages = await processMessages([
            ...contextMessages,
            ...messages
        ]);

        // Buffer for streaming chunks from the AI.
        let bufferedChunk = '';
        // Flushes the buffer into the editor and updates the cursor position.
        const flushBuffer = () => {
            if (bufferedChunk) {
                editor.replaceRange(bufferedChunk, currentPosition);
                currentPosition = editor.offsetToPos(
                    editor.posToOffset(currentPosition) + bufferedChunk.length
                );
                bufferedChunk = '';
            }
        };

        // Request a completion from the dispatcher, streaming the response.
        // The dispatcher handles caching, rate limiting, retries, and automatic saving
        await dispatcher.getCompletion(
            processedMessages,
            {
                temperature: settings.temperature,
                maxTokens: settings.maxTokens,
                streamCallback: (chunk: string) => {
                    bufferedChunk += chunk;
                    setTimeout(flushBuffer, 100); // Flush buffer every 100ms.
                }
                // Note: abortController is now managed internally by the dispatcher
            }
        );

        // Final flush to ensure all content is inserted.
        flushBuffer();

        // Insert a separator after the completion, and move the cursor to the new position.
        const endLineContent = editor.getLine(currentPosition.line) ?? '';
        const endPrefix = endLineContent.trim() !== '' ? '\n' : '';
        editor.replaceRange(`${endPrefix}\n${settings.chatSeparator}\n\n`, currentPosition);
        const newCursorPos = editor.offsetToPos(
            editor.posToOffset(currentPosition) + (endPrefix ? 1 : 0) + 1 + settings.chatSeparator.length + 1
        );
        editor.setCursor(newCursorPos);
    } catch (error: any) {
        // On error, show a notice and insert the error message into the editor.
        showNotice(`Error: ${error.message}`);
        debugLog(settings.debugMode ?? false, 'error', 'AI Completion Error:', error);
        const errLineContent = editor.getLine(currentPosition.line) ?? '';
        const errPrefix = errLineContent.trim() !== '' ? '\n' : '';
        editor.replaceRange(`Error: ${error.message}\n${errPrefix}\n${settings.chatSeparator}\n\n`, currentPosition);
    }
    // Note: Stream management is now handled by the dispatcher, no cleanup needed here
}
