/**
 * @file testHelpers.ts
 * @description Test utilities and helper functions for AI Assistant plugin tests
 */

import { Plugin } from 'obsidian';
import { MyPluginSettings, DEFAULT_SETTINGS } from '../../src/types/settings';
import { Message } from '../../src/types';

// Mock Obsidian App interface
export interface MockApp {
  vault: {
    adapter: {
      basePath: string;
      exists: jest.MockedFunction<any>;
      read: jest.MockedFunction<any>;
      write: jest.MockedFunction<any>;
      writeBinary: jest.MockedFunction<any>;
      readBinary: jest.MockedFunction<any>;
      remove: jest.MockedFunction<any>;
      list: jest.MockedFunction<any>;
      mkdir: jest.MockedFunction<any>;
    };
    getAbstractFileByPath: jest.MockedFunction<any>;
    getMarkdownFiles: jest.MockedFunction<any>;
    read: jest.MockedFunction<any>;
    readBinary: jest.MockedFunction<any>;
    modify: jest.MockedFunction<any>;
    modifyBinary: jest.MockedFunction<any>;
    create: jest.MockedFunction<any>;
    delete: jest.MockedFunction<any>;
    cachedRead: jest.MockedFunction<any>;
  };
  workspace: {
    getActiveFile: jest.MockedFunction<any>;
    getActiveViewOfType: jest.MockedFunction<any>;
    onLayoutReady: jest.MockedFunction<any>;
    getLeavesOfType: jest.MockedFunction<any>;
    createLeafBySplit: jest.MockedFunction<any>;
    getLeaf: jest.MockedFunction<any>;
    on: jest.MockedFunction<any>;
  };
  metadataCache: {
    getFileCache: jest.MockedFunction<any>;
    getCache: jest.MockedFunction<any>;
  };
}

// Mock Plugin interface
export interface MockPlugin {
  settings: MyPluginSettings;
  saveSettings: jest.MockedFunction<any>;
  loadData: jest.MockedFunction<any>;
  saveData: jest.MockedFunction<any>;
  app: MockApp;
  addCommand: jest.MockedFunction<any>;
  addSettingTab: jest.MockedFunction<any>;
  registerView: jest.MockedFunction<any>;
  registerMarkdownPostProcessor: jest.MockedFunction<any>;
  registerMarkdownCodeBlockProcessor: jest.MockedFunction<any>;
  addRibbonIcon: jest.MockedFunction<any>;
  onSettingsChange: jest.MockedFunction<any>;
  offSettingsChange: jest.MockedFunction<any>;
  debugLog: jest.MockedFunction<any>;
  manifest: {
    id: string;
    name: string;
    version: string;
    description: string;
  };
  agentModeManager: {
    isAgentModeEnabled: jest.MockedFunction<any>;
  };
}

/**
 * Creates a mock Obsidian app with all necessary mocked methods
 */
export const createMockApp = (): MockApp => {
  return {
    vault: {
      adapter: {
        basePath: '/mock/path',
        exists: jest.fn().mockResolvedValue(false),
        read: jest.fn().mockResolvedValue(''),
        write: jest.fn().mockResolvedValue(undefined),
        writeBinary: jest.fn().mockResolvedValue(undefined),
        readBinary: jest.fn().mockResolvedValue(new ArrayBuffer(0)),
        remove: jest.fn().mockResolvedValue(undefined),
        list: jest.fn().mockResolvedValue({ files: [], folders: [] }),
        mkdir: jest.fn().mockResolvedValue(undefined),
      },
      getAbstractFileByPath: jest.fn().mockReturnValue(null),
      getMarkdownFiles: jest.fn().mockReturnValue([]),
      read: jest.fn().mockResolvedValue(''),
      readBinary: jest.fn().mockResolvedValue(new ArrayBuffer(0)),
      modify: jest.fn().mockResolvedValue(undefined),
      modifyBinary: jest.fn().mockResolvedValue(undefined),
      create: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue(undefined),
      cachedRead: jest.fn().mockResolvedValue(''),
    },
    workspace: {
      getActiveFile: jest.fn().mockReturnValue(null),
      getActiveViewOfType: jest.fn().mockReturnValue(null),
      onLayoutReady: jest.fn().mockImplementation((callback) => callback()),
      getLeavesOfType: jest.fn().mockReturnValue([]),
      createLeafBySplit: jest.fn().mockReturnValue({}),
      getLeaf: jest.fn().mockReturnValue({}),
      on: jest.fn().mockReturnValue({}),
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
export const createMockPlugin = (settings?: Partial<MyPluginSettings>): MockPlugin => {
  const mockPlugin: MockPlugin = {
    settings: { ...DEFAULT_SETTINGS, ...settings },
    saveSettings: jest.fn().mockResolvedValue(undefined),
    loadData: jest.fn().mockResolvedValue({ ...DEFAULT_SETTINGS, ...settings }),
    saveData: jest.fn().mockResolvedValue(undefined),
    app: createMockApp(),
    addCommand: jest.fn(),
    addSettingTab: jest.fn(),
    registerView: jest.fn(),
    registerMarkdownPostProcessor: jest.fn(),
    registerMarkdownCodeBlockProcessor: jest.fn(),
    addRibbonIcon: jest.fn(),
    onSettingsChange: jest.fn(),
    offSettingsChange: jest.fn(),
    debugLog: jest.fn(),
    manifest: {
      id: 'ai-assistant-for-obsidian',
      name: 'AI Assistant for Obsidian',
      version: '2.1.0',
      description: 'AI chat integration for Obsidian',
    },
    agentModeManager: {
      isAgentModeEnabled: jest.fn().mockReturnValue(false),
    },
  };

  return mockPlugin;
  (mockPlugin as any).activeStream = null;

  return mockPlugin;
};

/**
 * Creates a mock DOM element for testing
 */
export const createMockElement = (tagName: string = 'div'): HTMLElement => {
  const element = document.createElement(tagName);
  jest.spyOn(element, 'addEventListener');
  jest.spyOn(element, 'removeEventListener');
  jest.spyOn(element, 'dispatchEvent');
  return element;
};

/**
 * Creates a mock event for testing
 */
export const createMockEvent = (type: string, options: Partial<Event> = {}): Event => {
  const event = new Event(type, options);
  jest.spyOn(event, 'preventDefault');
  jest.spyOn(event, 'stopPropagation');
  return event;
};

/**
 * Waits for next tick in event loop (useful for async operations)
 */
export const nextTick = (): Promise<void> => {
  return new Promise(resolve => setTimeout(resolve, 0));
};

/**
 * Creates a mock file object for testing
 */
export interface MockFile {
  path: string;
  basename: string;
  content: string;
  stat: {
    mtime: number;
    size: number;
  };
}

export const createMockFile = (path: string, content: string = ''): MockFile => {
  return {
    path,
    basename: path.split('/').pop() || '',
    content,
    stat: {
      mtime: Date.now(),
      size: content.length,
    },
  };
};

/**
 * Test assertion helpers
 */
export const assertSettingsEqual = (actual: MyPluginSettings, expected: Partial<MyPluginSettings>) => {
  Object.entries(expected).forEach(([key, value]) => {
    expect(actual[key as keyof MyPluginSettings]).toEqual(value);
  });
};

export const assertCommandRegistered = (plugin: MockPlugin, commandId: string) => {
  expect(plugin.addCommand).toHaveBeenCalledWith(
    expect.objectContaining({ id: commandId })
  );
};