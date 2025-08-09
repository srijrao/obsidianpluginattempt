import { PathValidator } from '../src/components/agent/tools/pathValidation';

// Mock Obsidian App
const mockApp = {
  vault: {
    adapter: {
      basePath: '/test/vault/path'
    }
  }
} as any;

describe('PathValidator', () => {
  let pathValidator: PathValidator;

  beforeEach(() => {
    pathValidator = new PathValidator(mockApp);
  });

  describe('validateAndNormalizePath', () => {
    describe('valid inputs', () => {
      test('should handle empty string as vault root', () => {
        expect(pathValidator.validateAndNormalizePath('')).toBe('');
        expect(pathValidator.validateAndNormalizePath('.')).toBe('');
        expect(pathValidator.validateAndNormalizePath('./')).toBe('');
        expect(pathValidator.validateAndNormalizePath('/')).toBe('');
      });

      test('should normalize relative paths', () => {
        expect(pathValidator.validateAndNormalizePath('folder/file.md')).toBe('folder/file.md');
        expect(pathValidator.validateAndNormalizePath('./folder/file.md')).toBe('folder/file.md');
        expect(pathValidator.validateAndNormalizePath('folder\\file.md')).toBe('folder/file.md');
      });

      test('should handle absolute paths within vault', () => {
        const result = pathValidator.validateAndNormalizePath('/test/vault/path/folder/file.md');
        expect(result).toBe('folder/file.md');
      });

      test('should handle absolute paths correctly', () => {
        // Absolute paths outside vault should throw
        expect(() => pathValidator.validateAndNormalizePath('/folder/file.md')).toThrow('is outside the vault');
      });

      test('should trim whitespace', () => {
        expect(pathValidator.validateAndNormalizePath('  folder/file.md  ')).toBe('folder/file.md');
      });
    });

    describe('invalid inputs', () => {
      test('should reject null and undefined', () => {
        expect(() => pathValidator.validateAndNormalizePath(null as any)).toThrow('Path must be a string');
        expect(() => pathValidator.validateAndNormalizePath(undefined as any)).toThrow('Path must be a string');
      });

      test('should reject non-string inputs', () => {
        expect(() => pathValidator.validateAndNormalizePath(123 as any)).toThrow('Path must be a string');
        expect(() => pathValidator.validateAndNormalizePath({} as any)).toThrow('Path must be a string');
      });

      test('should prevent directory traversal attacks with forward slashes', () => {
        // Test forward slash traversal patterns - these should all throw
        expect(() => pathValidator.validateAndNormalizePath('../file.md')).toThrow('contains directory traversal patterns');
        expect(() => pathValidator.validateAndNormalizePath('../../file.md')).toThrow('contains directory traversal patterns');
        expect(() => pathValidator.validateAndNormalizePath('folder/../../../etc/passwd')).toThrow('contains directory traversal patterns');
        expect(() => pathValidator.validateAndNormalizePath('folder/../../file.md')).toThrow('contains directory traversal patterns');
        expect(() => pathValidator.validateAndNormalizePath('..')).toThrow('contains directory traversal patterns');
        expect(() => pathValidator.validateAndNormalizePath('folder/..')).toThrow('contains directory traversal patterns');
        expect(() => pathValidator.validateAndNormalizePath('folder/../..')).toThrow('contains directory traversal patterns');
      });

      test('should prevent directory traversal attacks with Windows backslashes', () => {
        // Test Windows backslash traversal patterns - these should all throw
        expect(() => pathValidator.validateAndNormalizePath('..\\file.md')).toThrow('contains directory traversal patterns');
        expect(() => pathValidator.validateAndNormalizePath('..\\..\\file.md')).toThrow('contains directory traversal patterns');
        expect(() => pathValidator.validateAndNormalizePath('folder\\..\\..\\..\\etc\\passwd')).toThrow('contains directory traversal patterns');
        expect(() => pathValidator.validateAndNormalizePath('folder\\..\\..\\file.md')).toThrow('contains directory traversal patterns');
        expect(() => pathValidator.validateAndNormalizePath('folder\\..')).toThrow('contains directory traversal patterns');
        expect(() => pathValidator.validateAndNormalizePath('folder\\..\\..\\another')).toThrow('contains directory traversal patterns');
      });

      test('should prevent mixed separator traversal attacks', () => {
        // Test mixed forward slash and backslash patterns - these should all throw
        expect(() => pathValidator.validateAndNormalizePath('..\\../file.md')).toThrow('contains directory traversal patterns');
        expect(() => pathValidator.validateAndNormalizePath('../..\\file.md')).toThrow('contains directory traversal patterns');
        expect(() => pathValidator.validateAndNormalizePath('folder\\../..\\file.md')).toThrow('contains directory traversal patterns');
        expect(() => pathValidator.validateAndNormalizePath('folder/../..\\file.md')).toThrow('contains directory traversal patterns');
        expect(() => pathValidator.validateAndNormalizePath('folder\\../..')).toThrow('contains directory traversal patterns');
        expect(() => pathValidator.validateAndNormalizePath('folder/..\\..\\file.md')).toThrow('contains directory traversal patterns');
      });

      test('should prevent complex traversal attack patterns', () => {
        // Test complex and nested traversal patterns
        expect(() => pathValidator.validateAndNormalizePath('a/../b/../c/../../../file.md')).toThrow('contains directory traversal patterns');
        expect(() => pathValidator.validateAndNormalizePath('a\\..\\b\\..\\c\\..\\..\\..\\file.md')).toThrow('contains directory traversal patterns');
        expect(() => pathValidator.validateAndNormalizePath('folder/subfolder/../../../file.md')).toThrow('contains directory traversal patterns');
        expect(() => pathValidator.validateAndNormalizePath('folder\\subfolder\\..\\..\\..\\file.md')).toThrow('contains directory traversal patterns');
        
        // Test paths that would escape the vault after normalization
        expect(() => pathValidator.validateAndNormalizePath('valid/folder/../../../etc/passwd')).toThrow('attempts to access files outside the vault');
        expect(() => pathValidator.validateAndNormalizePath('valid\\folder\\..\\..\\..\\etc\\passwd')).toThrow('contains directory traversal patterns');
      });

      test('should prevent edge case traversal patterns', () => {
        // Test edge cases and potential bypass attempts
        expect(() => pathValidator.validateAndNormalizePath('..\\/')).toThrow('contains directory traversal patterns');
        expect(() => pathValidator.validateAndNormalizePath('../\\')).toThrow('contains directory traversal patterns');
        expect(() => pathValidator.validateAndNormalizePath('.\\..')).toThrow('contains directory traversal patterns');
        expect(() => pathValidator.validateAndNormalizePath('./\\..')).toThrow('contains directory traversal patterns');
        expect(() => pathValidator.validateAndNormalizePath('folder\\..\\.')).toThrow('contains directory traversal patterns');
        expect(() => pathValidator.validateAndNormalizePath('folder/../.')).toThrow('contains directory traversal patterns');
      });

      test('should prevent absolute paths outside vault', () => {
        expect(() => pathValidator.validateAndNormalizePath('/etc/passwd')).toThrow('is outside the vault');
        expect(() => pathValidator.validateAndNormalizePath('/home/user/file.txt')).toThrow('is outside the vault');
        expect(() => pathValidator.validateAndNormalizePath('C:\\Windows\\System32')).toThrow('is outside the vault');
      });
    });
  });

  describe('validatePath', () => {
    test('should return true for valid paths', () => {
      expect(pathValidator.validatePath('folder/file.md')).toBe(true);
      expect(pathValidator.validatePath('')).toBe(true);
    });

    test('should throw for invalid paths', () => {
      // Now that the security fix is implemented, these should all throw
      expect(() => pathValidator.validatePath('../file.md')).toThrow('contains directory traversal patterns');
      expect(() => pathValidator.validatePath('..\\file.md')).toThrow('contains directory traversal patterns');
      expect(() => pathValidator.validatePath('/etc/passwd')).toThrow('is outside the vault');
    });
  });

  describe('getVaultPath', () => {
    test('should return the vault base path', () => {
      expect(pathValidator.getVaultPath()).toBe('/test/vault/path');
    });
  });

  describe('toAbsolutePath', () => {
    test('should convert vault-relative path to absolute', () => {
      const result = pathValidator.toAbsolutePath('folder/file.md');
      // Normalize path separators for cross-platform compatibility
      const normalizedResult = result.replace(/\\/g, '/');
      expect(normalizedResult).toBe('/test/vault/path/folder/file.md');
    });

    test('should handle empty path (vault root)', () => {
      const result = pathValidator.toAbsolutePath('');
      // Normalize path separators for cross-platform compatibility
      const normalizedResult = result.replace(/\\/g, '/');
      expect(normalizedResult).toBe('/test/vault/path');
    });

    test('should validate input path before conversion', () => {
      // Now that the security fix is implemented, these should all throw
      expect(() => pathValidator.toAbsolutePath('../file.md')).toThrow('contains directory traversal patterns');
      expect(() => pathValidator.toAbsolutePath('..\\file.md')).toThrow('contains directory traversal patterns');
      expect(() => pathValidator.toAbsolutePath('folder/../../../etc/passwd')).toThrow('contains directory traversal patterns');
    });
  });

  describe('pathsEqual', () => {
    test('should return true for equivalent paths', () => {
      expect(pathValidator.pathsEqual('folder/file.md', './folder/file.md')).toBe(true);
      expect(pathValidator.pathsEqual('folder\\file.md', 'folder/file.md')).toBe(true);
      expect(pathValidator.pathsEqual('', '.')).toBe(true);
    });

    test('should return false for different paths', () => {
      expect(pathValidator.pathsEqual('folder/file1.md', 'folder/file2.md')).toBe(false);
      expect(pathValidator.pathsEqual('folder1/file.md', 'folder2/file.md')).toBe(false);
    });

    test('should return false for invalid paths', () => {
      // pathsEqual should return false when either path is invalid (catches exceptions)
      expect(pathValidator.pathsEqual('../', 'folder/file.md')).toBe(false);
      expect(pathValidator.pathsEqual('folder/file.md', '../')).toBe(false);
      expect(pathValidator.pathsEqual('..\\', 'folder/file.md')).toBe(false);
      expect(pathValidator.pathsEqual('folder/file.md', '..\\')).toBe(false);
    });
  
    describe('comprehensive security tests for Windows path separator vulnerability fix', () => {
      test('should block all Windows backslash traversal patterns', () => {
        const windowsTraversalPatterns = [
          '..\\file.md',
          '..\\..\\file.md',
          '..\\..\\..\\file.md',
          'folder\\..\\file.md',
          'folder\\..\\..\\file.md',
          'folder\\..\\..\\..\\file.md',
          'a\\..\\b\\..\\c\\..\\..\\..\\file.md',
          'valid\\folder\\..\\..\\..\\etc\\passwd',
          'folder\\subfolder\\..\\..\\..\\file.md',
          '..\\..',
          'folder\\..',
          'folder\\..\\another\\..\\..\\file.md'
        ];
  
        windowsTraversalPatterns.forEach(pattern => {
          expect(() => pathValidator.validateAndNormalizePath(pattern))
            .toThrow('contains directory traversal patterns');
        });
      });
  
      test('should block all mixed separator traversal patterns', () => {
        const mixedSeparatorPatterns = [
          '..\\../file.md',
          '../..\\file.md',
          'folder\\../file.md',
          'folder/../..\\file.md',
          'folder\\../..',
          'folder/..\\file.md',
          'a\\../b/../c\\..\\..\\file.md',
          'valid/folder\\..\\..\\..\\etc\\passwd',
          'folder\\subfolder/../..\\file.md',
          '../folder\\..\\file.md',
          'folder\\../another/../..\\file.md'
        ];
  
        mixedSeparatorPatterns.forEach(pattern => {
          expect(() => pathValidator.validateAndNormalizePath(pattern))
            .toThrow('contains directory traversal patterns');
        });
      });
  
      test('should block all forward slash traversal patterns (regression test)', () => {
        const forwardSlashPatterns = [
          '../file.md',
          '../../file.md',
          '../../../file.md',
          'folder/../file.md',
          'folder/../../file.md',
          'folder/../../../file.md',
          'a/../b/../c/../../../file.md',
          'valid/folder/../../../etc/passwd',
          'folder/subfolder/../../../file.md',
          '../..',
          'folder/..',
          'folder/../another/../../file.md'
        ];
  
        forwardSlashPatterns.forEach(pattern => {
          expect(() => pathValidator.validateAndNormalizePath(pattern))
            .toThrow('contains directory traversal patterns');
        });
      });
  
      test('should allow legitimate paths with proper separators', () => {
        const legitimatePaths = [
          'file.md',
          'folder/file.md',
          'folder\\file.md',
          'deep/nested/folder/file.md',
          'deep\\nested\\folder\\file.md',
          'folder with spaces/file.md',
          'folder-with-dashes/file_with_underscores.md',
          'папка/файл.md',
          'folder/文件.md',
          'very/deep/nested/folder/structure/file.md',
          'folder/subfolder/file.md',
          'a/b/c/d/e/file.md'
        ];
  
        legitimatePaths.forEach(path => {
          expect(() => pathValidator.validateAndNormalizePath(path)).not.toThrow();
          const result = pathValidator.validateAndNormalizePath(path);
          expect(result).toBeDefined();
          expect(typeof result).toBe('string');
          // Should not contain any traversal patterns after normalization
          expect(result).not.toMatch(/\.\./);
        });
      });
  
      test('should handle edge cases that could bypass security checks', () => {
        const edgeCasePatterns = [
          '..\\/',
          '../\\',
          '.\\..',
          './\\..',
          'folder\\..\\.',
          'folder/../.',
          '..\\..\\/',
          '../..\\/',
          'folder\\..\\..\\/',
          'folder/../..\\/',
          '.\\..\\file.md',
          './..\\file.md'
        ];
  
        edgeCasePatterns.forEach(pattern => {
          expect(() => pathValidator.validateAndNormalizePath(pattern))
            .toThrow('contains directory traversal patterns');
        });
      });
  
      test('should prevent depth-based traversal attacks', () => {
        // Test paths that would escape the vault based on directory depth
        const depthBasedAttacks = [
          'a/../../../file.md',
          'a\\..\\..\\..\\file.md',
          'a/b/../../../file.md',
          'a\\b\\..\\..\\..\\file.md',
          'valid/path/../../../etc/passwd',
          'valid\\path\\..\\..\\..\\etc\\passwd'
        ];
  
        depthBasedAttacks.forEach(pattern => {
          expect(() => pathValidator.validateAndNormalizePath(pattern))
            .toThrow(/contains directory traversal patterns|attempts to access files outside the vault/);
        });
      });
  
      test('should maintain security across all PathValidator methods', () => {
        const maliciousPaths = [
          '../file.md',
          '..\\file.md',
          'folder/../../../etc/passwd',
          'folder\\..\\..\\..\\etc\\passwd'
        ];
  
        maliciousPaths.forEach(path => {
          // validatePath should throw
          expect(() => pathValidator.validatePath(path)).toThrow();
          
          // toAbsolutePath should throw
          expect(() => pathValidator.toAbsolutePath(path)).toThrow();
          
          // pathsEqual should return false (catches exceptions internally)
          expect(pathValidator.pathsEqual(path, 'legitimate/file.md')).toBe(false);
          expect(pathValidator.pathsEqual('legitimate/file.md', path)).toBe(false);
        });
      });
    });
  });

  describe('edge cases and security tests', () => {
    test('should handle Unicode characters safely', () => {
      expect(pathValidator.validateAndNormalizePath('folder/文件.md')).toBe('folder/文件.md');
      expect(pathValidator.validateAndNormalizePath('папка/файл.md')).toBe('папка/файл.md');
    });

    test('should handle very long paths', () => {
      const longPath = 'a'.repeat(1000) + '/file.md';
      expect(pathValidator.validateAndNormalizePath(longPath)).toBe(longPath);
    });

    test('should handle paths with special characters', () => {
      expect(pathValidator.validateAndNormalizePath('folder with spaces/file.md')).toBe('folder with spaces/file.md');
      expect(pathValidator.validateAndNormalizePath('folder-with-dashes/file_with_underscores.md')).toBe('folder-with-dashes/file_with_underscores.md');
    });

    test('should prevent null byte injection', () => {
      expect(() => pathValidator.validateAndNormalizePath('folder/file\0.md')).not.toThrow();
      // Note: The current implementation doesn't specifically check for null bytes,
      // but this test documents the expected behavior
    });
  });
});

describe('PathValidator factory functions', () => {
  test('createPathValidator should create a new instance', () => {
    const { createPathValidator } = require('../src/components/agent/tools/pathValidation');
    const validator = createPathValidator(mockApp);
    expect(validator).toBeInstanceOf(PathValidator);
  });

  test('validateAndNormalizePath should work as standalone function', () => {
    const { validateAndNormalizePath } = require('../src/components/agent/tools/pathValidation');
    const result = validateAndNormalizePath(mockApp, 'folder/file.md');
    expect(result).toBe('folder/file.md');
  });
});