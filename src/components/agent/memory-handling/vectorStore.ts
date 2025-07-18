// ...existing code...
  // ...existing code...
/**
 * @file vectorStore.ts
 * @description
 *   This module provides the VectorStore class, which manages persistent storage of text embeddings (vectors)
 *   using IndexedDB directly (no SQL dependencies for maximum Obsidian compatibility).
 *   This implementation is compatible with both Obsidian Desktop and Mobile environments.
 *
 *   The VectorStore allows you to:
 *     - Store and retrieve text embeddings (vectors) with associated metadata.
 *     - Track recently accessed files and their last opened timestamps.
 *     - Work seamlessly across desktop and mobile platforms.
 *
 *   All database operations are asynchronous using IndexedDB.
 */

import type { Plugin } from 'obsidian';

/**
 * Interface for stored vector data
 */
interface VectorData {
  id: string;
  text: string;
  embedding: number[];
  metadata?: any;
  timestamp: number;
}

/**
 * VectorStore
 * -----------
 * Manages an IndexedDB database for storing text embeddings (vectors). 
 * No SQL dependencies - uses pure IndexedDB for maximum Obsidian compatibility.
 */
export class VectorStore {

  /**
   * Gets all vector IDs from the store (memory efficient).
   * @returns Array of all vector IDs.
   */
  async getAllVectorIds(): Promise<string[]> {
    this.ensureInitialized();
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['vectors'], 'readonly');
      const store = transaction.objectStore('vectors');
      const request = store.openCursor();
      const ids: string[] = [];
      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;
        if (cursor) {
          ids.push(cursor.key);
          cursor.continue();
        } else {
          resolve(ids);
        }
      };
      request.onerror = () => reject(new Error(`Failed to get all vector IDs: ${request.error?.message}`));
    });
  }

  /**
   * Gets the latest timestamp from all vectors (memory efficient).
   * @returns The latest timestamp.
   */
  async getLatestTimestamp(): Promise<number> {
    this.ensureInitialized();
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['vectors'], 'readonly');
      const store = transaction.objectStore('vectors');
      const request = store.openCursor();
      let maxTimestamp = 0;
      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;
        if (cursor) {
          const vector = cursor.value;
          if (vector.timestamp && vector.timestamp > maxTimestamp) {
            maxTimestamp = vector.timestamp;
          }
          cursor.continue();
        } else {
          resolve(maxTimestamp);
        }
      };
      request.onerror = () => reject(new Error(`Failed to get latest timestamp: ${request.error?.message}`));
    });
  }

  /**
   * Gets a batch of vectors from the store.
   * @param offset - The starting index.
   * @param batchSize - The number of vectors to retrieve.
   * @returns Array of vectors in the batch.
   */
  async getVectorsBatch(offset: number, batchSize: number): Promise<VectorData[]> {
    this.ensureInitialized();
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['vectors'], 'readonly');
      const store = transaction.objectStore('vectors');
      const request = store.openCursor();
      const batch: VectorData[] = [];
      let skipped = 0;
      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;
        if (cursor) {
          if (skipped < offset) {
            skipped++;
            cursor.continue();
          } else if (batch.length < batchSize) {
            batch.push(cursor.value);
            cursor.continue();
          } else {
            resolve(batch);
          }
        } else {
          resolve(batch);
        }
      };
      request.onerror = () => reject(new Error(`Failed to get vectors batch: ${request.error?.message}`));
    });
  }

  /**
   * Optimized streaming similarity calculation for large datasets.
   */
  async findSimilarVectors(
    queryEmbedding: number[],
    limit: number = 5,
    minSimilarity: number = 0.0
  ): Promise<Array<VectorData & { similarity: number }>> {
    this.ensureInitialized();

    const results: Array<VectorData & { similarity: number }> = [];
    let minHeapSimilarity = minSimilarity;
    const batchSize = 100;
    const totalCount = await this.getVectorCount();
    for (let offset = 0; offset < totalCount; offset += batchSize) {
      const batch = await this.getVectorsBatch(offset, batchSize);
      for (const vector of batch) {
        const similarity = VectorStore.cosineSimilarity(queryEmbedding, vector.embedding);
        if (similarity >= minHeapSimilarity) {
          results.push({ ...vector, similarity });
          if (results.length > limit) {
            results.sort((a, b) => b.similarity - a.similarity);
            results.splice(limit);
            minHeapSimilarity = results[results.length - 1].similarity;
          }
        }
      }
    }
    return results.sort((a, b) => b.similarity - a.similarity);
  }
  private db: IDBDatabase | null = null;
  private dbName: string;
  private isInitialized: boolean = false;

  /**
   * Constructs a new VectorStore instance.
   * @param plugin - The Obsidian plugin instance (used for naming the database).
   */
  constructor(plugin: Plugin) {
    // Use a consistent database name across platforms
    this.dbName = 'ai-assistant-vectorstore';
  }

  /**
   * Initializes the VectorStore by setting up the IndexedDB database.
   * Must be called before using any other methods.
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      console.log('Initializing VectorStore with IndexedDB (no SQL dependencies)');
      
      this.db = await this.openIndexedDB();
      this.isInitialized = true;
      console.log('✅ VectorStore initialized successfully');
    } catch (error) {
      console.error('Failed to initialize VectorStore:', error);
      throw new Error(`VectorStore initialization failed: ${error.message}`);
    }
  }

  /**
   * Opens or creates the IndexedDB database
   */
  private openIndexedDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1);
      
      request.onerror = () => {
        reject(new Error(`Failed to open IndexedDB: ${request.error?.message}`));
      };
      
      request.onsuccess = () => {
        resolve(request.result);
      };
      
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        // Create vectors object store
        if (!db.objectStoreNames.contains('vectors')) {
          const store = db.createObjectStore('vectors', { keyPath: 'id' });
          store.createIndex('timestamp', 'timestamp', { unique: false });
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
  isReady(): boolean {
    return this.isInitialized && this.db !== null;
  }

  /**
   * Adds or updates a vector in the store.
   * @param id - Unique identifier for the vector.
   * @param text - The original text content.
   * @param embedding - The vector embedding (array of numbers).
   * @param metadata - Optional metadata to store with the vector.
   */
  async addVector(id: string, text: string, embedding: number[], metadata?: any): Promise<void> {
    this.ensureInitialized();

    const vectorData: VectorData = {
      id,
      text,
      embedding,
      metadata,
      timestamp: Date.now()
    };

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['vectors'], 'readwrite');
      const store = transaction.objectStore('vectors');
      const request = store.put(vectorData);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(new Error(`Failed to add vector: ${request.error?.message}`));
    });
  }

  /**
   * Retrieves a vector by its ID.
   * @param id - The unique identifier for the vector.
   * @returns The vector data or null if not found.
   */
  async getVector(id: string): Promise<VectorData | null> {
    this.ensureInitialized();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['vectors'], 'readonly');
      const store = transaction.objectStore('vectors');
      const request = store.get(id);

      request.onsuccess = () => {
        resolve(request.result || null);
      };
      request.onerror = () => reject(new Error(`Failed to get vector: ${request.error?.message}`));
    });
  }

  /**
   * Removes a vector from the store.
   * @param id - The unique identifier for the vector to remove.
   * @returns True if the vector was removed, false if it didn't exist.
   */
  async removeVector(id: string): Promise<boolean> {
    this.ensureInitialized();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['vectors'], 'readwrite');
      const store = transaction.objectStore('vectors');
      const getRequest = store.get(id);

      getRequest.onsuccess = () => {
        if (getRequest.result) {
          const deleteRequest = store.delete(id);
          deleteRequest.onsuccess = () => resolve(true);
          deleteRequest.onerror = () => reject(new Error(`Failed to delete vector: ${deleteRequest.error?.message}`));
        } else {
          resolve(false);
        }
      };
      getRequest.onerror = () => reject(new Error(`Failed to check vector existence: ${getRequest.error?.message}`));
    });
  }

  /**
   * Gets all vectors from the store.
   * @returns Array of all stored vectors.
   */
  async getAllVectors(): Promise<VectorData[]> {
    this.ensureInitialized();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['vectors'], 'readonly');
      const store = transaction.objectStore('vectors');
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(new Error(`Failed to get all vectors: ${request.error?.message}`));
    });
  }

  /**
   * Finds vectors containing the specified text (simple text search).
   * @param searchText - The text to search for.
   * @param limit - Maximum number of results to return (default: 10).
   * @returns Array of matching vectors.
   */
  async findVectorsByText(searchText: string, limit: number = 10): Promise<VectorData[]> {
    this.ensureInitialized();

    const allVectors = await this.getAllVectors();
    const searchLower = searchText.toLowerCase();
    
    return allVectors
      .filter(vector => vector.text.toLowerCase().includes(searchLower))
      .slice(0, limit);
  }

  /**
   * Searches for vectors containing specific text (alias for findVectorsByText for backward compatibility).
   * @param searchText - Text to search for in vector text content.
   * @param limit - Maximum number of results to return (default: 10).
   * @returns Array of matching vectors.
   */
  async searchByText(searchText: string, limit: number = 10): Promise<VectorData[]> {
    return this.findVectorsByText(searchText, limit);
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
  ): Promise<VectorData[]> {
    this.ensureInitialized();

    const allVectors = await this.getAllVectors();
    
    const matches = allVectors.filter(vector => {
      if (!vector.metadata) return false;
      
      try {
        return Object.entries(metadataQuery).every(([key, value]) => vector.metadata[key] === value);
      } catch {
        return false;
      }
    }).slice(0, limit);

    return matches;
  }

  /**
   * Gets the total number of vectors in the store.
   * @returns The count of vectors.
   */
  async getVectorCount(): Promise<number> {
    this.ensureInitialized();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['vectors'], 'readonly');
      const store = transaction.objectStore('vectors');
      const request = store.count();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(new Error(`Failed to count vectors: ${request.error?.message}`));
    });
  }

  /**
   * Clears all vectors from the store.
   * @returns The number of vectors that were removed.
   */
  async clearAllVectors(): Promise<number> {
    this.ensureInitialized();

    const count = await this.getVectorCount();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['vectors'], 'readwrite');
      const store = transaction.objectStore('vectors');
      const request = store.clear();

      request.onsuccess = () => resolve(count);
      request.onerror = () => reject(new Error(`Failed to clear vectors: ${request.error?.message}`));
    });
  }

  /**
   * Calculates cosine similarity between two embedding vectors.
   * @param vec1 - First embedding vector.
   * @param vec2 - Second embedding vector.
   * @returns Cosine similarity score (0-1, where 1 is most similar).
   */
  static cosineSimilarity(vec1: number[], vec2: number[]): number {
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

    const magnitude = Math.sqrt(norm1) * Math.sqrt(norm2);
    return magnitude === 0 ? 0 : dotProduct / magnitude;
  }


  /**
   * Deletes a vector by its ID (alias for removeVector for backward compatibility).
   * @param id - The unique identifier of the vector to delete.
   * @returns True if a vector was deleted, false if not found.
   */
  async deleteVector(id: string): Promise<boolean> {
    return this.removeVector(id);
  }

  /**
   * Closes the database connection.
   */
  async close(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.isInitialized = false;
    }
  }
}