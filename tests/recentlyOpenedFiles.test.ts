import { App, TFile } from 'obsidian';
import { RecentlyOpenedFilesManager, getRecentlyOpenedFiles } from '../src/utils/recently-opened-files';

// Mock the logger
jest.mock('../src/utils/logger', () => ({
    debugLog: jest.fn()
}));

describe('RecentlyOpenedFilesManager', () => {
    let mockApp: Partial<App>;
    let mockVault: any;
    let mockWorkspace: any;
    let mockAdapter: any;

    beforeEach(() => {
        mockAdapter = {
            exists: jest.fn(),
            read: jest.fn(),
            write: jest.fn()
        };

        mockVault = {
            adapter: mockAdapter,
            configDir: '.obsidian'
        };

        mockWorkspace = {
            on: jest.fn().mockReturnValue({ unsubscribe: jest.fn() }),
            offref: jest.fn()
        };

        mockApp = {
            vault: mockVault,
            workspace: mockWorkspace
        } as Partial<App>;
    });

    afterEach(() => {
        // Reset singleton instance
        (RecentlyOpenedFilesManager as any).instance = null;
    });

    test('should create singleton instance', () => {
        const manager1 = RecentlyOpenedFilesManager.getInstance(mockApp as App);
        const manager2 = RecentlyOpenedFilesManager.getInstance();
        
        expect(manager1).toBe(manager2);
    });

    test('should setup file listener on creation', () => {
        RecentlyOpenedFilesManager.getInstance(mockApp as App);
        
        expect(mockWorkspace.on).toHaveBeenCalledWith('file-open', expect.any(Function));
    });

    test('should return empty array when no files exist', async () => {
        mockAdapter.exists.mockResolvedValue(false);
        
        const manager = RecentlyOpenedFilesManager.getInstance(mockApp as App);
        const files = await manager.getRecentlyOpenedFiles();
        
        expect(files).toEqual([]);
    });

    test('should return files from own storage when plugin data not available', async () => {
        const testData = {
            recentFiles: [
                { path: 'test1.md', basename: 'test1' },
                { path: 'test2.md', basename: 'test2' }
            ],
            omittedPaths: [],
            omittedTags: [],
            updateOn: 'file-open',
            omitBookmarks: false,
            maxLength: null
        };

        mockAdapter.exists.mockResolvedValue(true);
        mockAdapter.read.mockResolvedValue(JSON.stringify(testData));
        
        const manager = RecentlyOpenedFilesManager.getInstance(mockApp as App);
        const files = await manager.getRecentlyOpenedFiles();
        
        expect(files).toEqual(testData.recentFiles);
    });

    test('should cleanup resources on destroy', () => {
        const manager = RecentlyOpenedFilesManager.getInstance(mockApp as App);
        const mockEventRef = { unsubscribe: jest.fn() };
        
        // Simulate that workspace.on returned an event reference
        mockWorkspace.on.mockReturnValue(mockEventRef);
        
        manager.destroy();
        
        expect(mockWorkspace.offref).toHaveBeenCalled();
    });

    test('getRecentlyOpenedFiles function should work with app parameter', async () => {
        mockAdapter.exists.mockResolvedValue(false);
        
        const files = await getRecentlyOpenedFiles(mockApp as App);
        
        expect(files).toEqual([]);
    });

    test('should handle JSON parsing errors gracefully', async () => {
        mockAdapter.exists.mockResolvedValue(true);
        mockAdapter.read.mockResolvedValue('invalid json');
        
        const manager = RecentlyOpenedFilesManager.getInstance(mockApp as App);
        const files = await manager.getRecentlyOpenedFiles();
        
        expect(files).toEqual([]);
    });

    test('should validate data structure before using', async () => {
        const invalidData = {
            recentFiles: 'not an array', // Invalid structure
            omittedPaths: [],
            omittedTags: [],
            updateOn: 'file-open',
            omitBookmarks: false,
            maxLength: null
        };

        mockAdapter.exists.mockResolvedValue(true);
        mockAdapter.read.mockResolvedValue(JSON.stringify(invalidData));
        
        const manager = RecentlyOpenedFilesManager.getInstance(mockApp as App);
        const files = await manager.getRecentlyOpenedFiles();
        
        expect(files).toEqual([]);
    });
});
