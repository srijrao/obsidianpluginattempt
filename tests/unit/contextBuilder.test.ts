/**
 * @file contextBuilder.test.ts
 * @description Unit tests for context building functionality including referenceAllOpenNotes
 */

import { App, TFile, WorkspaceLeaf } from 'obsidian';
import { buildContextMessages } from '../../src/utils/contextBuilder';
import MyPlugin from '../../src/main';
import { DEFAULT_SETTINGS } from '../../src/types/settings';

// Mock the noteUtils module
jest.mock('../../src/utils/noteUtils', () => ({
    processObsidianLinks: jest.fn().mockResolvedValue({
        content: 'processed content',
        resolved: [],
        unresolved: []
    }),
    processContextNotes: jest.fn().mockResolvedValue({
        content: 'context notes content',
        resolved: [],
        unresolved: []
    })
}));

describe('contextBuilder', () => {
    let mockApp: any;
    let mockPlugin: any;
    let mockVault: any;
    let mockWorkspace: any;

    beforeEach(() => {
        // Create mock vault
        mockVault = {
            cachedRead: jest.fn().mockResolvedValue('mock note content'),
            getMarkdownFiles: jest.fn().mockReturnValue([])
        };

        // Create mock workspace
        mockWorkspace = {
            getActiveFile: jest.fn().mockReturnValue(null),
            getLeavesOfType: jest.fn().mockReturnValue([])
        };

        // Create mock app
        mockApp = {
            vault: mockVault,
            workspace: mockWorkspace
        } as any;

        // Create mock plugin with settings
        mockPlugin = {
            settings: {
                ...DEFAULT_SETTINGS,
                referenceCurrentNote: false,
                referenceAllOpenNotes: false,
                enableContextNotes: false,
                enableObsidianLinks: false,
                expandLinkedNotesRecursively: false,
                includeRecentlyOpenedNotes: false,
                systemMessage: 'Test system message',
                debugMode: false
            },
            debugLog: jest.fn()
        } as any;
    });

    describe('referenceAllOpenNotes', () => {
        it('should not include open notes when referenceAllOpenNotes is false', async () => {
            mockPlugin.settings.referenceAllOpenNotes = false;
            
            const result = await buildContextMessages({
                app: mockApp,
                plugin: mockPlugin,
                includeCurrentNote: true,
                includeContextNotes: false,
                forceNoCurrentNote: false,
                debug: false
            });

            expect(result.messages.length).toBe(1); // Only system message
            expect(mockWorkspace.getLeavesOfType).not.toHaveBeenCalled();
        });

        it('should include all open notes when referenceAllOpenNotes is true', async () => {
            mockPlugin.settings.referenceAllOpenNotes = true;

            // Mock open notes
            const mockFile1 = { path: 'note1.md', basename: 'note1' } as TFile;
            const mockFile2 = { path: 'note2.md', basename: 'note2' } as TFile;
            
            const mockLeaf1 = {
                view: { file: mockFile1 }
            } as any;
            
            const mockLeaf2 = {
                view: { file: mockFile2 }
            } as any;

            mockWorkspace.getLeavesOfType.mockReturnValue([mockLeaf1, mockLeaf2]);
            mockVault.cachedRead.mockResolvedValue('open note content');

            const result = await buildContextMessages({
                app: mockApp,
                plugin: mockPlugin,
                includeCurrentNote: false,
                includeContextNotes: false,
                forceNoCurrentNote: false,
                debug: false
            });

            // Should have system message + 2 open notes
            expect(result.messages.length).toBe(3);
            expect(mockWorkspace.getLeavesOfType).toHaveBeenCalledWith('markdown');
            expect(mockVault.cachedRead).toHaveBeenCalledWith(mockFile1);
            expect(mockVault.cachedRead).toHaveBeenCalledWith(mockFile2);
            
            // Check message content includes open notes
            expect(result.messages[1].content).toContain('note1.md');
            expect(result.messages[2].content).toContain('note2.md');
        });

        it('should deduplicate current note when both referenceCurrentNote and referenceAllOpenNotes are enabled', async () => {
            mockPlugin.settings.referenceCurrentNote = true;
            mockPlugin.settings.referenceAllOpenNotes = true;

            const currentFile = { path: 'current.md', basename: 'current' } as TFile;
            mockWorkspace.getActiveFile.mockReturnValue(currentFile);

            // Mock open notes including the current note
            const mockLeaf1 = {
                view: { file: currentFile }
            } as any;
            
            const mockLeaf2 = {
                view: { file: { path: 'other.md', basename: 'other' } as TFile }
            } as any;

            mockWorkspace.getLeavesOfType.mockReturnValue([mockLeaf1, mockLeaf2]);
            mockVault.cachedRead.mockResolvedValue('note content');

            const result = await buildContextMessages({
                app: mockApp,
                plugin: mockPlugin,
                includeCurrentNote: true,
                includeContextNotes: false,
                forceNoCurrentNote: false,
                debug: false
            });

            // Should have system message + current note + 1 other open note (not 3)
            expect(result.messages.length).toBe(3);
            
            // Current note should be read once
            expect(mockVault.cachedRead).toHaveBeenCalledWith(currentFile);
            expect(mockVault.cachedRead).toHaveBeenCalledTimes(2); // current + other, not current twice
        });

        it('should skip notes with null or undefined file paths', async () => {
            mockPlugin.settings.referenceAllOpenNotes = true;

            const mockLeaf1 = { view: { file: null } } as any;
            const mockLeaf2 = { view: { file: { path: 'valid.md', basename: 'valid' } as TFile } } as any;
            const mockLeaf3 = { view: null } as any;

            mockWorkspace.getLeavesOfType.mockReturnValue([mockLeaf1, mockLeaf2, mockLeaf3]);
            mockVault.cachedRead.mockResolvedValue('valid content');

            const result = await buildContextMessages({
                app: mockApp,
                plugin: mockPlugin,
                includeCurrentNote: false,
                includeContextNotes: false,
                forceNoCurrentNote: false,
                debug: false
            });

            // Should have system message + 1 valid note
            expect(result.messages.length).toBe(2);
            expect(mockVault.cachedRead).toHaveBeenCalledTimes(1);
        });

        it('should process links in open notes when expandLinkedNotesRecursively is enabled', async () => {
            const { processObsidianLinks } = require('../../src/utils/noteUtils');
            
            mockPlugin.settings.referenceAllOpenNotes = true;
            mockPlugin.settings.enableObsidianLinks = true;
            mockPlugin.settings.expandLinkedNotesRecursively = true;

            const mockFile = { path: 'note.md', basename: 'note' } as TFile;
            const mockLeaf = { view: { file: mockFile } } as any;

            mockWorkspace.getLeavesOfType.mockReturnValue([mockLeaf]);
            mockVault.cachedRead.mockResolvedValue('note with [[link]]');
            
            processObsidianLinks.mockResolvedValue({
                content: 'processed note with link content',
                resolved: ['linked-note.md'],
                unresolved: []
            });

            const result = await buildContextMessages({
                app: mockApp,
                plugin: mockPlugin,
                includeCurrentNote: false,
                includeContextNotes: false,
                forceNoCurrentNote: false,
                debug: false
            });

            expect(processObsidianLinks).toHaveBeenCalled();
            expect(result.resolved).toContain('linked-note.md');
        });

        it('should return resolved and unresolved note lists', async () => {
            const { processObsidianLinks } = require('../../src/utils/noteUtils');
            
            mockPlugin.settings.referenceAllOpenNotes = true;
            mockPlugin.settings.enableObsidianLinks = true;
            mockPlugin.settings.expandLinkedNotesRecursively = true;

            const mockFile = { path: 'note.md', basename: 'note' } as TFile;
            const mockLeaf = { view: { file: mockFile } } as any;

            mockWorkspace.getLeavesOfType.mockReturnValue([mockLeaf]);
            mockVault.cachedRead.mockResolvedValue('note content');
            
            processObsidianLinks.mockResolvedValue({
                content: 'processed content',
                resolved: ['resolved-note.md'],
                unresolved: ['missing-note.md']
            });

            const result = await buildContextMessages({
                app: mockApp,
                plugin: mockPlugin,
                includeCurrentNote: false,
                includeContextNotes: false,
                forceNoCurrentNote: false,
                debug: false
            });

            expect(result.resolved).toEqual(['resolved-note.md']);
            expect(result.unresolved).toEqual(['missing-note.md']);
        });

        it('should handle empty open notes list', async () => {
            mockPlugin.settings.referenceAllOpenNotes = true;
            mockWorkspace.getLeavesOfType.mockReturnValue([]);

            const result = await buildContextMessages({
                app: mockApp,
                plugin: mockPlugin,
                includeCurrentNote: false,
                includeContextNotes: false,
                forceNoCurrentNote: false,
                debug: false
            });

            // Should only have system message
            expect(result.messages.length).toBe(1);
            expect(mockVault.cachedRead).not.toHaveBeenCalled();
        });

        it('should work together with referenceCurrentNote', async () => {
            mockPlugin.settings.referenceCurrentNote = true;
            mockPlugin.settings.referenceAllOpenNotes = true;

            const currentFile = { path: 'current.md', basename: 'current' } as TFile;
            const otherFile1 = { path: 'other1.md', basename: 'other1' } as TFile;
            const otherFile2 = { path: 'other2.md', basename: 'other2' } as TFile;

            mockWorkspace.getActiveFile.mockReturnValue(currentFile);
            mockWorkspace.getLeavesOfType.mockReturnValue([
                { view: { file: otherFile1 } },
                { view: { file: otherFile2 } }
            ]);

            mockVault.cachedRead.mockResolvedValue('note content');

            const result = await buildContextMessages({
                app: mockApp,
                plugin: mockPlugin,
                includeCurrentNote: true,
                includeContextNotes: false,
                forceNoCurrentNote: false,
                debug: false
            });

            // Should have system message + current note + 2 other open notes
            expect(result.messages.length).toBe(4);
            expect(mockVault.cachedRead).toHaveBeenCalledWith(currentFile);
            expect(mockVault.cachedRead).toHaveBeenCalledWith(otherFile1);
            expect(mockVault.cachedRead).toHaveBeenCalledWith(otherFile2);
        });
    });

    describe('referenceCurrentNote', () => {
        it('should include current note when enabled', async () => {
            mockPlugin.settings.referenceCurrentNote = true;
            const currentFile = { path: 'current.md', basename: 'current' } as TFile;
            mockWorkspace.getActiveFile.mockReturnValue(currentFile);
            mockVault.cachedRead.mockResolvedValue('current note content');

            const result = await buildContextMessages({
                app: mockApp,
                plugin: mockPlugin,
                includeCurrentNote: true,
                includeContextNotes: false,
                forceNoCurrentNote: false,
                debug: false
            });

            expect(result.messages.length).toBe(2); // System message + current note
            expect(mockVault.cachedRead).toHaveBeenCalledWith(currentFile);
            expect(result.messages[1].content).toContain('current.md');
        });

        it('should not include current note when disabled', async () => {
            mockPlugin.settings.referenceCurrentNote = false;
            const currentFile = { path: 'current.md', basename: 'current' } as TFile;
            mockWorkspace.getActiveFile.mockReturnValue(currentFile);

            const result = await buildContextMessages({
                app: mockApp,
                plugin: mockPlugin,
                includeCurrentNote: true,
                includeContextNotes: false,
                forceNoCurrentNote: false,
                debug: false
            });

            expect(result.messages.length).toBe(1); // Only system message
            expect(mockVault.cachedRead).not.toHaveBeenCalled();
        });
    });
});
