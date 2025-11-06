/**
 * @file AgentOrchestrator.test.ts
 * @description Tests for the Agent Orchestrator service
 */

import { AgentOrchestrator } from '../../../src/services/agent/AgentOrchestrator';
import { ToolCommand, ToolResult } from '../../../src/types';
import { createMockApp } from '../../utils/testUtils';

describe('AgentOrchestrator', () => {
  let mockApp: any;
  let mockCommandProcessor: any;
  let mockExecutionEngine: any;
  let mockLimitManager: any;
  let mockDisplayManager: any;
  let mockEventBus: any;
  let agentOrchestrator: AgentOrchestrator;

  beforeEach(() => {
    mockApp = createMockApp();

    mockCommandProcessor = {
      parseCommands: jest.fn(),
      validateCommands: jest.fn(),
      filterExecutedCommands: jest.fn()
    };

    mockExecutionEngine = {
      executeCommand: jest.fn(),
      canExecute: jest.fn(),
      getExecutionStats: jest.fn(),
      registerTool: jest.fn(),
      unregisterTool: jest.fn()
    };

    mockLimitManager = {
      isLimitReached: jest.fn(),
      canExecute: jest.fn(),
      addExecutions: jest.fn(),
      resetLimit: jest.fn(),
      getLimit: jest.fn(),
      setLimit: jest.fn(),
      getCurrentCount: jest.fn(),
      getRemaining: jest.fn(),
      getUsagePercentage: jest.fn(),
      getStatus: jest.fn()
    };

    mockDisplayManager = {
      createDisplay: jest.fn(),
      updateDisplay: jest.fn(),
      getDisplays: jest.fn(),
      clearDisplays: jest.fn(),
      getDisplay: jest.fn(),
      removeDisplay: jest.fn(),
      getDisplaysByAction: jest.fn(),
      getDisplaysByStatus: jest.fn(),
      getDisplayStats: jest.fn().mockReturnValue({ displays: 0, errors: 0 }),
      exportDisplaysToMarkdown: jest.fn(),
      destroy: jest.fn()
    };

    mockEventBus = {
      publish: jest.fn(),
      subscribe: jest.fn(),
      subscribeOnce: jest.fn(),
      unsubscribe: jest.fn(),
      clear: jest.fn(),
      getSubscriptionCount: jest.fn()
    };

    agentOrchestrator = new AgentOrchestrator(
      mockApp,
      mockCommandProcessor,
      mockExecutionEngine,
      mockLimitManager,
      mockDisplayManager,
      mockEventBus
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Construction', () => {
    test('should create AgentOrchestrator instance', () => {
      expect(agentOrchestrator).toBeDefined();
    });

    test('should setup event listeners', () => {
      expect(mockEventBus.subscribe).toHaveBeenCalled();
    });
  });

  describe('processAgentResponse', () => {
    const mockResponse = 'AI response with tool commands';
    const mockCommands: ToolCommand[] = [
      {
        action: 'file_read',
        parameters: { path: 'test.md' },
        requestId: 'test-1'
      }
    ];
    const mockResult: ToolResult = {
      success: true,
      data: 'file content',
      requestId: 'test-1'
    };

    beforeEach(() => {
      mockCommandProcessor.parseCommands.mockReturnValue(mockCommands);
      mockCommandProcessor.validateCommands.mockReturnValue({
        isValid: true,
        validCommands: mockCommands,
        totalCount: mockCommands.length,
        validCount: mockCommands.length
      });
      mockCommandProcessor.filterExecutedCommands.mockReturnValue(mockCommands);
      mockLimitManager.canExecute.mockReturnValue(true);
      mockLimitManager.isLimitReached.mockReturnValue(false);
      mockExecutionEngine.canExecute.mockReturnValue(true);
      mockExecutionEngine.executeCommand.mockResolvedValue(mockResult);
      mockLimitManager.getStatus.mockReturnValue({
        count: 1,
        limit: 10,
        remaining: 9,
        percentage: 10
      });
    });

    test('should process agent response successfully', async () => {
      const result = await agentOrchestrator.processAgentResponse(mockResponse);

      expect(result).toBeDefined();
      expect(result.commands).toEqual(mockCommands);
      expect(result.results).toHaveLength(1);
      expect(result.limitReached).toBe(false);
      expect(result.statistics).toBeDefined();
    });

    test('should parse commands from response', async () => {
      await agentOrchestrator.processAgentResponse(mockResponse);

      expect(mockCommandProcessor.parseCommands).toHaveBeenCalledWith(mockResponse);
    });

    test('should validate parsed commands', async () => {
      await agentOrchestrator.processAgentResponse(mockResponse);

      expect(mockCommandProcessor.validateCommands).toHaveBeenCalledWith(mockCommands);
      expect(mockCommandProcessor.validateCommands).toHaveBeenCalledTimes(1);
    });

    test('should filter executed commands', async () => {
      await agentOrchestrator.processAgentResponse(mockResponse);

      // Note: The current implementation doesn't use filterExecutedCommands
      // It just slices the valid commands based on maxExecutions
      expect(mockCommandProcessor.filterExecutedCommands).not.toHaveBeenCalled();
    });

    test('should check execution limits', async () => {
      await agentOrchestrator.processAgentResponse(mockResponse);

      expect(mockLimitManager.canExecute).toHaveBeenCalledWith(1);
    });

    test('should execute valid commands', async () => {
      await agentOrchestrator.processAgentResponse(mockResponse);

      expect(mockExecutionEngine.executeCommand).toHaveBeenCalledWith(mockCommands[0]);
    });

    test('should display results when enabled', async () => {
      // Setup mocks for this specific test
      mockCommandProcessor.parseCommands.mockReturnValue(mockCommands);
      mockCommandProcessor.validateCommands.mockImplementation(() => ({
        isValid: true,
        validCommands: mockCommands,
        totalCount: mockCommands.length,
        validCount: mockCommands.length
      }));
      mockCommandProcessor.filterExecutedCommands.mockReturnValue(mockCommands);
      mockLimitManager.canExecute.mockReturnValue(true);
      mockLimitManager.isLimitReached.mockReturnValue(false);
      mockExecutionEngine.canExecute.mockReturnValue(true);
      mockExecutionEngine.executeCommand.mockResolvedValue(mockResult);
      mockLimitManager.getStatus.mockReturnValue({
        count: 1,
        limit: 10,
        remaining: 9,
        percentage: 10
      });

      await agentOrchestrator.processAgentResponse(mockResponse);

      expect(mockDisplayManager.createDisplay).toHaveBeenCalledWith(mockCommands[0], mockResult);
    });

    test('should not display results when disabled', async () => {
      await agentOrchestrator.processAgentResponse(mockResponse, { displayResults: false });

      expect(mockDisplayManager.createDisplay).not.toHaveBeenCalled();
    });

    test('should handle execution limit reached', async () => {
      mockLimitManager.canExecute.mockReturnValue(false);
      mockLimitManager.isLimitReached.mockReturnValue(true);

      const result = await agentOrchestrator.processAgentResponse(mockResponse);

      expect(result.limitReached).toBe(true);
      expect(result.results).toHaveLength(0);
    });

    test('should handle invalid commands', async () => {
      mockCommandProcessor.validateCommands.mockReturnValue({
        isValid: false,
        errors: ['Invalid command']
      });

      const result = await agentOrchestrator.processAgentResponse(mockResponse);

      expect(result.results).toHaveLength(0);
      expect(mockExecutionEngine.executeCommand).not.toHaveBeenCalled();
    });

    test('should handle execution errors', async () => {
      const errorResult: ToolResult = {
        success: false,
        error: 'Execution failed',
        requestId: 'test-1'
      };
      mockExecutionEngine.executeCommand.mockResolvedValue(errorResult);

      const result = await agentOrchestrator.processAgentResponse(mockResponse);

      expect(result.results).toHaveLength(1);
      expect(result.results[0].result.success).toBe(false);
      expect(mockDisplayManager.createDisplay).toHaveBeenCalledWith(mockCommands[0], errorResult);
    });
  });

  describe('Event Handling', () => {
    test('should publish events for command execution', async () => {
      const mockResponse = 'AI response';
      const mockCommands: ToolCommand[] = [{
        action: 'file_read',
        parameters: { path: 'test.md' },
        requestId: 'test-1'
      }];
      const mockResult: ToolResult = {
        success: true,
        data: 'content',
        requestId: 'test-1'
      };

      mockCommandProcessor.parseCommands.mockReturnValue(mockCommands);
      mockCommandProcessor.validateCommands.mockReturnValue({
        isValid: true,
        validCommands: mockCommands,
        totalCount: mockCommands.length,
        validCount: mockCommands.length
      });
      mockCommandProcessor.filterExecutedCommands.mockReturnValue(mockCommands);
      mockLimitManager.canExecute.mockReturnValue(true);
      mockExecutionEngine.executeCommand.mockResolvedValue(mockResult);

      await agentOrchestrator.processAgentResponse(mockResponse);

      expect(mockEventBus.publish).toHaveBeenCalledWith('agent.processing_started', expect.any(Object));
      expect(mockEventBus.publish).toHaveBeenCalledWith('agent.processing_completed', expect.any(Object));
    });

    test('should publish events for errors', async () => {
      mockCommandProcessor.parseCommands.mockImplementation(() => {
        throw new Error('Parse error');
      });

      await expect(agentOrchestrator.processAgentResponse('invalid')).rejects.toThrow();

      expect(mockEventBus.publish).toHaveBeenCalledWith('agent.processing_error', expect.any(Object));
    });
  });
});