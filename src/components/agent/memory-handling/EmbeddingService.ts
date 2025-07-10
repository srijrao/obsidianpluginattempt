/**
 * @file EmbeddingService.ts
 * @description
 *   This module provides the EmbeddingService class, which handles text embedding generation
 *   and semantic search using the VectorStore. It integrates with AI providers to generate
 *   embeddings and provides semantic memory capabilities for the AI agent.
 */

import { Plugin, TFile, Notice } from 'obsidian';
import { VectorStore } from './vectorStore';
import { createProvider } from '../../../../providers';
import { MyPluginSettings, Message, CompletionOptions } from '../../../types';
import { debugLog } from '../../../utils/logger';
import { showNotice } from '../../../utils/generalUtils';
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
    return this.isInitialized && this.vectorStore.initialized;
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
  private async generateEmbedding(text: string): Promise<number[]> {
    try {
      // Use OpenAI for embeddings by default (most reliable for embeddings)
      const provider = createProvider(this.settings);
      
      // For embedding, we'll use a special embedding endpoint if available
      // Otherwise fall back to a completion-based approach
      const response = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.settings.openaiSettings.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          input: text,
          model: 'text-embedding-3-small' // Use smaller, faster embedding model
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
   * Splits text into chunks for embedding.
   * @param text - Text to split
   * @param options - Chunking options
   * @returns Array of text chunks
   */
  private splitIntoChunks(text: string, options: EmbeddingOptions = {}): string[] {
    const chunkSize = options.chunkSize || 1000;
    const overlap = options.chunkOverlap || 100;
    
    const chunks: string[] = [];
    let start = 0;
    
    while (start < text.length) {
      const end = Math.min(start + chunkSize, text.length);
      const chunk = text.slice(start, end);
      
      // Try to break at sentence boundaries
      if (end < text.length) {
        const lastSentence = chunk.lastIndexOf('.');
        const lastNewline = chunk.lastIndexOf('\n');
        const breakPoint = Math.max(lastSentence, lastNewline);
        
        if (breakPoint > start + chunkSize / 2) {
          chunks.push(text.slice(start, breakPoint + 1).trim());
          start = breakPoint + 1 - overlap;
        } else {
          chunks.push(chunk.trim());
          start = end - overlap;
        }
      } else {
        chunks.push(chunk.trim());
        break;
      }
      
      start = Math.max(start, 0);
    }
    
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
   * Embeds all notes in the vault.
   * @param options - Embedding options
   */
  async embedAllNotes(options: EmbeddingOptions = {}): Promise<void> {
    this.ensureInitialized();
    const notice = new Notice('Embedding all notes...', 0);
    
    try {
      const files = this.plugin.app.vault.getMarkdownFiles();
      let processed = 0;
      
      for (const file of files) {
        try {
          await this.embedNote(file, options);
          processed++;
          notice.setMessage(`Embedded ${processed}/${files.length} notes...`);
        } catch (error) {
          debugLog(this.settings.debugMode ?? false, 'warn', `Skipped ${file.path}:`, error);
        }
      }
      
      notice.hide();
      showNotice(`Successfully embedded ${processed} notes!`);
    } catch (error) {
      notice.hide();
      showNotice(`Error embedding notes: ${error.message}`);
      throw error;
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
}
