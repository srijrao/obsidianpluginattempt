/**
 * @file commandRegistry.test.ts
 * @description Unit tests for command registration (commandRegistry.ts)
 */

import { registerAllCommands } from '../../src/components/commands/commandRegistry';
import { createMockPlugin } from '../utils/testHelpers';
import { createTestSettings } from '../utils/factories';

// Mock dependencies
jest.mock('../../src/components/commands');
jest.mock('../../src/YAMLHandler');
jest.mock('../../src/utils/logger');

describe('registerAllCommands', () => {
  let mockPlugin: any;
  let mockSettings: any;
  let mockProcessMessages: jest.MockedFunction<any>;
  let mockActivateChatViewAndLoadMessages: jest.MockedFunction<any>;
  let mockActiveStream: { current: AbortController | null };
  let mockSetActiveStream: jest.MockedFunction<any>;
  let mockYamlAttributeCommandIds: string[];

  beforeEach(() => {
    mockPlugin = createMockPlugin();
    mockSettings = createTestSettings();
    mockProcessMessages = jest.fn().mockResolvedValue([]);
    mockActivateChatViewAndLoadMessages = jest.fn().mockResolvedValue(undefined);
    mockActiveStream = { current: null };
    mockSetActiveStream = jest.fn();
    mockYamlAttributeCommandIds = ['yaml-cmd-1', 'yaml-cmd-2'];

    // Reset all mocks
    jest.clearAllMocks();
  });

  test('should register all command types', () => {
    registerAllCommands(
      mockPlugin,
      mockSettings,
      mockProcessMessages,
      mockActivateChatViewAndLoadMessages,
      mockActiveStream,
      mockSetActiveStream,
      mockYamlAttributeCommandIds
    );

    // Verify that all command registration functions are called
    expect(require('../../src/components/commands').registerViewCommands).toHaveBeenCalledWith(mockPlugin);
    expect(require('../../src/components/commands').registerAIStreamCommands).toHaveBeenCalledWith(
      mockPlugin,
      mockSettings,
      mockProcessMessages,
      mockActiveStream,
      mockSetActiveStream
    );
    expect(require('../../src/components/commands').registerNoteCommands).toHaveBeenCalledWith(
      mockPlugin,
      mockSettings,
      mockActivateChatViewAndLoadMessages
    );
    expect(require('../../src/components/commands').registerGenerateNoteTitleCommand).toHaveBeenCalledWith(
      mockPlugin,
      mockSettings,
      mockProcessMessages
    );
    expect(require('../../src/components/commands').registerContextCommands).toHaveBeenCalledWith(
      mockPlugin,
      mockSettings
    );
    expect(require('../../src/components/commands').registerToggleCommands).toHaveBeenCalledWith(
      mockPlugin,
      mockSettings
    );
  });

  test('should register YAML attribute commands and return command IDs', () => {
    const mockRegisterYamlCommands = jest.mocked(require('../../src/YAMLHandler').registerYamlAttributeCommands);
    mockRegisterYamlCommands.mockReturnValue(['new-yaml-cmd-1', 'new-yaml-cmd-2']);

    const result = registerAllCommands(
      mockPlugin,
      mockSettings,
      mockProcessMessages,
      mockActivateChatViewAndLoadMessages,
      mockActiveStream,
      mockSetActiveStream,
      mockYamlAttributeCommandIds
    );

    expect(mockRegisterYamlCommands).toHaveBeenCalledWith(
      mockPlugin,
      mockSettings,
      mockProcessMessages,
      mockYamlAttributeCommandIds,
      expect.any(Function) // debugLog function
    );

    expect(result).toEqual(['new-yaml-cmd-1', 'new-yaml-cmd-2']);
  });

  test('should pass debug function to YAML command registration', () => {
    const mockRegisterYamlCommands = jest.mocked(require('../../src/YAMLHandler').registerYamlAttributeCommands);
    const mockDebugLog = jest.fn();

    // Mock the debugLog function
    jest.mocked(require('../../src/utils/logger').debugLog).mockImplementation(mockDebugLog);

    registerAllCommands(
      mockPlugin,
      mockSettings,
      mockProcessMessages,
      mockActivateChatViewAndLoadMessages,
      mockActiveStream,
      mockSetActiveStream,
      mockYamlAttributeCommandIds
    );

    // Get the debug function passed to registerYamlAttributeCommands
    const debugFunction = mockRegisterYamlCommands.mock.calls[0][4];

    // Call the debug function
    debugFunction('info', 'Test message', 'arg1', 'arg2');

    // Verify it calls debugLog with correct parameters
    expect(mockDebugLog).toHaveBeenCalledWith(false, 'info', 'Test message', 'arg1', 'arg2');
  });

  test('should handle debug mode enabled', () => {
    const settingsWithDebug = { ...mockSettings, debugMode: true };
    const mockDebugLog = jest.fn();
    jest.mocked(require('../../src/utils/logger').debugLog).mockImplementation(mockDebugLog);

    registerAllCommands(
      mockPlugin,
      settingsWithDebug,
      mockProcessMessages,
      mockActivateChatViewAndLoadMessages,
      mockActiveStream,
      mockSetActiveStream,
      mockYamlAttributeCommandIds
    );

    const debugFunction = require('../../src/YAMLHandler').registerYamlAttributeCommands.mock.calls[0][4];
    debugFunction('info', 'Test message');

    expect(mockDebugLog).toHaveBeenCalledWith(true, 'info', 'Test message');
  });
});