/**
 * @file ToolRegistry.test.ts
 * @description Unit tests for ToolRegistry covering tool registration and execution
 */

import { ToolRegistry, Tool } from '../../src/components/agent/ToolRegistry';
import { ToolResult } from '../../src/types';

describe('ToolRegistry', () => {
    let mockPlugin: any;
    let toolRegistry: ToolRegistry;
    let mockTool: Tool;

    beforeEach(() => {
        mockPlugin = {
            settings: { debugMode: false },
            debugLog: jest.fn()
        };

        mockTool = {
            name: 'test-tool',
            description: 'A test tool',
            parameters: {
                param1: { type: 'string' },
                param2: { type: 'number' }
            },
            execute: jest.fn().mockResolvedValue({
                success: true,
                result: 'test result',
                executionTime: 100
            } as ToolResult)
        };

        toolRegistry = new ToolRegistry(mockPlugin);
    });

    describe('constructor', () => {
        test('should initialize with plugin reference', () => {
            expect(toolRegistry).toBeDefined();
        });
    });

    describe('register', () => {
        test('should register a tool successfully', () => {
            toolRegistry.register(mockTool);

            expect(toolRegistry['tools'].has('test-tool')).toBe(true);
            expect(toolRegistry['tools'].get('test-tool')).toBe(mockTool);
        });

        test('should handle plugin without settings', () => {
            const registryWithoutPlugin = new ToolRegistry(null);

            expect(() => {
                registryWithoutPlugin.register(mockTool);
            }).not.toThrow();
        });
    });

    describe('execute', () => {
        test('should execute registered tool successfully', async () => {
            toolRegistry.register(mockTool);

            const command = {
                action: 'test-tool',
                parameters: { param1: 'value1', param2: 42 },
                requestId: 'test-request-1'
            };

            const result = await toolRegistry.execute(command);

            expect(mockTool.execute).toHaveBeenCalledWith(
                { param1: 'value1', param2: 42 },
                { plugin: mockPlugin, app: undefined }
            );
            expect(result).toEqual({
                success: true,
                result: 'test result',
                executionTime: 100,
                requestId: 'test-request-1'
            });
        });

        test('should return error for unregistered tool', async () => {
            const command = {
                action: 'non-existent-tool',
                parameters: { param1: 'value1' },
                requestId: 'test-request-2'
            };

            const result = await toolRegistry.execute(command);

            expect(result).toEqual({
                success: false,
                error: 'Tool not found: non-existent-tool',
                requestId: 'test-request-2'
            });
        });

        test('should handle tool execution errors', async () => {
            const errorTool: Tool = {
                name: 'error-tool',
                description: 'A tool that errors',
                parameters: {},
                execute: jest.fn().mockRejectedValue(new Error('Tool execution failed'))
            };

            toolRegistry.register(errorTool);

            const command = {
                action: 'error-tool',
                parameters: {},
                requestId: 'test-request-3'
            };

            const result = await toolRegistry.execute(command);

            expect(result).toEqual({
                success: false,
                error: 'Tool execution failed',
                requestId: 'test-request-3'
            });
        });

        test('should inject editor for file_diff tool when available', async () => {
            const fileDiffTool: Tool = {
                name: 'file_diff',
                description: 'File diff tool',
                parameters: { filePath: { type: 'string' } },
                execute: jest.fn().mockResolvedValue({ success: true, result: 'diff result' } as ToolResult)
            };

            mockPlugin.app = {
                workspace: {
                    activeLeaf: {
                        view: {
                            editor: 'mock-editor'
                        }
                    }
                }
            };

            toolRegistry.register(fileDiffTool);

            const command = {
                action: 'file_diff',
                parameters: { filePath: '/test/file.md' },
                requestId: 'test-request-4'
            };

            await toolRegistry.execute(command);

            expect(fileDiffTool.execute).toHaveBeenCalledWith(
                { filePath: '/test/file.md', editor: 'mock-editor' },
                { plugin: mockPlugin, app: mockPlugin.app }
            );
        });
    });

    describe('getAvailableTools', () => {
        test('should return all registered tools', () => {
            const mockTool2: Tool = {
                name: 'test-tool-2',
                description: 'Another test tool',
                parameters: {},
                execute: jest.fn().mockResolvedValue({ success: true, result: 'result2' } as ToolResult)
            };

            toolRegistry.register(mockTool);
            toolRegistry.register(mockTool2);

            const allTools = toolRegistry.getAvailableTools();

            expect(allTools).toHaveLength(2);
            expect(allTools).toContain(mockTool);
            expect(allTools).toContain(mockTool2);
        });

        test('should return empty array when no tools registered', () => {
            const allTools = toolRegistry.getAvailableTools();

            expect(allTools).toEqual([]);
        });
    });
});