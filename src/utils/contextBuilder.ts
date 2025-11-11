import { App, Notice } from 'obsidian';
import { Message, LinkResolutionResult } from '../types';
import MyPlugin from '../main';
import { getSystemMessage } from './systemMessage';
import { processContextNotes, processObsidianLinks } from './noteUtils';
import { getRecentlyOpenedFiles } from './recently-opened-files';
import { calculateTotalTokenCount } from './tokenCounter';

/**
 * Centralized utility for building context messages for AI conversations.
 * This function constructs the system message, appends context, and optionally includes the current note content.
 * All context-building logic for the plugin should be routed through here for DRYness and maintainability.
 * Returns metadata about resolved and unresolved links for UI display.
 */
export async function buildContextMessages({
    app,
    plugin,
    includeCurrentNote = true,
    includeContextNotes = true,
    debug = false,
    forceNoCurrentNote = false
}: {
    app: App,
    plugin: MyPlugin,
    includeCurrentNote?: boolean,
    includeContextNotes?: boolean,
    debug?: boolean,
    forceNoCurrentNote?: boolean
}): Promise<{ messages: Message[], resolved: string[], unresolved: string[] }> {
    // Start with the system message.
    const messages: Message[] = [
        { role: 'system', content: getSystemMessage(plugin.settings) }
    ];

    // Unified deduplication: track all referenced note paths to prevent duplicate fetching
    const visitedNotes = new Set<string>();
    const allResolved: string[] = [];
    const allUnresolved: string[] = [];

    // Add the list of recently opened files to the system message if enabled.
    if (plugin.settings.includeRecentlyOpenedNotes) {
        const recentlyOpenedFiles = await getRecentlyOpenedFiles(app);
        if (recentlyOpenedFiles.length > 0) {
            messages[0].content += `\n\nRecently Opened Files:\n${recentlyOpenedFiles.slice(0, 3).map(f => f.path).join('\n')}`;
        }
    }

    // Step 1: Pre-populate visitedNotes with current note path ONLY if we're going to reference it
    // This prevents current note from being re-added if it's also in open notes
    if (!forceNoCurrentNote && includeCurrentNote && plugin.settings.referenceCurrentNote) {
        const currentFile = app.workspace.getActiveFile();
        if (currentFile) {
            visitedNotes.add(currentFile.path);
        }
    }

    // Step 2: Process context notes with deduplication
    if (includeContextNotes && plugin.settings.enableContextNotes && plugin.settings.contextNotes) {
        const contextResult = await processContextNotes(plugin.settings.contextNotes, app, plugin.settings, visitedNotes);
        
        // Truncate context notes if they exceed reasonable limits (leave room for other content)
        const maxContextTokens = 50000; // Conservative limit for context notes
        const truncatedContent = truncateContextNotes(contextResult.content, maxContextTokens, plugin);
        
        messages[0].content += `\n\nContext Notes:\n${truncatedContent}`;
        allResolved.push(...contextResult.resolved);
        allUnresolved.push(...contextResult.unresolved);
    }

    // Step 3: Add referenced notes as separate system messages
    // Current note
    if (!forceNoCurrentNote && includeCurrentNote && plugin.settings.referenceCurrentNote) {
        const currentFile = app.workspace.getActiveFile();
        if (currentFile) {
            let currentNoteContent = await app.vault.cachedRead(currentFile);
            
            // Process links in current note if recursive expansion is enabled
            if (plugin.settings.enableObsidianLinks && plugin.settings.expandLinkedNotesRecursively) {
                const linkResult = await processObsidianLinks(currentNoteContent, app, plugin.settings, visitedNotes, 0);
                currentNoteContent = linkResult.content;
                allResolved.push(...linkResult.resolved);
                allUnresolved.push(...linkResult.unresolved);
            }
            
            messages.push({
                role: 'system',
                content: `[Reference Note] Current note: ${currentFile.path}\n\n${currentNoteContent}`
            });
        }
    }

    // All open notes
    if (plugin.settings.referenceAllOpenNotes) {
        const openLeaves = app.workspace.getLeavesOfType('markdown');
        for (const leaf of openLeaves) {
            const file = (leaf as any).view?.file;
            if (file?.path) {
                // Skip if already processed (e.g., as current note)
                if (visitedNotes.has(file.path)) {
                    continue;
                }
                
                // Mark as visited before processing to prevent circular references
                visitedNotes.add(file.path);
                
                let noteContent = await app.vault.cachedRead(file);
                
                // Process links in open note if recursive expansion is enabled
                if (plugin.settings.enableObsidianLinks && plugin.settings.expandLinkedNotesRecursively) {
                    const linkResult = await processObsidianLinks(noteContent, app, plugin.settings, visitedNotes, 0);
                    noteContent = linkResult.content;
                    allResolved.push(...linkResult.resolved);
                    allUnresolved.push(...linkResult.unresolved);
                }
                
                messages.push({
                    role: 'system',
                    content: `[Reference Note] Open note: ${file.path}\n\n${noteContent}`
                });
            }
        }
    }

    // Debug logging for context building if enabled.
    if (debug || plugin.settings.debugMode) {
        plugin.debugLog?.('debug', '[contextBuilder] Building context messages', {
            enableContextNotes: plugin.settings.enableContextNotes,
            contextNotes: plugin.settings.contextNotes,
            referenceCurrentNote: plugin.settings.referenceCurrentNote,
            referenceAllOpenNotes: plugin.settings.referenceAllOpenNotes,
            resolvedNotes: allResolved,
            unresolvedNotes: allUnresolved
        });
    }

    // Check token limits and show warnings if needed
    const tokenCheck = checkTokenLimits(messages, plugin);
    if (tokenCheck.hasWarning && tokenCheck.warningMessage) {
        // Show notice to user (only if not in debug mode to avoid spam)
        if (!debug && !plugin.settings.debugMode) {
            new Notice(tokenCheck.warningMessage);
        }
    }

    return { messages, resolved: allResolved, unresolved: allUnresolved };
}

