/**
 * @file YAMLHandler.test.ts
 * @description Unit tests for YAMLHandler functions covering title generation, YAML attribute generation, and command registration
 */

// Mock all dependencies before imports
jest.mock('obsidian', () => ({
  Notice: jest.fn(),
  Plugin: jest.fn().mockImplementation(function() {
    this.app = {};
    this.addCommand = jest.fn();
    this.registerEvent = jest.fn();
  }),
}));

jest.mock('js-yaml', () => ({
  load: jest.fn(),
  dump: jest.fn(),
}));

jest.mock('../../src/utils/aiDispatcher');
jest.mock('../../src/utils/pluginUtils');
jest.mock('../../src/utils/logger');
jest.mock('../../src/utils/typeguards', () => ({
  withTemporarySetting: jest.fn().mockImplementation(async (settings, property, tempValue, operation) => {
    const originalValue = settings[property];
    settings[property] = tempValue;
    try {
      return await operation();
    } finally {
      settings[property] = originalValue;
    }
  }),
}));
jest.mock('../../src/promptConstants', () => ({
  DEFAULT_TITLE_PROMPT: 'Generate a title for this note',
  DEFAULT_SUMMARY_PROMPT: 'Generate a summary for this note',
  DEFAULT_YAML_SYSTEM_MESSAGE: 'You are a YAML generator',
}));

// Mock navigator.clipboard
Object.defineProperty(window.navigator, 'clipboard', {
  value: {
    writeText: jest.fn().mockResolvedValue(undefined),
  },
  writable: true,
});

import { generateTableOfContents, generateNoteTitle, generateYamlAttribute, upsertYamlField, registerYamlAttributeCommands } from '../../src/YAMLHandler';
import { MyPluginSettings, DEFAULT_SETTINGS } from '../../src/types/settings';
import { Notice } from 'obsidian';
import { Message } from '../../src/types';
import MyPlugin from '../../src/main';

/**
 * Creates a mock app with all necessary mocked methods
 */
const createMockApp = () => {
  return {
    workspace: {
      getActiveFile: jest.fn(),
    },
    vault: {
      cachedRead: jest.fn(),
      read: jest.fn(),
      modify: jest.fn(),
    },
    fileManager: {
      renameFile: jest.fn(),
    },
    commands: {
      removeCommand: jest.fn(),
    },
  };
};

/**
 * Creates a mock file object
 */
const createMockFile = (path: string = 'test.md', content: string = '') => {
  return {
    path,
    name: path.split('/').pop() || 'test.md',
    extension: 'md',
    parent: {
      path: path.includes('/') ? path.substring(0, path.lastIndexOf('/')) : '',
    },
    basename: path.replace('.md', ''),
  };
};

/**
 * Creates a mock plugin instance
 */
const createMockPlugin = (settings?: Partial<MyPluginSettings>): MyPlugin => {
  const mockPlugin = {
    settings: { ...DEFAULT_SETTINGS, ...settings },
    app: createMockApp(),
    addCommand: jest.fn(),
    registerEvent: jest.fn(),
  } as unknown as MyPlugin;
  return mockPlugin;
};

