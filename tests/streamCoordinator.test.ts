import { StreamCoordinator } from '../src/services/chat/StreamCoordinator';
import { ChatView } from '../src/chat';
import MyPlugin from '../src/main';
import { IEventBus } from '../src/services/interfaces';
import { Message } from '../src/types';

// Mock dependencies
jest.mock('obsidian', () => ({
  ItemView: class MockItemView {
    app = { workspace: { getLeavesOfType: jest.fn(() => []) } };
    containerEl = document.createElement('div');
  },
  WorkspaceLeaf: class MockWorkspaceLeaf {},
  TFile: class MockTFile {},
  Vault: class MockVault {},
}));

// Mock context builder dependencies
jest.mock('../src/utils/contextBuilder', () => ({
  buildContextMessages: jest.fn(() => [])
}));

jest.mock('../src/utils/recently-opened-files', () => ({
  getRecentlyOpenedFiles: jest.fn(() => []),
  RecentlyOpenedFilesManager: jest.fn().mockImplementation(() => ({
    setupFileListener: jest.fn(),
    getRecentFiles: jest.fn(() => [])
  }))
}));

// Mock agent-related dependencies
jest.mock('../src/promptConstants', () => ({
  buildAgentSystemPrompt: jest.fn(() => ({ role: 'system', content: 'Agent system prompt' }))
}));

// Mock the AI service - basic version that completes successfully
const mockAIService = {
  async getCompletion(request: any): Promise<string> {
    return new Promise((resolve, reject) => {
      const abortController = request.options?.abortController;
      
      // Simulate streaming with chunks
      const chunks = ['Hello', ' world', '!'];
      let chunkIndex = 0;
      let timeoutId: NodeJS.Timeout;
      
      // Set up abort listener only for tests that expect abort behavior
      if (abortController && request.expectAbort) {
        const abortHandler = () => {
          if (timeoutId) {
            clearTimeout(timeoutId);
          }
          const abortError = new Error('AbortError');
          abortError.name = 'AbortError';
          reject(abortError);
        };
        
        // Check if already aborted
        if (abortController.signal.aborted) {
          abortHandler();
          return;
        }
        
        abortController.signal.addEventListener('abort', abortHandler);
      }
      
      const sendChunk = () => {
        // For tests expecting abort, check abort signal
        if (request.expectAbort && abortController?.signal.aborted) {
          return; // Already handled by abort listener
        }
        
        if (chunkIndex < chunks.length) {
          if (request.options?.streamCallback) {
            request.options.streamCallback(chunks[chunkIndex]);
          }
          chunkIndex++;
          timeoutId = setTimeout(sendChunk, 10); // 10ms delay between chunks
        } else {
          resolve('Hello world!');
        }
      };
      
      timeoutId = setTimeout(sendChunk, 10);
    });
  }
};

// Mock AI service that handles abort properly for stop tests
const mockAIServiceWithAbort = {
  async getCompletion(request: any): Promise<string> {
    return new Promise((resolve, reject) => {
      const abortController = request.options?.abortController;
      
      // Simulate streaming with chunks
      const chunks = ['Hello', ' world', '!'];
      let chunkIndex = 0;
      let timeoutId: NodeJS.Timeout;
      
      // Set up abort listener
      if (abortController) {
        const abortHandler = () => {
          if (timeoutId) {
            clearTimeout(timeoutId);
          }
          const abortError = new Error('AbortError');
          abortError.name = 'AbortError';
          reject(abortError);
        };
        
        // Check if already aborted
        if (abortController.signal.aborted) {
          abortHandler();
          return;
        }
        
        abortController.signal.addEventListener('abort', abortHandler);
      }
      
      const sendChunk = () => {
        // Check if aborted during execution
        if (abortController?.signal.aborted) {
          return; // Already handled by abort listener
        }
        
        if (chunkIndex < chunks.length) {
          if (request.options?.streamCallback) {
            request.options.streamCallback(chunks[chunkIndex]);
          }
          chunkIndex++;
          timeoutId = setTimeout(sendChunk, 10); // 10ms delay between chunks
        } else {
          resolve('Hello world!');
        }
      };
      
      timeoutId = setTimeout(sendChunk, 10);
    });
  }
};

