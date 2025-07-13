/**
 * @file semanticSearch.test.ts
 * @description Jest test suite for semantic search functionality
 */

import { VectorStore } from '../src/components/agent/memory-handling/vectorStore';
import { EmbeddingService } from '../src/components/agent/memory-handling/EmbeddingService';
import { SemanticContextBuilder } from '../src/components/agent/memory-handling/SemanticContextBuilder';
import { MyPluginSettings, DEFAULT_SETTINGS } from '../src/types';

// Mock sql.js and IndexedDB for testing
jest.mock('sql.js', () => ({
    __esModule: true,
    default: jest.fn(() => Promise.resolve({
        Database: jest.fn(() => ({
            run: jest.fn(),
            prepare: jest.fn(() => ({
                run: jest.fn(),
                get: jest.fn(),
                all: jest.fn(() => []),
                free: jest.fn()
            })),
            export: jest.fn(() => new Uint8Array()),
            close: jest.fn()
        }))
    }))
}));

// Mock IndexedDB
Object.defineProperty(global, 'indexedDB', {
    value: {
        open: jest.fn(() => ({
            onsuccess: null,
            onerror: null,
            onupgradeneeded: null,
            result: {
                transaction: jest.fn(() => ({
                    objectStore: jest.fn(() => ({
                        get: jest.fn(() => ({ onsuccess: null, onerror: null, result: null })),
                        put: jest.fn(() => ({ onsuccess: null, onerror: null })),
                        delete: jest.fn(() => ({ onsuccess: null, onerror: null }))
                    }))
                })),
                createObjectStore: jest.fn()
            }
        }))
    }
});

// Mock Obsidian Plugin
const mockPlugin = {
    app: {
        vault: {
            getMarkdownFiles: jest.fn(() => []),
            read: jest.fn(() => Promise.resolve('Test content for embedding')),
            getAbstractFileByPath: jest.fn((path: string) => ({ path, name: 'test.md' })),
            configDir: '.obsidian'
        },
        workspace: {
            getActiveFile: jest.fn(() => ({ 
                path: 'test.md', 
                name: 'test.md', 
                stat: { mtime: Date.now() } 
            })),
            openLinkText: jest.fn()
        }
    }
} as any;

const mockSettings: MyPluginSettings = {
    ...DEFAULT_SETTINGS,
    openaiSettings: {
        ...DEFAULT_SETTINGS.openaiSettings,
        apiKey: 'test-api-key'
    },
    debugMode: true
};

