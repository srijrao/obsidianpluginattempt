import { MyPluginSettings, AgentModeSettings } from '../../../types';

export class AgentModeManager {
    constructor(
        private settings: MyPluginSettings,
        private saveSettings: () => Promise<void>,
        private emitSettingsChange: () => void,
        private debugLog: (level: 'debug' | 'info' | 'warn' | 'error', ...args: any[]) => void
    ) {}

    getAgentModeSettings(): AgentModeSettings {
        return this.settings.agentMode || {
            enabled: false,
            maxToolCalls: 5,
            timeoutMs: 30000,
            maxIterations: 10
        };
    }

    isAgentModeEnabled(): boolean {
        return this.getAgentModeSettings().enabled;
    }

    // Debug: Log when agent mode is toggled
    async setAgentModeEnabled(enabled: boolean) {
        this.debugLog('info', '[agentModeManager.ts] setAgentModeEnabled called', { enabled });
        if (!this.settings.agentMode) {
            this.settings.agentMode = {
                enabled: false,
                maxToolCalls: 5,
                timeoutMs: 30000,
                maxIterations: 10
            };
            this.debugLog('debug', '[agentModeManager.ts] Initialized agentMode settings');
        }
        this.settings.agentMode.enabled = enabled;
        await this.saveSettings();
        this.emitSettingsChange();
        this.debugLog('info', '[agentModeManager.ts] Agent mode enabled state set', { enabled });
    }
}
