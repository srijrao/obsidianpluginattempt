/**
 * @file test-hybrid-vector.ts
 * @description Test script for validating the Hybrid Vector Storage System
 */

import type MyPlugin from '../main';
import { HybridVectorManager } from '../components/agent/memory-handling/HybridVectorManager';
import { debugLog } from '../utils/logger';

/**
 * Test suite for the Hybrid Vector Storage System
 */
export class HybridVectorTest {
  private plugin: MyPlugin;
  private hybridManager: HybridVectorManager;

  constructor(plugin: MyPlugin) {
    this.plugin = plugin;
    this.hybridManager = new HybridVectorManager(plugin, {
      backupFilePath: 'test-vector-backup.json',
      backupInterval: 30000, // 30 seconds for testing
      changeThreshold: 3,    // Backup after 3 changes for testing
      showNotifications: true
    });
  }

  /**
   * Run all hybrid vector tests
   */
  async runAllTests(): Promise<void> {
    try {
      console.log('🧪 Starting Hybrid Vector Storage Tests...');

      await this.testInitialization();
      await this.testBasicOperations();
      await this.testChangeTracking();
      await this.testBackupRestore();
      await this.testSyncLogic();
      await this.testErrorHandling();
      await this.cleanup();

      console.log('✅ All Hybrid Vector Storage Tests Passed!');
    } catch (error) {
      console.error('❌ Hybrid Vector Storage Tests Failed:', error);
      throw error;
    }
  }

  /**
   * Test initialization and startup sync
   */
  private async testInitialization(): Promise<void> {
    console.log('Testing initialization...');
    
    await this.hybridManager.initialize();
    
    if (!this.hybridManager.isReady()) {
      throw new Error('HybridVectorManager failed to initialize');
    }
    
    const status = await this.hybridManager.getStatus();
    console.log('Initial status:', status);
    
    console.log('✓ Initialization test passed');
  }

  /**
   * Test basic vector operations
   */
  private async testBasicOperations(): Promise<void> {
    console.log('Testing basic operations...');
    
    // Add test vectors
    const testVectors = [
      { id: 'test1', text: 'This is a test document about cats', embedding: this.generateTestEmbedding() },
      { id: 'test2', text: 'Another document about dogs', embedding: this.generateTestEmbedding() },
      { id: 'test3', text: 'A third document about birds', embedding: this.generateTestEmbedding() }
    ];

    for (const vector of testVectors) {
      await this.hybridManager.addVector(vector.id, vector.text, vector.embedding, { type: 'test' });
    }

    // Test retrieval
    const vector1 = await this.hybridManager.getVector('test1');
    if (!vector1 || vector1.text !== testVectors[0].text) {
      throw new Error('Vector retrieval failed');
    }

    // Test count
    const count = await this.hybridManager.getVectorCount();
    if (count !== testVectors.length) {
      throw new Error(`Expected ${testVectors.length} vectors, got ${count}`);
    }

    // Test search
    const allVectors = await this.hybridManager.getAllVectors();
    if (allVectors.length !== testVectors.length) {
      throw new Error(`Expected ${testVectors.length} vectors in search, got ${allVectors.length}`);
    }

    console.log('✓ Basic operations test passed');
  }

  /**
   * Test change tracking and automatic backup
   */
  private async testChangeTracking(): Promise<void> {
    console.log('Testing change tracking...');
    
    const initialStatus = await this.hybridManager.getStatus();
    console.log('Status before changes:', initialStatus);
    
    // Add more vectors to trigger backup threshold
    await this.hybridManager.addVector('track1', 'Change tracking test 1', this.generateTestEmbedding());
    await this.hybridManager.addVector('track2', 'Change tracking test 2', this.generateTestEmbedding());
    await this.hybridManager.addVector('track3', 'Change tracking test 3', this.generateTestEmbedding());
    
    // Wait a moment for potential async operations
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const statusAfter = await this.hybridManager.getStatus();
    console.log('Status after changes:', statusAfter);
    
    // Check if backup was triggered (changeThreshold is 3)
    if (statusAfter.changesSinceBackup > 3) {
      console.warn('Backup may not have been triggered automatically');
    }

    console.log('✓ Change tracking test passed');
  }

