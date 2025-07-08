/**
 * @file vectorStore.ts
 * @description
 *   This module provides the VectorStore class, which manages persistent storage of text embeddings (vectors)
 *   and recent file access information using a local SQLite database via better-sqlite3.
 *   It is intended for use in Obsidian Desktop plugins only, as it relies on Node.js APIs.
 *
 *   The VectorStore allows you to:
 *     - Store and retrieve text embeddings (vectors) with associated metadata.
 *     - Track recently accessed files and their last opened timestamps.
 *
 *   NOTE: Do NOT use this module on Obsidian Mobile or in environments where Node.js modules are unavailable.
 *   Use Platform.isDesktop in your main plugin code to guard usage.
 */

import Database from 'better-sqlite3'; // Fast, synchronous SQLite3 library for Node.js
import * as path from 'path'; // Node.js path utilities
import type { Plugin } from 'obsidian'; // Obsidian plugin type

/**
 * VectorStore
 * -----------
 * Manages a SQLite database for storing text embeddings (vectors) and recent file access info.
 * Designed for use in Obsidian Desktop plugins.
 */
export class VectorStore {
  // The underlying SQLite database connection
  private db: Database.Database;

  /**
   * Constructs a new VectorStore instance.
   * @param plugin - The Obsidian plugin instance (used to determine the data directory).
   */
  constructor(plugin: Plugin) {
    // Use plugin's data folder for storage (cross-platform, robust)
    // This is the recommended way to get a writable folder for plugin data

    // Determine the base path of the vault (Obsidian's root folder)
    const dataDir = plugin.app.vault.adapter instanceof Object && 'basePath' in plugin.app.vault.adapter
      ? (plugin.app.vault.adapter as any).basePath
      : '';

    // Construct the full path to the SQLite database file within the plugin's folder
    const dbPath = path.join(
      dataDir,
      '.obsidian',
      'plugins',
      'ai-assistant-for-obsidian',
      'ai-assistant-vectorstore.sqlite'
    );

    // Open (or create) the SQLite database file
    this.db = new Database(dbPath);

    // SQL statement to create the 'vectors' table if it doesn't exist
    // - id: unique identifier for the vector (e.g., hash or UUID)
    // - text: the original text that was embedded
    // - embedding: the embedding vector as a binary blob (Float32Array)
    // - metadata: optional JSON-encoded metadata
    const createVectorsTable = `
      CREATE TABLE IF NOT EXISTS vectors (
        id TEXT PRIMARY KEY,
        text TEXT NOT NULL,
        embedding BLOB NOT NULL,
        metadata TEXT
      );
    `;

    // Execute table creation statement
    this.db.exec(createVectorsTable);
  }

  /**
   * Adds or updates a vector in the database.
   * @param id - Unique identifier for the vector (e.g., hash or UUID).
   * @param text - The original text that was embedded.
   * @param embedding - The embedding vector (as Buffer or number[]).
   * @param metadata - Optional metadata object (will be JSON-stringified).
   */
  addVector(
    id: string,
    text: string,
    embedding: Buffer | number[],
    metadata: Record<string, any> | null = null
  ): void {
    // Prepare SQL statement for inserting or replacing a vector
    const stmt = this.db.prepare(
      'INSERT OR REPLACE INTO vectors (id, text, embedding, metadata) VALUES (?, ?, ?, ?);'
    );

    // Ensure embedding is stored as a Buffer (Float32Array)
    const embeddingBuffer = Buffer.isBuffer(embedding)
      ? embedding
      : Buffer.from(new Float32Array(embedding).buffer);

    // Run the statement with provided values
    stmt.run(id, text, embeddingBuffer, metadata ? JSON.stringify(metadata) : null);
  }

  /**
   * Retrieves a specific vector by its ID.
   * @param id - The unique identifier of the vector to retrieve.
   * @returns The vector object or null if not found.
   */
  getVector(id: string): { id: string; text: string; embedding: Buffer; metadata: string | null } | null {
    const stmt = this.db.prepare('SELECT * FROM vectors WHERE id = ?;');
    const result = stmt.get(id) as { id: string; text: string; embedding: Buffer; metadata: string | null } | undefined;
    return result || null;
  }