/**
 * Truncates messages to fit within the model's context window.
 * Keeps system messages and truncates from the oldest chat messages first.
 * @param messages Array of messages to potentially truncate
 * @param maxTokens Maximum tokens for the model (optional, uses default estimate if not provided)
 * @param plugin Plugin instance for debug logging
 * @returns Truncated messages array
 */
export function truncateMessagesForContext(
    messages: Message[], 
    maxTokens?: number,
    plugin?: MyPlugin
): Message[] {
    if (!messages || messages.length === 0) return messages;
    
    // Use a conservative default if no limit specified
    const contextLimit = maxTokens || 8192; // Conservative default for most models
    
    const currentTokens = calculateTotalTokenCount(messages);
    
    if (currentTokens <= contextLimit) {
        // No truncation needed
        if (plugin?.debugLog) {
            plugin.debugLog('debug', '[contextBuilder] No truncation needed', {
                currentTokens,
                contextLimit,
                messageCount: messages.length
            });
        }
        return messages;
    }
    
    // Separate system messages from chat messages
    const systemMessages: Message[] = [];
    const chatMessages: Message[] = [];
    
    for (const message of messages) {
        if (message.role === 'system') {
            systemMessages.push(message);
        } else {
            chatMessages.push(message);
        }
    }
    
    // Always keep system messages, start with them
    const truncatedMessages = [...systemMessages];
    let remainingTokens = contextLimit - calculateTotalTokenCount(systemMessages);
    
    if (plugin?.debugLog) {
        plugin.debugLog('debug', '[contextBuilder] Starting truncation', {
            totalMessages: messages.length,
            systemMessages: systemMessages.length,
            chatMessages: chatMessages.length,
            systemTokens: calculateTotalTokenCount(systemMessages),
            remainingTokens,
            contextLimit
        });
    }
    
    // Add chat messages from newest to oldest until we hit the limit
    for (let i = chatMessages.length - 1; i >= 0; i--) {
        const message = chatMessages[i];
        const messageTokens = calculateTotalTokenCount([message]);
        
        if (messageTokens <= remainingTokens) {
            truncatedMessages.push(message);
            remainingTokens -= messageTokens;
        } else {
            // This message would exceed the limit, stop here
            if (plugin?.debugLog) {
                plugin.debugLog('debug', '[contextBuilder] Stopping truncation at message', {
                    messageIndex: i,
                    messageTokens,
                    remainingTokens
                });
            }
            break;
        }
    }
    
    // Re-order chat messages chronologically (system messages first, then chat messages in order)
    const finalChatMessages = truncatedMessages
        .filter(m => m.role !== 'system')
        .sort((a, b) => {
            // If messages have timestamps, sort by them, otherwise maintain relative order
            const aTime = (a as any).timestamp || 0;
            const bTime = (b as any).timestamp || 0;
            return aTime - bTime;
        });
    
    const finalMessages = [...systemMessages, ...finalChatMessages];
    
    if (plugin?.debugLog) {
        plugin.debugLog('info', '[contextBuilder] Context truncation complete', {
            originalMessages: messages.length,
            originalTokens: currentTokens,
            truncatedMessages: finalMessages.length,
            truncatedTokens: calculateTotalTokenCount(finalMessages),
            tokensRemoved: currentTokens - calculateTotalTokenCount(finalMessages),
            messagesRemoved: messages.length - finalMessages.length
        });
    }
    
    return finalMessages;
}

