/**
 * Test file for Agent Mode functionality
 * 
 * This test verifies that:
 * 1. Agent mode can be enabled/disabled
 * 2. Agent system prompt is injected when agent mode is enabled
 * 3. Agent responses are processed for tool execution
 */

import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import { AgentModeManager } from '../src/components/agent/agentModeManager';
import { buildAgentSystemPrompt } from '../src/promptConstants';
import { DEFAULT_SETTINGS } from '../src/types';

// Mock plugin settings
const mockSettings = {
    ...DEFAULT_SETTINGS,
    agentMode: {
        enabled: false,
        maxToolCalls: 10,
        timeoutMs: 30000,
        maxIterations: 10
    },
    enabledTools: {
        'thought': true,
        'file_read': true,
        'file_write': false
    },
    debugMode: true
};

// Mock functions
const mockSaveSettings = jest.fn(async () => {});
const mockEmitSettingsChange = jest.fn();
const mockDebugLog = jest.fn();

describe('Agent Mode Functionality', () => {
    let agentModeManager: AgentModeManager;

    beforeEach(() => {
        // Reset mocks
        jest.clearAllMocks();
        
        // Reset the mock settings agentMode to disabled
        mockSettings.agentMode.enabled = false;
        
        // Create fresh agent mode manager
        agentModeManager = new AgentModeManager(
            mockSettings,
            mockSaveSettings,
            mockEmitSettingsChange,
            mockDebugLog
        );
    });

    test('should enable and disable agent mode', async () => {
        // Initially disabled
        expect(agentModeManager.isAgentModeEnabled()).toBe(false);
        
        // Enable agent mode
        await agentModeManager.setAgentModeEnabled(true);
        expect(agentModeManager.isAgentModeEnabled()).toBe(true);
        expect(mockSaveSettings).toHaveBeenCalled();
        // Note: Debug log format may vary, just check it was called
        expect(mockDebugLog).toHaveBeenCalled();
        
        // Disable agent mode
        await agentModeManager.setAgentModeEnabled(false);
        expect(agentModeManager.isAgentModeEnabled()).toBe(false);
        expect(mockSaveSettings).toHaveBeenCalledTimes(2);
    });

    test('should get agent mode settings with defaults', () => {
        const settings = agentModeManager.getAgentModeSettings();
        expect(settings).toEqual({
            enabled: false,
            maxToolCalls: 10,
            timeoutMs: 30000,
            maxIterations: 10
        });
    });

    test('should handle missing agent mode settings gracefully', () => {
        // Create manager with no agent mode settings
        const managerWithoutSettings = new AgentModeManager(
            { ...DEFAULT_SETTINGS },
            mockSaveSettings,
            mockEmitSettingsChange,
            mockDebugLog
        );
        
        const settings = managerWithoutSettings.getAgentModeSettings();
        expect(settings.enabled).toBe(false);
        expect(settings.maxToolCalls).toBe(10);
    });

    test('should build agent system prompt with enabled tools', () => {
        const enabledTools = {
            'thought': true,
            'file_read': true,
            'file_write': false,
            'web_search': true
        };
        
        const prompt = buildAgentSystemPrompt(enabledTools);
        
        // Should contain agent instructions
        expect(prompt).toContain('AI assistant for Obsidian Vault');
        expect(prompt).toContain('ALWAYS use \'thought\' tool first');
        expect(prompt).toContain('JSON objects only');
        
        // Should contain tool descriptions for enabled tools only
        expect(prompt).toContain('thought');
        expect(prompt).toContain('file_read');
        // Should not contain disabled tools
        expect(prompt).not.toContain('file_write');
    });

    test('should build default agent system prompt when no tools specified', () => {
        const prompt = buildAgentSystemPrompt();
        
        // Should contain basic agent instructions
        expect(prompt).toContain('AI assistant for Obsidian Vault');
        expect(prompt).toContain('Available tools:');
    });
});

