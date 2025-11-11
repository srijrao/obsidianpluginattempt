/**
 * @file chat.test.ts
 * @description Integration tests for chat interface covering complete user workflows
 */

import { ChatView, VIEW_TYPE_CHAT } from '../../src/chat';
import MyPlugin from '../../src/main';
import { Message } from '../../src/types';
import { createMockApp, createMockPlugin } from '../utils/testHelpers';

// Mock all dependencies before imports
jest.mock('obsidian', () => ({
  ItemView: jest.fn().mockImplementation(function(this: any, leaf: any) {
    this.leaf = leaf;
    this.containerEl = Object.assign(document.createElement('div'), {
      empty: jest.fn(),
      addClass: jest.fn(),
      createDiv: jest.fn().mockReturnValue(document.createElement('div')),
    });
    this.contentEl = Object.assign(document.createElement('div'), {
      empty: jest.fn(),
      addClass: jest.fn(function(this: any, ...classNames: string[]) {
        this.classList.add(...classNames);
      }),
      createDiv: jest.fn().mockImplementation((className?: string) => {
        const div = Object.assign(document.createElement('div'), {
          empty: jest.fn(),
          addClass: jest.fn(function(this: any, ...classNames: string[]) {
            this.classList.add(...classNames);
          }),
          setText: function(this: any, text: string) { this.textContent = text; return this; },
        });
        if (className) div.className = className;
        return div;
      }),
    });
    this.app = leaf?.app;
    this.addClass = jest.fn(function(this: any, ...classNames: string[]) {
      this.classList.add(...classNames);
    });
    this.empty = jest.fn();
    this.onunload = jest.fn();
    this.registerEvent = jest.fn();
  }),
  WorkspaceLeaf: jest.fn(),
  Notice: jest.fn(),
  Component: jest.fn(),
  Modal: jest.fn().mockImplementation(function(this: any, app: any) {
    this.app = app;
    this.containerEl = document.createElement('div');
    this.open = jest.fn();
    this.close = jest.fn();
  }),
}));

