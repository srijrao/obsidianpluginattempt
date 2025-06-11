// Handles chat history rendering and persistence
// import { ChatMessage } from '../../types'; // Remove this line, not exported
import { createMessageElement } from './Message';

export async function renderChatHistory({
    messagesContainer,
    loadedHistory,
    chatHistoryManager,
    plugin,
    regenerateResponse,
    scrollToBottom = true
}: {
    messagesContainer: HTMLElement,
    loadedHistory: any[], // Use any[] if ChatMessage is not exported
    chatHistoryManager: any,
    plugin: any,
    regenerateResponse: (el: HTMLElement) => void,
    scrollToBottom?: boolean
}) {
    messagesContainer.empty();
    for (const msg of loadedHistory) {
        if (msg.sender === 'user' || msg.sender === 'assistant') {
            const messageEl = await createMessageElement(
                plugin.app,
                msg.sender as 'user' | 'assistant',
                msg.content,
                chatHistoryManager,
                plugin,
                regenerateResponse,
                plugin, // parentComponent
                msg // Pass full message object for enhanced data
            );
            messageEl.dataset.timestamp = msg.timestamp;
            messagesContainer.appendChild(messageEl);
        }
    }
    if (scrollToBottom) {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
}
