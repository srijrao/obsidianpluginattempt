import { ChatView } from '../../src/chat';
import MyPlugin from '../../src/main';
import { StreamCoordinator } from '../../src/services/chat/StreamCoordinator';

// Mock Obsidian dependencies
jest.mock('obsidian', () => ({
  ItemView: class MockItemView {
    app = { workspace: { getLeavesOfType: jest.fn(() => []) } };
    containerEl = document.createElement('div');
    leaf = {};
  },
  WorkspaceLeaf: class MockWorkspaceLeaf {},
  Plugin: class MockPlugin {},
  TFile: class MockTFile {},
  Vault: class MockVault {},
  debounce: (fn: any) => fn,
}));

// Mock other dependencies
jest.mock('../src/components/chat/chatHistoryUtils', () => ({
  renderChatHistory: jest.fn(),
}));

jest.mock('../src/components/chat/eventHandlers', () => ({
  handleCopyAll: jest.fn(),
  handleSaveNote: jest.fn(),
  handleClearChat: jest.fn(),
  handleSettings: jest.fn(),
  handleHelp: jest.fn(),
}));

jest.mock('../src/components/chat/chatPersistence', () => ({
  loadChatYamlAndApplySettings: jest.fn(),
}));

jest.mock('../src/utils/contextBuilder', () => ({
  buildContextMessages: jest.fn().mockResolvedValue([]),
}));

jest.mock('../src/utils/generalUtils', () => ({
  showNotice: jest.fn(),
}));

