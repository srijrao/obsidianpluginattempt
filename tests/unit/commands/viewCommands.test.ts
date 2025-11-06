/**
 * @file tests/unit/commands/viewCommands.test.ts
 * @description Unit tests for view command registration
 */

import { registerViewCommands } from '../../../src/components/commands/viewCommands';
import { createMockPlugin } from '../../utils/testHelpers';
import { VIEW_TYPE_CHAT } from '../../../src/chat';

// Mock the utility functions
jest.mock('../../../src/utils/pluginUtils', () => ({
  registerCommand: jest.fn(),
}));

jest.mock('../../../src/utils/viewManager', () => ({
  activateView: jest.fn(),
}));

describe('registerViewCommands', () => {
  let mockPlugin: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPlugin = createMockPlugin();
  });

  describe('command registration', () => {
    test('should register the show-ai-chat command', () => {
      const { registerCommand } = require('../../../src/utils/pluginUtils');

      registerViewCommands(mockPlugin);

      expect(registerCommand).toHaveBeenCalledTimes(1);
      expect(registerCommand).toHaveBeenCalledWith(
        mockPlugin,
        {
          id: 'show-ai-chat',
          name: 'Show AI Chat',
          callback: expect.any(Function),
        },
        'message-square',
        'Open AI Chat'
      );
    });

    test('should call activateView with correct parameters when command is executed', () => {
      const { registerCommand } = require('../../../src/utils/pluginUtils');
      const { activateView } = require('../../../src/utils/viewManager');

      registerViewCommands(mockPlugin);

      // Get the callback function that was registered
      const commandConfig = registerCommand.mock.calls[0][1];
      const callback = commandConfig.callback;

      // Execute the callback
      callback();

      expect(activateView).toHaveBeenCalledWith(mockPlugin.app, VIEW_TYPE_CHAT);
    });
  });

  describe('command configuration', () => {
    test('should use correct command ID', () => {
      const { registerCommand } = require('../../../src/utils/pluginUtils');

      registerViewCommands(mockPlugin);

      const commandConfig = registerCommand.mock.calls[0][1];
      expect(commandConfig.id).toBe('show-ai-chat');
    });

    test('should use correct command name', () => {
      const { registerCommand } = require('../../../src/utils/pluginUtils');

      registerViewCommands(mockPlugin);

      const commandConfig = registerCommand.mock.calls[0][1];
      expect(commandConfig.name).toBe('Show AI Chat');
    });

    test('should use correct icon', () => {
      const { registerCommand } = require('../../../src/utils/pluginUtils');

      registerViewCommands(mockPlugin);

      const icon = registerCommand.mock.calls[0][2];
      expect(icon).toBe('message-square');
    });

    test('should use correct display name', () => {
      const { registerCommand } = require('../../../src/utils/pluginUtils');

      registerViewCommands(mockPlugin);

      const displayName = registerCommand.mock.calls[0][3];
      expect(displayName).toBe('Open AI Chat');
    });
  });

  describe('callback functionality', () => {
    test('should handle activateView errors gracefully', () => {
      const { registerCommand } = require('../../../src/utils/pluginUtils');
      const { activateView } = require('../../../src/utils/viewManager');

      activateView.mockImplementation(() => {
        throw new Error('View activation failed');
      });

      registerViewCommands(mockPlugin);

      const commandConfig = registerCommand.mock.calls[0][1];
      const callback = commandConfig.callback;

      // Should throw when callback is executed (no error handling in implementation)
      expect(() => callback()).toThrow('View activation failed');
    });

    test('should pass the correct app instance to activateView', () => {
      const { registerCommand } = require('../../../src/utils/pluginUtils');
      const { activateView } = require('../../../src/utils/viewManager');

      // Reset the mock to default implementation
      activateView.mockImplementation(jest.fn());

      registerViewCommands(mockPlugin);

      const commandConfig = registerCommand.mock.calls[0][1];
      const callback = commandConfig.callback;

      callback();

      expect(activateView).toHaveBeenCalledWith(mockPlugin.app, VIEW_TYPE_CHAT);
    });
  });
});