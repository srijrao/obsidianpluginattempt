/**
 * @file EmbeddingService.ts
 * @description
 *   This module provides the EmbeddingService class, which handles text embedding generation
 *   and semantic search using the VectorStore. It integrates with AI providers to generate
 *   embeddings and provides semantic memory capabilities for the AI agent.
 */

import { Plugin, TFile, Notice } from 'obsidian';
import { VectorStore } from './vectorStore';
import { MyPluginSettings, Message, CompletionOptions } from '../../../types';
import { debugLog } from '../../../utils/logger';
import { showNotice } from '../../../utils/generalUtils';
import { filterFilesForEmbedding, getFilterDescription } from '../../../utils/embeddingFilterUtils';
import * as crypto from 'crypto';

/**
 * Interface for embedding generation options
 */
interface EmbeddingOptions {
  /** Maximum chunk size for text splitting */
  chunkSize?: number;
  /** Overlap between chunks */
  chunkOverlap?: number;
  /** Include file metadata in embeddings */
  includeMetadata?: boolean;
  /** Custom metadata to add */
  customMetadata?: Record<string, any>;
  /** Progress callback for embedding operations */
  onProgress?: (processed: number, total: number) => void;
}

/**
 * Interface for semantic search results
 */
interface SemanticSearchResult {
  /** Original text content */
  text: string;
  /** File path if from a note */
  filePath?: string;
  /** Similarity score */
  similarity: number;
  /** Associated metadata */
  metadata: Record<string, any> | null;
  /** Unique identifier */
  id: string;
}

/**
 * EmbeddingService
 * ----------------
 * Handles text embedding generation and semantic search using AI providers and VectorStore.
 * Provides the core semantic memory functionality for the AI assistant.
 */
export class EmbeddingService {
  private vectorStore: VectorStore;
  private plugin: Plugin;
  private settings: MyPluginSettings;
  private isInitialized: boolean = false;
  private abortController: AbortController | null = null;

  constructor(plugin: Plugin, settings: MyPluginSettings) {
    this.plugin = plugin;
    this.settings = settings;
    this.vectorStore = new VectorStore(plugin);
  }

  /**
   * Initialize the EmbeddingService by setting up the VectorStore.
   * Must be called before using any other methods.
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      await this.vectorStore.initialize();
      this.isInitialized = true;
      debugLog(this.settings.debugMode ?? false, 'info', 'EmbeddingService initialized successfully');
    } catch (error) {
      debugLog(this.settings.debugMode ?? false, 'error', 'Failed to initialize EmbeddingService:', error);
      throw error;
    }
  }

  /**
   * Checks if the service is initialized and ready for use.
   */
  get initialized(): boolean {
    return this.isInitialized && this.vectorStore.isReady();
  }

