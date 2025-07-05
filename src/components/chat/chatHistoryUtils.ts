import { createMessageElement } from './Message';
import { parseToolDataFromContent, cleanContentFromToolData } from '../../utils/messageContentParser';

/**
 * Renders the chat history into the provided messages container.
 * Handles both user and assistant messages, including tool data parsing and message reconstruction.
 * 
 * @param messagesContainer The DOM element to render messages into.
 * @param loadedHistory Array of chat message objects (from ChatHistoryManager).
 * @param chatHistoryManager The chat history manager instance.
 * @param plugin The plugin instance (for app access, settings, etc.).
 * @param regenerateResponse Callback for regenerating a response (used by message actions).
 * @param scrollToBottom Whether to scroll to the bottom after rendering (default: true).
 */
export async function renderChatHistory({
    messagesContainer,
    loadedHistory,
    chatHistoryManager,
    plugin,
    regenerateResponse,
    scrollToBottom = true
}: {
    messagesContainer: HTMLElement,
    loadedHistory: any[], 
    chatHistoryManager: any,
    plugin: any,
    regenerateResponse: (el: HTMLElement) => void,
    scrollToBottom?: boolean
}) {
    // Clear the container before rendering
    messagesContainer.empty();

    // Iterate through each message in the loaded history
    for (const msg of loadedHistory) {
        // Only render user and assistant messages
        if (msg.sender === 'user' || msg.sender === 'assistant') {
            // Parse tool data (if present) from the message content
            const toolData = parseToolDataFromContent(msg.content);

            let messageData = msg;
            let cleanContent = msg.content;

            // If tool data is found, extract and clean up the message
            if (toolData) {
                messageData = { 
                    ...msg, 
                    toolResults: toolData.toolResults,
                    reasoning: toolData.reasoning,
                    taskStatus: toolData.taskStatus
                };
                cleanContent = cleanContentFromToolData(msg.content);
                messageData.content = cleanContent;
            }

            // Create the message element (user or assistant)
            const messageEl = await createMessageElement(
                plugin.app,
                msg.sender as 'user' | 'assistant',
                cleanContent,
                chatHistoryManager,
                plugin,
                regenerateResponse,
                plugin,      // Pass plugin again for legacy compatibility
                messageData  // Pass the full message data for enhanced rendering
            );
            // Attach timestamp for reference (used for editing/deleting)
            messageEl.dataset.timestamp = msg.timestamp;
            messagesContainer.appendChild(messageEl);
        }
    }
    // Optionally scroll to the bottom after rendering
    if (scrollToBottom) {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
}
