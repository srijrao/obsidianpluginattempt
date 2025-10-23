# Troubleshooting Guide — Context Notes & Chat UI

This guide helps diagnose and fix issues in the Context Notes & Chat UI implementation. It consolidates known failure modes across rendering, streaming, agent/tooling, context construction, and settings. Use the quick checks and deeper dives below to resolve problems fast.

## Quick triage checklist

- Build and tests
  - npm run build: PASS | FAIL
  - npm test: PASS | FAIL
- UI sanity
  - Render mode toggle changes message display (live/source)
  - Stop button appears/disappears correctly during streaming
  - Regeneration works and replaces the right assistant message
- Context health
  - System message assembled with settings + recent files (if enabled)
  - Context truncation keeps within model window without losing latest user turn
- Agent/tools
  - context_notes_manage tool actions work (clear/add_current/add_all_open)
  - Agent mode off by default; tools only run when enabled

---

## Common issues by area

### 1) Render mode toggle (Live vs Source)
Symptoms
- Toggle button does nothing, or only the icon changes
- Messages don’t re-render or raw content shows as formatted (or vice versa)

Likely causes
- `applyRenderModeToElement()` or `reRenderAllMessages()` not invoked after toggle
- Missing `data-raw-content` on message elements
- UI state not reading/writing `uiBehavior.chatRenderMode`

Fixes
- Ensure every new/updated message sets `messageEl.dataset.rawContent`
- After toggle, call `reRenderAllMessages()`; in source mode, replace inner HTML with a <pre> and `textContent`
- Persist and load `uiBehavior.chatRenderMode` in settings
- After saving edits, emit `app.workspace.trigger('ai-assistant:message-edited', messageEl)` and, in ChatView, listen with `workspace.on('ai-assistant:message-edited', el => applyRenderModeToElement(el))` to re-apply the current mode

Relevant code
- `src/chat.ts`: `applyRenderModeToElement`, `reRenderAllMessages`
- `src/components/chat/eventHandlers.ts`: triggers `ai-assistant:message-edited` after edit save
- `styles.css`: `.message-content`, `<pre>` block styling

---

### 2) Streaming integration (StreamCoordinator)
Symptoms
- Stop button doesn’t work or UI state desyncs
- “StreamCoordinator not initialized” errors
- Double-streams or race conditions

Likely causes
- StreamCoordinator not created yet when sending
- Not registering UI state callbacks or not cleaning up
- Fallback to legacy ResponseStreamer missing/incorrect

Fixes
- Call `initializeStreamCoordinatorIfReady()` before streaming
- Use `streamCoordinator.startStream()` with `uiContainer` and `onChunk` to keep DOM updated
- Handle fallback if StreamCoordinator throws; ensure `responseStreamer` exists before fallback
- Keep `centralStreamState` in sync to drive stop/send button visibility

Relevant code
- `src/chat.ts`: `streamAssistantResponse`, `streamCoordinatorResponse`, `initializeStreamCoordinatorIfReady`, stop button UI sync
- `src/services/chat/StreamCoordinator.ts`
- Tests: `tests/integration/stopButton.test.ts`, `tests/streamCoordinator.test.ts`

---

### 3) Regeneration flow
Symptoms
- Regenerated response not inserted correctly
- Wrong message replaced, or UI buttons don’t reset

Likely causes
- Incorrect target index calculation for assistant message
- Not caching original timestamp/content prior to removal
- Missing UI state reset in finally block

Fixes
- Use existing index logic: if user clicked, find next assistant; if assistant clicked, target self
- Capture `originalTimestamp` and `originalContent` before removing
- Always re-enable textarea and toggle send/stop buttons in finally
- Invalidate ChatView message cache after regeneration

Relevant code
- `src/components/chat/MessageRegenerator.ts`
- `src/chat.ts`: UI state methods, message cache invalidation

---

### 4) Context building and truncation
Symptoms
- Context is missing system or note content
- Recently opened files aren’t included
- Over-long prompts cause provider errors

Likely causes
- Not routing through `buildContextMessages()`
- `includeRecentlyOpenedNotes` not set or `getRecentlyOpenedFiles` errors
- Truncation not applied to the final message set

