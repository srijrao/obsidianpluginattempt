/**
 * @file HybridVectorManager.ts
 * @description
 *   Hybrid Vector Storage System - provides seamless, efficient storage with lightweight fidelity checks
 *   
 *   Features:
 *   - Primary storage: IndexedDB for speed and efficiency
 *   - Backup/portability: Vault file for persistence and portability
 *   - Fidelity metadata: Lightweight checks for data sync
 *   - Startup sync logic: Automatic recovery and consistency
 *   - Background backup: Periodic exports with minimal overhead
 *   - User transparency: All operations happen in background
 */

import type { Plugin } from 'obsidian';
import { VectorStore } from './vectorStore';
import { debugLog } from '../../../utils/logger';
import type MyPlugin from '../../../main';

/**
 * Metadata for tracking vector store synchronization
 */
interface VectorMetadata {
  /** Total number of vectors in the store */
  vectorCount: number;
  /** Last modified timestamp */
  lastModified: number;
  /** Summary hash of all vector IDs (for quick integrity check) */
  summaryHash: string;
  /** Version of the metadata format */
  version: string;
  /** Last backup timestamp */
  lastBackup: number;
}

/**
 * Configuration options for the hybrid vector manager
 */
interface HybridVectorConfig {
  /** Path to the backup file in the vault */
  backupFilePath: string;
  /** How often to perform automatic backups (in milliseconds) */
  backupInterval: number;
  /** How many changes to accumulate before triggering a backup */
  changeThreshold: number;
  /** Whether to show user notifications for sync operations */
  showNotifications: boolean;
}

/**
 * Default configuration for the hybrid vector manager
 */
const DEFAULT_CONFIG: HybridVectorConfig = {
  backupFilePath: 'vector-backup.json',
  backupInterval: 5 * 60 * 1000, // 5 minutes
  changeThreshold: 10, // backup after 10 changes
  showNotifications: false
};

/**
 * HybridVectorManager - Seamless hybrid storage for vector embeddings
 * 
 * This class provides a wrapper around the VectorStore that automatically:
 * - Maintains backup files in the vault for portability
 * - Performs lightweight fidelity checks on startup
 * - Automatically syncs data between IndexedDB and vault files
 * - Provides transparent recovery and backup operations
 */
export class HybridVectorManager {
  private vectorStore: VectorStore;
  private plugin: MyPlugin;
  private config: HybridVectorConfig;
  private isInitialized = false;
  
  // State tracking
  private changesSinceBackup = 0;
  private lastBackupTime = 0;
  private backupTimer: NodeJS.Timeout | null = null;
  private currentMetadata: VectorMetadata | null = null;

