/**
 * Utility class for common dialog helpers in Obsidian plugin settings tabs.
 */
export class DialogHelpers {
    /**
     * Shows a confirmation dialog
     */
    static showConfirmationDialog(title: string, message: string): Promise<boolean> {
        return new Promise((resolve) => {
            const modal = document.createElement('div');
            modal.className = 'modal';
            modal.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background-color: rgba(0, 0, 0, 0.5);
                display: flex;
                justify-content: center;
                align-items: center;
                z-index: 1000;
            `;

            const content = modal.createDiv();
            content.className = 'modal-content';
            content.style.cssText = `
                background-color: var(--background-primary);
                padding: 2rem;
                border-radius: 8px;
                max-width: 400px;
                width: 90%;
                box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            `;

            content.createEl('h3', { text: title });
            content.createEl('p', { text: message });

            const buttonContainer = content.createDiv();
            buttonContainer.style.cssText = `
                display: flex;
                gap: 1rem;
                justify-content: flex-end;
                margin-top: 1rem;
            `;

            const cancelBtn = buttonContainer.createEl('button', { text: 'Cancel' });
            cancelBtn.onclick = () => {
                document.body.removeChild(modal);
                resolve(false);
            };

            const confirmBtn = buttonContainer.createEl('button', { text: 'Confirm', cls: 'mod-cta' });
            confirmBtn.onclick = () => {
                document.body.removeChild(modal);
                resolve(true);
            };

            document.body.appendChild(modal);

            
            modal.onclick = (e) => {
                if (e.target === modal) {
                    document.body.removeChild(modal);
                    resolve(false);
                }
            };
        });
    }
}