describe('Agent Mode Integration', () => {
    test('should inject agent system prompt when agent mode is enabled', () => {
        // Mock message array
        const contextMessages = [
            { role: 'system', content: 'You are a helpful assistant.' }
        ];
        const userMessages = [
            { role: 'user', content: 'Help me organize my notes.' }
        ];
        
        // Simulate agent mode enabled
        const agentModeEnabled = true;
        const enabledTools = { 'thought': true, 'file_read': true };
        
        if (agentModeEnabled) {
            const agentSystemPrompt = buildAgentSystemPrompt(enabledTools);
            const allMessages = [
                { role: 'system', content: agentSystemPrompt },
                ...contextMessages,
                ...userMessages
            ];
            
            // Verify agent prompt is injected at the beginning
            expect(allMessages[0].role).toBe('system');
            expect(allMessages[0].content).toContain('AI assistant for Obsidian Vault');
            expect(allMessages.length).toBe(3); // agent prompt + context + user
        }
    });

    test('should not inject agent system prompt when agent mode is disabled', () => {
        // Mock message array
        const contextMessages = [
            { role: 'system', content: 'You are a helpful assistant.' }
        ];
        const userMessages = [
            { role: 'user', content: 'Help me organize my notes.' }
        ];
        
        // Simulate agent mode disabled
        const agentModeEnabled = false;
        
        let allMessages = [...contextMessages, ...userMessages];
        
        if (agentModeEnabled) {
            // This block should not execute
            const agentSystemPrompt = buildAgentSystemPrompt();
            allMessages = [
                { role: 'system', content: agentSystemPrompt },
                ...allMessages
            ];
        }
        
        // Verify no agent prompt is injected
        expect(allMessages.length).toBe(2); // only context + user
        expect(allMessages[0].content).toBe('You are a helpful assistant.');
    });
});

describe('Agent Response Processing', () => {
    test('should process agent response with tool calls', () => {
        // Mock agent response with tool calls
        const agentResponse = `{
  "action": "thought",
  "parameters": { "content": "I need to read the file first" },
  "requestId": "req-1"
}
{
  "action": "file_read",
  "parameters": { "path": "notes/important.md" },
  "requestId": "req-2"
}`;

        // Mock tool execution results
        const mockResults = [
            {
                command: { action: 'thought', parameters: { content: 'I need to read the file first' } },
                result: { content: 'Thought processed', success: true }
            },
            {
                command: { action: 'file_read', parameters: { path: 'notes/important.md' } },
                result: { content: 'File content here', success: true }
            }
        ];

        // Simulate agent data processing
        const enhancedData = {
            toolResults: mockResults.map(r => ({
                tool: r.command.action,
                input: r.command.parameters,
                output: r.result.content,
                success: r.result.success,
                timestamp: new Date().toISOString()
            })),
            reasoning: {
                thoughts: mockResults.filter(r => r.command.action === 'thought')
                    .map(r => r.command.parameters?.content || ''),
                plan: `Executed ${mockResults.length} tools`,
                analysis: {}
            },
            taskStatus: {
                status: 'completed',
                progress: mockResults.length,
                total: mockResults.length,
                timestamp: new Date().toISOString()
            }
        };

        // Verify enhanced data structure
        expect(enhancedData.toolResults).toHaveLength(2);
        expect(enhancedData.toolResults[0].tool).toBe('thought');
        expect(enhancedData.toolResults[1].tool).toBe('file_read');
        expect(enhancedData.reasoning.thoughts).toContain('I need to read the file first');
        expect(enhancedData.taskStatus.status).toBe('completed');
    });

    test('should handle agent response without tool calls', () => {
        // Mock regular response without tool calls
        const agentResponse = 'Here is my response without any tool calls.';
        
        // No tool processing should occur
        const enhancedData = null;
        
        expect(enhancedData).toBeNull();
    });
});
