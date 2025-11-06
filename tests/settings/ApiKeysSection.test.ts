/**
 * @file ApiKeysSection.test.ts
 * @description Tests for the API Keys settings section
 */

import { ApiKeysSection } from '../../src/settings/sections/ApiKeysSection';
import { SettingCreators } from '../../src/settings/components/SettingCreators';
import MyPlugin from '../../src/main';
import { createMockApp, createMockPlugin } from '../utils/testUtils';
import { DEFAULT_SETTINGS } from '../../src/types';

describe('ApiKeysSection', () => {
  let mockApp: any;
  let mockPlugin: MyPlugin;
  let settingCreators: SettingCreators;
  let apiKeysSection: ApiKeysSection;
  let containerEl: HTMLElement;

  beforeEach(() => {
    mockApp = createMockApp();
    mockPlugin = createMockPlugin(mockApp);
    mockPlugin.settings = { ...DEFAULT_SETTINGS };
    settingCreators = new SettingCreators(mockPlugin, () => {});
    apiKeysSection = new ApiKeysSection(mockPlugin, settingCreators);
    containerEl = document.createElement('div');
  });

  afterEach(() => {
    jest.clearAllMocks();
    containerEl.innerHTML = '';
  });

  describe('Construction', () => {
    test('should create ApiKeysSection instance', () => {
      expect(apiKeysSection).toBeDefined();
    });

    test('should store plugin reference', () => {
      expect((apiKeysSection as any).plugin).toBe(mockPlugin);
    });

    test('should store settingCreators reference', () => {
      expect((apiKeysSection as any).settingCreators).toBe(settingCreators);
    });
  });

  describe('Render Method', () => {
    test('should render without throwing', async () => {
      await expect(apiKeysSection.render(containerEl)).resolves.not.toThrow();
    });

    test('should create collapsible section', async () => {
      await apiKeysSection.render(containerEl);

      // Check for collapsible section structure (custom implementation)
      const header = containerEl.querySelector('.ai-collapsible-header');
      expect(header).toBeTruthy();
      const titleSpan = header?.querySelector('span:nth-child(2)');
      expect(titleSpan?.textContent).toContain('API Keys & Providers');
    });

    test('should render all API key input fields', async () => {
      await apiKeysSection.render(containerEl);

      // Check for input fields (this depends on the actual implementation)
      const inputs = containerEl.querySelectorAll('input[type="text"]');
      expect(inputs.length).toBeGreaterThan(0);
    });
  });

  describe('Settings Integration', () => {
    test('should access OpenAI settings', () => {
      expect(mockPlugin.settings.openaiSettings).toBeDefined();
      expect(mockPlugin.settings.openaiSettings.apiKey).toBeDefined();
    });

    test('should access Anthropic settings', () => {
      expect(mockPlugin.settings.anthropicSettings).toBeDefined();
      expect(mockPlugin.settings.anthropicSettings.apiKey).toBeDefined();
    });

    test('should access Gemini settings', () => {
      expect(mockPlugin.settings.geminiSettings).toBeDefined();
      expect(mockPlugin.settings.geminiSettings.apiKey).toBeDefined();
    });

    test('should access Ollama settings', () => {
      expect(mockPlugin.settings.ollamaSettings).toBeDefined();
      expect(mockPlugin.settings.ollamaSettings.serverUrl).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    test('should handle render with invalid container', async () => {
      const invalidContainer = null as any;

      // Should throw or handle gracefully
      await expect(apiKeysSection.render(invalidContainer)).rejects.toThrow();
    });

    test('should handle plugin with missing settings', async () => {
      const brokenPlugin = createMockPlugin(mockApp);
      delete (brokenPlugin as any).settings;

      const brokenSection = new ApiKeysSection(brokenPlugin, settingCreators);

      // Should handle gracefully or throw meaningful error
      await expect(brokenSection.render(containerEl)).rejects.toThrow();
    });
  });
});