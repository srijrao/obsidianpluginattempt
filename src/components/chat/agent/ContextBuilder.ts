import { App } from 'obsidian';
import { Message } from '../../../types';
import MyPlugin from '../../../main';
import { getSystemMessage } from '../../../utils/systemMessage';
import { processContextNotes } from '../../../../src/utils/noteUtils';

/**
 * ContextBuilder is responsible for constructing the initial context messages
 * for AI conversations, including system prompts, context notes, and optionally
 * the content of the currently active note.
 */
export class ContextBuilder {
    /**
     * @param app The Obsidian App instance.
     * @param plugin The plugin instance (for settings and logging).
     */
    constructor(
        private app: App,
        private plugin: MyPlugin
    ) {}

    /**
     * Builds an array of context messages for the AI conversation.
     * Includes the system message, context notes (if enabled), and the current note (if referenced).
     * @returns Promise resolving to an array of Message objects.
     */
    async buildContextMessages(): Promise<Message[]> {
        // Start with the system message.
        const messages: Message[] = [
            { role: 'system', content: getSystemMessage(this.plugin.settings) }
        ];

        // Optionally append context notes to the system message.
        if (this.plugin.settings.enableContextNotes && this.plugin.settings.contextNotes) {
            const contextContent = await processContextNotes(this.plugin.settings.contextNotes, this.plugin.app);
            messages[0].content += `\n\nContext Notes:\n${contextContent}`;
        }

        // Optionally add the content of the current note as a separate system message.
        if (this.plugin.settings.referenceCurrentNote) {
            const currentFile = this.app.workspace.getActiveFile();
            if (currentFile) {
                const currentNoteContent = await this.app.vault.cachedRead(currentFile);
                messages.push({
                    role: 'system',
                    content: `Here is the content of the current note (${currentFile.path}):\n\n${currentNoteContent}`
                });
            }
        }

        // Debug logging for context building if enabled.
        if (this.plugin.settings.debugMode) {
            this.plugin.debugLog('debug', '[ContextBuilder] Building context messages', {
                enableContextNotes: this.plugin.settings.enableContextNotes,
                contextNotes: this.plugin.settings.contextNotes,
                referenceCurrentNote: this.plugin.settings.referenceCurrentNote
            });
        }

        return messages;
    }

    /**
     * Updates the UI indicator for referencing the current note.
     * Shows or hides the indicator and updates the button state.
     * @param referenceNoteIndicator The HTMLElement to update.
     */
    updateReferenceNoteIndicator(referenceNoteIndicator: HTMLElement): void {
        if (!referenceNoteIndicator) return;

        const currentFile = this.app.workspace.getActiveFile();
        const isReferenceEnabled = this.plugin.settings.referenceCurrentNote;
        const button = referenceNoteIndicator.previousElementSibling as HTMLButtonElement;

        if (isReferenceEnabled && currentFile) {
            referenceNoteIndicator.setText(`📝 Referencing: ${currentFile.basename}`);
            referenceNoteIndicator.style.display = 'block';
            if (button && button.getAttribute('aria-label') === 'Toggle referencing current note') {
                button.setText('📝');
                button.classList.add('active');
            }
        } else {
            referenceNoteIndicator.style.display = 'none';
            if (button && button.getAttribute('aria-label') === 'Toggle referencing current note') {
                button.setText('📝');
                button.classList.remove('active');
            }
        }
    }
}
