# Chat Architecture Refactor: Markdown as Source of Truth
Date: 2025-11-02 12:51:14 UTC

## Objective / Overview
Refactor the chat message persistence, rendering, and loading system to use **raw Markdown as the single source of truth**. This addresses critical bugs with tool display rendering, source/live mode confusion, chat history duplication, and lack of persistence for agent tool use data.

**Additional Objectives:**
- Add agent mode indicator to AI call logs - track whether each AI request was made in agent mode

### Core Problems Identified
1. **Tool Display Rendering Issues:**
   - Tools render in reverse order initially (newest on top)
   - Toggling source/live mode fixes the order (indicates DOM manipulation issue)
   - Both source AND live modes show rendered tool displays
   - Expected: source mode shows raw JSON blocks, live mode shows rich tool UI
   - Tool use data doesn't persist between plugin reloads

2. **Architecture Issues:**
   - Multiple conversion paths: saved notes → chat loading → source/live mode → chat history
   - Chat history duplicates on plugin reload
   - No single source of truth for message content
   - Complex state synchronization between rendered DOM, chat history, and saved notes

3. **Related Bug from Previous Implementation (2025-11-02-agent-mode-yaml-export.md):**
   - Tool display loading fixed in `activateChatViewAndLoadMessages` but reveals deeper architectural issues
   - Redundant parsing of tool data from message content vs using already-parsed toolResults
   - Mixing of display logic with data storage

## Checklist
- [ ] [Task 1 - Analysis/Investigation] - Map all message flow paths and identify conversion points
- [ ] [Task 2 - Design] - Design raw markdown storage format with tool JSON blocks
- [ ] [Task 3 - Source Mode Implementation] - Make source mode display actual markdown (including JSON)
- [ ] [Task 4 - Live Mode Implementation] - Render markdown with tool displays
- [ ] [Task 5 - Chat History Persistence] - Save/load as raw markdown
- [ ] [Task 6 - Note Loading] - Load saved notes as markdown
- [ ] [Task 7 - Fix Tool Display Order] - Ensure correct DOM insertion order
- [ ] [Task 8 - Remove Duplication] - Eliminate redundant conversion paths
- [ ] [Task 9 - AI Call Logging Enhancement] - Add agent mode indicator to AI call logs
- [ ] [Task 10 - Testing] - Comprehensive testing of all flows
- [ ] [Task 11 - Run static checks/tests] - Ensure build passes and tests run
- [ ] [Task 12 - Update documentation/progress notes] - Update this document

## Plan

### Architecture Design

#### **New Philosophy: Markdown First**

`````
┌─────────────────────────────────────────────────────────────┐
│                   RAW MARKDOWN (Source of Truth)            │
│  - ALL messages stored as raw markdown strings             │
│  - User messages: plain markdown text                      │
│  - Assistant messages: markdown + optional tool JSON blocks│
│                                                              │
│  Example user message:                                      │
│  "What's the weather like today?"                           │
│                                                              │
│  Example assistant message (no tools):                      │
│  "I don't have access to current weather data, but I can    │
│  help you check a weather website or app."                  │
│                                                              │
│  Example assistant message with tools:                      │
│  I'll help you with that file.                              │
│                                                              │
│  ```ai-tool-execution                                       │
│  {                                                           │
│    "toolResults": [...],                                    │
│    "reasoning": "...",                                      │
│    "taskStatus": "..."                                      │
│  }                                                           │
│  ```                                                         │
│                                                              │
│  The file has been read successfully.                       │
└─────────────────────────────────────────────────────────────┘
         │                                    ▲
         │ render for UI                      │ extract from UI
         ▼                                    │
┌──────────────────────────┐      ┌──────────────────────────┐
│    LIVE MODE (ChatUI)    │      │   SOURCE MODE (ChatUI)   │
│  - Rendered markdown     │      │  - Show raw markdown     │
│  - Tool JSON → displays  │      │  - Show JSON blocks      │
└──────────────────────────┘      └──────────────────────────┘
         │                                    │
         │ save                              │ save
         ▼                                    ▼
┌─────────────────────────────────────────────────────────────┐
│              PERSISTENCE (chat-history.json)                │
│  - Array of messages with raw markdown content              │
│  - No pre-rendered HTML                                     │
│  - No separate toolResults field (embedded in markdown)     │
└─────────────────────────────────────────────────────────────┘
`````