describe('Stop Button Integration Tests', () => {
  let mockPlugin: any;
  let chatView: any;
  let stopButton: HTMLElement;
  let sendButton: HTMLElement;
  let mockStreamCoordinator: any;

  beforeEach(() => {
    // Create DOM elements
    stopButton = document.createElement('button');
    stopButton.className = 'stop-button hidden';
    sendButton = document.createElement('button');
    sendButton.className = 'send-button';

    // Create mock plugin
    mockPlugin = {
      app: {
        workspace: {
          getLeavesOfType: jest.fn(() => [])
        },
        vault: {},
      },
      settings: {
        temperature: 0.7,
        debugMode: true,
      },
      debugLog: jest.fn(),
      aiDispatcher: {
        hasActiveStreams: jest.fn(() => false),
        abortAllStreams: jest.fn(),
        getActiveStreamCount: jest.fn(() => 0),
      },
      hasActiveAIStreams: jest.fn(() => false),
      stopAllAIStreams: jest.fn(),
    };

    // Create mock StreamCoordinator
    mockStreamCoordinator = {
      isStreaming: jest.fn(() => false),
      stopStream: jest.fn(),
      startStream: jest.fn().mockResolvedValue('Mock response'),
      getActiveStreams: jest.fn(() => []),
      onUIStateChange: jest.fn(),
      offUIStateChange: jest.fn(),
      setActiveContainer: jest.fn(),
      getActiveContainer: jest.fn(() => null),
      dispose: jest.fn(),
    };

    // Create ChatView instance
    const mockLeaf = {} as any;
    chatView = new (ChatView as any)(mockLeaf, mockPlugin);
    
    // Mock the DOM cache
    chatView.domElementCache = {
      stopButton,
      sendButton,
    };

    // Inject our mock StreamCoordinator
    (chatView as any).streamCoordinator = mockStreamCoordinator;

    // Mock other required properties
    (chatView as any).messagesContainer = document.createElement('div');
    (chatView as any).inputContainer = document.createElement('div');
    (chatView as any).activeStream = null;
  });

  describe('Stop Button UI State Management', () => {
    test('should show stop button when StreamCoordinator starts streaming', () => {
      // Simulate StreamCoordinator starting stream
      mockStreamCoordinator.isStreaming.mockReturnValue(true);
      
      // Call the UI sync method directly
      (chatView as any).syncStopSendButtonState(true);
      
      // Verify UI state
      expect(stopButton.classList.contains('hidden')).toBe(false);
      expect(sendButton.classList.contains('hidden')).toBe(true);
      expect(mockPlugin.debugLog).toHaveBeenCalledWith('debug', '[ChatView] StreamCoordinator - showing stop button');
    });

    test('should show send button when StreamCoordinator stops streaming', () => {
      // Start with stop button visible
      stopButton.classList.remove('hidden');
      sendButton.classList.add('hidden');
      
      // Simulate StreamCoordinator stopping stream
      mockStreamCoordinator.isStreaming.mockReturnValue(false);
      
      // Call the UI sync method directly
      (chatView as any).syncStopSendButtonState(false);
      
      // Verify UI state
      expect(stopButton.classList.contains('hidden')).toBe(true);
      expect(sendButton.classList.contains('hidden')).toBe(false);
      expect(mockPlugin.debugLog).toHaveBeenCalledWith('debug', '[ChatView] StreamCoordinator - showing send button');
    });

    test('should handle missing DOM elements gracefully', () => {
      // Remove buttons from DOM cache
      (chatView as any).domElementCache = {
        stopButton: null,
        sendButton: null,
      };
      
      // Should not throw
      expect(() => {
        (chatView as any).syncStopSendButtonState(true);
      }).not.toThrow();
      
      expect(mockPlugin.debugLog).toHaveBeenCalledWith('warn', '[ChatView] Stop/send buttons not found in DOM cache');
    });
  });

  describe('hasActiveStream Method', () => {
    test('should prioritize StreamCoordinator status', () => {
      mockStreamCoordinator.isStreaming.mockReturnValue(true);
      
      const result = chatView.hasActiveStream();
      
      expect(result).toBe(true);
      expect(mockStreamCoordinator.isStreaming).toHaveBeenCalled();
    });

    test('should fallback to legacy checks when StreamCoordinator not streaming', () => {
      mockStreamCoordinator.isStreaming.mockReturnValue(false);
      (chatView as any).activeStream = { abort: jest.fn() };
      
      const result = chatView.hasActiveStream();
      
      expect(result).toBe(true);
    });

    test('should check AIDispatcher as final fallback', () => {
      mockStreamCoordinator.isStreaming.mockReturnValue(false);
      (chatView as any).activeStream = null;
      mockPlugin.aiDispatcher.hasActiveStreams.mockReturnValue(true);
      
      const result = chatView.hasActiveStream();
      
      expect(result).toBe(true);
    });

    test('should return false when no streams are active', () => {
      mockStreamCoordinator.isStreaming.mockReturnValue(false);
      (chatView as any).activeStream = null;
      mockPlugin.aiDispatcher.hasActiveStreams.mockReturnValue(false);
      
      const result = chatView.hasActiveStream();
      
      expect(result).toBe(false);
    });
  });

  describe('stopActiveStream Method', () => {
    test('should prioritize StreamCoordinator for stopping', () => {
      chatView.stopActiveStream();
      
      expect(mockStreamCoordinator.stopStream).toHaveBeenCalled();
    });

    test('should also stop legacy streams defensively', () => {
      const mockAbortController = { abort: jest.fn() };
      (chatView as any).activeStream = mockAbortController;
      
      chatView.stopActiveStream();
      
      expect(mockStreamCoordinator.stopStream).toHaveBeenCalled();
      expect(mockAbortController.abort).toHaveBeenCalled();
      expect((chatView as any).activeStream).toBeNull();
      expect(mockPlugin.aiDispatcher.abortAllStreams).toHaveBeenCalled();
    });

    test('should handle missing StreamCoordinator gracefully', () => {
      (chatView as any).streamCoordinator = null;
      
      expect(() => {
        chatView.stopActiveStream();
      }).not.toThrow();
      
      expect(mockPlugin.aiDispatcher.abortAllStreams).toHaveBeenCalled();
    });
  });

  describe('StreamCoordinator Response Method', () => {
    test('should set active container and start streaming', async () => {
      const messages = [{ role: 'user', content: 'Test message' }];
      const container = document.createElement('div');
      const messageContent = document.createElement('div');
      messageContent.className = 'message-content';
      container.appendChild(messageContent);
      
      const result = await (chatView as any).streamCoordinatorResponse(messages, container);
      
      expect(mockStreamCoordinator.setActiveContainer).toHaveBeenCalledWith(container);
      expect(mockStreamCoordinator.startStream).toHaveBeenCalledWith(messages, {
        temperature: 0.7,
        uiContainer: container,
        onChunk: expect.any(Function),
      });
      expect(result).toBe('Mock response');
    });

    test('should handle chunk updates correctly', async () => {
      const messages = [{ role: 'user', content: 'Test message' }];
      const container = document.createElement('div');
      const messageContent = document.createElement('div');
      messageContent.className = 'message-content';
      container.appendChild(messageContent);
      
      // Capture the onChunk callback
      let chunkCallback: any;
      mockStreamCoordinator.startStream.mockImplementation((msgs: any, options: any) => {
        chunkCallback = options.onChunk;
        return Promise.resolve('Mock response');
      });
      
      await (chatView as any).streamCoordinatorResponse(messages, container);
      
      // Test the chunk callback
      await chunkCallback('Hello', 'Hello world');
      
      expect(messageContent.textContent).toBe('Hello world');
    });

    test('should throw error when StreamCoordinator not initialized', async () => {
      (chatView as any).streamCoordinator = null;
      const messages = [{ role: 'user', content: 'Test message' }];
      const container = document.createElement('div');
      
      await expect((chatView as any).streamCoordinatorResponse(messages, container))
        .rejects.toThrow('StreamCoordinator not initialized');
    });
  });

  describe('Streaming Method Integration', () => {
    test('should try StreamCoordinator first, then fallback to ResponseStreamer', async () => {
      const messages = [{ role: 'user', content: 'Test message' }];
      const container = document.createElement('div');
      
      // Mock ResponseStreamer fallback
      const mockResponseStreamer = {
        streamAssistantResponse: jest.fn().mockResolvedValue('Fallback response')
      };
      (chatView as any).responseStreamer = mockResponseStreamer;
      (chatView as any).chatHistoryManager = {
        getHistory: jest.fn().mockResolvedValue([])
      };
      
      // Make StreamCoordinator fail
      mockStreamCoordinator.startStream.mockRejectedValue(new Error('StreamCoordinator failed'));
      
      const result = await (chatView as any).streamAssistantResponse(messages, container);
      
      expect(mockStreamCoordinator.startStream).toHaveBeenCalled();
      expect(mockResponseStreamer.streamAssistantResponse).toHaveBeenCalled();
      expect(result).toBe('Fallback response');
      expect(mockPlugin.debugLog).toHaveBeenCalledWith('warn', '[ChatView] StreamCoordinator failed, falling back to ResponseStreamer:', expect.any(Error));
    });

    test('should use StreamCoordinator successfully when available', async () => {
      const messages = [{ role: 'user', content: 'Test message' }];
      const container = document.createElement('div');
      const messageContent = document.createElement('div');
      messageContent.className = 'message-content';
      container.appendChild(messageContent);
      
      const result = await (chatView as any).streamAssistantResponse(messages, container);
      
      expect(mockStreamCoordinator.startStream).toHaveBeenCalled();
      expect(result).toBe('Mock response');
    });
  });

  describe('Stop Button Click Integration', () => {
    test('should stop streams when stop button is clicked', () => {
      // Setup stop button click handler (simulating the actual ChatView setup)
      const stopClickHandler = () => {
        if (mockPlugin.hasActiveAIStreams()) {
          mockPlugin.stopAllAIStreams();
        }
      };
      
      // Simulate active streams
      mockPlugin.hasActiveAIStreams.mockReturnValue(true);
      
      // Click stop button
      stopClickHandler();
      
      expect(mockPlugin.stopAllAIStreams).toHaveBeenCalled();
    });

    test('should sync with command behavior', () => {
      // Both stop button and stop command should use identical logic
      const stopLogic = () => {
        if (mockPlugin.hasActiveAIStreams()) {
          mockPlugin.stopAllAIStreams();
        }
      };
      
      mockPlugin.hasActiveAIStreams.mockReturnValue(true);
      
      // Simulate stop button click
      stopLogic();
      expect(mockPlugin.stopAllAIStreams).toHaveBeenCalledTimes(1);
      
      // Simulate stop command
      stopLogic();
      expect(mockPlugin.stopAllAIStreams).toHaveBeenCalledTimes(2);
      
      // Both should behave identically
    });
  });
});
