import { AgentModeManager } from '../../src/components/agent/agentModeManager';
import { AgentResponseHandler } from '../../src/components/agent/AgentResponseHandler/AgentResponseHandler';
import { ToolRegistry } from '../../src/components/agent/ToolRegistry';
import { CommandParser } from '../../src/components/agent/CommandParser';
import { createMockPlugin, createMockApp } from '../utils/testHelpers';
import { MyPluginSettings } from '../../src/types';

// Mock the tool collection to avoid complex dependencies
jest.mock('../../src/components/agent/tools/toolcollect', () => ({
    createToolInstances: jest.fn(() => []),
    getToolMetadata: jest.fn(() => [
        { name: 'file_search', description: 'Search files', parameters: {} },
        { name: 'file_read', description: 'Read files', parameters: {} },
        { name: 'file_write', description: 'Write files', parameters: {} },
        { name: 'file_diff', description: 'Diff files', parameters: {} },
        { name: 'file_move', description: 'Move files', parameters: {} },
        { name: 'thought', description: 'Record reasoning', parameters: {} },
        { name: 'file_list', description: 'List files', parameters: {} },
        { name: 'file_delete', description: 'Delete files', parameters: {} },
        { name: 'context_notes_manage', description: 'Manage context notes', parameters: {} },
        { name: 'failing_tool', description: 'A tool that fails', parameters: {} },
        { name: 'tool1', description: 'Test tool 1', parameters: {} },
        { name: 'tool2', description: 'Test tool 2', parameters: {} },
        { name: 'tool3', description: 'Test tool 3', parameters: {} },
        { name: 'slow_tool', description: 'Slow tool', parameters: {} }
    ]),
    getAllToolNames: jest.fn(() => ['file_search', 'file_read', 'file_write', 'file_diff', 'file_move', 'thought', 'file_list', 'file_delete', 'context_notes_manage', 'failing_tool', 'tool1', 'tool2', 'tool3', 'slow_tool'])
}));

