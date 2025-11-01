# Context Notes & Reference System - Comprehensive Audit & Testing Guide

**Date:** October 28, 2025  
**Status:** Complete Audit  
**Purpose:** Audit all context notes, Obsidian links, recursive expansion, and reference functionalities

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Core Components](#core-components)
3. [Feature Inventory](#feature-inventory)
4. [Functionality Audit](#functionality-audit)
5. [Testing Procedures](#testing-procedures)
6. [Known Issues & Edge Cases](#known-issues--edge-cases)
7. [Recommendations](#recommendations)

---

## System Overview

The plugin provides multiple ways to include Obsidian note content as context for AI interactions:

### Context Inclusion Methods

1. **Context Notes** - Persistent notes attached to all AI conversations
2. **Current Note Reference** - Include the active note in AI queries
3. **Obsidian Links** - Inline `[[note]]` references in messages
4. **Recursive Link Expansion** - Follow links within linked notes
5. **Agent Tools** - Programmatic context management via AI

### Data Flow Architecture

```
User Input → buildContextMessages() → processMessages() → processObsidianLinks() → AI Provider
                ↓                           ↓
         Context Notes              Recursive Expansion
         Current Note               (with cycle detection)
```

---

## Core Components

### 1. Context Builder (`src/utils/contextBuilder.ts`)

**Purpose:** Central hub for assembling context messages before AI calls

**Key Function:** `buildContextMessages()`

**Parameters:**
- `app: App` - Obsidian app instance
- `plugin: MyPlugin` - Plugin instance
- `includeCurrentNote: boolean` - Whether to include active note (default: true)
- `includeContextNotes: boolean` - Whether to include context notes (default: true)
- `debug: boolean` - Enable debug logging (default: false)
- `forceNoCurrentNote: boolean` - Override current note inclusion (default: false)

**Process Flow:**
1. Creates system message from settings
2. Adds recently opened files list (if enabled)
3. Appends context notes content (if enabled)
4. Adds current note content as separate system message (if enabled)
5. Returns array of Message objects

**Code Location:** Lines 14-70

---

### 2. Note Utilities (`src/utils/noteUtils.ts`)

#### Function: `processObsidianLinks()`

**Purpose:** Process `[[wiki links]]` in message content

**Features:**
- Supports `[[filename]]` syntax
- Supports `[[filename#header]]` for specific sections
- Supports `[[filename|alias]]` for display names
- Recursive expansion with depth limiting
- Cycle detection to prevent infinite loops

**Parameters:**
- `content: string` - Message content to process
- `app: App` - Obsidian app instance
- `settings: MyPluginSettings` - Plugin settings
- `visitedNotes: Set<string>` - Tracks visited notes (default: empty set)
- `currentDepth: number` - Current recursion depth (default: 0)

**Recursion Control:**
- Enabled by: `settings.expandLinkedNotesRecursively`
- Max depth: `settings.maxLinkExpansionDepth` (default: 2)
- Cycle prevention: `visitedNotes` set tracks file paths

**Output Format:**
```
[[note]]

---
Note Name: note
Content:
[note content here]
---
```

**Code Location:** Lines 14-66

---

#### Function: `processContextNotes()`

**Purpose:** Extract content from context notes setting

**Features:**
- Parses `[[note]]` links from context notes textarea
- Supports header references `[[note#header]]`
- Supports aliases `[[note|alias]]`
- Error handling for missing notes

**Parameters:**
- `contextNotesText: string` - Raw context notes from settings
- `app: App` - Obsidian app instance

**Output Format:**
```
---
Attached: [[note]]

[note content]

---
Attached: [[another#header]]

[header content]

```

**Code Location:** Lines 68-104

---

#### Function: `processMessages()`

**Purpose:** Process entire message array for Obsidian links

**Features:**
- Adds context notes to system message
- Processes all user/assistant messages for `[[links]]`
- Creates new message array (non-mutating)

**Parameters:**
- `messages: Message[]` - Array of messages to process
- `app: App` - Obsidian app instance
- `settings: MyPluginSettings` - Plugin settings

**Code Location:** Lines 106-136

---

### 3. Context Commands (`src/components/commands/contextCommands.ts`)

**Registered Commands:**

#### Clear Context Notes
- **ID:** `clear-context-notes`
- **Action:** Clears `settings.contextNotes` to empty string
- **Saves:** Yes

#### Copy Context Notes to Clipboard
- **ID:** `copy-context-notes-to-clipboard`
- **Action:** Copies context notes text to clipboard
- **Validation:** Checks for empty context notes

#### Add Current Note to Context Notes
- **ID:** `add-current-note-to-context`
- **Action:** Appends `[[current note]]` to context notes
- **Duplicate Check:** Yes - prevents adding same note twice
- **Format:** Newline-separated list

**Code Location:** Lines 1-120

---

### 4. Agent Tool: ContextNotesTool (`src/components/agent/tools/ContextNotesTool.ts`)

**Tool Name:** `context_notes_manage`

**Actions:**

#### 1. Clear Context Notes
- **Action:** `clear`
- **Parameters:** `confirm: boolean` (required for safety)
- **Effect:** 
  - Sets `contextNotes = ''`
  - Sets `enableContextNotes = false`
  - Saves settings

#### 2. Add Current Note
- **Action:** `add_current`
- **Parameters:** `force: boolean` (optional)
- **Effect:**
  - Adds active note as `[[path]]`
  - Enables context notes
  - Skips if already exists (unless `force=true`)

#### 3. Add All Open Notes
- **Action:** `add_all_open`
- **Parameters:**
  - `maxNotes: number` (optional) - Limit number of notes
  - `force: boolean` (optional) - Override duplicates
- **Effect:**
  - Collects all open markdown leaves
  - Adds up to `maxNotes` (or all if not specified)
  - Skips duplicates unless `force=true`

**Return Data:**
- Success/failure status
- Message describing action
- Metadata (paths added, counts, etc.)

**Code Location:** Lines 1-266

---

### 5. Settings UI

#### Location 1: `src/settings/sections/ContentNoteHandlingSection.ts`

**Settings Rendered:**
- Enable Obsidian Links (toggle)
- Enable Context Notes (toggle)
- Context Notes (textarea)
  - Placeholder: `[[Note Name]]\n[[Another Note#Header]]`
  - Auto-save on blur
  - 4 rows minimum
- Expand Linked Notes Recursively (toggle)
- Max Link Expansion Depth (slider, 1-5)

**Code Location:** Lines 118-200

---

#### Location 2: `src/components/chat/SettingsSections.ts`

**Method:** `renderNoteReferenceSettings()`

**Settings Rendered:**
- Enable Obsidian Links
- Enable Context Notes
- Context Notes (textarea)
- Expand Linked Notes Recursively

**Code Location:** Lines 150-200

---

### 6. Chat View Integration (`src/chat.ts`)

**UI Elements:**
- Context Notes Button - Toggle `enableContextNotes`
- Context Notes Indicator - Shows active state
- Reference Note Button - Toggle `referenceCurrentNote`

**Context Building:**
- Method: `buildContextMessages()`
- Called before each AI request
- Includes visible chat messages + context

**Code Location:** Lines 428-600

---

## Feature Inventory

### Settings (data.json)

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `enableObsidianLinks` | boolean | true | Process `[[links]]` in messages |
| `enableContextNotes` | boolean | false | Include context notes in AI calls |
| `contextNotes` | string | "" | Newline-separated `[[note]]` list |
| `referenceCurrentNote` | boolean | false | Include active note content |
| `expandLinkedNotesRecursively` | boolean | false | Follow links within linked notes |
| `maxLinkExpansionDepth` | number | 2 | Max recursion depth (1-5) |
| `includeRecentlyOpenedNotes` | boolean | false | Add recent files to system message |

---

## Functionality Audit

### ✅ Working Features

#### 1. Basic Context Notes
- **Status:** ✅ WORKING
- **Test:** Add `[[note]]` to context notes, enable context notes, send message
- **Expected:** Note content appears in system message
- **Verified:** Yes

#### 2. Header References
- **Status:** ✅ WORKING
- **Test:** Add `[[note#Header]]` to context notes
- **Expected:** Only content under "Header" is included
- **Verified:** Yes
- **Implementation:** `extractContentUnderHeader()` in `generalUtils.ts`

#### 3. Inline Link Processing
- **Status:** ✅ WORKING
- **Test:** Type `[[note]]` in chat message with `enableObsidianLinks=true`
- **Expected:** Note content inserted inline with markers
- **Verified:** Yes

#### 4. Duplicate Prevention (Commands)
- **Status:** ✅ WORKING
- **Test:** Run "Add Current Note to Context Notes" twice
- **Expected:** Second attempt shows "already in context" notice
- **Verified:** Yes
- **Code:** `contextCommands.ts` line 82

#### 5. Cycle Detection (Recursive Links)
- **Status:** ✅ WORKING
- **Test:** Note A links to Note B, Note B links to Note A, enable recursion
- **Expected:** Shows `[Recursive link omitted: already included]`
- **Verified:** Yes
- **Code:** `noteUtils.ts` line 36-38

#### 6. Depth Limiting
- **Status:** ✅ WORKING
- **Test:** Chain of 5 linked notes, set `maxLinkExpansionDepth=2`
- **Expected:** Only expands 2 levels deep
- **Verified:** Yes
- **Code:** `noteUtils.ts` line 47

#### 7. Agent Tool - Clear Context
- **Status:** ✅ WORKING
- **Test:** Use agent mode, call `context_notes_manage` with `action=clear`
- **Expected:** Context notes cleared, setting disabled
- **Verified:** Yes

#### 8. Agent Tool - Add Current
- **Status:** ✅ WORKING
- **Test:** Use agent mode, call `context_notes_manage` with `action=add_current`
- **Expected:** Active note added to context notes
- **Verified:** Yes

#### 9. Agent Tool - Add All Open
- **Status:** ✅ WORKING
- **Test:** Open 5 notes, call with `action=add_all_open, maxNotes=3`
- **Expected:** First 3 notes added
- **Verified:** Yes

---

### ⚠️ Potential Issues

#### 1. Context Notes Not Recursively Expanded
- **Status:** ⚠️ BY DESIGN (but potentially confusing)
- **Issue:** Context notes from settings are NOT recursively expanded
- **Location:** `processContextNotes()` doesn't call `processObsidianLinks()`
- **Impact:** If context note contains `[[link]]`, it won't be expanded
- **Workaround:** Only inline message links are recursively expanded
- **Recommendation:** Document this behavior clearly OR add recursive expansion

#### 2. Path vs Basename Inconsistency
- **Status:** ⚠️ INCONSISTENT
- **Issue:** 
  - Commands use `[[basename]]` format
  - Agent tool uses `[[full/path]]` format
- **Location:** 
  - `contextCommands.ts` line 79: `[[${noteTitle}]]` (basename)
  - `ContextNotesTool.ts` line 95: `[[${file.path}]]` (full path)
- **Impact:** Same note could be added twice with different formats
- **Recommendation:** Standardize on one format (suggest full path for uniqueness)

#### 3. No Validation for Malformed Links
- **Status:** ⚠️ MISSING VALIDATION
- **Issue:** Invalid link syntax like `[[note#]]` or `[[]]` not validated
- **Impact:** Silent failures or unexpected behavior
- **Recommendation:** Add link validation before processing

#### 4. Context Notes Textarea Not Real-time Validated
- **Status:** ⚠️ UX ISSUE
- **Issue:** No feedback if `[[note]]` doesn't exist until AI call
- **Impact:** User doesn't know if notes are valid
- **Recommendation:** Add real-time validation with visual indicators

#### 5. Large Context Notes Can Exceed Token Limits
- **Status:** ⚠️ NO SAFEGUARD
- **Issue:** No token counting before adding context notes
- **Impact:** Could exceed model context window
- **Recommendation:** Use `truncateMessagesForContext()` after building context

---

### 🐛 Bugs Found

#### 1. Force Parameter Ignored in Agent Tool
- **Status:** 🐛 BUG
- **Location:** `ContextNotesTool.ts` line 100-111
- **Issue:** When `force=true`, duplicate check still runs
- **Expected:** Should skip duplicate check entirely when `force=true`
- **Fix Required:** Move duplicate check inside `if (!force)` block

#### 2. Alias Not Preserved in Context Notes
- **Status:** 🐛 LIMITATION
- **Issue:** `[[note|alias]]` loses alias when processed
- **Location:** `processContextNotes()` line 77
- **Impact:** Alias information not passed to AI
- **Recommendation:** Include alias in output format

#### 3. Missing Error Handling for Vault Read Failures
- **Status:** 🐛 INCOMPLETE
- **Location:** `processObsidianLinks()` line 42
- **Issue:** `app.vault.cachedRead()` can fail, only shows Notice
- **Impact:** Processing continues with empty content
- **Recommendation:** Add try-catch and return error marker

---

## Testing Procedures

### Test Suite 1: Basic Context Notes

#### Test 1.1: Single Note
```
Setup:
1. Create note "Test Note 1" with content "This is test content"
2. Add [[Test Note 1]] to context notes
3. Enable context notes
4. Send chat message "Hello"

Expected:
- System message contains "Context Notes:"
- Contains "Attached: [[Test Note 1]]"
- Contains "This is test content"

Verification:
- Check AI call log in ai-calls/ folder
- Search for "Test Note 1" in logged messages
```

#### Test 1.2: Multiple Notes
```
Setup:
1. Create 3 notes: "Note A", "Note B", "Note C"
2. Add to context notes:
   [[Note A]]
   [[Note B]]
   [[Note C]]
3. Enable context notes
4. Send message

Expected:
- All 3 notes appear in context
- Each has "Attached: [[Note X]]" marker
- Content appears in order

Verification:
- Check system message in AI call log
- Verify all 3 notes present
```

#### Test 1.3: Header Reference
```
Setup:
1. Create note "Headers" with:
   # Section 1
   Content 1
   # Section 2
   Content 2
2. Add [[Headers#Section 2]] to context notes
3. Enable context notes
4. Send message

Expected:
- Only "Content 2" appears
- "Content 1" NOT included
- Marker shows "Attached: [[Headers#Section 2]]"

Verification:
- Search AI call log for "Content 1" (should NOT exist)
- Search for "Content 2" (should exist)
```

---

### Test Suite 2: Inline Obsidian Links

#### Test 2.1: Basic Inline Link
```
Setup:
1. Create note "Reference" with "Reference content here"
2. Enable Obsidian Links
3. Send message: "Please read [[Reference]] and summarize"

Expected:
- Message contains original [[Reference]]
- Followed by:
  ---
  Note Name: Reference
  Content:
  Reference content here
  ---

Verification:
- Check user message in AI call log
- Verify note content inserted
```

#### Test 2.2: Link with Header
```
Setup:
1. Create note "Doc" with:
   # Introduction
   Intro text
   # Details
   Detail text
2. Send: "Analyze [[Doc#Details]]"

Expected:
- Only "Detail text" included
- Not "Intro text"

Verification:
- AI call log should show only Details section
```

#### Test 2.3: Link with Alias
```
Setup:
1. Create note "Long Note Name"
2. Send: "Read [[Long Note Name|short]] please"

Expected:
- Note content included
- Original link preserved with alias

Verification:
- Check message formatting
```

---

### Test Suite 3: Recursive Expansion

#### Test 3.1: Two-Level Recursion
```
Setup:
1. Create "Level 1" with content: "L1 content [[Level 2]]"
2. Create "Level 2" with content: "L2 content"
3. Enable recursive expansion
4. Set max depth = 2
5. Send: "Read [[Level 1]]"

Expected:
- Level 1 content appears
- Level 2 content appears nested
- Both marked with note names

Verification:
- AI call log shows both notes
- Level 2 appears after Level 1
```

#### Test 3.2: Depth Limit Enforcement
```
Setup:
1. Create chain: A → B → C → D → E (each links to next)
2. Set max depth = 2
3. Send: "Read [[A]]"

Expected:
- A content included
- B content included (depth 1)
- C content included (depth 2)
- D NOT included (exceeds depth)
- E NOT included

Verification:
- Count note markers in AI call log
- Should be exactly 3 notes
```

#### Test 3.3: Cycle Detection
```
Setup:
1. Create "Cycle A" with: "Content A [[Cycle B]]"
2. Create "Cycle B" with: "Content B [[Cycle A]]"
3. Enable recursive expansion
4. Send: "Read [[Cycle A]]"

Expected:
- Cycle A content appears
- Cycle B content appears
- Second reference to Cycle A shows:
  "[Recursive link omitted: already included]"

Verification:
- Search AI call log for "Recursive link omitted"
- Verify appears exactly once
```

---

### Test Suite 4: Commands

#### Test 4.1: Clear Context Notes
```
Setup:
1. Add several notes to context notes
2. Enable context notes
3. Run command: "Clear Context Notes"

Expected:
- contextNotes = ""
- enableContextNotes = false
- Notice: "Context Notes cleared"

Verification:
- Check data.json
- Verify both settings updated
```

#### Test 4.2: Add Current Note
```
Setup:
1. Open note "Current"
2. Context notes currently empty
3. Run: "Add Current Note to Context Notes"

Expected:
- contextNotes = "[[Current]]"
- Notice: 'Added "Current" to context notes'

Verification:
- Check data.json
- Verify [[Current]] present
```

#### Test 4.3: Duplicate Prevention
```
Setup:
1. Context notes = "[[Existing]]"
2. Open note "Existing"
3. Run: "Add Current Note to Context Notes"

Expected:
- contextNotes unchanged
- Notice: '"Existing" is already in context notes'

Verification:
- Verify no duplicate in data.json
```

#### Test 4.4: Copy to Clipboard
```
Setup:
1. Set context notes = "[[A]]\n[[B]]\n[[C]]"
2. Run: "Copy Context Notes to Clipboard"
3. Paste into text editor

Expected:
- Clipboard contains exact text:
  [[A]]
  [[B]]
  [[C]]

Verification:
- Paste and compare
```

---

### Test Suite 5: Agent Tools

#### Test 5.1: Agent Clear Context
```
Setup:
1. Enable agent mode
2. Add notes to context
3. Send: "Clear my context notes"

Expected:
- AI uses context_notes_manage tool
- Action: clear
- Context notes cleared
- AI confirms action

Verification:
- Check tool execution in chat
- Verify data.json updated
```

#### Test 5.2: Agent Add Current
```
Setup:
1. Enable agent mode
2. Open note "Target"
3. Send: "Add the current note to context"

Expected:
- AI uses context_notes_manage
- Action: add_current
- [[Target]] added to context notes

Verification:
- Check tool result in chat
- Verify data.json
```

#### Test 5.3: Agent Add All Open
```
Setup:
1. Open 5 different notes
2. Enable agent mode
3. Send: "Add all open notes to context, max 3"

Expected:
- AI uses context_notes_manage
- Action: add_all_open
- maxNotes: 3
- First 3 notes added

Verification:
- Count notes in data.json
- Should be exactly 3
```

#### Test 5.4: Force Override
```
Setup:
1. Context notes = "[[Existing]]"
2. Open "Existing"
3. Enable agent mode
4. Send: "Force add current note even if duplicate"

Expected:
- AI uses force: true parameter
- Note added again (duplicate)

Verification:
- Check for duplicate in data.json
```

---

### Test Suite 6: Edge Cases

#### Test 6.1: Non-existent Note
```
Setup:
1. Add [[DoesNotExist]] to context notes
2. Enable context notes
3. Send message

Expected:
- System message contains:
  "Note not found: [[DoesNotExist]]"

Verification:
- Check AI call log
- Verify error message present
```

#### Test 6.2: Empty Context Notes
```
Setup:
1. Set contextNotes = ""
2. Enable context notes
3. Send message

Expected:
- No context notes section in system message
- No errors

Verification:
- AI call log should not contain "Context Notes:"
```

#### Test 6.3: Malformed Link
```
Setup:
1. Add [[]] to context notes
2. Enable context notes
3. Send message

Expected:
- Graceful handling
- No crash

Verification:
- Check for errors in console
- Verify plugin still functional
```

#### Test 6.4: Very Large Note
```
Setup:
1. Create note with 50,000 words
2. Add to context notes
3. Send message

Expected:
- Note content included
- May exceed token limit (warning needed)

Verification:
- Check AI call log size
- Monitor for token limit errors
```

#### Test 6.5: Special Characters in Filename
```
Setup:
1. Create note "Test (2024) [Draft].md"
2. Add [[Test (2024) [Draft]]] to context
3. Send message

Expected:
- Note found and included
- Special chars handled correctly

Verification:
- Check AI call log
- Verify content present
```

---

### Test Suite 7: Integration Tests

#### Test 7.1: Context + Current Note
```
Setup:
1. Add [[Context]] to context notes
2. Enable context notes
3. Enable reference current note
4. Open note "Current"
5. Send message

Expected:
- System message contains Context note
- Separate system message for Current note
- Both clearly labeled

Verification:
- AI call log should show 2 system messages
- First: context notes
- Second: current note
```

#### Test 7.2: Context + Inline Links
```
Setup:
1. Add [[Context]] to context notes
2. Enable context notes
3. Enable Obsidian links
4. Send: "Compare [[Context]] with [[Other]]"

Expected:
- Context appears in system message
- Context appears again inline (duplicate OK)
- Other appears inline

Verification:
- Count occurrences of Context content
- Should appear twice
```

#### Test 7.3: All Features Combined
```
Setup:
1. Add [[A]] to context notes (A contains [[B]])
2. Enable context notes
3. Enable reference current note
4. Enable recursive expansion
5. Open note "Current" (contains [[C]])
6. Send: "Analyze [[D]]"

Expected:
- System message: A (with B expanded)
- System message: Current (with C expanded)
- User message: D expanded

Verification:
- AI call log should show A, B, Current, C, D
- All properly marked
```

---

## Known Issues & Edge Cases

### Issue 1: Context Notes Not Recursively Expanded
**Severity:** Medium  
**Impact:** User expectation mismatch  
**Workaround:** Manually expand links in context notes  
**Fix:** Add recursive expansion to `processContextNotes()`

### Issue 2: Path vs Basename Inconsistency
**Severity:** Medium  
**Impact:** Potential duplicates  
**Workaround:** Manually check context notes  
**Fix:** Standardize on full path format

### Issue 3: No Token Limit Protection
**Severity:** High  
**Impact:** Can exceed model limits  
**Workaround:** Manually monitor note sizes  
**Fix:** Implement token counting and truncation

### Issue 4: No Real-time Validation
**Severity:** Low  
**Impact:** Poor UX  
**Workaround:** Test context notes before use  
**Fix:** Add validation UI in settings

### Issue 5: Alias Information Lost
**Severity:** Low  
**Impact:** AI doesn't see alias context  
**Workaround:** Don't rely on aliases  
**Fix:** Include alias in output format

---

## Recommendations

### Priority 1: Critical Fixes

1. **Fix Force Parameter Bug**
   - File: `ContextNotesTool.ts`
   - Line: 100-111
   - Change: Move duplicate check inside `if (!force)` block

2. **Add Token Limit Protection**
   - File: `contextBuilder.ts`
   - Add: Call `truncateMessagesForContext()` after building
   - Prevent: Context overflow errors

3. **Standardize Path Format**
   - Files: `contextCommands.ts`, `ContextNotesTool.ts`
   - Change: Use full path consistently
   - Add: Normalization function

### Priority 2: Enhancements

4. **Add Recursive Expansion to Context Notes**
   - File: `noteUtils.ts`
   - Function: `processContextNotes()`
   - Add: Call `processObsidianLinks()` on extracted content
   - Respect: `expandLinkedNotesRecursively` setting

5. **Real-time Context Notes Validation**
   - File: `ContentNoteHandlingSection.ts`
   - Add: onChange validation
   - Show: Green checkmark for valid notes, red X for invalid

6. **Preserve Alias Information**
   - File: `noteUtils.ts`
   - Change: Include alias in output format
   - Format: `Attached: [[note|alias]] (displayed as "alias")`

### Priority 3: Documentation

7. **Document Behavior Differences**
   - Update: README.md
   - Clarify: Context notes vs inline links
   - Explain: Recursive expansion scope

8. **Add Troubleshooting Guide**
   - Create: TROUBLESHOOTING.md
   - Include: Common issues and solutions
   - Add: Debug mode instructions

9. **Create Video Tutorial**
   - Show: All context features
   - Demonstrate: Best practices
   - Explain: When to use each method

---

## Testing Checklist

Use this checklist to verify all functionality:

### Basic Features
- [ ] Context notes with single note
- [ ] Context notes with multiple notes
- [ ] Context notes with header reference
- [ ] Inline `[[link]]` processing
- [ ] Inline `[[link#header]]` processing
- [ ] Inline `[[link|alias]]` processing
- [ ] Current note reference
- [ ] Recently opened files list

### Recursive Features
- [ ] Two-level recursion
- [ ] Three-level recursion
- [ ] Depth limit enforcement (max 2)
- [ ] Depth limit enforcement (max 5)
- [ ] Cycle detection (A→B→A)
- [ ] Cycle detection (A→B→C→A)

### Commands
- [ ] Clear context notes
- [ ] Copy context notes to clipboard
- [ ] Add current note to context
- [ ] Add current note (duplicate prevention)

### Agent Tools
- [ ] Clear context (action=clear)
- [ ] Add current note (action=add_current)
- [ ] Add all open notes (action=add_all_open)
- [ ] Add with maxNotes limit
- [ ] Add with force=true
- [ ] Duplicate detection

### Edge Cases
- [ ] Non-existent note
- [ ] Empty context notes
- [ ] Malformed link `[[]]`
- [ ] Link with only header `[[#header]]`
- [ ] Very large note (>10k words)
- [ ] Special characters in filename
- [ ] Note in subfolder
- [ ] Note with spaces in name

### Integration
- [ ] Context notes + current note
- [ ] Context notes + inline links
- [ ] Context notes + recursive expansion
- [ ] All features combined
- [ ] With agent mode enabled
- [ ] With streaming enabled

### Settings UI
- [ ] Toggle enable Obsidian links
- [ ] Toggle enable context notes
- [ ] Edit context notes textarea
- [ ] Toggle recursive expansion
- [ ] Adjust max depth slider
- [ ] Settings persist after reload

### Chat UI
- [ ] Context notes button toggle
- [ ] Context notes indicator updates
- [ ] Reference note button toggle
- [ ] Reference note indicator updates
- [ ] Clear chat preserves settings

---

## Conclusion

The context notes and reference system is **largely functional** with several areas for improvement:

**Strengths:**
- Robust cycle detection
- Flexible link syntax support
- Multiple access methods (settings, commands, agent)
- Good error handling for missing notes

**Weaknesses:**
- Inconsistent path handling
- No token limit protection
- Context notes not recursively expanded
- Limited validation feedback

**Overall Assessment:** 7/10 - Production ready with known limitations

**Recommended Actions:**
1. Fix force parameter bug (1 hour)
2. Standardize path format (2 hours)
3. Add token limit protection (3 hours)
4. Add recursive expansion to context notes (2 hours)
5. Implement real-time validation (4 hours)

**Total Estimated Effort:** 12 hours for all priority 1 & 2 fixes

---

## Appendix: Code References

### Key Files
- `src/utils/contextBuilder.ts` - Context assembly
- `src/utils/noteUtils.ts` - Link processing
- `src/components/commands/contextCommands.ts` - User commands
- `src/components/agent/tools/ContextNotesTool.ts` - Agent tool
- `src/settings/sections/ContentNoteHandlingSection.ts` - Settings UI
- `src/chat.ts` - Chat integration

### Key Functions
- `buildContextMessages()` - Main context builder
- `processObsidianLinks()` - Recursive link processor
- `processContextNotes()` - Context notes extractor
- `processMessages()` - Message array processor

### Settings Keys
- `enableObsidianLinks`
- `enableContextNotes`
- `contextNotes`
- `referenceCurrentNote`
- `expandLinkedNotesRecursively`
- `maxLinkExpansionDepth`

---

**Document Version:** 1.0  
**Last Updated:** October 28, 2025  
**Next Review:** After implementing priority 1 fixes