#### **Key Design Decisions**

1. **Single Format for Storage:**
   - All messages stored as raw markdown strings
   - Tool execution data embedded as JSON code blocks with `ai-tool-execution` language tag
   - No separate `toolResults` field in storage schema

2. **Source Mode = Editor Source Mode:**
   - Display the actual raw markdown text
   - Include all code blocks (including `ai-tool-execution` blocks)
   - Editable like a text editor

3. **Live Mode = Editor Live Preview:**
   - Render markdown to HTML
   - Parse `ai-tool-execution` blocks and replace with `ToolRichDisplay` components
   - Interactive, not editable

4. **Message Flow:**
   ```
   User types → markdown → save to history → render for display
   AI responds → markdown + tool JSON → save to history → render for display
   Load history → read markdown → parse → render appropriate mode
   Load note → read markdown → parse → render appropriate mode
   Export note → serialize markdown from history → write to file
   ```

### API/Integration Points

#### **Modified Interfaces**

```typescript
// Message storage format (simplified)
interface StoredMessage {
    role: 'user' | 'assistant';
    content: string;  // Raw markdown, may contain ai-tool-execution blocks
    timestamp: number;
    sender?: string;  // For backward compatibility
}

// Chat history format
interface ChatHistory {
    messages: StoredMessage[];
    version: string;  // For future migrations
}
```

#### **Key Functions to Modify**

1. **Message Creation:**
   - `addMessage()` in `chat.ts` - accept markdown, embed tool data as JSON block if present
   - Store clean markdown in `dataset.rawContent`
   - Parse and render based on current mode

2. **Mode Switching:**
   - `toggleSourceMode()` or equivalent - switch between raw markdown and rendered view
   - No re-parsing, just different display of same data

3. **Tool Display Integration:**
   - `AgentResponseHandler` - when tools execute, create markdown with embedded JSON
   - `MessageRenderer.renderToolResults()` - parse JSON blocks and create displays
   - `ToolRichDisplay` - continue to handle rich rendering (no changes needed)

4. **Chat History:**
   - `ChatHistoryManager.saveMessage()` - save raw markdown
   - `ChatHistoryManager.loadHistory()` - return messages with raw markdown
   - Remove any HTML serialization/deserialization

5. **Note Loading:**
   - `parseChatNoteContent()` - parse markdown content, extract tool JSON blocks
   - `activateChatViewAndLoadMessages()` - load as markdown, render based on mode

6. **Note Saving:**
   - `saveChatAsNote()` - serialize markdown from history
   - Already mostly correct, just ensure clean markdown export

### UI Changes

1. **Source Mode Display:**
   - Replace rendered content with textarea or code editor showing raw markdown
   - Include all JSON blocks for tool data
   - Allow editing (with re-render on save/cancel)

2. **Live Mode Display:**
   - Current rendering logic mostly correct
   - Ensure `ai-tool-execution` blocks are parsed and replaced with displays
   - No raw JSON blocks visible

3. **Mode Toggle Button:**
   - Clear indicator of current mode (Source | Live)
   - Toggle switches between views without data loss

4. **Tool Display Order:**
   - Fix DOM insertion to maintain chronological order (oldest to newest)
   - Current issue: likely inserting at wrong position or re-rendering out of order

### File Changes

#### **Core Changes:**
- `src/chat.ts` - Major refactor of message rendering, mode switching, and display logic
  - Separate `renderSourceMode()` and `renderLiveMode()` methods
  - Store raw markdown in all message elements
  - Remove HTML serialization from message storage
  
- `src/components/chat/chatHistoryUtils.ts` - Simplify to work with raw markdown
  - Remove tool data extraction logic (embedded in markdown)
  - Render based on current mode
  
- `src/components/chat/Message.ts` - Update message class to handle markdown storage
  - `dataset.rawContent` always contains markdown
  - Render method switches based on mode
  
- `src/components/agent/MessageRenderer.ts` - Update tool rendering
  - Parse `ai-tool-execution` blocks from markdown
  - Replace blocks with `ToolRichDisplay` in live mode
  - Show blocks as code in source mode

#### **Supporting Changes:**
- `src/utils/messageContentParser.ts` - Enhance to work with markdown format
  - `parseToolDataFromMarkdown()` - extract tool JSON from code blocks
  - `embedToolDataInMarkdown()` - create markdown with embedded JSON
  - `cleanMarkdownFromToolData()` - remove tool blocks for clean display
  
