import { Editor, Plugin } from 'obsidian';
import { registerCommand } from '../utils/pluginUtils';
import { handleAICompletion } from '../utils/aiCompletionHandler';
import { showNotice } from '../utils/generalUtils';
import { MyPluginSettings, Message } from '../types';
import { getSystemMessage } from '../utils/systemMessage';

/**
 * Registers AI stream-related commands.
 * @param plugin The plugin instance.
 */
export function registerAIStreamCommands(
    plugin: Plugin,
    settings: MyPluginSettings,
    processMessages: (messages: Message[]) => Promise<Message[]>,
    activeStream: { current: AbortController | null },
    setActiveStream: (stream: AbortController | null) => void
) {
    registerCommand(
        plugin,
        {
            id: 'ai-completion',
            name: 'Get AI Completion',
            editorCallback: (editor: Editor) => handleAICompletion(
                editor,
                settings,
                processMessages,
                () => getSystemMessage(settings),
                activeStream,
                setActiveStream
            )
        }
    );

    registerCommand(
        plugin,
        {
            id: 'end-ai-stream',
            name: 'End AI Stream',
            callback: () => {
                if (activeStream.current) {
                    activeStream.current.abort();
                    activeStream.current = null;
                    setActiveStream(null);
                    showNotice('AI stream ended');
                } else {
                    showNotice('No active AI stream to end');
                }
            }
        }
    );
}
