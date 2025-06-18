// Handles chat history rendering and persistence
// import { ChatMessage } from '../../types'; // Remove this line, not exported
import { createMessageElement } from './Message';
import { MessageRenderer } from './MessageRenderer';

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
}) {    messagesContainer.empty();
    const renderer = new MessageRenderer(plugin.app);
    
    for (const msg of loadedHistory) {
        if (msg.sender === 'user' || msg.sender === 'assistant') {
            // Try to parse embedded tool data from the message content
            const toolData = renderer.parseToolDataFromContent(msg.content);
            
            let messageData = msg;
            let cleanContent = msg.content;
            
            if (toolData) {
                // If we found tool data, enhance the message and clean the content
                messageData = { 
                    ...msg, 
                    toolResults: toolData.toolResults,
                    reasoning: toolData.reasoning,
                    taskStatus: toolData.taskStatus
                };
                // Remove the tool data blocks from content for clean display
                cleanContent = renderer.cleanContentFromToolData(msg.content);
                messageData.content = cleanContent;
            }
            
            const messageEl = await createMessageElement(
                plugin.app,
                msg.sender as 'user' | 'assistant',
                cleanContent,
                chatHistoryManager,
                plugin,
                regenerateResponse,
                plugin, // parentComponent
                messageData // Pass enhanced message object with tool results
            );
            messageEl.dataset.timestamp = msg.timestamp;
            messagesContainer.appendChild(messageEl);
        }
    }
    if (scrollToBottom) {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
}
