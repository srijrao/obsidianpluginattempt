/**
 * @file ThoughtTool.test.ts
 * @description Unit tests for ThoughtTool covering reasoning recording and next action guidance
 */

import { ThoughtTool } from '../../src/components/agent/tools/ThoughtTool';
import { ToolResult } from '../../src/types';

describe('ThoughtTool', () => {
    let mockApp: any;
    let thoughtTool: ThoughtTool;
    let mockContext: any;

    beforeEach(() => {
        mockApp = {};
        thoughtTool = new ThoughtTool(mockApp);
        mockContext = {
            plugin: {
                debugLog: jest.fn()
            }
        };
    });

    describe('constructor', () => {
        test('should initialize with app reference', () => {
            expect(thoughtTool).toBeDefined();
            expect(thoughtTool.name).toBe('thought');
            expect(thoughtTool.description).toContain('Record AI reasoning');
        });
    });

    describe('parameters', () => {
        test('should have correct parameter definitions', () => {
            expect(thoughtTool.parameters).toHaveProperty('thought');
            expect(thoughtTool.parameters).toHaveProperty('nextTool');
            expect(thoughtTool.parameters).toHaveProperty('nextActionDescription');

            expect(thoughtTool.parameters.thought.required).toBe(true);
            expect(thoughtTool.parameters.nextTool.required).toBe(true);
            expect(thoughtTool.parameters.nextActionDescription.required).toBe(true);
        });
    });

    describe('execute', () => {
        test('should execute successfully with valid parameters', async () => {
            const params = {
                thought: 'I need to analyze the file structure',
                nextTool: 'file_list',
                nextActionDescription: 'List files in the vault'
            };

            const result = await thoughtTool.execute(params, mockContext);

            expect(result.success).toBe(true);
            expect(result.data).toHaveProperty('thought', 'I need to analyze the file structure');
            expect(result.data).toHaveProperty('nextTool', 'file_list');
            expect(result.data).toHaveProperty('nextActionDescription', 'List files in the vault');
            expect(result.data).toHaveProperty('finished', false);
            expect(result.data).toHaveProperty('timestamp');
            expect(result.data).toHaveProperty('formattedThought');
            expect(typeof result.data.timestamp).toBe('string');
        });

        test('should handle finished state correctly', async () => {
            const params = {
                thought: 'Analysis complete, all tasks finished',
                nextTool: 'finished',
                nextActionDescription: 'No further action needed'
            };

            const result = await thoughtTool.execute(params, mockContext);

            expect(result.success).toBe(true);
            expect(result.data.finished).toBe(true);
            expect(result.data.formattedThought).toContain('✅ Complete');
        });

        test('should handle step information', async () => {
            const params = {
                thought: 'Step 1: Initial analysis',
                nextTool: 'file_read',
                nextActionDescription: 'Read the main file',
                step: 1,
                totalSteps: 3
            };

            const result = await thoughtTool.execute(params, mockContext);

            expect(result.success).toBe(true);
            expect(result.data.step).toBe(1);
            expect(result.data.totalSteps).toBe(3);
            expect(result.data.formattedThought).toContain('Step 1/3');
        });

        test('should handle reasoning alias for thought', async () => {
            const params = {
                reasoning: 'Using reasoning alias',
                nextTool: 'file_search',
                nextActionDescription: 'Search for content'
            };

            const result = await thoughtTool.execute(params, mockContext);

            expect(result.success).toBe(true);
            expect(result.data.thought).toBe('Using reasoning alias');
            expect(mockContext.plugin.debugLog).toHaveBeenCalledWith('debug', '[ThoughtTool] Aliasing reasoning to thought', expect.any(Object));
        });

        test('should handle nested parameters object', async () => {
            const params = {
                parameters: {
                    thought: 'Nested parameters test',
                    nextTool: 'file_write',
                    nextActionDescription: 'Write to file'
                }
            };

            const result = await thoughtTool.execute(params, mockContext);

            expect(result.success).toBe(true);
            expect(result.data.thought).toBe('Nested parameters test');
        });

        test('should fail with missing thought parameter', async () => {
            const params = {
                nextTool: 'file_list',
                nextActionDescription: 'List files'
            };

            const result = await thoughtTool.execute(params, mockContext);

            expect(result.success).toBe(false);
            expect(result.error).toContain('Parameter "thought" is required');
        });

        test('should fail with empty thought parameter', async () => {
            const params = {
                thought: '',
                nextTool: 'file_list',
                nextActionDescription: 'List files'
            };

            const result = await thoughtTool.execute(params, mockContext);

            expect(result.success).toBe(false);
            expect(result.error).toContain('Parameter "thought" is required');
        });

        test('should fail with missing nextTool parameter', async () => {
            const params = {
                thought: 'Test thought',
                nextActionDescription: 'Test action'
            };

            const result = await thoughtTool.execute(params, mockContext);

            expect(result.success).toBe(false);
            expect(result.error).toContain('Parameter "nextTool" is required');
        });

        test('should fail with empty nextTool parameter', async () => {
            const params = {
                thought: 'Test thought',
                nextTool: '',
                nextActionDescription: 'Test action'
            };

            const result = await thoughtTool.execute(params, mockContext);

            expect(result.success).toBe(false);
            expect(result.error).toContain('Parameter "nextTool" is required');
        });

        test('should handle invalid step values', async () => {
            const params = {
                thought: 'Test thought',
                nextTool: 'file_list',
                nextActionDescription: 'List files',
                step: -1,
                totalSteps: 0
            };

            const result = await thoughtTool.execute(params, mockContext);

            expect(result.success).toBe(true);
            expect(result.data.step).toBeUndefined();
            expect(result.data.totalSteps).toBeUndefined();
        });

        test('should log execution details when debugLog is available', async () => {
            const params = {
                thought: 'Debug logging test',
                nextTool: 'file_read',
                nextActionDescription: 'Read file'
            };

            await thoughtTool.execute(params, mockContext);

            expect(mockContext.plugin.debugLog).toHaveBeenCalledWith('info', '[ThoughtTool] execute called', expect.any(Object));
            expect(mockContext.plugin.debugLog).toHaveBeenCalledWith('info', '[ThoughtTool] ThoughtTool execution complete', expect.any(Object));
        });

        test('should handle missing context gracefully', async () => {
            const params = {
                thought: 'No context test',
                nextTool: 'file_list',
                nextActionDescription: 'List files'
            };

            const result = await thoughtTool.execute(params, null);

            expect(result.success).toBe(true);
            expect(result.data.thought).toBe('No context test');
        });
    });

    describe('renderThought', () => {
        test('should render thought with next tool', () => {
            const thoughtTool = new ThoughtTool(mockApp);
            const renderMethod = (thoughtTool as any).renderThought.bind(thoughtTool);

            const result = renderMethod({
                thought: 'Planning next step',
                timestamp: '2023-01-01T00:00:00.000Z',
                nextTool: 'file_list',
                finished: false
            });

            expect(result).toContain('🤔 → file_list');
            expect(result).toContain('> Planning next step');
        });

        test('should render thought with finished status', () => {
            const thoughtTool = new ThoughtTool(mockApp);
            const renderMethod = (thoughtTool as any).renderThought.bind(thoughtTool);

            const result = renderMethod({
                thought: 'Task completed',
                timestamp: '2023-01-01T00:00:00.000Z',
                nextTool: 'finished',
                finished: true
            });

            expect(result).toContain('✅ Complete');
            expect(result).toContain('> Task completed');
        });

        test('should render thought with step information', () => {
            const thoughtTool = new ThoughtTool(mockApp);
            const renderMethod = (thoughtTool as any).renderThought.bind(thoughtTool);

            const result = renderMethod({
                thought: 'Step execution',
                stepInfo: 'Step 2/5',
                timestamp: '2023-01-01T00:00:00.000Z',
                nextTool: 'file_read',
                finished: false
            });

            expect(result).toContain('🤔 Step 2/5 → file_read');
            expect(result).toContain('> Step execution');
        });
    });
});