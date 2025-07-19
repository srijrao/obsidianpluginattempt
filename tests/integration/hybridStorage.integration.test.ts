/**
 * @file hybridStorage.integration.test.ts
 * @description Integration tests for the hybrid storage system
 */

import { VectorStore } from '../../src/components/agent/memory-handling/vectorStore';
import { HybridVectorManager } from '../../src/components/agent/memory-handling/HybridVectorManager';
import {
  generateTestVector,
  generateTestVectors,
  generateSimilarVectors,
  createMockPlugin,
  wait,
  TestEnvironment,
  calculateCosineSimilarity
} from '../utils/testHelpers';

// Mock the logger to avoid import issues
jest.mock('../../src/utils/logger', () => ({
  debugLog: jest.fn()
}));

describe('Hybrid Storage Integration Tests', () => {
  let vectorStore: VectorStore;
  let hybridManager: HybridVectorManager;
  let mockPlugin: any;
  let testEnv: TestEnvironment;

  beforeEach(async () => {
    testEnv = new TestEnvironment();
    mockPlugin = createMockPlugin();
    mockPlugin.settings = { debugMode: false };

    vectorStore = new VectorStore(mockPlugin);
    hybridManager = new HybridVectorManager(mockPlugin, {
      backupFilePath: 'integration-test-backup.json',
      backupInterval: 50, // Very short for testing
      changeThreshold: 3,
      showNotifications: false
    });

    // Initialize both and ensure clean state
    await vectorStore.initialize();
    await vectorStore.clearAllVectors();
    
    await hybridManager.initialize();
    await hybridManager.clearAllVectors();

    testEnv.addCleanup(async () => {
      if (vectorStore) await vectorStore.close();
      if (hybridManager) await hybridManager.close();
    });
  });

  afterEach(async () => {
    // Clean up data before closing
    if (vectorStore && vectorStore.isReady()) {
      try {
        await vectorStore.clearAllVectors();
      } catch (error) {
        console.warn('Failed to clear vectorStore in afterEach:', error);
      }
    }
    
    if (hybridManager && hybridManager.isReady()) {
      try {
        await hybridManager.clearAllVectors();
      } catch (error) {
        console.warn('Failed to clear hybridManager in afterEach:', error);
      }
    }
    
    testEnv.cleanup();
  });

  describe('Data Consistency Between Layers', () => {
    it('should maintain consistency between VectorStore and HybridVectorManager', async () => {
      const testVectors = generateTestVectors(5);

      // Add vectors through VectorStore
      for (const vector of testVectors.slice(0, 2)) {
        await vectorStore.addVector(
          vector.id,
          vector.text,
          vector.embedding,
          vector.metadata
        );
      }

      // Add vectors through HybridVectorManager
      for (const vector of testVectors.slice(2)) {
        await hybridManager.addVector(
          vector.id,
          vector.text,
          vector.embedding,
          vector.metadata
        );
      }

      // Verify counts are consistent
      const vectorStoreCount = await vectorStore.getVectorCount();
      const hybridManagerCount = await hybridManager.getVectorCount();
      
      // Both should see all 5 vectors since they share the same storage
      expect(vectorStoreCount).toBe(5);
      expect(hybridManagerCount).toBe(5);

      // Verify all vectors are accessible through both interfaces
      for (const vector of testVectors) {
        const fromVectorStore = await vectorStore.getVector(vector.id);
        const fromHybridManager = await hybridManager.getVector(vector.id);
        
        expect(fromVectorStore).toBeValidVector();
        expect(fromHybridManager).toBeValidVector();
        expect(fromVectorStore!.id).toBe(fromHybridManager!.id);
      }
    });

    it('should handle concurrent operations correctly', async () => {
      await hybridManager.initialize();

      const testVectors = generateTestVectors(10);
      
      // Perform concurrent add operations
      const addPromises = testVectors.map(vector =>
        hybridManager.addVector(
          vector.id,
          vector.text,
          vector.embedding,
          vector.metadata
        )
      );

      await Promise.all(addPromises);

      // Verify all vectors were added
      const count = await hybridManager.getVectorCount();
      expect(count).toBe(10);

      // Verify each vector is accessible
      for (const vector of testVectors) {
        const retrieved = await hybridManager.getVector(vector.id);
        expect(retrieved).toBeValidVector();
        expect(retrieved!.id).toBe(vector.id);
      }
    });
  });

  describe('Backup and Restore Workflow', () => {
    it('should complete full backup and restore cycle', async () => {
      // Create a fresh hybrid manager for this test to avoid interference from beforeEach setup
      const testHybridManager = new HybridVectorManager(mockPlugin, {
        backupFilePath: 'test-backup-restore.json',
        backupInterval: 0, // Disable automatic backups
        changeThreshold: 999, // Very high threshold to prevent automatic backups
        showNotifications: false
      });

      await testHybridManager.initialize();

      // Phase 1: Add initial data
      const initialVectors = generateTestVectors(5);
      for (const vector of initialVectors) {
        await testHybridManager.addVector(
          vector.id,
          vector.text,
          vector.embedding,
          vector.metadata
        );
      }

      // Phase 2: Force backup
      await testHybridManager.forceBackup();
      
      // Verify backup was created
      expect(mockPlugin.app.vault.adapter.write).toHaveBeenCalled();
      const backupCall = mockPlugin.app.vault.adapter.write.mock.calls.find(
        (call: any) => call[0] === 'test-backup-restore.json'
      );
      expect(backupCall).toBeDefined();

      // Phase 3: Clear data and restore
      // Store the backup content before clearing
      const savedBackupContent = backupCall![1];
      
      // Clear the vectors directly from the underlying store to avoid automatic backup
      await vectorStore.clearAllVectors();
      expect(await testHybridManager.getVectorCount()).toBe(0);

      // Create a new mock that always returns the saved backup content
      mockPlugin.app.vault.adapter.exists = jest.fn().mockResolvedValue(true);
      mockPlugin.app.vault.adapter.read = jest.fn().mockResolvedValue(savedBackupContent);

      await testHybridManager.forceRestore();

      // Phase 4: Verify restoration
      const restoredCount = await testHybridManager.getVectorCount();
      expect(restoredCount).toBe(5);

      for (const originalVector of initialVectors) {
        const restored = await testHybridManager.getVector(originalVector.id);
        expect(restored).toBeValidVector();
        expect(restored!.id).toBe(originalVector.id);
        expect(restored!.text).toBe(originalVector.text);
      }

      // Clean up
      await testHybridManager.close();
    });

    it('should handle incremental backup correctly', async () => {
      await hybridManager.initialize();

      // Add initial batch
      const batch1 = generateTestVectors(2);
      for (const vector of batch1) {
        await hybridManager.addVector(
          vector.id,
          vector.text,
          vector.embedding,
          vector.metadata
        );
      }

      // Wait for automatic backup
      await wait(100);
      const initialBackupCalls = mockPlugin.app.vault.adapter.write.mock.calls.length;

      // Add more vectors
      const batch2 = generateTestVectors(2, 384);
      batch2[0].id = 'batch2-1';
      batch2[1].id = 'batch2-2';
      
      for (const vector of batch2) {
        await hybridManager.addVector(
          vector.id,
          vector.text,
          vector.embedding,
          vector.metadata
        );
      }

      // Wait for another backup
      await wait(100);
      const finalBackupCalls = mockPlugin.app.vault.adapter.write.mock.calls.length;

      expect(finalBackupCalls).toBeGreaterThan(initialBackupCalls);

      // Verify final state
      const totalCount = await hybridManager.getVectorCount();
      expect(totalCount).toBe(4);
    });
  });

  describe('Search and Similarity Operations', () => {
    it('should perform accurate similarity search', async () => {
      // Set up test data with known relationships - use consistent 384 dimensions
      const baseEmbedding = generateTestVector('base', 'machine learning fundamentals', 384).embedding;
      const baseVector = generateTestVector('base', 'machine learning fundamentals', 384);
      baseVector.embedding = baseEmbedding;
      baseVector.metadata = { category: 'AI', difficulty: 'beginner' };

      await hybridManager.addVector(
        baseVector.id,
        baseVector.text,
        baseVector.embedding,
        baseVector.metadata
      );

      // Add similar vectors
      const similarVectors = generateSimilarVectors(baseEmbedding, 3, 0.9);
      similarVectors[0].text = 'machine learning algorithms';
      similarVectors[1].text = 'deep learning basics';
      similarVectors[2].text = 'artificial intelligence intro';
      
      for (let i = 0; i < similarVectors.length; i++) {
        similarVectors[i].metadata = { category: 'AI', difficulty: 'intermediate' };
        await hybridManager.addVector(
          similarVectors[i].id,
          similarVectors[i].text,
          similarVectors[i].embedding,
          similarVectors[i].metadata
        );
      }

      // Add dissimilar vectors - also 384 dimensions
      const dissimilarVectors = [
        generateTestVector('cooking1', 'pasta recipes italian cuisine', 384),
        generateTestVector('sports1', 'basketball training techniques', 384)
      ];
      
      dissimilarVectors[0].metadata = { category: 'Food' };
      dissimilarVectors[1].metadata = { category: 'Sports' };

      for (const vector of dissimilarVectors) {
        await hybridManager.addVector(
          vector.id,
          vector.text,
          vector.embedding,
          vector.metadata
        );
      }

      // Use the same base embedding for the query
      const queryEmbedding = baseEmbedding;
      
      const results = await hybridManager.findSimilarVectors(queryEmbedding, 5, 0.5);
      
      expect(results.length).toBeGreaterThan(0);
      expect(results.length).toBeLessThanOrEqual(5);

      // Results should be sorted by similarity
      for (let i = 1; i < results.length; i++) {
        expect(results[i - 1].similarity).toBeGreaterThanOrEqual(results[i].similarity);
      }

      // The base vector should be most similar (similarity = 1.0)
      const baseResult = results.find(r => r.id === 'base');
      expect(baseResult).toBeDefined();
      expect(baseResult!.similarity).toBeCloseTo(1.0, 6);

      // AI-related vectors should be more similar than food/sports vectors
      const aiResults = results.filter(r => r.metadata?.category === 'AI');
      const otherResults = results.filter(r => r.metadata?.category !== 'AI');
      
      if (aiResults.length > 0 && otherResults.length > 0) {
        const minAiSimilarity = Math.min(...aiResults.map(r => r.similarity));
        const maxOtherSimilarity = Math.max(...otherResults.map(r => r.similarity));
        expect(minAiSimilarity).toBeGreaterThan(maxOtherSimilarity);
      }
    });

    it('should perform text search across all vectors', async () => {
      // Set up test data for this specific test
      const testVectors = [
        generateTestVector('ml1', 'machine learning fundamentals', 384),
        generateTestVector('ml2', 'machine learning algorithms', 384),
        generateTestVector('other1', 'cooking recipes', 384),
        generateTestVector('other2', 'sports training', 384)
      ];

      for (const vector of testVectors) {
        await hybridManager.addVector(
          vector.id,
          vector.text,
          vector.embedding,
          vector.metadata
        );
      }

      const results = await hybridManager.findVectorsByText('machine learning');
      
      expect(results.length).toBeGreaterThan(0);
      
      // All results should contain the search term
      results.forEach(result => {
        expect(result.text.toLowerCase()).toContain('machine learning');
      });

      // Should find both ML vectors
      const foundIds = results.map(r => r.id);
      expect(foundIds).toContain('ml1');
      expect(foundIds).toContain('ml2');
    });

    it('should search by metadata effectively', async () => {
      // Set up test data with specific metadata
      const baseVector = generateTestVector('base', 'machine learning fundamentals', 384);
      baseVector.metadata = { category: 'AI', difficulty: 'beginner' };

      const similarVectors = generateTestVectors(3, 384);
      similarVectors[0].id = 'similar1';
      similarVectors[0].metadata = { category: 'AI', difficulty: 'intermediate' };
      similarVectors[1].id = 'similar2';
      similarVectors[1].metadata = { category: 'AI', difficulty: 'intermediate' };
      similarVectors[2].id = 'similar3';
      similarVectors[2].metadata = { category: 'AI', difficulty: 'advanced' };

      const otherVectors = [
        generateTestVector('food1', 'cooking recipes', 384),
        generateTestVector('sports1', 'basketball training', 384)
      ];
      otherVectors[0].metadata = { category: 'Food' };
      otherVectors[1].metadata = { category: 'Sports' };

      // Add all vectors
      await hybridManager.addVector(baseVector.id, baseVector.text, baseVector.embedding, baseVector.metadata);
      for (const vector of similarVectors) {
        await hybridManager.addVector(vector.id, vector.text, vector.embedding, vector.metadata);
      }
      for (const vector of otherVectors) {
        await hybridManager.addVector(vector.id, vector.text, vector.embedding, vector.metadata);
      }

      const aiResults = await hybridManager.getVectorsByMetadata({ category: 'AI' });
      
      expect(aiResults.length).toBe(4); // base + 3 similar vectors
      
      aiResults.forEach(result => {
        expect(result.metadata.category).toBe('AI');
      });

      // Test multiple criteria
      const beginnerAiResults = await hybridManager.getVectorsByMetadata({
        category: 'AI',
        difficulty: 'beginner'
      });
      
      expect(beginnerAiResults.length).toBe(1);
      expect(beginnerAiResults[0].id).toBe('base');
    });
  });

  describe('Performance and Scalability', () => {
    it('should handle large dataset operations efficiently', async () => {
      await hybridManager.initialize();

      const largeDataset = generateTestVectors(100);
      
      // Measure insertion time
      const insertStart = Date.now();
      
      for (const vector of largeDataset) {
        await hybridManager.addVector(
          vector.id,
          vector.text,
          vector.embedding,
          vector.metadata
        );
      }
      
      const insertTime = Date.now() - insertStart;
      console.log(`Inserted 100 vectors in ${insertTime}ms`);
      
      // Verify all vectors were added
      const count = await hybridManager.getVectorCount();
      expect(count).toBe(100);

      // Measure search time
      const searchStart = Date.now();
      const queryEmbedding = largeDataset[0].embedding;
      const searchResults = await hybridManager.findSimilarVectors(queryEmbedding, 10);
      const searchTime = Date.now() - searchStart;
      
      console.log(`Searched 100 vectors in ${searchTime}ms`);
      expect(searchResults.length).toBeLessThanOrEqual(10);

      // Measure backup time
      const backupStart = Date.now();
      await hybridManager.forceBackup();
      const backupTime = Date.now() - backupStart;
      
      console.log(`Backed up 100 vectors in ${backupTime}ms`);
      expect(mockPlugin.app.vault.adapter.write).toHaveBeenCalled();
    });

    it('should handle batch operations correctly', async () => {
      await hybridManager.initialize();

      const batchSize = 20;
      const batches = 5;
      
      for (let batchIndex = 0; batchIndex < batches; batchIndex++) {
        const batchVectors = generateTestVectors(batchSize);
        
        // Add batch with unique IDs
        for (let i = 0; i < batchVectors.length; i++) {
          batchVectors[i].id = `batch-${batchIndex}-vector-${i}`;
          await hybridManager.addVector(
            batchVectors[i].id,
            batchVectors[i].text,
            batchVectors[i].embedding,
            batchVectors[i].metadata
          );
        }

        // Verify batch was added
        const currentCount = await hybridManager.getVectorCount();
        expect(currentCount).toBe((batchIndex + 1) * batchSize);
      }

      // Final verification
      const totalCount = await hybridManager.getVectorCount();
      expect(totalCount).toBe(batchSize * batches);

      // Verify we can retrieve vectors from all batches
      for (let batchIndex = 0; batchIndex < batches; batchIndex++) {
        const testId = `batch-${batchIndex}-vector-0`;
        const retrieved = await hybridManager.getVector(testId);
        expect(retrieved).toBeValidVector();
        expect(retrieved!.id).toBe(testId);
      }
    });
  });

  describe('Error Recovery and Resilience', () => {
    it('should recover from backup failures', async () => {
      await hybridManager.initialize();

      // Add some data
      const testVectors = generateTestVectors(3);
      for (const vector of testVectors) {
        await hybridManager.addVector(
          vector.id,
          vector.text,
          vector.embedding,
          vector.metadata
        );
      }

      // Simulate backup failure
      mockPlugin.app.vault.adapter.write.mockRejectedValueOnce(new Error('Backup failed'));

      // Add more data (should trigger failed backup)
      const additionalVector = generateTestVector('additional');
      await hybridManager.addVector(
        additionalVector.id,
        additionalVector.text,
        additionalVector.embedding,
        additionalVector.metadata
      );

      // Reset mock to succeed - completely reset the mock
      mockPlugin.app.vault.adapter.write.mockReset();
      mockPlugin.app.vault.adapter.write.mockResolvedValue(undefined);

      // Force backup should now succeed
      await expect(hybridManager.forceBackup()).resolves.not.toThrow();

      // Verify all data is still accessible
      const count = await hybridManager.getVectorCount();
      expect(count).toBe(4);

      for (const vector of testVectors) {
        const retrieved = await hybridManager.getVector(vector.id);
        expect(retrieved).toBeValidVector();
      }

      const additionalRetrieved = await hybridManager.getVector(additionalVector.id);
      expect(additionalRetrieved).toBeValidVector();
    });

    it('should handle corrupted backup gracefully', async () => {
      await hybridManager.initialize();

      // Add initial data
      const testVectors = generateTestVectors(2);
      for (const vector of testVectors) {
        await hybridManager.addVector(
          vector.id,
          vector.text,
          vector.embedding,
          vector.metadata
        );
      }

      // Simulate corrupted backup file
      mockPlugin.app.vault.adapter.exists.mockResolvedValue(true);
      mockPlugin.app.vault.adapter.read.mockResolvedValue('corrupted json data');

      // Restore should fail gracefully
      await expect(hybridManager.forceRestore()).rejects.toThrow();

      // But the system should still be functional
      expect(hybridManager.isReady()).toBe(true);

      // Should be able to add new data
      const newVector = generateTestVector('new-after-corruption');
      await expect(hybridManager.addVector(
        newVector.id,
        newVector.text,
        newVector.embedding,
        newVector.metadata
      )).resolves.not.toThrow();

      const retrieved = await hybridManager.getVector(newVector.id);
      expect(retrieved).toBeValidVector();
    });
  });

  describe('Cross-Platform Compatibility', () => {
    it('should work with different backup file paths', async () => {
      const customManager = new HybridVectorManager(mockPlugin, {
        backupFilePath: 'custom/path/vectors.backup.json',
        backupInterval: 1000,
        changeThreshold: 5,
        showNotifications: false
      });

      testEnv.addCleanup(() => customManager.close());

      await customManager.initialize();

      const testVector = generateTestVector();
      await customManager.addVector(
        testVector.id,
        testVector.text,
        testVector.embedding,
        testVector.metadata
      );

      await customManager.forceBackup();

      const writeCall = mockPlugin.app.vault.adapter.write.mock.calls.find(
        (call: any) => call[0] === 'custom/path/vectors.backup.json'
      );
      expect(writeCall).toBeDefined();
    });

    it('should handle different embedding dimensions', async () => {
      await hybridManager.initialize();

      // Test with different embedding sizes
      const dimensions = [128, 256, 384, 512, 1024];
      
      for (const dim of dimensions) {
        const vector = generateTestVector(`test-${dim}d`, `Test vector ${dim}D`, dim);
        
        await hybridManager.addVector(
          vector.id,
          vector.text,
          vector.embedding,
          vector.metadata
        );

        const retrieved = await hybridManager.getVector(vector.id);
        expect(retrieved).toBeValidVector();
        expect(retrieved!.embedding).toHaveLength(dim);
      }

      const count = await hybridManager.getVectorCount();
      expect(count).toBe(dimensions.length);
    });
  });
});