import { MyPluginSettings, AgentModeSettings } from '../../types';
import { debugLog } from '../../utils/logger'; // Import debugLog

/**
 * Manages the agent mode settings for the plugin.
 * Provides methods to get, check, and update agent mode configuration.
 */
export class AgentModeManager {
    /**
     * @param settings The plugin's settings object (mutable reference)
     * @param saveSettings Function to persist settings to disk
     * @param emitSettingsChange Function to notify listeners of settings changes
     * @param debugLog Logging function for debug/info/warn/error
     */
    constructor(
        private settings: MyPluginSettings,
        private saveSettings: () => Promise<void>,
        private emitSettingsChange: () => void,
        private debugLog: (level: 'debug' | 'info' | 'warn' | 'error', ...args: any[]) => void
    ) {}

    /**
     * Returns the current agent mode settings, or defaults if not set.
     * @returns AgentModeSettings object
     */
    getAgentModeSettings(): AgentModeSettings {
        return this.settings.agentMode || {
            enabled: false,
            maxToolCalls: 5,
            timeoutMs: 30000,
            maxIterations: 10
        };
    }

    /**
     * Checks if agent mode is enabled.
     * @returns True if agent mode is enabled, false otherwise.
     */
    isAgentModeEnabled(): boolean {
        return this.getAgentModeSettings().enabled;
    }

    /**
     * Enables or disables agent mode, persists the change, and emits a settings change event.
     * Initializes agentMode settings if not present.
     * @param enabled True to enable agent mode, false to disable.
     */
    async setAgentModeEnabled(enabled: boolean) {
        debugLog(this.settings.debugMode ?? false, 'info', '[AgentModeManager] Initializing');
        if (!this.settings.agentMode) {
            this.settings.agentMode = {
                enabled: false,
                maxToolCalls: 5,
                timeoutMs: 30000,
                maxIterations: 10
            };
            debugLog(this.settings.debugMode ?? false, 'debug', '[AgentModeManager] Initialized agentMode settings');
        }
        this.settings.agentMode.enabled = enabled;
        await this.saveSettings();
        this.emitSettingsChange();
        debugLog(this.settings.debugMode ?? false, 'info', '[AgentModeManager] Agent mode enabled state set', { enabled });
    }
}
