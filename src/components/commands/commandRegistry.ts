import MyPlugin from "../../main";
import { MyPluginSettings, Message } from "../../types";
import {
    registerViewCommands,
    registerAIStreamCommands,
    registerNoteCommands,
    registerGenerateNoteTitleCommand,
    registerContextCommands,
    registerToggleCommands,
} from ".";
import { registerYamlAttributeCommands } from "../../YAMLHandler";
import { registerVectorStoreCommands } from "./vectorStoreCommands";
import { debugLog } from "../../utils/logger"; // Changed from log to debugLog

export function registerAllCommands(
    plugin: MyPlugin,
    settings: MyPluginSettings,
    processMessages: (messages: Message[]) => Promise<Message[]>,
    activateChatViewAndLoadMessages: (messages: Message[]) => Promise<void>,
    activeStream: { current: AbortController | null },
    setActiveStream: (stream: AbortController | null) => void,
    yamlAttributeCommandIds: string[]
) {
    registerViewCommands(plugin);
    registerAIStreamCommands(plugin, settings, processMessages, activeStream, setActiveStream);
    registerNoteCommands(plugin, settings, activateChatViewAndLoadMessages);
    registerGenerateNoteTitleCommand(plugin, settings, processMessages);
    registerContextCommands(plugin, settings);
    registerToggleCommands(plugin, settings);
    registerVectorStoreCommands(plugin);
    return registerYamlAttributeCommands(
        plugin,
        settings,
        processMessages,
        yamlAttributeCommandIds,
        (level, ...args) => {
            return debugLog(settings.debugMode ?? false, level, ...args); // Changed from log to debugLog
        }
    );
}
