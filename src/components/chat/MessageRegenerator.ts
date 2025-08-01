import { Notice, MarkdownRenderer, Component } from 'obsidian';
import { Message } from '../../types';
import MyPlugin from '../../main';
import { ChatHistoryManager } from './ChatHistoryManager';
import { createMessageElement } from './Message';
import { ResponseStreamer } from './ResponseStreamer';
import { AgentResponseHandler } from '../agent/AgentResponseHandler';

/**
 * MessageRegenerator handles the logic for regenerating assistant responses in the chat.
 * It finds the appropriate message(s) to replace, builds the correct context, and streams the new response.
 */
export class MessageRegenerator {
    private responseStreamer: ResponseStreamer;

    /**
     * @param plugin The plugin instance
     * @param messagesContainer The chat messages container element
     * @param inputContainer The chat input container element (for disabling input during regeneration)
     * @param chatHistoryManager The chat history manager instance
     * @param agentResponseHandler The agent response handler (for agent mode)
     * @param activeStream The current AbortController for streaming (shared reference)
     * @param component Optional parent component for Markdown rendering context
     */
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

    /**
     * Regenerates an assistant response for a given message element.
     * Finds the correct user/assistant message pair, builds the context, and streams a new response.
     * @param messageEl The message element to regenerate (user or assistant)
     * @param buildContextMessages Function to build the initial context messages (system/context notes/etc.)
     */
    async regenerateResponse(messageEl: HTMLElement, buildContextMessages: () => Promise<Message[]>): Promise<void> {
        // Disable the input textarea during regeneration
        const textarea = this.inputContainer.querySelector('textarea');
        if (textarea) textarea.disabled = true;

        // Get all chat message elements and find the index of the clicked message
        const allMessages = Array.from(this.messagesContainer.querySelectorAll('.ai-chat-message'));
        const currentIndex = allMessages.indexOf(messageEl);
        const isUserClicked = messageEl.classList.contains('user');

        // Find the assistant message to replace (after user, or self if assistant)
        let targetIndex = -1;
        if (isUserClicked) {
            // Find the next assistant message after the user message
            for (let i = currentIndex + 1; i < allMessages.length; i++) {
                if (allMessages[i].classList.contains('assistant')) {
                    targetIndex = i;
                    break;
                }
                if (allMessages[i].classList.contains('user')) {
                    break; // Stop at next user message
                }
            }
        } else {
            // If assistant message clicked, target is self
            targetIndex = currentIndex;
        }

        // Find the last user message index before the assistant (for context)
        let userMsgIndex = currentIndex;
        if (!isUserClicked) {
            userMsgIndex = currentIndex - 1;
            while (userMsgIndex >= 0 && !allMessages[userMsgIndex].classList.contains('user')) {
                userMsgIndex--;
            }
        }

        // Build the context messages (system, context notes, etc.)
        const messages = await buildContextMessages();
        // Add all messages up to the user message as context
        for (let i = 0; i <= userMsgIndex; i++) {
            const el = allMessages[i];
            const role = el.classList.contains('user') ? 'user' : 'assistant';
            const content = (el as HTMLElement).dataset.rawContent || '';
            messages.push({ role, content });
        }

        // Prepare for replacing the assistant message
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
            insertAfterNode = messageEl;
        } else {
            insertAfterNode = null;
        }

        // Create a new assistant message element for the regenerated response
        const assistantContainer = await createMessageElement(
            this.plugin.app, 
            'assistant', 
            '', 
            this.chatHistoryManager, 
            this.plugin, 
            (el) => this.regenerateResponse(el, buildContextMessages), 
            this.component || new Component()
        );
        assistantContainer.dataset.timestamp = originalTimestamp;

        // Insert the new assistant message in the correct position
        if (insertAfterNode && insertAfterNode.nextSibling) {
            this.messagesContainer.insertBefore(assistantContainer, insertAfterNode.nextSibling);
        } else {
            this.messagesContainer.appendChild(assistantContainer);
        }
        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;

        try {
            // Stream the new assistant response
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
            }
        } finally {
            // Re-enable the input textarea
            if (textarea) {
                textarea.disabled = false;
                textarea.focus();
            }
            this.activeStream = null;
        }
    }
}
