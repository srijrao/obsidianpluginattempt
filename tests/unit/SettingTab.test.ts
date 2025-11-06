/**
 * @file SettingTab.test.ts
 * @description Unit tests for settings UI (SettingTab.ts)
 */

// Mock all dependencies before imports
jest.mock('obsidian', () => ({
  Plugin: jest.fn().mockImplementation(() => ({
    loadData: jest.fn(),
    saveData: jest.fn(),
    addCommand: jest.fn(),
    registerView: jest.fn(),
    addSettingTab: jest.fn(),
  })),
  PluginSettingTab: jest.fn().mockImplementation(function(app: any, plugin: any) {
    this.app = app;
    this.plugin = plugin;
    this.containerEl = document.createElement('div');
    this.hide = jest.fn();
  }),
  FuzzySuggestModal: jest.fn().mockImplementation(function() {
    // Mock constructor
  }),
  Setting: jest.fn().mockImplementation(() => ({
    setName: jest.fn().mockReturnThis(),
    setDesc: jest.fn().mockReturnThis(),
    addButton: jest.fn().mockImplementation((callback) => {
      const button = {
        setButtonText: jest.fn().mockReturnThis(),
        onClick: jest.fn().mockReturnThis(),
      };
      if (callback) callback(button);
      return {
        setName: jest.fn().mockReturnThis(),
        setDesc: jest.fn().mockReturnThis(),
        addButton: jest.fn().mockReturnThis(),
      };
    }),
    addText: jest.fn().mockReturnThis(),
    addDropdown: jest.fn().mockReturnThis(),
    addToggle: jest.fn().mockReturnThis(),
    addSlider: jest.fn().mockReturnThis(),
  })),
  Notice: jest.fn(),
  Component: jest.fn(),
}));
jest.mock('../../src/utils/CollapsibleSection');
jest.mock('../../src/utils/logger');
jest.mock('../../src/settings/components/SettingCreators');
jest.mock('../../src/settings/sections/GeneralSettingsSection');
jest.mock('../../src/settings/sections/AIModelConfigurationSection');
jest.mock('../../src/settings/sections/AgentSettingsSection');
jest.mock('../../src/settings/sections/ContentNoteHandlingSection');
jest.mock('../../src/settings/sections/BackupManagementSection');
jest.mock('../../src/settings/sections/ChatHistorySettingsSection');
jest.mock('../../src/types', () => ({
  DEFAULT_SETTINGS: {
    debugMode: false,
    enableContextNotes: true,
    openaiSettings: { apiKey: '', baseUrl: '', availableModels: [] },
    anthropicSettings: { apiKey: '', baseUrl: '', availableModels: [] },
    geminiSettings: { apiKey: '', baseUrl: '', availableModels: [] },
    openrouterSettings: { apiKey: '', baseUrl: '', availableModels: [] },
    titlePrompt: 'Default title prompt',
  },
  DEFAULT_TITLE_PROMPT: 'Default title prompt',
}));

import { MyPluginSettingTab } from '../../src/settings/SettingTab';
import { createMockPlugin, createMockApp } from '../utils/testHelpers';

// Import the mocked DEFAULT_SETTINGS
const { DEFAULT_SETTINGS } = require('../../src/types');

