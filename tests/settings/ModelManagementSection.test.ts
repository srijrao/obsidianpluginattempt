/**
 * @file ModelManagementSection.test.ts
 * @description Tests for the Model Management settings section
 */

import { ModelManagementSection } from '../../src/settings/sections/ModelManagementSection';
import { SettingCreators } from '../../src/settings/components/SettingCreators';
import MyPlugin from '../../src/main';
import { createMockApp, createMockPlugin } from '../utils/testUtils';
import { DEFAULT_SETTINGS } from '../../src/types';

describe('ModelManagementSection', () => {
  let mockApp: any;
  let mockPlugin: MyPlugin;
  let settingCreators: SettingCreators;
  let modelManagementSection: ModelManagementSection;
  let containerEl: HTMLElement;

  beforeEach(() => {
    mockApp = createMockApp();
    mockPlugin = createMockPlugin(mockApp);
    mockPlugin.settings = { ...DEFAULT_SETTINGS };
    settingCreators = new SettingCreators(mockPlugin, () => {});
    modelManagementSection = new ModelManagementSection(mockPlugin, settingCreators);
    containerEl = document.createElement('div');
  });

  afterEach(() => {
    jest.clearAllMocks();
    containerEl.innerHTML = '';
  });

  describe('Construction', () => {
    test('should create ModelManagementSection instance', () => {
      expect(modelManagementSection).toBeDefined();
    });

    test('should store plugin reference', () => {
      expect((modelManagementSection as any).plugin).toBe(mockPlugin);
    });

    test('should store settingCreators reference', () => {
      expect((modelManagementSection as any).settingCreators).toBe(settingCreators);
    });
  });

  describe('Render Method', () => {
    test('should render without throwing', async () => {
      await expect(modelManagementSection.render(containerEl)).resolves.not.toThrow();
    });

    test('should create collapsible section', async () => {
      await modelManagementSection.render(containerEl);

      const header = containerEl.querySelector('.ai-collapsible-header');
      expect(header).toBeTruthy();
      const titleSpan = header?.querySelector('span:nth-child(2)');
      expect(titleSpan?.textContent).toContain('Model Setting Presets');
    });

    test('should render preset management UI', async () => {
      await modelManagementSection.render(containerEl);

      // Check for buttons or controls for preset management
      const buttons = containerEl.querySelectorAll('button');
      expect(buttons.length).toBeGreaterThan(0);
    });
  });

  describe('Settings Integration', () => {
    test('should access model setting presets', () => {
      expect(mockPlugin.settings.modelSettingPresets).toBeDefined();
      expect(Array.isArray(mockPlugin.settings.modelSettingPresets)).toBe(true);
    });

    test('should handle preset operations', () => {
      // Test that presets can be accessed and modified
      const presets = mockPlugin.settings.modelSettingPresets;
      expect(presets).toBeDefined();
    });
  });

  describe('Preset Management', () => {
    test('should render preset list', async () => {
      // Add a test preset
      mockPlugin.settings.modelSettingPresets = [{
        name: 'Test Preset',
        selectedModel: 'openai:gpt-3.5-turbo',
        temperature: 0.7,
        systemMessage: 'Test system message'
      }];

      await modelManagementSection.render(containerEl);

      // Should render the preset
      const presetElements = containerEl.querySelectorAll('[data-preset-id]');
      expect(presetElements.length).toBeGreaterThan(0);
    });

    test('should handle empty presets list', async () => {
      mockPlugin.settings.modelSettingPresets = [];

      await modelManagementSection.render(containerEl);

      // Should still render without errors
      expect(containerEl.children.length).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    test('should handle render with invalid container', async () => {
      const invalidContainer = null as any;
      await expect(modelManagementSection.render(invalidContainer)).rejects.toThrow();
    });

    test('should handle plugin with missing preset settings', async () => {
      const brokenPlugin = createMockPlugin(mockApp);
      brokenPlugin.settings = { ...DEFAULT_SETTINGS };
      delete (brokenPlugin.settings as any).modelSettingPresets;

      const brokenSection = new ModelManagementSection(brokenPlugin, settingCreators);

      // Should handle gracefully
      await expect(brokenSection.render(containerEl)).rejects.toThrow();
    });
  });
});