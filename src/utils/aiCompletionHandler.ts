import { Editor } from 'obsidian';
import { MyPluginSettings, Message } from '../types';
import { createProvider, createProviderFromUnifiedModel } from '../../providers';
import { parseSelection } from './parseSelection';
import { showNotice, insertSeparator } from './generalUtils';

/**
 * Handles the AI completion logic for the editor.
 * This function extracts text from the editor, sends it to an AI model,
 * and streams the AI's response back into the editor.
 *
 * @param editor The current Obsidian editor instance.
 * @param settings The plugin settings, containing configurations for AI models and behavior.
 * @param processMessages An asynchronous function to process and potentially modify messages before sending to the AI.
 * @param getSystemMessage A function that returns the system message to be included in the AI prompt.
 * @param activeStream An object holding the current AbortController for managing the AI stream, allowing it to be cancelled.
 * @param setActiveStream A function to update the active stream controller.
 */
export async function handleAICompletion(
    editor: Editor,
    settings: MyPluginSettings,
    processMessages: (messages: Message[]) => Promise<Message[]>,
    getSystemMessage: () => string,
    activeStream: { current: AbortController | null },
    setActiveStream: (stream: AbortController | null) => void
) {
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

        const chatStartString = settings.chatStartString;
        if (chatStartString) {
            const startIdx = lines.findIndex(line => line.trim() === chatStartString.trim());
            if (startIdx !== -1) {
                lines = lines.slice(startIdx + 1);
            }
        }
        text = lines.join('\n');
        insertPosition = { line: currentLineNumber + 1, ch: 0 };
    }

    const messages = parseSelection(text, settings.chatSeparator);
    if (messages.length === 0) {
        showNotice('No valid messages found in the selection.');
        return;
    }

    const sepLine = insertSeparator(editor, insertPosition, settings.chatSeparator);
    let currentPosition = { line: sepLine, ch: 0 };

    activeStream.current = new AbortController();
    setActiveStream(activeStream.current);
    try {
        const provider = settings.selectedModel
            ? createProviderFromUnifiedModel(settings, settings.selectedModel)
            : createProvider(settings);
        const processedMessages = await processMessages([
            { role: 'system', content: getSystemMessage() },
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
                temperature: settings.temperature,
                maxTokens: settings.maxTokens,
                streamCallback: (chunk: string) => {
                    bufferedChunk += chunk;
                    setTimeout(flushBuffer, 100);
                },
                abortController: activeStream.current
            }
        );

        flushBuffer();

        const endLineContent = editor.getLine(currentPosition.line) ?? '';
        const endPrefix = endLineContent.trim() !== '' ? '\n' : '';
        editor.replaceRange(`${endPrefix}\n${settings.chatSeparator}\n\n`, currentPosition);
        const newCursorPos = editor.offsetToPos(
            editor.posToOffset(currentPosition) + (endPrefix ? 1 : 0) + 1 + settings.chatSeparator.length + 1
        );
        editor.setCursor(newCursorPos);
    } catch (error: any) {
        showNotice(`Error: ${error.message}`);
        const errLineContent = editor.getLine(currentPosition.line) ?? '';
        const errPrefix = errLineContent.trim() !== '' ? '\n' : '';
        editor.replaceRange(`Error: ${error.message}\n${errPrefix}\n${settings.chatSeparator}\n\n`, currentPosition);
    } finally {
        activeStream.current = null;
        setActiveStream(null);
    }
}
