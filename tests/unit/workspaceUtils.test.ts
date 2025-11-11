/**
 * @file workspaceUtils.test.ts
 * @description Unit tests for workspace utility functions
 */

import { App, TFile, WorkspaceLeaf } from 'obsidian';
import { getAllOpenMarkdownFiles } from '../../src/utils/workspaceUtils';

describe('workspaceUtils', () => {
    let mockApp: any;
    let mockVault: any;
    let mockWorkspace: any;

    beforeEach(() => {
        // Create mock vault
        mockVault = {
            getAbstractFileByPath: jest.fn()
        };

        // Create mock workspace with iterateAllLeaves
        mockWorkspace = {
            iterateAllLeaves: jest.fn(),
            getLeavesOfType: jest.fn().mockReturnValue([])
        };

        // Create mock app
        mockApp = {
            vault: mockVault,
            workspace: mockWorkspace
        } as any;
    });

    describe('getAllOpenMarkdownFiles', () => {
        it('should return files from initialized leaves', () => {
            const mockFile = { path: 'test.md', basename: 'test' } as TFile;
            const mockLeaf = {
                view: {
                    getViewType: () => 'markdown',
                    file: mockFile
                }
            } as any;

            mockWorkspace.iterateAllLeaves.mockImplementation((callback: Function) => {
                callback(mockLeaf);
            });

            const result = getAllOpenMarkdownFiles(mockApp);
            expect(result).toEqual([mockFile]);
        });

        it('should fallback to view state for uninitialized leaves', () => {
            // Test the fallback path (when iterateAllLeaves is not available)
            // Remove iterateAllLeaves to force fallback to getLeavesOfType
            delete mockWorkspace.iterateAllLeaves;

            const mockFile = Object.assign(Object.create(TFile.prototype), {
                path: 'uninitialized.md',
                basename: 'uninitialized',
                extension: 'md'
            });
            const mockLeaf = {
                view: {
                    getViewType: () => 'markdown',
                    file: undefined // uninitialized
                },
                getViewState: jest.fn().mockReturnValue({
                    state: { file: 'uninitialized.md' }
                })
            } as any;

            mockVault.getAbstractFileByPath.mockReturnValue(mockFile);
            mockWorkspace.getLeavesOfType.mockReturnValue([mockLeaf]);

            const result = getAllOpenMarkdownFiles(mockApp);
            expect(result).toEqual([mockFile]);
            expect(mockVault.getAbstractFileByPath).toHaveBeenCalledWith('uninitialized.md');
        });

        it('should handle leaves without iterateAllLeaves (fallback)', () => {
            // Remove iterateAllLeaves to test fallback
            delete mockWorkspace.iterateAllLeaves;

            const mockFile = { path: 'fallback.md', basename: 'fallback' } as TFile;
            const mockLeaf = {
                view: {
                    getViewType: () => 'markdown',
                    file: mockFile
                }
            } as any;

            mockWorkspace.getLeavesOfType.mockReturnValue([mockLeaf]);

            const result = getAllOpenMarkdownFiles(mockApp);
            expect(result).toEqual([mockFile]);
        });

        it('should deduplicate files', () => {
            const mockFile = { path: 'duplicate.md', basename: 'duplicate' } as TFile;
            const mockLeaf1 = {
                view: {
                    getViewType: () => 'markdown',
                    file: mockFile
                }
            } as any;
            const mockLeaf2 = {
                view: {
                    getViewType: () => 'markdown',
                    file: mockFile // same file
                }
            } as any;

            mockWorkspace.iterateAllLeaves.mockImplementation((callback: Function) => {
                callback(mockLeaf1);
                callback(mockLeaf2);
            });

            const result = getAllOpenMarkdownFiles(mockApp);
            expect(result).toEqual([mockFile]);
            expect(result.length).toBe(1);
        });

        it('should skip non-markdown leaves', () => {
            const mockLeaf = {
                view: {
                    getViewType: () => 'preview', // not markdown
                    file: { path: 'preview.md', basename: 'preview' } as TFile
                }
            } as any;

            mockWorkspace.iterateAllLeaves.mockImplementation((callback: Function) => {
                callback(mockLeaf);
            });

            const result = getAllOpenMarkdownFiles(mockApp);
            expect(result).toEqual([]);
        });
    });
});