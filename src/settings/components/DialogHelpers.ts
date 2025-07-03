/**
 * Utility class for common dialog helpers in Obsidian plugin settings tabs.
 * Provides static methods to display various types of dialogs.
 */
export class DialogHelpers {
    /**
     * Shows a confirmation dialog to the user.
     * This is a custom modal implementation, not using Obsidian's built-in Modal class directly.
     * @param title The title of the confirmation dialog.
     * @param message The message to display in the dialog.
     * @returns A Promise that resolves to true if the user confirms, false otherwise.
     */
    static showConfirmationDialog(title: string, message: string): Promise<boolean> {
        return new Promise((resolve) => {
            // Create the modal overlay element
            const modal = document.createElement('div');
            modal.className = 'ai-assistant-modal';

            // Create the modal content box
            const content = modal.createDiv();
            content.className = 'ai-assistant-modal-content';

            // Add title and message to the content
            content.createEl('h3', { text: title });
            content.createEl('p', { text: message });

            // Create button container
            const buttonContainer = content.createDiv();
            buttonContainer.className = 'ai-assistant-modal-buttons';

            // Create Cancel button
            const cancelBtn = buttonContainer.createEl('button', { text: 'Cancel' });
            cancelBtn.onclick = () => {
                document.body.removeChild(modal);
                resolve(false);
            };

            // Create Confirm button
            const confirmBtn = buttonContainer.createEl('button', { text: 'Confirm', cls: 'mod-cta' });
            confirmBtn.onclick = () => {
                document.body.removeChild(modal);
                resolve(true);
            };

            // Append the modal to the document body
            document.body.appendChild(modal);

            // Close modal if clicking outside the content area
            modal.onclick = (e) => {
                if (e.target === modal) {
                    document.body.removeChild(modal);
                    resolve(false);
                }
            };
        });
    }
}
