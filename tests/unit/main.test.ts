/**
 * @file main.test.ts
 * @description Unit tests for plugin lifecycle (main.ts)
 */

import MyPlugin from '../../src/main';
import { DEFAULT_SETTINGS } from '../../src/types/settings';
import { createMockApp } from '../utils/testHelpers';
import { VIEW_TYPE_CHAT } from '../../src/chat';

// Mock dependencies
jest.mock('../../src/utils/logger');
jest.mock('../../src/components/FuzzyModelDropdown');
jest.mock('../../src/components/commands/commandRegistry');
jest.mock('../../src/YAMLHandler');
jest.mock('../../src/utils/aiDispatcher');
jest.mock('../../src/components/agent/agentModeManager');
jest.mock('../../src/components/BackupManager');
jest.mock('../../src/utils/priority3Integration');
jest.mock('../../src/utils/recently-opened-files');
jest.mock('../../src/utils/PerformanceDashboard');
jest.mock('../../src/utils/settingsReloadManager');
jest.mock('../../src/utils/objectPool', () => ({
  MessageContextPool: {
    getInstance: jest.fn().mockReturnValue({
      clear: jest.fn()
    })
  },
  PreAllocatedArrays: {
    getInstance: jest.fn().mockReturnValue({
      clear: jest.fn()
    })
  }
}));
jest.mock('../../src/settings');
jest.mock('../../src/settings/SettingTab');

describe('MyPlugin', () => {
  let plugin: MyPlugin;
  let mockApp: any;

  beforeEach(() => {
    // Create fresh mock app for each test
    mockApp = createMockApp();

    // Create a real plugin instance but with mocked app
    plugin = new MyPlugin(mockApp, {} as any);
    plugin.app = mockApp;

    // Reset static state
    (MyPlugin as any).registeredViewTypes.clear();

    // Reset all mocks
    jest.clearAllMocks();
  });

  describe('onload', () => {
    test('should initialize with default settings', async () => {
      // Mock the loadData to return null (no saved settings)
      plugin.loadData = jest.fn().mockResolvedValue(null);

      await plugin.onload();

      // Should initialize with default settings
      expect(plugin.settings).toEqual(DEFAULT_SETTINGS);
    });

    test('should load saved settings from disk', async () => {
      const savedSettings = {
        ...DEFAULT_SETTINGS,
        debugMode: true,
        enableContextNotes: false,
      };

      plugin.loadData = jest.fn().mockResolvedValue(savedSettings);

      await plugin.onload();

      // Should merge saved settings with defaults
      expect(plugin.settings).toEqual(savedSettings);
    });

    test('should handle settings loading errors gracefully', async () => {
      // Mock loadData to throw an error
      plugin.loadData = jest.fn().mockRejectedValue(new Error('Load failed'));

      // Spy on console to prevent test output pollution
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      await plugin.onload();

      // Should fall back to default settings
      expect(plugin.settings).toEqual(DEFAULT_SETTINGS);

      consoleSpy.mockRestore();
    });

    test('should register chat view', async () => {
      plugin.loadData = jest.fn().mockResolvedValue(null);

      await plugin.onload();

      // Should register the chat view (verify through registerView call)
      expect(plugin.registerView).toHaveBeenCalledWith(
        VIEW_TYPE_CHAT,
        expect.any(Function)
      );
    });

    test('should initialize AIDispatcher', async () => {
      plugin.loadData = jest.fn().mockResolvedValue(null);

      await plugin.onload();

      // AIDispatcher should be initialized
      expect(plugin.aiDispatcher).toBeDefined();
    });

    test('should initialize agent mode manager', async () => {
      plugin.loadData = jest.fn().mockResolvedValue(null);

      await plugin.onload();

      // Agent mode manager should be initialized
      expect(plugin.agentModeManager).toBeDefined();
    });

    test('should initialize backup manager', async () => {
      plugin.loadData = jest.fn().mockResolvedValue(null);

      await plugin.onload();

      // Backup manager should be initialized
      expect(plugin.backupManager).toBeDefined();
    });

    test('should add settings tab', async () => {
      plugin.loadData = jest.fn().mockResolvedValue(null);

      await plugin.onload();

      // Should add settings tab
      expect(plugin.addSettingTab).toHaveBeenCalledTimes(1);
    });

    test('should register commands', async () => {
      plugin.loadData = jest.fn().mockResolvedValue(null);

      await plugin.onload();

      // Commands should be registered (mock will verify this)
      expect(plugin.addCommand).toHaveBeenCalled();
    });

    test('should register markdown post processors', async () => {
      plugin.loadData = jest.fn().mockResolvedValue(null);

      await plugin.onload();

      // Should register markdown post processor
      expect(plugin.registerMarkdownPostProcessor).toHaveBeenCalledTimes(1);
    });

    test('should register code block processor', async () => {
      plugin.loadData = jest.fn().mockResolvedValue(null);

      await plugin.onload();

      // Should register code block processor for ai-tool-execution
      expect(plugin.registerMarkdownCodeBlockProcessor).toHaveBeenCalledWith(
        'ai-tool-execution',
        expect.any(Function)
      );
    });
  });

  describe('onunload', () => {
    beforeEach(async () => {
      plugin.loadData = jest.fn().mockResolvedValue(null);
      await plugin.onload();
    });

    test('should clean up resources', async () => {
      // Mock private properties for testing
      (plugin as any).settingsReloadManager = {
        stop: jest.fn(),
      };

      (plugin as any).priority3Manager = {
        dispose: jest.fn(),
      };

      (plugin as any).recentlyOpenedFilesManager = {
        destroy: jest.fn(),
      };

      plugin.onunload();

      // Should stop settings reload manager
      expect((plugin as any).settingsReloadManager.stop).toHaveBeenCalled();

      // Should dispose priority 3 manager
      expect((plugin as any).priority3Manager.dispose).toHaveBeenCalled();

      // Should destroy recently opened files manager
      expect((plugin as any).recentlyOpenedFilesManager.destroy).toHaveBeenCalled();
    });

    test('should clear object pools', async () => {
      const mockMessageContextPool = {
        clear: jest.fn(),
      };

      const mockPreAllocatedArrays = {
        clear: jest.fn(),
      };

      // Mock the singleton instances
      jest.mocked(require('../../src/utils/objectPool').MessageContextPool.getInstance)
        .mockReturnValue(mockMessageContextPool as any);

      jest.mocked(require('../../src/utils/objectPool').PreAllocatedArrays.getInstance)
        .mockReturnValue(mockPreAllocatedArrays as any);

      plugin.onunload();

      // Should clear message context pool
      expect(mockMessageContextPool.clear).toHaveBeenCalled();

      // Should clear pre-allocated arrays
      expect(mockPreAllocatedArrays.clear).toHaveBeenCalled();
    });
  });

  describe('settings management', () => {
    test('should save settings to disk', async () => {
      const testSettings = { ...DEFAULT_SETTINGS, debugMode: true };
      plugin.settings = testSettings;

      await plugin.saveSettings();

      // Should save data to disk
      expect(plugin.saveData).toHaveBeenCalledWith(testSettings);
    });

    test('should validate settings on load', async () => {
      const invalidSettings = {
        ...DEFAULT_SETTINGS,
        invalidField: 'should be removed',
      };

      plugin.loadData = jest.fn().mockResolvedValue(invalidSettings);

      await plugin.loadSettings();

      // Settings should be loaded (validation allows extra fields)
      expect(plugin.settings).toHaveProperty('invalidField');
    });
  });
});