  constructor(plugin: MyPlugin, config: Partial<HybridVectorConfig> = {}) {
    this.plugin = plugin;
    this.vectorStore = new VectorStore(plugin);
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Initialize the hybrid vector manager
   * Performs startup sync logic and sets up automatic backup
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      debugLog(this.plugin.settings.debugMode ?? false, 'info', 'Initializing HybridVectorManager...');

      // Initialize the underlying vector store
      await this.vectorStore.initialize();

      // Perform startup sync check
      await this.performStartupSync();

      // Set up automatic backup
      this.setupAutomaticBackup();

      this.isInitialized = true;
      debugLog(this.plugin.settings.debugMode ?? false, 'info', '✅ HybridVectorManager initialized successfully');

    } catch (error) {
      debugLog(this.plugin.settings.debugMode ?? false, 'error', 'Failed to initialize HybridVectorManager:', error);
      throw error;
    }
  }

  /**
   * Startup sync logic - checks fidelity and syncs data if needed
   */
  private async performStartupSync(): Promise<void> {
    try {
      // Get current metadata from IndexedDB
      const indexedDBMetadata = await this.getIndexedDBMetadata();
      
      // Get metadata from vault backup file
      const vaultMetadata = await this.getVaultMetadata();

      debugLog(this.plugin.settings.debugMode ?? false, 'info', 'Startup sync check:', {
        indexedDB: indexedDBMetadata,
        vault: vaultMetadata
      });

      // Determine if sync is needed
      const needsSync = this.needsSync(indexedDBMetadata, vaultMetadata);

      if (needsSync) {
        debugLog(this.plugin.settings.debugMode ?? false, 'info', 'Data sync required, performing restoration...');
        
        if (this.config.showNotifications) {
          new (window as any).Notice('Syncing vector data...');
        }

        await this.restoreFromVault();
        
        if (this.config.showNotifications) {
          new (window as any).Notice('Vector data sync completed');
        }
      } else {
        debugLog(this.plugin.settings.debugMode ?? false, 'info', 'Data is in sync, no restoration needed');
      }

      // Update current metadata
      this.currentMetadata = indexedDBMetadata || await this.generateMetadata();

    } catch (error) {
      debugLog(this.plugin.settings.debugMode ?? false, 'warn', 'Startup sync failed, continuing with available data:', error);
      // Continue with whatever data is available
      this.currentMetadata = await this.generateMetadata();
    }
  }

  /**
   * Determine if sync is needed based on metadata comparison
   */
  private needsSync(indexedDBMeta: VectorMetadata | null, vaultMeta: VectorMetadata | null): boolean {
    // If no IndexedDB data but vault has data, restore from vault
    if (!indexedDBMeta && vaultMeta) {
      return true;
    }

    // If IndexedDB has data but no vault backup, just update metadata
    if (indexedDBMeta && !vaultMeta) {
      return false;
    }

    // If both exist, compare for consistency
    if (indexedDBMeta && vaultMeta) {
      return (
        indexedDBMeta.vectorCount !== vaultMeta.vectorCount ||
        indexedDBMeta.summaryHash !== vaultMeta.summaryHash
      );
    }

    // No data in either location
    return false;
  }

  /**
   * Get metadata from IndexedDB vector store
   */
  private async getIndexedDBMetadata(): Promise<VectorMetadata | null> {
    try {
      const vectorCount = await this.vectorStore.getVectorCount();
      if (vectorCount === 0) {
        return null;
      }

      const allVectors = await this.vectorStore.getAllVectors();
      const summaryHash = this.generateSummaryHash(allVectors.map(v => v.id));
      const lastModified = Math.max(...allVectors.map(v => v.timestamp));

      return {
        vectorCount,
        lastModified,
        summaryHash,
        version: '1.0.0',
        lastBackup: this.lastBackupTime
      };
    } catch (error) {
      debugLog(this.plugin.settings.debugMode ?? false, 'warn', 'Failed to get IndexedDB metadata:', error);
      return null;
    }
  }

  /**
   * Get metadata from vault backup file
   */
  private async getVaultMetadata(): Promise<VectorMetadata | null> {
    try {
      const backupExists = await this.plugin.app.vault.adapter.exists(this.config.backupFilePath);
      if (!backupExists) {
        return null;
      }

      const backupContent = await this.plugin.app.vault.adapter.read(this.config.backupFilePath);
      const backupData = JSON.parse(backupContent);

      return backupData.metadata || null;
    } catch (error) {
      debugLog(this.plugin.settings.debugMode ?? false, 'warn', 'Failed to get vault metadata:', error);
      return null;
    }
  }

  /**
   * Generate a simple hash from vector IDs for integrity checking
   */
  private generateSummaryHash(vectorIds: string[]): string {
    const sortedIds = vectorIds.sort();
    const combined = sortedIds.join('|');
    
    // Simple hash function
    let hash = 0;
    for (let i = 0; i < combined.length; i++) {
      const char = combined.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    
    return Math.abs(hash).toString(36);
  }

  /**
   * Generate current metadata
   */
  private async generateMetadata(): Promise<VectorMetadata> {
    const vectorCount = await this.vectorStore.getVectorCount();
    const allVectors = await this.vectorStore.getAllVectors();
    const summaryHash = this.generateSummaryHash(allVectors.map(v => v.id));
    const lastModified = vectorCount > 0 ? Math.max(...allVectors.map(v => v.timestamp)) : Date.now();

    return {
      vectorCount,
      lastModified,
      summaryHash,
      version: '1.0.0',
      lastBackup: this.lastBackupTime
    };
  }

  /**
   * Set up automatic backup system
   */
  private setupAutomaticBackup(): void {
    // Clear any existing timer
    if (this.backupTimer) {
      clearInterval(this.backupTimer);
    }

    // Set up periodic backup
    this.backupTimer = setInterval(() => {
      this.performAutomaticBackup();
    }, this.config.backupInterval);

    debugLog(this.plugin.settings.debugMode ?? false, 'info', `Automatic backup set up with ${this.config.backupInterval}ms interval`);
  }

  /**
   * Perform automatic backup if needed
   */
  private async performAutomaticBackup(): Promise<void> {
    try {
      // Check if backup is needed
      const timeSinceLastBackup = Date.now() - this.lastBackupTime;
      const shouldBackup = (
        this.changesSinceBackup >= this.config.changeThreshold ||
        timeSinceLastBackup > this.config.backupInterval
      );

      if (shouldBackup) {
        await this.backupToVault();
      }
    } catch (error) {
      debugLog(this.plugin.settings.debugMode ?? false, 'warn', 'Automatic backup failed:', error);
    }
  }

  /**
   * Backup all vectors to vault file
   */
  async backupToVault(): Promise<void> {
    try {
      debugLog(this.plugin.settings.debugMode ?? false, 'info', 'Creating vector backup...');

      const allVectors = await this.vectorStore.getAllVectors();
      const metadata = await this.generateMetadata();

      const backupData = {
        metadata,
        exportDate: new Date().toISOString(),
        version: '1.0.0',
        totalVectors: allVectors.length,
        vectors: allVectors
      };

      // Write backup file
      const backupContent = JSON.stringify(backupData, null, 2);
      await this.plugin.app.vault.adapter.write(this.config.backupFilePath, backupContent);

      // Update state
      this.lastBackupTime = Date.now();
      this.changesSinceBackup = 0;
      this.currentMetadata = metadata;

      debugLog(this.plugin.settings.debugMode ?? false, 'info', `✅ Backup completed: ${allVectors.length} vectors saved to ${this.config.backupFilePath}`);

    } catch (error) {
      debugLog(this.plugin.settings.debugMode ?? false, 'error', 'Failed to backup to vault:', error);
      throw error;
    }
  }

  /**
   * Restore vectors from vault backup file
   */
  async restoreFromVault(): Promise<void> {
    try {
      debugLog(this.plugin.settings.debugMode ?? false, 'info', 'Restoring vectors from vault backup...');

      const backupExists = await this.plugin.app.vault.adapter.exists(this.config.backupFilePath);
      if (!backupExists) {
        debugLog(this.plugin.settings.debugMode ?? false, 'warn', 'No backup file found for restoration');
        return;
      }

      const backupContent = await this.plugin.app.vault.adapter.read(this.config.backupFilePath);
      const backupData = JSON.parse(backupContent);

      if (!backupData.vectors || !Array.isArray(backupData.vectors)) {
        throw new Error('Invalid backup file format');
      }

      // Clear existing vectors
      await this.vectorStore.clearAllVectors();

      // Import vectors from backup
      let importedCount = 0;
      for (const vectorData of backupData.vectors) {
        try {
          await this.vectorStore.addVector(
            vectorData.id,
            vectorData.text,
            vectorData.embedding,
            vectorData.metadata
          );
          importedCount++;
        } catch (error) {
          debugLog(this.plugin.settings.debugMode ?? false, 'warn', `Failed to restore vector ${vectorData.id}:`, error);
        }
      }

      // Update state
      this.changesSinceBackup = 0;
      this.lastBackupTime = Date.now();
      this.currentMetadata = await this.generateMetadata();

      debugLog(this.plugin.settings.debugMode ?? false, 'info', `✅ Restoration completed: ${importedCount} vectors restored from backup`);

    } catch (error) {
      debugLog(this.plugin.settings.debugMode ?? false, 'error', 'Failed to restore from vault:', error);
      throw error;
    }
  }

  /**
   * Track changes for automatic backup triggering
   */
  private trackChange(): void {
    this.changesSinceBackup++;
    
    // Trigger immediate backup if threshold reached
    if (this.changesSinceBackup >= this.config.changeThreshold) {
      this.performAutomaticBackup();
    }
  }

  // Wrapper methods that delegate to VectorStore and track changes

  /**
   * Add or update a vector in the store
   */
  async addVector(id: string, text: string, embedding: number[], metadata?: any): Promise<void> {
    await this.vectorStore.addVector(id, text, embedding, metadata);
    this.trackChange();
  }

  /**
   * Remove a vector from the store
   */
  async removeVector(id: string): Promise<boolean> {
    const result = await this.vectorStore.removeVector(id);
    if (result) {
      this.trackChange();
    }
    return result;
  }

  /**
   * Clear all vectors from the store
   */
  async clearAllVectors(): Promise<number> {
    const count = await this.vectorStore.clearAllVectors();
    if (count > 0) {
      this.changesSinceBackup += count; // Track multiple changes
      this.performAutomaticBackup(); // Immediate backup after clear
    }
    return count;
  }

  // Pass-through methods (no change tracking needed)

  /**
   * Get a vector by ID
   */
  async getVector(id: string) {
    return await this.vectorStore.getVector(id);
  }

  /**
   * Get all vectors
   */
  async getAllVectors() {
    return await this.vectorStore.getAllVectors();
  }

  /**
   * Get vector count
   */
  async getVectorCount(): Promise<number> {
    return await this.vectorStore.getVectorCount();
  }

  /**
   * Find similar vectors
   */
  async findSimilarVectors(queryEmbedding: number[], limit: number = 5, minSimilarity: number = 0.0) {
    return await this.vectorStore.findSimilarVectors(queryEmbedding, limit, minSimilarity);
  }

  /**
   * Search vectors by text
   */
  async findVectorsByText(searchText: string, limit: number = 10) {
    return await this.vectorStore.findVectorsByText(searchText, limit);
  }

  /**
   * Get vectors by metadata
   */
  async getVectorsByMetadata(metadataQuery: Record<string, any>, limit: number = 10) {
    return await this.vectorStore.getVectorsByMetadata(metadataQuery, limit);
  }

  /**
   * Check if the manager is ready
   */
  isReady(): boolean {
    return this.isInitialized && this.vectorStore.isReady();
  }

  /**
   * Get current status and statistics
   */
  async getStatus() {
    const vectorCount = await this.vectorStore.getVectorCount();
    const metadata = this.currentMetadata || await this.generateMetadata();
    
    return {
      isReady: this.isReady(),
      vectorCount,
      changesSinceBackup: this.changesSinceBackup,
      lastBackupTime: this.lastBackupTime,
      metadata,
      backupFilePath: this.config.backupFilePath
    };
  }

  /**
   * Force an immediate backup
   */
  async forceBackup(): Promise<void> {
    await this.backupToVault();
  }

  /**
   * Force restoration from vault
   */
  async forceRestore(): Promise<void> {
    await this.restoreFromVault();
  }

  /**
   * Clean up resources
   */
  async close(): Promise<void> {
    if (this.backupTimer) {
      clearInterval(this.backupTimer);
      this.backupTimer = null;
    }

    // Perform final backup before closing
    if (this.changesSinceBackup > 0) {
      try {
        await this.backupToVault();
      } catch (error) {
        debugLog(this.plugin.settings.debugMode ?? false, 'warn', 'Final backup failed during close:', error);
      }
    }

    await this.vectorStore.close();
    this.isInitialized = false;
  }
}
