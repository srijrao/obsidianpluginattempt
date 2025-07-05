import { ToolCommand } from '../types';

/**
 * Parse tool data from saved content that contains ai-tool-execution blocks.
 * @param content The message content string
 * @returns Parsed tool data object or null
 */
export function parseToolDataFromContent(content: string): any {
    const toolDataRegex = /```ai-tool-execution\n([\s\S]*?)\n```/g;
    const match = toolDataRegex.exec(content);

    if (match) {
        try {
            return JSON.parse(match[1]);
        } catch (e) {
            console.error('Failed to parse tool data:', e);
        }
    }

    return null;
}

/**
 * Remove tool data blocks from content to get clean content for display.
 * @param content The message content string
 * @returns Cleaned content string
 */
export function cleanContentFromToolData(content: string): string {
    // Remove ai-tool-execution code blocks
    let cleanContent = content.replace(/```ai-tool-execution\n[\s\S]*?\n```\n?/g, '');
    // Remove legacy "**Tool Execution:**" blocks
    cleanContent = cleanContent.replace(/\n\n\*\*Tool Execution:\*\*[\s\S]*?(?=\n\n\*\*Tool Execution:\*\*|\n\n[^*]|$)/g, '');
    return cleanContent.trim();
}