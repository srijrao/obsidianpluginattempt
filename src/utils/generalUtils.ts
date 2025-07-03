/**
 * @file This file contains general utility functions used throughout the plugin.
 * These functions provide common functionalities such as debouncing, displaying notices,
 * clipboard operations, editor manipulations, file searching, and content extraction.
 */

import { Notice } from 'obsidian';
import { debugLog } from './logger';

/**
 * Creates a debounced version of a function that delays invoking func until after wait milliseconds
 * have elapsed since the last time the debounced function was invoked.
 * 
 * @param func The function to debounce
 * @param wait The number of milliseconds to delay
 */
export function debounce<T extends (...args: any[]) => any>(func: T, wait: number): (...args: Parameters<T>) => void {
    let timeout: NodeJS.Timeout;
    return (...args: Parameters<T>) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => func(...args), wait);
    };
}

/**
 * Show an Obsidian notice.
 * @param message The message to display.
 */
export function showNotice(message: string) {
    new Notice(message);
}

/**
 * Copy text to clipboard and show a notice.
 * @param text The text to copy.
 * @param successMsg The message to show on success.
 * @param failMsg The message to show on failure.
 */
export async function copyToClipboard(text: string, successMsg = 'Copied to clipboard', failMsg = 'Failed to copy to clipboard') {
    try {
        await navigator.clipboard.writeText(text);
        showNotice(successMsg);
    } catch (error) {
        showNotice(failMsg);
        debugLog(true, 'error', 'Clipboard error:', error);
    }
}

/**
 * Move the editor cursor after inserting text.
 * @param editor The editor instance.
 * @param startPos The starting position of the insertion.
 * @param insertText The text that was inserted.
 */
export function moveCursorAfterInsert(editor: any, startPos: any, insertText: string) {
    const lines = insertText.split('\n');
    if (lines.length === 1) {
        editor.setCursor({
            line: startPos.line,
            ch: startPos.ch + insertText.length
        });
    } else {
        editor.setCursor({
            line: startPos.line + lines.length - 1,
            ch: lines[lines.length - 1].length
        });
    }
}

/**
 * Insert a separator with correct spacing in the editor.
 * @param editor The editor instance.
 * @param position The position to insert the separator.
 * @param separator The separator string.
 * @returns The line number after the inserted separator.
 */
export function insertSeparator(editor: any, position: any, separator: string): number {
    const lineContent = editor.getLine(position.line) ?? '';
    const prefix = lineContent.trim() !== '' ? '\n' : '';
    editor.replaceRange(`${prefix}\n${separator}\n`, position);
    return position.line + (prefix ? 1 : 0) + 2;
}

/**
 * Find a TFile in the vault by path, name, or basename (case-insensitive).
 * @param app The Obsidian app instance.
 * @param filePath The file path or name.
 * @returns The TFile if found, otherwise null.
 */
export function findFile(app: any, filePath: string): any {
    let file = app.vault.getAbstractFileByPath(filePath) || app.vault.getAbstractFileByPath(`${filePath}.md`);
    if (!file) {
        const allFiles = app.vault.getFiles();
        file = allFiles.find((f: any) =>
            f.name === filePath ||
            f.name === `${filePath}.md` ||
            f.basename.toLowerCase() === filePath.toLowerCase() ||
            f.path === filePath ||
            f.path === `${filePath}.md`
        ) || null;
    }
    return file;
}

/**
 * Extract content under a specific header in a note.
 * @param content The note content.
 * @param headerText The header to search for.
 * @returns The content under the header.
 */
export function extractContentUnderHeader(content: string, headerText: string): string {
    const lines = content.split('\n');
    let foundHeader = false;
    let extractedContent = [];
    let headerLevel = 0;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const headerMatch = line.match(/^(#+)\s+(.*?)$/);
        if (headerMatch) {
            const currentHeaderLevel = headerMatch[1].length;
            const currentHeaderText = headerMatch[2].trim();
            if (foundHeader) {
                if (currentHeaderLevel <= headerLevel) {
                    break;
                }
            } else if (currentHeaderText.toLowerCase() === headerText.toLowerCase()) {
                foundHeader = true;
                headerLevel = currentHeaderLevel;
                extractedContent.push(line);
                continue;
            }
        }
        if (foundHeader) {
            extractedContent.push(line);
        }
    }
    return extractedContent.join('\n');
}
