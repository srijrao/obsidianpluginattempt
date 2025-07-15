/**
 * @file embeddingFolderFilter.test.ts
 * @description Jest test suite for embedding folder filtering functionality
 */

import { 
    matchesPattern, 
    matchesAnyRule, 
    filterFilesForEmbedding, 
    getFilterDescription,
    validateFilterRule,
    normalizeFolderPath
} from '../src/utils/embeddingFilterUtils';
import { EmbeddingFolderFilter, FolderFilterRule } from '../src/types/settings';

// Mock TFile for testing
interface MockTFile {
    path: string;
    name: string;
}

const createMockFile = (path: string): MockTFile => ({
    path,
    name: path.split('/').pop() || ''
});

describe('Embedding Folder Filter Utils', () => {
    describe('matchesPattern', () => {
        test('should match exact paths', () => {
            expect(matchesPattern('Notes/file.md', 'Notes/file.md')).toBe(true);
            expect(matchesPattern('Notes/file.md', 'Other/file.md')).toBe(false);
        });

        test('should match with single wildcard (*)', () => {
            expect(matchesPattern('Notes/*', 'Notes/file.md')).toBe(true);
            expect(matchesPattern('Notes/*', 'Notes/subfolder/file.md')).toBe(false);
            expect(matchesPattern('*.md', 'file.md')).toBe(true);
            expect(matchesPattern('Notes/*.md', 'Notes/test.md')).toBe(true);
        });

        test('should match with recursive wildcard (**)', () => {
            expect(matchesPattern('Notes/**', 'Notes/file.md')).toBe(true);
            expect(matchesPattern('Notes/**', 'Notes/subfolder/file.md')).toBe(true);
            expect(matchesPattern('Notes/**', 'Notes/deep/nested/file.md')).toBe(true);
            expect(matchesPattern('**/Templates/**', 'Projects/Templates/note.md')).toBe(true);
            expect(matchesPattern('**/Templates/**', 'Templates/subfolder/note.md')).toBe(true);
        });

        test('should handle windows-style paths', () => {
            expect(matchesPattern('Notes\\**', 'Notes/subfolder/file.md')).toBe(true);
            expect(matchesPattern('Notes/**', 'Notes\\subfolder\\file.md')).toBe(true);
        });

        test('should handle edge cases', () => {
            expect(matchesPattern('', '')).toBe(true);
            expect(matchesPattern('*', 'anything')).toBe(true);
            expect(matchesPattern('**', 'deep/nested/path')).toBe(true);
        });
    });

    describe('matchesAnyRule', () => {
        const recursiveRule: FolderFilterRule = {
            path: 'Notes',
            recursive: true
        };

        const nonRecursiveRule: FolderFilterRule = {
            path: 'Templates',
            recursive: false
        };

        const wildcardRule: FolderFilterRule = {
            path: '**/Archive',
            recursive: true
        };

        test('should match recursive rules', () => {
            expect(matchesAnyRule('Notes/file.md', [recursiveRule])).toBe(true);
            expect(matchesAnyRule('Notes/subfolder/file.md', [recursiveRule])).toBe(true);
            expect(matchesAnyRule('Other/file.md', [recursiveRule])).toBe(false);
        });

        test('should match non-recursive rules', () => {
            expect(matchesAnyRule('Templates/file.md', [nonRecursiveRule])).toBe(true);
            expect(matchesAnyRule('Templates/subfolder/file.md', [nonRecursiveRule])).toBe(false);
            expect(matchesAnyRule('Other/file.md', [nonRecursiveRule])).toBe(false);
        });

        test('should match wildcard rules', () => {
            expect(matchesAnyRule('Project/Archive/file.md', [wildcardRule])).toBe(true);
            expect(matchesAnyRule('Archive/file.md', [wildcardRule])).toBe(true);
            expect(matchesAnyRule('Deep/Nested/Archive/file.md', [wildcardRule])).toBe(true);
            expect(matchesAnyRule('Archive-Old/file.md', [wildcardRule])).toBe(false);
        });

        test('should handle multiple rules', () => {
            const rules = [recursiveRule, nonRecursiveRule, wildcardRule];
            expect(matchesAnyRule('Notes/file.md', rules)).toBe(true);
            expect(matchesAnyRule('Templates/file.md', rules)).toBe(true);
            expect(matchesAnyRule('Project/Archive/file.md', rules)).toBe(true);
            expect(matchesAnyRule('Random/file.md', rules)).toBe(false);
        });

        test('should handle empty rules', () => {
            expect(matchesAnyRule('any/path.md', [])).toBe(false);
            expect(matchesAnyRule('any/path.md', undefined as any)).toBe(false);
        });
    });

    describe('filterFilesForEmbedding', () => {
        const mockFiles = [
            createMockFile('Notes/personal.md'),
            createMockFile('Notes/work/project.md'),
            createMockFile('Templates/daily.md'),
            createMockFile('Templates/meeting.md'),
            createMockFile('Archive/old-notes.md'),
            createMockFile('Archive/backup/ancient.md'),
            createMockFile('Projects/current/status.md'),
            createMockFile('Projects/Archive/completed.md'),
            createMockFile('root-note.md')
        ] as any[];

        test('should return all files when filtering is off', () => {
            const filter: EmbeddingFolderFilter = { mode: 'off', rules: [] };
            const result = filterFilesForEmbedding(mockFiles, filter);
            expect(result).toHaveLength(mockFiles.length);
            expect(result).toEqual(mockFiles);
        });

        test('should return all files when no rules are provided', () => {
            const filter: EmbeddingFolderFilter = { mode: 'include', rules: [] };
            const result = filterFilesForEmbedding(mockFiles, filter);
            expect(result).toHaveLength(mockFiles.length);
        });

        test('should filter with include mode (whitelist)', () => {
            const filter: EmbeddingFolderFilter = {
                mode: 'include',
                rules: [
                    { path: 'Notes', recursive: true },
                    { path: 'Templates', recursive: false }
                ]
            };

            const result = filterFilesForEmbedding(mockFiles, filter);
            const resultPaths = result.map(f => f.path);
            
            expect(resultPaths).toContain('Notes/personal.md');
            expect(resultPaths).toContain('Notes/work/project.md');
            expect(resultPaths).toContain('Templates/daily.md');
            expect(resultPaths).toContain('Templates/meeting.md');
            expect(resultPaths).not.toContain('Archive/old-notes.md');
            expect(resultPaths).not.toContain('Projects/current/status.md');
            expect(resultPaths).not.toContain('root-note.md');
        });

        test('should filter with exclude mode (blacklist)', () => {
            const filter: EmbeddingFolderFilter = {
                mode: 'exclude',
                rules: [
                    { path: '**/Archive', recursive: true },
                    { path: 'Templates', recursive: false }
                ]
            };

            const result = filterFilesForEmbedding(mockFiles, filter);
            const resultPaths = result.map(f => f.path);
            
            expect(resultPaths).toContain('Notes/personal.md');
            expect(resultPaths).toContain('Notes/work/project.md');
            expect(resultPaths).toContain('Projects/current/status.md');
            expect(resultPaths).toContain('root-note.md');
            expect(resultPaths).not.toContain('Templates/daily.md');
            expect(resultPaths).not.toContain('Archive/old-notes.md');
            expect(resultPaths).not.toContain('Archive/backup/ancient.md');
            expect(resultPaths).not.toContain('Projects/Archive/completed.md');
        });

        test('should handle complex wildcard patterns', () => {
            const filter: EmbeddingFolderFilter = {
                mode: 'include',
                rules: [
                    { path: '**/work/**', recursive: true },
                    { path: 'Projects/current', recursive: false } // Changed to be more specific
                ]
            };

            const result = filterFilesForEmbedding(mockFiles, filter);
            const resultPaths = result.map(f => f.path);
            
            expect(resultPaths).toContain('Notes/work/project.md');
            expect(resultPaths).toContain('Projects/current/status.md');
            expect(resultPaths).not.toContain('Notes/personal.md');
            expect(resultPaths).not.toContain('Projects/Archive/completed.md'); // Not in current folder
        });
    });

    describe('getFilterDescription', () => {
        test('should describe no filtering', () => {
            const filter: EmbeddingFolderFilter = { mode: 'off', rules: [] };
            expect(getFilterDescription(filter)).toBe('No filtering (all files will be embedded)');
        });

        test('should describe include mode', () => {
            const filter: EmbeddingFolderFilter = {
                mode: 'include',
                rules: [
                    { path: 'Notes', recursive: true },
                    { path: 'Templates', recursive: false }
                ]
            };
            expect(getFilterDescription(filter)).toBe('Active filtering: including only files from 2 folder rules');
        });

        test('should describe exclude mode', () => {
            const filter: EmbeddingFolderFilter = {
                mode: 'exclude',
                rules: [{ path: 'Archive', recursive: true }]
            };
            expect(getFilterDescription(filter)).toBe('Active filtering: excluding files from 1 folder rule');
        });

        test('should handle empty rules', () => {
            const filter: EmbeddingFolderFilter = { mode: 'include', rules: [] };
            expect(getFilterDescription(filter)).toBe('No filtering (all files will be embedded)');
        });
    });

    describe('validateFilterRule', () => {
        test('should validate correct rules', () => {
            const validRule: FolderFilterRule = {
                path: 'Notes/**',
                recursive: true,
                description: 'All notes'
            };
            expect(validateFilterRule(validRule)).toEqual([]);
        });

        test('should catch empty path', () => {
            const invalidRule: FolderFilterRule = {
                path: '',
                recursive: true
            };
            const errors = validateFilterRule(invalidRule);
            expect(errors).toContain('Path cannot be empty');
        });

        test('should catch invalid double slashes', () => {
            const invalidRule: FolderFilterRule = {
                path: 'Notes//subfolder',
                recursive: true
            };
            const errors = validateFilterRule(invalidRule);
            expect(errors).toContain('Path contains invalid double slashes');
        });

        test('should catch windows-style double backslashes', () => {
            const invalidRule: FolderFilterRule = {
                path: 'Notes\\\\subfolder',
                recursive: true
            };
            const errors = validateFilterRule(invalidRule);
            expect(errors).toContain('Path contains invalid double slashes');
        });
    });

    describe('normalizeFolderPath', () => {
        test('should normalize various path formats', () => {
            expect(normalizeFolderPath('/Notes/subfolder/')).toBe('Notes/subfolder');
            expect(normalizeFolderPath('Notes\\subfolder\\')).toBe('Notes/subfolder');
            expect(normalizeFolderPath('Notes//double//slash')).toBe('Notes/double/slash');
            expect(normalizeFolderPath('')).toBe('');
            expect(normalizeFolderPath('/')).toBe('');
            expect(normalizeFolderPath('simple')).toBe('simple');
        });
    });

    describe('Real-world scenarios', () => {
        const realWorldFiles = [
            'Daily Notes/2024-01-01.md',
            'Daily Notes/2024-01-02.md', 
            'Projects/AI Assistant/notes.md',
            'Projects/AI Assistant/Archive/old-version.md',
            'Projects/Website/planning.md',
            'Templates/Daily Note Template.md',
            'Templates/Meeting Template.md',
            'Archive/2023/old-daily-notes.md',
            'Archive/2023/projects/legacy.md',
            'Inbox/quick-note.md',
            'Resources/Links.md',
            'Resources/Books/fiction.md',
            'Resources/Books/technical.md'
        ].map(createMockFile) as any[];

        test('should exclude archive and templates scenario', () => {
            const filter: EmbeddingFolderFilter = {
                mode: 'exclude',
                rules: [
                    { path: 'Archive', recursive: true },
                    { path: 'Templates', recursive: true },
                    { path: '**/Archive', recursive: true }
                ]
            };

            const result = filterFilesForEmbedding(realWorldFiles, filter);
            const resultPaths = result.map(f => f.path);
            
            // Should include
            expect(resultPaths).toContain('Daily Notes/2024-01-01.md');
            expect(resultPaths).toContain('Projects/AI Assistant/notes.md');
            expect(resultPaths).toContain('Projects/Website/planning.md');
            expect(resultPaths).toContain('Inbox/quick-note.md');
            expect(resultPaths).toContain('Resources/Links.md');
            
            // Should exclude
            expect(resultPaths).not.toContain('Templates/Daily Note Template.md');
            expect(resultPaths).not.toContain('Archive/2023/old-daily-notes.md');
            expect(resultPaths).not.toContain('Projects/AI Assistant/Archive/old-version.md');
        });

        test('should include only current projects scenario', () => {
            const filter: EmbeddingFolderFilter = {
                mode: 'include',
                rules: [
                    { path: 'Daily Notes', recursive: true },
                    { path: 'Projects/*/notes.md', recursive: false },
                    { path: 'Projects/*/planning.md', recursive: false },
                    { path: 'Inbox', recursive: true }
                ]
            };

            const result = filterFilesForEmbedding(realWorldFiles, filter);
            const resultPaths = result.map(f => f.path);
            
            // Should include
            expect(resultPaths).toContain('Daily Notes/2024-01-01.md');
            expect(resultPaths).toContain('Daily Notes/2024-01-02.md');
            expect(resultPaths).toContain('Inbox/quick-note.md');
            
            // Should exclude
            expect(resultPaths).not.toContain('Templates/Daily Note Template.md');
            expect(resultPaths).not.toContain('Archive/2023/old-daily-notes.md');
            expect(resultPaths).not.toContain('Resources/Links.md');
        });

        test('should include specific resource types scenario', () => {
            const filter: EmbeddingFolderFilter = {
                mode: 'include',
                rules: [
                    { path: 'Resources/Books', recursive: true },
                    { path: 'Daily Notes', recursive: true }
                ]
            };

            const result = filterFilesForEmbedding(realWorldFiles, filter);
            const resultPaths = result.map(f => f.path);
            
            expect(resultPaths).toContain('Resources/Books/fiction.md');
            expect(resultPaths).toContain('Resources/Books/technical.md');
            expect(resultPaths).toContain('Daily Notes/2024-01-01.md');
            expect(resultPaths).not.toContain('Resources/Links.md');
            expect(resultPaths).not.toContain('Projects/AI Assistant/notes.md');
        });
    });

    describe('Edge cases and error handling', () => {
        test('should handle undefined filter settings', () => {
            const files = [createMockFile('test.md')] as any[];
            const result = filterFilesForEmbedding(files, undefined as any);
            expect(result).toEqual(files);
        });

        test('should handle empty file array', () => {
            const filter: EmbeddingFolderFilter = {
                mode: 'include',
                rules: [{ path: 'Notes', recursive: true }]
            };
            const result = filterFilesForEmbedding([], filter);
            expect(result).toEqual([]);
        });

        test('should handle malformed patterns gracefully', () => {
            // This tests that invalid regex patterns don't crash the function
            const badPattern = '[invalid-regex-[';
            expect(() => matchesPattern(badPattern, 'test.md')).not.toThrow();
            expect(matchesPattern(badPattern, 'test.md')).toBe(false);
        });
    });
});
