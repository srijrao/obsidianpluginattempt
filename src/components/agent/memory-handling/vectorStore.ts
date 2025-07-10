/**
 * @file vectorStore.ts
 * @description
 *   This module provides the VectorStore class, which manages persistent storage of text embeddings (vectors)
 *   using sql.js (pure JavaScript SQLite) with IndexedDB for persistence.
 *   This implementation is compatible with both Obsidian Desktop and Mobile environments.
 *
 *   The VectorStore allows you to:
 *     - Store and retrieve text embeddings (vectors) with associated metadata.
 *     - Track recently accessed files and their last opened timestamps.
 *     - Work seamlessly across desktop and mobile platforms.
 *
 *   All database operations are asynchronous to support the sql.js + IndexedDB architecture.
 */

import initSqlJs from 'sql.js';
import type { Database, Statement, SqlJs } from 'sql.js';
import type { Plugin } from 'obsidian';

/**
 * Interface for IndexedDB operations with sql.js
 */
interface SqlJsConfig {
  locateFile: (file: string) => string;
}

/**
 * VectorStore
 * -----------
 * Manages a SQLite database using sql.js with IndexedDB persistence for storing 
 * text embeddings (vectors). Compatible with both Obsidian Desktop and Mobile.
 */
export class VectorStore {
  private db: Database | null = null;
  private SQL: SqlJs | null = null;
  private dbName: string;
  private isInitialized: boolean = false;

  /**
   * Constructs a new VectorStore instance.
   * @param plugin - The Obsidian plugin instance (used for naming the database).
   */
  constructor(plugin: Plugin) {
    // Use a consistent database name across platforms
    this.dbName = 'ai-assistant-vectorstore.sqlite';
  }

  /**
   * Initializes the VectorStore by loading sql.js and setting up the database.
   * Must be called before using any other methods.
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      // Initialize sql.js with proper WASM file handling for Obsidian
      const config: SqlJsConfig = {
        locateFile: (file: string) => {
          // For Obsidian plugins, we need to handle WASM files specially
          if (file.endsWith('.wasm')) {
            // Try multiple possible paths for the WASM file
            // This may need adjustment based on how Obsidian handles plugin resources
            return `./node_modules/sql.js/dist/${file}`;
          }
          return file;
        }
      };

      let sqlJs: SqlJs;
      try {
        sqlJs = await initSqlJs(config);
      } catch (wasmError) {
        // Fallback: try without custom locateFile
        console.warn('Failed to load sql.js with custom WASM path, trying default:', wasmError);
        sqlJs = await initSqlJs();
      }

      this.SQL = sqlJs;
      
      // Try to load existing database from IndexedDB
      const existingDb = await this.loadFromIndexedDB();
      
      if (existingDb) {
        this.db = new this.SQL.Database(existingDb);
      } else {
        // Create new database
        this.db = new this.SQL.Database();
      }

      // Create tables if they don't exist
      await this.createTables();
      
      this.isInitialized = true;
    } catch (error) {
      console.error('Failed to initialize VectorStore:', error);
      throw new Error(`VectorStore initialization failed: ${error.message}`);
    }
  }

  /**
   * Creates the necessary tables if they don't exist.
   */
  private async createTables(): Promise<void> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    const createVectorsTable = `
      CREATE TABLE IF NOT EXISTS vectors (
        id TEXT PRIMARY KEY,
        text TEXT NOT NULL,
        embedding BLOB NOT NULL,
        metadata TEXT
      );
    `;