/**
 * Checks if context messages exceed recommended token limits and shows warnings.
 * @param messages Array of messages to check
 * @param plugin Plugin instance for showing notices and logging
 * @param modelMaxTokens Maximum tokens for the current model (optional)
 * @returns Object with warning information
 */
export function checkTokenLimits(
    messages: Message[],
    plugin: MyPlugin,
    modelMaxTokens?: number
): { hasWarning: boolean; warningMessage?: string; tokenCount: number; limit: number } {
    const tokenCount = calculateTotalTokenCount(messages);
    const limit = modelMaxTokens || 128000; // Default to GPT-4 limit
    
    // Show warning at 80% of limit
    const warningThreshold = limit * 0.8;
    
    if (tokenCount >= limit) {
        const message = `Context exceeds token limit: ${tokenCount.toLocaleString()} / ${limit.toLocaleString()} tokens. Consider reducing context notes or current note size.`;
        plugin.debugLog?.('warn', '[contextBuilder] Token limit exceeded', { tokenCount, limit });
        return { hasWarning: true, warningMessage: message, tokenCount, limit };
    } else if (tokenCount >= warningThreshold) {
        const message = `Context approaching token limit: ${tokenCount.toLocaleString()} / ${limit.toLocaleString()} tokens (${Math.round((tokenCount / limit) * 100)}%).`;
        plugin.debugLog?.('info', '[contextBuilder] Token limit warning', { tokenCount, limit, percentage: Math.round((tokenCount / limit) * 100) });
        return { hasWarning: true, warningMessage: message, tokenCount, limit };
    }
    
    return { hasWarning: false, tokenCount, limit };
}

/**
 * Truncates context notes content to fit within token limits.
 * Prioritizes keeping the most recent context notes and truncates older ones.
 * @param contextContent The full context content to potentially truncate
 * @param maxTokens Maximum tokens allowed for context
 * @param plugin Plugin instance for logging
 * @returns Truncated context content
 */
export function truncateContextNotes(
    contextContent: string,
    maxTokens: number,
    plugin?: MyPlugin
): string {
    if (!contextContent) return contextContent;
    
    const tokenCount = calculateTotalTokenCount([{ role: 'system', content: contextContent }]);
    
    if (tokenCount <= maxTokens) {
        return contextContent; // No truncation needed
    }
    
    // Split context into individual note sections (separated by ---)
    const sections = contextContent.split(/^---$/gm).filter(section => section.trim());
    
    if (sections.length <= 1) {
        // Only one section, truncate it directly
        const words = contextContent.split(' ');
        let truncated = '';
        let currentTokens = 0;
        
        for (const word of words) {
            const wordTokens = calculateTotalTokenCount([{ role: 'system', content: word + ' ' }]);
            if (currentTokens + wordTokens > maxTokens) break;
            truncated += word + ' ';
            currentTokens += wordTokens;
        }
        
        plugin?.debugLog?.('info', '[contextBuilder] Truncated single context section', {
            originalTokens: tokenCount,
            truncatedTokens: currentTokens,
            maxTokens
        });
        
        return truncated.trim() + '\n\n[Content truncated due to token limit]';
    }
    
    // Multiple sections - keep most recent ones and truncate oldest
    const truncatedSections: string[] = [];
    let totalTokens = 0;
    
    // Process sections in reverse order (most recent first)
    for (let i = sections.length - 1; i >= 0; i--) {
        const section = sections[i];
        const sectionTokens = calculateTotalTokenCount([{ role: 'system', content: section }]);
        
        if (totalTokens + sectionTokens > maxTokens) {
            // This section would exceed limit, truncate it
            if (totalTokens === 0) {
                // Even the most recent section is too big, truncate it
                const words = section.split(' ');
                let truncatedSection = '';
                let sectionTokensUsed = 0;
                
                for (const word of words) {
                    const wordTokens = calculateTotalTokenCount([{ role: 'system', content: word + ' ' }]);
                    if (sectionTokensUsed + wordTokens > maxTokens) break;
                    truncatedSection += word + ' ';
                    sectionTokensUsed += wordTokens;
                }
                
                truncatedSections.unshift('---\n' + truncatedSection.trim() + '\n\n[Content truncated due to token limit]');
                totalTokens = sectionTokensUsed;
            }
            break;
        }
        
        truncatedSections.unshift('---\n' + section);
        totalTokens += sectionTokens;
    }
    
    const result = truncatedSections.join('\n');
    
    plugin?.debugLog?.('info', '[contextBuilder] Truncated context notes', {
        originalSections: sections.length,
        keptSections: truncatedSections.length,
        originalTokens: tokenCount,
        truncatedTokens: totalTokens,
        maxTokens
    });
    
    return result;
}
