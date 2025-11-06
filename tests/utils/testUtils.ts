/**
 * @file testUtils.ts
 * @description Test utilities and factory functions for AI Assistant plugin tests
 */

import { App, Plugin, Vault, Workspace, WorkspaceLeaf, TFile } from '../../__mocks__/obsidian';
import { MyPluginSettings, DEFAULT_SETTINGS } from '../../src/types';

/**
 * Creates a mock App instance with all required properties
 */
export function createMockApp(): App {
  return new App();
}

/**
 * Creates a mock Plugin instance with basic setup
 */
export function createMockPlugin(app: App): any {
  const plugin = new Plugin(app);
  (plugin as any).settings = { ...DEFAULT_SETTINGS };
  plugin.manifest = {
    id: 'ai-assistant-for-obsidian',
    name: 'AI Assistant for Obsidian',
    version: '1.0.0'
  };

  // Mock the plugin methods that are used in tests
  plugin.loadData = jest.fn().mockResolvedValue(null);
  plugin.saveData = jest.fn().mockResolvedValue(undefined);
  plugin.addCommand = jest.fn();
  plugin.addSettingTab = jest.fn();
  plugin.addRibbonIcon = jest.fn();
  (plugin as any).registerPluginView = jest.fn();
  (plugin as any).registerMarkdownPostProcessor = jest.fn();
  (plugin as any).registerMarkdownCodeBlockProcessor = jest.fn();
  (plugin as any).onSettingsChange = jest.fn();
  (plugin as any).debugLog = jest.fn();
  (plugin as any).register = jest.fn((callback: () => void) => {
    // Mock register method for cleanup handlers - store callbacks to call during onunload
    if (!(plugin as any)._cleanupCallbacks) {
      (plugin as any)._cleanupCallbacks = [];
    }
    (plugin as any)._cleanupCallbacks.push(callback);
    // Return a function to unregister
    return () => {
      const index = (plugin as any)._cleanupCallbacks.indexOf(callback);
      if (index > -1) {
        (plugin as any)._cleanupCallbacks.splice(index, 1);
      }
    };
  });

  return plugin;
}

/**
 * Creates a mock plugin instance with custom settings
 */
export function createMockPluginWithSettings(app: App, settings: Partial<MyPluginSettings>): any {
  const plugin = createMockPlugin(app);
  plugin.settings = { ...DEFAULT_SETTINGS, ...settings };
  return plugin;
}

/**
 * Creates a mock TFile instance
 */
export function createMockFile(path: string, content: string = ''): TFile {
  const file = new TFile(path);
  file.stat.size = content.length;
  return file;
}

/**
 * Creates a mock WorkspaceLeaf with a view
 */
export function createMockWorkspaceLeaf(viewType: string, view: any = null): WorkspaceLeaf {
  const leaf = new WorkspaceLeaf();
  leaf.view = view || {
    getViewType: () => viewType,
    containerEl: document.createElement('div')
  };
  return leaf;
}

/**
 * Creates a mock vault adapter with basePath
 */
export function createMockVaultAdapter(basePath: string = '/mock/vault/path') {
  return {
    basePath,
    exists: jest.fn().mockResolvedValue(false),
    read: jest.fn().mockResolvedValue('{}'),
    write: jest.fn().mockResolvedValue(undefined),
    remove: jest.fn().mockResolvedValue(undefined),
    list: jest.fn().mockResolvedValue({ files: [], folders: [] }),
    mkdir: jest.fn().mockResolvedValue(undefined),
    rmdir: jest.fn().mockResolvedValue(undefined),
  };
}

/**
 * Creates a mock workspace with leaves of specific types
 */
export function createMockWorkspaceWithLeaves(leafTypes: string[]): Workspace {
  const workspace = new Workspace();

  // Mock getLeavesOfType to return leaves for requested types
  workspace.getLeavesOfType = jest.fn((type: string) => {
    if (leafTypes.includes(type)) {
      return [createMockWorkspaceLeaf(type)];
    }
    return [];
  });

  return workspace;
}

/**
 * Helper to mock console methods for cleaner test output
 */
export function mockConsoleMethods() {
  const originalConsole = { ...console };

  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'debug').mockImplementation(() => {});
  });

  afterEach(() => {
    // Restore original console methods
    Object.assign(console, originalConsole);
  });
}

/**
 * Helper to create mock DOM elements for testing
 */
export function createMockContainer(): HTMLElement {
  return document.createElement('div');
}

/**
 * Helper to wait for async operations in tests
 */
export function waitForNextTick(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0));
}

/**
 * Helper to create mock settings with specific values
 */
export function createMockSettings(overrides: Partial<MyPluginSettings> = {}): MyPluginSettings {
  return {
    ...DEFAULT_SETTINGS,
    ...overrides
  };
}

/**
 * Helper to mock plugin data loading/saving
 */
export function mockPluginDataOperations(plugin: any, data: any = null) {
  plugin.loadData = jest.fn().mockResolvedValue(data);
  plugin.saveData = jest.fn().mockResolvedValue(undefined);
}

/**
 * Helper to verify plugin initialization
 */
export function expectPluginInitialized(plugin: any) {
  expect(plugin.aiDispatcher).toBeDefined();
  expect(plugin.backupManager).toBeDefined();
  expect(plugin.agentModeManager).toBeDefined();
  expect(plugin.priority3Manager).toBeDefined();
  expect(plugin.recentlyOpenedFilesManager).toBeDefined();
}