  /**
   * Ensures the service is initialized before operations.
   */
  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('EmbeddingService not initialized. Call initialize() first.');
    }
  }

  /**
   * Generates embeddings for text using the configured AI provider.
   * @param text - Text to embed
   * @returns Promise<number[]> - The embedding vector
   */
  /**
   * Always uses OpenAI for embedding generation, regardless of provider settings.
   */
  private async generateEmbedding(text: string): Promise<number[]> {
    try {
      // Always use OpenAI for embeddings
      const response = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.settings.openaiSettings.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          input: text,
          model: 'text-embedding-3-small'
        })
      });

      if (!response.ok) {
        throw new Error(`Embedding API error: ${response.status}`);
      }

      const data = await response.json();
      return data.data[0].embedding;
    } catch (error) {
      debugLog(this.settings.debugMode ?? false, 'error', 'Embedding generation failed:', error);
      throw new Error(`Failed to generate embedding: ${error.message}`);
    }
  }


  /**
   * Splits a long text into smaller chunks for embedding.
   * This helps keep each chunk within the model's context window.
   * Tries to split at sentence or line boundaries for better semantic meaning.
   *
   * @param text - The text to split into chunks
   * @param options - Options for chunk size and overlap
   * @returns Array of text chunks
   */
  private splitIntoChunks(text: string, options: EmbeddingOptions = {}): string[] {
    // Set default chunk size and overlap if not provided
    const chunkSize = options.chunkSize || 1000;
    const overlap = options.chunkOverlap || 100;

    const chunks: string[] = [];
    let start = 0;

    // Loop through the text and create chunks
    while (start < text.length) {
      // Calculate the end position for this chunk
      const end = Math.min(start + chunkSize, text.length);
      // Get the chunk of text
      const chunk = text.slice(start, end);

      // If not at the end, try to split at a sentence or newline
      if (end < text.length) {
        // Find the last period or newline in the chunk
        const lastSentence = chunk.lastIndexOf('.');
        const lastNewline = chunk.lastIndexOf('\n');
        // Choose the furthest boundary
        const breakPoint = Math.max(lastSentence, lastNewline);

        // If a boundary is found and it's not too close to the start, split there
        if (breakPoint > start + chunkSize / 2) {
          chunks.push(text.slice(start, breakPoint + 1).trim());
          // Move start to just after the boundary, minus overlap
          start = breakPoint + 1 - overlap;
        } else {
          // Otherwise, just split at the chunk size
          chunks.push(chunk.trim());
          start = end - overlap;
        }
      } else {
        // If at the end, add the last chunk and break
        chunks.push(chunk.trim());
        break;
      }

      // Make sure start doesn't go negative
      start = Math.max(start, 0);
    }

    // Remove any empty chunks
    return chunks.filter(chunk => chunk.length > 0);
  }

  /**
   * Generates a unique ID for a text chunk.
   * @param text - Text content
   * @param metadata - Associated metadata
   * @returns Unique identifier
   */
  private generateId(text: string, metadata: Record<string, any> = {}): string {
    const content = text + JSON.stringify(metadata);
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  /**
   * Embeds a single note file.
   * @param file - The note file to embed
   * @param options - Embedding options
   */
  async embedNote(file: TFile, options: EmbeddingOptions = {}): Promise<void> {
    this.ensureInitialized();
    try {
      const content = await this.plugin.app.vault.read(file);
      await this.embedText(content, {
        ...options,
        customMetadata: {
          filePath: file.path,
          fileName: file.name,
          type: 'note',
          lastModified: file.stat.mtime,
          ...options.customMetadata
        }
      });

      debugLog(this.settings.debugMode ?? false, 'info', `Embedded note: ${file.path}`);
    } catch (error) {
      debugLog(this.settings.debugMode ?? false, 'error', `Failed to embed note ${file.path}:`, error);
      throw error;
    }
  }

  /**
   * Embeds arbitrary text content.
   * @param text - Text to embed
   * @param options - Embedding options
   */
  async embedText(text: string, options: EmbeddingOptions = {}): Promise<void> {
    this.ensureInitialized();
    try {
      const chunks = this.splitIntoChunks(text, options);

      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const embedding = await this.generateEmbedding(chunk);

        const metadata = {
          chunkIndex: i,
          totalChunks: chunks.length,
          timestamp: Date.now(),
          ...options.customMetadata
        };

        const id = this.generateId(chunk, metadata);
        await this.vectorStore.addVector(id, chunk, embedding, metadata);
      }

      debugLog(this.settings.debugMode ?? false, 'info', `Embedded ${chunks.length} chunks`);
    } catch (error) {
      debugLog(this.settings.debugMode ?? false, 'error', 'Failed to embed text:', error);
      throw error;
    }
  }

  /**
   * Embeds a conversation or chat history.
   * @param messages - Array of messages to embed
   * @param sessionId - Optional session identifier
   */
  async embedConversation(messages: Message[], sessionId?: string): Promise<void> {
    this.ensureInitialized();
    try {
      for (let i = 0; i < messages.length; i++) {
        const message = messages[i];
        const text = typeof message.content === 'string' ? message.content :
          JSON.stringify(message.content);

        if (text.trim().length === 0) continue;

        const embedding = await this.generateEmbedding(text);
        const metadata = {
          role: message.role,
          messageIndex: i,
          sessionId: sessionId || 'unknown',
          timestamp: Date.now(),
          type: 'conversation'
        };

        const id = this.generateId(text, metadata);
        await this.vectorStore.addVector(id, text, embedding, metadata);
      }

      debugLog(this.settings.debugMode ?? false, 'info', `Embedded conversation with ${messages.length} messages`);
    } catch (error) {
      debugLog(this.settings.debugMode ?? false, 'error', 'Failed to embed conversation:', error);
      throw error;
    }
  }

  /**
   * Performs semantic search to find relevant content.
   * @param query - Search query
   * @param options - Search options
   * @returns Array of search results
   */
  async semanticSearch(
    query: string,
    options: {
      topK?: number;
      minSimilarity?: number;
      filterMetadata?: Record<string, any>;
      includeTypes?: string[];
    } = {}
  ): Promise<SemanticSearchResult[]> {
    this.ensureInitialized();
    try {
      const queryEmbedding = await this.generateEmbedding(query);
      const topK = options.topK || 5;
      const minSimilarity = options.minSimilarity || 0.7;

      // Get similar vectors (now async)
      let results = await this.vectorStore.findSimilarVectors(queryEmbedding, topK * 2, minSimilarity);

      // Apply metadata filters if specified
      if (options.filterMetadata) {
        results = results.filter(result => {
          if (!result.metadata) return false;
          return Object.entries(options.filterMetadata!).every(([key, value]) =>
            result.metadata![key] === value
          );
        });
      }

      // Apply type filters if specified
      if (options.includeTypes) {
        results = results.filter(result =>
          result.metadata && options.includeTypes!.includes(result.metadata.type)
        );
      }

      // Transform to SemanticSearchResult format
      return results.slice(0, topK).map(result => ({
        text: result.text,
        filePath: result.metadata?.filePath,
        similarity: result.similarity,
        metadata: result.metadata,
        id: result.id
      }));
    } catch (error) {
      debugLog(this.settings.debugMode ?? false, 'error', 'Semantic search failed:', error);
      throw error;
    }
  }

  /**
   * Gets contextually relevant content for AI completions.
   * @param query - The current query or conversation context
   * @param options - Context retrieval options
   * @returns Array of relevant content chunks
   */
  async getRelevantContext(
    query: string,
    options: {
      maxChunks?: number;
      includeNotes?: boolean;
      includeConversations?: boolean;
      minSimilarity?: number;
    } = {}
  ): Promise<string[]> {
    const includeTypes: string[] = [];
    if (options.includeNotes !== false) includeTypes.push('note');
    if (options.includeConversations !== false) includeTypes.push('conversation');

    const results = await this.semanticSearch(query, {
      topK: options.maxChunks || 3,
      minSimilarity: options.minSimilarity || 0.7,
      includeTypes
    });

    return results.map(result => {
      const source = result.filePath ? `[${result.filePath}]` : '[Memory]';
      return `${source}: ${result.text}`;
    });
  }

  /**
   * Cancels the current embedding operation if one is running.
   */
  cancelEmbedding(): void {
    if (this.abortController) {
      this.abortController.abort();
      debugLog(this.settings.debugMode ?? false, 'info', 'Embedding operation cancelled by user');
    }
  }

  /**
   * Checks if an embedding operation is currently running.
   */
  isEmbeddingInProgress(): boolean {
    return this.abortController !== null && !this.abortController.signal.aborted;
  }

  /**
   * Checks if the current operation should be cancelled.
   */
  private shouldCancel(): boolean {
    return this.abortController?.signal.aborted ?? false;
  }

  /**
   * Embeds all notes in the vault.
   * @param options - Embedding options
   */
  async embedAllNotes(options: EmbeddingOptions = {}): Promise<void> {
    this.ensureInitialized();
    
    // Create new abort controller for this operation
    this.abortController = new AbortController();
    
    const notice = new Notice('Embedding all notes... (Click to cancel)', 0);
    
    // Add click handler to cancel
    const noticeEl = (notice as any).noticeEl;
    if (noticeEl) {
      noticeEl.style.cursor = 'pointer';
      noticeEl.addEventListener('click', () => {
        this.cancelEmbedding();
      });
    }

    try {
      const allFiles = this.plugin.app.vault.getMarkdownFiles();
      
      // Apply folder filtering
      const filterSettings = this.settings.embeddingFolderFilter;
      const files = filterFilesForEmbedding(allFiles, filterSettings || { mode: 'off', rules: [] });
      
      if (files.length === 0) {
        notice.hide();
        const filterDesc = getFilterDescription(filterSettings || { mode: 'off', rules: [] });
        showNotice(`No files to embed after applying filters. ${filterDesc}`);
        return;
      }
      
      // Show filtering information if filters are active
      if (filterSettings?.mode !== 'off' && filterSettings?.rules && filterSettings.rules.length > 0) {
        const skippedCount = allFiles.length - files.length;
        notice.setMessage(`Embedding ${files.length} notes (${skippedCount} filtered out)... (Click to cancel)`);
      }
      
      let processed = 0;
      let cancelled = false;

      for (const file of files) {
        // Check for cancellation before processing each file
        if (this.shouldCancel()) {
          cancelled = true;
          break;
        }

        try {
          await this.embedNote(file, options);
          processed++;
          
          // Check for cancellation after processing each file
          if (this.shouldCancel()) {
            cancelled = true;
            break;
          }
          
          // Call progress callback if provided
          if (options.onProgress) {
            options.onProgress(processed, files.length);
          }
          
          notice.setMessage(`Embedded ${processed}/${files.length} notes... (Click to cancel)`);
        } catch (error) {
          debugLog(this.settings.debugMode ?? false, 'warn', `Skipped ${file.path}:`, error);
        }
      }

      notice.hide();
      
      if (cancelled) {
        showNotice(`Embedding cancelled. Successfully processed ${processed} out of ${files.length} notes.`);
      } else {
        // Get final stats to show total embedded count
        const finalStats = await this.getStats();
        const totalEmbeddings = finalStats.totalVectors;
        
        showNotice(
          `Successfully embedded ${processed} notes! Total embeddings in database: ${totalEmbeddings}`
        );
      }
    } catch (error) {
      notice.hide();
      if (this.shouldCancel()) {
        showNotice(`Embedding cancelled: ${error.message}`);
      } else {
        showNotice(`Error embedding notes: ${error.message}`);
        throw error;
      }
    } finally {
      // Clean up abort controller
      this.abortController = null;
    }
  }

  /**
   * Clears all embeddings from the vector store.
   */
  async clearAllEmbeddings(): Promise<void> {
    this.ensureInitialized();
    const count = await this.vectorStore.clearAllVectors();
    showNotice(`Cleared ${count} embeddings from memory.`);
    debugLog(this.settings.debugMode ?? false, 'info', `Cleared ${count} embeddings`);
  }

  /**
   * Gets statistics about the vector store.
   */
  async getStats(): Promise<{ totalVectors: number }> {
    this.ensureInitialized();
    return {
      totalVectors: await this.vectorStore.getVectorCount()
    };
  }

  /**
   * Closes the embedding service and cleans up resources.
   */
  async close(): Promise<void> {
    await this.vectorStore.close();
  }

  /**
   * Embeds the currently active note in the editor.
   * @param options - Embedding options
   */
  async embedActiveNote(options: EmbeddingOptions = {}): Promise<void> {
    this.ensureInitialized();
    const activeFile = this.plugin.app.workspace.getActiveFile?.();
    if (!activeFile) {
      showNotice('No active note found to embed.');
      return;
    }
    await this.embedNote(activeFile, options);
    showNotice(`Embedded active note: ${activeFile.path}`);
  }
}
