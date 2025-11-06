/**
 * @file tests/unit/commands/aiStreamCommands.test.ts
 * @description Unit tests for AI stream command registration
 */

import { registerAIStreamCommands } from '../../../src/components/commands/aiStreamCommands';
import { createMockPlugin } from '../../utils/testHelpers';
import { DEFAULT_SETTINGS } from '../../../src/types';

// Mock the utility functions
jest.mock('../../../src/utils/pluginUtils', () => ({
  registerCommand: jest.fn(),
}));

jest.mock('../../../src/utils/aiCompletionHandler', () => ({
  handleAICompletion: jest.fn(),
}));

jest.mock('../../../src/utils/generalUtils', () => ({
  showNotice: jest.fn(),
}));

jest.mock('../../../src/utils/systemMessage', () => ({
  getSystemMessage: jest.fn(),
}));

jest.mock('../../../src/chat', () => ({
  VIEW_TYPE_CHAT: 'ai-chat-view',
}));

describe('registerAIStreamCommands', () => {
  let mockPlugin: any;
  let mockSettings: any;
  let mockProcessMessages: jest.MockedFunction<any>;
  let mockActiveStream: { current: AbortController | null };
  let mockSetActiveStream: jest.MockedFunction<any>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockPlugin = createMockPlugin();
    // Add debugLog method to mock plugin
    mockPlugin.debugLog = jest.fn();
    mockSettings = { ...DEFAULT_SETTINGS };
    mockProcessMessages = jest.fn();
    mockActiveStream = { current: null };
    mockSetActiveStream = jest.fn();
  });

  describe('command registration', () => {
    test('should register three AI stream commands', () => {
      const { registerCommand } = require('../../../src/utils/pluginUtils');

      registerAIStreamCommands(
        mockPlugin,
        mockSettings,
        mockProcessMessages,
        mockActiveStream,
        mockSetActiveStream
      );

      expect(registerCommand).toHaveBeenCalledTimes(3);
    });

    test('should register ai-completion command', () => {
      const { registerCommand } = require('../../../src/utils/pluginUtils');

      registerAIStreamCommands(
        mockPlugin,
        mockSettings,
        mockProcessMessages,
        mockActiveStream,
        mockSetActiveStream
      );

      const aiCompletionCall = registerCommand.mock.calls.find((call: any) =>
        call[1].id === 'ai-completion'
      );

      expect(aiCompletionCall).toBeDefined();
      expect(aiCompletionCall[1]).toEqual({
        id: 'ai-completion',
        name: 'Get AI Completion',
        editorCallback: expect.any(Function),
      });
    });

    test('should register end-ai-stream command', () => {
      const { registerCommand } = require('../../../src/utils/pluginUtils');

      registerAIStreamCommands(
        mockPlugin,
        mockSettings,
        mockProcessMessages,
        mockActiveStream,
        mockSetActiveStream
      );

      const endStreamCall = registerCommand.mock.calls.find((call: any) =>
        call[1].id === 'end-ai-stream'
      );

      expect(endStreamCall).toBeDefined();
      expect(endStreamCall[1]).toEqual({
        id: 'end-ai-stream',
        name: 'End AI Stream',
        callback: expect.any(Function),
      });
    });

    test('should register debug-ai-streams command', () => {
      const { registerCommand } = require('../../../src/utils/pluginUtils');

      registerAIStreamCommands(
        mockPlugin,
        mockSettings,
        mockProcessMessages,
        mockActiveStream,
        mockSetActiveStream
      );

      const debugCall = registerCommand.mock.calls.find((call: any) =>
        call[1].id === 'debug-ai-streams'
      );

      expect(debugCall).toBeDefined();
      expect(debugCall[1]).toEqual({
        id: 'debug-ai-streams',
        name: 'Debug AI Streams',
        callback: expect.any(Function),
      });
    });
  });

  describe('ai-completion command', () => {
    let mockEditor: any;

    beforeEach(() => {
      mockEditor = {
        getValue: jest.fn().mockReturnValue('test content'),
        replaceSelection: jest.fn(),
        getCursor: jest.fn().mockReturnValue({ line: 0, ch: 0 }),
      };
    });

    test('should call handleAICompletion with correct parameters', () => {
      const { registerCommand } = require('../../../src/utils/pluginUtils');
      const { handleAICompletion } = require('../../../src/utils/aiCompletionHandler');

      registerAIStreamCommands(
        mockPlugin,
        mockSettings,
        mockProcessMessages,
        mockActiveStream,
        mockSetActiveStream
      );

      const aiCompletionCall = registerCommand.mock.calls.find((call: any) =>
        call[1].id === 'ai-completion'
      );
      const editorCallback = aiCompletionCall[1].editorCallback;

      editorCallback(mockEditor);

      expect(handleAICompletion).toHaveBeenCalledWith(
        mockEditor,
        mockSettings,
        mockProcessMessages,
        mockPlugin.app.vault,
        { settings: mockSettings, saveSettings: expect.any(Function) },
        mockActiveStream,
        mockSetActiveStream,
        mockPlugin.app
      );
    });
  });

  describe('end-ai-stream command', () => {
    test('should stop streams via ChatView when available', () => {
      const { registerCommand } = require('../../../src/utils/pluginUtils');
      const { showNotice } = require('../../../src/utils/generalUtils');

      // Mock ChatView with stop methods
      const mockChatView = {
        stopAllActiveStreams: jest.fn(),
        restoreUIAfterStop: jest.fn(),
      };

      const mockLeaf = {
        view: mockChatView,
      };

      mockPlugin.app.workspace.getLeavesOfType = jest.fn().mockReturnValue([mockLeaf]);

      registerAIStreamCommands(
        mockPlugin,
        mockSettings,
        mockProcessMessages,
        mockActiveStream,
        mockSetActiveStream
      );

      const endStreamCall = registerCommand.mock.calls.find((call: any) =>
        call[1].id === 'end-ai-stream'
      );
      const callback = endStreamCall[1].callback;

      callback();

      expect(mockChatView.stopAllActiveStreams).toHaveBeenCalled();
      expect(mockChatView.restoreUIAfterStop).toHaveBeenCalled();
      expect(showNotice).toHaveBeenCalledWith('All AI streams stopped');
    });

    test('should fallback to plugin stopAllAIStreams when ChatView not available', () => {
      const { registerCommand } = require('../../../src/utils/pluginUtils');
      const { showNotice } = require('../../../src/utils/generalUtils');

      mockPlugin.app.workspace.getLeavesOfType = jest.fn().mockReturnValue([]);
      mockPlugin.hasActiveAIStreams = jest.fn().mockReturnValue(true);
      mockPlugin.stopAllAIStreams = jest.fn();

      registerAIStreamCommands(
        mockPlugin,
        mockSettings,
        mockProcessMessages,
        mockActiveStream,
        mockSetActiveStream
      );

      const endStreamCall = registerCommand.mock.calls.find((call: any) =>
        call[1].id === 'end-ai-stream'
      );
      const callback = endStreamCall[1].callback;

      callback();

      expect(mockPlugin.stopAllAIStreams).toHaveBeenCalled();
      expect(showNotice).toHaveBeenCalledWith('All AI streams stopped');
    });

    test('should fallback to legacy activeStream when other methods not available', () => {
      const { registerCommand } = require('../../../src/utils/pluginUtils');
      const { showNotice } = require('../../../src/utils/generalUtils');

      const abortController = new AbortController();
      mockActiveStream.current = abortController;

      mockPlugin.app.workspace.getLeavesOfType = jest.fn().mockReturnValue([]);
      mockPlugin.hasActiveAIStreams = jest.fn().mockReturnValue(false);

      registerAIStreamCommands(
        mockPlugin,
        mockSettings,
        mockProcessMessages,
        mockActiveStream,
        mockSetActiveStream
      );

      const endStreamCall = registerCommand.mock.calls.find((call: any) =>
        call[1].id === 'end-ai-stream'
      );
      const callback = endStreamCall[1].callback;

      callback();

      expect(abortController.signal.aborted).toBe(true);
      expect(mockActiveStream.current).toBeNull();
      expect(mockSetActiveStream).toHaveBeenCalledWith(null);
      expect(showNotice).toHaveBeenCalledWith('All AI streams stopped');
    });

    test('should show notice when no active streams found', () => {
      const { registerCommand } = require('../../../src/utils/pluginUtils');
      const { showNotice } = require('../../../src/utils/generalUtils');

      mockPlugin.app.workspace.getLeavesOfType = jest.fn().mockReturnValue([]);
      mockPlugin.hasActiveAIStreams = jest.fn().mockReturnValue(false);
      mockActiveStream.current = null;

      registerAIStreamCommands(
        mockPlugin,
        mockSettings,
        mockProcessMessages,
        mockActiveStream,
        mockSetActiveStream
      );

      const endStreamCall = registerCommand.mock.calls.find((call: any) =>
        call[1].id === 'end-ai-stream'
      );
      const callback = endStreamCall[1].callback;

      callback();

      expect(showNotice).toHaveBeenCalledWith('No active AI stream to end');
    });
  });

  describe('debug-ai-streams command', () => {
    test('should display debug information about AI streams', () => {
      const { registerCommand } = require('../../../src/utils/pluginUtils');
      const { showNotice } = require('../../../src/utils/generalUtils');

      // Mock AI dispatcher
      mockPlugin.aiDispatcher = {
        getActiveStreamCount: jest.fn().mockReturnValue(2),
        hasActiveStreams: 'function',
      };

      mockPlugin.hasActiveAIStreams = jest.fn().mockReturnValue(true);
      mockPlugin.stopAllAIStreams = jest.fn();

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      registerAIStreamCommands(
        mockPlugin,
        mockSettings,
        mockProcessMessages,
        mockActiveStream,
        mockSetActiveStream
      );

      const debugCall = registerCommand.mock.calls.find((call: any) =>
        call[1].id === 'debug-ai-streams'
      );
      const callback = debugCall[1].callback;

      callback();

      expect(showNotice).toHaveBeenCalled();
      const noticeMessage = showNotice.mock.calls[0][0];
      expect(noticeMessage).toContain('AI Stream Debug Info:');
      expect(noticeMessage).toContain('Legacy activeStream: None');
      expect(noticeMessage).toContain('AI Dispatcher streams: 2');
      expect(noticeMessage).toContain('Has active AI streams: true');

      expect(consoleSpy).toHaveBeenCalledWith('[AI Assistant Debug]', noticeMessage);

      consoleSpy.mockRestore();
    });

    test('should handle missing AI dispatcher gracefully', () => {
      const { registerCommand } = require('../../../src/utils/pluginUtils');
      const { showNotice } = require('../../../src/utils/generalUtils');

      // No AI dispatcher
      mockPlugin.aiDispatcher = undefined;
      mockPlugin.hasActiveAIStreams = undefined;
      mockPlugin.stopAllAIStreams = undefined;

      registerAIStreamCommands(
        mockPlugin,
        mockSettings,
        mockProcessMessages,
        mockActiveStream,
        mockSetActiveStream
      );

      const debugCall = registerCommand.mock.calls.find((call: any) =>
        call[1].id === 'debug-ai-streams'
      );
      const callback = debugCall[1].callback;

      callback();

      expect(showNotice).toHaveBeenCalled();
      const noticeMessage = showNotice.mock.calls[0][0];
      expect(noticeMessage).toContain('AI Dispatcher: Not initialized');
      expect(noticeMessage).toContain('Plugin hasActiveAIStreams method: undefined');
    });
  });
});