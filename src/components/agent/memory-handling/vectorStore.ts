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
   * Returns the underlying better-sqlite3 Database instance.
   * Useful for advanced queries or direct access.
   */
  getDB() {
    return this.db;
  }
}