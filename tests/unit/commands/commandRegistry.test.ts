/**
 * @file tests/unit/commands/commandRegistry.test.ts
 * @description Unit tests for command registry functionality
 */

import { registerAllCommands } from '../../../src/components/commands/commandRegistry';
import { createMockPlugin, createMockApp } from '../../utils/testHelpers';
import { DEFAULT_SETTINGS } from '../../../src/types';

// Mock all the command registration functions
jest.mock('../../../src/components/commands/viewCommands', () => ({
  registerViewCommands: jest.fn(),
}));

jest.mock('../../../src/components/commands/aiStreamCommands', () => ({
  registerAIStreamCommands: jest.fn(),
}));

jest.mock('../../../src/components/commands/noteCommands', () => ({
  registerNoteCommands: jest.fn(),
}));

jest.mock('../../../src/components/commands/generateNoteTitleCommand', () => ({
  registerGenerateNoteTitleCommand: jest.fn(),
}));

jest.mock('../../../src/components/commands/contextCommands', () => ({
  registerContextCommands: jest.fn(),
}));

jest.mock('../../../src/components/commands/toggleCommands', () => ({
  registerToggleCommands: jest.fn(),
}));

jest.mock('../../../src/YAMLHandler', () => ({
  registerYamlAttributeCommands: jest.fn(),
}));

describe('registerAllCommands', () => {
  let mockPlugin: any;
  let mockSettings: any;
  let mockProcessMessages: jest.MockedFunction<any>;
  let mockActivateChatViewAndLoadMessages: jest.MockedFunction<any>;
  let mockActiveStream: { current: AbortController | null };
  let mockSetActiveStream: jest.MockedFunction<any>;
  let mockYamlAttributeCommandIds: string[];

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Create mock plugin
    mockPlugin = createMockPlugin();

    // Create mock settings
    mockSettings = { ...DEFAULT_SETTINGS };

    // Create mock functions
    mockProcessMessages = jest.fn();
    mockActivateChatViewAndLoadMessages = jest.fn();
    mockActiveStream = { current: null };
    mockSetActiveStream = jest.fn();
    mockYamlAttributeCommandIds = ['existing-yaml-command'];
  });

  describe('command registration', () => {
    test('should call all command registration functions', () => {
      // Import the mocked functions to verify they were called
      const { registerViewCommands } = require('../../../src/components/commands/viewCommands');
      const { registerAIStreamCommands } = require('../../../src/components/commands/aiStreamCommands');
      const { registerNoteCommands } = require('../../../src/components/commands/noteCommands');
      const { registerGenerateNoteTitleCommand } = require('../../../src/components/commands/generateNoteTitleCommand');
      const { registerContextCommands } = require('../../../src/components/commands/contextCommands');
      const { registerToggleCommands } = require('../../../src/components/commands/toggleCommands');

      const { registerYamlAttributeCommands } = require('../../../src/YAMLHandler');

      // Call registerAllCommands
      registerAllCommands(
        mockPlugin,
        mockSettings,
        mockProcessMessages,
        mockActivateChatViewAndLoadMessages,
        mockActiveStream,
        mockSetActiveStream,
        mockYamlAttributeCommandIds
      );

      // Verify all command registration functions were called with correct parameters
      expect(registerViewCommands).toHaveBeenCalledWith(mockPlugin);

      expect(registerAIStreamCommands).toHaveBeenCalledWith(
        mockPlugin,
        mockSettings,
        mockProcessMessages,
        mockActiveStream,
        mockSetActiveStream
      );

      expect(registerNoteCommands).toHaveBeenCalledWith(
        mockPlugin,
        mockSettings,
        mockActivateChatViewAndLoadMessages
      );

      expect(registerGenerateNoteTitleCommand).toHaveBeenCalledWith(
        mockPlugin,
        mockSettings,
        mockProcessMessages
      );

      expect(registerContextCommands).toHaveBeenCalledWith(mockPlugin, mockSettings);

      expect(registerToggleCommands).toHaveBeenCalledWith(mockPlugin, mockSettings);

      expect(registerYamlAttributeCommands).toHaveBeenCalledWith(
        mockPlugin,
        mockSettings,
        mockProcessMessages,
        mockYamlAttributeCommandIds,
        expect.any(Function) // debugLog function
      );
    });

    test('should return result from registerYamlAttributeCommands', () => {
      const { registerYamlAttributeCommands } = require('../../../src/YAMLHandler');
      registerYamlAttributeCommands.mockReturnValue(['yaml-command-1', 'yaml-command-2']);

      const result = registerAllCommands(
        mockPlugin,
        mockSettings,
        mockProcessMessages,
        mockActivateChatViewAndLoadMessages,
        mockActiveStream,
        mockSetActiveStream,
        mockYamlAttributeCommandIds
      );

      expect(result).toEqual(['yaml-command-1', 'yaml-command-2']);
    });

    test('should return result from registerYamlAttributeCommands', () => {
      const { registerYamlAttributeCommands } = require('../../../src/YAMLHandler');
      registerYamlAttributeCommands.mockReturnValue(['yaml-command-1', 'yaml-command-2']);

      const result = registerAllCommands(
        mockPlugin,
        mockSettings,
        mockProcessMessages,
        mockActivateChatViewAndLoadMessages,
        mockActiveStream,
        mockSetActiveStream,
        mockYamlAttributeCommandIds
      );

      expect(result).toEqual(['yaml-command-1', 'yaml-command-2']);
    });
  });

  describe('error handling', () => {
    test('should throw when command registration functions fail', () => {
      const { registerViewCommands } = require('../../../src/components/commands/viewCommands');
      registerViewCommands.mockImplementation(() => {
        throw new Error('Registration failed');
      });

      // Should throw when registration function throws
      expect(() => {
        registerAllCommands(
          mockPlugin,
          mockSettings,
          mockProcessMessages,
          mockActivateChatViewAndLoadMessages,
          mockActiveStream,
          mockSetActiveStream,
          mockYamlAttributeCommandIds
        );
      }).toThrow('Registration failed');
    });
  });

  describe('parameter validation', () => {
    test('should handle empty yamlAttributeCommandIds array', () => {
      // Reset mocks to default implementations
      const { registerViewCommands } = require('../../../src/components/commands/viewCommands');
      const { registerYamlAttributeCommands } = require('../../../src/YAMLHandler');
      registerViewCommands.mockImplementation(jest.fn());
      registerYamlAttributeCommands.mockReturnValue(['yaml-command-1']);

      const result = registerAllCommands(
        mockPlugin,
        mockSettings,
        mockProcessMessages,
        mockActivateChatViewAndLoadMessages,
        mockActiveStream,
        mockSetActiveStream,
        []
      );

      expect(result).toEqual(['yaml-command-1']);
    });

    test('should handle null activeStream', () => {
      // Reset mocks to default implementations
      const { registerViewCommands } = require('../../../src/components/commands/viewCommands');
      const { registerYamlAttributeCommands } = require('../../../src/YAMLHandler');
      registerViewCommands.mockImplementation(jest.fn());
      registerYamlAttributeCommands.mockReturnValue(['yaml-command-1']);

      const result = registerAllCommands(
        mockPlugin,
        mockSettings,
        mockProcessMessages,
        mockActivateChatViewAndLoadMessages,
        { current: null },
        mockSetActiveStream,
        mockYamlAttributeCommandIds
      );

      expect(result).toEqual(['yaml-command-1']);
    });
  });
});