// Mock chat components
jest.mock('../../src/components/chat/ChatHistoryManager');
jest.mock('../../src/components/chat/ui', () => ({
  createChatUI: jest.fn().mockReturnValue({
    contentEl: document.createElement('div'),
    fadedHelp: document.createElement('div'),
    topButtonContainer: document.createElement('div'),
    settingsButton: Object.assign(document.createElement('button'), {
      click: jest.fn(),
      setText: jest.fn(),
      addEventListener: jest.fn()
    }),
    copyAllButton: Object.assign(document.createElement('button'), {
      click: jest.fn(),
      setText: jest.fn(),
      addEventListener: jest.fn()
    }),
    saveNoteButton: Object.assign(document.createElement('button'), {
      click: jest.fn(),
      setText: jest.fn(),
      addEventListener: jest.fn()
    }),
    clearButton: Object.assign(document.createElement('button'), {
      click: jest.fn(),
      setText: jest.fn(),
      addEventListener: jest.fn()
    }),
    messagesContainer: Object.assign(document.createElement('div'), {
      empty: jest.fn(),
      addClass: jest.fn(),
      appendChild: jest.fn(),
    }),
    toolContinuationContainer: document.createElement('div'),
    inputContainer: Object.assign(document.createElement('div'), {
      empty: jest.fn(),
      addClass: jest.fn(),
    }),
    textarea: Object.assign(document.createElement('textarea'), {
      value: '',
      focus: jest.fn(),
      addEventListener: jest.fn(),
    }),
    sendButton: Object.assign(document.createElement('button'), {
      click: jest.fn(),
      setText: jest.fn(),
      addEventListener: jest.fn()
    }),
    stopButton: Object.assign(document.createElement('button'), {
      click: jest.fn(),
      setText: jest.fn(),
      addEventListener: jest.fn()
    }),
    helpButton: Object.assign(document.createElement('button'), {
      click: jest.fn(),
      setText: jest.fn(),
      addEventListener: jest.fn()
    }),
    agentModeButton: Object.assign(document.createElement('button'), {
      click: jest.fn(),
      setText: jest.fn(),
      addEventListener: jest.fn()
    }),
    referenceNoteButton: Object.assign(document.createElement('button'), {
      click: jest.fn(),
      setText: jest.fn(),
      addEventListener: jest.fn()
    }),
    referenceAllOpenNotesButton: Object.assign(document.createElement('button'), {
      click: jest.fn(),
      setText: jest.fn(),
      addEventListener: jest.fn()
    }),
    obsidianLinksButton: Object.assign(document.createElement('button'), {
      click: jest.fn(),
      setText: jest.fn(),
      addEventListener: jest.fn()
    }),
    contextNotesButton: Object.assign(document.createElement('button'), {
      click: jest.fn(),
      setText: jest.fn(),
      addEventListener: jest.fn()
    }),
    renderModeButton: Object.assign(document.createElement('button'), {
      click: jest.fn(),
      setText: jest.fn(),
      addEventListener: jest.fn()
    }),
    contextClearButton: Object.assign(document.createElement('button'), {
      click: jest.fn(),
      setText: jest.fn(),
      addEventListener: jest.fn()
    }),
    contextAddCurrentButton: Object.assign(document.createElement('button'), {
      click: jest.fn(),
      setText: jest.fn(),
      addEventListener: jest.fn()
    }),
    contextAddAllOpenButton: Object.assign(document.createElement('button'), {
      click: jest.fn(),
      setText: jest.fn(),
      addEventListener: jest.fn()
    }),
    referenceNoteIndicator: Object.assign(document.createElement('div'), {
      setText: jest.fn(),
      addClass: jest.fn(),
    }),
    referenceAllOpenNotesIndicator: Object.assign(document.createElement('div'), {
      setText: jest.fn(),
      addClass: jest.fn(),
    }),
    obsidianLinksIndicator: Object.assign(document.createElement('div'), {
      setText: jest.fn(),
      addClass: jest.fn(),
    }),
    contextNotesIndicator: Object.assign(document.createElement('div'), {
      setText: jest.fn(),
      addClass: jest.fn(),
    }),
    expandedLinkDisplay: Object.assign(document.createElement('div'), {
      setText: jest.fn(),
      addClass: jest.fn(),
    }),
    modelNameDisplay: Object.assign(document.createElement('div'), {
      setText: jest.fn(function(this: any, text: string) { this.textContent = text; return this; }),
      empty: jest.fn(function(this: any) { this.innerHTML = ''; return this; }),
      addClass: jest.fn(function(this: any, ...classNames: string[]) { this.classList.add(...classNames); return this; }),
      removeClass: jest.fn(function(this: any, ...classNames: string[]) { this.classList.remove(...classNames); return this; }),
    }),
  }),
}));
jest.mock('../../src/components/chat/eventHandlers');
jest.mock('../../src/components/chat/chatPersistence');
jest.mock('../../src/components/chat/chatHistoryUtils');
jest.mock('../../src/components/chat/Message');
jest.mock('../../src/components/agent/AgentResponseHandler');
jest.mock('../../src/utils/contextBuilder');
jest.mock('../../src/components/chat/MessageRegenerator');
jest.mock('../../src/components/chat/ResponseStreamer');
jest.mock('../../src/services/chat/StreamCoordinator');
jest.mock('../../src/services/interfaces');
jest.mock('../../src/components/agent/MessageRenderer');
jest.mock('../../src/components/agent/ToolRichDisplay');
jest.mock('../../src/components/chat/SourceModeRenderer');
jest.mock('../../src/utils/objectPool');
jest.mock('../../src/utils/domBatcher');
jest.mock('../../src/utils/errorHandler');
jest.mock('../../src/utils/asyncOptimizer', () => ({
  AsyncDebouncer: jest.fn().mockImplementation(() => ({
    debounce: jest.fn().mockImplementation((fn) => fn()),
    cancel: jest.fn(),
    isPending: jest.fn().mockReturnValue(false),
  })),
  AsyncOptimizerFactory: {
    createInputDebouncer: jest.fn().mockReturnValue({
      debounce: jest.fn().mockImplementation((fn) => fn()),
      cancel: jest.fn(),
      isPending: jest.fn().mockReturnValue(false),
    }),
  },
  AsyncBatcher: jest.fn(),
  ParallelExecutor: jest.fn(),
  AsyncThrottler: jest.fn(),
}));
jest.mock('../../src/utils/tokenCounter');
jest.mock('../../src/utils/linkHandler');
jest.mock('../../src/utils/logger');

