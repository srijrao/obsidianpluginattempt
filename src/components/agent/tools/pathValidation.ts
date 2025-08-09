import { App } from 'obsidian';
import { join, normalize, isAbsolute, relative } from 'path';
import { getVaultBasePath } from '../../../utils/typeguards';

/**
 * Utility class for validating and normalizing file paths within the vault.
 * Ensures all file operations are restricted to the vault directory.
 */
export class PathValidator {
    private vaultPath: string;

    /**
     * Constructs a PathValidator for the given Obsidian app.
     * @param app The Obsidian App instance.
     */
    constructor(private app: App) {
        // The vault's absolute path on disk using type-safe helper
        this.vaultPath = getVaultBasePath(this.app);
    }

    /**
     * Validates and normalizes a path to ensure it's within the vault.
     * Converts absolute paths to vault-relative, and prevents directory traversal.
     * @param inputPath The input path (can be relative to vault or absolute).
     * @returns The normalized vault-relative path, or throws an error if invalid.
     */
    validateAndNormalizePath(inputPath: string): string {
        if (inputPath === undefined || inputPath === null || typeof inputPath !== 'string') {
            throw new Error('Path must be a string');
        }

        // Remove leading/trailing whitespace.
        const cleanPath = inputPath.trim();

        // Special cases for root or current directory.
        if (cleanPath === '' || cleanPath === '.' || cleanPath === './' || cleanPath === '/') {
            return '';
        }

        // SECURITY FIX: Pre-normalization security check to prevent directory traversal
        // Check for directory traversal patterns BEFORE normalization to prevent Windows backslash bypass
        this.performPreNormalizationSecurityCheck(cleanPath);

        let normalizedPath: string;

        if (isAbsolute(cleanPath)) {
            // If absolute, ensure it's inside the vault.
            const absoluteVaultPath = normalize(this.vaultPath);
            const absoluteInputPath = normalize(cleanPath);

            // Prevent access outside the vault.
            if (!absoluteInputPath.startsWith(absoluteVaultPath)) {
                throw new Error(`Path '${cleanPath}' is outside the vault. Only paths within the vault are allowed.`);
            }

            // Convert to vault-relative path.
            normalizedPath = relative(absoluteVaultPath, absoluteInputPath);
        } else {
            // Normalize relative path.
            normalizedPath = normalize(cleanPath);

            // Post-normalization check as additional safety (kept for defense in depth)
            if (normalizedPath.startsWith('../') || normalizedPath.includes('/../') || normalizedPath === '..') {
                throw new Error(`Path '${cleanPath}' attempts to access files outside the vault. Only paths within the vault are allowed.`);
            }
        }

        // Convert Windows backslashes to forward slashes.
        normalizedPath = normalizedPath.replace(/\\/g, '/');
        // Remove leading slash if present.
        if (normalizedPath.startsWith('/')) {
            normalizedPath = normalizedPath.substring(1);
        }
        // Normalize '.' or './' to empty string (vault root).
        if (normalizedPath === '.' || normalizedPath === './') {
            normalizedPath = '';
        }

        return normalizedPath;
    }

    /**
     * Performs pre-normalization security checks to prevent directory traversal attacks.
     * This method checks for traversal patterns before path normalization to prevent
     * Windows backslash bypass attacks where ..\\ patterns get normalized to ../ after validation.
     * @param inputPath The raw input path to check
     * @throws Error if directory traversal patterns are detected
     */
    private performPreNormalizationSecurityCheck(inputPath: string): void {
        // Check for directory traversal patterns with both forward slashes and backslashes
        // This prevents Windows-style attacks using backslashes that get normalized later
        
        // Patterns to detect:
        // - ../ or ..\\ at start of path
        // - /../ or \..\\ anywhere in path
        // - .. as entire path component
        // - Mixed separator attacks like ..\/ or ..\/
        
        const traversalPatterns = [
            /^\.\.[\\/]/,           // Starts with ../ or ..\
            /[\\/]\.\.[\\/]/,       // Contains /../ or \..\
            /^\.\.$/,               // Exactly ".."
            /[\\/]\.\.$/, // Ends with /.. or \..
            /^\.\.[\\/].*[\\/]\.\.[\\/]/, // Multiple traversal attempts
            /\.\.[\\/]\.\./, // Consecutive traversal attempts like ../../ or ..\..\ or ..\../
        ];

        for (const pattern of traversalPatterns) {
            if (pattern.test(inputPath)) {
                throw new Error(`Path '${inputPath}' contains directory traversal patterns and attempts to access files outside the vault. Only paths within the vault are allowed.`);
            }
        }

        // Additional check for mixed separator patterns that could bypass simple regex
        // Convert all separators to forward slashes for consistent checking
        const normalizedForCheck = inputPath.replace(/\\/g, '/');
        if (normalizedForCheck.includes('../') || normalizedForCheck.startsWith('../') || normalizedForCheck === '..') {
            // Check if this would result in traversal after normalization
            const segments = normalizedForCheck.split('/');
            let depth = 0;
            for (const segment of segments) {
                if (segment === '..') {
                    depth--;
                    if (depth < 0) {
                        throw new Error(`Path '${inputPath}' attempts to access files outside the vault. Only paths within the vault are allowed.`);
                    }
                } else if (segment !== '' && segment !== '.') {
                    depth++;
                }
            }
        }
    }

    /**
     * Validates that a path is safe for use within the vault.
     * Throws if invalid, returns true if valid.
     * @param inputPath The path to validate.
     * @returns True if the path is valid, throws an error otherwise.
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
     * Gets the vault's base path (absolute path on disk).
     * @returns The absolute path to the vault root.
     */
    getVaultPath(): string {
        return this.vaultPath;
    }

    /**
     * Converts a vault-relative path to an absolute path.
     * @param vaultRelativePath The vault-relative path.
     * @returns The absolute path on disk.
     */
    toAbsolutePath(vaultRelativePath: string): string {
        const normalizedVaultPath = this.validateAndNormalizePath(vaultRelativePath);
        return join(this.vaultPath, normalizedVaultPath);
    }

    /**
     * Checks if two paths refer to the same file within the vault.
     * @param path1 First path.
     * @param path2 Second path.
     * @returns True if the normalized paths are equal.
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
 * Creates a PathValidator instance for the given app.
 * @param app The Obsidian app instance.
 * @returns A new PathValidator instance.
 */
export function createPathValidator(app: App): PathValidator {
    return new PathValidator(app);
}

/**
 * Validates and normalizes a path using a temporary PathValidator instance.
 * @param app The Obsidian app instance.
 * @param inputPath The path to validate.
 * @returns The normalized vault-relative path.
 */
export function validateAndNormalizePath(app: App, inputPath: string): string {
    const validator = new PathValidator(app);
    return validator.validateAndNormalizePath(inputPath);
}