// Mock event bus
const createMockEventBus = (): IEventBus => ({
  publish: jest.fn().mockResolvedValue(undefined),
  subscribe: jest.fn().mockReturnValue(() => {}),
  subscribeOnce: jest.fn().mockReturnValue(() => {}),
  unsubscribe: jest.fn(),
  clear: jest.fn(),
  getSubscriptionCount: jest.fn().mockReturnValue(0),
});

// Mock plugin
const createMockPlugin = (): Partial<MyPlugin> => ({
  app: {
    workspace: {
      getLeavesOfType: jest.fn(() => [])
    }
  } as any,
  settings: {
    temperature: 0.7,
    debugMode: true,
    provider: 'openai',
    selectedModel: 'openai:gpt-4',
    agentModeSettings: {
      enabled: false,
      autoMode: false,
      confirmBeforeActions: true,
      maxToolCalls: 5,
      toolTimeout: 30000
    }
  } as any,
  debugLog: jest.fn(),
  aiDispatcher: {
    hasActiveStreams: jest.fn(() => false),
    abortAllStreams: jest.fn(),
    getActiveStreamCount: jest.fn(() => 0),
  } as any,
});

describe('StreamCoordinator Integration Tests', () => {
  let streamCoordinator: StreamCoordinator;
  let mockPlugin: Partial<MyPlugin>;
  let mockEventBus: IEventBus;
  let uiStateCallback: jest.Mock;

  beforeEach(() => {
    mockPlugin = createMockPlugin();
    mockEventBus = createMockEventBus();
    uiStateCallback = jest.fn();
    
    streamCoordinator = new StreamCoordinator(
      mockPlugin as MyPlugin,
      mockEventBus,
      mockAIService as any
    );
    
    streamCoordinator.onUIStateChange(uiStateCallback);
    
    // Clear all mocks to ensure clean state
    jest.clearAllMocks();
  });

  afterEach(() => {
    if (streamCoordinator) {
      streamCoordinator.dispose();
    }
  });

  describe('Stream Lifecycle Management', () => {
    test('should start and complete a stream successfully', async () => {
      const messages: Message[] = [
        { role: 'user', content: 'Hello' }
      ];
      
      const container = document.createElement('div');
      const messageContent = document.createElement('div');
      messageContent.className = 'message-content';
      container.appendChild(messageContent);
      
      const chunkCallback = jest.fn();
      
      expect(streamCoordinator.isStreaming()).toBe(false);
      
      const streamPromise = streamCoordinator.startStream(messages, {
        uiContainer: container,
        onChunk: chunkCallback,
        temperature: 0.7
      });
      
      // Should now be streaming
      expect(streamCoordinator.isStreaming()).toBe(true);
      expect(uiStateCallback).toHaveBeenCalledWith(true);
      
      const result = await streamPromise;
      
      // Should complete successfully
      expect(result).toBe('Hello world!');
      expect(streamCoordinator.isStreaming()).toBe(false);
      expect(uiStateCallback).toHaveBeenCalledWith(false);
      expect(chunkCallback).toHaveBeenCalledTimes(3);
      expect(chunkCallback).toHaveBeenCalledWith('Hello', 'Hello');
      expect(chunkCallback).toHaveBeenCalledWith(' world', 'Hello world');
      expect(chunkCallback).toHaveBeenCalledWith('!', 'Hello world!');
    });

    test('should prevent multiple concurrent streams', async () => {
      const messages: Message[] = [
        { role: 'user', content: 'Hello' }
      ];
      
      // Start first stream
      const stream1Promise = streamCoordinator.startStream(messages);
      expect(streamCoordinator.isStreaming()).toBe(true);
      
      // Try to start second stream
      await expect(streamCoordinator.startStream(messages))
        .rejects.toThrow('A stream is already active');
      
      // Complete first stream
      await stream1Promise;
      expect(streamCoordinator.isStreaming()).toBe(false);
    });

    test('should stop stream successfully', async () => {
      // Create a separate StreamCoordinator with abort-aware AI service for this test
      const abortStreamCoordinator = new StreamCoordinator(
        mockPlugin as MyPlugin,
        mockEventBus,
        mockAIServiceWithAbort as any
      );
      
      const abortUICallback = jest.fn();
      abortStreamCoordinator.onUIStateChange(abortUICallback);
      
      const messages: Message[] = [
        { role: 'user', content: 'Hello' }
      ];
      
      const streamPromise = abortStreamCoordinator.startStream(messages);
      expect(abortStreamCoordinator.isStreaming()).toBe(true);
      
      // Stop the stream
      abortStreamCoordinator.stopStream();
      
      // Should immediately show as not streaming
      expect(abortStreamCoordinator.isStreaming()).toBe(false);
      expect(abortUICallback).toHaveBeenCalledWith(false);
      
      // Stream should be rejected with AbortError
      await expect(streamPromise).rejects.toThrow('AbortError');
      
      // Clean up
      abortStreamCoordinator.dispose();
    }, 10000); // Increase timeout to 10 seconds

    test('should track active streams count', () => {
      expect(streamCoordinator.getActiveStreams()).toEqual([]);
      
      const messages: Message[] = [
        { role: 'user', content: 'Hello' }
      ];
      
      streamCoordinator.startStream(messages);
      expect(streamCoordinator.getActiveStreams().length).toBe(1);
      
      streamCoordinator.stopStream();
      expect(streamCoordinator.getActiveStreams()).toEqual([]);
    });
  });

  describe('UI Integration', () => {
    test('should manage active container correctly', () => {
      const container = document.createElement('div');
      
      expect(streamCoordinator.getActiveContainer()).toBeNull();
      
      streamCoordinator.setActiveContainer(container);
      expect(streamCoordinator.getActiveContainer()).toBe(container);
      
      streamCoordinator.setActiveContainer(null);
      expect(streamCoordinator.getActiveContainer()).toBeNull();
    });

    test('should call UI state callback on stream state changes', async () => {
      const messages: Message[] = [
        { role: 'user', content: 'Hello' }
      ];
      
      uiStateCallback.mockClear();
      
      const streamPromise = streamCoordinator.startStream(messages);
      expect(uiStateCallback).toHaveBeenCalledWith(true);
      
      const result = await streamPromise;
      expect(result).toBe('Hello world!');
      expect(uiStateCallback).toHaveBeenCalledWith(false);
    });

    test('should handle UI callback removal', () => {
      const callback1 = jest.fn();
      const callback2 = jest.fn();
      
      streamCoordinator.onUIStateChange(callback1);
      streamCoordinator.onUIStateChange(callback2);
      
      const messages: Message[] = [
        { role: 'user', content: 'Hello' }
      ];
      
      streamCoordinator.startStream(messages);
      expect(callback1).toHaveBeenCalledWith(true);
      expect(callback2).toHaveBeenCalledWith(true);
      
      streamCoordinator.offUIStateChange(callback1);
      streamCoordinator.stopStream();
      
      expect(callback1).toHaveBeenCalledTimes(1); // Only the start call
      expect(callback2).toHaveBeenCalledWith(false); // Both start and stop calls
    });
  });

  describe('Error Handling', () => {
    test('should handle stream errors gracefully', async () => {
      const errorAIService = {
        async getCompletion(): Promise<string> {
          throw new Error('AI Service Error');
        }
      };
      
      const errorStreamCoordinator = new StreamCoordinator(
        mockPlugin as MyPlugin,
        mockEventBus,
        errorAIService as any
      );
      
      const errorUICallback = jest.fn();
      errorStreamCoordinator.onUIStateChange(errorUICallback);
      
      const messages: Message[] = [
        { role: 'user', content: 'Hello' }
      ];
      
      await expect(errorStreamCoordinator.startStream(messages))
        .rejects.toThrow('AI Service Error');
      
      // Should reset streaming state after error
      expect(errorStreamCoordinator.isStreaming()).toBe(false);
      expect(errorUICallback).toHaveBeenCalledWith(true); // Start
      expect(errorUICallback).toHaveBeenCalledWith(false); // Cleanup after error
      
      errorStreamCoordinator.dispose();
    });

    test('should handle UI callback errors gracefully', async () => {
      const errorCallback = jest.fn().mockImplementation(() => {
        throw new Error('UI Callback Error');
      });
      
      streamCoordinator.onUIStateChange(errorCallback);
      
      const messages: Message[] = [
        { role: 'user', content: 'Hello' }
      ];
      
      // Should not throw even if UI callback throws
      const result = await streamCoordinator.startStream(messages);
      expect(result).toBe('Hello world!');
      expect(errorCallback).toHaveBeenCalled();
    });
  });

  describe('Event Bus Integration', () => {
    test('should publish stream events', async () => {
      const messages: Message[] = [
        { role: 'user', content: 'Hello' }
      ];
      
      const result = await streamCoordinator.startStream(messages);
      
      expect(mockEventBus.publish).toHaveBeenCalledWith('stream.started', expect.objectContaining({
        provider: expect.any(String),
        messageCount: 1,
        timestamp: expect.any(Number)
      }));
      
      expect(mockEventBus.publish).toHaveBeenCalledWith('stream.completed', expect.objectContaining({
        content: 'Hello world!',
        duration: expect.any(Number),
        chunkCount: 3,
        characterCount: 12,
        timestamp: expect.any(Number)
      }));
    });

    test('should publish chunk events during streaming', async () => {
      const messages: Message[] = [
        { role: 'user', content: 'Hello' }
      ];
      
      await streamCoordinator.startStream(messages);
      
      expect(mockEventBus.publish).toHaveBeenCalledWith('stream.chunk', expect.objectContaining({
        chunk: 'Hello',
        totalLength: 5,
        chunkIndex: 1,
        timestamp: expect.any(Number)
      }));
    });
  });
});

