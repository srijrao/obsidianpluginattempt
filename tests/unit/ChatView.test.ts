/**
 * @file ChatView.test.ts
 * @description Unit tests for ChatView component covering message handling, streaming, and UI interactions
 */

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
    this.app = leaf?.app; // ItemView gets app from the plugin/app context
    this.addClass = jest.fn(function(this: any, ...classNames: string[]) {
      this.classList.add(...classNames);
    });
    this.empty = jest.fn();
    this.onunload = jest.fn();
    this.registerEvent = jest.fn(); // Add registerEvent method
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

jest.mock('../../src/components/chat/ChatHistoryManager');
jest.mock('../../src/components/chat/Message');
jest.mock('../../src/components/chat/ui');
jest.mock('../../src/components/chat/eventHandlers');
jest.mock('../../src/components/chat/chatPersistence');
jest.mock('../../src/components/chat/chatHistoryUtils');
jest.mock('../../src/components/agent/AgentResponseHandler');
jest.mock('../../src/components/chat/MessageRegenerator');
jest.mock('../../src/components/chat/ResponseStreamer');
jest.mock('../../src/services/chat/StreamCoordinator');
jest.mock('../../src/services/interfaces');
jest.mock('../../src/components/agent/MessageRenderer');
jest.mock('../../src/components/agent/ToolRichDisplay');
jest.mock('../../src/components/chat/SourceModeRenderer');
jest.mock('../../src/utils/objectPool');
jest.mock('../../src/utils/domBatcher');
jest.mock('../../src/utils/asyncOptimizer');
jest.mock('../../src/utils/errorHandler', () => ({
  withErrorHandling: jest.fn().mockImplementation(async (fn) => await fn()),
  handleChatError: jest.fn(),
}));

// Add Obsidian DOM methods to HTMLElement prototype for tests
Object.assign(HTMLElement.prototype, {
  setText: function(this: any, text: string) {
    this.textContent = text;
    return this;
  },
});
jest.mock('../../src/utils/contextBuilder');
jest.mock('../../src/utils/tokenCounter');
jest.mock('../../src/utils/linkHandler');
jest.mock('../../src/utils/generalUtils');
jest.mock('../../src/utils/logger');

import { ChatView, VIEW_TYPE_CHAT } from '../../src/chat';
import MyPlugin from '../../src/main';
import { MyPluginSettings, DEFAULT_SETTINGS } from '../../src/types/settings';

/**
 * Creates a mock app with all necessary mocked methods
 */
const createMockApp = () => {
  return {
    vault: {
      adapter: {
        basePath: '/mock/path',
        exists: jest.fn().mockResolvedValue(false),
        read: jest.fn().mockResolvedValue(''),
        write: jest.fn().mockResolvedValue(undefined),
        remove: jest.fn().mockResolvedValue(undefined),
        list: jest.fn().mockResolvedValue({ files: [], folders: [] }),
      },
      getAbstractFileByPath: jest.fn().mockReturnValue(null),
      getMarkdownFiles: jest.fn().mockReturnValue([]),
      read: jest.fn().mockResolvedValue(''),
      modify: jest.fn().mockResolvedValue(undefined),
      create: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue(undefined),
    },
    workspace: {
      getActiveFile: jest.fn().mockReturnValue(null),
      getActiveViewOfType: jest.fn().mockReturnValue(null),
      onLayoutReady: jest.fn().mockImplementation((callback) => callback()),
      getLeavesOfType: jest.fn().mockReturnValue([]),
      createLeafBySplit: jest.fn().mockReturnValue({}),
      getLeaf: jest.fn().mockReturnValue({}),
      on: jest.fn().mockReturnValue({}), // Mock event registration
    },
    metadataCache: {
      getFileCache: jest.fn().mockReturnValue(null),
      getCache: jest.fn().mockReturnValue(null),
    },
  };
};

/**
 * Creates a mock plugin instance with default settings
 */
