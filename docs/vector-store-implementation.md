# Vector Store Implementation Guide

## Overview

The vector store implementation provides semantic memory capabilities for your AI Assistant plugin. It allows the AI to find and include relevant context from your notes and conversation history based on semantic similarity rather than just keyword matching.

## Components

### 1. VectorStore (`vectorStore.ts`)
- **Purpose**: Core SQLite-based vector database for storing embeddings
- **Features**: 
  - Store text embeddings with metadata
  - Cosine similarity search
  - Vector CRUD operations
  - Text-based search

### 2. EmbeddingService (`EmbeddingService.ts`)
- **Purpose**: Handles text embedding generation and semantic search
- **Features**:
  - Generate embeddings using OpenAI API
  - Text chunking for large content
  - Embed notes and conversations
  - Semantic search with filtering

### 3. SemanticContextBuilder (`SemanticContextBuilder.ts`)
- **Purpose**: Integrates semantic search with AI completion context
- **Features**:
  - Build semantic context for AI queries
  - Manage embedding operations
  - Provide search interface

### 4. VectorStoreSettingsSection (`VectorStoreSettingsSection.ts`)
- **Purpose**: UI for managing vector store settings
- **Features**:
  - Enable/disable semantic context
  - Configure similarity thresholds
  - Embed all notes
  - Test semantic search

## Usage

### Setup

1. **Enable the Feature**: Go to Settings → Vector Store & Semantic Memory
2. **Configure OpenAI API**: Ensure you have a valid OpenAI API key (required for embeddings)
3. **Initial Embedding**: Click "Embed All Notes" to generate embeddings for your vault

### Settings

- **Enable Semantic Context**: Toggle semantic search integration
- **Max Context Chunks**: Number of relevant chunks to include (1-10)
- **Similarity Threshold**: Minimum similarity score (0.0-1.0)

### Commands Available

1. **Embed Current Note**: Generate embeddings for the active note
2. **Embed All Notes**: Generate embeddings for all notes in vault
3. **Semantic Search**: Interactive search interface
4. **Semantic Search with Selection**: Search using selected text
5. **Clear All Embeddings**: Remove all stored embeddings
6. **Vector Store Statistics**: Show storage statistics

### How It Works

1. **Embedding Generation**: Text is split into chunks and sent to OpenAI for embedding
2. **Storage**: Embeddings are stored locally in SQLite database
3. **Semantic Search**: Query embeddings are compared using cosine similarity
4. **Context Integration**: Relevant chunks are automatically included in AI requests

### AI Completion Integration

When semantic context is enabled, the AI completion system:

1. Takes your current query/conversation
2. Searches for semantically similar content in your vault
3. Includes relevant chunks as context for the AI
4. Provides more informed and contextually aware responses

### Privacy & Performance

- **Local Storage**: All embeddings are stored locally in your vault
- **API Usage**: Only text-to-embedding conversion uses external API
- **Desktop Only**: Requires Node.js APIs (not available on mobile)
- **Performance**: Initial embedding can take time for large vaults

### Technical Details

#### Embedding Model
- Uses OpenAI's `text-embedding-3-small` model
- 1536-dimensional vectors
- Cost-efficient and fast

#### Chunking Strategy
- Default chunk size: 1000 characters
- Overlap: 100 characters
- Sentence boundary breaking

#### Similarity Calculation
- Cosine similarity between query and stored vectors
- Configurable threshold (default: 0.7)
- Top-K results with filtering

#### Database Schema
```sql
CREATE TABLE vectors (
  id TEXT PRIMARY KEY,
  text TEXT NOT NULL,
  embedding BLOB NOT NULL,
  metadata TEXT
);
```

### Best Practices

1. **Regular Updates**: Re-embed notes when content changes significantly
2. **Threshold Tuning**: Adjust similarity threshold based on your needs
3. **Selective Embedding**: Focus on important notes if API costs are a concern
4. **Context Limits**: Keep context chunks reasonable to avoid token limits

### Troubleshooting

**Common Issues:**

1. **"Vector store not available"**: Desktop-only feature, won't work on mobile
2. **"OpenAI API key required"**: Need valid API key for embedding generation
3. **"No similar content found"**: Lower similarity threshold or embed more content
4. **Performance issues**: Consider clearing old embeddings periodically

**Debug Mode:**
Enable debug mode in settings to see detailed logging of semantic search operations.

### API Cost Estimates

Embedding costs (OpenAI text-embedding-3-small):
- ~$0.00002 per 1K tokens
- Average note (~1000 words) ≈ $0.0003
- 1000 notes ≈ $0.30

The semantic search itself is free as it uses local vector comparison.

### Future Enhancements

Potential improvements:
- Support for other embedding providers
- Automatic re-embedding on note changes
- Advanced metadata filtering
- Vector compression for storage efficiency
- Hybrid search (semantic + keyword)
