/**
 * @file vectorStoreExample.ts
 * @description Example usage of the cross-platform VectorStore implementation
 */

import { Plugin } from 'obsidian';
import { VectorStore } from '../src/components/agent/memory-handling/vectorStore';

/**
 * Example class demonstrating VectorStore usage
 */
export class VectorStoreExample {
  private vectorStore: VectorStore;
  private plugin: Plugin;

  constructor(plugin: Plugin) {
    this.plugin = plugin;
    this.vectorStore = new VectorStore(plugin);
  }

  /**
   * Initialize the vector store (call this first!)
   */
  async initialize(): Promise<boolean> {
    try {
      await this.vectorStore.initialize();
      console.log('VectorStore initialized successfully');
      return true;
    } catch (error) {
      console.error('Failed to initialize VectorStore:', error);
      return false;
    }
  }

  /**
   * Example: Adding text embeddings
   */
  async addDocumentEmbeddings(): Promise<void> {
    try {
      // Example embeddings (normally you'd get these from an AI service)
      const documents = [
        {
          id: 'doc-1',
          text: 'This is about machine learning and artificial intelligence.',
          embedding: Array.from({length: 512}, () => Math.random()), // Mock 512-dim embedding
          metadata: { type: 'document', category: 'AI', created: new Date().toISOString() }
        },
        {
          id: 'doc-2', 
          text: 'This document discusses cooking and recipes.',
          embedding: Array.from({length: 512}, () => Math.random()),
          metadata: { type: 'document', category: 'cooking', created: new Date().toISOString() }
        },
        {
          id: 'doc-3',
          text: 'Programming concepts and software development.',
          embedding: Array.from({length: 512}, () => Math.random()),
          metadata: { type: 'document', category: 'programming', created: new Date().toISOString() }
        }
      ];

      // Add documents to vector store
      for (const doc of documents) {
        await this.vectorStore.addVector(doc.id, doc.text, doc.embedding, doc.metadata);
        console.log(`Added document: ${doc.id}`);
      }

      console.log(`Added ${documents.length} documents to vector store`);
    } catch (error) {
      console.error('Failed to add document embeddings:', error);
    }
  }

  /**
   * Example: Semantic search using vector similarity
   */
  async searchSimilarDocuments(queryText: string, queryEmbedding: number[]): Promise<void> {
    try {
      // Find similar vectors using cosine similarity
      const similarVectors = await this.vectorStore.findSimilarVectors(
        queryEmbedding,
        3, // top 3 results
        0.5 // minimum similarity threshold
      );

      console.log(`\nSearch results for: "${queryText}"`);
      console.log('='.repeat(50));

      if (similarVectors.length === 0) {
        console.log('No similar documents found');
        return;
      }

      similarVectors.forEach((result, index) => {
        console.log(`${index + 1}. Similarity: ${result.similarity.toFixed(3)}`);
        console.log(`   Text: ${result.text.substring(0, 100)}...`);
        console.log(`   Metadata: ${JSON.stringify(result.metadata)}`);
        console.log('');
      });
    } catch (error) {
      console.error('Failed to search similar documents:', error);
    }
  }

  /**
   * Example: Text-based search
   */
  async searchByText(searchTerm: string): Promise<void> {
    try {
      const results = await this.vectorStore.searchByText(searchTerm, 5);
      
      console.log(`\nText search results for: "${searchTerm}"`);
      console.log('='.repeat(50));

      if (results.length === 0) {
        console.log('No documents found');
        return;
      }

      results.forEach((result, index) => {
        console.log(`${index + 1}. ${result.text}`);
        console.log(`   Metadata: ${JSON.stringify(result.metadata)}`);
        console.log('');
      });
    } catch (error) {
      console.error('Failed to search by text:', error);
    }
  }

  /**
   * Example: Get documents by metadata
   */
  async getDocumentsByCategory(category: string): Promise<void> {
    try {
      const results = await this.vectorStore.getVectorsByMetadata(
        { category: category },
        10
      );

      console.log(`\nDocuments in category: "${category}"`);
      console.log('='.repeat(50));

      if (results.length === 0) {
        console.log('No documents found in this category');
        return;
      }

      results.forEach((result, index) => {
        console.log(`${index + 1}. ${result.text.substring(0, 100)}...`);
        console.log(`   Metadata: ${JSON.stringify(result.metadata)}`);
        console.log('');
      });
    } catch (error) {
      console.error('Failed to get documents by category:', error);
    }
  }