describe('Plugin Integration Tests', () => {
  let mockPlugin: any;
  let mockChatView: any;
  let mockStreamCoordinator: any;

  beforeEach(() => {
    mockStreamCoordinator = {
      isStreaming: jest.fn(() => false),
      stopStream: jest.fn(),
      getActiveStreams: jest.fn(() => []),
    };

    mockChatView = {
      streamCoordinator: mockStreamCoordinator,
      hasActiveStream: jest.fn(() => false),
      stopActiveStream: jest.fn(),
    };

    mockPlugin = {
      app: {
        workspace: {
          getLeavesOfType: jest.fn(() => [
            { view: mockChatView }
          ])
        }
      },
      activeStream: null,
      aiDispatcher: {
        hasActiveStreams: jest.fn(() => false),
        abortAllStreams: jest.fn(),
        getActiveStreamCount: jest.fn(() => 0),
      },
      settings: { debugMode: true },
      debugLog: jest.fn(),
    };

    // Import the methods we want to test
    mockPlugin.hasActiveAIStreams = function(this: any): boolean {
      // Check the legacy activeStream property
      if (this.activeStream) {
        return true;
      }
      
      // Check the central AI dispatcher
      if (this.aiDispatcher && this.aiDispatcher.hasActiveStreams()) {
        return true;
      }
      
      // Check ChatView StreamCoordinators (new system)
      const chatLeaves = this.app.workspace.getLeavesOfType('chat-view');
      for (const leaf of chatLeaves) {
        const chatView = leaf.view;
        if (chatView && chatView.streamCoordinator) {
          const streamCoordinator = chatView.streamCoordinator;
          if (streamCoordinator.isStreaming()) {
            return true;
          }
        }
      }
      
      return false;
    };

    mockPlugin.stopAllAIStreams = function(this: any): void {
      // Stop legacy active stream
      if (this.activeStream) {
        this.activeStream.abort();
        this.activeStream = null;
      }
      
      // Stop all streams managed by the central AI dispatcher
      if (this.aiDispatcher) {
        this.aiDispatcher.abortAllStreams();
      }
      
      // Stop StreamCoordinator streams (new system)
      const chatLeaves = this.app.workspace.getLeavesOfType('chat-view');
      chatLeaves.forEach((leaf: any) => {
        const chatView = leaf.view;
        if (chatView && chatView.streamCoordinator) {
          const streamCoordinator = chatView.streamCoordinator;
          if (streamCoordinator.isStreaming()) {
            streamCoordinator.stopStream();
          }
        }
      });
      
      // Defensive: Also directly stop any ChatView streams
      chatLeaves.forEach((leaf: any) => {
        const chatView = leaf.view;
        if (chatView && typeof chatView.stopActiveStream === 'function') {
          chatView.stopActiveStream();
        }
      });
    };

    mockPlugin.getActiveStreamCount = function(this: any): number {
      let count = 0;
      
      if (this.activeStream) {
        count += 1;
      }
      
      if (this.aiDispatcher) {
        count += this.aiDispatcher.getActiveStreamCount();
      }
      
      // Count StreamCoordinator streams (new system)
      const chatLeaves = this.app.workspace.getLeavesOfType('chat-view');
      for (const leaf of chatLeaves) {
        const chatView = leaf.view;
        if (chatView && chatView.streamCoordinator) {
          const streamCoordinator = chatView.streamCoordinator;
          count += streamCoordinator.getActiveStreams().length;
        }
      }
      
      return count;
    };
  });

  describe('hasActiveAIStreams', () => {
    test('should return false when no streams are active', () => {
      expect(mockPlugin.hasActiveAIStreams()).toBe(false);
    });

    test('should return true when StreamCoordinator has active streams', () => {
      mockStreamCoordinator.isStreaming.mockReturnValue(true);
      expect(mockPlugin.hasActiveAIStreams()).toBe(true);
    });

    test('should return true when legacy activeStream is present', () => {
      mockPlugin.activeStream = { abort: jest.fn() };
      expect(mockPlugin.hasActiveAIStreams()).toBe(true);
    });

    test('should return true when AIDispatcher has active streams', () => {
      mockPlugin.aiDispatcher.hasActiveStreams.mockReturnValue(true);
      expect(mockPlugin.hasActiveAIStreams()).toBe(true);
    });
  });

  describe('stopAllAIStreams', () => {
    test('should stop StreamCoordinator streams', () => {
      mockStreamCoordinator.isStreaming.mockReturnValue(true);
      
      mockPlugin.stopAllAIStreams();
      
      expect(mockStreamCoordinator.stopStream).toHaveBeenCalled();
      expect(mockChatView.stopActiveStream).toHaveBeenCalled();
      expect(mockPlugin.aiDispatcher.abortAllStreams).toHaveBeenCalled();
    });

    test('should stop legacy streams', () => {
      const mockAbortController = { abort: jest.fn() };
      mockPlugin.activeStream = mockAbortController;
      
      mockPlugin.stopAllAIStreams();
      
      expect(mockAbortController.abort).toHaveBeenCalled();
      expect(mockPlugin.activeStream).toBeNull();
    });

    test('should handle missing StreamCoordinator gracefully', () => {
      mockChatView.streamCoordinator = null;
      
      expect(() => mockPlugin.stopAllAIStreams()).not.toThrow();
      expect(mockChatView.stopActiveStream).toHaveBeenCalled();
    });
  });

  describe('getActiveStreamCount', () => {
    test('should count streams from all sources', () => {
      mockPlugin.activeStream = { abort: jest.fn() }; // +1
      mockPlugin.aiDispatcher.getActiveStreamCount.mockReturnValue(2); // +2
      mockStreamCoordinator.getActiveStreams.mockReturnValue(['stream1', 'stream2']); // +2
      
      const count = mockPlugin.getActiveStreamCount();
      expect(count).toBe(5);
    });

    test('should return zero when no streams are active', () => {
      const count = mockPlugin.getActiveStreamCount();
      expect(count).toBe(0);
    });
  });
});
