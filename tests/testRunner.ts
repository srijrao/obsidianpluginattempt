/**
 * @file testRunner.ts
 * @description Test runner for development and debugging
 */

import type MyPlugin from '../src/main';
import { Notice } from 'obsidian';

/**
 * Registers test commands for development and debugging purposes.
 * Only available when debug mode is enabled.
 */
export function registerTestCommands(plugin: MyPlugin) {
    // Test VectorStore initialization
    plugin.addCommand({
        id: 'test-vector-store-init',
        name: 'Test: Vector Store Initialization',
        callback: async () => {
            try {
                const { VectorStore } = await import('../src/components/agent/memory-handling/vectorStore');
                const vectorStore = new VectorStore(plugin);
                
                new Notice('Initializing VectorStore...');
                await vectorStore.initialize();
                
                if (vectorStore.isReady()) {
                    new Notice('✅ VectorStore initialized successfully!');
                    console.log('VectorStore test: SUCCESS');
                } else {
                    new Notice('❌ VectorStore initialization failed');
                    console.log('VectorStore test: FAILED - not initialized');
                }
                
                await vectorStore.close();
            } catch (error) {
                new Notice(`❌ VectorStore test failed: ${error.message}`);
                console.error('VectorStore test: ERROR', error);
            }
        }
    });

    // Test EmbeddingService initialization
    plugin.addCommand({
        id: 'test-embedding-service-init',
        name: 'Test: Embedding Service Initialization',
        callback: async () => {
            try {
                const { EmbeddingService } = await import('../src/components/agent/memory-handling/EmbeddingService');
                const embeddingService = new EmbeddingService(plugin, plugin.settings);
                
                new Notice('Initializing EmbeddingService...');
                await embeddingService.initialize();
                
                if (embeddingService.initialized) {
                    const stats = await embeddingService.getStats();
                    new Notice(`✅ EmbeddingService initialized! ${stats.totalVectors} vectors stored`);
                    console.log('EmbeddingService test: SUCCESS', stats);
                } else {
                    new Notice('❌ EmbeddingService initialization failed');
                    console.log('EmbeddingService test: FAILED - not initialized');
                }
                
                await embeddingService.close();
            } catch (error) {
                new Notice(`❌ EmbeddingService test failed: ${error.message}`);
                console.error('EmbeddingService test: ERROR', error);
            }
        }
    });

    // Test SemanticContextBuilder initialization
    plugin.addCommand({
        id: 'test-semantic-builder-init',
        name: 'Test: Semantic Context Builder Initialization',
        callback: async () => {
            try {
                const { SemanticContextBuilder } = await import('../src/components/agent/memory-handling/SemanticContextBuilder');
                const semanticBuilder = new SemanticContextBuilder(plugin.app, plugin);
                
                new Notice('Initializing SemanticContextBuilder...');
                await semanticBuilder.initialize();
                
                if (semanticBuilder.initialized) {
                    const stats = await semanticBuilder.getStats();
                    new Notice(`✅ SemanticContextBuilder initialized! ${stats?.totalVectors || 0} vectors available`);
                    console.log('SemanticContextBuilder test: SUCCESS', stats);
                } else {
                    new Notice('❌ SemanticContextBuilder initialization failed');
                    console.log('SemanticContextBuilder test: FAILED - not initialized');
                }
            } catch (error) {
                new Notice(`❌ SemanticContextBuilder test failed: ${error.message}`);
                console.error('SemanticContextBuilder test: ERROR', error);
            }
        }
    });

    // Test complete semantic search workflow
    plugin.addCommand({
        id: 'test-semantic-search-workflow',
        name: 'Test: Complete Semantic Search Workflow',
        callback: async () => {
            try {
                new Notice('Testing complete semantic search workflow...');
                
                const { EmbeddingService } = await import('../src/components/agent/memory-handling/EmbeddingService');
                const embeddingService = new EmbeddingService(plugin, plugin.settings);
                
                // Initialize
                await embeddingService.initialize();
                
                if (!embeddingService.initialized) {
                    throw new Error('EmbeddingService failed to initialize');
                }
                
                // Get initial stats
                const initialStats = await embeddingService.getStats();
                console.log('Initial stats:', initialStats);
                
                // Test embedding the current active note
                const activeFile = plugin.app.workspace.getActiveFile();
                if (activeFile) {
                    console.log('Embedding active file:', activeFile.path);
                    await embeddingService.embedNote(activeFile);
                    
                    // Get updated stats
                    const finalStats = await embeddingService.getStats();
                    console.log('Final stats:', finalStats);
                    
                    // Test semantic search
                    const results = await embeddingService.semanticSearch('test content', {
                        topK: 3,
                        minSimilarity: 0.1
                    });
                    
                    new Notice(`✅ Workflow complete! Embedded ${activeFile.name}, found ${results.length} similar vectors`);
                    console.log('Semantic search workflow: SUCCESS', { 
                        embedded: activeFile.path, 
                        searchResults: results.length,
                        finalStats 
                    });
                } else {
                    new Notice('❌ No active file to embed');
                    console.log('Semantic search workflow: SKIPPED - no active file');
                }
                
                await embeddingService.close();
            } catch (error) {
                new Notice(`❌ Semantic search workflow failed: ${error.message}`);
                console.error('Semantic search workflow: ERROR', error);
            }
        }
    });

    // Run all tests
    plugin.addCommand({
        id: 'test-run-all-semantic-tests',
        name: 'Test: Run All Semantic Search Tests',
        callback: async () => {
            new Notice('Running all semantic search tests...');
            console.log('='.repeat(50));
            console.log('RUNNING ALL SEMANTIC SEARCH TESTS');
            console.log('='.repeat(50));
            
            // Run each test directly instead of trying to execute commands
            try {
                console.log('\n--- Running: Basic IndexedDB Test ---');
                await runBasicIndexedDBTest();
                await new Promise(resolve => setTimeout(resolve, 1000));

                console.log('\n--- Running: VectorStore Initialization ---');
                await runVectorStoreTest();
                await new Promise(resolve => setTimeout(resolve, 1000));

                console.log('\n--- Running: EmbeddingService Initialization ---');
                await runEmbeddingServiceTest();
                await new Promise(resolve => setTimeout(resolve, 1000));

                console.log('\n--- Running: SemanticContextBuilder Initialization ---');
                await runSemanticBuilderTest();
                await new Promise(resolve => setTimeout(resolve, 1000));

                console.log('\n--- Running: Complete Workflow Test ---');
                await runWorkflowTest();
                
            } catch (error) {
                console.error('Error during test execution:', error);
            }
            
            console.log('\n' + '='.repeat(50));
            console.log('ALL TESTS COMPLETED');
            console.log('='.repeat(50));
            new Notice('All semantic search tests completed! Check console for details.');
        }
    });

    // Helper functions for direct test execution
    async function runBasicIndexedDBTest() {
        try {
            // Test basic IndexedDB functionality
            const dbName = 'test-db-' + Date.now();
            
            const db = await new Promise<IDBDatabase>((resolve, reject) => {
                const request = indexedDB.open(dbName, 1);
                
                request.onerror = () => reject(new Error('Failed to open test database'));
                request.onsuccess = () => resolve(request.result);
                
                request.onupgradeneeded = (event) => {
                    const db = (event.target as IDBOpenDBRequest).result;
                    const store = db.createObjectStore('test', { keyPath: 'id' });
                };
            });
            
            // Test write operation
            await new Promise<void>((resolve, reject) => {
                const transaction = db.transaction(['test'], 'readwrite');
                const store = transaction.objectStore('test');
                const request = store.put({ id: 1, name: 'Hello IndexedDB' });
                
                request.onsuccess = () => resolve();
                request.onerror = () => reject(new Error('Failed to write test data'));
            });
            
            // Test read operation
            const result = await new Promise<any>((resolve, reject) => {
                const transaction = db.transaction(['test'], 'readonly');
                const store = transaction.objectStore('test');
                const request = store.get(1);
                
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(new Error('Failed to read test data'));
            });
            
            db.close();
            
            // Clean up test database
            indexedDB.deleteDatabase(dbName);
            
            console.log('✅ IndexedDB basic test: SUCCESS', result);
        } catch (error) {
            console.error('❌ IndexedDB basic test: ERROR', error);
        }
    }

    async function runVectorStoreTest() {
        try {
            const { VectorStore } = await import('../src/components/agent/memory-handling/vectorStore');
            const vectorStore = new VectorStore(plugin);
            
            await vectorStore.initialize();
            
            if (vectorStore.isReady()) {
                console.log('✅ VectorStore test: SUCCESS');
            } else {
                console.log('❌ VectorStore test: FAILED - not initialized');
            }
            
            await vectorStore.close();
        } catch (error) {
            console.error('❌ VectorStore test: ERROR', error);
        }
    }

    async function runEmbeddingServiceTest() {
        try {
            const { EmbeddingService } = await import('../src/components/agent/memory-handling/EmbeddingService');
            const embeddingService = new EmbeddingService(plugin, plugin.settings);
            
            await embeddingService.initialize();
            
            if (embeddingService.initialized) {
                const stats = await embeddingService.getStats();
                console.log('✅ EmbeddingService test: SUCCESS', stats);
            } else {
                console.log('❌ EmbeddingService test: FAILED - not initialized');
            }
            
            await embeddingService.close();
        } catch (error) {
            console.error('❌ EmbeddingService test: ERROR', error);
        }
    }

    async function runSemanticBuilderTest() {
        try {
            const { SemanticContextBuilder } = await import('../src/components/agent/memory-handling/SemanticContextBuilder');
            const semanticBuilder = new SemanticContextBuilder(plugin.app, plugin);
            
            await semanticBuilder.initialize();
            
            if (semanticBuilder.initialized) {
                const stats = await semanticBuilder.getStats();
                console.log('✅ SemanticContextBuilder test: SUCCESS', stats);
            } else {
                console.log('❌ SemanticContextBuilder test: FAILED - not initialized');
            }
        } catch (error) {
            console.error('❌ SemanticContextBuilder test: ERROR', error);
        }
    }

    async function runWorkflowTest() {
        try {
            const { EmbeddingService } = await import('../src/components/agent/memory-handling/EmbeddingService');
            const embeddingService = new EmbeddingService(plugin, plugin.settings);
            
            await embeddingService.initialize();
            
            if (!embeddingService.initialized) {
                throw new Error('EmbeddingService failed to initialize');
            }
            
            const initialStats = await embeddingService.getStats();
            console.log('Initial stats:', initialStats);
            
            const activeFile = plugin.app.workspace.getActiveFile();
            if (activeFile) {
                console.log('Embedding active file:', activeFile.path);
                await embeddingService.embedNote(activeFile);
                
                const finalStats = await embeddingService.getStats();
                console.log('Final stats:', finalStats);
                
                const results = await embeddingService.semanticSearch('test content', {
                    topK: 3,
                    minSimilarity: 0.1
                });
                
                console.log('✅ Semantic search workflow: SUCCESS', { 
                    embedded: activeFile.path, 
                    searchResults: results.length,
                    finalStats 
                });
            } else {
                console.log('⚠️ Semantic search workflow: SKIPPED - no active file');
            }
            
            await embeddingService.close();
        } catch (error) {
            console.error('❌ Semantic search workflow: ERROR', error);
        }
    }

    // Test Hybrid Vector Storage System
    plugin.addCommand({
        id: 'test-hybrid-vector-storage',
        name: 'Test: Hybrid Vector Storage System',
        callback: async () => {
            try {
                const { HybridVectorTest } = await import('../src/tests/test-hybrid-vector');
                const tester = new HybridVectorTest(plugin);
                
                new Notice('🧪 Running Hybrid Vector Storage tests...');
                console.log('🧪 Starting Hybrid Vector Storage Tests...');
                
                await tester.runAllTests();
                
                new Notice('✅ Hybrid Vector Storage tests completed successfully!');
                console.log('✅ All Hybrid Vector Storage Tests Passed!');
            } catch (error) {
                new Notice(`❌ Hybrid Vector Storage test failed: ${error.message}`);
                console.error('❌ Hybrid Vector Storage test failed:', error);
            }
        }
    });

    console.log('Test commands registered for semantic search and hybrid vector debugging');
}
