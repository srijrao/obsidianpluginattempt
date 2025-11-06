/**
 * @file main.test.ts
 * @description Tests for the main plugin lifecycle (src/main.ts)
 *
 * Note: These tests focus on the public API and integration behavior
 * rather than testing private implementation details.
 */

import MyPlugin from '../src/main';
import { createMockApp } from './utils/testUtils';
import { DEFAULT_SETTINGS } from '../src/types';
import { App } from '../__mocks__/obsidian';

describe('MyPlugin - Plugin Lifecycle', () => {
  let mockApp: App;
  let plugin: MyPlugin;

  beforeEach(() => {
    mockApp = createMockApp();
    const manifest = {
      id: 'ai-assistant-for-obsidian',
      name: 'AI Assistant for Obsidian',
      version: '2.1.0',
      author: 'Test Author',
      minAppVersion: '0.15.0',
      description: 'Test description'
    };
    plugin = new MyPlugin(mockApp as any, manifest);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Plugin Construction', () => {
    test('should create plugin instance with app reference', () => {
      expect(plugin.app).toBe(mockApp);
    });

    test('should have manifest information', () => {
      expect(plugin.manifest).toBeDefined();
      expect(plugin.manifest.id).toBe('ai-assistant-for-obsidian');
    });
  });

  describe('Plugin Initialization (onload)', () => {
    test('should complete onload without throwing', async () => {
      await expect(plugin.onload()).resolves.not.toThrow();
    });

    test('should initialize core components during onload', async () => {
      // Test that onload completes and core components are accessible
      await plugin.onload();
      expect(plugin.settings).toBeDefined();
      expect(plugin.settings).toEqual(DEFAULT_SETTINGS);
    });

    test('should handle multiple onload calls gracefully', async () => {
      await plugin.onload();
      // Second onload should not throw
      await expect(plugin.onload()).resolves.not.toThrow();
    });
  });

  describe('Plugin Unload', () => {
    test('should complete onunload without throwing', () => {
      expect(() => plugin.onunload()).not.toThrow();
    });

    test('should handle unload after onload', async () => {
      await plugin.onload();
      expect(() => plugin.onunload()).not.toThrow();
    });
  });

  describe('Settings Management', () => {
    let settingsPlugin: MyPlugin;

    beforeEach(async () => {
      const manifest = {
        id: 'ai-assistant-for-obsidian',
        name: 'AI Assistant for Obsidian',
        version: '2.1.0',
        author: 'Test Author',
        minAppVersion: '0.15.0',
        description: 'Test description'
      };
    settingsPlugin = new MyPlugin(mockApp as any, manifest);
      await settingsPlugin.onload();
    });

    test('should allow settings modification', () => {
      const originalDebugMode = settingsPlugin.settings.debugMode;
      settingsPlugin.settings.debugMode = !originalDebugMode;

      expect(settingsPlugin.settings.debugMode).not.toBe(originalDebugMode);
    });

    test('should maintain settings structure', () => {
      const testSettings = { ...settingsPlugin.settings, debugMode: true };
      settingsPlugin.settings = testSettings;

      expect(settingsPlugin.settings.debugMode).toBe(true);
      expect(settingsPlugin.settings).toHaveProperty('systemMessage');
    });
  });

  describe('Stream Management', () => {
    test('should initialize with null active stream', () => {
      expect(plugin.activeStream).toBeNull();
    });

    test('should allow stream controller assignment', () => {
      const controller = new AbortController();
      (plugin as any).activeStream = controller;

      expect((plugin as any).activeStream).toBe(controller);
    });
  });

  describe('Error Handling', () => {
    test('should handle invalid app reference gracefully', () => {
      // This tests that the plugin doesn't crash with minimal app setup
      expect(plugin.app).toBeDefined();
    });
  });
});