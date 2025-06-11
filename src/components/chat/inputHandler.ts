import { App } from 'obsidian';
import MyPlugin from '../../main';
import { handleHelp } from './eventHandlers';

type SlashCommandHandler = (cmd: string) => Promise<void> | void;

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
    // Helper function to handle keyboard shortcuts
    const handleKeyboardShortcuts = async (e: KeyboardEvent) => {
        if (e.ctrlKey && e.shiftKey) {
            if (e.key.toLowerCase() === 'x') { e.preventDefault(); await handleSlashCommand('/clear'); return true; } // Changed from 'c' to 'x' for clear
            if (e.key.toLowerCase() === 'c') { e.preventDefault(); await handleSlashCommand('/copy'); return true; } // Changed from 'y' to 'c' for copy (standard copy shortcut)
            if (e.key.toLowerCase() === 's') { e.preventDefault(); await handleSlashCommand('/save'); return true; }
            if (e.key.toLowerCase() === 'o') { e.preventDefault(); await handleSlashCommand('/settings'); return true; }
            if (e.key.toLowerCase() === 'h') { e.preventDefault(); handleHelp(app)(); return true; }
            if (e.key.toLowerCase() === 'r') { e.preventDefault(); await handleSlashCommand('/ref'); return true; }
        }
        return false;
    };

    // Add keyboard shortcut listener to textarea
    textarea.addEventListener('keydown', async (e) => {
        // First, check if it's a keyboard shortcut
        if (await handleKeyboardShortcuts(e)) return;
        
        // Slash commands
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
        // Shift+Enter will fall through and act as a normal Enter (newline)
    });
    
    // Add keyboard shortcut listener to messages container
    messagesContainer.addEventListener('keydown', async (e) => {
        // Only handle keyboard shortcuts in the messages container
        await handleKeyboardShortcuts(e);
    });
}
