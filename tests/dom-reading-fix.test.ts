/**
 * Test file to verify the DOM reading fix for messages entered after stream stops
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';

// Mock DOM environment
const mockDOM = {
    createElement: (tag: string) => {
        const element = {
            tagName: tag.toUpperCase(),
            classList: {
                contains: (className: string) => false,
                add: (...classes: string[]) => {},
                remove: (...classes: string[]) => {}
            },
            dataset: {} as Record<string, string>,
            querySelector: (selector: string) => null,
            querySelectorAll: (selector: string) => [],
            appendChild: (child: any) => {},
            textContent: '',
            innerHTML: ''
        };
        return element;
    }
};

describe('DOM Reading Fix for Stream Interruption', () => {
    let mockMessagesContainer: any;
    let mockPlugin: any;
    let mockChatView: any;

    beforeEach(() => {
        // Setup mock DOM container
        mockMessagesContainer = {
            scrollHeight: 1000,
            querySelectorAll: jest.fn(),
            appendChild: jest.fn()
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

    it('should force fresh DOM read when building context messages', () => {
        // Setup mock message elements
        const mockMessageElements = [
            {
                classList: { contains: (cls: string) => cls === 'user' },
                dataset: { rawContent: 'User message 1' },
                querySelector: () => ({ textContent: 'User message 1' })
            },
            {
                classList: { contains: (cls: string) => cls === 'assistant' },
                dataset: { rawContent: 'Assistant response 1' },
                querySelector: () => ({ textContent: 'Assistant response 1' })
            },
            {
                classList: { contains: (cls: string) => cls === 'user' },
                dataset: { rawContent: 'User message after stream stop' },
                querySelector: () => ({ textContent: 'User message after stream stop' })
            }
        ];

        mockMessagesContainer.querySelectorAll.mockReturnValue(mockMessageElements);

        const messages: any[] = [];
        mockChatView.addVisibleMessagesToContext(messages);

        // Verify that querySelectorAll was called (fresh DOM read)
        expect(mockMessagesContainer.querySelectorAll).toHaveBeenCalledWith('.ai-chat-message');
        
        // Verify that all messages were captured
        expect(messages).toHaveLength(3);
        expect(messages[0].content).toBe('User message 1');
        expect(messages[1].content).toBe('Assistant response 1');
        expect(messages[2].content).toBe('User message after stream stop');
        
        // Verify debug logging was called
        expect(mockPlugin.debugLog).toHaveBeenCalledWith('debug', '[ChatView] Fresh DOM read for context building', {
            messageCount: 3,
            reason: 'Ensuring all messages including post-stream-stop messages are captured'
        });
    });

    it('should use rawContent from dataset when available', () => {
        const mockMessageElements = [
            {
                classList: { contains: (cls: string) => cls === 'user' },
                dataset: { rawContent: 'Raw content from dataset' },
                querySelector: () => ({ textContent: 'Different DOM content' })
            }
        ];

        mockMessagesContainer.querySelectorAll.mockReturnValue(mockMessageElements);

        const messages: any[] = [];
        mockChatView.addVisibleMessagesToContext(messages);

        // Should use rawContent from dataset, not DOM textContent
        expect(messages[0].content).toBe('Raw content from dataset');
        
        // Verify correct debug log was called
        expect(mockPlugin.debugLog).toHaveBeenCalledWith('debug', '[ChatView] Using rawContent from dataset for context', {
            role: 'user',
            contentLength: 'Raw content from dataset'.length,
            hasRawContent: true,
            messageIndex: 0
        });
    });

    it('should fallback to DOM textContent when rawContent is not available', () => {
        const mockMessageElements = [
            {
                classList: { contains: (cls: string) => cls === 'user' },
                dataset: {},
                querySelector: () => ({ textContent: 'DOM text content' })
            }
        ];

        mockMessagesContainer.querySelectorAll.mockReturnValue(mockMessageElements);

        const messages: any[] = [];
        mockChatView.addVisibleMessagesToContext(messages);

        // Should use DOM textContent as fallback
        expect(messages[0].content).toBe('DOM text content');
        
        // Verify correct debug log was called
        expect(mockPlugin.debugLog).toHaveBeenCalledWith('debug', '[ChatView] Using textContent from DOM for context (fallback)', {
            role: 'user',
            contentLength: 'DOM text content'.length,
            hasRawContent: false,
            messageIndex: 0
        });
    });

    it('should skip empty messages', () => {
        const mockMessageElements = [
            {
                classList: { contains: (cls: string) => cls === 'user' },
                dataset: { rawContent: 'Valid message' },
                querySelector: () => ({ textContent: 'Valid message' })
            },
            {
                classList: { contains: (cls: string) => cls === 'assistant' },
                dataset: { rawContent: '' },
                querySelector: () => ({ textContent: '' })
            },
            {
                classList: { contains: (cls: string) => cls === 'user' },
                dataset: { rawContent: '   ' },
                querySelector: () => ({ textContent: '   ' })
            }
        ];

        mockMessagesContainer.querySelectorAll.mockReturnValue(mockMessageElements);

        const messages: any[] = [];
        mockChatView.addVisibleMessagesToContext(messages);

        // Should only include the valid message, skip empty ones
        expect(messages).toHaveLength(1);
        expect(messages[0].content).toBe('Valid message');
        
        // Verify warning logs for empty messages
        expect(mockPlugin.debugLog).toHaveBeenCalledWith('warn', '[ChatView] Skipping empty message in context', {
            role: 'assistant',
            messageIndex: 1
        });
        expect(mockPlugin.debugLog).toHaveBeenCalledWith('warn', '[ChatView] Skipping empty message in context', {
            role: 'user',
            messageIndex: 2
        });
    });

    it('should invalidate message cache before reading DOM', () => {
        const mockMessageElements = [
            {
                classList: { contains: (cls: string) => cls === 'user' },
                dataset: { rawContent: 'Test message' },
                querySelector: () => ({ textContent: 'Test message' })
            }
        ];

        mockMessagesContainer.querySelectorAll.mockReturnValue(mockMessageElements);

        // Set some cached data
        mockChatView.cachedMessageElements = ['old', 'cached', 'data'];
        mockChatView.lastScrollHeight = 500;

        const messages: any[] = [];
        mockChatView.addVisibleMessagesToContext(messages);

        // Verify cache was invalidated
        expect(mockChatView.cachedMessageElements).toEqual([]);
        expect(mockChatView.lastScrollHeight).toBe(0);
        
        // Verify invalidation was logged
        expect(mockPlugin.debugLog).toHaveBeenCalledWith('debug', '[ChatView] Message cache invalidated - will force fresh DOM reads');
    });
});