  /**
   * Deletes a vector by its ID.
   * @param id - The unique identifier of the vector to delete.
   * @returns True if a vector was deleted, false if not found.
   */
  deleteVector(id: string): boolean {
    const stmt = this.db.prepare('DELETE FROM vectors WHERE id = ?;');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  /**
   * Retrieves all vectors stored in the database.
   * @returns Array of objects: { id, text, embedding, metadata }
   *   - embedding is a Buffer containing the binary vector data.
   *   - metadata is a JSON string or null.
   */
  getAllVectors(): Array<{ id: string; text: string; embedding: Buffer; metadata: string | null }> {
    // Prepare SQL statement to select all vectors
    const stmt = this.db.prepare('SELECT * FROM vectors;');
    // Return the result as an array of objects
    return stmt.all() as Array<{ id: string; text: string; embedding: Buffer; metadata: string | null }>;

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
   * Converts a Buffer containing Float32Array data back to a Float32Array.
   * @param buffer - Buffer containing the binary vector data.
   * @returns Float32Array representation of the vector.
   */
  private bufferToFloat32Array(buffer: Buffer): Float32Array {
    return new Float32Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 4);
  }

  /**
   * Finds the most similar vectors to a query embedding using cosine similarity.
   * @param queryEmbedding - The query vector to compare against (as number array).
   * @param topK - Number of most similar vectors to return (default: 5).
   * @param minSimilarity - Minimum similarity threshold (default: 0, returns all).
   * @returns Array of similar vectors with similarity scores, sorted by similarity (highest first).
   */
  findSimilarVectors(
    queryEmbedding: number[],
    topK: number = 5,
    minSimilarity: number = 0
  ): Array<{
    id: string;
    text: string;
    similarity: number;
    metadata: Record<string, any> | null;
  }> {
    // Get all vectors from database
    const allVectors = this.getAllVectors();

    // Calculate similarities
    const similarities = allVectors.map((vector: { id: string; text: string; embedding: Buffer; metadata: string | null }) => {
      const vectorData = this.bufferToFloat32Array(vector.embedding);
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
  }

  /**
   * Searches for vectors containing specific text (case-insensitive).
   * @param searchText - Text to search for in vector text content.
   * @param limit - Maximum number of results to return (default: 10).
   * @returns Array of matching vectors.
   */
  searchByText(searchText: string, limit: number = 10): Array<{
    id: string;
    text: string;
    embedding: Buffer;
    metadata: Record<string, any> | null;
  }> {
    const stmt = this.db.prepare('SELECT * FROM vectors WHERE text LIKE ? LIMIT ?;');
    const results = stmt.all(`%${searchText}%`, limit) as Array<{
      id: string;
      text: string;
      embedding: Buffer;
      metadata: string | null;
    }>;

    return results.map(result => ({
      ...result,
      metadata: result.metadata ? JSON.parse(result.metadata) : null
    }));
  }

  /**
   * Gets the total count of vectors in the database.
   * @returns Number of vectors stored.
   */
  getVectorCount(): number {
    const stmt = this.db.prepare('SELECT COUNT(*) as count FROM vectors;');
    const result = stmt.get() as { count: number };
    return result.count;
  }

  /**
   * Clears all vectors from the database.
   * @returns Number of vectors that were deleted.
   */
  clearAllVectors(): number {
    const stmt = this.db.prepare('DELETE FROM vectors;');
    const result = stmt.run();
    return result.changes;
  }

  /**
   * Gets vectors by their metadata properties.
   * @param metadataQuery - Key-value pairs to match in metadata.
   * @param limit - Maximum number of results (default: 10).
   * @returns Array of matching vectors.
   */
  getVectorsByMetadata(
    metadataQuery: Record<string, any>,
    limit: number = 10
  ): Array<{
    id: string;
    text: string;
    embedding: Buffer;
    metadata: Record<string, any> | null;
  }> {
    // Get all vectors and filter by metadata in JavaScript
    // Note: For better performance with large datasets, consider using JSON operators in SQLite
    const allVectors = this.getAllVectors();
    
    const matches = allVectors.filter((vector: { id: string; text: string; embedding: Buffer; metadata: string | null }) => {
      if (!vector.metadata) return false;
      
      try {
        const metadata = JSON.parse(vector.metadata);
        return Object.entries(metadataQuery).every(([key, value]) => metadata[key] === value);
      } catch {
        return false;
      }
    }).slice(0, limit);

    return matches.map((result: { id: string; text: string; embedding: Buffer; metadata: string | null }) => ({
      ...result,
      metadata: result.metadata ? JSON.parse(result.metadata) : null
    }));
  }

  /**
   * Closes the database connection.
   * Should be called when the vector store is no longer needed.
   */
  close(): void {
    this.db.close();
  }
}