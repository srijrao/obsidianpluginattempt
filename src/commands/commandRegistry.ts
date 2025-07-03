import MyPlugin from "../main";
import { MyPluginSettings, Message } from "../types";
import {
    registerViewCommands,
    registerAIStreamCommands,
    registerNoteCommands,
    registerGenerateNoteTitleCommand,
    registerContextCommands,
    registerToggleCommands,
} from "../components/commands";
import { registerYamlAttributeCommands } from "../YAMLHandler";
import { log } from "../utils/logger"; // Changed from debugLog to log

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
    return registerYamlAttributeCommands(
        plugin,
        settings,
        processMessages,
        yamlAttributeCommandIds,
        (level, ...args) => {
            return log(settings.debugMode ?? false, level, ...args); // Changed from debugLog to log
        }
    );
}
