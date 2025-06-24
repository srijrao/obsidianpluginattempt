import { App } from 'obsidian';
import { Message } from '../../../types';
import MyPlugin from '../../../main';

/**
 * Handles building context messages for AI conversations
 */
export class ContextBuilder {
    constructor(
        private app: App,
        private plugin: MyPlugin
    ) {}

    async buildContextMessages(): Promise<Message[]> {
        const messages: Message[] = [
            { role: 'system', content: this.plugin.getSystemMessage() }
        ];

        // Add context notes if enabled
        if (this.plugin.settings.enableContextNotes && this.plugin.settings.contextNotes) {
            const contextContent = await this.plugin.getContextNotesContent(this.plugin.settings.contextNotes);
            messages[0].content += `\n\nContext Notes:\n${contextContent}`;
        }        // Add current note content if enabled
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

        // Debug: Log context building if debugMode is enabled
        if (this.plugin.settings.debugMode) {
            this.plugin.debugLog('[ContextBuilder] Building context messages', {
                enableContextNotes: this.plugin.settings.enableContextNotes,
                contextNotes: this.plugin.settings.contextNotes,
                referenceCurrentNote: this.plugin.settings.referenceCurrentNote
            });
        }

        return messages;
    }

    /**
     * Update reference note indicator
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
