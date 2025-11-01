# Context Notes System - Visual Diagrams

**Date:** October 28, 2025  
**Purpose:** Visual reference for understanding the context notes system

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         USER INTERFACES                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │   Settings   │  │   Commands   │  │  Agent Tool  │          │
│  │      UI      │  │   Palette    │  │   (AI-driven)│          │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘          │
│         │                 │                  │                   │
│         └─────────────────┼──────────────────┘                   │
│                           │                                      │
└───────────────────────────┼──────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                      SETTINGS STORAGE                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  enableContextNotes: boolean                                     │
│  contextNotes: string  (e.g., "[[Note A]]\n[[Note B#Header]]")  │
│  referenceCurrentNote: boolean                                   │
│  enableObsidianLinks: boolean                                    │
│  expandLinkedNotesRecursively: boolean                           │
│  maxLinkExpansionDepth: number (1-5)                             │
│                                                                  │
└───────────────────────────┬──────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                    CONTEXT BUILDER                               │
│                 (contextBuilder.ts)                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  buildContextMessages()                                          │
│    │                                                             │
│    ├─► 1. Create system message                                 │
│    ├─► 2. Add recently opened files (optional)                  │
│    ├─► 3. Process context notes ──────┐                         │
│    └─► 4. Add current note (optional) │                         │
│                                        │                         │
└────────────────────────────────────────┼─────────────────────────┘
                                         │
                                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                    NOTE UTILITIES                                │
│                   (noteUtils.ts)                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  processContextNotes()                                           │
│    │                                                             │
│    ├─► Parse [[links]] from context notes                       │
│    ├─► For each link:                                           │
│    │     ├─► Find file in vault                                 │
│    │     ├─► Extract header content (if specified)              │
│    │     └─► Add to context string                              │
│    │                                                             │
│    └─► Return formatted context                                 │
│                                                                  │
│  processObsidianLinks()                                          │
│    │                                                             │
│    ├─► Parse [[links]] from message content                     │
│    ├─► For each link:                                           │
│    │     ├─► Check if already visited (cycle detection)         │
│    │     ├─► Find file in vault                                 │
│    │     ├─► Read file content                                  │
│    │     ├─► Extract header (if specified)                      │
│    │     ├─► Recursively process (if enabled) ──┐               │
│    │     └─► Replace link with content          │               │
│    │                                             │               │
│    └─► Return processed content ◄───────────────┘               │
│                                                                  │
└───────────────────────────┬──────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                      MESSAGE ARRAY                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  [                                                               │
│    {                                                             │
│      role: "system",                                             │
│      content: "System message + Context Notes + Recent Files"   │
│    },                                                            │
│    {                                                             │
│      role: "system",                                             │
│      content: "Current note content (if enabled)"                │
│    },                                                            │
│    {                                                             │
│      role: "user",                                               │
│      content: "User message with [[links]] expanded"             │
│    },                                                            │
│    ...                                                           │
│  ]                                                               │
│                                                                  │
└───────────────────────────┬──────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                      AI PROVIDER                                 │
│              (OpenAI, Anthropic, etc.)                           │
└─────────────────────────────────────────────────────────────────┘
```

---

## Data Flow: Context Notes Processing

```
User adds [[Note A]] to context notes
         │
         ▼
┌─────────────────────────────────────┐
│  Settings: contextNotes             │
│  "[[Note A]]\n[[Note B#Header]]"    │
└─────────────────┬───────────────────┘
                  │
                  ▼
┌─────────────────────────────────────┐
│  buildContextMessages()             │
│  - Checks enableContextNotes        │
│  - Calls processContextNotes()      │
└─────────────────┬───────────────────┘
                  │
                  ▼
┌─────────────────────────────────────┐
│  processContextNotes()              │
│  - Regex: /\[\[(.*?)\]\]/g          │
│  - Finds: "Note A", "Note B#Header" │
└─────────────────┬───────────────────┘
                  │
                  ├─► Note A
                  │   ├─► findFile("Note A")
                  │   ├─► vault.cachedRead(file)
                  │   └─► Add to context string
                  │
                  └─► Note B#Header
                      ├─► findFile("Note B")
                      ├─► vault.cachedRead(file)
                      ├─► extractContentUnderHeader("Header")
                      └─► Add to context string
                  │
                  ▼
