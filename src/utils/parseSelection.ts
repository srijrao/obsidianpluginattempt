import { Message } from '../types';

/**
 * Parses a given text selection into an array of message objects
 * 
 * The function interprets lines of text separated by chatBoundaryString (defaults to '----') as boundaries
 * between user and assistant messages.
 * 
 * @param selection - The text selection to parse
 * @param chatSeparator - The string that separates user and assistant messages
 * @param chatBoundaryString - The string that indicates the start and end of the chat
 * @returns Array of message objects with roles and content
 */
export function parseSelection(
    selection: string,
    chatSeparator: string,
    chatBoundaryString?: string
): Message[] {
    
    let insideChat = !chatBoundaryString;

    const lines = selection.split('\n');
    let messages: Message[] = [];
    let currentRole: 'user' | 'assistant' = 'user';
    let currentContent = '';

    for (const line of lines) {
        if (chatBoundaryString && line.trim() === chatBoundaryString) {
            
            if (!insideChat && currentContent.trim()) {
                messages.push({ role: currentRole, content: currentContent.trim() });
                currentContent = '';
            }
            insideChat = !insideChat;
            continue;
        }

        if (!insideChat) continue; 

        if (line.trim() === chatSeparator) {
            
            if (currentContent.trim()) {
                messages.push({ role: currentRole, content: currentContent.trim() });
            }
            currentRole = currentRole === 'user' ? 'assistant' : 'user';
            currentContent = '';
        } else {
            currentContent += line + '\n';
        }
    }

    
    if (currentContent.trim()) {
        messages.push({ role: currentRole, content: currentContent.trim() });
    }

    return messages;
}
