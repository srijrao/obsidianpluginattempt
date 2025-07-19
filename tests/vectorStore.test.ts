/**
 * @file vectorStore.test.ts
 * @description Comprehensive tests for the VectorStore class
 */

import { VectorStore } from '../src/components/agent/memory-handling/vectorStore';
import {
  generateTestVector,
  generateTestVectors,
  generateSimilarVectors,
  generateRandomEmbedding,
  createMockPlugin,
  expectEmbeddingsToBeClose,
  calculateCosineSimilarity,
  TestEnvironment
} from './utils/testHelpers';

describe('VectorStore', () => {
  let vectorStore: VectorStore;
  let mockPlugin: any;
  let testEnv: TestEnvironment;

  beforeEach(async () => {
    testEnv = new TestEnvironment();
    mockPlugin = createMockPlugin();
    vectorStore = new VectorStore(mockPlugin);
    
    // Initialize the vector store
    await vectorStore.initialize();
    
    // Ensure clean state by clearing any existing vectors
    await vectorStore.clearAllVectors();
    
    testEnv.addCleanup(() => {
      if (vectorStore) {
        vectorStore.close();
      }
    });
  });

  afterEach(async () => {
    // Clear all vectors before cleanup to ensure test isolation
    if (vectorStore && vectorStore.isReady()) {
      try {
        await vectorStore.clearAllVectors();
      } catch (error) {
        console.warn('Failed to clear vectors in afterEach:', error);
      }
    }
    testEnv.cleanup();
  });

  describe('Initialization', () => {
    it('should initialize successfully', async () => {
      expect(vectorStore.isReady()).toBe(true);
    });

    it('should not initialize twice', async () => {
      const consoleSpy = jest.spyOn(console, 'log');
      await vectorStore.initialize();
      
      // Should not log initialization message again
      expect(consoleSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('Initializing VectorStore')
      );
      
      consoleSpy.mockRestore();
    });

    it('should throw error when using methods before initialization', async () => {
      const uninitializedStore = new VectorStore(mockPlugin);
      
      await expect(uninitializedStore.addVector('test', 'text', [1, 2, 3]))
        .rejects.toThrow('VectorStore not initialized');
    });
  });

  describe('Vector Operations', () => {
    describe('addVector', () => {
      it('should add a vector successfully', async () => {
        const testVector = generateTestVector();
        
        await vectorStore.addVector(
          testVector.id,
          testVector.text,
          testVector.embedding,
          testVector.metadata
        );

        const retrieved = await vectorStore.getVector(testVector.id);
        expect(retrieved).toBeValidVector();
        expect(retrieved!.id).toBe(testVector.id);
        expect(retrieved!.text).toBe(testVector.text);
        expectEmbeddingsToBeClose(retrieved!.embedding, testVector.embedding);
        expect(retrieved!.metadata).toEqual(testVector.metadata);
      });

      it('should update existing vector', async () => {
        const testVector = generateTestVector('test-id');
        
        // Add initial vector
        await vectorStore.addVector(
          testVector.id,
          testVector.text,
          testVector.embedding,
          testVector.metadata
        );

        // Update with new data
        const newText = 'Updated text content';
        const newEmbedding = [0.1, 0.2, 0.3];
        const newMetadata = { updated: true };

        await vectorStore.addVector(
          testVector.id,
          newText,
          newEmbedding,
          newMetadata
        );

        const retrieved = await vectorStore.getVector(testVector.id);
        expect(retrieved!.text).toBe(newText);
        expectEmbeddingsToBeClose(retrieved!.embedding, newEmbedding);
        expect(retrieved!.metadata).toEqual(newMetadata);
      });

      it('should handle vectors with no metadata', async () => {
        const testVector = generateTestVector();
        
        await vectorStore.addVector(
          testVector.id,
          testVector.text,
          testVector.embedding
        );

        const retrieved = await vectorStore.getVector(testVector.id);
        expect(retrieved).toBeValidVector();
        expect(retrieved!.metadata).toBeUndefined();
      });
    });

    describe('getVector', () => {
      it('should retrieve existing vector', async () => {
        const testVector = generateTestVector();
        
        await vectorStore.addVector(
          testVector.id,
          testVector.text,
          testVector.embedding,
          testVector.metadata
        );

        const retrieved = await vectorStore.getVector(testVector.id);
        expect(retrieved).toBeValidVector();
        expect(retrieved!.id).toBe(testVector.id);
      });

      it('should return null for non-existent vector', async () => {
        const retrieved = await vectorStore.getVector('non-existent-id');
        expect(retrieved).toBeNull();
      });
    });

    describe('removeVector', () => {
      it('should remove existing vector', async () => {
        const testVector = generateTestVector();
        
        await vectorStore.addVector(
          testVector.id,
          testVector.text,
          testVector.embedding,
          testVector.metadata
        );

        const removed = await vectorStore.removeVector(testVector.id);
        expect(removed).toBe(true);

        const retrieved = await vectorStore.getVector(testVector.id);
        expect(retrieved).toBeNull();
      });

      it('should return false for non-existent vector', async () => {
        const removed = await vectorStore.removeVector('non-existent-id');
        expect(removed).toBe(false);
      });

      it('should handle deleteVector alias', async () => {
        const testVector = generateTestVector();
        
        await vectorStore.addVector(
          testVector.id,
          testVector.text,
          testVector.embedding,
          testVector.metadata
        );

        const removed = await vectorStore.deleteVector(testVector.id);
        expect(removed).toBe(true);

        const retrieved = await vectorStore.getVector(testVector.id);
        expect(retrieved).toBeNull();
      });
    });

    describe('getAllVectors', () => {
      it('should return empty array when no vectors exist', async () => {
        const vectors = await vectorStore.getAllVectors();
        expect(vectors).toEqual([]);
      });

      it('should return all stored vectors', async () => {
        const testVectors = generateTestVectors(3);
        
        for (const vector of testVectors) {
          await vectorStore.addVector(
            vector.id,
            vector.text,
            vector.embedding,
            vector.metadata
          );
        }

        const retrieved = await vectorStore.getAllVectors();
        expect(retrieved).toHaveLength(3);
        
        // Check that all vectors are present
        const retrievedIds = retrieved.map(v => v.id).sort();
        const expectedIds = testVectors.map(v => v.id).sort();
        expect(retrievedIds).toEqual(expectedIds);
      });
    });

    describe('getVectorCount', () => {
      it('should return 0 for empty store', async () => {
        const count = await vectorStore.getVectorCount();
        expect(count).toBe(0);
      });

      it('should return correct count after adding vectors', async () => {
        const testVectors = generateTestVectors(5);
        
        for (const vector of testVectors) {
          await vectorStore.addVector(
            vector.id,
            vector.text,
            vector.embedding,
            vector.metadata
          );
        }

        const count = await vectorStore.getVectorCount();
        expect(count).toBe(5);
      });

      it('should update count after removing vectors', async () => {
        const testVectors = generateTestVectors(3);
        
        for (const vector of testVectors) {
          await vectorStore.addVector(
            vector.id,
            vector.text,
            vector.embedding,
            vector.metadata
          );
        }

        await vectorStore.removeVector(testVectors[0].id);
        
        const count = await vectorStore.getVectorCount();
        expect(count).toBe(2);
      });
    });

    describe('clearAllVectors', () => {
      it('should clear empty store', async () => {
        const cleared = await vectorStore.clearAllVectors();
        expect(cleared).toBe(0);
      });

      it('should clear all vectors and return count', async () => {
        const testVectors = generateTestVectors(4);
        
        for (const vector of testVectors) {
          await vectorStore.addVector(
            vector.id,
            vector.text,
            vector.embedding,
            vector.metadata
          );
        }

        const cleared = await vectorStore.clearAllVectors();
        expect(cleared).toBe(4);

        const count = await vectorStore.getVectorCount();
        expect(count).toBe(0);

        const vectors = await vectorStore.getAllVectors();
        expect(vectors).toEqual([]);
      });
    });
  });

  describe('Search Operations', () => {
    describe('findVectorsByText', () => {
      it('should find vectors containing search text', async () => {
        // Add test vectors with known content
        const testVectors = [
          generateTestVector('doc1', 'machine learning algorithms', 384, { category: 'AI' }),
          generateTestVector('doc2', 'deep neural networks', 384, { category: 'AI' }),
          generateTestVector('doc3', 'cooking recipes pasta', 384, { category: 'Food' }),
          generateTestVector('doc4', 'javascript programming', 384, { category: 'Programming' }),
          generateTestVector('doc5', 'machine learning models', 384, { category: 'AI' })
        ];

        for (const vector of testVectors) {
          await vectorStore.addVector(
            vector.id,
            vector.text,
            vector.embedding,
            vector.metadata
          );
        }
        
        const results = await vectorStore.findVectorsByText('machine learning');
        expect(results.length).toBeGreaterThan(0);
        
        // All results should contain the search text
        results.forEach(result => {
          expect(result.text.toLowerCase()).toContain('machine learning');
        });
      });

      it('should be case insensitive', async () => {
        // Add test vectors with known content
        const testVectors = [
          generateTestVector('doc1', 'machine learning algorithms', 384, { category: 'AI' }),
          generateTestVector('doc2', 'deep neural networks', 384, { category: 'AI' }),
        ];

        for (const vector of testVectors) {
          await vectorStore.addVector(
            vector.id,
            vector.text,
            vector.embedding,
            vector.metadata
          );
        }
        
        const results = await vectorStore.findVectorsByText('MACHINE LEARNING');
        expect(results.length).toBeGreaterThan(0);
      });

      it('should respect limit parameter', async () => {
        // Add test vectors with known content
        const testVectors = [
          generateTestVector('doc1', 'machine learning algorithms', 384, { category: 'AI' }),
          generateTestVector('doc2', 'machine learning models', 384, { category: 'AI' })
        ];

        for (const vector of testVectors) {
          await vectorStore.addVector(
            vector.id,
            vector.text,
            vector.embedding,
            vector.metadata
          );
        }
        
        const results = await vectorStore.findVectorsByText('machine', 1);
        expect(results).toHaveLength(1);
      });

      it('should return empty array for non-matching text', async () => {
        const results = await vectorStore.findVectorsByText('nonexistent text');
        expect(results).toEqual([]);
      });

      it('should work with searchByText alias', async () => {
        // Add test vectors with known content
        const testVectors = [
          generateTestVector('doc4', 'javascript programming', 384, { category: 'Programming' }),
        ];

        for (const vector of testVectors) {
          await vectorStore.addVector(
            vector.id,
            vector.text,
            vector.embedding,
            vector.metadata
          );
        }
        
        const results = await vectorStore.searchByText('programming');
        expect(results.length).toBeGreaterThan(0);
        expect(results[0].text).toContain('programming');
      });
    });

    describe('getVectorsByMetadata', () => {
      it('should find vectors by metadata properties', async () => {
        // Add test vectors with known content
        const testVectors = [
          generateTestVector('doc1', 'machine learning algorithms', 384, { category: 'AI' }),
          generateTestVector('doc2', 'deep neural networks', 384, { category: 'AI' }),
          generateTestVector('doc3', 'cooking recipes pasta', 384, { category: 'Food' }),
        ];

        for (const vector of testVectors) {
          await vectorStore.addVector(
            vector.id,
            vector.text,
            vector.embedding,
            vector.metadata
          );
        }
        
        const results = await vectorStore.getVectorsByMetadata({ category: 'AI' });
        expect(results.length).toBeGreaterThan(0);
        
        results.forEach(result => {
          expect(result.metadata.category).toBe('AI');
        });
      });

      it('should return empty array for non-matching metadata', async () => {
        const results = await vectorStore.getVectorsByMetadata({ category: 'NonExistent' });
        expect(results).toEqual([]);
      });

      it('should handle multiple metadata criteria', async () => {
        // Add a vector with multiple metadata properties
        await vectorStore.addVector(
          'multi-meta',
          'test content',
          generateRandomEmbedding(384),
          { category: 'Test', type: 'example', priority: 'high' }
        );

        const results = await vectorStore.getVectorsByMetadata({
          category: 'Test',
          type: 'example'
        });
        
        expect(results).toHaveLength(1);
        expect(results[0].id).toBe('multi-meta');
      });

      it('should respect limit parameter', async () => {
        // Add test vectors with known content
        const testVectors = [
          generateTestVector('doc1', 'machine learning algorithms', 384, { category: 'AI' }),
          generateTestVector('doc2', 'deep neural networks', 384, { category: 'AI' }),
          generateTestVector('doc3', 'machine learning models', 384, { category: 'AI' })
        ];

        for (const vector of testVectors) {
          await vectorStore.addVector(
            vector.id,
            vector.text,
            vector.embedding,
            vector.metadata
          );
        }
        
        const results = await vectorStore.getVectorsByMetadata({ category: 'AI' }, 1);
        expect(results).toHaveLength(1);
      });
    });
  });

  describe('Similarity Search', () => {
    it('should find similar vectors', async () => {
      // Use consistent embedding dimensions (384, which is the default)
      const baseEmbedding = generateRandomEmbedding(384);
      const baseVector = generateTestVector('base', 'base content', 384);
      baseVector.embedding = baseEmbedding;

      // Add base vector
      await vectorStore.addVector(
        baseVector.id,
        baseVector.text,
        baseVector.embedding,
        baseVector.metadata
      );

      // Add similar vectors
      const similarVectors = generateSimilarVectors(baseEmbedding, 3, 0.9);
      for (const vector of similarVectors) {
        await vectorStore.addVector(
          vector.id,
          vector.text,
          vector.embedding,
          vector.metadata
        );
      }

      // Add dissimilar vector with same dimension
      const dissimilarVector = generateTestVector('dissimilar', 'different content', 384);
      await vectorStore.addVector(
        dissimilarVector.id,
        dissimilarVector.text,
        dissimilarVector.embedding,
        dissimilarVector.metadata
      );

      const results = await vectorStore.findSimilarVectors(baseEmbedding, 5, 0.5);
      
      expect(results.length).toBeGreaterThan(0);
      expect(results.length).toBeLessThanOrEqual(5);
      
      // Results should be sorted by similarity (highest first)
      for (let i = 1; i < results.length; i++) {
        expect(results[i - 1].similarity).toBeGreaterThanOrEqual(results[i].similarity);
      }

      // All results should meet minimum similarity threshold
      results.forEach(result => {
        expect(result.similarity).toBeGreaterThanOrEqual(0.5);
      });
    });

    it('should handle empty store for similarity search', async () => {
      const queryEmbedding = generateRandomEmbedding(384);
      const results = await vectorStore.findSimilarVectors(queryEmbedding);
      expect(results).toEqual([]);
    });

    it('should respect limit parameter in similarity search', async () => {
      const baseEmbedding = generateRandomEmbedding(384);
      const similarVectors = generateSimilarVectors(baseEmbedding, 10, 0.9);
      
      for (const vector of similarVectors) {
        await vectorStore.addVector(
          vector.id,
          vector.text,
          vector.embedding,
          vector.metadata
        );
      }

      const results = await vectorStore.findSimilarVectors(baseEmbedding, 3);
      expect(results).toHaveLength(3);
    });
  });

  describe('Batch Operations', () => {
    describe('getAllVectorIds', () => {
      it('should return empty array for empty store', async () => {
        const ids = await vectorStore.getAllVectorIds();
        expect(ids).toEqual([]);
      });

      it('should return all vector IDs', async () => {
        const testVectors = generateTestVectors(5);
        
        for (const vector of testVectors) {
          await vectorStore.addVector(
            vector.id,
            vector.text,
            vector.embedding,
            vector.metadata
          );
        }

        const ids = await vectorStore.getAllVectorIds();
        expect(ids).toHaveLength(5);
        
        const expectedIds = testVectors.map(v => v.id).sort();
        const actualIds = ids.sort();
        expect(actualIds).toEqual(expectedIds);
      });
    });

    describe('getLatestTimestamp', () => {
      it('should return 0 for empty store', async () => {
        const timestamp = await vectorStore.getLatestTimestamp();
        expect(timestamp).toBe(0);
      });

      it('should return latest timestamp', async () => {
        const beforeTime = Date.now();
        const testVectors = generateTestVectors(3);
        
        // Add vectors sequentially to ensure different timestamps
        for (let i = 0; i < testVectors.length; i++) {
          await vectorStore.addVector(
            testVectors[i].id,
            testVectors[i].text,
            testVectors[i].embedding,
            testVectors[i].metadata
          );
          // Small delay to ensure different timestamps
          if (i < testVectors.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 1));
          }
        }

        const afterTime = Date.now();
        const latestTimestamp = await vectorStore.getLatestTimestamp();
        
        // The latest timestamp should be within the time range of the test
        expect(latestTimestamp).toBeGreaterThanOrEqual(beforeTime);
        expect(latestTimestamp).toBeLessThanOrEqual(afterTime);
      });
    });

    describe('getVectorsBatch', () => {
      it('should return correct batch from start', async () => {
        const testVectors = generateTestVectors(10);
        for (const vector of testVectors) {
          await vectorStore.addVector(
            vector.id,
            vector.text,
            vector.embedding,
            vector.metadata
          );
        }
        
        const batch = await vectorStore.getVectorsBatch(0, 3);
        expect(batch).toHaveLength(3);
      });

      it('should return correct batch with offset', async () => {
        const testVectors = generateTestVectors(10);
        for (const vector of testVectors) {
          await vectorStore.addVector(
            vector.id,
            vector.text,
            vector.embedding,
            vector.metadata
          );
        }
        
        const batch = await vectorStore.getVectorsBatch(5, 3);
        expect(batch).toHaveLength(3);
      });

      it('should handle batch size larger than remaining vectors', async () => {
        const testVectors = generateTestVectors(10);
        for (const vector of testVectors) {
          await vectorStore.addVector(
            vector.id,
            vector.text,
            vector.embedding,
            vector.metadata
          );
        }
        
        const batch = await vectorStore.getVectorsBatch(8, 5);
        expect(batch).toHaveLength(2); // Only 2 vectors remaining
      });

      it('should return empty array for offset beyond data', async () => {
        const testVectors = generateTestVectors(10);
        for (const vector of testVectors) {
          await vectorStore.addVector(
            vector.id,
            vector.text,
            vector.embedding,
            vector.metadata
          );
        }
        
        const batch = await vectorStore.getVectorsBatch(15, 5);
        expect(batch).toEqual([]);
      });
    });
  });

  describe('Utility Functions', () => {
    describe('cosineSimilarity', () => {
      it('should calculate correct similarity for identical vectors', () => {
        const vec1 = [1, 0, 0];
        const vec2 = [1, 0, 0];
        const similarity = VectorStore.cosineSimilarity(vec1, vec2);
        expect(similarity).toBeCloseTo(1.0, 6);
      });

      it('should calculate correct similarity for orthogonal vectors', () => {
        const vec1 = [1, 0, 0];
        const vec2 = [0, 1, 0];
        const similarity = VectorStore.cosineSimilarity(vec1, vec2);
        expect(similarity).toBeCloseTo(0.0, 6);
      });

      it('should calculate correct similarity for opposite vectors', () => {
        const vec1 = [1, 0, 0];
        const vec2 = [-1, 0, 0];
        const similarity = VectorStore.cosineSimilarity(vec1, vec2);
        expect(similarity).toBeCloseTo(-1.0, 6);
      });

      it('should throw error for vectors of different lengths', () => {
        const vec1 = [1, 0, 0];
        const vec2 = [1, 0];
        expect(() => VectorStore.cosineSimilarity(vec1, vec2))
          .toThrow('Vectors must have the same length');
      });

      it('should handle zero vectors', () => {
        const vec1 = [0, 0, 0];
        const vec2 = [1, 0, 0];
        const similarity = VectorStore.cosineSimilarity(vec1, vec2);
        expect(similarity).toBe(0);
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      // Close the database to simulate an error
      await vectorStore.close();
      
      await expect(vectorStore.addVector('test', 'text', [1, 2, 3]))
        .rejects.toThrow();
    });

    it('should handle invalid vector data', async () => {
      // Test with invalid embedding (non-array)
      await expect(vectorStore.addVector('test', 'text', 'invalid' as any))
        .rejects.toThrow();
    });
  });

  describe('Database Lifecycle', () => {
    it('should close database connection', async () => {
      expect(vectorStore.isReady()).toBe(true);
      
      await vectorStore.close();
      
      expect(vectorStore.isReady()).toBe(false);
    });

    it('should handle multiple close calls', async () => {
      await vectorStore.close();
      await vectorStore.close(); // Should not throw
      
      expect(vectorStore.isReady()).toBe(false);
    });
  });
});