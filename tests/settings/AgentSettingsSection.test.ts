/**
 * @file AgentSettingsSection.test.ts
 * @description Tests for the Agent Settings section
 */

import { AgentSettingsSection } from '../../src/settings/sections/AgentSettingsSection';
import { SettingCreators } from '../../src/settings/components/SettingCreators';
import MyPlugin from '../../src/main';
import { createMockApp, createMockPlugin } from '../utils/testUtils';
import { DEFAULT_SETTINGS } from '../../src/types';

describe('AgentSettingsSection', () => {
  let mockApp: any;
  let mockPlugin: MyPlugin;
  let settingCreators: SettingCreators;
  let agentSettingsSection: AgentSettingsSection;
  let containerEl: HTMLElement;

  beforeEach(() => {
    mockApp = createMockApp();
    mockPlugin = createMockPlugin(mockApp);
    mockPlugin.settings = { ...DEFAULT_SETTINGS };
    settingCreators = new SettingCreators(mockPlugin, () => {});
    agentSettingsSection = new AgentSettingsSection(mockApp, mockPlugin, settingCreators);
    containerEl = document.createElement('div');
  });

  afterEach(() => {
    jest.clearAllMocks();
    containerEl.innerHTML = '';
  });

  describe('Construction', () => {
    test('should create AgentSettingsSection instance', () => {
      expect(agentSettingsSection).toBeDefined();
    });

    test('should store app reference', () => {
      expect((agentSettingsSection as any).app).toBe(mockApp);
    });

    test('should store plugin reference', () => {
      expect((agentSettingsSection as any).plugin).toBe(mockPlugin);
    });

    test('should store settingCreators reference', () => {
      expect((agentSettingsSection as any).settingCreators).toBe(settingCreators);
    });
  });

  describe('Render Method', () => {
    test('should render without throwing', async () => {
      await expect(agentSettingsSection.render(containerEl)).resolves.not.toThrow();
    });

    test('should create collapsible section', async () => {
      await agentSettingsSection.render(containerEl);

      const header = containerEl.querySelector('.ai-collapsible-header');
      expect(header).toBeTruthy();
      const titleSpan = header?.querySelector('span:nth-child(2)');
      expect(titleSpan?.textContent).toContain('Agent Mode Settings');
    });

    test('should render agent mode toggle', async () => {
      await agentSettingsSection.render(containerEl);

      // Check for toggle input
      const toggles = containerEl.querySelectorAll('input[type="checkbox"]');
      expect(toggles.length).toBeGreaterThan(0);
    });

    test('should render tool execution limits', async () => {
      await agentSettingsSection.render(containerEl);

      // Check for number inputs or dropdowns for limits
      const numberInputs = containerEl.querySelectorAll('input[type="number"]');
      const selects = containerEl.querySelectorAll('select');
      expect(numberInputs.length + selects.length).toBeGreaterThan(0);
    });
  });

  describe('Settings Integration', () => {
    test('should access agent settings', () => {
      expect(mockPlugin.settings.agentMode).toBeDefined();
      expect(typeof mockPlugin.settings.agentMode?.enabled).toBe('boolean');
    });

    test('should access tool execution limits', () => {
      expect(mockPlugin.settings.agentMode?.maxToolCalls).toBeDefined();
      expect(mockPlugin.settings.agentMode?.timeoutMs).toBeDefined();
      expect(mockPlugin.settings.agentMode?.maxIterations).toBeDefined();
    });
  });

  describe('Tool Management', () => {
    test('should render tool enable/disable toggles', async () => {
      await agentSettingsSection.render(containerEl);

      // Should have multiple toggles for different tools
      const toggles = containerEl.querySelectorAll('input[type="checkbox"]');
      expect(toggles.length).toBeGreaterThan(1);
    });

    test('should handle tool settings access', () => {
      // Test that tool settings are accessible
      expect(mockPlugin.settings.agentMode).toBeDefined();
      // Tool settings might be nested or in a separate structure
    });
  });

  describe('Error Handling', () => {
    test('should handle render with invalid container', async () => {
      const invalidContainer = null as any;
      await expect(agentSettingsSection.render(invalidContainer)).rejects.toThrow();
    });

    test('should handle plugin with missing agent settings', async () => {
      const brokenPlugin = createMockPlugin(mockApp);
      brokenPlugin.settings = { ...DEFAULT_SETTINGS };
      delete (brokenPlugin.settings as any).agentMode;

      const brokenSection = new AgentSettingsSection(mockApp, brokenPlugin, settingCreators);

      // Should handle gracefully
      await expect(brokenSection.render(containerEl)).rejects.toThrow();
    });
  });
});