- `src/components/chat/chatPersistence.ts` - Ensure clean markdown export
  - Already mostly correct
  - Verify no double-parsing or HTML injection

- `src/utils/aiDispatcher.ts` - Add agent mode indicator to AI call logs
  - Update `requestData` object to include `agentMode: boolean` field
  - Track whether the request is from agent mode or regular chat
  - **Implementation**: Check `this.plugin.settings.agentMode?.enabled` when creating requestData
  
- `src/main.ts` - Update note loading logic
  - `activateChatViewAndLoadMessages()` - pass mode preference
  - Remove redundant tool data parsing

#### **New Files:**
- `src/components/chat/SourceModeRenderer.ts` - Handle source mode display
  - Create editable markdown view
  - Syntax highlighting for JSON blocks
  - Edit/save/cancel functionality

#### **Type Updates:**
- `src/types/index.ts` or `src/types/messages.ts` - Update Message interface
  - Clarify that `content` is always raw markdown
  - Add `renderMode?: 'source' | 'live'` property for view state

### Edge Cases

1. **Backward Compatibility:**
   - Old chat history may have messages without tool data
   - Old chat history may have separate `toolResults` field
   - Migration strategy: convert on load, save in new format

2. **Malformed JSON Blocks:**
   - User manually edits and breaks JSON in source mode
   - Validation on mode switch, fallback to showing raw text

3. **Mode Switching During AI Response:**
   - Stream is in progress when user toggles mode
   - Queue mode switch for after stream completes

4. **Large Messages:**
   - Performance with many tool executions
   - Consider lazy rendering or pagination

5. **Copy/Paste:**
   - Copying from source mode should give markdown
   - Copying from live mode should give rendered text
   - Pasting into chat should work as markdown

6. **Message Editing:**
   - Editing in source mode updates markdown
   - Editing in live mode... should switch to source or use rich editor?

7. **Export to Note:**
   - Already exports markdown, verify tool blocks included
   - YAML frontmatter should not interfere
   - **Agent Mode YAML Keys**: Already implemented (see 2025-11-02-agent-mode-yaml-export.md)
     - `agent_mode_enabled` (boolean) - exported when agent mode is active
     - `agent_prompt` (string) - exported with custom or default agent prompt
     - Auto-enables agent mode on note load if key is true
     - Must verify this continues to work after refactor

8. **Duplication Prevention:**
   - On plugin reload, don't re-add messages from loaded note
   - Clear distinction between "chat session" and "loaded note"

9. **AI Call Logging:**
   - Currently logs: provider, model, messages, options, timestamp, duration
   - Need to add: `agentMode: boolean` to indicate if request was from agent mode
   - Helps with debugging and understanding agent vs regular chat behavior

### Tests

#### **Unit Tests:**
1. Markdown with embedded tool JSON parsing
2. Tool JSON block extraction and cleaning
3. Source mode rendering (raw markdown display)
4. Live mode rendering (markdown to HTML + tool displays)
5. Message storage format (raw markdown only)
6. Migration from old format to new format
7. **AI call logging includes agent mode field** - verify requestData has agentMode boolean

#### **Integration Tests:**
1. Full chat flow: user input → AI response with tools → save → reload
2. Mode toggle during chat session
3. Export to note → load note → verify identical
4. Tool execution → display → save → reload → display matches
5. Duplication prevention on plugin reload
6. **Agent mode YAML persistence** - export with agent mode → load note → agent mode auto-enabled
7. **Agent mode with tool use** - agent mode chat with tools → export → load → verify both agent mode and tool displays work

#### **Manual Testing Scenarios:**
1. Create new chat, send message, verify source/live modes
2. Use agent mode with tools, verify displays render correctly
3. Save chat to note, reload plugin, load note, verify no duplication
4. Toggle modes during active chat, verify no data loss
5. Edit message in source mode, verify changes persist
6. Old chat history (from before refactor) loads correctly
7. **Agent mode AI call logging** - enable agent mode, send request, check ai-calls folder for agentMode field
8. **Regular chat AI call logging** - disable agent mode, send request, verify agentMode=false in log

## Viability Check

