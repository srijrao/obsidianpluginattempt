import { Editor, Plugin } from 'obsidian';
import { registerCommand } from '../../utils/pluginUtils';
import { handleAICompletion } from '../../utils/aiCompletionHandler';
import { showNotice } from '../../utils/generalUtils';
import { MyPluginSettings, Message } from '../../types';
import { getSystemMessage } from '../../utils/systemMessage';

/**
 * Registers AI stream-related commands for the plugin.
 * These commands allow users to trigger AI completions and manage active AI streams.
 *
 * @param plugin The Obsidian plugin instance.
 * @param settings The plugin's current settings.
 * @param processMessages A function to process messages before sending them to the AI (e.g., adding context).
 * @param activeStream An object holding the current active AbortController for AI streaming.
 * @param setActiveStream A function to update the active AbortController.
 */
export function registerAIStreamCommands(
    plugin: Plugin,
    settings: MyPluginSettings,
    processMessages: (messages: Message[]) => Promise<Message[]>,
    activeStream: { current: AbortController | null },
    setActiveStream: (stream: AbortController | null) => void
) {
    /**
     * Registers the 'Get AI Completion' command.
     * This command triggers an AI completion based on the content in the active editor.
     */
    registerCommand(
        plugin,
        {
            id: 'ai-completion',
            name: 'Get AI Completion',
            editorCallback: (editor: Editor) => handleAICompletion(
                editor,
                settings,
                processMessages,
                () => getSystemMessage(settings), // Function to get the current system message
                plugin.app.vault,
                { settings, saveSettings: (plugin as any).saveSettings?.bind(plugin) },
                activeStream,
                setActiveStream
            )
        }
    );

    /**
     * Registers the 'End AI Stream' command.
     * This command allows users to manually stop an ongoing AI streaming operation.
     */
    registerCommand(
        plugin,
        {
            id: 'end-ai-stream',
            name: 'End AI Stream',
            callback: () => {
                // Check if there's an active stream
                if (activeStream.current) {
                    // Abort the current stream to stop generation
                    activeStream.current.abort();
                    // Clear the active stream reference
                    activeStream.current = null;
                    setActiveStream(null); // Update the state via the setter
                    showNotice('AI stream ended');
                } else {
                    // Notify the user if no stream is active
                    showNotice('No active AI stream to end');
                }
            }
        }
    );
}
