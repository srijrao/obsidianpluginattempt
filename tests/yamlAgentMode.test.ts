import { buildChatYaml, loadChatYamlAndApplySettings } from '../src/components/chat/chatPersistence';
import { MyPluginSettings, DEFAULT_SETTINGS } from '../src/types/settings';
import { AGENT_SYSTEM_PROMPT } from '../src/promptConstants';

describe('YAML Agent Mode Export/Import', () => {
    let mockApp: any;
    let mockPlugin: any;
    let settings: MyPluginSettings;

    beforeEach(() => {
        mockApp = {
            vault: {
                read: jest.fn(),
                create: jest.fn(),
                getAbstractFileByPath: jest.fn(),
                createFolder: jest.fn()
            },
            fileManager: {
                renameFile: jest.fn()
            }
        };

        mockPlugin = {
            agentModeManager: {
                setAgentModeEnabled: jest.fn()
            },
            onSettingsLoadedFromNote: jest.fn()
        };

        // Deep clone DEFAULT_SETTINGS to avoid mutations
        settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
    });

    describe('buildChatYaml with agent mode', () => {
        it('should include agent mode keys when agent mode is enabled', async () => {
            settings.agentMode = { enabled: true, maxToolCalls: 10, timeoutMs: 30000, maxIterations: 10 };
            settings.customAgentSystemMessage = 'Custom agent prompt';

            const yaml = await buildChatYaml(settings, 'openai', 'gpt-4');

            expect(yaml).toContain('agent_mode_enabled: true');
            expect(yaml).toContain('agent_prompt: Custom agent prompt');
        });

        it('should use default agent prompt when custom prompt is not set', async () => {
            settings.agentMode = { enabled: true, maxToolCalls: 10, timeoutMs: 30000, maxIterations: 10 };
            settings.customAgentSystemMessage = undefined;

            const yaml = await buildChatYaml(settings, 'openai', 'gpt-4');

            expect(yaml).toContain('agent_mode_enabled: true');
            expect(yaml).toContain('agent_prompt:');
        });

        it('should not include agent mode keys when agent mode is disabled', async () => {
            settings.agentMode = { enabled: false, maxToolCalls: 10, timeoutMs: 30000, maxIterations: 10 };

            const yaml = await buildChatYaml(settings, 'openai', 'gpt-4');

            expect(yaml).not.toContain('agent_mode_enabled');
            expect(yaml).not.toContain('agent_prompt');
        });

        it('should not include agent mode keys when agent mode settings are undefined', async () => {
            settings.agentMode = undefined;

            const yaml = await buildChatYaml(settings, 'openai', 'gpt-4');

            expect(yaml).not.toContain('agent_mode_enabled');
            expect(yaml).not.toContain('agent_prompt');
        });

        it('should work with unified model format', async () => {
            settings.selectedModel = 'openai:gpt-4';
            settings.agentMode = { enabled: true, maxToolCalls: 10, timeoutMs: 30000, maxIterations: 10 };

            const yaml = await buildChatYaml(settings, '', '');

            expect(yaml).toContain('unified_model: openai:gpt-4');
            expect(yaml).toContain('agent_mode_enabled: true');
        });
    });

    describe('loadChatYamlAndApplySettings with agent mode', () => {
        it('should enable agent mode when agent_mode_enabled is true', async () => {
            const mockFile = {
                path: 'test-chat.md'
            };

            const yamlContent = `---
provider: openai
model: gpt-4
system_message: "Test system message"
temperature: 0.7
agent_mode_enabled: true
agent_prompt: "Test agent prompt"
---

Chat content here`;

            mockApp.vault.read.mockResolvedValue(yamlContent);

            const result = await loadChatYamlAndApplySettings({
                app: mockApp,
                plugin: mockPlugin,
                settings,
                file: mockFile
            });

            expect(settings.agentMode!.enabled).toBe(true);
        });

        it('should disable agent mode when agent_mode_enabled is false', async () => {
            // Ensure agent mode starts enabled
            settings.agentMode!.enabled = true;

            const mockFile = {
                path: 'test-chat.md'
            };

            const yamlContent = `---
provider: openai
model: gpt-4
system_message: "Test system message"
temperature: 0.7
agent_mode_enabled: false
---

Chat content here`;

            mockApp.vault.read.mockResolvedValue(yamlContent);

            const result = await loadChatYamlAndApplySettings({
                app: mockApp,
                plugin: mockPlugin,
                settings,
                file: mockFile
            });

            expect(settings.agentMode!.enabled).toBe(false);
            expect(mockPlugin.agentModeManager.setAgentModeEnabled).toHaveBeenCalledWith(false);
        });

        it('should disable agent mode when agent_mode_enabled key is missing', async () => {
            // Ensure agent mode starts enabled
            settings.agentMode!.enabled = true;

            const mockFile = {
                path: 'test-chat.md'
            };

            const yamlContent = `---
provider: openai
model: gpt-4
system_message: "Test system message"
temperature: 0.7
---

Chat content here`;

            mockApp.vault.read.mockResolvedValue(yamlContent);

            const result = await loadChatYamlAndApplySettings({
                app: mockApp,
                plugin: mockPlugin,
                settings,
                file: mockFile
            });

            expect(settings.agentMode!.enabled).toBe(false);
            expect(mockPlugin.agentModeManager.setAgentModeEnabled).toHaveBeenCalledWith(false);
        });

        it('should initialize agentMode settings if not present', async () => {
            settings.agentMode = undefined;

            const mockFile = {
                path: 'test-chat.md'
            };

            const yamlContent = `---
provider: openai
model: gpt-4
system_message: "Test system message"
temperature: 0.7
agent_mode_enabled: true
agent_prompt: "Test agent prompt"
---

Chat content here`;

            mockApp.vault.read.mockResolvedValue(yamlContent);

            const result = await loadChatYamlAndApplySettings({
                app: mockApp,
                plugin: mockPlugin,
                settings,
                file: mockFile
            });

            expect(settings.agentMode).toBeDefined();
            expect(settings.agentMode!.enabled).toBe(true);
            expect(settings.customAgentSystemMessage).toBe('Test agent prompt');
        });

        it('should handle invalid agent_prompt gracefully', async () => {
            const mockFile = {
                path: 'test-chat.md'
            };

            const yamlContent = `---
provider: openai
model: gpt-4
system_message: "Test system message"
temperature: 0.7
agent_mode_enabled: true
agent_prompt: 123
---

Chat content here`;

            mockApp.vault.read.mockResolvedValue(yamlContent);

            const result = await loadChatYamlAndApplySettings({
                app: mockApp,
                plugin: mockPlugin,
                settings,
                file: mockFile
            });

            expect(settings.agentMode!.enabled).toBe(true);
            // Should not set customAgentSystemMessage for invalid values
            expect(settings.customAgentSystemMessage).toBeUndefined();
        });

        it('should work without plugin agentModeManager', async () => {
            const mockFile = {
                path: 'test-chat.md'
            };

            const yamlContent = `---
provider: openai
model: gpt-4
system_message: "Test system message"
temperature: 0.7
agent_mode_enabled: true
agent_prompt: "Test agent prompt"
---

Chat content here`;

            mockApp.vault.read.mockResolvedValue(yamlContent);

            // Remove agentModeManager from plugin
            delete mockPlugin.agentModeManager;

            const result = await loadChatYamlAndApplySettings({
                app: mockApp,
                plugin: mockPlugin,
                settings,
                file: mockFile
            });

            expect(settings.agentMode!.enabled).toBe(true);
            expect(settings.customAgentSystemMessage).toBe('Test agent prompt');
        });

        it('should disable agent mode when YAML lacks agent mode keys (backward compatibility)', async () => {
            // Ensure agent mode starts enabled
            settings.agentMode!.enabled = true;

            const mockFile = {
                path: 'test-chat.md'
            };

            const yamlContent = `---
provider: openai
model: gpt-4
system_message: "Test system message"
temperature: 0.7
---

Chat content here`;

            mockApp.vault.read.mockResolvedValue(yamlContent);

            const result = await loadChatYamlAndApplySettings({
                app: mockApp,
                plugin: mockPlugin,
                settings,
                file: mockFile
            });

            // Should disable agent mode for backward compatibility with old YAML
            expect(settings.agentMode!.enabled).toBe(false);
            expect(mockPlugin.agentModeManager.setAgentModeEnabled).toHaveBeenCalledWith(false);
        });
    });
});
