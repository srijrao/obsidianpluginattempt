/**
 * @file SemanticContextBuilder.ts
 * @description
 *   This module extends the existing contextBuilder with semantic search capabilities.
 *   It integrates with the EmbeddingService to provide relevant context for AI completions
 *   based on semantic similarity rather than just recent files.
 */

import { App, TFile } from 'obsidian';
import type MyPlugin from '../../../main';
import { Message } from '../../../types';
import { debugLog } from '../../../utils/logger';
import { EmbeddingService } from './EmbeddingService';

/**
 * Options for building semantic context
 */
interface SemanticContextOptions {
  /** Include current note content */
  includeCurrentNote?: boolean;
  /** Include semantically similar notes */
  includeSemanticContext?: boolean;
  /** Include conversation history */
  includeConversationHistory?: boolean;
  /** Maximum number of context chunks */
  maxContextChunks?: number;
  /** Minimum similarity threshold */
  minSimilarity?: number;
  /** Force exclusion of current note */
  forceNoCurrentNote?: boolean;
}

/**
 * SemanticContextBuilder
 * ----------------------
 * Builds context for AI completions using semantic search to find relevant content.
 * Integrates with the existing context building system.
 */
export class SemanticContextBuilder {
  private embeddingService: EmbeddingService | null = null;
  
  constructor(
    private app: App,
    private plugin: MyPlugin
  ) {
    // Initialize embedding service if on desktop platform
    if ((this.app as any).isMobile === false) {
      try {
        this.embeddingService = new EmbeddingService(plugin, plugin.settings);
      } catch (error) {
        debugLog(plugin.settings.debugMode ?? false, 'warn', 'EmbeddingService unavailable:', error);
      }
    }
  }

  /**
   * Builds semantic context messages for AI completions.
   * @param options - Context building options
   * @param query - The current query for semantic search
   * @returns Array of context messages
   */
  async buildSemanticContext(
    options: SemanticContextOptions = {},
    query?: string
  ): Promise<Message[]> {
    const contextMessages: Message[] = [];
    
    try {
      // If no embedding service available, return empty context
      if (!this.embeddingService) {
        debugLog(this.plugin.settings.debugMode ?? false, 'info', 'Embedding service not available, skipping semantic context');
        return contextMessages;
      }

      // Get current file for context
      const activeFile = this.app.workspace.getActiveFile();
      let currentContent = '';
      
      if (activeFile && options.includeCurrentNote && !options.forceNoCurrentNote) {
        currentContent = await this.app.vault.read(activeFile);
      }

      // Build semantic search query
      let searchQuery = query || '';
      if (!searchQuery && currentContent) {
        // Use first few lines of current note as search context
        searchQuery = currentContent.split('\n').slice(0, 5).join(' ').slice(0, 500);
      }

      if (searchQuery && options.includeSemanticContext) {
        // Get semantically relevant content
        const relevantContext = await this.embeddingService.getRelevantContext(searchQuery, {
          maxChunks: options.maxContextChunks || 3,
          includeNotes: true,
          includeConversations: options.includeConversationHistory !== false,
          minSimilarity: options.minSimilarity || 0.7
        });

        if (relevantContext.length > 0) {
          contextMessages.push({
            role: 'user',
            content: `Relevant context from your knowledge base:\n\n${relevantContext.join('\n\n')}`
          });
        }
      }

      debugLog(this.plugin.settings.debugMode ?? false, 'info', `Built semantic context with ${contextMessages.length} messages`);
      
    } catch (error) {
      debugLog(this.plugin.settings.debugMode ?? false, 'error', 'Failed to build semantic context:', error);
    }

    return contextMessages;
  }

  /**
   * Embeds the current note if embedding service is available.
   * @param file - File to embed (optional, uses active file if not provided)
   */
  async embedCurrentNote(file?: TFile): Promise<void> {
    if (!this.embeddingService) return;
    
    const targetFile = file || this.app.workspace.getActiveFile();
    if (!targetFile) return;

    try {
      await this.embeddingService.embedNote(targetFile);
      debugLog(this.plugin.settings.debugMode ?? false, 'info', `Embedded current note: ${targetFile.path}`);
    } catch (error) {
      debugLog(this.plugin.settings.debugMode ?? false, 'error', 'Failed to embed current note:', error);
    }
  }

  /**
   * Embeds a conversation when it's saved or completed.
   * @param messages - Conversation messages
   * @param sessionId - Session identifier
   */
  async embedConversation(messages: Message[], sessionId?: string): Promise<void> {
    if (!this.embeddingService) return;

    try {
      await this.embeddingService.embedConversation(messages, sessionId);
      debugLog(this.plugin.settings.debugMode ?? false, 'info', `Embedded conversation with ${messages.length} messages`);
    } catch (error) {
      debugLog(this.plugin.settings.debugMode ?? false, 'error', 'Failed to embed conversation:', error);
    }
  }

  /**
   * Gets embedding service statistics.
   */
  getStats(): { totalVectors: number } | null {
    return this.embeddingService?.getStats() || null;
  }

  /**
   * Performs a semantic search directly.
   * @param query - Search query
   * @param options - Search options
   */
  async semanticSearch(query: string, options: {
    topK?: number;
    minSimilarity?: number;
    includeTypes?: string[];
  } = {}) {
    if (!this.embeddingService) return [];
    
    return await this.embeddingService.semanticSearch(query, options);
  }

  /**
   * Clears all embeddings.
   */
  async clearAllEmbeddings(): Promise<void> {
    if (!this.embeddingService) return;
    await this.embeddingService.clearAllEmbeddings();
  }

  /**
   * Embeds all notes in the vault.
   */
  async embedAllNotes(): Promise<void> {
    if (!this.embeddingService) return;
    await this.embeddingService.embedAllNotes();
  }

  /**
   * Closes the semantic context builder and cleans up resources.
   */
  close(): void {
    if (this.embeddingService) {
      this.embeddingService.close();
    }
  }
}
