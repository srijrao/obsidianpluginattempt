# VectorStore Migration Guide

## Overview
The VectorStore has been migrated from `better-sqlite3` (Node.js-only) to `sql.js` with IndexedDB persistence to support both Obsidian Desktop and Mobile environments.

## Key Changes

### 1. All Methods Are Now Asynchronous
All VectorStore methods now return Promises and must be used with `async/await`:

```typescript
// Before (synchronous)
const vectorStore = new VectorStore(plugin);
vectorStore.addVector(id, text, embedding, metadata);
const vector = vectorStore.getVector(id);

// After (asynchronous)
const vectorStore = new VectorStore(plugin);
await vectorStore.initialize(); // Required initialization step
await vectorStore.addVector(id, text, embedding, metadata);
const vector = await vectorStore.getVector(id);
```

### 2. Initialization Required
You must call `initialize()` before using any other methods:

```typescript
const vectorStore = new VectorStore(plugin);
await vectorStore.initialize();
```

### 3. Buffer vs Uint8Array
The implementation now uses `Uint8Array` instead of Node.js `Buffer`:

```typescript
// The API still accepts both Buffer and number[] for embeddings
await vectorStore.addVector(id, text, embedding, metadata);

// But returns Uint8Array for binary data
const vector = await vectorStore.getVector(id);
// vector.embedding is now Uint8Array instead of Buffer
```

## Migration Steps

### 1. Update Your Code
Replace all VectorStore usage with async/await patterns:

```typescript
class YourClass {
  private vectorStore: VectorStore;
  
  constructor(plugin: Plugin) {
    this.vectorStore = new VectorStore(plugin);
  }
  
  async initializeVectorStore() {
    await this.vectorStore.initialize();
  }
  
  async addEmbedding(id: string, text: string, embedding: number[]) {
    await this.vectorStore.addVector(id, text, embedding);
  }
  
  async searchSimilar(queryEmbedding: number[], topK = 5) {
    return await this.vectorStore.findSimilarVectors(queryEmbedding, topK);
  }
  
  async cleanup() {
    await this.vectorStore.close();
  }
}
```

### 2. Handle Initialization in Plugin
In your main plugin file:

```typescript
export default class YourPlugin extends Plugin {
  private vectorStore: VectorStore;
  
  async onload() {
    this.vectorStore = new VectorStore(this);
    
    try {
      await this.vectorStore.initialize();
      console.log('VectorStore initialized successfully');
    } catch (error) {
      console.error('Failed to initialize VectorStore:', error);
      // Handle gracefully - perhaps disable vector features
    }
  }
  
  async onunload() {
    if (this.vectorStore) {
      await this.vectorStore.close();
    }
  }
}
```

### 3. Error Handling
Add proper error handling for async operations:

```typescript
try {
  await vectorStore.addVector(id, text, embedding, metadata);
} catch (error) {
  console.error('Failed to add vector:', error);
  // Handle error appropriately
}
```

## Platform Compatibility

### Desktop
Works with the full sql.js library and WASM for optimal performance.

### Mobile
Falls back to JavaScript-only mode if WASM loading fails, maintaining functionality across platforms.

### Automatic Persistence
Data is automatically saved to IndexedDB after each modification, ensuring persistence across app restarts.

## Performance Considerations

### 1. Initialization Cost
The initial setup is more expensive due to WASM loading, but subsequent operations are fast.

### 2. Memory Usage
sql.js keeps the entire database in memory, which is suitable for typical vector store sizes but consider this for very large datasets.

### 3. Batch Operations
For multiple operations, consider batching them to reduce IndexedDB writes:

```typescript
// Add multiple vectors
await vectorStore.addVector(id1, text1, embedding1);
await vectorStore.addVector(id2, text2, embedding2);
await vectorStore.addVector(id3, text3, embedding3);
// Each call saves to IndexedDB automatically
```

## Troubleshooting

### WASM Loading Issues
If you encounter WASM loading errors, the implementation includes fallbacks:

```typescript
// The initialize method will try multiple approaches:
// 1. Custom WASM path configuration
// 2. Default sql.js initialization
// 3. Error handling with detailed messages
```

### IndexedDB Errors
IndexedDB operations are wrapped with error handling. If persistence fails, the in-memory database will continue to work for the current session.

### Cross-Platform Testing
Test your implementation on both desktop and mobile:

```typescript
// Check if initialization was successful
if (vectorStore.isInitialized) {
  // Proceed with vector operations
} else {
  // Handle initialization failure
}
```
