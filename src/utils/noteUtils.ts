/**
 * @file This file contains utility functions for handling Obsidian notes and their content.
 * It provides functionalities for processing Obsidian links within messages, extracting content
 * from context notes, and preparing messages with relevant note content for AI processing.
 */

import { Notice, TFile, App } from 'obsidian';
import { Message, MyPluginSettings } from '../types';
import { findFile, extractContentUnderHeader } from './utils';

/**
 * Type guard to check if an object is an instance of TFile.
 */
function isTFile(f: any): f is TFile {
    return f && typeof f === 'object' && typeof f.path === 'string' && typeof f.basename === 'string' && typeof f.extension === 'string' && f.stat;
}

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
                if (file && isTFile(file)) {
                    
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
            const originalLink = match[0]; 
            
            const [fileAndHeader, alias] = match[1].split('|').map(s => s.trim());
            
            const headerMatch = fileAndHeader.match(/(.*?)#(.*)/);
            const baseFileName = headerMatch ? headerMatch[1].trim() : fileAndHeader;
            const headerName = headerMatch ? headerMatch[2].trim() : null;
            try {
                let file = findFile(app, baseFileName);
                if (file && isTFile(file)) {
                    const noteContent = await app.vault.cachedRead(file);
                    
                    contextContent += `---\nAttached: ${originalLink}\n\n`;
                    if (headerName) {
                        const headerContent = extractContentUnderHeader(noteContent, headerName);
                        contextContent += headerContent;
                    } else {
                        contextContent += noteContent;
                    }
                    contextContent += '\n\n';
                } else {
                    contextContent += `Note not found: ${originalLink}\n\n`;
                }
            } catch (error) {
                contextContent += `Error processing note ${originalLink}: ${error.message}\n\n`;
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
