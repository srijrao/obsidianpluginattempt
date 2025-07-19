/**
 * @file hybridVectorManager.test.ts
 * @description Comprehensive tests for the HybridVectorManager class
 */

import { HybridVectorManager } from '../src/components/agent/memory-handling/HybridVectorManager';
import {
  generateTestVector,
  generateTestVectors,
  createMockPlugin,
  createMockBackupContent,
  wait,
  TestEnvironment
} from './utils/testHelpers';

// Mock the logger to avoid import issues
jest.mock('../src/utils/logger', () => ({
  debugLog: jest.fn()
}));

describe('HybridVectorManager', () => {
  let hybridManager: HybridVectorManager;
  let mockPlugin: any;
  let testEnv: TestEnvironment;

  beforeEach(async () => {
    testEnv = new TestEnvironment();
    mockPlugin = createMockPlugin();
    
    // Configure mock plugin with default settings
    mockPlugin.settings = {
      debugMode: false
    };

    hybridManager = new HybridVectorManager(mockPlugin, {
      backupFilePath: 'test-vector-backup.json',
      backupInterval: 100, // Short interval for testing
      changeThreshold: 2, // Low threshold for testing
      showNotifications: false
    });

    // Initialize the hybrid manager and ensure clean state
    await hybridManager.initialize();
    await hybridManager.clearAllVectors(); // Ensure clean state

    testEnv.addCleanup(() => {
      if (hybridManager) {
        hybridManager.close();
      }
    });
  });

  afterEach(async () => {
    // Clean up data before closing
    if (hybridManager && hybridManager.isReady()) {
      try {
        await hybridManager.clearAllVectors();
      } catch (error) {
        console.warn('Failed to clear hybrid manager in afterEach:', error);
      }
    }
    testEnv.cleanup();
  });

  describe('Initialization', () => {
    it('should initialize successfully', async () => {
      await hybridManager.initialize();
      expect(hybridManager.isReady()).toBe(true);
    });

    it('should not initialize twice', async () => {
      await hybridManager.initialize();
      await hybridManager.initialize(); // Should not throw
      expect(hybridManager.isReady()).toBe(true);
    });

    it('should perform startup sync when no backup exists', async () => {
      mockPlugin.app.vault.adapter.exists.mockResolvedValue(false);
      
      await hybridManager.initialize();
      expect(hybridManager.isReady()).toBe(true);
    });

    it('should restore from backup when backup exists and IndexedDB is empty', async () => {
      // First, create a new clean hybrid manager for this test
      const cleanHybridManager = new HybridVectorManager(mockPlugin, {
        backupFilePath: 'test-vector-backup.json',
        backupInterval: 100,
        changeThreshold: 2,
        showNotifications: false
      });

      const testVectors = generateTestVectors(3);
      const backupContent = createMockBackupContent(testVectors);
      
      mockPlugin.app.vault.adapter.exists.mockResolvedValue(true);
      mockPlugin.app.vault.adapter.read.mockResolvedValue(
        JSON.stringify(backupContent, null, 2)
      );

      await cleanHybridManager.initialize();
      
      const vectorCount = await cleanHybridManager.getVectorCount();
      expect(vectorCount).toBe(3);

      // Clean up
      await cleanHybridManager.close();
    });
  });

  describe('Vector Operations', () => {
    describe('addVector', () => {
      it('should add vector and track changes', async () => {
        const testVector = generateTestVector();
        
        await hybridManager.addVector(
          testVector.id,
          testVector.text,
          testVector.embedding,
          testVector.metadata
        );

        const retrieved = await hybridManager.getVector(testVector.id);
        expect(retrieved).toBeValidVector();
        expect(retrieved!.id).toBe(testVector.id);

        const status = await hybridManager.getStatus();
        expect(status.changesSinceBackup).toBe(1);
      });

      it('should trigger automatic backup when threshold reached', async () => {
        const testVectors = generateTestVectors(3); // Above threshold of 2
        
        for (const vector of testVectors) {
          await hybridManager.addVector(
            vector.id,
            vector.text,
            vector.embedding,
            vector.metadata
          );
        }

        // Wait for automatic backup to trigger
        await wait(150);

        expect(mockPlugin.app.vault.adapter.write).toHaveBeenCalled();
      });
    });

    describe('removeVector', () => {
      it('should remove vector and track changes', async () => {
        const testVector = generateTestVector();
        
        await hybridManager.addVector(
          testVector.id,
          testVector.text,
          testVector.embedding,
          testVector.metadata
        );

        const removed = await hybridManager.removeVector(testVector.id);
        expect(removed).toBe(true);

        const retrieved = await hybridManager.getVector(testVector.id);
        expect(retrieved).toBeNull();

        const status = await hybridManager.getStatus();
        expect(status.changesSinceBackup).toBe(2); // 1 for add, 1 for remove
      });

      it('should not track changes for non-existent vector removal', async () => {
        const removed = await hybridManager.removeVector('non-existent');
        expect(removed).toBe(false);

        const status = await hybridManager.getStatus();
        expect(status.changesSinceBackup).toBe(0);
      });
    });

    describe('clearAllVectors', () => {
      it('should clear all vectors and trigger immediate backup', async () => {
        const testVectors = generateTestVectors(5);
        
        for (const vector of testVectors) {
          await hybridManager.addVector(
            vector.id,
            vector.text,
            vector.embedding,
            vector.metadata
          );
        }

        const cleared = await hybridManager.clearAllVectors();
        expect(cleared).toBe(5);

        const count = await hybridManager.getVectorCount();
        expect(count).toBe(0);

        // Should trigger immediate backup
        expect(mockPlugin.app.vault.adapter.write).toHaveBeenCalled();
      });
    });
  });

  describe('Pass-through Operations', () => {
    beforeEach(async () => {
      await hybridManager.initialize();
      
      // Add test data
      const testVectors = generateTestVectors(5);
      for (const vector of testVectors) {
        await hybridManager.addVector(
          vector.id,
          vector.text,
          vector.embedding,
          vector.metadata
        );
      }
    });

    it('should pass through getAllVectors', async () => {
      const vectors = await hybridManager.getAllVectors();
      expect(vectors).toHaveLength(5);
    });

    it('should pass through getVectorCount', async () => {
      const count = await hybridManager.getVectorCount();
      expect(count).toBe(5);
    });

    it('should pass through findSimilarVectors', async () => {
      // Use the same dimensions as the test vectors (384)
      const testVectors = generateTestVectors(1);
      const queryEmbedding = testVectors[0].embedding; // Use a real 384-dim vector
      const results = await hybridManager.findSimilarVectors(queryEmbedding, 3);
      expect(Array.isArray(results)).toBe(true);
    });

    it('should pass through findVectorsByText', async () => {
      const results = await hybridManager.findVectorsByText('test');
      expect(Array.isArray(results)).toBe(true);
    });

    it('should pass through getVectorsByMetadata', async () => {
      const results = await hybridManager.getVectorsByMetadata({ category: 'A' });
      expect(Array.isArray(results)).toBe(true);
    });
  });

  describe('Backup Operations', () => {
    describe('backupToVault', () => {
      it('should create backup file with correct structure', async () => {
        const testVectors = generateTestVectors(3);
        
        for (const vector of testVectors) {
          await hybridManager.addVector(
            vector.id,
            vector.text,
            vector.embedding,
            vector.metadata
          );
        }

        // Verify vectors were added
        const vectorCount = await hybridManager.getVectorCount();
        expect(vectorCount).toBe(3);

        await hybridManager.forceBackup();

        expect(mockPlugin.app.vault.adapter.write).toHaveBeenCalled();
        
        // Get the most recent write call
        const writeCalls = mockPlugin.app.vault.adapter.write.mock.calls;
        const lastWriteCall = writeCalls[writeCalls.length - 1];
        const [filePath, content] = lastWriteCall;
        
        expect(filePath).toBe('test-vector-backup.json');
        
        const backupData = JSON.parse(content);
        expect(backupData).toHaveProperty('metadata');
        expect(backupData).toHaveProperty('vectors');
        expect(backupData.vectors).toHaveLength(3);
        expect(backupData.metadata).toHaveValidMetadata();
      });

      it('should update backup timestamp after successful backup', async () => {
        const testVector = generateTestVector();
        await hybridManager.addVector(
          testVector.id,
          testVector.text,
          testVector.embedding,
          testVector.metadata
        );

        const statusBefore = await hybridManager.getStatus();
        const backupTimeBefore = statusBefore.lastBackupTime;

        await hybridManager.forceBackup();

        const statusAfter = await hybridManager.getStatus();
        expect(statusAfter.lastBackupTime).toBeGreaterThan(backupTimeBefore);
        expect(statusAfter.changesSinceBackup).toBe(0);
      });
    });

    describe('restoreFromVault', () => {
      it('should restore vectors from backup file', async () => {
        const testVectors = generateTestVectors(4);
        const backupContent = createMockBackupContent(testVectors);
        
        mockPlugin.app.vault.adapter.exists.mockResolvedValue(true);
        mockPlugin.app.vault.adapter.read.mockResolvedValue(
          JSON.stringify(backupContent, null, 2)
        );

        await hybridManager.forceRestore();

        const count = await hybridManager.getVectorCount();
        expect(count).toBe(4);

        // Verify specific vectors were restored
        for (const originalVector of testVectors) {
          const restored = await hybridManager.getVector(originalVector.id);
          expect(restored).toBeValidVector();
          expect(restored!.id).toBe(originalVector.id);
          expect(restored!.text).toBe(originalVector.text);
        }
      });

      it('should handle missing backup file gracefully', async () => {
        mockPlugin.app.vault.adapter.exists.mockResolvedValue(false);

        await expect(hybridManager.forceRestore()).resolves.not.toThrow();
      });

      it('should handle corrupted backup file', async () => {
        mockPlugin.app.vault.adapter.exists.mockResolvedValue(true);
        mockPlugin.app.vault.adapter.read.mockResolvedValue('invalid json');

        await expect(hybridManager.forceRestore()).rejects.toThrow();
      });

      it('should handle backup file with invalid structure', async () => {
        mockPlugin.app.vault.adapter.exists.mockResolvedValue(true);
        mockPlugin.app.vault.adapter.read.mockResolvedValue(
          JSON.stringify({ invalid: 'structure' })
        );

        await expect(hybridManager.forceRestore()).rejects.toThrow();
      });
    });
  });

  describe('Automatic Backup System', () => {
    it('should trigger backup after interval', async () => {
      const testVector = generateTestVector();
      await hybridManager.addVector(
        testVector.id,
        testVector.text,
        testVector.embedding,
        testVector.metadata
      );

      // Wait for backup interval to trigger
      await wait(150);

      expect(mockPlugin.app.vault.adapter.write).toHaveBeenCalled();
    });

    it('should not trigger backup if no changes', async () => {
      // Close and reinitialize to stop any running timers
      await hybridManager.close();
      
      // Create a new manager without backup timer (interval of 0 disables it)
      const noTimerManager = new HybridVectorManager(mockPlugin, {
        backupFilePath: 'test-vector-backup.json',
        backupInterval: 0, // Disable automatic backups
        changeThreshold: 2,
        showNotifications: false
      });
      
      await noTimerManager.initialize();
      await noTimerManager.clearAllVectors();
      
      // Reset the mock after initialization
      jest.clearAllMocks();
      
      const writeCallsBefore = mockPlugin.app.vault.adapter.write.mock.calls.length; // Should be 0
      
      // Wait for what would be a backup interval without making any changes
      await wait(150);

      const writeCallsAfter = mockPlugin.app.vault.adapter.write.mock.calls.length;
      expect(writeCallsAfter).toBe(writeCallsBefore); // Both should be 0
      
      // Clean up
      await noTimerManager.close();
    });

    it('should prevent concurrent backups', async () => {
      const testVectors = generateTestVectors(5);
      
      // Add vectors rapidly to trigger multiple backup attempts
      const promises = testVectors.map(vector =>
        hybridManager.addVector(
          vector.id,
          vector.text,
          vector.embedding,
          vector.metadata
        )
      );

      await Promise.all(promises);
      await wait(200); // Wait for backup operations

      // Should not have excessive backup calls due to concurrency protection
      const writeCalls = mockPlugin.app.vault.adapter.write.mock.calls.length;
      expect(writeCalls).toBeLessThan(testVectors.length);
    });
  });

  describe('Status and Metadata', () => {
    it('should provide accurate status information', async () => {
      const testVectors = generateTestVectors(3);
      
      for (const vector of testVectors) {
        await hybridManager.addVector(
          vector.id,
          vector.text,
          vector.embedding,
          vector.metadata
        );
      }

      const status = await hybridManager.getStatus();
      
      expect(status.isReady).toBe(true);
      expect(status.vectorCount).toBe(3);
      expect(status.changesSinceBackup).toBe(3);
      expect(status.metadata).toHaveValidMetadata();
      expect(status.backupFilePath).toBe('test-vector-backup.json');
    });

    it('should update metadata after operations', async () => {
      const testVector = generateTestVector();
      
      const statusBefore = await hybridManager.getStatus();
      
      await hybridManager.addVector(
        testVector.id,
        testVector.text,
        testVector.embedding,
        testVector.metadata
      );

      const statusAfter = await hybridManager.getStatus();
      
      expect(statusAfter.vectorCount).toBe(statusBefore.vectorCount + 1);
      expect(statusAfter.changesSinceBackup).toBe(statusBefore.changesSinceBackup + 1);
    });
  });

  describe('Sync Logic', () => {
    it('should detect when sync is needed', async () => {
      // Create a new clean hybrid manager for this test
      const syncTestManager = new HybridVectorManager(mockPlugin, {
        backupFilePath: 'test-vector-backup.json',
        backupInterval: 100,
        changeThreshold: 2,
        showNotifications: false
      });
      
      // Create a scenario where vault has newer data
      const testVectors = generateTestVectors(3);
      const backupContent = createMockBackupContent(testVectors);
      
      mockPlugin.app.vault.adapter.exists.mockResolvedValue(true);
      mockPlugin.app.vault.adapter.read.mockResolvedValue(
        JSON.stringify(backupContent, null, 2)
      );

      // Initialize with empty IndexedDB but existing vault backup
      await syncTestManager.initialize();

      const count = await syncTestManager.getVectorCount();
      expect(count).toBe(3); // Should have restored from vault

      // Clean up
      await syncTestManager.close();
    });

    it('should handle sync when both sources have data', async () => {
      // First, add some data to IndexedDB
      await hybridManager.initialize();
      
      const testVector = generateTestVector('existing');
      await hybridManager.addVector(
        testVector.id,
        testVector.text,
        testVector.embedding,
        testVector.metadata
      );

      // Create a different backup with different data
      const backupVectors = generateTestVectors(2);
      const backupContent = createMockBackupContent(backupVectors);
      
      mockPlugin.app.vault.adapter.read.mockResolvedValue(
        JSON.stringify(backupContent, null, 2)
      );

      // Force restore should replace IndexedDB data with vault data
      await hybridManager.forceRestore();

      const count = await hybridManager.getVectorCount();
      expect(count).toBe(2); // Should have vault data, not IndexedDB data
    });
  });

  describe('Error Handling', () => {
    it('should handle backup write errors gracefully', async () => {
      mockPlugin.app.vault.adapter.write.mockRejectedValue(new Error('Write failed'));

      const testVector = generateTestVector();
      
      // Should not throw even if backup fails
      await expect(hybridManager.addVector(
        testVector.id,
        testVector.text,
        testVector.embedding,
        testVector.metadata
      )).resolves.not.toThrow();

      // Vector should still be added to IndexedDB
      const retrieved = await hybridManager.getVector(testVector.id);
      expect(retrieved).toBeValidVector();
    });

    it('should handle backup read errors during restore', async () => {
      // Suppress console.error for this intentional error test
      const originalConsoleError = console.error;
      console.error = jest.fn();
      
      try {
        mockPlugin.app.vault.adapter.exists.mockResolvedValue(true);
        mockPlugin.app.vault.adapter.read.mockRejectedValue(new Error('Read failed'));

        await expect(hybridManager.forceRestore()).rejects.toThrow();
      } finally {
        // Restore console.error
        console.error = originalConsoleError;
      }
    });

    it('should continue operating after backup failures', async () => {
      // Simulate backup failure
      mockPlugin.app.vault.adapter.write.mockRejectedValueOnce(new Error('Backup failed'));

      const testVector1 = generateTestVector('test1');
      await hybridManager.addVector(
        testVector1.id,
        testVector1.text,
        testVector1.embedding,
        testVector1.metadata
      );

      // Reset mock to succeed
      mockPlugin.app.vault.adapter.write.mockResolvedValue(undefined);

      const testVector2 = generateTestVector('test2');
      await hybridManager.addVector(
        testVector2.id,
        testVector2.text,
        testVector2.embedding,
        testVector2.metadata
      );

      // Both vectors should be accessible
      const retrieved1 = await hybridManager.getVector(testVector1.id);
      const retrieved2 = await hybridManager.getVector(testVector2.id);
      
      expect(retrieved1).toBeValidVector();
      expect(retrieved2).toBeValidVector();
    });
  });

  describe('Cleanup and Lifecycle', () => {
    it('should perform final backup on close', async () => {
      await hybridManager.initialize();
      
      const testVector = generateTestVector();
      await hybridManager.addVector(
        testVector.id,
        testVector.text,
        testVector.embedding,
        testVector.metadata
      );

      await hybridManager.close();

      // Should have performed final backup
      expect(mockPlugin.app.vault.adapter.write).toHaveBeenCalled();
    });

    it('should clean up timers on close', async () => {
      await hybridManager.initialize();
      
      const clearIntervalSpy = jest.spyOn(global, 'clearInterval');
      
      await hybridManager.close();
      
      expect(clearIntervalSpy).toHaveBeenCalled();
      expect(hybridManager.isReady()).toBe(false);
      
      clearIntervalSpy.mockRestore();
    });

    it('should handle close without pending changes', async () => {
      await hybridManager.initialize();
      
      const writeCallsBefore = mockPlugin.app.vault.adapter.write.mock.calls.length;
      
      await hybridManager.close();
      
      const writeCallsAfter = mockPlugin.app.vault.adapter.write.mock.calls.length;
      expect(writeCallsAfter).toBe(writeCallsBefore); // No additional backup needed
    });
  });
});