import { ToolCommand, ToolExecutionResult, ReasoningData, TaskStatus } from '../types';

/**
 * Parse tool data from markdown content that contains ai-tool-execution blocks.
 * @param content The message content string (raw markdown)
 * @returns Parsed tool data object or null
 */
export function parseToolDataFromMarkdown(content: string): {
    toolResults?: ToolExecutionResult[];
    reasoning?: ReasoningData;
    taskStatus?: TaskStatus;
} | null {
    const toolDataRegex = /```ai-tool-execution\n([\s\S]*?)\n```/g;
    const match = toolDataRegex.exec(content);

    if (match) {
        try {
            const parsed = JSON.parse(match[1]);
            return {
                toolResults: parsed.toolResults,
                reasoning: parsed.reasoning,
                taskStatus: parsed.taskStatus
            };
        } catch (e) {
            console.error('Failed to parse tool data from markdown:', e);
        }
    }

    return null;
}

/**
 * Remove tool data blocks from markdown content to get clean content for display.
 * @param content The message content string (raw markdown)
 * @returns Cleaned markdown content string
 */
export function cleanMarkdownFromToolData(content: string): string {
    // Remove ai-tool-execution code blocks
    const cleanContent = content.replace(/```ai-tool-execution\n[\s\S]*?\n```\n?/g, '').trim();
    return cleanContent;
}

/**
 * Embed tool execution data into markdown content as JSON blocks.
 * @param content The base message content (markdown)
 * @param toolResults Optional tool execution results
 * @param reasoning Optional reasoning data
 * @param taskStatus Optional task status
 * @returns Markdown content with embedded tool JSON block
 */
export function embedToolDataInMarkdown(
    content: string,
    toolResults?: ToolExecutionResult[],
    reasoning?: ReasoningData,
    taskStatus?: TaskStatus
): string {
    if (!toolResults && !reasoning && !taskStatus) {
        return content;
    }

    const toolData = {
        toolResults,
        reasoning,
        taskStatus
    };

    const jsonBlock = `\n\n\`\`\`ai-tool-execution\n${JSON.stringify(toolData, null, 2)}\n\`\`\``;

    return content + jsonBlock;
}

/**
 * Parse tool data from saved content that contains ai-tool-execution blocks.
 * @deprecated Use parseToolDataFromMarkdown instead
 * @param content The message content string
 * @returns Parsed tool data object or null
 */
export function parseToolDataFromContent(content: string): any {
    return parseToolDataFromMarkdown(content);
}

/**
 * Remove tool data blocks from content to get clean content for display.
 * @deprecated Use cleanMarkdownFromToolData instead
 * @param content The message content string
 * @returns Cleaned content string
 */
export function cleanContentFromToolData(content: string): string {
    return cleanMarkdownFromToolData(content);
}