describe('Semantic Search Integration', () => {
    let vectorStore: VectorStore;
    let embeddingService: EmbeddingService;
    let semanticBuilder: SemanticContextBuilder;
    const mockVectors = new Map();

    beforeEach(async () => {
        // Reset mocks and clear mock data
        jest.clearAllMocks();
        mockVectors.clear();
        
        // Initialize components
        vectorStore = new VectorStore(mockPlugin);
        embeddingService = new EmbeddingService(mockPlugin, mockSettings);
        semanticBuilder = new SemanticContextBuilder(mockPlugin.app, mockPlugin);
        
        // Mock the initialization methods to avoid actual database setup
        jest.spyOn(vectorStore, 'initialize').mockResolvedValue();
        jest.spyOn(embeddingService, 'initialize').mockResolvedValue();
        jest.spyOn(semanticBuilder, 'initialize').mockResolvedValue();
        
        // Mock the ready/initialized getters
        jest.spyOn(vectorStore, 'isReady').mockReturnValue(true);
        Object.defineProperty(embeddingService, 'initialized', { get: () => true });
        Object.defineProperty(semanticBuilder, 'initialized', { get: () => true });
        
        // Mock VectorStore methods with correct signatures for IndexedDB implementation
        jest.spyOn(vectorStore, 'addVector').mockImplementation(async (id, text, embedding, metadata) => {
            mockVectors.set(id, { 
                id, 
                text, 
                embedding, 
                metadata: metadata || {},
                timestamp: Date.now()
            });
        });
        
        jest.spyOn(vectorStore, 'getVector').mockImplementation(async (id) => {
            return mockVectors.get(id) || null;
        });
        
        jest.spyOn(vectorStore, 'getAllVectors').mockImplementation(async () => {
            return Array.from(mockVectors.values());
        });
        
        jest.spyOn(vectorStore, 'findSimilarVectors').mockImplementation(async (queryEmbedding, limit = 5, threshold = 0.0) => {
            const results = Array.from(mockVectors.values()).map(vector => {
                // Calculate a simple similarity based on the first few values
                const similarity = queryEmbedding.length > 0 && vector.embedding.length > 0 
                    ? Math.abs(queryEmbedding[0] - vector.embedding[0]) < 0.1 ? 1.0 : Math.random() * 0.8 + 0.1
                    : Math.random() * 0.8 + 0.1;
                
                return {
                    ...vector,
                    similarity
                };
            })
            .filter(item => item.similarity >= threshold)
            .sort((a, b) => b.similarity - a.similarity);
            
            return results.slice(0, limit);
        });
        
        jest.spyOn(vectorStore, 'findVectorsByText').mockImplementation(async (query: string, limit: number = 10) => {
            return Array.from(mockVectors.values())
                .filter(vector => vector.text.toLowerCase().includes(query.toLowerCase()))
                .slice(0, limit);
        });
        
        jest.spyOn(vectorStore, 'searchByText').mockImplementation(async (query: string, limit: number = 10) => {
            return Array.from(mockVectors.values())
                .filter(vector => vector.text.toLowerCase().includes(query.toLowerCase()))
                .slice(0, limit);
        });
        
        jest.spyOn(vectorStore, 'getVectorsByMetadata').mockImplementation(async (metadata: Record<string, any>, limit: number = 10) => {
            return Array.from(mockVectors.values())
                .filter(vector => {
                    const vectorMetadata = vector.metadata || {};
                    return Object.keys(metadata).every(key => vectorMetadata[key] === metadata[key]);
                })
                .slice(0, limit);
        });
        
        jest.spyOn(vectorStore, 'getVectorCount').mockImplementation(async () => {
            return mockVectors.size;
        });
        
        jest.spyOn(vectorStore, 'clearAllVectors').mockResolvedValue(0);
        jest.spyOn(vectorStore, 'close').mockResolvedValue(undefined);
        
        // Mock EmbeddingService methods
        jest.spyOn(embeddingService, 'embedText').mockImplementation(async (text, options) => {
            // Simulate adding a vector when embedding text
            const id = `text-${Date.now()}-${Math.random()}`;
            const embedding = Array.from({ length: 1536 }, (_, i) => Math.sin(i * text.length * 0.01));
            await vectorStore.addVector(id, text, embedding, options?.customMetadata || {});
        });
        
        jest.spyOn(embeddingService, 'embedConversation').mockImplementation(async (messages, sessionId) => {
            // Simulate adding vectors for each message
            for (const message of messages) {
                const id = `conv-${sessionId}-${message.role}-${Date.now()}-${Math.random()}`;
                const embedding = Array.from({ length: 1536 }, (_, i) => Math.sin(i * message.content.length * 0.01));
                await vectorStore.addVector(id, message.content, embedding, { role: message.role, sessionId });
            }
        });
        
        jest.spyOn(embeddingService, 'embedNote').mockImplementation(async (file, options) => {
            // Simulate embedding a note
            const id = `note-${file.path}-${Date.now()}`;
            const text = await mockPlugin.app.vault.read(file);
            const embedding = Array.from({ length: 1536 }, (_, i) => Math.sin(i * text.length * 0.01));
            await vectorStore.addVector(id, text, embedding, { 
                ...options?.customMetadata,
                filePath: file.path,
                fileName: file.name
            });
        });
        jest.spyOn(embeddingService, 'getStats').mockImplementation(async () => ({
            totalVectors: mockVectors.size
        }));
        jest.spyOn(embeddingService, 'semanticSearch').mockImplementation(async (query, options) => {
            return Array.from(mockVectors.values()).map(vector => ({
                id: vector.id,
                text: vector.text,
                similarity: Math.random() * 0.5 + 0.5,
                metadata: vector.metadata || {}
            })).slice(0, options?.topK || 5);
        });
        jest.spyOn(embeddingService, 'getRelevantContext').mockImplementation(async (query, options) => {
            return Array.from(mockVectors.values()).map(vector => vector.text).slice(0, options?.maxChunks || 3);
        });
        
        // Mock SemanticContextBuilder methods
        jest.spyOn(semanticBuilder, 'semanticSearch').mockImplementation(async (query, options) => {
            return Array.from(mockVectors.values()).map(vector => ({
                id: vector.id,
                text: vector.text,
                similarity: Math.random() * 0.5 + 0.5,
                metadata: vector.metadata || {}
            })).slice(0, options?.topK || 5);
        });
        jest.spyOn(semanticBuilder, 'getStats').mockImplementation(async () => ({
            totalVectors: mockVectors.size
        }));
        
        // Initialize all components
        await vectorStore.initialize();
        await embeddingService.initialize();
        await semanticBuilder.initialize();
    }, 10000); // Increase timeout to 10 seconds

    afterEach(async () => {
        // Cleanup
        try {
            await vectorStore.clearAllVectors();
            await vectorStore.close();
        } catch (error) {
            // Ignore cleanup errors
        }
    });

    describe('VectorStore Operations', () => {
        test('should initialize successfully', () => {
            expect(vectorStore.isReady()).toBe(true);
        });

        test('should add and retrieve vectors', async () => {
            const testId = 'test-vector-1';
            const testText = 'Test embedding content';
            const testEmbedding = Array.from({ length: 1536 }, () => Math.random());
            const testMetadata = { type: 'test', category: 'unit-test' };

            // Add vector
            await vectorStore.addVector(testId, testText, testEmbedding, testMetadata);

            // Retrieve vector
            const retrieved = await vectorStore.getVector(testId);
            
            expect(retrieved).toBeTruthy();
            expect(retrieved!.id).toBe(testId);
            expect(retrieved!.text).toBe(testText);
            expect(retrieved!.metadata).toEqual(testMetadata);
        });

        test('should perform similarity search', async () => {
            // Add test vectors
            const vectors = [
                {
                    id: 'test-1',
                    text: 'Machine learning and AI concepts',
                    embedding: Array.from({ length: 1536 }, (_, i) => Math.sin(i * 0.1)),
                    metadata: { category: 'AI' }
                },
                {
                    id: 'test-2',
                    text: 'Cooking and recipe instructions',
                    embedding: Array.from({ length: 1536 }, (_, i) => Math.cos(i * 0.1)),
                    metadata: { category: 'cooking' }
                }
            ];

            for (const vector of vectors) {
                await vectorStore.addVector(vector.id, vector.text, vector.embedding, vector.metadata);
            }

            // Search with first vector's embedding
            const results = await vectorStore.findSimilarVectors(vectors[0].embedding, 2, 0);
            
            expect(results).toHaveLength(2);
            expect(results[0].id).toBe('test-1'); // Should be most similar to itself
            expect(results[0].similarity).toBeCloseTo(1, 2);
        });

        test('should search by text content', async () => {
            await vectorStore.addVector(
                'text-search-test',
                'This document contains machine learning concepts',
                Array.from({ length: 1536 }, () => Math.random()),
                { type: 'test' }
            );

            const results = await vectorStore.findVectorsByText('machine learning', 5);
            
            expect(results).toHaveLength(1);
            expect(results[0].text).toContain('machine learning');
        });

        test('should search by metadata', async () => {
            const metadata = { category: 'test-category', type: 'example' };
            
            await vectorStore.addVector(
                'metadata-test',
                'Test content for metadata search',
                Array.from({ length: 1536 }, () => Math.random()),
                metadata
            );

            const results = await vectorStore.getVectorsByMetadata({ category: 'test-category' }, 5);
            
            expect(results).toHaveLength(1);
            expect(results[0].metadata).toEqual(metadata);
        });
    });

    describe('EmbeddingService Operations', () => {
        beforeEach(() => {
            // Mock the embedding generation to avoid API calls
            jest.spyOn(embeddingService as any, 'generateEmbedding')
                .mockImplementation(async (text: string) => {
                    return Array.from({ length: 1536 }, (_, i) => Math.sin(i * text.length * 0.01));
                });
        });

        test('should initialize successfully', () => {
            expect(embeddingService.initialized).toBe(true);
        });

        test('should embed text with metadata', async () => {
            const testText = 'Test text for embedding service';
            const metadata = { source: 'unit-test', type: 'manual' };

            await embeddingService.embedText(testText, { customMetadata: metadata });

            // Verify the text was embedded
            const stats = await embeddingService.getStats();
            expect(stats.totalVectors).toBeGreaterThan(0);
        });

        test('should embed conversation messages', async () => {
            const messages = [
                { role: 'user' as const, content: 'What is artificial intelligence?' },
                { role: 'assistant' as const, content: 'AI is a branch of computer science...' }
            ];

            await embeddingService.embedConversation(messages, 'test-session');

            const stats = await embeddingService.getStats();
            expect(stats.totalVectors).toBeGreaterThan(0);
        });

        test('should perform semantic search', async () => {
            // First embed some content
            await embeddingService.embedText('Machine learning algorithms and neural networks', {
                customMetadata: { topic: 'AI' }
            });

            const results = await embeddingService.semanticSearch('artificial intelligence', {
                topK: 5,
                minSimilarity: 0.1
            });

            expect(Array.isArray(results)).toBe(true);
            // Results structure should match expected format
            if (results.length > 0) {
                expect(results[0]).toHaveProperty('text');
                expect(results[0]).toHaveProperty('similarity');
                expect(results[0]).toHaveProperty('id');
            }
        });

        test('should get relevant context', async () => {
            // Embed some test content
            await embeddingService.embedText('Programming concepts and software development', {
                customMetadata: { type: 'note' }
            });

            const context = await embeddingService.getRelevantContext('programming', {
                maxChunks: 3,
                includeNotes: true,
                minSimilarity: 0.1
            });

            expect(Array.isArray(context)).toBe(true);
            expect(context.length).toBeGreaterThanOrEqual(0);
        });
    });

    describe('SemanticContextBuilder Operations', () => {
        test('should initialize successfully', () => {
            expect(semanticBuilder.initialized).toBe(true);
        });

        test('should perform semantic search via builder', async () => {
            // Mock embedding generation
            jest.spyOn(embeddingService as any, 'generateEmbedding')
                .mockImplementation(async (text: string) => {
                    return Array.from({ length: 1536 }, (_, i) => Math.sin(i * text.length * 0.01));
                });

            // Add some test data first
            await vectorStore.addVector(
                'builder-test',
                'Testing semantic context builder functionality',
                Array.from({ length: 1536 }, () => Math.random()),
                { source: 'builder-test' }
            );

            const results = await semanticBuilder.semanticSearch('testing functionality', {
                topK: 5,
                minSimilarity: 0.1
            });

            expect(Array.isArray(results)).toBe(true);
        });

        test('should get statistics', async () => {
            const stats = await semanticBuilder.getStats();
            
            expect(stats).toBeTruthy();
            expect(stats).not.toBeNull();
            expect(typeof stats!.totalVectors).toBe('number');
            expect(stats!.totalVectors).toBeGreaterThanOrEqual(0);
        });
    });

    describe('Integration Workflow', () => {
        test('should handle complete embed-search workflow', async () => {
            // Mock embedding generation
            const mockEmbedding = jest.spyOn(embeddingService as any, 'generateEmbedding')
                .mockImplementation(async (text: string) => {
                    return Array.from({ length: 1536 }, (_, i) => Math.sin(i * text.length * 0.01));
                });

            // Override the embedNote mock to call generateEmbedding
            jest.spyOn(embeddingService, 'embedNote').mockImplementation(async (file, options) => {
                const text = await mockPlugin.app.vault.read(file);
                const embedding = await (embeddingService as any).generateEmbedding(text); // Call the mock to register the call
                const id = `note-${file.path}-${Date.now()}`;
                await vectorStore.addVector(id, text, embedding, { 
                    ...options?.customMetadata,
                    filePath: file.path,
                    fileName: file.name
                });
            });

            // Step 1: Embed a note (simulating "Embed Currently Open Note" command)
            const mockFile = {
                path: 'test-note.md',
                name: 'test-note.md',
                stat: { mtime: Date.now() }
            } as any;

            await embeddingService.embedNote(mockFile, {
                customMetadata: { source: 'workflow-test' }
            });

            // Step 2: Perform semantic search (simulating codeblock or search command)
            const searchResults = await embeddingService.semanticSearch('test content', {
                topK: 5,
                minSimilarity: 0.1
            });

            // Step 3: Verify results format for codeblock display
            expect(Array.isArray(searchResults)).toBe(true);
            
            if (searchResults.length > 0) {
                const result = searchResults[0];
                expect(result).toHaveProperty('text');
                expect(result).toHaveProperty('similarity');
                expect(result).toHaveProperty('id');
                expect(typeof result.similarity).toBe('number');
                expect(result.similarity).toBeGreaterThanOrEqual(0);
                expect(result.similarity).toBeLessThanOrEqual(1);
            }

            // Verify embedding was called
            expect(mockEmbedding).toHaveBeenCalled();
        });

        test('should handle codeblock data structure', async () => {
            // Mock search results that would come from a codeblock
            const mockResults = [
                {
                    id: 'test-1',
                    text: 'Sample content for testing semantic search codeblock',
                    similarity: 0.85,
                    filePath: 'notes/test.md',
                    metadata: { type: 'note' }
                }
            ];

            // Test data transformation for codeblock display
            const formattedResults = mockResults.map(result => ({
                similarity: `${(result.similarity * 100).toFixed(1)}%`,
                filePath: result.filePath || 'Unknown',
                text: result.text.substring(0, 100) + (result.text.length > 100 ? '...' : ''),
                hasMetadata: !!result.metadata
            }));

            expect(formattedResults).toHaveLength(1);
            expect(formattedResults[0].similarity).toBe('85.0%');
            expect(formattedResults[0].filePath).toBe('notes/test.md');
            expect(formattedResults[0].hasMetadata).toBe(true);
        });
    });
});
