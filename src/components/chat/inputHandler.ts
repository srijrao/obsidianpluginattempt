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

    
    textarea.addEventListener('keydown', async (e) => {
        
        if (await handleKeyboardShortcuts(e)) return;
        
        
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
    
    
    messagesContainer.addEventListener('keydown', async (e) => {
        
        await handleKeyboardShortcuts(e);
    });
}
