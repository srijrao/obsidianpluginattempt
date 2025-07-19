/**
 * @file testHelpers.ts
 * @description Test utilities for vector store testing
 */

import { Plugin } from 'obsidian';

/**
 * Interface for test vector data
 */
export interface TestVectorData {
  id: string;
  text: string;
  embedding: number[];
  metadata?: any;
  timestamp: number;
}

/**
 * Generate a random embedding vector of specified dimensions
 */
export function generateRandomEmbedding(dimensions: number = 384): number[] {
  const embedding: number[] = [];
  for (let i = 0; i < dimensions; i++) {
    // Generate random numbers between -1 and 1
    embedding.push((Math.random() - 0.5) * 2);
  }
  
  // Normalize the vector
  const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
  return embedding.map(val => val / magnitude);
}

/**
 * Generate test vector data
 */
export function generateTestVector(
  id?: string,
  text?: string,
  embeddingDimensions: number = 384,
  metadata?: any
): TestVectorData {
  return {
    id: id || `test-vector-${Math.random().toString(36).substr(2, 9)}`,
    text: text || `Test text content for vector ${id || 'unknown'}`,
    embedding: generateRandomEmbedding(embeddingDimensions),
    metadata: metadata || { source: 'test', type: 'generated' },
    timestamp: Date.now()
  };
}

/**
 * Generate multiple test vectors
 */
export function generateTestVectors(
  count: number,
  embeddingDimensions: number = 384
): TestVectorData[] {
  const vectors: TestVectorData[] = [];
  for (let i = 0; i < count; i++) {
    vectors.push(generateTestVector(
      `test-vector-${i}`,
      `Test content for vector ${i}. This is sample text that would be embedded.`,
      embeddingDimensions,
      { index: i, category: i % 3 === 0 ? 'A' : i % 3 === 1 ? 'B' : 'C' }
    ));
  }
  return vectors;
}

/**
 * Generate vectors with similar embeddings for similarity testing
 */
export function generateSimilarVectors(
  baseEmbedding: number[],
  count: number,
  similarity: number = 0.9
): TestVectorData[] {
  const vectors: TestVectorData[] = [];
  
  for (let i = 0; i < count; i++) {
    // Create a similar embedding by adding small random noise
    const noiseFactor = Math.sqrt(1 - similarity * similarity);
    const noise = generateRandomEmbedding(baseEmbedding.length);
    
    const similarEmbedding = baseEmbedding.map((val, idx) => 
      similarity * val + noiseFactor * noise[idx]
    );
    
    // Normalize the result
    const magnitude = Math.sqrt(similarEmbedding.reduce((sum, val) => sum + val * val, 0));
    const normalizedEmbedding = similarEmbedding.map(val => val / magnitude);
    
    vectors.push({
      id: `similar-vector-${i}`,
      text: `Similar content ${i} to the base vector`,
      embedding: normalizedEmbedding,
      metadata: { similarity: 'high', index: i },
      timestamp: Date.now() + i
    });
  }
  
  return vectors;
}

/**
 * Create a mock plugin instance for testing
 */
export function createMockPlugin(): any {
  // Use the mock Plugin from our mocks
  const { Plugin: MockPlugin } = require('../../__mocks__/obsidian');
  const plugin = new MockPlugin();
  
  // Override the app.vault.adapter methods with more realistic mocks
  plugin.app.vault.adapter.exists = jest.fn().mockImplementation((path: string) => {
    // Simulate file existence based on path
    return Promise.resolve(path.includes('existing') || path.includes('backup'));
  });
  
  plugin.app.vault.adapter.read = jest.fn().mockImplementation((path: string) => {
    if (path.includes('backup') || path.includes('vector-backup.json')) {
      // Return a mock backup file
      const mockBackup = {
        metadata: {
          vectorCount: 5,
          lastModified: Date.now() - 1000,
          summaryHash: 'test-hash-123',
          version: '1.0.0',
          lastBackup: Date.now() - 2000
        },
        exportDate: new Date().toISOString(),
        version: '1.0.0',
        totalVectors: 5,
        vectors: generateTestVectors(5)
      };
      return Promise.resolve(JSON.stringify(mockBackup, null, 2));
    }
    return Promise.resolve('{}');
  });
  
  plugin.app.vault.adapter.write = jest.fn().mockResolvedValue(undefined);
  plugin.app.vault.adapter.remove = jest.fn().mockResolvedValue(undefined);
  
  return plugin;
}

/**
 * Wait for a specified amount of time (useful for async testing)
 */
export function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Create a mock backup file content
 */
export function createMockBackupContent(vectors: TestVectorData[]) {
  return {
    metadata: {
      vectorCount: vectors.length,
      lastModified: Date.now(),
      summaryHash: 'mock-hash-' + vectors.length,
      version: '1.0.0',
      lastBackup: Date.now()
    },
    exportDate: new Date().toISOString(),
    version: '1.0.0',
    totalVectors: vectors.length,
    vectors
  };
}

/**
 * Assert that two embeddings are approximately equal (within tolerance)
 */
export function expectEmbeddingsToBeClose(
  actual: number[],
  expected: number[],
  tolerance: number = 1e-6
): void {
  expect(actual).toHaveLength(expected.length);
  
  for (let i = 0; i < actual.length; i++) {
    expect(Math.abs(actual[i] - expected[i])).toBeLessThanOrEqual(tolerance);
  }
}

/**
 * Calculate cosine similarity between two vectors (for testing)
 */
export function calculateCosineSimilarity(vec1: number[], vec2: number[]): number {
  if (vec1.length !== vec2.length) {
    throw new Error('Vectors must have the same length');
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
 * Mock console methods to capture logs during testing
 */
export function mockConsole() {
  const originalConsole = { ...console };
  
  const mockConsole = {
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn()
  };
  
  Object.assign(console, mockConsole);
  
  return {
    mockConsole,
    restore: () => Object.assign(console, originalConsole)
  };
}

/**
 * Create a test environment with cleanup
 */
export class TestEnvironment {
  private cleanupFunctions: (() => void)[] = [];
  
  addCleanup(fn: () => void): void {
    this.cleanupFunctions.push(fn);
  }
  
  cleanup(): void {
    this.cleanupFunctions.forEach(fn => {
      try {
        fn();
      } catch (error) {
        console.warn('Cleanup function failed:', error);
      }
    });
    this.cleanupFunctions = [];
  }
}