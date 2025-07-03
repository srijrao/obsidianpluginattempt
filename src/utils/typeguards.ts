/**
 * @file This file contains TypeScript type guard functions for Obsidian's file system objects.
 * These functions are crucial for safely narrowing down the type of an unknown object
 * to a specific Obsidian file type (TFile, TFolder, TAbstractFile), enabling type-safe operations.
 */

import { TFile, TFolder, TAbstractFile } from 'obsidian';

/**
 * Type guard to check if an object is a TFile (Obsidian file)
 */
export function isTFile(file: unknown): file is TFile {
    return (
        !!file &&
        typeof file === 'object' &&
        'path' in file &&
        'basename' in file &&
        'extension' in file &&
        'stat' in file &&
        typeof (file as any).path === 'string' &&
        typeof (file as any).basename === 'string' &&
        typeof (file as any).extension === 'string'
    );
}

/**
 * Type guard to check if an object is a TFolder (Obsidian folder)
 */
export function isTFolder(file: unknown): file is TFolder {
    return (
        !!file &&
        typeof file === 'object' &&
        'path' in file &&
        'children' in file &&
        Array.isArray((file as TFolder).children) &&
        typeof (file as any).path === 'string'
    );
}

/**
 * Type guard to check if an object is a TAbstractFile (file or folder)
 */
export function isTAbstractFile(file: unknown): file is TAbstractFile {
    return (
        !!file &&
        typeof file === 'object' &&
        'path' in file
    );
}