### Risks
- **[HIGH] Risk**: Breaking existing chat history - **Mitigation**: Implement migration logic, keep backup of old format
- **[MEDIUM] Risk**: Performance impact from parsing on every render - **Mitigation**: Cache parsed results, only re-parse on content change
- **[MEDIUM] Risk**: Complexity of source mode editor - **Mitigation**: Start simple (textarea), enhance later if needed
- **[LOW] Risk**: Tool display compatibility - **Mitigation**: `ToolRichDisplay` already isolated, minimal changes needed

### Compatibility
- **Backward compatibility**: REQUIRED - old chat history must load
- **Migration strategy**: Load old format, convert to new on save
- **Breaking changes**: Internal only - user-facing behavior improves
- **Data format**: New format is markdown-based, human-readable, future-proof

### Feasibility
- **[HIGH]**: Technical feasibility - patterns are well-established (Obsidian editor does this)
- **[MEDIUM]**: Resource requirements - significant refactor but clear scope
- **[MEDIUM]**: Timeline - multi-session work, can be done incrementally

## Implementation Progress

### Chronological Log
- 2025-11-02 12:51:14 Created feature template document based on user concerns and codebase analysis
- 2025-11-02 12:53:00 Verified agent mode YAML export/import is already implemented and working
- 2025-11-02 12:54:00 Added agent mode verification to plan to ensure compatibility after refactor
- 2025-11-02 12:56:00 Added objective to include agent mode indicator in AI call logs (aiDispatcher.ts)

### Files Changed
- (None yet - planning phase)

### Files Removed
- (None planned)

### Notes

#### **Current System Analysis:**

**AI Call Logging (Current):**
- Location: `src/utils/aiDispatcher.ts` - all AI requests flow through AIDispatcher
- Function: `saveAICallToFolder()` called after each AI request
- Current requestData includes:
  - `provider`: The AI provider name (openai, anthropic, etc.)
  - `model`: The model being used
  - `messages`: The conversation messages
  - `options`: Request options (temperature, streaming, etc.)
  - `timestamp`: ISO timestamp of the request
- Saved to: `ai-calls/ai-call-{timestamp}.txt` as formatted JSON
- **Missing**: No indication of whether request was from agent mode or regular chat

**Proposed Enhancement:**
```typescript
// In aiDispatcher.ts, around line 714
const requestData = {
    provider: providerName,
    model: this.plugin.settings.selectedModel || 'default',
    messages: messages,
    options: options,
    timestamp: new Date().toISOString(),
    agentMode: this.plugin.settings.agentMode?.enabled ?? false  // NEW: track agent mode
};
```

**Benefits:**
- Debugging: Easily identify which AI calls were agent-driven vs user-driven
- Analytics: Track agent mode usage patterns
- Troubleshooting: Correlate issues with agent mode behavior
- Auditing: Understand when tool use was enabled

**Message Flow (Current - Problematic):**
1. User types → `addMessage()` → creates DOM element → saves to `ChatHistoryManager`
2. ChatHistoryManager stores in `chat-history.json` (exact format TBD - need to inspect)
3. On reload: load from `chat-history.json` → render into DOM
4. Agent tools execute → create `ToolRichDisplay` → append to DOM → tool data may/may not be in history
5. Export to note → read from DOM elements → serialize
6. Load from note → parse note → create DOM elements

**Issues:**
- Multiple sources of truth: DOM, chat history file, saved notes
- Conversions: markdown ↔ HTML ↔ JSON ↔ DOM
- Tool data path unclear - sometimes in message, sometimes separate
- Source/live mode not implemented properly - both show rendered

**From 2025-11-02-agent-mode-yaml-export.md:**
- Recent fix: `activateChatViewAndLoadMessages` was redundantly parsing tool data
- Fixed to use already-parsed `toolResults` from message object
- But this reveals the confusion: should tool data be in message object, or embedded in content?
- Answer: **embedded in content as markdown JSON blocks**

#### **Proposed System:**

**Message Flow (New - Clean):**
1. User types → markdown string → save to history → render based on mode
2. Agent responds → markdown + tool JSON blocks → save to history → render based on mode
3. ChatHistoryManager stores raw markdown in `chat-history.json`
4. On reload: load markdown → parse if needed → render based on mode
5. Export to note → markdown already in history → write to file
6. Load from note → read markdown → same as loading from history

**Benefits:**
- Single source of truth: raw markdown
- Simple conversions: markdown → parse → render (one direction)
- Tool data always in markdown, no separate field needed
- Source/live mode naturally supported
- No duplication possible

#### **Tool Data Format Example:**

