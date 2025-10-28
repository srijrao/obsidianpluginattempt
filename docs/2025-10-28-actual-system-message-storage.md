# Actual System Message Storage for Accurate Chat Exports

**Date**: 2025-10-28
**Status**: ✅ **COMPLETED & VERIFIED**
**Feature**: Store actual system messages sent to AI for debugging accuracy
**Issue**: Chat exports were missing agent tool definitions in system messages

## Problem

Chat exports are essential for debugging but were showing incomplete system messages. When agent mode is enabled, the system dynamically prepends tool definitions to the user's system message. However, chat exports only showed the user's original system message from settings, not the complete message actually sent to the AI.

This caused debugging issues because:
1. Export didn't match AI call logs (ai-calls/ folder shows complete message)
2. Impossible to reproduce exact AI behavior from chat exports
3. Agent tool definitions critical for understanding AI responses were missing

## Solution Overview

Implemented **Option 2**: Store actual system message in chat history at send time.

### Why Option 2 vs Option 1?

**Option 1 (Reconstruct)**: Rebuild agent prompt at export time from current settings
- ❌ Inaccurate if settings change between chat and export
- ❌ Doesn't capture exact message if prompts were customized
- ❌ Reconstruction assumptions may not match original

**Option 2 (Store)**: Capture complete system message when sent to AI
- ✅ Perfect accuracy - stores EXACTLY what was sent
- ✅ Immune to settings changes
- ✅ No reconstruction assumptions
- ✅ Backward compatible (fallback to reconstruction for old chats)

## Implementation Details

### 1. ChatMessage Interface Enhancement

**File**: `src/components/chat/ChatHistoryManager.ts`

```typescript
export interface ChatMessage {
  timestamp: string;
  sender: string;
  role: 'system' | 'user' | 'assistant';
  content: string;
  reasoning?: ReasoningData;
  taskStatus?: TaskStatus;
  toolResults?: ToolExecutionResult[];
  actualSystemMessage?: string;  // NEW: Actual system message sent to AI
}
```

### 2. StreamCoordinator Capture

**File**: `src/services/chat/StreamCoordinator.ts`

Added `actualSystemMessage` field to `StreamState`:
```typescript
export interface StreamState {
  isStreaming: boolean;
  currentStreamId?: string;
  startTime?: number;
  totalChunks: number;
  totalCharacters: number;
  actualSystemMessage?: string;  // NEW
}
```

Modified `startStream()` to capture after `addAgentSystemPrompt()`:
```typescript
await this.addAgentSystemPrompt(messages);

// Capture actual system message (after agent prompt prepended)
const systemMessage = messages.find(msg => msg.role === 'system');
if (systemMessage) {
  this.streamState.actualSystemMessage = systemMessage.content;
}
```

Added getter method:
```typescript
public getActualSystemMessage(): string | undefined {
  return this.streamState.actualSystemMessage;
}
```

### 3. ResponseStreamer Capture (Fallback Path)

**File**: `src/components/chat/ResponseStreamer.ts`

Same implementation pattern for legacy streaming path:
- Added `actualSystemMessage` private field
- Capture after `addAgentSystemPrompt()`
- Public getter method

### 4. Chat.ts Integration

**File**: `src/chat.ts`

Capture from both streaming systems:
```typescript
const responseContent = await this.streamAssistantResponse(messages, tempContainer);

// Capture actual system message from whichever streaming system was used
let actualSystemMessage: string | undefined = undefined;
if (this.streamCoordinator) {
  actualSystemMessage = this.streamCoordinator.getActualSystemMessage();
} else if (this.responseStreamer) {
  actualSystemMessage = this.responseStreamer.getActualSystemMessage();
}
```

Store in chat history:
```typescript
await this.chatHistoryManager.addMessage({
  timestamp: messageEl.dataset.timestamp || new Date().toISOString(),
  sender: 'assistant',
  content: responseContent,
  ...(actualSystemMessage && { actualSystemMessage }),  // NEW
  ...(enhancedMessageData && {
    toolResults: enhancedMessageData.toolResults,
    reasoning: enhancedMessageData.reasoning,
    taskStatus: enhancedMessageData.taskStatus
  })
});
```

### 5. Chat Export Integration

**File**: `src/components/chat/chatPersistence.ts`

Modified `buildChatYaml()` to accept `actualSystemMessage` parameter:
```typescript
export async function buildChatYaml(
  settings: MyPluginSettings, 
  provider: string, 
  model: string,
  plugin?: any,
  actualSystemMessage?: string  // NEW
)
```

Priority logic:
```typescript
let systemMessage: string;

if (actualSystemMessage) {
  // Option 2: Use ACTUAL message from chat history
  systemMessage = actualSystemMessage;
} else {
  // Option 1 fallback: Reconstruct (for old chats)
  systemMessage = settings.systemMessage;
  if (agentModeEnabled) {
    systemMessage = agentPrompt + '\n\n' + settings.systemMessage;
  }
}
```

Modified `saveChatAsNote()` to extract from chat history:
```typescript
let actualSystemMessage: string | undefined = undefined;
if (chatHistory && chatHistory.length > 0) {
  // Find most recent assistant message with actualSystemMessage
  for (let i = chatHistory.length - 1; i >= 0; i--) {
    if (chatHistory[i].sender === 'assistant' && chatHistory[i].actualSystemMessage) {
      actualSystemMessage = chatHistory[i].actualSystemMessage;
      break;
    }
  }
}

const yaml = await buildChatYaml(settings, provider, model, plugin, actualSystemMessage);
```

**File**: `src/components/chat/eventHandlers.ts`

