/**
 * @file AgentModeManager.test.ts
 * @description Unit tests for AgentModeManager covering settings management and agent mode state
 */

import { AgentModeManager } from '../../src/components/agent/agentModeManager';
import { MyPluginSettings, DEFAULT_SETTINGS } from '../../src/types/settings';

// Mock debugLog before importing AgentModeManager
jest.mock('../../src/utils/logger', () => ({
    debugLog: jest.fn()
}));

describe('AgentModeManager', () => {
    let mockSettings: MyPluginSettings;
    let mockSaveSettings: jest.MockedFunction<() => Promise<void>>;
    let mockEmitSettingsChange: jest.MockedFunction<() => void>;
    let mockDebugLog: jest.MockedFunction<any>;
    let agentModeManager: AgentModeManager;

    beforeEach(() => {
        mockSettings = { ...DEFAULT_SETTINGS };
        mockSaveSettings = jest.fn().mockResolvedValue(undefined);
        mockEmitSettingsChange = jest.fn();
        mockDebugLog = require('../../src/utils/logger').debugLog;

        agentModeManager = new AgentModeManager(
            mockSettings,
            mockSaveSettings,
            mockEmitSettingsChange,
            jest.fn()
        );
    });

    describe('constructor', () => {
        test('should initialize with provided settings and callbacks', () => {
            expect(agentModeManager).toBeDefined();
        });
    });

    describe('getAgentModeSettings', () => {
        test('should return default settings when agentMode is not set', () => {
            delete mockSettings.agentMode;

            const settings = agentModeManager.getAgentModeSettings();

            expect(settings).toEqual({
                enabled: false,
                maxToolCalls: 5,
                timeoutMs: 30000,
                maxIterations: 10
            });
        });

        test('should return existing agentMode settings', () => {
            mockSettings.agentMode = {
                enabled: true,
                maxToolCalls: 10,
                timeoutMs: 60000,
                maxIterations: 20
            };

            const settings = agentModeManager.getAgentModeSettings();

            expect(settings).toEqual({
                enabled: true,
                maxToolCalls: 10,
                timeoutMs: 60000,
                maxIterations: 20
            });
        });
    });

    describe('isAgentModeEnabled', () => {
        test('should return false when agentMode is not set', () => {
            delete mockSettings.agentMode;

            const isEnabled = agentModeManager.isAgentModeEnabled();

            expect(isEnabled).toBe(false);
        });

        test('should return false when agentMode is disabled', () => {
            mockSettings.agentMode = {
                enabled: false,
                maxToolCalls: 5,
                timeoutMs: 30000,
                maxIterations: 10
            };

            const isEnabled = agentModeManager.isAgentModeEnabled();

            expect(isEnabled).toBe(false);
        });

        test('should return true when agentMode is enabled', () => {
            mockSettings.agentMode = {
                enabled: true,
                maxToolCalls: 5,
                timeoutMs: 30000,
                maxIterations: 10
            };

            const isEnabled = agentModeManager.isAgentModeEnabled();

            expect(isEnabled).toBe(true);
        });
    });

    describe('setAgentModeEnabled', () => {
        test('should initialize agentMode settings if not present and enable agent mode', async () => {
            delete mockSettings.agentMode;

            await agentModeManager.setAgentModeEnabled(true);

            expect(mockSettings.agentMode).toEqual({
                enabled: true,
                maxToolCalls: 5,
                timeoutMs: 30000,
                maxIterations: 10
            });
            expect(mockSaveSettings).toHaveBeenCalledTimes(1);
            expect(mockEmitSettingsChange).toHaveBeenCalledTimes(1);
            expect(mockDebugLog).toHaveBeenCalledWith(false, 'info', '[AgentModeManager] Initializing');
            expect(mockDebugLog).toHaveBeenCalledWith(false, 'debug', '[AgentModeManager] Initialized agentMode settings');
            expect(mockDebugLog).toHaveBeenCalledWith(false, 'info', '[AgentModeManager] Agent mode enabled state set', { enabled: true });
        });

        test('should enable agent mode when settings exist', async () => {
            mockSettings.agentMode = {
                enabled: false,
                maxToolCalls: 5,
                timeoutMs: 30000,
                maxIterations: 10
            };

            await agentModeManager.setAgentModeEnabled(true);

            expect(mockSettings.agentMode!.enabled).toBe(true);
            expect(mockSaveSettings).toHaveBeenCalledTimes(1);
            expect(mockEmitSettingsChange).toHaveBeenCalledTimes(1);
            expect(mockDebugLog).toHaveBeenCalledWith(false, 'info', '[AgentModeManager] Agent mode enabled state set', { enabled: true });
        });

        test('should disable agent mode', async () => {
            mockSettings.agentMode = {
                enabled: true,
                maxToolCalls: 5,
                timeoutMs: 30000,
                maxIterations: 10
            };

            await agentModeManager.setAgentModeEnabled(false);

            expect(mockSettings.agentMode!.enabled).toBe(false);
            expect(mockSaveSettings).toHaveBeenCalledTimes(1);
            expect(mockEmitSettingsChange).toHaveBeenCalledTimes(1);
            expect(mockDebugLog).toHaveBeenCalledWith(false, 'info', '[AgentModeManager] Agent mode enabled state set', { enabled: false });
        });

        test('should handle debug mode logging', async () => {
            mockSettings.debugMode = true;
            delete mockSettings.agentMode;

            await agentModeManager.setAgentModeEnabled(true);

            expect(mockDebugLog).toHaveBeenCalledWith(true, 'info', '[AgentModeManager] Initializing');
            expect(mockDebugLog).toHaveBeenCalledWith(true, 'debug', '[AgentModeManager] Initialized agentMode settings');
            expect(mockDebugLog).toHaveBeenCalledWith(true, 'info', '[AgentModeManager] Agent mode enabled state set', { enabled: true });
        });

        test('should handle saveSettings rejection', async () => {
            const error = new Error('Save failed');
            mockSaveSettings.mockRejectedValue(error);

            await expect(agentModeManager.setAgentModeEnabled(true)).rejects.toThrow('Save failed');

            expect(mockEmitSettingsChange).not.toHaveBeenCalled();
        });
    });
});