```markdown
I'll read that file for you.

```ai-tool-execution
{
  "toolResults": [
    {
      "command": {
        "action": "read_file",
        "parameters": { "path": "README.md" }
      },
      "result": {
        "success": true,
        "data": "# My Project\n..."
      },
      "timestamp": 1698765432000
    }
  ],
  "reasoning": "User requested file content",
  "taskStatus": "completed"
}
```

The file has been read successfully.
```

**In Source Mode:** User sees the entire markdown above, including the JSON block.

**In Live Mode:** 
- "I'll read that file for you." (rendered markdown)
- [Interactive ToolRichDisplay showing file read operation]
- "The file has been read successfully." (rendered markdown)

#### **Migration Strategy:**

```typescript
// Pseudo-code for migration
function migrateMessage(oldMessage: any): StoredMessage {
    if (typeof oldMessage.content === 'string' && !oldMessage.toolResults) {
        // Already in new format or plain message
        return oldMessage;
    }
    
    if (oldMessage.toolResults) {
        // Has separate toolResults field - embed in markdown
        const toolJson = JSON.stringify({
            toolResults: oldMessage.toolResults,
            reasoning: oldMessage.reasoning,
            taskStatus: oldMessage.taskStatus
        }, null, 2);
        
        const markdownContent = `${oldMessage.content}\n\n\`\`\`ai-tool-execution\n${toolJson}\n\`\`\`\n`;
        
        return {
            role: oldMessage.role,
            content: markdownContent,
            timestamp: oldMessage.timestamp
        };
    }
    
    return oldMessage;
}
```

#### **Implementation Priority:**

**Phase 1 - Foundation (Critical):**
1. Define new storage format
2. Implement markdown with embedded JSON parsing
3. Update `ChatHistoryManager` to use new format
4. Add migration logic for old messages

**Phase 2 - UI (Critical):**
5. Implement source mode renderer (show raw markdown)
6. Update live mode to parse and render tool blocks
7. Fix tool display insertion order
8. Add mode toggle button
9. **Add agent mode indicator to AI call logs** - update aiDispatcher.ts requestData

**Phase 3 - Integration (Important):**
10. Update note export to use markdown from history
11. Update note loading to parse markdown
12. **Verify agent mode YAML export/import still works** - ensure `agent_mode_enabled` and `agent_prompt` keys are preserved
13. **Verify agent mode logging in AI calls** - test that agentMode field appears correctly in ai-calls folder
14. Remove redundant conversion logic
15. Clean up old code paths

**Phase 4 - Polish (Nice to have):**
16. Add markdown editor with syntax highlighting
17. Optimize parsing performance
18. Add editing capabilities in source mode
19. Comprehensive testing

**Phase 5 - Verification (Critical):**
20. Test agent mode YAML export/import end-to-end
21. **Test agent mode indicator in AI call logs** - verify agentMode field is logged correctly
22. Test tool use persistence across all flows
23. Test backward compatibility with old chat history
24. Performance testing with large chat histories

## Result / Quality Gates
- Build: [PENDING] [⏳]
- Tests: [PENDING] [⏳]
- Lint: [PENDING] [⏳]
- Manual Testing: [PENDING] [⏳]

## Summary

**(To be completed after implementation)**

### Key Findings:
1. **[Root Cause]**: Multiple sources of truth (DOM, history file, message objects) causing synchronization issues
2. **[Design Flaw]**: No clear distinction between storage format and display format
3. **[Missing Feature]**: Source mode not implemented - both modes show rendered content

### Technical Analysis:
- **[Current System]**: Complex web of conversions between markdown, HTML, JSON, and DOM
- **[Proposed System]**: Simple linear flow - markdown → parse → render based on mode
- **[Tool Integration]**: Embed tool data in markdown as JSON code blocks, not separate fields

### Improvements Implemented:
- (To be filled during implementation)

### Recommendations:
1. **[Incremental Rollout]**: Implement in phases to maintain stability
2. **[Testing Focus]**: Emphasize migration testing - old data must work
3. **[Documentation]**: Update user docs to explain source/live modes
4. **[Future Work]**: Consider rich editor for live mode editing (not just source)

### Next Steps:
- [x] Create detailed plan (this document)
- [ ] Get user approval on approach
- [ ] Begin Phase 1 implementation
- [ ] Regular checkpoints with user during implementation
- [ ] Full testing before marking complete