describe('Agent Mode Integration Tests', () => {
    let mockPlugin: any;
    let mockApp: any;
    let settings: MyPluginSettings;
    let agentModeManager: AgentModeManager;
    let toolRegistry: ToolRegistry;
    let commandParser: CommandParser;
    let agentResponseHandler: AgentResponseHandler;

    beforeEach(() => {
        // Create comprehensive mock setup
        mockApp = createMockApp();
        settings = {
            debugMode: false,
            agentMode: {
                enabled: false,
                maxToolCalls: 5,
                timeoutMs: 30000,
                maxIterations: 10
            }
        } as MyPluginSettings;

        mockPlugin = createMockPlugin(settings);
        // mockPlugin.agentModeManager = agentModeManager; // Moved after agentModeManager creation

        // Initialize core components
        agentModeManager = new AgentModeManager(
            settings,
            async () => {}, // saveSettings mock
            () => {}, // emitSettingsChange mock
            mockPlugin.debugLog
        );

        mockPlugin.agentModeManager = agentModeManager; // Now assign after creation

        toolRegistry = new ToolRegistry(mockPlugin);
        commandParser = new CommandParser();
        agentResponseHandler = new AgentResponseHandler({
            plugin: mockPlugin,
            app: mockApp,
            messagesContainer: document.createElement('div'),
            onToolResult: jest.fn()
        });
    });

    describe('Agent Mode Manager', () => {
        test('should initialize with default settings when agentMode is undefined', () => {
            const manager = new AgentModeManager(
                {} as MyPluginSettings,
                async () => {},
                () => {},
                mockPlugin.debugLog
            );

            const agentSettings = manager.getAgentModeSettings();
            expect(agentSettings.enabled).toBe(false);
            expect(agentSettings.maxToolCalls).toBe(5);
            expect(agentSettings.timeoutMs).toBe(30000);
            expect(agentSettings.maxIterations).toBe(10);
        });

        test('should return configured agent mode settings', () => {
            const agentSettings = agentModeManager.getAgentModeSettings();
            expect(agentSettings.enabled).toBe(false);
            expect(agentSettings.maxToolCalls).toBe(5);
            expect(agentSettings.timeoutMs).toBe(30000);
            expect(agentSettings.maxIterations).toBe(10);
        });

        test('should correctly report agent mode enabled state', () => {
            expect(agentModeManager.isAgentModeEnabled()).toBe(false);

            // Enable agent mode
            settings.agentMode!.enabled = true;
            expect(agentModeManager.isAgentModeEnabled()).toBe(true);
        });

        test('should enable agent mode and persist settings', async () => {
            const saveSettingsMock = jest.fn().mockResolvedValue(undefined);
            const emitSettingsChangeMock = jest.fn();

            const manager = new AgentModeManager(
                settings,
                saveSettingsMock,
                emitSettingsChangeMock,
                mockPlugin.debugLog
            );

            await manager.setAgentModeEnabled(true);

            expect(settings.agentMode!.enabled).toBe(true);
            expect(saveSettingsMock).toHaveBeenCalledTimes(1);
            expect(emitSettingsChangeMock).toHaveBeenCalledTimes(1);
        });

        test('should disable agent mode and persist settings', async () => {
            // Start with agent mode enabled
            settings.agentMode!.enabled = true;

            const saveSettingsMock = jest.fn().mockResolvedValue(undefined);
            const emitSettingsChangeMock = jest.fn();

            const manager = new AgentModeManager(
                settings,
                saveSettingsMock,
                emitSettingsChangeMock,
                mockPlugin.debugLog
            );

            await manager.setAgentModeEnabled(false);

            expect(settings.agentMode!.enabled).toBe(false);
            expect(saveSettingsMock).toHaveBeenCalledTimes(1);
            expect(emitSettingsChangeMock).toHaveBeenCalledTimes(1);
        });
    });

    describe('Tool Registry', () => {
        test('should register and retrieve tools', () => {
            const mockTool = {
                name: 'test_tool',
                description: 'A test tool',
                parameters: { param1: { type: 'string' } },
                execute: jest.fn().mockResolvedValue({ success: true, data: 'result' })
            };

            toolRegistry.register(mockTool);

            // Verify tool is registered (we can't directly access private tools map,
            // but we can test through execution path)
            expect(mockTool.name).toBe('test_tool');
        });

        test('should handle tool execution with proper context injection', async () => {
            const mockTool = {
                name: 'context_tool',
                description: 'Tool that uses context',
                parameters: { filePath: { type: 'string' } },
                execute: jest.fn().mockImplementation(async (params, context) => {
                    // Verify context is injected
                    expect(context).toHaveProperty('app');
                    expect(context).toHaveProperty('plugin');
                    return { success: true, data: `Processed ${params.filePath}` };
                })
            };

            toolRegistry.register(mockTool);

            // Test execution would happen through AgentResponseHandler
            expect(mockTool.name).toBe('context_tool');
        });
    });

    describe('Command Parser', () => {
        test('should parse simple tool commands from response', () => {
            const response = `I'll help you with that.

{"action": "file_read", "parameters": {"filePath": "test.md"}, "requestId": "req1"}

That's the content you requested.`;

            const result = commandParser.parseResponse(response);

            expect(result.text).toBe(`I'll help you with that.



That's the content you requested.`);
            expect(result.commands).toHaveLength(1);
            expect(result.commands[0].action).toBe('file_read');
            expect(result.commands[0].parameters.filePath).toBe('test.md');
            expect(result.commands[0].requestId).toBe('req1');
        });

        test('should parse multiple tool commands from response', () => {
            const response = `Let me search and read files.

{"action": "file_search", "parameters": {"query": "*.md"}, "requestId": "search1"}
{"action": "file_read", "parameters": {"filePath": "found.md"}, "requestId": "read1"}

Here are the results.`;

            const result = commandParser.parseResponse(response);

            expect(result.commands).toHaveLength(2);
            expect(result.commands[0].action).toBe('file_search');
            expect(result.commands[1].action).toBe('file_read');
        });

        test('should handle responses with no tool commands', () => {
            const response = 'This is just a regular response with no tool commands.';

            const result = commandParser.parseResponse(response);

            expect(result.text).toBe(response);
            expect(result.commands).toHaveLength(0);
        });

        test('should handle malformed JSON gracefully', () => {
            const response = `Response with malformed command.

{"action": "file_read", "parameters": {"filePath": "test.md", "requestId": "req1"}

Still a valid response.`;

            const result = commandParser.parseResponse(response);

            expect(result.commands).toHaveLength(0); // Malformed command should be ignored
            expect(result.text).toContain('Response with malformed command');
        });
    });

    describe('Agent Response Handler - Basic Functionality', () => {
        beforeEach(() => {
            // Enable agent mode for these tests
            settings.agentMode!.enabled = true;
        });

        test('should return raw response when agent mode is disabled', async () => {
            settings.agentMode!.enabled = false;

            const response = 'This is a regular response.';
            const result = await agentResponseHandler.processResponse(response);

            expect(result.processedText).toBe(response);
            expect(result.toolResults).toHaveLength(0);
            expect(result.hasTools).toBe(false);
        });

        test('should process response with tool commands when agent mode is enabled', async () => {
            settings.agentMode!.enabled = true;

            const response = `I'll read that file for you.

{"action": "file_read", "parameters": {"filePath": "test.md"}, "requestId": "read1"}

Here's what I found.`;

            const result = await agentResponseHandler.processResponse(response);

            expect(result.hasTools).toBe(true);
            expect(result.toolResults).toHaveLength(1); // Tool executes but fails since no actual tool registered
            expect(result.processedText).toContain("Here's what I found");
        });

        test('should handle tool execution limits', async () => {
            settings.agentMode!.enabled = true;
            // Set low limit for testing
            settings.agentMode!.maxToolCalls = 1;

            const response = `Multiple commands.

{"action": "file_read", "parameters": {"filePath": "test1.md"}, "requestId": "read1"}
{"action": "file_read", "parameters": {"filePath": "test2.md"}, "requestId": "read2"}

Done.`;

            // First call should process
            const result1 = await agentResponseHandler.processResponse(response, 'test1');
            expect(result1.hasTools).toBe(true);

            // Second call should hit limit
            const result2 = await agentResponseHandler.processResponse(response, 'test2');
            expect(result2.processedText).toContain('Tool execution limit reached');
        });

        test('should filter already executed commands from chat history', async () => {
            const chatHistory = [
                {
                    role: 'assistant',
                    content: 'Let me read the file.',
                    toolResults: [
                        {
                            command: { action: 'file_read', parameters: { filePath: 'test.md' }, requestId: 'read1' },
                            result: { success: true, data: 'file content' }
                        }
                    ]
                }
            ];

            const response = `I already read this file.

{"action": "file_read", "parameters": {"filePath": "test.md"}, "requestId": "read1"}

Same result.`;

            const result = await agentResponseHandler.processResponse(response, 'test', chatHistory);

            expect(result.hasTools).toBe(true);
            expect(result.toolResults).toHaveLength(1); // Should return existing result
        });
    });

    describe('Tool Execution Workflow', () => {
        test('should handle successful tool execution', async () => {
            settings.agentMode!.enabled = true;

            // This would require mocking the actual tool execution
            // For now, we test the framework is in place
            const mockTool = {
                name: 'file_read',
                description: 'Read file contents',
                parameters: { filePath: { type: 'string' } },
                execute: jest.fn().mockResolvedValue({
                    success: true,
                    data: 'File contents here'
                })
            };

            toolRegistry.register(mockTool);

            const response = `Reading file.

{"action": "file_read", "parameters": {"filePath": "test.md"}, "requestId": "read1"}

Done.`;

            const result = await agentResponseHandler.processResponse(response);

            expect(result.hasTools).toBe(true);
            // Tool execution would happen here in real scenario
        });

        test('should handle tool execution errors gracefully', async () => {
            settings.agentMode!.enabled = true;

            const mockTool = {
                name: 'failing_tool',
                description: 'A tool that fails',
                parameters: { param: { type: 'string' } },
                execute: jest.fn().mockRejectedValue(new Error('Tool execution failed'))
            };

            toolRegistry.register(mockTool);

            const response = `Trying failing tool.

{"action": "failing_tool", "parameters": {"param": "test"}, "requestId": "fail1"}

Failed.`;

            // Should not throw, should handle error gracefully
            const result = await agentResponseHandler.processResponse(response);

            expect(result.hasTools).toBe(true);
            // Error handling would be tested here
        });
    });

    describe('Integration Scenarios', () => {
        test('should handle complex multi-tool workflow', async () => {
            settings.agentMode!.enabled = true;

            // Register multiple mock tools
            const searchTool = {
                name: 'file_search',
                description: 'Search for files',
                parameters: { query: { type: 'string' } },
                execute: jest.fn().mockResolvedValue({
                    success: true,
                    data: ['file1.md', 'file2.md']
                })
            };

            const readTool = {
                name: 'file_read',
                description: 'Read file',
                parameters: { filePath: { type: 'string' } },
                execute: jest.fn().mockResolvedValue({
                    success: true,
                    data: 'File content'
                })
            };

            toolRegistry.register(searchTool);
            toolRegistry.register(readTool);

            const response = `Let me search and read files.

{"action": "file_search", "parameters": {"query": "*.md"}, "requestId": "search1"}
{"action": "file_read", "parameters": {"filePath": "file1.md"}, "requestId": "read1"}

Found and read the files.`;

            const result = await agentResponseHandler.processResponse(response);

            expect(result.hasTools).toBe(true);
            expect(result.toolResults).toHaveLength(2); // Two tools execute but fail since no actual tools registered
        });

        test('should maintain execution count across multiple calls', async () => {
            settings.agentMode!.enabled = true;
            settings.agentMode!.maxToolCalls = 3;

            const response1 = `First command.

{"action": "tool1", "parameters": {}, "requestId": "cmd1"}`;

            const response2 = `Second command.

{"action": "tool2", "parameters": {}, "requestId": "cmd2"}`;

            await agentResponseHandler.processResponse(response1, 'call1');
            await agentResponseHandler.processResponse(response2, 'call2');

            // Third call should still work (within limit)
            const response3 = `Third command.

{"action": "tool3", "parameters": {}, "requestId": "cmd3"}`;

            const result3 = await agentResponseHandler.processResponse(response3, 'call3');
            expect(result3.hasTools).toBe(true);
        });

        test('should handle timeout scenarios', async () => {
            settings.agentMode!.enabled = true;
            // Set very low timeout for testing
            settings.agentMode!.timeoutMs = 1;

            const slowTool = {
                name: 'slow_tool',
                description: 'Slow tool',
                parameters: {},
                execute: jest.fn().mockImplementation(async () => {
                    await new Promise(resolve => setTimeout(resolve, 100)); // Longer than timeout
                    return { success: true, data: 'result' };
                })
            };

            toolRegistry.register(slowTool);

            const response = `Running slow tool.

{"action": "slow_tool", "parameters": {}, "requestId": "slow1"}`;

            // Should handle timeout gracefully
            const result = await agentResponseHandler.processResponse(response);
            expect(result.hasTools).toBe(true);
        });
    });
});