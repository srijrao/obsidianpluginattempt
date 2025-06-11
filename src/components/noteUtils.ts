import { Notice, TFile, App } from 'obsidian';
import { Message, MyPluginSettings } from '../types';
import { findFile, extractContentUnderHeader } from './utils';

/**
 * Process a single message content to include Obsidian note contents, recursively if enabled.
 */
export async function processObsidianLinks(
    content: string,
    app: App,
    settings: MyPluginSettings,
    visitedNotes: Set<string> = new Set(),
    currentDepth: number = 0
): Promise<string> {
    if (!settings.enableObsidianLinks) return content;
    const linkRegex = /\[\[(.*?)\]\]/g;
    let match;
    let processedContent = content;
    while ((match = linkRegex.exec(content)) !== null) {
        if (match && match[0] && match[1]) {
            const parts = match[1].split('|');
            const filePath = parts[0].trim();
            try {
                let file = findFile(app, filePath);
                const headerMatch = filePath.match(/(.*?)#(.*)/);
                let extractedContent = "";
                if (file && file instanceof TFile) {
                    // Prevent infinite recursion
                    if (visitedNotes.has(file.path)) {
                        extractedContent = '[Recursive link omitted: already included]';
                    } else {
                        visitedNotes.add(file.path);
                        const noteContent = await app.vault.cachedRead(file);
                        if (headerMatch) {
                            extractedContent = extractContentUnderHeader(noteContent, headerMatch[2].trim());
                        } else {
                            extractedContent = noteContent;
                        }
                        // Recursively expand links if enabled and depth not exceeded
                        if (settings.expandLinkedNotesRecursively && currentDepth < (settings.maxLinkExpansionDepth ?? 2)) {
                            extractedContent = await processObsidianLinks(extractedContent, app, settings, visitedNotes, currentDepth + 1);
                        }
                    }
                    processedContent = processedContent.replace(
                        match[0],
                        `${match[0]}\n\n---\nNote Name: ${filePath}\nContent:\n${extractedContent}\n---\n`
                    );
                } else {
                    new Notice(`File not found: ${filePath}. Ensure the file name and path are correct.`);
                }
            } catch (error) {
                new Notice(`Error processing link for ${filePath}: ${error.message}`);
            }
        }
    }
    return processedContent;
}

/**
 * Process context notes specified in the settings.
 */
export async function processContextNotes(contextNotesText: string, app: App): Promise<string> {
    const linkRegex = /\[\[(.*?)\]\]/g;
    let match;
    let contextContent = "";
    while ((match = linkRegex.exec(contextNotesText)) !== null) {
        if (match && match[1]) {
            const fileName = match[1].trim();
            try {
                const headerMatch = fileName.match(/(.*?)#(.*)/);
                const baseFileName = headerMatch ? headerMatch[1].trim() : fileName;
                const headerName = headerMatch ? headerMatch[2].trim() : null;
                let file = findFile(app, baseFileName);
                if (file && file instanceof TFile) {
                    const noteContent = await app.vault.cachedRead(file);
                    contextContent += `---\nFrom note: ${file.basename}\n\n`;
                    if (headerName) {
                        const headerContent = extractContentUnderHeader(noteContent, headerName);
                        contextContent += headerContent;
                    } else {
                        contextContent += noteContent;
                    }
                    contextContent += '\n\n';
                } else {
                    contextContent += `Note not found: ${fileName}\n\n`;
                }
            } catch (error) {
                contextContent += `Error processing note ${fileName}: ${error.message}\n\n`;
            }
        }
    }
    return contextContent;
}

/**
 * Process an array of messages to include Obsidian note contents.
 */
export async function processMessages(messages: Message[], app: App, settings: MyPluginSettings): Promise<Message[]> {
    const processedMessages: Message[] = [];
    if (settings.enableContextNotes && settings.contextNotes) {
        const contextContent = await processContextNotes(settings.contextNotes, app);
        if (contextContent) {
            if (messages.length > 0 && messages[0].role === 'system') {
                processedMessages.push({
                    role: 'system',
                    content: `${messages[0].content}\n\nHere is additional context:\n${contextContent}`
                });
                messages = messages.slice(1);
            } else {
                processedMessages.push({
                    role: 'system',
                    content: `Here is context for our conversation:\n${contextContent}`
                });
            }
        }
    }
    for (const message of messages) {
        const processedContent = await processObsidianLinks(message.content, app, settings, new Set());
        processedMessages.push({
            role: message.role,
            content: processedContent
        });
    }
    return processedMessages;
}

/**
 * Retrieves content from context notes.
 */
export async function getContextNotesContent(contextNotesText: string, app: App): Promise<string> {
    return processContextNotes(contextNotesText, app);
}
