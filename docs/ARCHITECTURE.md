# AI Assistant for Obsidian - Architecture Guide

> **Last Updated:** November 2, 2025  
> **Version:** 2.1  
> **Purpose:** Comprehensive reference guide for understanding the codebase architecture

## Table of Contents

1. [Overview](#overview)
2. [Core Architecture Patterns](#core-architecture-patterns)
3. [System Components](#system-components)
4. [Data Flow](#data-flow)
5. [Key Subsystems](#key-subsystems)
6. [File Organization](#file-organization)
7. [Extension Points](#extension-points)
8. [Performance & Optimization](#performance--optimization)
9. [Testing Strategy](#testing-strategy)

---

## Overview

The AI Assistant for Obsidian is a feature-rich plugin built with TypeScript that integrates multiple AI providers into the Obsidian note-taking environment. The architecture emphasizes:

- **Modularity**: Self-contained components with clear responsibilities
- **Extensibility**: Easy addition of new providers, tools, and features
- **Performance**: Optimized streaming, caching, and resource management
- **Type Safety**: Comprehensive TypeScript types and runtime validation
- **Testability**: Dependency injection and mockable interfaces

### Technology Stack

- **Language**: TypeScript 5.x
- **Build Tool**: esbuild (fast bundling)
- **Testing**: Jest with custom Obsidian mocks
- **API**: Obsidian Plugin API
- **Runtime**: Node.js (development), Electron (production)

---

## Core Architecture Patterns

### 1. Provider Registry System

**Location**: `providers/registry.ts`

The provider registry enables dynamic provider discovery without hardcoded lists.

**How It Works:**
```typescript
// Providers self-register at module load time
providerRegistry.register(metadata, factory);

// Dynamic provider creation
const provider = providerRegistry.getProvider('openai', settings);
```

**Key Features:**
- Self-registration pattern (no central provider list)
- Factory-based instantiation
- Metadata-driven configuration UI
- Runtime provider discovery

**Adding a New Provider:**
1. Create `providers/your-provider.ts` extending `BaseProvider`
2. Implement required methods: `getCompletion()`, `getAvailableModels()`, `listModels()`, `testConnection()`
3. Register at bottom of file:
```typescript
providerRegistry.register({
  id: 'your-provider',
  name: 'Your Provider',
  description: 'Provider description',
  configFields: { apiKey: {...} }
}, (settings) => new YourProvider(settings));
```
4. Import in `providers/index.ts`
5. Auto-discovered - no other changes needed

**Current Providers:**
- OpenAI (`providers/openai.ts`)
- Anthropic (`providers/anthropic.ts`)
- Google Gemini (`providers/gemini.ts`)
- OpenRouter (`providers/openrouter.ts`)

---

### 2. AIDispatcher - Central Request Hub

**Location**: `src/utils/aiDispatcher.ts`

All AI requests flow through `AIDispatcher.getCompletion()` - **never call providers directly**.

**Responsibilities:**
- Route requests to appropriate providers
- Automatic logging of all AI calls to `ai-calls/` folder
- LRU caching for repeated requests
- Circuit breaker for API failures
- Rate limiting and request queuing
- Metrics collection (tokens, costs, response times)
- Object pooling for message contexts

**Usage Pattern:**
```typescript
import { aiDispatcher } from './utils/aiDispatcher';

const response = await aiDispatcher.getCompletion(
  messages,
  options,
  streamCallback,
  providerOverride
);
```

**Features:**
- Request deduplication
- Automatic retry with exponential backoff
- Provider failover
- Performance monitoring
- Token counting and cost tracking

---

### 3. Service-Based Architecture

**Location**: `src/services/`

Decomposed architecture with dependency injection for better testability and maintainability.

**Core Services:**

| Service | Location | Purpose |
|---------|----------|---------|
| `RequestManager` | `services/core/RequestManager.ts` | Request queuing and prioritization |
| `CacheManager` | `services/core/CacheManager.ts` | Response caching with TTL |
| `RateLimiter` | `services/core/RateLimiter.ts` | API rate limiting |
| `CircuitBreaker` | `services/core/CircuitBreaker.ts` | Failure detection and recovery |
| `MetricsCollector` | `services/core/MetricsCollector.ts` | Performance metrics |
| `ModelService` | `services/ModelService.ts` | Model management and selection |
| `StreamCoordinator` | `services/chat/StreamCoordinator.ts` | Streaming response coordination |

**Service Factory Pattern:**
```typescript
import { ServiceFactory } from './services/ServiceFactory';

const aiService = ServiceFactory.createAIService(
  eventBus,
  settings,
  saveSettings,
  config
);
```

**Event-Driven Communication:**
Services communicate via `IEventBus` interface for loose coupling:
```typescript
eventBus.emit('request:started', { requestId, timestamp });
eventBus.on('request:completed', (data) => { /* handle */ });
```

---

### 4. Tool/Agent System

**Location**: `src/components/agent/`

Agent mode enables AI to autonomously execute tools to accomplish tasks.

**Architecture:**

```
User Request
    ↓
ChatView → buildContextMessages() → AIDispatcher
    ↓
AI Response with Tool Commands
    ↓
AgentResponseHandler.parseToolCommands()
    ↓
ToolRegistry.execute(toolName, args)
    ↓
Tool Execution (with context injection)
    ↓
Tool Results → Back to AI → Continue or Complete
```

**Key Components:**

| Component | File | Purpose |
|-----------|------|---------|
| `ToolRegistry` | `agent/ToolRegistry.ts` | Tool registration and execution |
| `AgentResponseHandler` | `agent/AgentResponseHandler/` | Parse and handle tool commands |
| `AgentModeManager` | `agent/agentModeManager.ts` | Agent settings management |
| `MessageRenderer` | `agent/MessageRenderer.ts` | Render messages with tool displays |
| `TaskContinuation` | `agent/TaskContinuation.ts` | Multi-turn agent conversations |

**Available Tools** (`src/components/agent/tools/`):

1. **File Operations:**
   - `FileReadTool` - Read file contents
   - `FileWriteTool` - Create/modify files with backups
   - `FileDeleteTool` - Delete files safely
   - `FileMoveTool` - Rename/relocate files
   - `FileSearchTool` - Search vault by filename/content
   - `FileListTool` - List files in directory
   - `FileDiffTool` - Show file differences

2. **Context Management:**
   - `ContextNotesTool` - Manage context notes
   - `ContextNotesAddCurrentTool` - Add current note to context
   - `ContextNotesAddAllOpenTool` - Add all open notes
   - `ContextNotesClearTool` - Clear context notes

3. **Utilities:**
   - `ThoughtTool` - AI reasoning/planning display

**Tool Interface:**
```typescript
interface Tool {
  name: string;
  description: string;
  execute(args: any, context: ToolContext): Promise<ToolResult>;
}

interface ToolContext {
  app: App;
  plugin: MyPlugin;
  editor?: Editor;
}
```

**Adding a New Tool:**
1. Create `src/components/agent/tools/YourTool.ts` implementing `Tool` interface
2. Export from `tools/toolcollect.ts`
3. Register in `agentModeManager.ts`: `toolRegistry.register(new YourTool())`
4. Tool receives context automatically

---

## System Components

### Chat System

**Main File**: `src/chat.ts` (`ChatView` class)

The chat interface is the primary user interaction point.

**Key Features:**
- Real-time streaming responses
- Message regeneration
- Persistent chat history
- Context notes integration
- Token counting
- Live/Source mode toggle
- Clickable note links

**Message Flow:**
```
User Input (ChatInput)
    ↓
buildContextMessages() - Assemble system prompt + context
    ↓
AIDispatcher.getCompletion() - Route to provider
    ↓
StreamCoordinator/ResponseStreamer - Handle streaming
    ↓
MessageRenderer - Render to DOM
    ↓
Chat History - Persist to data.json
```

**Streaming Architecture:**

The plugin uses a dual-streaming system:
- **StreamCoordinator** (`services/chat/StreamCoordinator.ts`) - New centralized system
- **ResponseStreamer** (`components/chat/ResponseStreamer.ts`) - Legacy fallback

StreamCoordinator is preferred and handles:
- Stream lifecycle management
- Stop button functionality
- Agent mode continuation
- Error recovery

---

### Settings System

**Location**: `src/settings/`

**Components:**
- `SettingTab.ts` - Main settings UI
- `settings.ts` - Legacy settings (being migrated)
- `types/settings.ts` - Settings type definitions

**Settings Structure:**
```typescript
interface MyPluginSettings {
  // Provider configurations
  provider: ValidProviderName;
  openaiSettings: OpenAISettings;
  anthropicSettings: AnthropicSettings;
  geminiSettings: GeminiSettings;
  openrouterSettings: OpenRouterSettings;
  
  // Agent mode
  agentMode: AgentModeSettings;
  
  // UI behavior
  uiBehaviorSettings: UIBehaviorSettings;
  
  // Model presets
  modelSettingPresets: ModelSettingPreset[];
  
  // YAML generators
  yamlAttributeGenerators: YAMLAttributeGenerator[];
  
  // Feature flags
  enableContextNotes: boolean;
  referenceCurrentNote: boolean;
  debugMode: boolean;
}
```

**Settings Persistence:**
- Stored in `data.json` in plugin folder
- Auto-saved on changes
- Validated on load with defaults

---

### Context Building

**Location**: `src/utils/contextBuilder.ts`

Centralized utility for assembling AI conversation context.

**Function**: `buildContextMessages()`

**Assembles:**
1. System message (from `utils/systemMessage.ts`)
2. Recently opened files (if enabled)
3. Context notes (if enabled)
4. Current note content (if enabled)
5. Chat history

**Usage:**
```typescript
const messages = await buildContextMessages({
  app,
  plugin,
  includeCurrentNote: true,
  includeContextNotes: true,
  debug: false
});
```

---

### YAML Attribute Generation

**Location**: `src/YAMLHandler.ts`

Dynamic frontmatter generation using AI.

**Features:**
- Custom YAML attribute generators
- Template-based generation
- Automatic frontmatter insertion
- Command palette integration

**Example Generator:**
```typescript
{
  name: "Generate Summary",
  prompt: "Generate a brief summary of this note",
  attributeName: "summary",
  enabled: true
}
```

### Chat Persistence & Export

**Location**: `src/components/chat/chatPersistence.ts`

Handles saving chat conversations as Obsidian notes with YAML frontmatter.

**Features:**
- YAML frontmatter with provider, model, system message, temperature
- Agent mode state preservation (`agent_mode_enabled`, `agent_prompt`)
- Automatic agent mode enabling on note load when `agent_mode_enabled: true` is detected
- Symmetric behavior: agent mode is disabled when loading notes without agent mode keys
- Backward compatibility with existing YAML structure
- **Bug Fix**: Tool display rendering during execution (uses `display.getElement()`)
- **Bug Fix**: Agent mode button state synchronization after YAML loading

**YAML Export Structure:**
```yaml
---
provider: openai
model: gpt-4
unified_model: openai:gpt-4
system_message: "You are a helpful assistant..."
temperature: 0.7
agent_mode_enabled: true
agent_prompt: "You are an AI assistant with access to tools..."
---

Chat content here...
```

**Key Functions:**
- `buildChatYaml()` - Generate YAML frontmatter for export
- `loadChatYamlAndApplySettings()` - Load YAML and apply settings
- `saveChatAsNote()` - Export chat as Obsidian note

---

## Data Flow

### 1. Chat Message Flow

```
User types message in ChatInput
    ↓
ChatView.handleSendMessage()
    ↓
buildContextMessages() - Assemble full context
    ↓
AIDispatcher.getCompletion(messages, options, streamCallback)
    ↓
Provider.getCompletion() - API call
    ↓
streamCallback(chunk) - Receive chunks
    ↓
StreamCoordinator.handleStreamChunk() - Process chunk
    ↓
MessageRenderer.updateMessage() - Update DOM
    ↓
Chat history updated - Persist to data.json
```

### 2. Agent Mode Flow

```
AI response contains tool command: <tool>file_read</tool>
    ↓
AgentResponseHandler.parseToolCommands()
    ↓
Extract tool name and arguments
    ↓
ToolRegistry.execute('file_read', args, context)
    ↓
FileReadTool.execute() - Read file
    ↓
Tool result returned
    ↓
MessageRenderer displays tool execution
    ↓
TaskContinuation.continueWithToolResults()
    ↓
Send tool results back to AI
    ↓
AI continues or completes task
```

### 3. Streaming Flow

```
Provider receives request
    ↓
Provider.getCompletion() with streamCallback
    ↓
API returns SSE/streaming response
    ↓
Provider parses chunks → streamCallback(chunk)
    ↓
StreamCoordinator receives chunk
    ↓
Check for tool commands (if agent mode)
    ↓
Update DOM via MessageRenderer
    ↓
On complete: finalize message, update history
```

---

## Key Subsystems

### Type System

**Location**: `src/types/`

Comprehensive TypeScript types organized by domain:

| File | Purpose |
|------|---------|
| `settings.ts` | Plugin settings types |
| `providers.ts` | Provider interfaces and types |
| `core.ts` | Core message and completion types |
| `chat.ts` | Chat-specific types |
| `tools.ts` | Tool and agent types |
| `backup.ts` | Backup system types |
| `index.ts` | Re-exports all types |

**Type Guards** (`src/utils/typeguards.ts`):
- Runtime validation functions
- `isValidProviderName()`, `isValidMessagesArray()`, `isNonEmptyString()`
- Provider settings access helpers
- Path validation

### Utilities

**Location**: `src/utils/`

| Utility | Purpose |
|---------|---------|
| `logger.ts` | Centralized logging with `debugLog()` |
| `errorHandler.ts` | Error handling and recovery |
| `tokenCounter.ts` | Token counting for context windows |
| `validationUtils.ts` | Input validation and sanitization |
| `fileUtils.ts` | File operations helpers |
| `noteUtils.ts` | Note processing utilities |
| `linkHandler.ts` | Obsidian link parsing and navigation |
| `lruCache.ts` | LRU cache implementation |
| `objectPool.ts` | Object pooling for performance |
| `asyncOptimizer.ts` | Async batching and optimization |
| `performanceMonitor.ts` | Performance tracking |
| `stateManager.ts` | Global state management |
| `eventBus.ts` | Event-driven communication |

### Backup System

**Location**: `src/components/BackupManager.ts`

Automatic file backups before AI modifications.

**Features:**
- Timestamped backups in `binary-backups/`
- Configurable retention policy
- Restore functionality
- Backup verification

---

## File Organization

```
ai-assistant-for-obsidian/
├── src/
│   ├── main.ts                    # Plugin entry point
│   ├── chat.ts                    # Chat view (main UI)
│   ├── settings.ts                # Legacy settings
│   ├── YAMLHandler.ts             # YAML generation
│   ├── promptConstants.ts         # System prompts
│   │
│   ├── components/                # UI components
│   │   ├── agent/                 # Agent mode components
│   │   │   ├── agentModeManager.ts
│   │   │   ├── ToolRegistry.ts
│   │   │   ├── MessageRenderer.ts
│   │   │   ├── AgentResponseHandler/
│   │   │   └── tools/             # Tool implementations
│   │   ├── chat/                  # Chat components
│   │   │   ├── ResponseStreamer.ts
│   │   │   ├── MessageRegenerator.ts
│   │   │   └── ChatInput.ts
│   │   ├── commands/              # Command palette commands
│   │   ├── BackupManager.ts
│   │   └── FuzzyModelDropdown.ts
│   │
│   ├── services/                  # Service layer
│   │   ├── ServiceFactory.ts      # Service creation
│   │   ├── ModelService.ts        # Model management
│   │   ├── interfaces.ts          # Service interfaces
│   │   ├── core/                  # Core services
│   │   │   ├── RequestManager.ts
│   │   │   ├── CacheManager.ts
│   │   │   ├── RateLimiter.ts
│   │   │   ├── CircuitBreaker.ts
│   │   │   └── MetricsCollector.ts
│   │   ├── chat/                  # Chat services
│   │   │   └── StreamCoordinator.ts
│   │   ├── plugin/                # Plugin services
│   │   └── crosscutting/          # Cross-cutting concerns
│   │
│   ├── settings/                  # Settings UI
│   │   ├── SettingTab.ts
│   │   └── index.ts
│   │
│   ├── types/                     # TypeScript types
│   │   ├── index.ts
│   │   ├── settings.ts
│   │   ├── providers.ts
│   │   ├── core.ts
│   │   ├── chat.ts
│   │   ├── tools.ts
│   │   └── backup.ts
│   │
│   └── utils/                     # Utilities
│       ├── aiDispatcher.ts        # Central AI dispatcher
│       ├── contextBuilder.ts      # Context assembly
│       ├── logger.ts              # Logging
│       ├── errorHandler.ts        # Error handling
│       ├── typeguards.ts          # Type guards
│       ├── validationUtils.ts     # Validation
│       ├── tokenCounter.ts        # Token counting
│       ├── lruCache.ts            # Caching
│       ├── objectPool.ts          # Object pooling
│       └── ... (many more)
│
├── providers/                     # AI provider implementations
│   ├── index.ts                   # Provider exports
│   ├── registry.ts                # Provider registry
│   ├── base.ts                    # Base provider class
│   ├── openai.ts                  # OpenAI provider
│   ├── anthropic.ts               # Anthropic provider
│   ├── gemini.ts                  # Gemini provider
│   └── openrouter.ts              # OpenRouter provider
│
├── tests/                         # Test suite
│   ├── setup.ts                   # Global test setup
│   ├── integration/               # Integration tests
│   ├── yamlAgentMode.test.ts      # YAML agent mode tests
│   └── *.test.ts                  # Unit tests
│
├── docs/                          # Documentation
│   ├── ARCHITECTURE.md            # This file
│   ├── TEMPLATE.md                # Doc template
│   └── *.md                       # Implementation docs
│
├── __mocks__/                     # Test mocks
│   └── obsidian.ts                # Obsidian API mock
│
├── ai-calls/                      # AI call logs
├── binary-backups/                # File backups
├── esbuild.config.mjs             # Build configuration
├── jest.config.cjs                # Test configuration
├── tsconfig.json                  # TypeScript config
└── package.json                   # Dependencies
```

---

## Extension Points

### Adding New Features

#### 1. New AI Provider

See [Provider Registry System](#1-provider-registry-system) above.

#### 2. New Agent Tool

See [Tool/Agent System](#4-toolagent-system) above.

#### 3. New Command

**Location**: `src/components/commands/`

```typescript
// In main.ts
this.addCommand({
  id: 'your-command',
  name: 'Your Command',
  callback: () => {
    // Command logic
  }
});
```

#### 4. New Setting

1. Add to `src/types/settings.ts`:
```typescript
interface MyPluginSettings {
  yourNewSetting: boolean;
}
```

2. Add default in `main.ts`:
```typescript
DEFAULT_SETTINGS = {
  yourNewSetting: false,
  // ...
}
```

3. Add UI in `src/settings/SettingTab.ts`:
```typescript
new Setting(containerEl)
  .setName('Your Setting')
  .setDesc('Description')
  .addToggle(toggle => toggle
    .setValue(this.plugin.settings.yourNewSetting)
    .onChange(async (value) => {
      this.plugin.settings.yourNewSetting = value;
      await this.plugin.saveSettings();
    }));
```

#### 5. New Service

1. Create service class implementing interface
2. Register in `ServiceFactory.ts`
3. Wire up dependencies via constructor injection
4. Use event bus for communication

---

## Performance & Optimization

### Priority 2 Optimizations (Active)

**Object Pooling** (`utils/objectPool.ts`):
- `MessageContextPool` - Reuse message context objects
- `PreAllocatedArrays` - Pre-allocated arrays for common operations

**LRU Caching** (`utils/lruCache.ts`):
- Response caching with TTL
- `LRUCacheFactory.createResponseCache()`
- Automatic cache invalidation

**DOM Batching** (`utils/domBatcher.ts`):
- `DOMBatcher` - Batch DOM updates
- Reduces reflows and repaints

**Async Optimization** (`utils/asyncOptimizer.ts`):
- `AsyncDebouncer` - Debounce async operations
- `ParallelExecutor` - Parallel execution with concurrency limits
- `AsyncBatcher` - Batch async operations

### Priority 3 Optimizations (Advanced)

**Dependency Injection** (`utils/dependencyInjection.ts`):
- `DIContainer` - Service lifecycle management
- Singleton and transient scopes
- Lazy initialization

**State Management** (`utils/stateManager.ts`):
- `globalStateManager` - Reactive state
- State subscriptions
- Computed values

**Stream Pooling** (`utils/streamManager.ts`):
- `globalStreamManager` - Stream resource management
- Stream reuse
- Memory optimization

### Performance Monitoring

**Location**: `utils/performanceMonitor.ts`

```typescript
import { performanceMonitor } from './performanceMonitor';

performanceMonitor.startMeasure('operation-name');
// ... operation ...
performanceMonitor.endMeasure('operation-name');

const metrics = performanceMonitor.getMetrics();
```

**Metrics Tracked:**
- Request latency
- Token usage
- Cache hit rates
- Error rates
- Provider performance

---

## Testing Strategy

### Test Organization

```
tests/
├── setup.ts                       # Global test setup
├── integration/                   # Integration tests
│   └── stopButton.test.ts
└── *.test.ts                      # Unit tests
```

### Running Tests

```bash
npm test                           # Run all tests
npm run test:watch                 # Watch mode
npm run test:coverage              # Coverage report
```

### Testing Patterns

**Mock Obsidian API** (`__mocks__/obsidian.ts`):
```typescript
import { App, TFile } from 'obsidian';
// Mocked automatically by Jest
```

**Test Structure**:
```typescript
describe('ComponentName', () => {
  let component: ComponentName;
  
  beforeEach(() => {
    component = new ComponentName();
  });
  
  it('should do something', () => {
    expect(component.method()).toBe(expected);
  });
});
```

**Integration Tests**:
- Test full workflows
- Use real provider instances (with test API keys)
- Verify UI updates

**Unit Tests**:
- Test individual functions
- Mock dependencies
- Fast execution

### Test Coverage Goals

- Core utilities: >90%
- Providers: >80%
- Services: >85%
- UI components: >70%

---

## Critical Conventions

### Logging

**Always use `debugLog`, never `console.log` directly:**

```typescript
import { debugLog } from './utils/logger';

debugLog(settings.debugMode, 'debug', 'Message', data);
// Levels: 'debug' | 'info' | 'warn' | 'error'
```

### Error Handling

**Wrap async operations:**

```typescript
import { withErrorHandling } from './utils/errorHandler';

const result = await withErrorHandling(
  async () => { /* operation */ },
  'Operation failed',
  { showNotice: true }
);
```

### Type Safety

**Use type guards for runtime validation:**

```typescript
import { isValidProviderName, isValidMessagesArray } from './typeguards';

if (isValidProviderName(provider)) {
  // TypeScript knows provider is ValidProviderName
}
```

### Path Validation

**Always validate paths before file operations:**

```typescript
import { validatePath } from './utils/validationUtils';

const validPath = validatePath(userInput);
if (!validPath) {
  throw new Error('Invalid path');
}
```

---

## Common Patterns

### Dynamic Model Selection

```typescript
// Use UnifiedModel system for cross-provider models
const unifiedModelId = `${provider}:${modelName}`;
const provider = createProviderFromUnifiedModel(settings, unifiedModelId);
```

### Stream Management

```typescript
// Modern approach - use StreamCoordinator
const streamId = await streamCoordinator.startStream({
  messages,
  options,
  streamCallback,
  onComplete
});

// Stop: streamCoordinator.stopStream(streamId)
```

### Message Context Building

```typescript
import { buildContextMessages } from './utils/contextBuilder';

const messages = await buildContextMessages({
  app,
  plugin,
  includeCurrentNote: true,
  includeContextNotes: true
});
```

### Provider Settings Access

```typescript
import { getProviderSettings } from './utils/typeguards';

const providerSettings = getProviderSettings(settings, 'openai');
const apiKey = providerSettings?.apiKey;
```

---

## Glossary

| Term | Definition |
|------|------------|
| **Provider** | AI service integration (OpenAI, Anthropic, etc.) |
| **Tool** | Agent-executable function (file operations, search, etc.) |
| **Unified Model** | Cross-provider model identifier (`provider:model`) |
| **Context Notes** | Reference notes included in AI conversations |
| **Agent Mode** | Autonomous AI tool execution mode |
| **Stream Coordinator** | Centralized streaming response manager |
| **Service Factory** | Dependency injection container |
| **Type Guard** | Runtime type validation function |
| **LRU Cache** | Least Recently Used cache |
| **Circuit Breaker** | Failure detection and recovery pattern |

---

## Additional Resources

- **README.md** - User-facing documentation
- **docs/** - Implementation notes and change logs
- **.github/copilot-instructions.md** - AI assistant development guide
- **tests/** - Test suite with examples

---

## Maintenance Notes

This document should be updated when:
- New major features are added
- Architecture patterns change
- New subsystems are introduced
- File organization is restructured

**Maintainers**: Keep this document in sync with code changes. Use implementation docs in `docs/` for detailed change tracking.