describe('YAMLHandler', () => {
  let mockApp: any;
  let mockSettings: MyPluginSettings;
  let mockProcessMessages: jest.MockedFunction<(messages: Message[]) => Promise<Message[]>>;
  let mockDispatcher: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockApp = createMockApp();
    mockSettings = { ...DEFAULT_SETTINGS };
    mockProcessMessages = jest.fn();
    mockDispatcher = {
      getCompletion: jest.fn(),
    };

    // Setup default mocks
    require('js-yaml').load.mockReturnValue({});
    require('js-yaml').dump.mockReturnValue('field: value\n');
  });

  describe('generateTableOfContents', () => {
    test('should generate table of contents from headers', () => {
      const noteContent = `# Header 1
Some content

## Header 2
More content

### Header 3
Even more content

# Another Header 1
Final content`;

      const result = generateTableOfContents(noteContent);

      expect(result).toBe(`- Header 1
  - Header 2
    - Header 3
- Another Header 1`);
    });

    test('should return empty string when no headers found', () => {
      const noteContent = 'Just some regular content without headers.';

      const result = generateTableOfContents(noteContent);

      expect(result).toBe('');
    });

    test('should handle headers with different levels correctly', () => {
      const noteContent = `# H1
## H2
### H3
#### H4
##### H5
###### H6`;

      const result = generateTableOfContents(noteContent);

      expect(result).toBe(`- H1
  - H2
    - H3
      - H4
        - H5
          - H6`);
    });

    test('should handle headers with special characters', () => {
      const noteContent = `# Header with (parentheses)
## Header with [brackets]
### Header with: colons`;

      const result = generateTableOfContents(noteContent);

      expect(result).toBe(`- Header with (parentheses)
  - Header with [brackets]
    - Header with: colons`);
    });
  });

  describe('generateNoteTitle', () => {
    beforeEach(() => {
      mockApp.workspace.getActiveFile.mockReturnValue(createMockFile());
      mockApp.vault.cachedRead.mockResolvedValue('# Test Note\n\nSome content here.');
      mockProcessMessages.mockResolvedValue([
        { role: 'system', content: 'Generate a title' },
        { role: 'user', content: 'Some content here.' }
      ]);
      mockDispatcher.getCompletion.mockResolvedValue(undefined);
    });

    test('should generate title and copy to clipboard (default mode)', async () => {
      const mockStreamCallback = jest.fn();
      mockDispatcher.getCompletion.mockImplementation(async (messages: any, options: any) => {
        if (options?.streamCallback) {
          options.streamCallback('Generated Title');
        }
      });

      await generateNoteTitle(mockApp, mockSettings, mockProcessMessages, mockDispatcher);

      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('Generated Title');
      expect(mockDispatcher.getCompletion).toHaveBeenCalled();
    });

    test('should generate title and insert into metadata', async () => {
      mockSettings.titleOutputMode = 'metadata';
      const mockStreamCallback = jest.fn();
      mockDispatcher.getCompletion.mockImplementation(async (messages: any, options: any) => {
        if (options?.streamCallback) {
          options.streamCallback('Generated Title');
        }
      });

      // Mock vault.read to return content with frontmatter
      mockApp.vault.read.mockResolvedValue('---\ntitle: Old Title\n---\n\nContent');

      await generateNoteTitle(mockApp, mockSettings, mockProcessMessages, mockDispatcher);

      expect(mockApp.vault.read).toHaveBeenCalled();
      expect(mockApp.vault.modify).toHaveBeenCalled();
    });

    test('should generate title and rename file', async () => {
      mockSettings.titleOutputMode = 'replace-filename';
      const mockStreamCallback = jest.fn();
      mockDispatcher.getCompletion.mockImplementation(async (messages: any, options: any) => {
        if (options?.streamCallback) {
          options.streamCallback('New Title');
        }
      });

      await generateNoteTitle(mockApp, mockSettings, mockProcessMessages, mockDispatcher);

      expect(mockApp.fileManager.renameFile).toHaveBeenCalled();
    });

    test('should handle no active file', async () => {
      mockApp.workspace.getActiveFile.mockReturnValue(null);

      await generateNoteTitle(mockApp, mockSettings, mockProcessMessages, mockDispatcher);

      expect(mockDispatcher.getCompletion).not.toHaveBeenCalled();
    });

    test('should sanitize title by removing invalid characters', async () => {
      const mockStreamCallback = jest.fn();
      mockDispatcher.getCompletion.mockImplementation(async (messages: any, options: any) => {
        if (options?.streamCallback) {
          options.streamCallback('Title: with/invalid\\chars');
        }
      });

      await generateNoteTitle(mockApp, mockSettings, mockProcessMessages, mockDispatcher);

      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('Title withinvalidchars');
    });

    test('should include table of contents when headers exist', async () => {
      const contentWithHeaders = `# Main Header
Some content

## Sub Header
More content`;

      mockApp.vault.cachedRead.mockResolvedValue(contentWithHeaders);
      const mockStreamCallback = jest.fn();
      mockDispatcher.getCompletion.mockImplementation(async (messages: any, options: any) => {
        if (options?.streamCallback) {
          options.streamCallback('Generated Title');
        }
      });

      await generateNoteTitle(mockApp, mockSettings, mockProcessMessages, mockDispatcher);

      expect(mockProcessMessages).toHaveBeenCalled();
      const messages = mockProcessMessages.mock.calls[0][0];
      expect(messages[1].content).toContain('Table of Contents:');
      expect(messages[1].content).toContain('- Main Header');
    });

    test('should handle empty title generation', async () => {
      const mockStreamCallback = jest.fn();
      mockDispatcher.getCompletion.mockImplementation(async (messages: any, options: any) => {
        if (options?.streamCallback) {
          options.streamCallback('');
        }
      });

      await generateNoteTitle(mockApp, mockSettings, mockProcessMessages, mockDispatcher);

      expect(navigator.clipboard.writeText).not.toHaveBeenCalled();
    });

    test('should handle AI dispatcher errors gracefully', async () => {
      mockDispatcher.getCompletion.mockRejectedValue(new Error('AI Error'));

      await expect(generateNoteTitle(mockApp, mockSettings, mockProcessMessages, mockDispatcher))
        .resolves.toBeUndefined();

      // Should show error notice
      expect(Notice).toHaveBeenCalledWith('Error generating title: AI Error');
    });
  });

  describe('generateYamlAttribute', () => {
    beforeEach(() => {
      mockApp.workspace.getActiveFile.mockReturnValue(createMockFile());
      mockApp.vault.cachedRead.mockResolvedValue('Note content here');
      mockProcessMessages.mockResolvedValue([
        { role: 'system', content: 'Generate attribute' },
        { role: 'user', content: 'Note content here' }
      ]);
    });

    test('should generate YAML attribute and insert into metadata', async () => {
      const mockStreamCallback = jest.fn();
      mockDispatcher.getCompletion.mockImplementation(async (messages: any, options: any) => {
        if (options?.streamCallback) {
          options.streamCallback('Generated Value');
        }
      });

      // Mock vault.read to return content with frontmatter
      mockApp.vault.read.mockResolvedValue('---\ntitle: Old Title\n---\n\nContent');

      await generateYamlAttribute(
        mockApp,
        mockSettings,
        mockProcessMessages,
        'summary',
        'Generate a summary',
        'metadata',
        mockDispatcher
      );

      expect(mockApp.vault.read).toHaveBeenCalled();
      expect(mockApp.vault.modify).toHaveBeenCalled();
    });

    test('should generate YAML attribute and copy to clipboard', async () => {
      const mockStreamCallback = jest.fn();
      mockDispatcher.getCompletion.mockImplementation(async (messages: any, options: any) => {
        if (options?.streamCallback) {
          options.streamCallback('Generated Value');
        }
      });

      await generateYamlAttribute(
        mockApp,
        mockSettings,
        mockProcessMessages,
        'summary',
        'Generate a summary',
        'clipboard',
        mockDispatcher
      );

      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('Generated Value');
    });

    test('should handle no active file', async () => {
      mockApp.workspace.getActiveFile.mockReturnValue(null);

      await generateYamlAttribute(
        mockApp,
        mockSettings,
        mockProcessMessages,
        'summary',
        'Generate a summary',
        'metadata',
        mockDispatcher
      );

      expect(mockDispatcher.getCompletion).not.toHaveBeenCalled();
    });

    test('should sanitize generated value', async () => {
      const mockStreamCallback = jest.fn();
      mockDispatcher.getCompletion.mockImplementation(async (messages: any, options: any) => {
        if (options?.streamCallback) {
          options.streamCallback('Value/with\\invalid');
        }
      });

      await generateYamlAttribute(
        mockApp,
        mockSettings,
        mockProcessMessages,
        'summary',
        'Generate a summary',
        'clipboard',
        mockDispatcher
      );

      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('Valuewithinvalid');
    });

    test('should handle empty value generation', async () => {
      const mockStreamCallback = jest.fn();
      mockDispatcher.getCompletion.mockImplementation(async (messages: any, options: any) => {
        if (options?.streamCallback) {
          options.streamCallback('');
        }
      });

      await generateYamlAttribute(
        mockApp,
        mockSettings,
        mockProcessMessages,
        'summary',
        'Generate a summary',
        'metadata',
        mockDispatcher
      );

      expect(mockApp.vault.modify).not.toHaveBeenCalled();
    });
  });

  describe('upsertYamlField', () => {
    let mockFile: any;

    beforeEach(() => {
      mockFile = createMockFile();
      mockApp.vault.read.mockResolvedValue('---\ntitle: Old Title\n---\n\nContent');
      mockApp.vault.modify.mockResolvedValue(undefined);
    });

    test('should update existing YAML field', async () => {
      require('js-yaml').load.mockReturnValue({ title: 'Old Title', author: 'Test' });
      require('js-yaml').dump.mockReturnValue('title: New Title\nauthor: Test\n');

      await upsertYamlField(mockApp, mockFile, 'title', 'New Title');

      expect(mockApp.vault.modify).toHaveBeenCalledWith(
        mockFile,
        '---\ntitle: New Title\nauthor: Test\n---\n\nContent'
      );
    });

    test('should add new YAML field to existing frontmatter', async () => {
      require('js-yaml').load.mockReturnValue({ title: 'Old Title' });
      require('js-yaml').dump.mockReturnValue('title: Old Title\nsummary: New Summary\n');

      await upsertYamlField(mockApp, mockFile, 'summary', 'New Summary');

      expect(mockApp.vault.modify).toHaveBeenCalled();
    });

    test('should create new frontmatter when none exists', async () => {
      require('js-yaml').dump.mockReturnValue('title: New Title\n');
      mockApp.vault.read.mockResolvedValue('Just content without frontmatter');

      await upsertYamlField(mockApp, mockFile, 'title', 'New Title');

      expect(mockApp.vault.modify).toHaveBeenCalledWith(
        mockFile,
        '---\ntitle: New Title\n---\nJust content without frontmatter'
      );
    });

    test('should handle malformed YAML gracefully', async () => {
      require('js-yaml').load.mockImplementation(() => {
        throw new Error('YAML parse error');
      });
      require('js-yaml').dump.mockReturnValue('title: New Title\n');

      await upsertYamlField(mockApp, mockFile, 'title', 'New Title');

      expect(mockApp.vault.modify).toHaveBeenCalled();
    });

    test('should handle empty YAML object', async () => {
      require('js-yaml').load.mockReturnValue(null);
      require('js-yaml').dump.mockReturnValue('title: New Title\n');

      await upsertYamlField(mockApp, mockFile, 'title', 'New Title');

      expect(mockApp.vault.modify).toHaveBeenCalled();
    });
  });

  describe('registerYamlAttributeCommands', () => {
    let mockPlugin: MyPlugin;
    let mockDebugLog: jest.MockedFunction<any>;

    beforeEach(() => {
      mockPlugin = createMockPlugin({
        yamlAttributeGenerators: [
          {
            attributeName: 'summary',
            prompt: 'Generate a summary',
            commandName: 'Generate Summary',
            outputMode: 'metadata'
          },
          {
            attributeName: 'tags',
            prompt: 'Generate tags',
            commandName: 'Generate Tags',
            outputMode: 'clipboard'
          }
        ]
      });
      mockDebugLog = jest.fn();
    });

    test('should register commands for each YAML attribute generator', () => {
      const existingIds = ['old-command-1'];

      const result = registerYamlAttributeCommands(
        mockPlugin,
        mockPlugin.settings,
        mockProcessMessages,
        existingIds,
        mockDebugLog
      );

      expect(result).toHaveLength(2);
      expect(result).toContain('generate-yaml-attribute-summary');
      expect(result).toContain('generate-yaml-attribute-tags');
      expect(require('../../src/utils/pluginUtils').registerCommand).toHaveBeenCalledTimes(2);
    });

    test('should remove previously registered commands', () => {
      const existingIds = ['old-command-1', 'old-command-2'];

      registerYamlAttributeCommands(
        mockPlugin,
        mockPlugin.settings,
        mockProcessMessages,
        existingIds,
        mockDebugLog
      );

      expect((mockPlugin.app as any).commands.removeCommand).toHaveBeenCalledWith('old-command-1');
      expect((mockPlugin.app as any).commands.removeCommand).toHaveBeenCalledWith('old-command-2');
    });

    test('should skip generators with missing properties', () => {
      const settingsWithIncomplete = {
        ...mockPlugin.settings,
        yamlAttributeGenerators: [
          {
            attributeName: 'summary',
            prompt: 'Generate a summary',
            commandName: 'Generate Summary',
            outputMode: 'metadata' as const
          },
          {
            attributeName: '', // Missing attributeName
            prompt: 'Generate tags',
            commandName: 'Generate Tags',
            outputMode: 'clipboard' as const
          },
          {
            attributeName: 'tags',
            prompt: '', // Missing prompt
            commandName: 'Generate Tags',
            outputMode: 'clipboard' as const
          }
        ]
      };

      const result = registerYamlAttributeCommands(
        mockPlugin,
        settingsWithIncomplete,
        mockProcessMessages,
        [],
        mockDebugLog
      );

      expect(result).toHaveLength(1);
      expect(result).toContain('generate-yaml-attribute-summary');
    });

    test('should handle empty generators array', () => {
      const settingsWithEmpty = {
        ...mockPlugin.settings,
        yamlAttributeGenerators: []
      };

      const result = registerYamlAttributeCommands(
        mockPlugin,
        settingsWithEmpty,
        mockProcessMessages,
        [],
        mockDebugLog
      );

      expect(result).toHaveLength(0);
      expect(require('../../src/utils/pluginUtils').registerCommand).not.toHaveBeenCalled();
    });

    test('should handle undefined generators array', () => {
      const settingsWithUndefined = {
        ...mockPlugin.settings,
        yamlAttributeGenerators: undefined
      };

      const result = registerYamlAttributeCommands(
        mockPlugin,
        settingsWithUndefined,
        mockProcessMessages,
        [],
        mockDebugLog
      );

      expect(result).toHaveLength(0);
      expect(require('../../src/utils/pluginUtils').registerCommand).not.toHaveBeenCalled();
    });
  });
});