    try {
      this.db.run(createVectorsTable);
      // Save to IndexedDB after schema changes
      await this.saveToIndexedDB();
    } catch (error) {
      console.error('Failed to create tables:', error);
      throw error;
    }
  }

  /**
   * Loads database from IndexedDB.
   * @returns Uint8Array database content or null if not found.
   */
  private async loadFromIndexedDB(): Promise<Uint8Array | null> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('VectorStoreDB', 1);
      
      request.onerror = () => reject(request.error);
      
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction(['databases'], 'readonly');
        const store = transaction.objectStore('databases');
        const getRequest = store.get(this.dbName);
        
        getRequest.onsuccess = () => {
          resolve(getRequest.result ? getRequest.result.data : null);
        };
        
        getRequest.onerror = () => reject(getRequest.error);
      };
      
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('databases')) {
          db.createObjectStore('databases');
        }
      };
    });
  }

  /**
   * Saves database to IndexedDB.
   */
  private async saveToIndexedDB(): Promise<void> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    const data = this.db.export();
    
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('VectorStoreDB', 1);
      
      request.onerror = () => reject(request.error);
      
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction(['databases'], 'readwrite');
        const store = transaction.objectStore('databases');
        const putRequest = store.put({ data }, this.dbName);
        
        putRequest.onsuccess = () => resolve();
        putRequest.onerror = () => reject(putRequest.error);
      };
      
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('databases')) {
          db.createObjectStore('databases');
        }
      };
    });
  }

  /**
   * Ensures the database is initialized before operations.
   */
  private ensureInitialized(): void {
    if (!this.isInitialized || !this.db) {
      throw new Error('VectorStore not initialized. Call initialize() first.');
    }
  }

  /**
   * Checks if the VectorStore is initialized and ready for use.
   * @returns True if initialized, false otherwise.
   */
  get initialized(): boolean {
    return this.isInitialized && this.db !== null;
  }

  /**
   * Adds or updates a vector in the database.
   * @param id - Unique identifier for the vector (e.g., hash or UUID).
   * @param text - The original text that was embedded.
   * @param embedding - The embedding vector (as Buffer or number[]).
   * @param metadata - Optional metadata object (will be JSON-stringified).
   */
  async addVector(
    id: string,
    text: string,
    embedding: Buffer | number[],
    metadata: Record<string, any> | null = null
  ): Promise<void> {
    this.ensureInitialized();

    try {
      // Ensure embedding is stored as a Uint8Array (compatible with sql.js)
      const embeddingArray = Buffer.isBuffer(embedding)
        ? new Uint8Array(embedding)
        : new Uint8Array(new Float32Array(embedding).buffer);

      // Prepare and execute the statement
      const stmt = this.db!.prepare(
        'INSERT OR REPLACE INTO vectors (id, text, embedding, metadata) VALUES (?, ?, ?, ?);'
      );

      stmt.run([id, text, embeddingArray, metadata ? JSON.stringify(metadata) : null]);
      stmt.free();

      // Save to IndexedDB after modification
      await this.saveToIndexedDB();
    } catch (error) {
      console.error('Failed to add vector:', error);
      throw error;
    }
  }

  /**
   * Retrieves a specific vector by its ID.
   * @param id - The unique identifier of the vector to retrieve.
   * @returns The vector object or null if not found.
   */
  async getVector(id: string): Promise<{ id: string; text: string; embedding: Uint8Array; metadata: string | null } | null> {
    this.ensureInitialized();

    try {
      const stmt = this.db!.prepare('SELECT * FROM vectors WHERE id = ?;');
      stmt.bind([id]);
      
      if (stmt.step()) {
        const row = stmt.getAsObject();
        stmt.free();
        
        return {
          id: row.id as string,
          text: row.text as string,
          embedding: new Uint8Array(row.embedding as ArrayBuffer),
          metadata: row.metadata as string | null
        };
      }
      
      stmt.free();
      return null;
    } catch (error) {
      console.error('Failed to get vector:', error);
      throw error;
    }
  }

  /**
   * Deletes a vector by its ID.
   * @param id - The unique identifier of the vector to delete.
   * @returns True if a vector was deleted, false if not found.
   */
  async deleteVector(id: string): Promise<boolean> {
    this.ensureInitialized();

    try {
      const stmt = this.db!.prepare('DELETE FROM vectors WHERE id = ?;');
      stmt.run([id]);
      stmt.free();
      
      // Check if any rows were affected
      const changes = this.db!.getRowsModified();
      
      if (changes > 0) {
        await this.saveToIndexedDB();
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('Failed to delete vector:', error);
      throw error;
    }
  }

  /**
   * Retrieves all vectors stored in the database.
   * @returns Array of objects: { id, text, embedding, metadata }
   *   - embedding is a Uint8Array containing the binary vector data.
   *   - metadata is a JSON string or null.
   */
  async getAllVectors(): Promise<Array<{ id: string; text: string; embedding: Uint8Array; metadata: string | null }>> {
    this.ensureInitialized();

    try {
      const stmt = this.db!.prepare('SELECT * FROM vectors;');
      const results: Array<{ id: string; text: string; embedding: Uint8Array; metadata: string | null }> = [];
      
      while (stmt.step()) {
        const row = stmt.getAsObject();
        results.push({
          id: row.id as string,
          text: row.text as string,
          embedding: new Uint8Array(row.embedding as ArrayBuffer),
          metadata: row.metadata as string | null
        });
      }
      
      stmt.free();
      return results;
    } catch (error) {
      console.error('Failed to get all vectors:', error);
      throw error;
    }
  }

  /**
   * Calculates cosine similarity between two vectors.
   * @param vec1 - First vector as Float32Array or number array.
   * @param vec2 - Second vector as Float32Array or number array.
   * @returns Cosine similarity score between -1 and 1.
   */
  private cosineSimilarity(vec1: Float32Array | number[], vec2: Float32Array | number[]): number {
    if (vec1.length !== vec2.length) {
      throw new Error('Vectors must have the same length for similarity calculation');
    }

    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < vec1.length; i++) {
      dotProduct += vec1[i] * vec2[i];
      norm1 += vec1[i] * vec1[i];
      norm2 += vec2[i] * vec2[i];
    }

    if (norm1 === 0 || norm2 === 0) {
      return 0; // Handle zero vectors
    }

    return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
  }

  /**
   * Converts a Uint8Array containing Float32Array data back to a Float32Array.
   * @param uint8Array - Uint8Array containing the binary vector data.
   * @returns Float32Array representation of the vector.
   */
  private uint8ArrayToFloat32Array(uint8Array: Uint8Array): Float32Array {
    return new Float32Array(uint8Array.buffer, uint8Array.byteOffset, uint8Array.byteLength / 4);
  }

  /**
   * Finds the most similar vectors to a query embedding using cosine similarity.
   * @param queryEmbedding - The query vector to compare against (as number array).
   * @param topK - Number of most similar vectors to return (default: 5).
   * @param minSimilarity - Minimum similarity threshold (default: 0, returns all).
   * @returns Array of similar vectors with similarity scores, sorted by similarity (highest first).
   */
  async findSimilarVectors(
    queryEmbedding: number[],
    topK: number = 5,
    minSimilarity: number = 0
  ): Promise<Array<{
    id: string;
    text: string;
    similarity: number;
    metadata: Record<string, any> | null;
  }>> {
    this.ensureInitialized();

    try {
      // Get all vectors from database
      const allVectors = await this.getAllVectors();

      // Calculate similarities
      const similarities = allVectors.map((vector: { id: string; text: string; embedding: Uint8Array; metadata: string | null }) => {
        const vectorData = this.uint8ArrayToFloat32Array(vector.embedding);
        const similarity = this.cosineSimilarity(queryEmbedding, vectorData);
        
        return {
          id: vector.id,
          text: vector.text,
          similarity,
          metadata: vector.metadata ? JSON.parse(vector.metadata) : null
        };
      });

      // Filter by minimum similarity and sort by similarity (descending)
      return similarities
        .filter((item: { id: string; text: string; similarity: number; metadata: Record<string, any> | null }) => item.similarity >= minSimilarity)
        .sort((a: { similarity: number }, b: { similarity: number }) => b.similarity - a.similarity)
        .slice(0, topK);
    } catch (error) {
      console.error('Failed to find similar vectors:', error);
      throw error;
    }
  }

  /**
   * Searches for vectors containing specific text (case-insensitive).
   * @param searchText - Text to search for in vector text content.
   * @param limit - Maximum number of results to return (default: 10).
   * @returns Array of matching vectors.
   */
  async searchByText(searchText: string, limit: number = 10): Promise<Array<{
    id: string;
    text: string;
    embedding: Uint8Array;
    metadata: Record<string, any> | null;
  }>> {
    this.ensureInitialized();

    try {
      const stmt = this.db!.prepare('SELECT * FROM vectors WHERE text LIKE ? LIMIT ?;');
      stmt.bind([`%${searchText}%`, limit]);
      
      const results: Array<{
        id: string;
        text: string;
        embedding: Uint8Array;
        metadata: Record<string, any> | null;
      }> = [];
      
      while (stmt.step()) {
        const row = stmt.getAsObject();
        results.push({
          id: row.id as string,
          text: row.text as string,
          embedding: new Uint8Array(row.embedding as ArrayBuffer),
          metadata: row.metadata ? JSON.parse(row.metadata as string) : null
        });
      }
      
      stmt.free();
      return results;
    } catch (error) {
      console.error('Failed to search by text:', error);
      throw error;
    }
  }

  /**
   * Gets the total count of vectors in the database.
   * @returns Number of vectors stored.
   */
  async getVectorCount(): Promise<number> {
    this.ensureInitialized();

    try {
      const stmt = this.db!.prepare('SELECT COUNT(*) as count FROM vectors;');
      stmt.step();
      const result = stmt.getAsObject();
      stmt.free();
      return result.count as number;
    } catch (error) {
      console.error('Failed to get vector count:', error);
      throw error;
    }
  }

  /**
   * Clears all vectors from the database.
   * @returns Number of vectors that were deleted.
   */
  async clearAllVectors(): Promise<number> {
    this.ensureInitialized();

    try {
      const stmt = this.db!.prepare('DELETE FROM vectors;');
      stmt.run();
      stmt.free();
      
      const changes = this.db!.getRowsModified();
      
      if (changes > 0) {
        await this.saveToIndexedDB();
      }
      
      return changes;
    } catch (error) {
      console.error('Failed to clear all vectors:', error);
      throw error;
    }
  }

  /**
   * Gets vectors by their metadata properties.
   * @param metadataQuery - Key-value pairs to match in metadata.
   * @param limit - Maximum number of results (default: 10).
   * @returns Array of matching vectors.
   */
  async getVectorsByMetadata(
    metadataQuery: Record<string, any>,
    limit: number = 10
  ): Promise<Array<{
    id: string;
    text: string;
    embedding: Uint8Array;
    metadata: Record<string, any> | null;
  }>> {
    this.ensureInitialized();

    try {
      // Get all vectors and filter by metadata in JavaScript
      // Note: For better performance with large datasets, consider using JSON operators in SQLite
      const allVectors = await this.getAllVectors();
      
      const matches = allVectors.filter((vector: { id: string; text: string; embedding: Uint8Array; metadata: string | null }) => {
        if (!vector.metadata) return false;
        
        try {
          const metadata = JSON.parse(vector.metadata);
          return Object.entries(metadataQuery).every(([key, value]) => metadata[key] === value);
        } catch {
          return false;
        }
      }).slice(0, limit);

      return matches.map((result: { id: string; text: string; embedding: Uint8Array; metadata: string | null }) => ({
        ...result,
        metadata: result.metadata ? JSON.parse(result.metadata) : null
      }));
    } catch (error) {
      console.error('Failed to get vectors by metadata:', error);
      throw error;
    }
  }

  /**
   * Closes the database connection and cleans up resources.
   * Should be called when the vector store is no longer needed.
   */
  async close(): Promise<void> {
    if (this.db) {
      try {
        // Save final state to IndexedDB
        await this.saveToIndexedDB();
        // Close the database
        this.db.close();
        this.db = null;
        this.isInitialized = false;
      } catch (error) {
        console.error('Failed to close database:', error);
        throw error;
      }
    }
  }
}