  /**
   * Example: Get vector store statistics
   */
  async getStatistics(): Promise<void> {
    try {
      const count = await this.vectorStore.getVectorCount();
      console.log(`\nVector Store Statistics`);
      console.log('='.repeat(30));
      console.log(`Total vectors: ${count}`);
      
      // Get sample of all vectors to show metadata distribution
      const allVectors = await this.vectorStore.getAllVectors();
      const categories = new Map<string, number>();
      
      allVectors.forEach(vector => {
        if (vector.metadata) {
          try {
            const metadata = JSON.parse(vector.metadata);
            const category = metadata.category || 'unknown';
            categories.set(category, (categories.get(category) || 0) + 1);
          } catch (e) {
            // Skip malformed metadata
          }
        }
      });

      console.log('\nCategory distribution:');
      categories.forEach((count, category) => {
        console.log(`  ${category}: ${count}`);
      });
    } catch (error) {
      console.error('Failed to get statistics:', error);
    }
  }

  /**
   * Example: Cleanup and data management
   */
  async performMaintenance(): Promise<void> {
    try {
      console.log('Performing vector store maintenance...');
      
      // Get statistics before cleanup
      const beforeCount = await this.vectorStore.getVectorCount();
      console.log(`Vectors before cleanup: ${beforeCount}`);

      // Example: Remove old documents (older than 30 days)
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - 30);
      
      const allVectors = await this.vectorStore.getAllVectors();
      let deletedCount = 0;

      for (const vector of allVectors) {
        if (vector.metadata) {
          try {
            const metadata = JSON.parse(vector.metadata);
            if (metadata.created && new Date(metadata.created) < cutoffDate) {
              await this.vectorStore.deleteVector(vector.id);
              deletedCount++;
            }
          } catch (e) {
            // Skip malformed metadata
          }
        }
      }

      const afterCount = await this.vectorStore.getVectorCount();
      console.log(`Deleted ${deletedCount} old vectors`);
      console.log(`Vectors after cleanup: ${afterCount}`);
    } catch (error) {
      console.error('Failed to perform maintenance:', error);
    }
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    try {
      await this.vectorStore.close();
      console.log('VectorStore closed successfully');
    } catch (error) {
      console.error('Failed to close VectorStore:', error);
    }
  }

  /**
   * Complete demonstration workflow
   */
  async runDemo(): Promise<void> {
    console.log('='.repeat(60));
    console.log('VectorStore Cross-Platform Demo');
    console.log('='.repeat(60));

    // Initialize
    const initialized = await this.initialize();
    if (!initialized) {
      console.log('Demo cancelled due to initialization failure');
      return;
    }

    try {
      // Add sample data
      await this.addDocumentEmbeddings();
      await this.getStatistics();

      // Demonstrate search capabilities
      const queryEmbedding = Array.from({length: 512}, () => Math.random());
      await this.searchSimilarDocuments('machine learning concepts', queryEmbedding);
      await this.searchByText('cooking');
      await this.getDocumentsByCategory('AI');

      // Maintenance example
      await this.performMaintenance();
      await this.getStatistics();

    } finally {
      // Always cleanup
      await this.cleanup();
    }

    console.log('='.repeat(60));
    console.log('Demo completed');
    console.log('='.repeat(60));
  }
}

/**
 * Example integration with Obsidian Plugin
 */
export class ExamplePlugin extends Plugin {
  private vectorStoreExample: VectorStoreExample;

  async onload() {
    console.log('Loading VectorStore Example Plugin');
    
    this.vectorStoreExample = new VectorStoreExample(this);
    
    // Add command to run demo
    this.addCommand({
      id: 'run-vectorstore-demo',
      name: 'Run VectorStore Demo',
      callback: async () => {
        await this.vectorStoreExample.runDemo();
      }
    });

    // Initialize vector store on plugin load
    const initialized = await this.vectorStoreExample.initialize();
    if (!initialized) {
      console.warn('VectorStore initialization failed - vector features disabled');
    }
  }

  async onunload() {
    console.log('Unloading VectorStore Example Plugin');
    
    if (this.vectorStoreExample) {
      await this.vectorStoreExample.cleanup();
    }
  }
}