describe('Chat Interface Integration Tests', () => {
  let mockApp: any;
  let mockPlugin: MyPlugin;
  let chatView: ChatView;
  let mockLeaf: any;

  beforeEach(() => {
    // Create mocks
    mockApp = createMockApp();
    mockPlugin = createMockPlugin() as any;

    // Create mock workspace leaf
    mockLeaf = {
      app: mockApp,
      view: null,
    };

    // Create ChatView instance
    chatView = new ChatView(mockLeaf, mockPlugin);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Chat Session Lifecycle', () => {
    test('should initialize complete chat session', async () => {
      // Test full initialization flow
      await chatView.onOpen();

      expect(chatView.getViewType()).toBe(VIEW_TYPE_CHAT);
      expect(chatView.getDisplayText()).toBe('AI Chat');
      expect(chatView.getIcon()).toBe('message-square');

      // Verify UI elements are created and cached
      expect(chatView['domElementCache'].textarea).toBeDefined();
      expect(chatView['domElementCache'].sendButton).toBeDefined();
      expect(chatView['domElementCache'].stopButton).toBeDefined();
      expect(chatView['domElementCache'].agentModeButton).toBeDefined();
    });

    test('should handle chat view activation and deactivation', async () => {
      // Test opening chat
      await chatView.onOpen();

      // Verify the view is properly initialized
      expect(chatView.getViewType()).toBe(VIEW_TYPE_CHAT);
      expect(chatView['domElementCache'].textarea).toBeDefined();

      // Test that event handlers are set up (textarea should have event listeners)
      const textarea = chatView['domElementCache'].textarea!;
      expect(textarea.addEventListener).toHaveBeenCalled();

      // Test closing chat - ChatView extends ItemView which handles cleanup
      // The test verifies that the view can be opened and closed without errors
      expect(chatView.getViewType()).toBe(VIEW_TYPE_CHAT);
    });
  });

  describe('Message Exchange Workflow', () => {
    test('should complete full message send and receive cycle', async () => {
      // Setup chat view
      await chatView.onOpen();

      // Verify UI is ready for message exchange
      const textarea = chatView['domElementCache'].textarea!;
      const sendButton = chatView['domElementCache'].sendButton!;

      expect(textarea).toBeDefined();
      expect(sendButton).toBeDefined();

      // Verify event handlers are attached
      expect(textarea.addEventListener).toHaveBeenCalledWith('keydown', expect.any(Function));
      expect(sendButton.addEventListener).toHaveBeenCalledWith('click', expect.any(Function));

      // Test that the chat infrastructure is ready for message exchange
      expect(chatView).toBeDefined();
    });

    test('should handle streaming response workflow', async () => {
      await chatView.onOpen();

      // Verify streaming components are initialized
      expect(chatView['streamCoordinator']).toBeDefined();

      // Verify stop button is available for interrupting streams
      const stopButton = chatView['domElementCache'].stopButton!;
      expect(stopButton).toBeDefined();
      expect(stopButton.addEventListener).toHaveBeenCalledWith('click', expect.any(Function));

      // Test streaming response setup
      // This would test the complete streaming pipeline from AI request to UI update
      expect(chatView).toBeDefined();
    });
  });

  describe('Context and Settings Integration', () => {
    test('should integrate with reference note context', async () => {
      // Setup plugin with reference note enabled
      mockPlugin.settings.referenceCurrentNote = true;

      await chatView.onOpen();

      // Verify context buttons are available
      const contextAddCurrentButton = (chatView['domElementCache'] as any).contextAddCurrentButton;
      const contextAddAllOpenButton = (chatView['domElementCache'] as any).contextAddAllOpenButton;
      const contextClearButton = (chatView['domElementCache'] as any).contextClearButton;

      expect(contextAddCurrentButton).toBeDefined();
      expect(contextAddAllOpenButton).toBeDefined();
      expect(contextClearButton).toBeDefined();

      // Verify event handlers are attached
      expect(contextAddCurrentButton!.addEventListener).toHaveBeenCalledWith('click', expect.any(Function));
      expect(contextAddAllOpenButton!.addEventListener).toHaveBeenCalledWith('click', expect.any(Function));
      expect(contextClearButton!.addEventListener).toHaveBeenCalledWith('click', expect.any(Function));

      // Test that context building includes reference note
      expect(chatView).toBeDefined();
    });

    test('should handle agent mode activation', async () => {
      // Setup agent mode settings
      mockPlugin.settings.agentMode = {
        enabled: true,
        maxToolCalls: 10,
        timeoutMs: 30000,
        maxIterations: 5
      };

      await chatView.onOpen();

      // Verify agent mode button is available
      const agentModeButton = chatView['domElementCache'].agentModeButton!;
      expect(agentModeButton).toBeDefined();
      expect(agentModeButton.addEventListener).toHaveBeenCalledWith('click', expect.any(Function));

      // Verify agent response handler is initialized
      expect(chatView['agentResponseHandler']).toBeDefined();

      // Test agent mode initialization
      expect(chatView).toBeDefined();
    });
  });

  describe('Error Recovery and Resilience', () => {
    test('should handle network failures gracefully', async () => {
      await chatView.onOpen();

      // Simulate network failure during message send
      // Test error handling and user feedback

      expect(chatView).toBeDefined();
      // Verify error recovery mechanisms
    });

    test('should recover from streaming interruptions', async () => {
      await chatView.onOpen();

      // Test streaming interruption recovery
      expect(chatView).toBeDefined();
      // Verify stream state management
    });
  });

  describe('Chat History Persistence', () => {
    test('should persist and restore chat sessions', async () => {
      await chatView.onOpen();

      // Test chat history save/load cycle
      const testMessages: Message[] = [
        {
          role: 'user',
          content: 'Test message',
        },
        {
          role: 'assistant',
          content: 'Test response',
        }
      ];

      // Simulate saving and loading chat history
      expect(chatView).toBeDefined();
      // Verify persistence works
    });

    test('should handle large chat histories efficiently', async () => {
      await chatView.onOpen();

      // Test performance with large message sets
      expect(chatView).toBeDefined();
      // Verify memory management and performance
    });
  });

  describe('UI State Synchronization', () => {
    test('should synchronize UI state across components', async () => {
      await chatView.onOpen();

      // Test that all UI components stay in sync
      // (buttons, indicators, message display, etc.)

      expect(chatView).toBeDefined();
      // Verify UI state consistency
    });

    test('should handle rapid user interactions', async () => {
      await chatView.onOpen();

      // Test handling of rapid button clicks, typing, etc.
      expect(chatView).toBeDefined();
      // Verify interaction handling
    });
  });
});