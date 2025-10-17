# Agent Mode and Duplicate Messages Fix

**Date:** 2025-10-17  
**Branch:** aug2-baseline  
**Issue:** Duplicate system messages in AI calls and missing agent mode support in StreamCoordinator

## Problems Identified

### 1. Duplicate System Messages

**Symptom:** Every AI call had duplicate system messages - the persona/formatting message appeared twice, and the current note content appeared twice.

**Root Cause:** 
- In `chat.ts` (line 538): `buildContextMessages()` was called to create system messages
- Messages were then passed to `streamAssistantResponse()` → `StreamCoordinator.startStream()`
- In `StreamCoordinator.ts` (line 197): `buildContextMessages()` was called **AGAIN**
- Line 198 merged: `const allMessages = [...contextMessages, ...messages];`
- This doubled all the context messages in every AI request

**Example from AI call log:**
```json
{
  "messages": [
    { "role": "system", "content": "# Persona..." },  // First copy
    { "role": "system", "content": "Here is the content..." },
    { "role": "system", "content": "# Persona..." },  // Duplicate!
    { "role": "system", "content": "Here is the content..." }, // Duplicate!
    { "role": "user", "content": "Great, time here in houston?" }
  ]
}
```

### 2. Missing Agent Mode Support - System Prompt

**Symptom:** When agent mode was enabled, no agent system prompt with tool descriptions was added to the AI request, so the AI had no idea it could use tools.

**Root Cause:**
- Agent system prompt was only added in `ResponseStreamer.addAgentSystemPrompt()` (line 78 in ResponseStreamer.ts)
- When `StreamCoordinator` was used (the preferred/new streaming system), it never called this method
- The StreamCoordinator path completely bypassed agent mode support

**Expected behavior:**
When agent mode is ON, the first system message should be:
```
- AI assistant for Obsidian Vault with vault management tools.
- ALWAYS use 'thought' tool first to plan, then at end to summarize.
- Use relative paths from vault root.

Available tools:
1. thought - Record AI reasoning and suggest next tool...
2. create_note - Creates a new note in the vault...
3. read_note - Reads the content of an existing note...
[etc.]
```

### 3. Missing Agent Mode Support - Tool Execution

**Symptom:** AI responded with tool commands in JSON format, but the tools were never executed. The file wasn't created, the response just showed the raw JSON command.

**Root Cause:**
- After streaming completed in StreamCoordinator, the response was returned directly
- No call to `AgentResponseHandler.processResponseWithUI()` to parse and execute tool commands
- In ResponseStreamer, this processing happened on lines 92-94 after streaming
- StreamCoordinator skipped this critical step entirely

**Example:**
AI response: `{"action": "file_write", "parameters": {...}}`  
Expected: File should be created  
Actual: JSON command displayed to user, no action taken

## Solutions Implemented

### Fix 1: Remove Duplicate Context Building

**File:** `src/services/chat/StreamCoordinator.ts` (lines 187-200)

**Before:**
```typescript
// Build context messages
const contextMessages = await this.buildContextMessages();
const allMessages = [...contextMessages, ...messages];
```

**After:**
```typescript
// FIX: Don't build context messages here - they're already built by ChatView
// and passed in via the messages parameter to avoid duplication
// Add agent system prompt if agent mode is enabled
await this.addAgentSystemPrompt(messages);

const allMessages = messages;
```

**Reasoning:**
- Context messages are already built in `chat.ts` before calling `streamAssistantResponse()`
- StreamCoordinator should use the messages it receives, not rebuild them
- This eliminates the duplication

### Fix 2: Add Agent Mode Support to StreamCoordinator

**File:** `src/services/chat/StreamCoordinator.ts` (new method added after line 510)

**New method:**
```typescript
/**
 * Adds agent system prompt to messages if agent mode is enabled.
 * Prepends the agent prompt to the existing system message or adds a new one.
 * @param messages The message array to modify (modified in place)
 */
private async addAgentSystemPrompt(messages: Message[]): Promise<void> {
    this.plugin.debugLog('debug', '[StreamCoordinator] addAgentSystemPrompt called', { 
        messageCount: messages.length,
        agentModeEnabled: this.plugin.agentModeManager.isAgentModeEnabled()
    });
    
    if (!this.plugin.agentModeManager.isAgentModeEnabled()) {
        return;
    }

    // Dynamically import the agent prompt builder
    const { buildAgentSystemPrompt } = await import('../../promptConstants');

    // Build the agent-specific system prompt
    const agentPrompt = buildAgentSystemPrompt(
        this.plugin.settings.enabledTools, 
        this.plugin.settings.customAgentSystemMessage
    );

    this.plugin.debugLog('info', '[StreamCoordinator] Agent mode enabled - adding system prompt', {
        agentPromptLength: agentPrompt.length,
        enabledTools: Object.keys(this.plugin.settings.enabledTools || {}).filter(k => this.plugin.settings.enabledTools![k] !== false)
    });

    // Find the existing system message
    const systemMessageIndex = messages.findIndex(msg => msg.role === 'system');
    if (systemMessageIndex !== -1) {
        // Prepend agent prompt to the existing system message
        const originalContent = messages[systemMessageIndex].content;
        messages[systemMessageIndex].content = agentPrompt + '\n\n' + originalContent;
        this.plugin.debugLog('debug', '[StreamCoordinator] Agent prompt prepended to existing system message');
    } else {
        // Add agent prompt as the first system message
        messages.unshift({
            role: 'system',
            content: agentPrompt
        });
        this.plugin.debugLog('debug', '[StreamCoordinator] Agent prompt added as new system message');
    }
}
```

