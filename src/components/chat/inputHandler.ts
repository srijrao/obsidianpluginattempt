import { App } from 'obsidian';
import MyPlugin from '../../main';
import { handleHelp } from './eventHandlers';

type SlashCommandHandler = (cmd: string) => Promise<void> | void;

export function setupInputHandler(
    textarea: HTMLTextAreaElement,
    sendMessage: () => Promise<void>,
    handleSlashCommand: SlashCommandHandler,
    app: App,
    plugin: MyPlugin,
    sendButton: HTMLButtonElement,
    stopButton: HTMLButtonElement
) {
    textarea.addEventListener('keydown', async (e) => {
        // Keyboard shortcuts: Ctrl+Shift+C (Clear), Y (Copy), S (Save), O (Settings), H (Help)
        if (e.ctrlKey && e.shiftKey) {
            if (e.key.toLowerCase() === 'c') { e.preventDefault(); await handleSlashCommand('/clear'); return; }
            if (e.key.toLowerCase() === 'y') { e.preventDefault(); await handleSlashCommand('/copy'); return; }
            if (e.key.toLowerCase() === 's') { e.preventDefault(); await handleSlashCommand('/save'); return; }
            if (e.key.toLowerCase() === 'o') { e.preventDefault(); await handleSlashCommand('/settings'); return; }
            if (e.key.toLowerCase() === 'h') { e.preventDefault(); handleHelp(app)(); return; }
        }
        // Slash commands
        if (e.key === 'Enter' && !e.shiftKey) {
            const val = textarea.value.trim();
            if (val === '/clear' || val === '/copy' || val === '/save' || val === '/settings' || val === '/help') {
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
}
