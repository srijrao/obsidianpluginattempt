import { Notice } from 'obsidian';
import { ChatHistoryManager } from './ChatHistoryManager';

/**
 * Creates a delete button with improved UX - no modal, just a red "Sure?" confirmation.
 * First click changes button to red "Sure?", second click deletes the message.
 * @param messageEl The message element to delete
 * @param chatHistoryManager The chat history manager
 * @returns The delete button element
 */
export function createImprovedDeleteButton(messageEl: HTMLElement, chatHistoryManager: ChatHistoryManager): HTMLElement {
    const button = document.createElement('button');
    button.className = 'ai-chat-action-button';
    button.setAttribute('aria-label', 'Delete message');
    
    const labelEl = document.createElement('span');
    labelEl.textContent = 'Delete';
    button.appendChild(labelEl);
    
    let isConfirmMode = false;
    let confirmTimeout: NodeJS.Timeout | null = null;
    
    const resetButton = () => {
        isConfirmMode = false;
        labelEl.textContent = 'Delete';
        button.style.backgroundColor = '';
        button.style.color = '';
        button.setAttribute('aria-label', 'Delete message');
        if (confirmTimeout) {
            clearTimeout(confirmTimeout);
            confirmTimeout = null;
        }
    };
    
    button.addEventListener('click', async (event) => {
        event.preventDefault();
        event.stopPropagation();
        
        if (!isConfirmMode) {
            // First click - enter confirmation mode
            isConfirmMode = true;
            labelEl.textContent = 'Sure?';
            button.style.backgroundColor = 'var(--color-red)';
            button.style.color = 'white';
            button.setAttribute('aria-label', 'Confirm delete message');
            
            // Auto-reset after 3 seconds if not clicked
            confirmTimeout = setTimeout(() => {
                resetButton();
            }, 3000);
        } else {
            // Second click - actually delete
            try {
                await chatHistoryManager.deleteMessage(
                    messageEl.dataset.timestamp || new Date().toISOString(),
                    messageEl.classList.contains('user') ? 'user' : 'assistant',
                    messageEl.dataset.rawContent || ''
                );
                messageEl.remove();
                new Notice('Message deleted');
            } catch (error) {
                console.error('Failed to delete message:', error);
                new Notice('Failed to delete message from history');
            }
            resetButton();
        }
    });
    
    // Reset if user clicks elsewhere
    document.addEventListener('click', (event) => {
        if (!button.contains(event.target as Node)) {
            resetButton();
        }
    });
    
    return button;
}