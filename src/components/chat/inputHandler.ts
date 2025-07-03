import { App } from 'obsidian';
import MyPlugin from '../../main';
import { handleHelp } from './eventHandlers';

type SlashCommandHandler = (cmd: string) => Promise<void> | void;

/**
 * Sets up input and keyboard event handlers for the chat input and message container.
 * Handles slash commands, Enter/Shift+Enter, and keyboard shortcuts.
 * 
 * @param textarea The chat input textarea element
 * @param messagesContainer The chat messages container element
 * @param sendMessage Function to send the current message
 * @param handleSlashCommand Function to handle slash commands (e.g. /clear)
 * @param app The Obsidian App instance
 * @param plugin The plugin instance
 * @param sendButton The Send button element (not used here, but may be for future extension)
 * @param stopButton The Stop button element (not used here, but may be for future extension)
 */
export function setupInputHandler(
    textarea: HTMLTextAreaElement,
    messagesContainer: HTMLElement,
    sendMessage: () => Promise<void>,
    handleSlashCommand: SlashCommandHandler,
    app: App,
    plugin: MyPlugin,
    sendButton: HTMLButtonElement,
    stopButton: HTMLButtonElement
) {
    /**
     * Handles global keyboard shortcuts (Ctrl+Shift+X, etc.) for chat commands.
     * @param e KeyboardEvent
     * @returns true if a shortcut was handled, false otherwise
     */
    const handleKeyboardShortcuts = async (e: KeyboardEvent) => {
        if (e.ctrlKey && e.shiftKey) {
            if (e.key.toLowerCase() === 'x') { e.preventDefault(); await handleSlashCommand('/clear'); return true; } 
            if (e.key.toLowerCase() === 'c') { e.preventDefault(); await handleSlashCommand('/copy'); return true; } 
            if (e.key.toLowerCase() === 's') { e.preventDefault(); await handleSlashCommand('/save'); return true; }
            if (e.key.toLowerCase() === 'o') { e.preventDefault(); await handleSlashCommand('/settings'); return true; }
            if (e.key.toLowerCase() === 'h') { e.preventDefault(); handleHelp(app)(); return true; }
            if (e.key.toLowerCase() === 'r') { e.preventDefault(); await handleSlashCommand('/ref'); return true; }
        }
        return false;
    };

    // Handle keydown events in the textarea (input box)
    textarea.addEventListener('keydown', async (e) => {
        // Handle keyboard shortcuts first
        if (await handleKeyboardShortcuts(e)) return;

        // Handle Enter/Shift+Enter and slash commands
        if (e.key === 'Enter' && !e.shiftKey) {
            const val = textarea.value.trim();
            if (val === '/clear' || val === '/copy' || val === '/save' || val === '/settings' || val === '/help' || val === '/ref') {
                e.preventDefault();
                await handleSlashCommand(val);
                textarea.value = '';
                return;
            }
            await sendMessage();
            e.preventDefault();
        }
    });

    // Handle keyboard shortcuts when the messages container is focused
    messagesContainer.addEventListener('keydown', async (e) => {
        await handleKeyboardShortcuts(e);
    });
}
