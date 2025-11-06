/**
 * @file viewCommands.test.ts
 * @description Unit tests for view commands (viewCommands.ts)
 */

import { registerViewCommands } from '../../src/components/commands/viewCommands';
import { createMockPlugin } from '../utils/testHelpers';
import { VIEW_TYPE_CHAT } from '../../src/chat';

// Mock dependencies
jest.mock('../../src/utils/pluginUtils');
jest.mock('../../src/utils/viewManager');
jest.mock('../../src/chat');

describe('registerViewCommands', () => {
  let mockPlugin: any;

  beforeEach(() => {
    mockPlugin = createMockPlugin();
    jest.clearAllMocks();
  });

  test('should register the show-ai-chat command', () => {
    registerViewCommands(mockPlugin);

    // Verify that registerCommand is called with correct parameters
    expect(require('../../src/utils/pluginUtils').registerCommand).toHaveBeenCalledWith(
      mockPlugin,
      {
        id: 'show-ai-chat',
        name: 'Show AI Chat',
        callback: expect.any(Function)
      },
      'message-square',
      'Open AI Chat'
    );
  });

  test('should call activateView when command is executed', () => {
    registerViewCommands(mockPlugin);

    // Get the callback function that was registered
    const registerCommandMock = require('../../src/utils/pluginUtils').registerCommand;
    const commandConfig = registerCommandMock.mock.calls[0][1];
    const callback = commandConfig.callback;

    // Execute the callback
    callback();

    // Verify that activateView is called with correct parameters
    expect(require('../../src/utils/viewManager').activateView).toHaveBeenCalledWith(
      mockPlugin.app,
      VIEW_TYPE_CHAT
    );
  });
});