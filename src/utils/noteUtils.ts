/**
 * @file This file contains utility functions for handling Obsidian notes and their content.
 * It provides functionalities for processing Obsidian links within messages, extracting content
 * from context notes, and preparing messages with relevant note content for AI processing.
 */

import { Notice, App } from 'obsidian';
import { Message, MyPluginSettings, LinkResolutionResult } from '../types';
import { findFile, extractContentUnderHeader } from './generalUtils';
import { isTFile } from './typeguards';

/**
 * Process a single message content to include Obsidian note contents, recursively if enabled.
 * Returns metadata about resolved and unresolved links.
 */
export async function processObsidianLinks(
    content: string,
    app: App,
    settings: MyPluginSettings,
    visitedNotes: Set<string> = new Set(),
    currentDepth: number = 0
): Promise<LinkResolutionResult> {
    if (!settings.enableObsidianLinks) return { content, resolved: [], unresolved: [] };
    
    const linkRegex = /\[\[(.*?)\]\]/g;
    let match;
    let processedContent = content;
    const resolved: string[] = [];
    const unresolved: string[] = [];
    
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
                        resolved.push(file.path);
                        const noteContent = await app.vault.cachedRead(file);
                        if (headerMatch) {
                            extractedContent = extractContentUnderHeader(noteContent, headerMatch[2].trim());
                        } else {
                            extractedContent = noteContent;
                        }
                        
                        if (settings.expandLinkedNotesRecursively && currentDepth < (settings.maxLinkExpansionDepth ?? 2)) {
                            const recursiveResult = await processObsidianLinks(extractedContent, app, settings, visitedNotes, currentDepth + 1);
                            extractedContent = recursiveResult.content;
                            resolved.push(...recursiveResult.resolved);
                            unresolved.push(...recursiveResult.unresolved);
                        }
                    }
                    processedContent = processedContent.replace(
                        match[0],
                        `${match[0]}\n\n---\nNote Name: ${filePath}\nContent:\n${extractedContent}\n---\n`
                    );
                } else {
                    unresolved.push(filePath);
                }
            } catch (error) {
                unresolved.push(filePath);
            }
        }
    }
    return { content: processedContent, resolved, unresolved };
}

/**
 * Process context notes specified in the settings.
 * Returns metadata about resolved and unresolved links.
 */
export async function processContextNotes(contextNotesText: string, app: App, settings?: MyPluginSettings, visitedNotes?: Set<string>): Promise<LinkResolutionResult> {
    const linkRegex = /\[\[(.*?)\]\]/g;
    let match;
    let contextContent = "";
    const resolved: string[] = [];
    const unresolved: string[] = [];
    const localVisitedNotes = visitedNotes || new Set<string>();
    
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
                    if (!localVisitedNotes.has(file.path)) {
                        localVisitedNotes.add(file.path);
                        resolved.push(file.path);
                        
                        const noteContent = await app.vault.cachedRead(file);
                        
                        contextContent += `---\nAttached: ${originalLink}\n\n`;
                        
                        let processedContent = '';
                        if (headerName) {
                            processedContent = extractContentUnderHeader(noteContent, headerName);
                        } else {
                            processedContent = noteContent;
                        }
                        
                        // Apply recursive link expansion to context notes if settings allow it
                        if (settings?.expandLinkedNotesRecursively) {
                            const recursiveResult = await processObsidianLinks(
                                processedContent, 
                                app, 
                                settings, 
                                localVisitedNotes, 
                                0
                            );
                            processedContent = recursiveResult.content;
                            resolved.push(...recursiveResult.resolved);
                            unresolved.push(...recursiveResult.unresolved);
                        }
                        
                        contextContent += processedContent;
                        contextContent += '\n\n';
                    }
                } else {
                    unresolved.push(baseFileName);
                    contextContent += `Note not found: ${originalLink}\n\n`;
                }
            } catch (error) {
                unresolved.push(baseFileName);
                contextContent += `Error processing note ${originalLink}: ${(error as Error).message}\n\n`;
            }
        }
    }
    return { content: contextContent, resolved, unresolved };
}

/**
 * Process an array of messages to include Obsidian note contents.
 * Returns metadata about all resolved and unresolved links across all messages.
 */
export async function processMessages(messages: Message[], app: App, settings: MyPluginSettings): Promise<{ messages: Message[], resolved: string[], unresolved: string[] }> {
    const processedMessages: Message[] = [];
    const allResolved: string[] = [];
    const allUnresolved: string[] = [];
    
    if (settings.enableContextNotes && settings.contextNotes) {
        const contextResult = await processContextNotes(settings.contextNotes, app, settings);
        if (contextResult.content) {
            if (messages.length > 0 && messages[0].role === 'system') {
                processedMessages.push({
                    role: 'system',
                    content: `${messages[0].content}\n\nHere is additional context:\n${contextResult.content}`
                });
                messages = messages.slice(1);
            } else {
                processedMessages.push({
                    role: 'system',
                    content: `Here is context for our conversation:\n${contextResult.content}`
                });
            }
            allResolved.push(...contextResult.resolved);
            allUnresolved.push(...contextResult.unresolved);
        }
    }
    
    for (const message of messages) {
        const result = await processObsidianLinks(message.content, app, settings, new Set());
        processedMessages.push({
            role: message.role,
            content: result.content
        });
        allResolved.push(...result.resolved);
        allUnresolved.push(...result.unresolved);
    }
    
    return { messages: processedMessages, resolved: allResolved, unresolved: allUnresolved };
}
