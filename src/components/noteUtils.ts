import { Notice, TFile, App } from 'obsidian';
import { Message, MyPluginSettings } from '../types';

/**
 * Extract content under a specific header in a note
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

/**
 * Process a single message content to include Obsidian note contents, recursively if enabled
 */
export async function processObsidianLinks(
    content: string,
    app: App,
    settings: MyPluginSettings,
    visitedNotes: Set<string> = new Set()
): Promise<string> {
    if (!settings.enableObsidianLinks) return content;
    const linkRegex = /\[\[(.*?)\]\]/g;
    let match;
    let processedContent = content;
    while ((match = linkRegex.exec(content)) !== null) {
        if (match && match[0] && match[1]) {
            const parts = match[1].split('|');
            const filePath = parts[0].trim();
            const displayText = parts.length > 1 ? parts[1].trim() : filePath;
            try {
                let file = app.vault.getAbstractFileByPath(filePath) || app.vault.getAbstractFileByPath(`${filePath}.md`);
                if (!file) {
                    const allFiles = app.vault.getFiles();
                    file = allFiles.find(f => f.name === filePath || f.name === `${filePath}.md` ||
                        f.basename.toLowerCase() === filePath.toLowerCase() ||
                        f.path === filePath || f.path === `${filePath}.md`) || null;
                }
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
                        // Recursively expand links if enabled
                        if (settings.expandLinkedNotesRecursively) {
                            extractedContent = await processObsidianLinks(extractedContent, app, settings, visitedNotes);
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
 * Process context notes specified in the settings
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
                let file = app.vault.getAbstractFileByPath(baseFileName) ||
                    app.vault.getAbstractFileByPath(`${baseFileName}.md`);
                if (!file) {
                    const allFiles = app.vault.getFiles();
                    file = allFiles.find(f =>
                        f.basename.toLowerCase() === baseFileName.toLowerCase() ||
                        f.name.toLowerCase() === `${baseFileName.toLowerCase()}.md`
                    ) || null;
                }
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
 * Process an array of messages to include Obsidian note contents
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

export async function getContextNotesContent(contextNotesText: string, app: App): Promise<string> {
    return processContextNotes(contextNotesText, app);
}