Updated `handleSaveNote()` to pass chat history:
```typescript
export function handleSaveNote(
  messagesContainer: HTMLElement, 
  plugin: MyPlugin, 
  app: App, 
  agentResponseHandler?: any,
  chatHistoryManager?: any  // NEW
)
```

**File**: `src/chat.ts`

Updated call to pass chatHistoryManager:
```typescript
handleSaveNote(this.messagesContainer, this.plugin, this.app, this.agentResponseHandler, this.chatHistoryManager)
```

## Data Flow

1. **User sends message** → `ChatView.sendMessage()`
2. **Build context** → `buildContextMessages()`
3. **Stream response** → `streamCoordinatorResponse()` or `streamAssistantResponse()`
   - Before AI call: `addAgentSystemPrompt(messages)` modifies messages array
   - **CAPTURE**: Extract `messages.find(m => m.role === 'system').content`
   - Store in StreamState/ResponseStreamer field
4. **Response complete** → Get actualSystemMessage via getter
5. **Save to history** → `chatHistoryManager.addMessage()` with `actualSystemMessage` field
6. **User exports chat** → `handleSaveNote()` 
   - Get chat history
   - Extract `actualSystemMessage` from most recent assistant message
   - Pass to `buildChatYaml()`
   - Use in YAML frontmatter

## Backward Compatibility

- ✅ Old chats without `actualSystemMessage` fall back to reconstruction
- ✅ New chats get perfect accuracy
- ✅ No data migration needed
- ✅ Graceful degradation

## Testing Checklist

- [x] Send message in agent mode with tools enabled
- [x] Check chat-history.json contains `actualSystemMessage` in assistant messages
- [x] Export chat and verify YAML shows complete system message including tool definitions
- [x] Compare chat export system message with ai-calls/ log - should match exactly
- [x] Test with agent mode disabled - should show regular system message
- [x] Test export of old chat without actualSystemMessage - should fall back to reconstruction
- [x] Verify ResponseStreamer fallback path also captures (disable StreamCoordinator temporarily)

### Test Suite Results

A comprehensive test suite was created in `tests/actualSystemMessage.test.ts` covering:

1. **StreamCoordinator Capture** (3 tests)
   - Captures actual system message when agent mode is enabled
   - Captures regular system message when agent mode is disabled  
   - Returns undefined when no system message exists

2. **ResponseStreamer Capture** (1 test)
   - Verifies getter method exists for fallback path

3. **ChatHistoryManager Storage** (2 tests)
   - Stores actualSystemMessage in chat history
   - Allows messages without actualSystemMessage (backward compatibility)

4. **buildChatYaml Function** (3 tests)
   - Uses actualSystemMessage when provided (Option 2 - priority path)
   - Fallbacks to reconstruction when actualSystemMessage not provided (Option 1)
   - Properly escapes special YAML characters

5. **saveChatAsNote Integration** (3 tests)
   - Extracts actualSystemMessage from chat history
   - Handles multiple assistant messages using most recent
   - Handles old chats without actualSystemMessage (backward compatibility)

6. **End-to-End Workflow** (1 test)
   - Complete flow: capture → store → export actualSystemMessage

**All 13 tests passing** ✅

Run tests with: `npm test -- actualSystemMessage.test.ts`

## Production Verification

**Date**: 2025-10-28

Feature verified working in production environment:

✅ **Chat Export** (`consolelogs/Chat Export 2025-10-28 10-37.md`)
- Complete system message with all 9 agent tools in YAML frontmatter
- Custom persona settings preserved after agent tools
- Properly formatted multi-line YAML

✅ **AI Call Log Match** (`consolelogs/AI Call Export 2025-10-28 10-37.md`)
- System message in export matches AI call log exactly
- Confirms accurate capture and storage

✅ **Key Validations**
- Agent tools visible in exported notes
- Backward compatibility maintained
- No build errors
- All automated tests passing

**Feature is production-ready and working as designed.** ✅

## Related Files Modified

1. `src/components/chat/ChatHistoryManager.ts` - ChatMessage interface
2. `src/services/chat/StreamCoordinator.ts` - Capture and getter
3. `src/components/chat/ResponseStreamer.ts` - Capture and getter
4. `src/chat.ts` - Integration and storage
5. `src/components/chat/chatPersistence.ts` - Export logic
6. `src/components/chat/eventHandlers.ts` - Save button handler

## Benefits

1. **Perfect Debugging**: Chat exports now match AI call logs exactly
2. **Reproducibility**: Can reproduce exact AI behavior from exports
3. **Tool Visibility**: Agent tool definitions visible in exports for debugging
4. **Future-Proof**: Captures any dynamic prompt modifications, not just agent tools
5. **Settings-Independent**: Immune to settings changes between chat and export

## Notes

- Only stores actualSystemMessage for assistant responses (one per AI interaction)
- Uses most recent actualSystemMessage in export (handles multi-turn conversations)
- Minimal storage overhead (~few KB per chat for system message)
- No performance impact on streaming or chat display

## How to update the date in this document

This document's header date was filled manually using today's date. To reproduce or update the date later, you can use the small helper in `package.json` that prints an ISO timestamp.

- Using the project's npm script (recommended):

  npm run show-iso

  The script prints an ISO timestamp like `2025-10-28T15:34:12.345Z`. To extract a `YYYY-MM-DD` date portion (recommended filename format), you can run (PowerShell example):

  (npm run show-iso --silent) -replace 'T.*',''

  Or using PowerShell's date formatting directly:

  (Get-Date).ToString('yyyy-MM-dd')

- Suggested filename pattern for this doc (if you rename it to include the date):

  `docs/YYYY-MM-DD-actual-system-message-storage.md`

When updating the file, update any links that reference the previous filename.