**Reasoning:**
- This matches the functionality in `ResponseStreamer.addAgentSystemPrompt()`
- Checks if agent mode is enabled via `plugin.agentModeManager.isAgentModeEnabled()`
- Builds the agent system prompt with tool descriptions
- Prepends it to the existing system message (or adds as first message if none exists)
- Includes comprehensive debug logging to track agent mode activation

### Fix 3: Process Agent Response After Streaming

**File:** `src/chat.ts` (in `streamCoordinatorResponse` method)

**Added after streaming completes:**
```typescript
// FIX: Process agent response if agent mode is enabled (execute tools)
if (this.plugin.agentModeManager.isAgentModeEnabled() && this.agentResponseHandler) {
    this.plugin.debugLog('info', '[ChatView] Agent mode enabled - processing response for tools', {
        responseLength: responseContent.length,
        responsePreview: responseContent.substring(0, 200)
    });
    
    try {
        const chatHistory = await this.chatHistoryManager.getHistory();
        const agentResult = await this.agentResponseHandler.processResponseWithUI(
            responseContent, 
            'streamCoordinator', 
            chatHistory
        );
        
        // Store enhanced message data in container for later use
        if (agentResult.toolResults && agentResult.toolResults.length > 0) {
            const messageData = {
                toolResults: agentResult.toolResults,
                reasoning: agentResult.reasoning,
                taskStatus: agentResult.taskStatus
            };
            container.dataset.messageData = JSON.stringify(messageData);
        }
        
        // Update response content with processed text
        responseContent = agentResult.processedText;
        
        // Update UI with final processed content
        const messageDiv = container.querySelector('.message-content');
        if (messageDiv) {
            messageDiv.textContent = responseContent;
            container.dataset.rawContent = responseContent;
        }
    } catch (error) {
        this.plugin.debugLog('error', '[ChatView] Failed to process agent response:', error);
        // Continue with unprocessed response on error
    }
}
```

**Reasoning:**
- After streaming completes, the full response needs to be parsed for tool commands
- AgentResponseHandler.processResponseWithUI() extracts and executes tool commands
- Tool results are stored in the container's dataset for display
- This matches the behavior in ResponseStreamer (lines 92-94)
- Ensures tools are actually executed, not just recognized

### Fix 4: Exclude ui-example from TypeScript Compilation

**File:** `tsconfig.json`

**Change:**
```json
"exclude": ["node_modules", "ui-example", "docs/ui-example"]
```

**Reasoning:**
- The `ui-example` and `docs/ui-example` folders had import errors and weren't part of the main plugin
- Excluding them allows the build to succeed without affecting functionality

## Testing Instructions

### Test 1: Verify No Duplicate Messages

1. Enable debug mode in plugin settings
2. Open AI Chat view
3. Send a message
4. Check `ai-calls/` folder for the latest AI call log
5. **Expected:** System messages should appear only ONCE
6. **Count:** Should see 1-2 system messages (base system + current note), not 4

### Test 2: Verify Agent Mode Works

1. Enable debug mode in plugin settings
2. Open AI Chat view
3. Click the 🤖 button to enable agent mode
4. Notice should say "Agent Mode enabled - AI can now use tools"
5. Send a message like: "Create a note called test.md with content 'Hello World'"
6. Check `ai-calls/` folder for the latest AI call log
7. **Expected:** First system message should contain:
   - "AI assistant for Obsidian Vault with vault management tools"
   - "Available tools:"
   - List of tools like "thought", "create_note", "read_note", etc.
8. **Expected:** AI should respond by creating the note (using tools)

### Test 3: Verify Agent Mode Toggle

1. With agent mode ON, send a message that requires tools
2. **Expected:** Tools should be executed
3. Toggle agent mode OFF (click 🤖 again)
4. Send the same message
5. **Expected:** AI responds conversationally without executing tools

## Impact

### Before Fix
- ❌ Every AI call had 2x system messages (wasted tokens, confused context)
- ❌ Agent mode button did nothing (tools never executed)
- ❌ StreamCoordinator couldn't support agent mode

### After Fix
- ✅ System messages appear exactly once per request
- ✅ Agent mode enables tool execution when toggled ON
- ✅ StreamCoordinator fully supports agent mode
- ✅ Consistent behavior between ResponseStreamer and StreamCoordinator

## Related Files Modified

1. `src/services/chat/StreamCoordinator.ts`
   - Removed duplicate `buildContextMessages()` call
   - Added `addAgentSystemPrompt()` method
   - Integrated agent mode support into stream pipeline

2. `tsconfig.json`
   - Excluded `ui-example` folder from compilation

## Notes

- The fix maintains backward compatibility with both streaming systems
- Debug logging has been added to track agent mode activation
- The solution follows the same pattern as ResponseStreamer for consistency
- No changes needed to the agent mode toggle button or AgentModeManager

## Future Considerations

- Eventually, deprecate ResponseStreamer entirely once StreamCoordinator is fully stable
- Consider refactoring agent mode support into a shared service
- May want to add visual indicator in UI showing when agent system prompt is active