Fixes
- Always call `buildContextMessages(app, plugin, ...)` and then append visible chat messages
- Ensure `includeRecentlyOpenedNotes` exists in settings/mocks
- Apply `truncateMessagesForContext(messages, maxTokens)` using current model’s context limit

Relevant code
- `src/utils/contextBuilder.ts`: `buildContextMessages`, `truncateMessagesForContext`
- `src/chat.ts`: `prepareMessagesForSend`, `getCurrentModelContextLimit`
- Settings type: `src/types/settings.ts`

---

### 5) Agent mode and tools
Symptoms
- Agent tools execute when not expected
- context_notes_manage doesn’t act or errors on paths

Likely causes
- Agent mode enabled unintentionally
- Tool registry missing tool or incorrect action parameter
- Path validation failures (security checks)

Fixes
- Verify `agentModeManager.isAgentModeEnabled()` gating before tool execution
- Use the unified tool: `action` in {`clear`, `add_current`, `add_all_open`} with optional `maxNotes`, `force`
- Validate paths before file operations (`validatePath`, note-only operations)

Relevant code
- `src/components/agent/tools/ContextNotesTool.ts`
- `src/components/agent/tools/toolcollect.ts`, `ToolRegistry`
- `src/promptConstants.ts` for agent prompt wiring
- `src/utils/pathValidation.ts`

---

### 6) Settings & schema drift
Symptoms
- TypeScript errors in tests or missing settings at runtime
- UI controls not reflecting state

Likely causes
- New fields (e.g., `includeRecentlyOpenedNotes`, `uiBehavior.chatRenderMode`) missing from settings or mocks
- Old tests not updated with new interfaces (ChatView/Agent changes)

Fixes
- Update `MyPluginSettings` instances and tests with new fields and defaults
- Adjust mocks to satisfy expanded interfaces (e.g., ChatView methods)

Relevant code
- `src/types/settings.ts`
- Tests updated under `tests/*.test.ts`

---

### 7) Performance hiccups
Symptoms
- Lag on toggle or large histories

Likely causes
- Re-rendering all messages on every change without batching
- Missing object pooling for message lists

Fixes
- Use `DOMBatcher` (when available) or minimal DOM writes
- Use `MessageContextPool` and `PreAllocatedArrays` for temporary allocations
- Prefer incremental updates; only re-render visible/impacted messages

Relevant code
- `src/utils/objectPool.ts`
- `src/utils/contextBuilder.ts`
- `src/chat.ts` batching patterns

---

## Logs and diagnostics
- Prefer `debugLog(settings.debugMode, level, message, data)` over console.log
- Useful tags: `[ChatView]`, `[StreamCoordinator]`, `[contextBuilder]`, `[MessageRegenerator]`
- Persisted AI call logs: `ai-calls/`

---

## Issue intake template
Use this template when reporting new issues:

- Summary: one sentence
- Area: UI toggle | streaming | regeneration | context | agent/tools | settings | performance | other
- Steps to reproduce:
  1. …
  2. …
  3. …
- Expected vs actual:
- Screenshots / console output:
- Versions: plugin, Obsidian, OS
- Relevant files/lines: (link or note)

---

## File reference map
- Entry/UI: `src/chat.ts`
- Streaming core: `src/services/chat/StreamCoordinator.ts`
- Context building: `src/utils/contextBuilder.ts`
- Agent/tools: `src/components/agent/tools/ContextNotesTool.ts`, `src/components/agent/tools/toolcollect.ts`
- Providers/registry: `providers/registry.ts`
- Settings UI sections: `src/settings/sections/*`
- Types: `src/types/`

---

## Appendix: Known good behaviors
- Toggling render mode updates all visible messages and future renders follow the selected mode
- Stop button mirrors StreamCoordinator state reliably
- Regeneration uses ChatView streaming and updates history + UI consistently
- Truncation honors the current model context limit and preserves newest chat turns
- Agent tools only execute when agent mode is enabled and use the unified `context_notes_manage` actions