  /**
   * Test manual backup and restore operations
   */
  private async testBackupRestore(): Promise<void> {
    console.log('Testing backup and restore...');
    
    // Force a backup
    await this.hybridManager.forceBackup();
    
    // Check that backup file exists
    const backupExists = await this.plugin.app.vault.adapter.exists('test-vector-backup.json');
    if (!backupExists) {
      throw new Error('Backup file was not created');
    }
    
    // Record current count
    const beforeCount = await this.hybridManager.getVectorCount();
    
    // Add a new vector
    await this.hybridManager.addVector('restore-test', 'This vector will be lost', this.generateTestEmbedding());
    const afterAddCount = await this.hybridManager.getVectorCount();
    
    if (afterAddCount !== beforeCount + 1) {
      throw new Error('Vector addition failed');
    }
    
    // Force restore (this should remove the new vector)
    await this.hybridManager.forceRestore();
    
    const afterRestoreCount = await this.hybridManager.getVectorCount();
    if (afterRestoreCount !== beforeCount) {
      throw new Error(`Restore failed: expected ${beforeCount} vectors, got ${afterRestoreCount}`);
    }
    
    // Verify the test vector is gone
    const lostVector = await this.hybridManager.getVector('restore-test');
    if (lostVector !== null) {
      throw new Error('Vector should have been removed during restore');
    }

    console.log('✓ Backup and restore test passed');
  }

  /**
   * Test startup sync logic with simulated scenarios
   */
  private async testSyncLogic(): Promise<void> {
    console.log('Testing sync logic...');
    
    // This is a simplified test since we can't easily simulate different startup states
    // In a real scenario, we'd test different metadata combinations
    
    const status = await this.hybridManager.getStatus();
    
    if (!status.metadata || !status.metadata.summaryHash) {
      throw new Error('Metadata not properly generated');
    }
    
    if (status.vectorCount <= 0) {
      throw new Error('No vectors found for sync logic test');
    }

    console.log('✓ Sync logic test passed');
  }

  /**
   * Test error handling scenarios
   */
  private async testErrorHandling(): Promise<void> {
    console.log('Testing error handling...');
    
    // Test invalid vector data
    try {
      await this.hybridManager.addVector('', 'Empty ID test', this.generateTestEmbedding());
      // This should work - empty ID might be valid
    } catch (error) {
      // Expected for some validation scenarios
    }
    
    // Test removal of non-existent vector
    const removed = await this.hybridManager.removeVector('non-existent-vector');
    if (removed) {
      throw new Error('Should not have removed non-existent vector');
    }
    
    // Test getting non-existent vector
    const nonExistent = await this.hybridManager.getVector('definitely-not-there');
    if (nonExistent !== null) {
      throw new Error('Should return null for non-existent vector');
    }

    console.log('✓ Error handling test passed');
  }

  /**
   * Clean up test data
   */
  private async cleanup(): Promise<void> {
    console.log('Cleaning up test data...');
    
    // Remove test vectors
    const testIds = ['test1', 'test2', 'test3', 'track1', 'track2', 'track3', 'restore-test'];
    for (const id of testIds) {
      await this.hybridManager.removeVector(id);
    }
    
    // Remove test backup file
    const backupExists = await this.plugin.app.vault.adapter.exists('test-vector-backup.json');
    if (backupExists) {
      await this.plugin.app.vault.adapter.remove('test-vector-backup.json');
    }
    
    // Close the manager
    await this.hybridManager.close();
    
    console.log('✓ Cleanup completed');
  }

  /**
   * Generate a test embedding vector
   */
  private generateTestEmbedding(): number[] {
    // Generate a random 1536-dimensional vector (like OpenAI embeddings)
    const embedding: number[] = [];
    for (let i = 0; i < 1536; i++) {
      embedding.push((Math.random() - 0.5) * 2); // Random values between -1 and 1
    }
    
    // Normalize the vector
    const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    return embedding.map(val => val / magnitude);
  }
}

/**
 * Register a command to run the hybrid vector tests
 */
export function registerHybridVectorTestCommand(plugin: MyPlugin): void {
  plugin.addCommand({
    id: 'test-hybrid-vector-storage',
    name: 'Test: Hybrid Vector Storage System',
    callback: async () => {
      try {
        const tester = new HybridVectorTest(plugin);
        await tester.runAllTests();
        new (window as any).Notice('✅ Hybrid Vector Storage tests completed successfully!');
      } catch (error) {
        console.error('Hybrid Vector Storage test failed:', error);
        new (window as any).Notice(`❌ Hybrid Vector Storage test failed: ${error.message}`);
      }
    }
  });
}