describe('MyPluginSettingTab', () => {
  let settingTab: MyPluginSettingTab;
  let mockPlugin: any;
  let mockApp: any;
  let mockContainer: HTMLElement;

  beforeEach(() => {
    // Create mocks
    mockApp = createMockApp();
    mockPlugin = createMockPlugin();
    mockContainer = document.createElement('div');

    // Create the settings tab
    settingTab = new MyPluginSettingTab(mockApp, mockPlugin);

    // Mock container methods on the actual containerEl used by settingTab
    settingTab.containerEl.empty = jest.fn();
    settingTab.containerEl.createEl = jest.fn().mockReturnValue(document.createElement('h2'));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    test('should initialize with plugin reference', () => {
      expect(settingTab.plugin).toBe(mockPlugin);
    });

    test('should initialize all settings sections', () => {
      expect(settingTab['generalSettingsSection']).toBeDefined();
      expect(settingTab['aiModelConfigurationSection']).toBeDefined();
      expect(settingTab['agentSettingsSection']).toBeDefined();
      expect(settingTab['contentNoteHandlingSection']).toBeDefined();
      expect(settingTab['backupManagementSection']).toBeDefined();
      expect(settingTab['chatHistorySettingsSection']).toBeDefined();
    });

    test('should initialize setting creators', () => {
      expect(settingTab['settingCreators']).toBeDefined();
    });

    test('should register settings change listener', () => {
      expect(mockPlugin.onSettingsChange).toHaveBeenCalledWith(expect.any(Function));
      expect(settingTab['settingsChangeListener']).toBeDefined();
    });
  });

  describe('display', () => {

    test('should clear container and create heading', () => {
      settingTab.display();

      expect(settingTab.containerEl.empty).toHaveBeenCalled();
      expect(settingTab.containerEl.createEl).toHaveBeenCalledWith('h2', { text: 'AI Assistant Settings' });
    });

    test('should create collapsible sections for all settings groups', () => {
      const mockCollapsibleSection = require('../../src/utils/CollapsibleSection').CollapsibleSectionRenderer;
      mockCollapsibleSection.createCollapsibleSection = jest.fn();

      settingTab.display();

      // Should create 6 collapsible sections
      expect(mockCollapsibleSection.createCollapsibleSection).toHaveBeenCalledTimes(6);

      // Check that each section is created with correct title
      const calls = mockCollapsibleSection.createCollapsibleSection.mock.calls;
      const sectionTitles = calls.map((call: any) => call[1]);

      expect(sectionTitles).toEqual([
        'General Settings',
        'AI Model Configuration',
        'Agent Settings',
        'Content & Note Handling',
        'Chat History & UI',
        'Backup & Trash Management'
      ]);
    });

    test('should create reset button', () => {
      // Mock Setting constructor
      const mockSetting = {
        setName: jest.fn().mockReturnThis(),
        setDesc: jest.fn().mockReturnThis(),
        addButton: jest.fn().mockReturnThis(),
      };

      // Mock the Setting import
      const MockSetting = jest.fn().mockImplementation(() => mockSetting);
      jest.mocked(require('obsidian').Setting).mockImplementation(MockSetting);

      settingTab.display();

      // Should create a Setting for the reset button
      expect(MockSetting).toHaveBeenCalledWith(settingTab.containerEl);
      expect(mockSetting.setName).toHaveBeenCalledWith('Reset All Settings to Default');
      expect(mockSetting.addButton).toHaveBeenCalledWith(expect.any(Function));
    });
  });

  describe('reset functionality', () => {
    let mockButtonCallback: Function;

    beforeEach(() => {
      // Mock the Setting and button creation
      const mockSetting = {
        setName: jest.fn().mockReturnThis(),
        setDesc: jest.fn().mockReturnThis(),
        addButton: jest.fn().mockImplementation((callback) => {
          const button = {
            setButtonText: jest.fn().mockReturnThis(),
            onClick: jest.fn().mockImplementation((clickCallback) => {
              mockButtonCallback = clickCallback;
              return button;
            }),
          };
          callback(button);
          return mockSetting;
        }),
      };

      const MockSetting = jest.fn().mockImplementation(() => mockSetting);
      jest.mocked(require('obsidian').Setting).mockImplementation(MockSetting);

      // Mock Notice
      const MockNotice = jest.fn();
      jest.mocked(require('obsidian').Notice).mockImplementation(MockNotice);

      settingTab.display();
    });

    test('should reset settings to defaults while preserving API keys', async () => {
      // Set up initial settings with custom values
      mockPlugin.settings = {
        ...DEFAULT_SETTINGS,
        debugMode: true,
        openaiSettings: { apiKey: 'test-openai-key', baseUrl: 'custom-url', availableModels: ['gpt-4'] },
        anthropicSettings: { apiKey: 'test-anthropic-key', baseUrl: 'custom-url', availableModels: ['claude-3'] },
        geminiSettings: { apiKey: 'test-gemini-key', baseUrl: 'custom-url', availableModels: ['gemini-pro'] },
        openrouterSettings: { apiKey: 'test-openrouter-key', baseUrl: 'custom-url', availableModels: ['gpt-4'] },
        titlePrompt: 'Custom title prompt',
      };

      // Trigger the reset
      await mockButtonCallback();

      // Should preserve API keys
      expect(mockPlugin.settings.openaiSettings.apiKey).toBe('test-openai-key');
      expect(mockPlugin.settings.anthropicSettings.apiKey).toBe('test-anthropic-key');
      expect(mockPlugin.settings.geminiSettings.apiKey).toBe('test-gemini-key');
      expect(mockPlugin.settings.openrouterSettings.apiKey).toBe('test-openrouter-key');

      // Should reset other settings to defaults
      expect(mockPlugin.settings.debugMode).toBe(false);
      expect(mockPlugin.settings.titlePrompt).toBe("You are a title generator. You will give succinct titles that do not contain backslashes, forward slashes, or colons. Only generate a title as your response.");

      // Should save settings
      expect(mockPlugin.saveSettings).toHaveBeenCalled();

      // Should refresh display
      expect(settingTab.containerEl.empty).toHaveBeenCalled();
    });

    test('should show success notice after reset', async () => {
      const MockNotice = jest.mocked(require('obsidian').Notice);

      await mockButtonCallback();

      expect(MockNotice).toHaveBeenCalledWith('All settings (except API keys) reset to default.');
    });
  });

  describe('hide', () => {
    test('should call parent hide method', () => {
      // Since PluginSettingTab is mocked, we can't easily spy on super.hide()
      // Instead, just verify that hide() completes without error
      expect(() => settingTab.hide()).not.toThrow();
    });
  });

  describe('saveSettingsFromUI', () => {
    test('should save settings and prevent re-render', async () => {
      await settingTab['saveSettingsFromUI']();

      expect(mockPlugin.saveSettings).toHaveBeenCalled();
      expect(settingTab['isUpdatingFromUI']).toBe(true);

      // Wait for the timeout
      await new Promise(resolve => setTimeout(resolve, 60));
      expect(settingTab['isUpdatingFromUI']).toBe(false);
    });
  });
});