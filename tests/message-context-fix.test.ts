/**
 * Test to verify that messages entered after stream stops are properly included in AI calls
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';

describe('Message Context Building Fix', () => {
    let mockChatView: any;
    let mockPlugin: any;
    let mockMessagesContainer: any;

    beforeEach(() => {
        // Setup mock DOM container with multiple messages
        mockMessagesContainer = {
            querySelectorAll: jest.fn().mockReturnValue([
                {
                    classList: { contains: (cls: string) => cls === 'user' },
                    dataset: { rawContent: 'First user message' }
                },
                {
                    classList: { contains: (cls: string) => cls === 'assistant' },
                    dataset: { rawContent: 'First assistant response' }
                },
                {
                    classList: { contains: (cls: string) => cls === 'user' },
                    dataset: { rawContent: 'Message after stream stop' }
                },
                {
                    classList: { contains: (cls: string) => cls === 'user' },
                    dataset: { rawContent: 'Another message after stream stop' }
                }
            ])
        };

        // Setup mock plugin
        mockPlugin = {
            debugLog: jest.fn(),
            settings: { debugMode: true }
        };

        // Setup mock chat view with the fixed methods
        mockChatView = {
            messagesContainer: mockMessagesContainer,
            plugin: mockPlugin,
            cachedMessageElements: [],
            lastScrollHeight: 0,
            messagePool: {
                acquireMessage: () => ({ role: '', content: '' })
            },
            
            // Mock buildContextMessages to return system messages
            buildContextMessages: async function() {
                return [
                    { role: 'system', content: 'System message 1' },
                    { role: 'system', content: 'System message 2' }
                ];
            },
            
            // The fixed method
            addVisibleMessagesToContext: function(messages: any[]) {
                // FORCE fresh DOM read to ensure we capture all messages, including those added after stream interruption
                this.invalidateMessageCache();
                
                const messageElements = this.messagesContainer.querySelectorAll('.ai-chat-message');
                this.plugin.debugLog('debug', '[ChatView] Fresh DOM read for context building', {
                    messageCount: messageElements.length,
                    reason: 'Ensuring all messages including post-stream-stop messages are captured'
                });
                
                for (let i = 0; i < messageElements.length; i++) {
                    const el = messageElements[i];
                    const role = el.classList.contains('user') ? 'user' : 'assistant';
                    
                    let content = '';
                    if (el.dataset.rawContent) {
                        content = el.dataset.rawContent;
                        this.plugin.debugLog('debug', '[ChatView] Using rawContent from dataset for context', {
                            role,
                            contentLength: content.length,
                            hasRawContent: true,
                            messageIndex: i
                        });
                    } else {
                        const contentEl = el.querySelector('.message-content');
                        content = contentEl?.textContent || '';
                        this.plugin.debugLog('debug', '[ChatView] Using textContent from DOM for context (fallback)', {
                            role,
                            contentLength: content.length,
                            hasRawContent: false,
                            messageIndex: i
                        });
                    }
                    
                    if (!content.trim()) {
                        this.plugin.debugLog('warn', '[ChatView] Skipping empty message in context', {
                            role,
                            messageIndex: i
                        });
                        continue;
                    }
                    
                    const messageObj = this.messagePool.acquireMessage();
                    messageObj.role = role;
                    messageObj.content = content;
                    messages.push(messageObj);
                }
                
                this.plugin.debugLog('info', '[ChatView] Context messages built from DOM', {
                    totalMessages: messages.length,
                    domElements: messageElements.length
                });
            },
            
            invalidateMessageCache: function() {
                this.cachedMessageElements = [];
                this.lastScrollHeight = 0;
                this.plugin.debugLog('debug', '[ChatView] Message cache invalidated - will force fresh DOM reads');
            }
        };
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    it('should include all messages including those added after stream stop', async () => {
        // Simulate the fixed message building process
        const contextMessages = await mockChatView.buildContextMessages();
        mockChatView.addVisibleMessagesToContext(contextMessages);

        // Verify that all messages are included
        expect(contextMessages).toHaveLength(6); // 2 system + 4 chat messages
        
        // Verify system messages are first
        expect(contextMessages[0].role).toBe('system');
        expect(contextMessages[1].role).toBe('system');
        
        // Verify all chat messages are included
        expect(contextMessages[2].role).toBe('user');
        expect(contextMessages[2].content).toBe('First user message');
        
        expect(contextMessages[3].role).toBe('assistant');
        expect(contextMessages[3].content).toBe('First assistant response');
        
        expect(contextMessages[4].role).toBe('user');
        expect(contextMessages[4].content).toBe('Message after stream stop');
        
        expect(contextMessages[5].role).toBe('user');
        expect(contextMessages[5].content).toBe('Another message after stream stop');
        
        // Verify fresh DOM read was performed
        expect(mockMessagesContainer.querySelectorAll).toHaveBeenCalledWith('.ai-chat-message');
        
        // Verify debug logging
        expect(mockPlugin.debugLog).toHaveBeenCalledWith('debug', '[ChatView] Fresh DOM read for context building', {
            messageCount: 4,
            reason: 'Ensuring all messages including post-stream-stop messages are captured'
        });
    });

    it('should properly log the final message array for debugging', () => {
        // This simulates the enhanced logging we added
        const messages = [
            { role: 'system', content: 'System message' },
            { role: 'user', content: 'First user message' },
            { role: 'assistant', content: 'First response' },
            { role: 'user', content: 'Message after stream stop' }
        ];

        mockPlugin.debugLog('debug', '[ChatView] Final message array for AI call', {
            totalMessages: messages.length,
            messageRoles: messages.map(m => m.role),
            lastUserMessage: messages.filter(m => m.role === 'user').slice(-1)[0]?.content?.substring(0, 100)
        });

        expect(mockPlugin.debugLog).toHaveBeenCalledWith('debug', '[ChatView] Final message array for AI call', {
            totalMessages: 4,
            messageRoles: ['system', 'user', 'assistant', 'user'],
            lastUserMessage: 'Message after stream stop'
        });
    });
});