┌─────────────────────────────────────┐
│  Context String:                    │
│  ---                                │
│  Attached: [[Note A]]               │
│                                     │
│  [Note A content]                   │
│                                     │
│  ---                                │
│  Attached: [[Note B#Header]]        │
│                                     │
│  [Header content from Note B]       │
│                                     │
└─────────────────┬───────────────────┘
                  │
                  ▼
┌─────────────────────────────────────┐
│  System Message:                    │
│  [Base system message]              │
│                                     │
│  Context Notes:                     │
│  [Context string from above]        │
└─────────────────────────────────────┘
```

---

## Data Flow: Inline Link Processing

```
User sends: "Read [[Note C]] and [[Note D#Section]]"
         │
         ▼
┌─────────────────────────────────────┐
│  Chat sends message to AI           │
│  - Calls buildContextMessages()     │
│  - Adds user message to array       │
└─────────────────┬───────────────────┘
                  │
                  ▼
┌─────────────────────────────────────┐
│  processMessages()                  │
│  - Iterates through messages        │
│  - Calls processObsidianLinks()     │
└─────────────────┬───────────────────┘
                  │
                  ▼
┌─────────────────────────────────────┐
│  processObsidianLinks()             │
│  - Regex: /\[\[(.*?)\]\]/g          │
│  - Finds: "Note C", "Note D#Section"│
│  - visitedNotes: Set()              │
│  - currentDepth: 0                  │
└─────────────────┬───────────────────┘
                  │
                  ├─► Note C
                  │   ├─► Check visitedNotes (not visited)
                  │   ├─► Add to visitedNotes
                  │   ├─► findFile("Note C")
                  │   ├─► vault.cachedRead(file)
                  │   ├─► Recursive? Check depth < max
                  │   │   └─► processObsidianLinks(content, depth+1)
                  │   └─► Replace [[Note C]] with formatted content
                  │
                  └─► Note D#Section
                      ├─► Check visitedNotes (not visited)
                      ├─► Add to visitedNotes
                      ├─► findFile("Note D")
                      ├─► vault.cachedRead(file)
                      ├─► extractContentUnderHeader("Section")
                      ├─► Recursive? Check depth < max
                      │   └─► processObsidianLinks(content, depth+1)
                      └─► Replace [[Note D#Section]] with content
                  │
                  ▼
┌─────────────────────────────────────┐
│  Processed Message:                 │
│  "Read [[Note C]]                   │
│                                     │
│  ---                                │
│  Note Name: Note C                  │
│  Content:                           │
│  [Note C content with links         │
│   expanded if recursive enabled]    │
│  ---                                │
│                                     │
│  and [[Note D#Section]]             │
│                                     │
│  ---                                │
│  Note Name: Note D#Section          │
│  Content:                           │
│  [Section content]                  │
│  ---"                               │
└─────────────────────────────────────┘
```

---

## Recursive Expansion Flow

```
User sends: "Read [[A]]"
Note A contains: "See [[B]] for details"
Note B contains: "Check [[C]] also"
Note C contains: "End of chain"

Settings:
- expandLinkedNotesRecursively: true
- maxLinkExpansionDepth: 2

┌─────────────────────────────────────┐
│  processObsidianLinks(content, 0)   │
│  Content: "Read [[A]]"              │
│  Depth: 0                           │
│  visitedNotes: {}                   │
└─────────────────┬───────────────────┘
                  │
                  ▼
┌─────────────────────────────────────┐
│  Process [[A]]                      │
│  - Not in visitedNotes              │
│  - Add "A" to visitedNotes          │
│  - Read content: "See [[B]]..."     │
│  - Depth 0 < 2, so recurse          │
└─────────────────┬───────────────────┘
                  │
                  ▼
┌─────────────────────────────────────┐
│  processObsidianLinks(A_content, 1) │
│  Content: "See [[B]] for details"   │
│  Depth: 1                           │
│  visitedNotes: {A}                  │
└─────────────────┬───────────────────┘
                  │
                  ▼
┌─────────────────────────────────────┐
│  Process [[B]]                      │
│  - Not in visitedNotes              │
│  - Add "B" to visitedNotes          │
│  - Read content: "Check [[C]]..."   │
│  - Depth 1 < 2, so recurse          │
└─────────────────┬───────────────────┘
                  │
                  ▼
┌─────────────────────────────────────┐
│  processObsidianLinks(B_content, 2) │
│  Content: "Check [[C]] also"        │
│  Depth: 2                           │
│  visitedNotes: {A, B}               │
└─────────────────┬───────────────────┘
                  │
                  ▼
┌─────────────────────────────────────┐
│  Process [[C]]                      │
│  - Not in visitedNotes              │
│  - Add "C" to visitedNotes          │
│  - Read content: "End of chain"     │
│  - Depth 2 >= 2, DON'T recurse ✋   │
└─────────────────┬───────────────────┘
                  │
                  ▼
┌─────────────────────────────────────┐
│  Final Result:                      │
│                                     │
│  "Read [[A]]                        │
│                                     │
│  ---                                │
│  Note Name: A                       │
│  Content:                           │
│  See [[B]]                          │
│                                     │
│  ---                                │
│  Note Name: B                       │
│  Content:                           │
│  Check [[C]]                        │
│                                     │
│  ---                                │
│  Note Name: C                       │
│  Content:                           │
│  End of chain                       │
│  ---                                │
│                                     │
│  for details also"                  │
└─────────────────────────────────────┘

Result: A, B, C all expanded (3 levels)
Note: Depth 2 means "2 levels deep from original"
      So we get: Original (0) → A (1) → B (2) → C (stop)
```

---

## Cycle Detection Flow

```
User sends: "Read [[A]]"
Note A contains: "See [[B]]"
Note B contains: "Back to [[A]]"

┌─────────────────────────────────────┐
│  processObsidianLinks(content, 0)   │
│  Content: "Read [[A]]"              │
│  visitedNotes: {}                   │
└─────────────────┬───────────────────┘
                  │
                  ▼
┌─────────────────────────────────────┐
│  Process [[A]]                      │
│  - Check: A in visitedNotes? NO     │
│  - Add "A" to visitedNotes          │
│  - visitedNotes: {A}                │
│  - Read content: "See [[B]]"        │
│  - Recurse with visitedNotes        │
└─────────────────┬───────────────────┘
                  │
                  ▼
┌─────────────────────────────────────┐
│  processObsidianLinks(A_content, 1) │
│  Content: "See [[B]]"               │
│  visitedNotes: {A}                  │
└─────────────────┬───────────────────┘
                  │
                  ▼
┌─────────────────────────────────────┐
│  Process [[B]]                      │
│  - Check: B in visitedNotes? NO     │
│  - Add "B" to visitedNotes          │
│  - visitedNotes: {A, B}             │
│  - Read content: "Back to [[A]]"    │
│  - Recurse with visitedNotes        │
└─────────────────┬───────────────────┘
                  │
                  ▼
┌─────────────────────────────────────┐
│  processObsidianLinks(B_content, 2) │
│  Content: "Back to [[A]]"           │
│  visitedNotes: {A, B}               │
└─────────────────┬───────────────────┘
                  │
                  ▼
┌─────────────────────────────────────┐
│  Process [[A]]                      │
│  - Check: A in visitedNotes? YES ✋ │
│  - Return: "[Recursive link         │
│             omitted: already        │
│             included]"              │
│  - DON'T read file again            │
│  - DON'T recurse                    │
└─────────────────┬───────────────────┘
                  │
                  ▼
┌─────────────────────────────────────┐
│  Final Result:                      │
│                                     │
│  "Read [[A]]                        │
│                                     │
│  ---                                │
│  Note Name: A                       │
│  Content:                           │
│  See [[B]]                          │
│                                     │
│  ---                                │
│  Note Name: B                       │
│  Content:                           │
│  Back to [[A]]                      │
│                                     │
│  [Recursive link omitted:           │
│   already included]                 │
│  ---"                               │
└─────────────────────────────────────┘

Result: Cycle detected and prevented ✅
```

---

## Command Flow

```
┌─────────────────────────────────────┐
│  User opens Command Palette         │
│  (Ctrl/Cmd + P)                     │
└─────────────────┬───────────────────┘
                  │
                  ├─► "Clear Context Notes"
                  │   └─► contextCommands.ts
                  │       └─► settings.contextNotes = ''
                  │           settings.enableContextNotes = false
                  │           saveSettings()
                  │
                  ├─► "Copy Context Notes to Clipboard"
                  │   └─► contextCommands.ts
                  │       └─► navigator.clipboard.writeText(
                  │               settings.contextNotes
                  │           )
                  │
                  └─► "Add Current Note to Context Notes"
                      └─► contextCommands.ts
                          ├─► Get active file
                          ├─► Create [[basename]] link
                          ├─► Check for duplicates
                          ├─► Append to contextNotes
                          └─► saveSettings()
```

---

## Agent Tool Flow

```
User: "Add the current note to my context"
         │
         ▼
┌─────────────────────────────────────┐
│  AI Model (Claude, GPT-4, etc.)     │
│  - Recognizes intent                │
│  - Decides to use tool              │
└─────────────────┬───────────────────┘
                  │
                  ▼
┌─────────────────────────────────────┐
│  Tool Call:                         │
│  {                                  │
│    name: "context_notes_manage",    │
│    parameters: {                    │
│      action: "add_current"          │
│    }                                │
│  }                                  │
└─────────────────┬───────────────────┘
                  │
                  ▼
┌─────────────────────────────────────┐
│  ToolRegistry.execute()             │
│  - Finds ContextNotesTool           │
│  - Calls execute(params, context)   │
└─────────────────┬───────────────────┘
                  │
                  ▼
┌─────────────────────────────────────┐
│  ContextNotesTool.execute()         │
│  - Validates action                 │
│  - Calls addCurrentNote()           │
└─────────────────┬───────────────────┘
                  │
                  ▼
┌─────────────────────────────────────┐
│  addCurrentNote()                   │
│  - Get active file                  │
│  - Create [[path]] link             │
│  - Check duplicates (unless force)  │
│  - Append to contextNotes           │
│  - Enable contextNotes              │
│  - Save settings                    │
└─────────────────┬───────────────────┘
                  │
                  ▼
┌─────────────────────────────────────┐
│  Return ToolResult:                 │
│  {                                  │
│    success: true,                   │
│    data: {                          │
│      message: "Added 'Note' to      │
│                context notes",      │
│      notePath: "folder/Note.md",    │
│      contextEnabled: true           │
│    }                                │
│  }                                  │
└─────────────────┬───────────────────┘
                  │
                  ▼
┌─────────────────────────────────────┐
│  AI Model receives result           │
│  - Formats response to user         │
│  - "I've added the current note     │
│     to your context notes"          │
└─────────────────────────────────────┘
```

---

## Settings UI Flow

```
┌─────────────────────────────────────┐
│  User opens Settings                │
│  Settings → AI Assistant            │
└─────────────────┬───────────────────┘
                  │
                  ▼
┌─────────────────────────────────────┐
│  ContentNoteHandlingSection.render()│
│  Creates collapsible sections       │
└─────────────────┬───────────────────┘
                  │
                  ├─► "Note Reference Settings"
                  │   │
                  │   ├─► Toggle: Enable Obsidian Links
                  │   │   └─► onChange: settings.enableObsidianLinks = value
                  │   │
                  │   ├─► Toggle: Enable Context Notes
                  │   │   └─► onChange: settings.enableContextNotes = value
                  │   │
                  │   ├─► TextArea: Context Notes
                  │   │   ├─► onChange: settings.contextNotes = value
                  │   │   └─► onBlur: saveSettings()
                  │   │
                  │   ├─► Toggle: Expand Linked Notes Recursively
                  │   │   └─► onChange: settings.expandLinkedNotesRecursively = value
                  │   │
                  │   └─► Slider: Max Link Expansion Depth
                  │       └─► onChange: settings.maxLinkExpansionDepth = value
                  │
                  └─► All changes saved to data.json
```

---

## Chat View Integration

```
┌─────────────────────────────────────┐
│  Chat View UI                       │
│  ┌───────────────────────────────┐  │
│  │ [📝] [🔗] [🤖] [⚙️]           │  │
│  │  │    │    │    │              │  │
│  │  │    │    │    └─► Settings   │  │
│  │  │    │    └─► Agent Mode      │  │
│  │  │    └─► Context Notes        │  │
│  │  └─► Reference Current Note    │  │
│  └───────────────────────────────┘  │
└─────────────────┬───────────────────┘
                  │
                  ├─► User clicks Context Notes button
                  │   └─► Toggle: settings.enableContextNotes
                  │       Update indicator (highlight/dim)
                  │
                  ├─► User clicks Reference Note button
                  │   └─► Toggle: settings.referenceCurrentNote
                  │       Update indicator (highlight/dim)
                  │
                  └─► User sends message
                      │
                      ▼
                  ┌─────────────────────────────────────┐
                  │  buildContextMessages()             │
                  │  - Include context notes? Check btn │
                  │  - Include current note? Check btn  │
                  │  - Build message array              │
                  └─────────────────┬───────────────────┘
                                    │
                                    ▼
                  ┌─────────────────────────────────────┐
                  │  Send to AI Provider                │
                  └─────────────────────────────────────┘
```

---

## Link Syntax Support

```
┌─────────────────────────────────────────────────────────────┐
│  Supported Link Formats                                     │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  [[Note Name]]                                               │
│  └─► Includes entire note content                           │
│                                                              │
│  [[Note Name#Header]]                                        │
│  └─► Includes only content under "Header"                   │
│                                                              │
│  [[Note Name|Alias]]                                         │
│  └─► Includes note, displays as "Alias"                     │
│                                                              │
│  [[Note Name#Header|Alias]]                                  │
│  └─► Includes header content, displays as "Alias"           │
│                                                              │
│  [[folder/subfolder/Note Name]]                              │
│  └─► Includes note from specific path                       │
│                                                              │
│  [[Note Name#Header 1#Subheader]]                            │
│  └─► NOT SUPPORTED (only one # allowed)                     │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## Error Handling Flow

```
┌─────────────────────────────────────┐
│  Process [[NonExistent]]            │
└─────────────────┬───────────────────┘
                  │
                  ▼
┌─────────────────────────────────────┐
│  findFile("NonExistent")            │
│  Returns: null                      │
└─────────────────┬───────────────────┘
                  │
                  ▼
┌─────────────────────────────────────┐
│  Check: file && isTFile(file)       │
│  Result: false                      │
└─────────────────┬───────────────────┘
                  │
                  ├─► Context Notes:
                  │   └─► Add: "Note not found: [[NonExistent]]"
                  │
                  └─► Inline Links:
                      └─► Show Notice: "File not found: NonExistent"
                          Keep original [[NonExistent]] in message
```

---

## Performance Considerations

```
┌─────────────────────────────────────────────────────────────┐
│  Performance Bottlenecks                                    │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. File Reading                                             │
│     - vault.cachedRead() for each note                       │
│     - Mitigation: Uses cached reads                          │
│     - Impact: ~10-50ms per note                              │
│                                                              │
│  2. Regex Processing                                         │
│     - /\[\[(.*?)\]\]/g for each message                      │
│     - Mitigation: Efficient regex                            │
│     - Impact: ~1-5ms per message                             │
│                                                              │
│  3. Recursive Expansion                                      │
│     - Exponential growth potential                           │
│     - Mitigation: Depth limiting, cycle detection            │
│     - Impact: ~50-200ms for deep chains                      │
│                                                              │
│  4. Header Extraction                                        │
│     - String searching for headers                           │
│     - Mitigation: Simple string operations                   │
│     - Impact: ~5-10ms per header                             │
│                                                              │
│  Total Typical Time: 100-500ms for moderate context         │
│  Total Worst Case: 1-2 seconds for very large context       │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## Token Counting Flow (Proposed)

```
┌─────────────────────────────────────┐
│  buildContextMessages()             │
│  - Build all messages               │
└─────────────────┬───────────────────┘
                  │
                  ▼
┌─────────────────────────────────────┐
│  calculateTotalTokenCount(messages) │
│  - Estimate tokens for each message │
│  - Sum total                        │
└─────────────────┬───────────────────┘
                  │
                  ▼
┌─────────────────────────────────────┐
│  Check: totalTokens > maxTokens?    │
└─────────────────┬───────────────────┘
                  │
                  ├─► NO: Return messages as-is
                  │
                  └─► YES: Truncate
                      │
                      ▼
                  ┌─────────────────────────────────────┐
                  │  truncateMessagesForContext()       │
                  │  - Keep system messages             │
                  │  - Remove oldest chat messages      │
                  │  - Recalculate tokens               │
                  │  - Repeat until under limit         │
                  └─────────────────┬───────────────────┘
                                    │
                                    ▼
                  ┌─────────────────────────────────────┐
                  │  Return truncated messages          │
                  │  Log warning if truncated           │
                  └─────────────────────────────────────┘
```

---

**Diagram Version:** 1.0  
**Last Updated:** October 28, 2025  
**Format:** ASCII diagrams for maximum compatibility
