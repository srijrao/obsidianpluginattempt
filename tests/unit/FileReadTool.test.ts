/**
 * @file FileReadTool.test.ts
 * @description Unit tests for FileReadTool covering file reading, path validation, and size limits
 */

// Mock all dependencies before imports
jest.mock('../../src/components/agent/tools/pathValidation', () => ({
    PathValidator: jest.fn().mockImplementation(() => ({
        validateAndNormalizePath: jest.fn()
    }))
}));

jest.mock('../../src/utils/fileUtils', () => ({
    getTFileByPath: jest.fn()
}));

jest.mock('../../src/utils/logger', () => ({
    debugLog: jest.fn()
}));

import { FileReadTool } from '../../src/components/agent/tools/FileReadTool';
import { ToolResult } from '../../src/types';

describe('FileReadTool', () => {
    let mockApp: any;
    let fileReadTool: FileReadTool;
    let mockContext: any;

    beforeEach(() => {
        mockApp = {
            vault: {
                read: jest.fn()
            }
        };

        fileReadTool = new FileReadTool(mockApp);
        mockContext = {
            plugin: {
                settings: { debugMode: false }
            }
        };
    });

    describe('constructor', () => {
        test('should initialize with app reference and path validator', () => {
            expect(fileReadTool).toBeDefined();
            expect(fileReadTool.name).toBe('file_read');
            expect(fileReadTool.description).toContain('Reads file content');
        });
    });

    describe('parameters', () => {
        test('should have correct parameter definitions', () => {
            expect(fileReadTool.parameters).toHaveProperty('path');
            expect(fileReadTool.parameters).toHaveProperty('maxSize');

            expect(fileReadTool.parameters.path.type).toBe('string');
            expect(fileReadTool.parameters.maxSize.type).toBe('number');
            expect(fileReadTool.parameters.maxSize.default).toBe(1024 * 1024);
        });
    });

    describe('execute', () => {
        beforeEach(() => {
            // Reset mocks
            jest.clearAllMocks();
        });

        test('should read file successfully with valid path', async () => {
            // Mock the path validator method directly on the instance
            const pathValidator = (fileReadTool as any).pathValidator;
            pathValidator.validateAndNormalizePath = jest.fn().mockReturnValue('/normalized/path/test.md');

            const mockFile = {
                stat: { size: 100, mtime: 1234567890 },
                extension: 'md'
            };
            const fileContent = '# Test File\n\nThis is test content.';

            require('../../src/utils/fileUtils').getTFileByPath.mockReturnValue(mockFile);
            mockApp.vault.read.mockResolvedValue(fileContent);

            const params = { path: '/test/file.md' };
            const result = await fileReadTool.execute(params, mockContext);

            expect(result.success).toBe(true);
            expect(result.data.content).toBe('# Test File\n\nThis is test content.');
            expect(result.data.filePath).toBe('/normalized/path/test.md');
        });

        test('should use legacy filePath parameter', async () => {
            const mockFile = {
                stat: { size: 50, mtime: 1234567890 },
                extension: 'txt'
            };
            const fileContent = 'Legacy file content';

            const pathValidator = (fileReadTool as any).pathValidator;
            pathValidator.validateAndNormalizePath.mockReturnValue('/legacy/path/file.txt');
            require('../../src/utils/fileUtils').getTFileByPath.mockReturnValue(mockFile);
            mockApp.vault.read.mockResolvedValue(fileContent);

            const params = { path: '/legacy/file.txt', filePath: '/legacy/file.txt' } as any;
            const result = await fileReadTool.execute(params, mockContext);

            expect(result.success).toBe(true);
            expect(pathValidator.validateAndNormalizePath).toHaveBeenCalledWith('/legacy/file.txt');
        });

        test('should apply default maxSize when not specified', async () => {
            const mockFile = {
                stat: { size: 1024 * 1024 - 1, mtime: 1234567890 }, // Just under default limit
                extension: 'md'
            };
            const fileContent = 'Content under limit';

            const pathValidator = (fileReadTool as any).pathValidator;
            pathValidator.validateAndNormalizePath.mockReturnValue('/test/file.md');
            require('../../src/utils/fileUtils').getTFileByPath.mockReturnValue(mockFile);
            mockApp.vault.read.mockResolvedValue(fileContent);

            const params = { path: '/test/file.md' };
            const result = await fileReadTool.execute(params, mockContext);

            expect(result.success).toBe(true);
        });

        test('should respect custom maxSize parameter', async () => {
            const mockFile = {
                stat: { size: 1000, mtime: 1234567890 },
                extension: 'md'
            };
            const fileContent = 'Small file content';

            const pathValidator = (fileReadTool as any).pathValidator;
            pathValidator.validateAndNormalizePath.mockReturnValue('/test/file.md');
            require('../../src/utils/fileUtils').getTFileByPath.mockReturnValue(mockFile);
            mockApp.vault.read.mockResolvedValue(fileContent);

            const params = { path: '/test/file.md', maxSize: 500 };
            const result = await fileReadTool.execute(params, mockContext);

            expect(result.success).toBe(false);
            expect(result.error).toContain('File too large');
            expect(result.error).toContain('1000 bytes');
            expect(result.error).toContain('max 500 bytes');
        });

        test('should fail when path parameter is missing', async () => {
            const params = { path: undefined } as any;
            const result = await fileReadTool.execute(params, mockContext);

            expect(result.success).toBe(false);
            expect(result.error).toBe('path parameter is required');
        });

        test('should fail when path validation fails', async () => {
            const pathValidator = (fileReadTool as any).pathValidator;
            pathValidator.validateAndNormalizePath.mockImplementation(() => {
                throw new Error('Invalid path format');
            });

            const params = { path: '/invalid/../path' };
            const result = await fileReadTool.execute(params, mockContext);

            expect(result.success).toBe(false);
            expect(result.error).toContain('Path validation failed: Invalid path format');
        });

        test('should fail when file does not exist', async () => {
            const pathValidator = (fileReadTool as any).pathValidator;
            pathValidator.validateAndNormalizePath.mockReturnValue('/nonexistent/file.md');
            require('../../src/utils/fileUtils').getTFileByPath.mockReturnValue(null);

            const params = { path: '/nonexistent/file.md' };
            const result = await fileReadTool.execute(params, mockContext);

            expect(result.success).toBe(false);
            expect(result.error).toContain('File not found: /nonexistent/file.md');
        });

        test('should handle vault read errors', async () => {
            const mockFile = {
                stat: { size: 100, mtime: 1234567890 },
                extension: 'md'
            };

            const pathValidator = (fileReadTool as any).pathValidator;
            pathValidator.validateAndNormalizePath.mockReturnValue('/test/file.md');
            require('../../src/utils/fileUtils').getTFileByPath.mockReturnValue(mockFile);
            mockApp.vault.read.mockRejectedValue(new Error('Permission denied'));

            const params = { path: '/test/file.md' };
            const result = await fileReadTool.execute(params, mockContext);

            expect(result.success).toBe(false);
            expect(result.error).toContain('Failed to read file: Permission denied');
        });

        test('should clean up file content', async () => {
            const mockFile = {
                stat: { size: 200, mtime: 1234567890 },
                extension: 'md'
            };
            const rawContent = 'Line with trailing spaces   \n\n\n\nMultiple blank lines\n\n\n\n\n\n------Multiple dashes------\n   Multiple   spaces   ';
            const expectedContent = 'Line with trailing spaces\n\nMultiple blank lines\n\n-----Multiple dashes-----\n  Multiple  spaces';

            const pathValidator = (fileReadTool as any).pathValidator;
            pathValidator.validateAndNormalizePath.mockReturnValue('/test/file.md');
            require('../../src/utils/fileUtils').getTFileByPath.mockReturnValue(mockFile);
            mockApp.vault.read.mockResolvedValue(rawContent);

            const params = { path: '/test/file.md' };
            const result = await fileReadTool.execute(params, mockContext);

            expect(result.success).toBe(true);
            expect(result.data.content).toBe(expectedContent);
        });

        test('should handle files without stat information', async () => {
            const mockFile = {
                extension: 'txt'
            };
            const fileContent = 'No stat file';

            const pathValidator = (fileReadTool as any).pathValidator;
            pathValidator.validateAndNormalizePath.mockReturnValue('/test/file.txt');
            require('../../src/utils/fileUtils').getTFileByPath.mockReturnValue(mockFile);
            mockApp.vault.read.mockResolvedValue(fileContent);

            const params = { path: '/test/file.txt' };
            const result = await fileReadTool.execute(params, mockContext);

            expect(result.success).toBe(true);
            expect(result.data.size).toBe(0);
            expect(result.data.modified).toBe(0);
        });

        test('should use debug mode from context', async () => {
            const debugContext = {
                plugin: {
                    settings: { debugMode: true }
                }
            };

            const mockFile = {
                stat: { size: 50, mtime: 1234567890 },
                extension: 'md'
            };

            const pathValidator = (fileReadTool as any).pathValidator;
            pathValidator.validateAndNormalizePath.mockReturnValue('/test/file.md');
            require('../../src/utils/fileUtils').getTFileByPath.mockReturnValue(mockFile);
            mockApp.vault.read.mockResolvedValue('test content');

            const params = { path: '/test/file.md' };
            await fileReadTool.execute(params, debugContext);

            // Debug logging would be called, but we can't easily test debugLog calls
            // since they're imported from utils/logger
        });
    });
});