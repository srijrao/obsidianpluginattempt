

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
    loadedHistory: any[], 
    chatHistoryManager: any,
    plugin: any,
    regenerateResponse: (el: HTMLElement) => void,
    scrollToBottom?: boolean
}) {    messagesContainer.empty();
    const renderer = new MessageRenderer(plugin.app);
    
    for (const msg of loadedHistory) {
        if (msg.sender === 'user' || msg.sender === 'assistant') {
            
            const toolData = renderer.parseToolDataFromContent(msg.content);
            
            let messageData = msg;
            let cleanContent = msg.content;
            
            if (toolData) {
                
                messageData = { 
                    ...msg, 
                    toolResults: toolData.toolResults,
                    reasoning: toolData.reasoning,
                    taskStatus: toolData.taskStatus
                };
                
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
                plugin, 
                messageData 
            );
            messageEl.dataset.timestamp = msg.timestamp;
            messagesContainer.appendChild(messageEl);
        }
    }
    if (scrollToBottom) {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
}
