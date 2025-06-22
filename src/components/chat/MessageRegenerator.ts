import { Notice, MarkdownRenderer, Component } from 'obsidian';
import { Message } from '../../types';
import MyPlugin from '../../main';
import { ChatHistoryManager } from './ChatHistoryManager';
import { createMessageElement } from './Message';
import { ResponseStreamer } from './ResponseStreamer';
import { AgentResponseHandler } from './agent/AgentResponseHandler';

/**
 * Handles message regeneration logic
 */
export class MessageRegenerator {
    private responseStreamer: ResponseStreamer;

    constructor(
        private plugin: MyPlugin,
        private messagesContainer: HTMLElement,
        private inputContainer: HTMLElement,
        private chatHistoryManager: ChatHistoryManager,
        private agentResponseHandler: AgentResponseHandler | null,
        private activeStream: AbortController | null,
        private component?: Component
    ) {
        this.responseStreamer = new ResponseStreamer(
            plugin,
            agentResponseHandler,
            messagesContainer,
            activeStream,
            component
        );
    }

    async regenerateResponse(messageEl: HTMLElement, buildContextMessages: () => Promise<Message[]>): Promise<void> {
        // Disable input during regeneration
        const textarea = this.inputContainer.querySelector('textarea');
        if (textarea) textarea.disabled = true;

        // Find all message elements
        const allMessages = Array.from(this.messagesContainer.querySelectorAll('.ai-chat-message'));
        const currentIndex = allMessages.indexOf(messageEl);
        const isUserClicked = messageEl.classList.contains('user');

        // Find the target AI message to overwrite
        let targetIndex = -1;
        if (isUserClicked) {
            // If user message: find the next AI message after this user message
            for (let i = currentIndex + 1; i < allMessages.length; i++) {
                if (allMessages[i].classList.contains('assistant')) {
                    targetIndex = i;
                    break;
                }
                if (allMessages[i].classList.contains('user')) {
                    break; // Stop if another user message is found first
                }
            }
        } else {
            // If AI message: target is this message
            targetIndex = currentIndex;
        }

        // Gather context up to and including the relevant user message
        let userMsgIndex = currentIndex;
        if (!isUserClicked) {
            userMsgIndex = currentIndex - 1;
            while (userMsgIndex >= 0 && !allMessages[userMsgIndex].classList.contains('user')) {
                userMsgIndex--;
            }
        }

        // Build context messages and include prior chat history
        const messages = await buildContextMessages();
        for (let i = 0; i <= userMsgIndex; i++) {
            const el = allMessages[i];
            const role = el.classList.contains('user') ? 'user' : 'assistant';
            const content = (el as HTMLElement).dataset.rawContent || '';
            messages.push({ role, content });
        }

        // Remove the old AI message if overwriting
        let originalTimestamp = new Date().toISOString();
        let originalContent = '';
        let insertAfterNode: HTMLElement | null = null;
        if (targetIndex !== -1) {
            const targetEl = allMessages[targetIndex] as HTMLElement;
            originalTimestamp = targetEl.dataset.timestamp || originalTimestamp;
            originalContent = targetEl.dataset.rawContent || '';
            insertAfterNode = targetEl.previousElementSibling as HTMLElement;
            targetEl.remove();
        } else if (isUserClicked) {
            // No AI message to overwrite, insert after user message
            insertAfterNode = messageEl;
        } else {
            // No user message found, insert at top
            insertAfterNode = null;
        }

        // Create new assistant message container for streaming
        const assistantContainer = await createMessageElement(
            this.plugin.app, 
            'assistant', 
            '', 
            this.chatHistoryManager, 
            this.plugin, 
            (el) => this.regenerateResponse(el, buildContextMessages), 
            this.component || null as any
        );
        assistantContainer.dataset.timestamp = originalTimestamp;
        
        if (insertAfterNode && insertAfterNode.nextSibling) {
            this.messagesContainer.insertBefore(assistantContainer, insertAfterNode.nextSibling);
        } else {
            this.messagesContainer.appendChild(assistantContainer);
        }
        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;

        try {
            await this.responseStreamer.streamAssistantResponse(
                messages, 
                assistantContainer, 
                originalTimestamp, 
                originalContent
            );
        } catch (error) {
            if (error.name !== 'AbortError') {
                new Notice(`Error: ${error.message}`);
                assistantContainer.remove();
            }        } finally {
            if (textarea) {
                textarea.disabled = false;
                textarea.focus();
            }
            this.activeStream = null;
            // Progress indicator removed
        }
    }
}
