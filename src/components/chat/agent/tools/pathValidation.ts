import { App } from 'obsidian';
import { join, normalize, isAbsolute, relative } from 'path';

/**
 * Utility class for validating and normalizing file paths within the vault
 */
export class PathValidator {
    private vaultPath: string;

    constructor(private app: App) {
        
        this.vaultPath = (this.app.vault.adapter as any).basePath || '';
    }

    /**
     * Validates and normalizes a path to ensure it's within the vault
     * @param inputPath The input path (can be relative to vault or absolute)
     * @returns The normalized vault-relative path or throws an error if invalid
     */
    validateAndNormalizePath(inputPath: string): string {
        if (inputPath === undefined || inputPath === null || typeof inputPath !== 'string') {
            throw new Error('Path must be a string');
        }

        
        const cleanPath = inputPath.trim();

        
        if (cleanPath === '' || cleanPath === '.' || cleanPath === './' || cleanPath === '/') {
            return '';
        }

        let normalizedPath: string;

        if (isAbsolute(cleanPath)) {
            
            const absoluteVaultPath = normalize(this.vaultPath);
            const absoluteInputPath = normalize(cleanPath);

            
            if (!absoluteInputPath.startsWith(absoluteVaultPath)) {
                throw new Error(`Path '${cleanPath}' is outside the vault. Only paths within the vault are allowed.`);
            }

            
            normalizedPath = relative(absoluteVaultPath, absoluteInputPath);
        } else {
            
            normalizedPath = normalize(cleanPath);
            
            
            if (normalizedPath.startsWith('../') || normalizedPath.includes('/../') || normalizedPath === '..') {
                throw new Error(`Path '${cleanPath}' attempts to access files outside the vault. Only paths within the vault are allowed.`);
            }
        }

        
        normalizedPath = normalizedPath.replace(/\\/g, '/');
        
        
        if (normalizedPath.startsWith('/')) {
            normalizedPath = normalizedPath.substring(1);
        }

        
        if (normalizedPath === '.' || normalizedPath === './') {
            normalizedPath = '';
        }

        return normalizedPath;
    }

    /**
     * Validates that a path is safe for use within the vault
     * @param inputPath The path to validate
     * @returns True if the path is valid, throws an error otherwise
     */
    validatePath(inputPath: string): boolean {
        try {
            this.validateAndNormalizePath(inputPath);
            return true;
        } catch (error) {
            throw error;
        }
    }

    /**
     * Gets the vault's base path
     * @returns The absolute path to the vault root
     */
    getVaultPath(): string {
        return this.vaultPath;
    }

    /**
     * Converts a vault-relative path to an absolute path
     * @param vaultRelativePath The vault-relative path
     * @returns The absolute path
     */
    toAbsolutePath(vaultRelativePath: string): string {
        const normalizedVaultPath = this.validateAndNormalizePath(vaultRelativePath);
        return join(this.vaultPath, normalizedVaultPath);
    }

    /**
     * Checks if two paths refer to the same file within the vault
     * @param path1 First path
     * @param path2 Second path
     * @returns True if the paths refer to the same file
     */
    pathsEqual(path1: string, path2: string): boolean {
        try {
            const normalized1 = this.validateAndNormalizePath(path1);
            const normalized2 = this.validateAndNormalizePath(path2);
            return normalized1 === normalized2;
        } catch (error) {
            return false;
        }
    }
}

/**
 * Creates a PathValidator instance for the given app
 * @param app The Obsidian app instance
 * @returns A new PathValidator instance
 */
export function createPathValidator(app: App): PathValidator {
    return new PathValidator(app);
}

/**
 * Validates and normalizes a path using a temporary PathValidator instance
 * @param app The Obsidian app instance
 * @param inputPath The path to validate
 * @returns The normalized vault-relative path
 */
export function validateAndNormalizePath(app: App, inputPath: string): string {
    const validator = new PathValidator(app);
    return validator.validateAndNormalizePath(inputPath);
}