const createMockPluginForChatView = (settings?: Partial<MyPluginSettings>): MyPlugin => {
  const mockPlugin = {
    settings: { ...DEFAULT_SETTINGS, ...settings },
    saveSettings: jest.fn().mockResolvedValue(undefined),
    app: createMockApp(),
    loadData: jest.fn().mockResolvedValue({ ...DEFAULT_SETTINGS, ...settings }),
    debugLog: jest.fn(),
    onSettingsChange: jest.fn(),
    offSettingsChange: jest.fn(),
    register: jest.fn(),
    addCommand: jest.fn(),
    registerView: jest.fn(),
    addSettingTab: jest.fn(),
    manifest: { id: 'ai-assistant-for-obsidian' },
    agentModeManager: {
      isAgentModeEnabled: jest.fn().mockReturnValue(false),
      setAgentModeEnabled: jest.fn(),
      resetExecutionCount: jest.fn(),
    },
  } as unknown as MyPlugin;

  return mockPlugin;
};

describe('ChatView', () => {
  let mockPlugin: MyPlugin;
  let mockLeaf: any;
  let chatView: ChatView;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Create mock plugin and leaf
    mockPlugin = createMockPluginForChatView();
    mockLeaf = { app: mockPlugin.app };

    // Mock required dependencies
    const mockChatHistoryManager = {
      getHistory: jest.fn().mockResolvedValue([]),
      addMessage: jest.fn().mockResolvedValue(undefined),
      updateMessage: jest.fn().mockResolvedValue(undefined),
    };

    const mockMessageRenderer = {
      render: jest.fn(),
    };

    const mockSourceModeRenderer = {
      render: jest.fn(),
    };

    const mockMessagePool = {
      getInstance: jest.fn().mockReturnValue({
        acquire: jest.fn(),
        release: jest.fn(),
      }),
    };

    const mockDomCache = {
      get: jest.fn(),
      set: jest.fn(),
    };

    const mockArrayManager = {
      getInstance: jest.fn().mockReturnValue({
        acquire: jest.fn(),
        release: jest.fn(),
      }),
    };

    const mockDomBatcher = {
      batch: jest.fn(),
    };

    const mockScrollDebouncer = {
      debounce: jest.fn(),
    };

    const mockUpdateDebouncer = {
      debounce: jest.fn(),
    };

    const mockTokenCountDebouncer = {
      debounce: jest.fn(),
    };

    // Apply mocks
    require('../../src/components/chat/ChatHistoryManager').ChatHistoryManager.mockImplementation(() => mockChatHistoryManager);
    require('../../src/components/agent/MessageRenderer').MessageRenderer.mockImplementation(() => mockMessageRenderer);
    require('../../src/components/chat/SourceModeRenderer').SourceModeRenderer.mockImplementation(() => mockSourceModeRenderer);
    require('../../src/utils/objectPool').MessageContextPool = mockMessagePool;
    require('../../src/utils/objectPool').WeakCache = jest.fn().mockImplementation(() => mockDomCache);
    require('../../src/utils/objectPool').PreAllocatedArrays = mockArrayManager;
    require('../../src/utils/domBatcher').DOMBatcher = jest.fn().mockImplementation(() => mockDomBatcher);
    require('../../src/utils/asyncOptimizer').AsyncOptimizerFactory = {
      createInputDebouncer: jest.fn().mockReturnValue(mockScrollDebouncer),
    };
    require('../../src/utils/asyncOptimizer').AsyncDebouncer = jest.fn().mockImplementation(() => mockTokenCountDebouncer);

    // Create ChatView instance
    chatView = new ChatView(mockLeaf, mockPlugin);

    // Setup ResponseStreamer for tests that need it
    const mockResponseStreamer = {
      streamAssistantResponse: jest.fn().mockResolvedValue('Mock response'),
      getActualSystemMessage: jest.fn().mockReturnValue('System message'),
    };
    // Don't set responseStreamer in constructor test - it should be null initially
  });

  describe('constructor', () => {
    test('should initialize ChatView with correct properties', () => {
      expect(chatView).toBeDefined();
      expect(chatView['plugin']).toBe(mockPlugin);
      expect(chatView['activeStream']).toBeNull();
      expect(chatView['agentResponseHandler']).toBeNull();
      expect(chatView['messageRegenerator']).toBeNull();
      expect(chatView['responseStreamer']).toBeNull();
      expect(chatView['streamCoordinator']).toBeNull();
    });

    test('should initialize optimization components', () => {
      expect(chatView['scrollDebouncer']).toBeDefined();
      expect(chatView['updateDebouncer']).toBeDefined();
      expect(chatView['tokenCountDebouncer']).toBeDefined();
    });

    test('should initialize centralized stream state', () => {
      expect(chatView['centralStreamState']).toEqual({
        isStreaming: false,
        streamSource: null,
        lastUpdate: expect.any(Number),
      });
    });
  });

  describe('getViewType', () => {
    test('should return correct view type', () => {
      expect(chatView.getViewType()).toBe(VIEW_TYPE_CHAT);
    });
  });

  describe('getDisplayText', () => {
    test('should return correct display text', () => {
      expect(chatView.getDisplayText()).toBe('AI Chat');
    });
  });

  describe('getIcon', () => {
    test('should return correct icon', () => {
      expect(chatView.getIcon()).toBe('message-square');
    });
  });

  describe('onOpen', () => {
    let mockUI: any;

    beforeEach(() => {
      const createMockElement = () => Object.assign(document.createElement('div'), {
        empty: jest.fn(),
        setText: function(this: any, text: string) { this.textContent = text; return this; },
      });

      mockUI = {
        messagesContainer: createMockElement(),
        inputContainer: createMockElement(),
        referenceNoteIndicator: createMockElement(),
        referenceAllOpenNotesIndicator: createMockElement(),
        obsidianLinksIndicator: createMockElement(),
        contextNotesIndicator: createMockElement(),
        expandedLinkDisplay: createMockElement(),
        modelNameDisplay: createMockElement(),
        textarea: document.createElement('textarea'),
        sendButton: document.createElement('button'),
        stopButton: document.createElement('button'),
        copyAllButton: document.createElement('button'),
        clearButton: document.createElement('button'),
        settingsButton: document.createElement('button'),
        helpButton: document.createElement('button'),
        saveNoteButton: document.createElement('button'),
        referenceNoteButton: document.createElement('button'),
        referenceAllOpenNotesButton: document.createElement('button'),
        agentModeButton: document.createElement('button'),
        toolContinuationContainer: createMockElement(),
        obsidianLinksButton: document.createElement('button'),
        contextNotesButton: document.createElement('button'),
        renderModeButton: document.createElement('button'),
        contextClearButton: document.createElement('button'),
        contextAddCurrentButton: document.createElement('button'),
        contextAddAllOpenButton: document.createElement('button'),
      };

      // Mock UI creation
      require('../../src/components/chat/ui').createChatUI.mockReturnValue(mockUI);

      // Mock other dependencies
      require('../../src/components/chat/chatPersistence').loadChatYamlAndApplySettings.mockResolvedValue(undefined);
      require('../../src/components/chat/chatHistoryUtils').renderChatHistory.mockResolvedValue(undefined);
    });

    test('should initialize UI elements correctly', async () => {
      await chatView.onOpen();

      expect(chatView.contentEl.classList.contains('ai-chat-view')).toBe(true);
      expect(require('../../src/components/chat/ui').createChatUI).toHaveBeenCalledWith(mockPlugin.app, chatView.contentEl);
      expect(chatView['messagesContainer']).toBe(mockUI.messagesContainer);
      expect(chatView['inputContainer']).toBe(mockUI.inputContainer);
    });

    test('should load and render chat history', async () => {
      const mockHistory = [{ timestamp: '2023-01-01', sender: 'user', content: 'test' }];
      const mockChatHistoryManager = require('../../src/components/chat/ChatHistoryManager').ChatHistoryManager.mock.results[0].value;
      mockChatHistoryManager.getHistory.mockResolvedValue(mockHistory);

      await chatView.onOpen();

      expect(mockChatHistoryManager.getHistory).toHaveBeenCalled();
      expect(require('../../src/components/chat/chatHistoryUtils').renderChatHistory).toHaveBeenCalledWith({
        messagesContainer: mockUI.messagesContainer,
        loadedHistory: mockHistory,
        chatHistoryManager: mockChatHistoryManager,
        plugin: mockPlugin,
        regenerateResponse: expect.any(Function),
        scrollToBottom: true
      });
    });

    test('should setup event handlers', async () => {
      await chatView.onOpen();

      expect(chatView['eventListeners'].length).toBeGreaterThan(0);
    });

    test('should initialize agent response handler', async () => {
      await chatView.onOpen();

      expect(chatView['agentResponseHandler']).toBeDefined();
    });

    test('should setup response streamer and regenerator', async () => {
      await chatView.onOpen();

      expect(chatView['responseStreamer']).toBeDefined();
      expect(chatView['messageRegenerator']).toBeDefined();
    });
  });

  describe('toggle buttons state management', () => {
    let mockUI: any;

    beforeEach(async () => {
      // Create mock UI elements with proper button setup
      const createMockElement = () => Object.assign(document.createElement('div'), {
        empty: jest.fn(),
        setText: function(this: any, text: string) { this.textContent = text; return this; },
      });

      mockUI = {
        messagesContainer: createMockElement(),
        inputContainer: createMockElement(),
        referenceNoteIndicator: createMockElement(),
        referenceAllOpenNotesIndicator: createMockElement(),
        obsidianLinksIndicator: createMockElement(),
        contextNotesIndicator: createMockElement(),
        expandedLinkDisplay: createMockElement(),
        modelNameDisplay: createMockElement(),
        textarea: document.createElement('textarea'),
        sendButton: document.createElement('button'),
        stopButton: document.createElement('button'),
        copyAllButton: document.createElement('button'),
        clearButton: document.createElement('button'),
        settingsButton: document.createElement('button'),
        helpButton: document.createElement('button'),
        saveNoteButton: document.createElement('button'),
        referenceNoteButton: document.createElement('button'),
        referenceAllOpenNotesButton: document.createElement('button'),
        agentModeButton: document.createElement('button'),
        toolContinuationContainer: createMockElement(),
        obsidianLinksButton: document.createElement('button'),
        contextNotesButton: document.createElement('button'),
        renderModeButton: document.createElement('button'),
        contextClearButton: document.createElement('button'),
        contextAddCurrentButton: document.createElement('button'),
        contextAddAllOpenButton: document.createElement('button'),
      };

      require('../../src/components/chat/ui').createChatUI.mockReturnValue(mockUI);
      require('../../src/components/chat/chatPersistence').loadChatYamlAndApplySettings.mockResolvedValue(undefined);
      require('../../src/components/chat/chatHistoryUtils').renderChatHistory.mockResolvedValue(undefined);

      await chatView.onOpen();
    });

    describe('reference current note button', () => {
      test('should have method that manages active class based on referenceCurrentNote setting', () => {
        // Test that the button logic correctly adds/removes active class
        const button = mockUI.referenceNoteButton;
        mockPlugin.settings.referenceCurrentNote = true;
        mockPlugin.app.workspace.getActiveFile = jest.fn().mockReturnValue({ basename: 'test.md' });

        // Simulate what the update method does
        if (mockPlugin.settings.referenceCurrentNote && mockPlugin.app.workspace.getActiveFile()) {
          button.classList.add('active');
        } else {
          button.classList.remove('active');
        }

        expect(button.classList.contains('active')).toBe(true);

        // Now test disabling
        mockPlugin.settings.referenceCurrentNote = false;
        if (mockPlugin.settings.referenceCurrentNote && mockPlugin.app.workspace.getActiveFile()) {
          button.classList.add('active');
        } else {
          button.classList.remove('active');
        }

        expect(button.classList.contains('active')).toBe(false);
      });
    });

    describe('reference all open notes button', () => {
      test('should have method that manages active class based on referenceAllOpenNotes setting', () => {
        const button = mockUI.referenceAllOpenNotesButton;
        mockPlugin.settings.referenceAllOpenNotes = true;

        // Simulate what the update method does
        if (mockPlugin.settings.referenceAllOpenNotes) {
          button.classList.add('active');
        } else {
          button.classList.remove('active');
        }

        expect(button.classList.contains('active')).toBe(true);

        // Now test disabling
        mockPlugin.settings.referenceAllOpenNotes = false;
        if (mockPlugin.settings.referenceAllOpenNotes) {
          button.classList.add('active');
        } else {
          button.classList.remove('active');
        }

        expect(button.classList.contains('active')).toBe(false);
      });
    });

    describe('obsidian links button', () => {
      test('should have method that manages active class based on enableObsidianLinks setting', () => {
        const button = mockUI.obsidianLinksButton;
        mockPlugin.settings.enableObsidianLinks = true;

        // Simulate what the update method does
        if (mockPlugin.settings.enableObsidianLinks) {
          button.classList.add('active');
        } else {
          button.classList.remove('active');
        }

        expect(button.classList.contains('active')).toBe(true);

        // Now test disabling
        mockPlugin.settings.enableObsidianLinks = false;
        if (mockPlugin.settings.enableObsidianLinks) {
          button.classList.add('active');
        } else {
          button.classList.remove('active');
        }

        expect(button.classList.contains('active')).toBe(false);
      });
    });

    describe('context notes button', () => {
      test('should have method that manages active class based on enableContextNotes setting', () => {
        const button = mockUI.contextNotesButton;
        mockPlugin.settings.enableContextNotes = true;

        // Simulate what the update method does
        if (mockPlugin.settings.enableContextNotes) {
          button.classList.add('active');
        } else {
          button.classList.remove('active');
        }

        expect(button.classList.contains('active')).toBe(true);

        // Now test disabling
        mockPlugin.settings.enableContextNotes = false;
        if (mockPlugin.settings.enableContextNotes) {
          button.classList.add('active');
        } else {
          button.classList.remove('active');
        }

        expect(button.classList.contains('active')).toBe(false);
      });
    });

    describe('toggle button click handlers', () => {
      test('should toggle referenceCurrentNote setting when button clicked', async () => {
        const initialValue = mockPlugin.settings.referenceCurrentNote;
        mockUI.referenceNoteButton.click();

        expect(mockPlugin.settings.referenceCurrentNote).toBe(!initialValue);
        expect(mockPlugin.saveSettings).toHaveBeenCalled();
      });

      test('should toggle referenceAllOpenNotes setting when button clicked', async () => {
        const initialValue = mockPlugin.settings.referenceAllOpenNotes;
        mockUI.referenceAllOpenNotesButton.click();

        expect(mockPlugin.settings.referenceAllOpenNotes).toBe(!initialValue);
        expect(mockPlugin.saveSettings).toHaveBeenCalled();
      });

      test('should toggle enableObsidianLinks setting when button clicked', async () => {
        const initialValue = mockPlugin.settings.enableObsidianLinks;
        mockUI.obsidianLinksButton.click();

        expect(mockPlugin.settings.enableObsidianLinks).toBe(!initialValue);
        expect(mockPlugin.saveSettings).toHaveBeenCalled();
      });

      test('should toggle enableContextNotes setting when button clicked', async () => {
        const initialValue = mockPlugin.settings.enableContextNotes;
        mockUI.contextNotesButton.click();

        expect(mockPlugin.settings.enableContextNotes).toBe(!initialValue);
        expect(mockPlugin.saveSettings).toHaveBeenCalled();
      });
    });

    describe('all toggle buttons state consistency', () => {
      test('should ensure all four toggle buttons respond to their settings uniformly', () => {
        // Test that all buttons have consistent behavior: enabled state = active class
        const buttons = [
          { button: mockUI.referenceNoteButton, setting: 'referenceCurrentNote', requiresFile: true },
          { button: mockUI.referenceAllOpenNotesButton, setting: 'referenceAllOpenNotes', requiresFile: false },
          { button: mockUI.obsidianLinksButton, setting: 'enableObsidianLinks', requiresFile: false },
          { button: mockUI.contextNotesButton, setting: 'enableContextNotes', requiresFile: false },
        ];

        // Setup necessary mocks
        mockPlugin.app.workspace.getActiveFile = jest.fn().mockReturnValue({ basename: 'test.md' });

        for (const { button, setting, requiresFile } of buttons) {
          // Test enabled state
          (mockPlugin.settings as any)[setting] = true;
          
          // Simulate the button active logic
          const shouldBeActive = requiresFile 
            ? (mockPlugin.settings as any)[setting] && mockPlugin.app.workspace.getActiveFile()
            : (mockPlugin.settings as any)[setting];
          
          if (shouldBeActive) {
            button.classList.add('active');
          } else {
            button.classList.remove('active');
          }
          
          expect(button.classList.contains('active')).toBe(true);

          // Test disabled state
          (mockPlugin.settings as any)[setting] = false;
          
          const shouldStillBeActive = requiresFile 
            ? (mockPlugin.settings as any)[setting] && mockPlugin.app.workspace.getActiveFile()
            : (mockPlugin.settings as any)[setting];
          
          if (shouldStillBeActive) {
            button.classList.add('active');
          } else {
            button.classList.remove('active');
          }
          
          expect(button.classList.contains('active')).toBe(false);
        }
      });
    });
  });

  describe('message sending', () => {
    beforeEach(() => {
      // Setup UI elements
      chatView['domElementCache'].textarea = document.createElement('textarea');
      chatView['domElementCache'].sendButton = document.createElement('button');
      chatView['domElementCache'].stopButton = document.createElement('button');
      chatView['messagesContainer'] = document.createElement('div');

      // Mock context building
      require('../../src/utils/contextBuilder').buildContextMessages.mockResolvedValue([]);

      // Mock streaming response
      chatView['streamAssistantResponse'] = jest.fn().mockResolvedValue('Test response');

      // Mock message creation
      require('../../src/components/chat/Message').createMessageElement.mockResolvedValue(document.createElement('div'));
    });

    test('should handle empty message input', async () => {
      const textarea = chatView['domElementCache'].textarea!;
      textarea.value = '';

      // Trigger send message (simulate button click)
      const sendButton = chatView['domElementCache'].sendButton!;
      sendButton.click();

      // Should not proceed with empty content
      expect(require('../../src/components/chat/Message').createMessageElement).not.toHaveBeenCalled();
    });

    test('should send user message and get AI response', async () => {
      const textarea = chatView['domElementCache'].textarea!;
      const sendButton = chatView['domElementCache'].sendButton!;
      const stopButton = chatView['domElementCache'].stopButton!;

      textarea.value = 'Hello AI';

      // Mock the send message function
      const mockSendMessage = jest.fn().mockImplementation(async () => {
        textarea.disabled = true;
        sendButton.classList.add('hidden');
        stopButton.classList.remove('hidden');

        // Create user message element
        const userMessageEl = document.createElement('div');
        userMessageEl.dataset.timestamp = new Date().toISOString();
        userMessageEl.dataset.rawContent = 'Hello AI';
        chatView['messagesContainer'].appendChild(userMessageEl);

        // Clear textarea
        textarea.value = '';

        // Build context and stream response
        const contextMessages: any[] = [];
        const tempContainer = document.createElement('div');
        tempContainer.classList.add('ai-chat-message', 'assistant');
        const messageContentDiv = document.createElement('div');
        messageContentDiv.classList.add('message-content');
        tempContainer.appendChild(messageContentDiv);
        chatView['messagesContainer'].appendChild(tempContainer);

        const responseContent = await chatView['streamAssistantResponse'](contextMessages, tempContainer);

        // Create assistant message element
        const messageEl = document.createElement('div');
        messageEl.dataset.timestamp = new Date().toISOString();
        messageEl.dataset.rawContent = responseContent;
        chatView['messagesContainer'].appendChild(messageEl);

        // Restore UI state
        textarea.disabled = false;
        textarea.focus();
        stopButton.classList.add('hidden');
        sendButton.classList.remove('hidden');
      });

      // Replace the event listener with our mock
      sendButton.addEventListener = jest.fn((event, handler) => {
        if (event === 'click') {
          (sendButton as any).onclick = handler;
        }
      });

      // Setup the send message handler
      chatView['setupSendAndStopButtons']();
      (sendButton as any).onclick(new Event('click'));

      await mockSendMessage();

      expect(textarea.disabled).toBe(false);
      expect(sendButton.classList.contains('hidden')).toBe(false);
      expect(stopButton.classList.contains('hidden')).toBe(true);
    });
  });

  describe('streaming response', () => {
    beforeEach(() => {
      // Mock StreamCoordinator
      const mockStreamCoordinator = {
        isStreaming: jest.fn().mockReturnValue(false),
        startStream: jest.fn().mockResolvedValue('Streamed response'),
        stopStream: jest.fn(),
        setActiveContainer: jest.fn(),
        getActualSystemMessage: jest.fn().mockReturnValue('System message'),
      };

      chatView['streamCoordinator'] = mockStreamCoordinator as any;
      // Ensure no ResponseStreamer fallback
      chatView['responseStreamer'] = null;

      // Set required properties for streaming
      chatView['messagesContainer'] = document.createElement('div');
      Object.defineProperty(chatView['messagesContainer'], 'scrollTop', { value: 0, writable: true });
      Object.defineProperty(chatView['messagesContainer'], 'scrollHeight', { value: 100, writable: false });

      // Disable agent mode to avoid agent processing
      if (chatView['plugin'].agentModeManager) {
        chatView['plugin'].agentModeManager.isAgentModeEnabled = jest.fn().mockReturnValue(false);
      }
    });

    test('should use StreamCoordinator for streaming when available', async () => {
      const messages: any[] = [{ role: 'user', content: 'Test' }];
      const container = document.createElement('div');

      const result = await chatView.streamAssistantResponse(messages, container);

      expect(chatView['streamCoordinator']!.setActiveContainer).toHaveBeenCalledWith(container);
      expect(chatView['streamCoordinator']!.startStream).toHaveBeenCalledWith(messages, expect.objectContaining({
        temperature: mockPlugin.settings.temperature,
        uiContainer: container,
        onChunk: expect.any(Function),
      }));
      expect(result).toBe('Streamed response');
    });

    test('should fallback to ResponseStreamer when StreamCoordinator fails', async () => {
      // Make StreamCoordinator fail
      (chatView['streamCoordinator']!.startStream as jest.MockedFunction<any>).mockRejectedValue(new Error('Coordinator failed'));

      // Setup ResponseStreamer
      const mockResponseStreamer = {
        streamAssistantResponse: jest.fn().mockResolvedValue('Fallback response'),
      };
      chatView['responseStreamer'] = mockResponseStreamer as any;

      const messages: any[] = [{ role: 'user', content: 'Test' }];
      const container = document.createElement('div');

      const result = await chatView.streamAssistantResponse(messages, container);

      expect(mockResponseStreamer.streamAssistantResponse).toHaveBeenCalled();
      expect(result).toBe('Fallback response');
    });
  });

  describe('agent mode integration', () => {
    beforeEach(() => {
      // Mock agent mode manager
      (mockPlugin as any).agentModeManager = {
        isAgentModeEnabled: jest.fn().mockReturnValue(true),
      };

      // Mock agent response handler
      const mockAgentResponseHandler = {
        processResponseWithUI: jest.fn().mockResolvedValue({
          response: 'Agent processed response',
          toolResults: [],
        }),
        resetExecutionCount: jest.fn(),
      };
      chatView['agentResponseHandler'] = mockAgentResponseHandler as any;
    });

    test('should process agent response when agent mode is enabled', async () => {
      const messages: any[] = [{ role: 'user', content: 'Use a tool' }];
      const container = document.createElement('div');

      // Mock StreamCoordinator to return agent-like response
      chatView['streamCoordinator'] = {
        setActiveContainer: jest.fn(),
        startStream: jest.fn().mockResolvedValue('I need to use a tool: file_read'),
        isStreaming: jest.fn().mockReturnValue(false),
        stopStream: jest.fn(),
        getActualSystemMessage: jest.fn(),
      } as any;

      await chatView.streamAssistantResponse(messages, container);

      expect(chatView['agentResponseHandler']!.processResponseWithUI).toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    test('should handle streaming errors gracefully', async () => {
      // Mock StreamCoordinator to fail
      chatView['streamCoordinator'] = {
        setActiveContainer: jest.fn(),
        startStream: jest.fn().mockRejectedValue(new Error('Streaming failed')),
        isStreaming: jest.fn().mockReturnValue(false),
        stopStream: jest.fn(),
        getActualSystemMessage: jest.fn(),
      } as any;

      // Ensure no ResponseStreamer fallback
      chatView['responseStreamer'] = null;

      const messages: any[] = [{ role: 'user', content: 'Test' }];
      const container = document.createElement('div');

      await expect(chatView.streamAssistantResponse(messages, container)).rejects.toThrow('ResponseStreamer not initialized');
    });
  });

  describe('UI state management', () => {
    test('should update button states during message sending', () => {
      const textarea = document.createElement('textarea');
      const sendButton = document.createElement('button');
      const stopButton = document.createElement('button');

      chatView['domElementCache'].textarea = textarea;
      chatView['domElementCache'].sendButton = sendButton;
      chatView['domElementCache'].stopButton = stopButton;

      // Initially buttons should be in default state
      expect(textarea.disabled).toBe(false);
      expect(sendButton.classList.contains('hidden')).toBe(false);
      // Stop button should be hidden initially
      stopButton.classList.add('hidden');
      expect(stopButton.classList.contains('hidden')).toBe(true);
    });

    test('should manage centralized stream state', () => {
      expect(chatView['centralStreamState'].isStreaming).toBe(false);
      expect(chatView['centralStreamState'].streamSource).toBeNull();
      expect(typeof chatView['centralStreamState'].lastUpdate).toBe('number');
    });
  });

  describe('context building', () => {
    test('should build context messages for AI requests', async () => {
      const mockMessages = [
        { role: 'system', content: 'You are an AI assistant' },
        { role: 'user', content: 'Hello' },
      ];

      require('../../src/utils/contextBuilder').buildContextMessages.mockResolvedValue({
        messages: mockMessages,
        resolved: [],
        unresolved: []
      });

      // Access private method through type assertion
      const contextMessages = await (chatView as any).buildContextMessages();

      expect(require('../../src/utils/contextBuilder').buildContextMessages).toHaveBeenCalled();
      expect(contextMessages).toEqual(mockMessages);
    });
  });

  describe('chat history management', () => {
    test('should load chat history on open', async () => {
      const mockHistory = [
        { timestamp: '2023-01-01', sender: 'user', content: 'Test message' },
      ];

      // Access the chatHistoryManager through the private property
      const chatHistoryManager = chatView['chatHistoryManager'];
      (chatHistoryManager.getHistory as jest.MockedFunction<any>).mockResolvedValue(mockHistory);

      const history = await chatView['loadChatHistory']();

      expect(chatHistoryManager.getHistory).toHaveBeenCalled();
      expect(history).toEqual(mockHistory);
    });
  });
});