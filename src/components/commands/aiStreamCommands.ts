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
                plugin.app.vault,
                { settings, saveSettings: (plugin as any).saveSettings?.bind(plugin) },
                activeStream,
                setActiveStream,
                plugin.app
            )
        }
    );

    /**
     * Registers the 'End AI Stream' command.
     * This command stops all active streams using the centralized StreamCoordinator.
     */
    registerCommand(
        plugin,
        {
            id: 'end-ai-stream',
            name: 'End AI Stream',
            callback: () => {
                const myPlugin = plugin as any;
                
                // Stop streams using centralized StreamCoordinator
                if (myPlugin.streamCoordinator) {
                    myPlugin.streamCoordinator.stopStream();
                    showNotice('All AI streams stopped');
                    myPlugin.debugLog('info', '[aiStreamCommands] Stopped streams via StreamCoordinator');
                } else {
                    showNotice('No active AI stream to end');
                    myPlugin.debugLog('warn', '[aiStreamCommands] StreamCoordinator not available');
                }
            }
        }
    );

    /**
     * Registers a debug command to test AI stream management.
     */
    registerCommand(
        plugin,
        {
            id: 'debug-ai-streams',
            name: 'Debug AI Streams',
            callback: () => {
                const myPlugin = plugin as any;
                let message = 'AI Stream Debug Info:\n';
                
                // Check legacy activeStream
                message += `Legacy activeStream: ${activeStream.current ? 'Active' : 'None'}\n`;
                
                // Check AI dispatcher streams
                if (myPlugin.aiDispatcher) {
                    const streamCount = myPlugin.aiDispatcher.getActiveStreamCount();
                    message += `AI Dispatcher streams: ${streamCount}\n`;
                    message += `Has active streams method: ${typeof myPlugin.aiDispatcher.hasActiveStreams}\n`;
                } else {
                    message += 'AI Dispatcher: Not initialized\n';
                }
                
                // Check plugin-level methods
                message += `Plugin hasActiveAIStreams method: ${typeof myPlugin.hasActiveAIStreams}\n`;
                message += `Plugin stopAllAIStreams method: ${typeof myPlugin.stopAllAIStreams}\n`;
                
                if (myPlugin.hasActiveAIStreams) {
                    message += `Has active AI streams: ${myPlugin.hasActiveAIStreams()}\n`;
                }
                
                showNotice(message);
                console.log('[AI Assistant Debug]', message);
            }
        }
    );

}
