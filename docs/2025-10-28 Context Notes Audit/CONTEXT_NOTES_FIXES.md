# Context Notes System - Bug Fixes & Improvements

**Date:** October 28, 2025  
**Status:** Proposed Fixes  
**Related:** CONTEXT_NOTES_AUDIT.md

---

## Critical Bugs

### Bug 1: Force Parameter Not Working in Agent Tool

**File:** `src/components/agent/tools/ContextNotesTool.ts`  
**Lines:** 100-111  
**Severity:** Medium  
**Impact:** `force=true` parameter doesn't skip duplicate check

**Current Code:**
```typescript
private async addCurrentNote(app: App, plugin: MyPlugin, force?: boolean): Promise<ToolResult> {
    const file = app.workspace.getActiveFile();
    if (!file) {
        return { success: false, error: 'No active note found to add to context' };
    }

    const link = `[[${file.path}]]`;
    const existing = plugin.settings.contextNotes || '';

    if (!force) {
        const alreadyExists = new RegExp(`\\[\\[${this.escapeRegExp(file.path)}\\]\\]`).test(existing);
        if (alreadyExists) {
            return {
                success: true,
                data: {
                    message: `Note "${file.basename}" is already in context`,
                    notePath: file.path,
                    alreadyExists: true,
                    contextEnabled: plugin.settings.enableContextNotes
                }
            };
        }
    }

    const updated = existing ? `${existing}\n${link}` : link;
    // ... rest of function
}
```

**Problem:** The duplicate check runs even when `force=true`, it just returns a different result. The note is never actually added when it already exists.

**Fix:**
```typescript
private async addCurrentNote(app: App, plugin: MyPlugin, force?: boolean): Promise<ToolResult> {
    const file = app.workspace.getActiveFile();
    if (!file) {
        return { success: false, error: 'No active note found to add to context' };
    }

    const link = `[[${file.path}]]`;
    const existing = plugin.settings.contextNotes || '';

    // Check for duplicates only if force is not true
    if (!force) {
        const alreadyExists = new RegExp(`\\[\\[${this.escapeRegExp(file.path)}\\]\\]`).test(existing);
        if (alreadyExists) {
            return {
                success: true,
                data: {
                    message: `Note "${file.basename}" is already in context`,
                    notePath: file.path,
                    alreadyExists: true,
                    contextEnabled: plugin.settings.enableContextNotes
                }
            };
        }
    }

    // Always add when force=true, or when not duplicate
    const updated = existing ? `${existing}\n${link}` : link;
    plugin.settings.contextNotes = updated;
    plugin.settings.enableContextNotes = true;
    await plugin.saveSettings();

    this.log(plugin, 'info', '[ContextNotesTool] Added current note to context', {
        notePath: file.path,
        noteBasename: file.basename,
        forced: force || false
    });

    return {
        success: true,
        data: {
            message: force 
                ? `Force-added "${file.basename}" to context notes`
                : `Added "${file.basename}" to context notes`,
            notePath: file.path,
            noteBasename: file.basename,
            contextEnabled: true,
            forced: force || false,
            totalContextNotes: updated.split('\n').filter(Boolean).length
        }
    };
}
```

**Testing:**
1. Add note to context
2. Use agent: "Force add current note even if duplicate"
3. Verify note appears twice in context notes

---

### Bug 2: Path vs Basename Inconsistency

**Files:** 
- `src/components/commands/contextCommands.ts` (line 79)
- `src/components/agent/tools/ContextNotesTool.ts` (line 95)

**Severity:** Medium  
**Impact:** Same note can be added twice with different formats

**Current Behavior:**
- Command uses: `[[basename]]`
- Agent tool uses: `[[full/path]]`

**Example Problem:**
```
Context notes could contain:
[[My Note]]          (from command)
[[folder/My Note]]   (from agent tool)
```

**Fix Option 1: Standardize on Full Path (Recommended)**

**File:** `src/components/commands/contextCommands.ts`

**Current Code (line 75-79):**
```typescript
const noteTitle = activeFile.basename;
const wikiLink = `[[${noteTitle}]]`;

// Check if the note is already in context notes to avoid duplicates
if (settings.contextNotes && settings.contextNotes.includes(wikiLink)) {
```

**Fixed Code:**
```typescript
// Use full path for consistency with agent tools
const notePath = activeFile.path;
const wikiLink = `[[${notePath}]]`;

// Check if the note is already in context notes to avoid duplicates
// Use regex for more robust checking
const escapedPath = notePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const linkPattern = new RegExp(`\\[\\[${escapedPath}\\]\\]`);
if (settings.contextNotes && linkPattern.test(settings.contextNotes)) {
    showNotice(`"${activeFile.basename}" is already in context notes`);
    return;
}
```

**Fix Option 2: Normalize Before Comparison**

Create utility function:

**File:** `src/utils/noteUtils.ts`

**Add:**
```typescript
/**
 * Normalize a wiki link to use full path
 * Converts [[basename]] to [[full/path]] if file exists
 */
export function normalizeWikiLink(link: string, app: App): string {
    const match = link.match(/\[\[(.*?)\]\]/);
    if (!match) return link;
    
    const linkText = match[1];
    const [fileAndHeader] = linkText.split('|');
    const [fileName] = fileAndHeader.split('#');
    
    const file = findFile(app, fileName.trim());
    if (file && isTFile(file)) {
        // Replace basename with full path
        return link.replace(fileName, file.path);
    }
    
    return link;
}

/**
 * Normalize all wiki links in context notes
 */
export function normalizeContextNotes(contextNotes: string, app: App): string {
    const linkRegex = /\[\[(.*?)\]\]/g;
    return contextNotes.replace(linkRegex, (match) => {
        return normalizeWikiLink(match, app);
    });
}
```

**Usage in commands:**
```typescript
// Before checking for duplicates
const normalizedContext = normalizeContextNotes(settings.contextNotes, plugin.app);
const normalizedLink = normalizeWikiLink(wikiLink, plugin.app);

if (normalizedContext.includes(normalizedLink)) {
    // Already exists
}
```

**Recommendation:** Use Option 1 (standardize on full path) - simpler and more reliable

---

### Bug 3: Context Notes Not Recursively Expanded

**File:** `src/utils/noteUtils.ts`  
**Function:** `processContextNotes()`  
**Severity:** Low (by design, but confusing)  
**Impact:** Links within context notes are not expanded

**Current Behavior:**
```
Context note "Index" contains: "See [[Details]]"
Result: "See [[Details]]" (link not expanded)
```

**Expected Behavior:**
```
Context note "Index" contains: "See [[Details]]"
Result: "See [[Details]]\n\n---\nNote Name: Details\nContent: ..."
```

**Fix:**

**Current Code (lines 68-104):**
```typescript
export async function processContextNotes(contextNotesText: string, app: App): Promise<string> {
    const linkRegex = /\[\[(.*?)\]\]/g;
    let match;
    let contextContent = "";
    while ((match = linkRegex.exec(contextNotesText)) !== null) {
        if (match && match[1]) {
            const originalLink = match[0]; 
            
            const [fileAndHeader, alias] = match[1].split('|').map(s => s.trim());
            
            const headerMatch = fileAndHeader.match(/(.*?)#(.*)/);
            const baseFileName = headerMatch ? headerMatch[1].trim() : fileAndHeader;
            const headerName = headerMatch ? headerMatch[2].trim() : null;
            try {
                let file = findFile(app, baseFileName);
                if (file && isTFile(file)) {
                    const noteContent = await app.vault.cachedRead(file);
                    
                    contextContent += `---\nAttached: ${originalLink}\n\n`;
                    if (headerName) {
                        const headerContent = extractContentUnderHeader(noteContent, headerName);
                        contextContent += headerContent;
                    } else {
                        contextContent += noteContent;
                    }
                    contextContent += '\n\n';
                } else {
                    contextContent += `Note not found: ${originalLink}\n\n`;
                }
            } catch (error) {
                contextContent += `Error processing note ${originalLink}: ${error.message}\n\n`;
            }
        }
    }
    return contextContent;
}
```

**Fixed Code:**
```typescript
export async function processContextNotes(
    contextNotesText: string, 
    app: App, 
    settings: MyPluginSettings
): Promise<string> {
    const linkRegex = /\[\[(.*?)\]\]/g;
    let match;
    let contextContent = "";
    const visitedNotes = new Set<string>(); // Track visited notes for cycle detection
    
    while ((match = linkRegex.exec(contextNotesText)) !== null) {
        if (match && match[1]) {
            const originalLink = match[0]; 
            
            const [fileAndHeader, alias] = match[1].split('|').map(s => s.trim());
            
            const headerMatch = fileAndHeader.match(/(.*?)#(.*)/);
            const baseFileName = headerMatch ? headerMatch[1].trim() : fileAndHeader;
            const headerName = headerMatch ? headerMatch[2].trim() : null;
            try {
                let file = findFile(app, baseFileName);
                if (file && isTFile(file)) {
                    // Skip if already processed (cycle detection)
                    if (visitedNotes.has(file.path)) {
                        contextContent += `---\nAttached: ${originalLink}\n[Already included above]\n\n`;
                        continue;
                    }
                    
                    visitedNotes.add(file.path);
                    let noteContent = await app.vault.cachedRead(file);
                    
                    contextContent += `---\nAttached: ${originalLink}\n\n`;
                    
                    // Extract header content if specified
                    if (headerName) {
                        noteContent = extractContentUnderHeader(noteContent, headerName);
                    }
                    
                    // Recursively expand links within this note if enabled
                    if (settings.expandLinkedNotesRecursively) {
                        noteContent = await processObsidianLinks(
                            noteContent, 
                            app, 
                            settings, 
                            visitedNotes, 
                            1 // Start at depth 1 since context notes are depth 0
                        );
                    }
                    
                    contextContent += noteContent;
                    contextContent += '\n\n';
                } else {
                    contextContent += `Note not found: ${originalLink}\n\n`;
                }
            } catch (error) {
                contextContent += `Error processing note ${originalLink}: ${error.message}\n\n`;
            }
        }
    }
    return contextContent;
}
```

**Update callers:**

**File:** `src/utils/contextBuilder.ts` (line 43)

**Current:**
```typescript
const contextContent = await processContextNotes(plugin.settings.contextNotes, app);
```

**Fixed:**
```typescript
const contextContent = await processContextNotes(plugin.settings.contextNotes, app, plugin.settings);
```

**File:** `src/utils/noteUtils.ts` (line 115)

**Current:**
```typescript
const contextContent = await processContextNotes(settings.contextNotes, app);
```

**Fixed:**
```typescript
const contextContent = await processContextNotes(settings.contextNotes, app, settings);
```

---

## Enhancements

### Enhancement 1: Add Token Limit Protection

**File:** `src/utils/contextBuilder.ts`  
**Priority:** High  
**Impact:** Prevents context overflow errors

**Current Code (lines 28-70):**
```typescript
export async function buildContextMessages({
    app,
    plugin,
    includeCurrentNote = true,
    includeContextNotes = true,
    debug = false,
    forceNoCurrentNote = false
}: {
    app: App,
    plugin: MyPlugin,
    includeCurrentNote?: boolean,
    includeContextNotes?: boolean,
    debug?: boolean,
    forceNoCurrentNote?: boolean
}): Promise<Message[]> {
    // ... build messages ...
    
    return messages;
}
```

**Enhanced Code:**
```typescript
export async function buildContextMessages({
    app,
    plugin,
    includeCurrentNote = true,
    includeContextNotes = true,
    debug = false,
    forceNoCurrentNote = false,
    maxTokens = undefined // Optional token limit
}: {
    app: App,
    plugin: MyPlugin,
    includeCurrentNote?: boolean,
    includeContextNotes?: boolean,
    debug?: boolean,
    forceNoCurrentNote?: boolean,
    maxTokens?: number
}): Promise<Message[]> {
    // Start with the system message.
    const messages: Message[] = [
        { role: 'system', content: getSystemMessage(plugin.settings) }
    ];

    // Add the list of recently opened files to the system message if enabled.
    if (plugin.settings.includeRecentlyOpenedNotes) {
        const recentlyOpenedFiles = await getRecentlyOpenedFiles(app);
        if (recentlyOpenedFiles.length > 0) {
            messages[0].content += `\n\nRecently Opened Files:\n${recentlyOpenedFiles.slice(0, 3).map(f => f.path).join('\n')}`;
        }
    }

    // Optionally append context notes to the system message.
    if (includeContextNotes && plugin.settings.enableContextNotes && plugin.settings.contextNotes) {
        const contextContent = await processContextNotes(plugin.settings.contextNotes, app, plugin.settings);
        messages[0].content += `\n\nContext Notes:\n${contextContent}`;
    }

    // Optionally add the content of the current note as a separate system message.
    if (!forceNoCurrentNote && includeCurrentNote && plugin.settings.referenceCurrentNote) {
        const currentFile = app.workspace.getActiveFile();
        if (currentFile) {
            const currentNoteContent = await app.vault.cachedRead(currentFile);
            messages.push({
                role: 'system',
                content: `Here is the content of the current note (${currentFile.path}):\n\n${currentNoteContent}`
            });
        }
    }

    // Apply token limit if specified
    if (maxTokens !== undefined) {
        const truncated = truncateMessagesForContext(messages, maxTokens, plugin);
        
        if (debug || plugin.settings.debugMode) {
            const originalTokens = calculateTotalTokenCount(messages);
            const truncatedTokens = calculateTotalTokenCount(truncated);
            
            plugin.debugLog?.('debug', '[contextBuilder] Token limit applied', {
                maxTokens,
                originalTokens,
                truncatedTokens,
                messagesBefore: messages.length,
                messagesAfter: truncated.length
            });
        }
        
        return truncated;
    }

    // Debug logging for context building if enabled.
    if (debug || plugin.settings.debugMode) {
        const totalTokens = calculateTotalTokenCount(messages);
        plugin.debugLog?.('debug', '[contextBuilder] Building context messages', {
            enableContextNotes: plugin.settings.enableContextNotes,
            contextNotes: plugin.settings.contextNotes,
            referenceCurrentNote: plugin.settings.referenceCurrentNote,
            totalMessages: messages.length,
            estimatedTokens: totalTokens
        });
    }

    return messages;
}
```

**Add Warning for Large Context:**

**File:** `src/utils/contextBuilder.ts`

**Add after building messages:**
```typescript
// Warn if context is very large
const totalTokens = calculateTotalTokenCount(messages);
const warningThreshold = 8000; // Warn at 8k tokens

if (totalTokens > warningThreshold && !maxTokens) {
    plugin.debugLog?.('warn', '[contextBuilder] Large context detected', {
        totalTokens,
        warningThreshold,
        recommendation: 'Consider enabling token limit or reducing context notes'
    });
    
    // Optionally show user notice
    if (plugin.settings.showContextWarnings) {
        new Notice(`Large context: ${totalTokens} tokens. May exceed model limits.`);
    }
}
```

---

### Enhancement 2: Real-time Context Notes Validation

**File:** `src/settings/sections/ContentNoteHandlingSection.ts`  
**Priority:** Medium  
**Impact:** Better UX, immediate feedback

**Add validation function:**
```typescript
private async validateContextNotes(contextNotesText: string): Promise<{
    valid: string[];
    invalid: string[];
    warnings: string[];
}> {
    const linkRegex = /\[\[(.*?)\]\]/g;
    let match;
    const valid: string[] = [];
    const invalid: string[] = [];
    const warnings: string[] = [];
    
    while ((match = linkRegex.exec(contextNotesText)) !== null) {
        if (match && match[1]) {
            const [fileAndHeader] = match[1].split('|');
            const [fileName, header] = fileAndHeader.split('#');
            
            const file = findFile(this.plugin.app, fileName.trim());
            
            if (!file || !isTFile(file)) {
                invalid.push(match[0]);
            } else {
                valid.push(match[0]);
                
                // Check if header exists
                if (header) {
                    const content = await this.plugin.app.vault.cachedRead(file);
                    const headerExists = content.includes(`# ${header.trim()}`);
                    if (!headerExists) {
                        warnings.push(`${match[0]}: Header "${header.trim()}" not found`);
                    }
                }
            }
        }
    }
    
    return { valid, invalid, warnings };
}
```

**Update textarea with validation:**
```typescript
new Setting(contextNotesContainer)
    .setName('Context Notes')
    .setDesc('Notes to attach as context (supports [[filename]] and [[another note#header]] syntax)')
    .addTextArea(text => {
        const validationEl = contextNotesContainer.createDiv('context-notes-validation');
        validationEl.style.marginTop = '8px';
        validationEl.style.fontSize = '0.9em';
        
        const updateValidation = async (value: string) => {
            if (!value.trim()) {
                validationEl.empty();
                return;
            }
            
            const result = await this.validateContextNotes(value);
            validationEl.empty();
            
            if (result.valid.length > 0) {
                const validDiv = validationEl.createDiv();
                validDiv.style.color = 'var(--text-success)';
                validDiv.textContent = `✓ ${result.valid.length} valid note(s)`;
            }
            
            if (result.invalid.length > 0) {
                const invalidDiv = validationEl.createDiv();
                invalidDiv.style.color = 'var(--text-error)';
                invalidDiv.textContent = `✗ ${result.invalid.length} invalid: ${result.invalid.join(', ')}`;
            }
            
            if (result.warnings.length > 0) {
                const warningDiv = validationEl.createDiv();
                warningDiv.style.color = 'var(--text-warning)';
                warningDiv.textContent = `⚠ ${result.warnings.join('; ')}`;
            }
        };
        
        text.setPlaceholder('[[Note Name]]\n[[Another Note#Header]]')
            .setValue(this.plugin.settings.contextNotes || '')
            .onChange(async (value) => {
                this.plugin.settings.contextNotes = value;
                await updateValidation(value);
            });
        
        // Initial validation
        updateValidation(this.plugin.settings.contextNotes || '');
        
        // Save on blur
        text.inputEl.addEventListener('blur', async () => {
            await this.plugin.saveSettings();
        });
        
        text.inputEl.rows = 4;
        text.inputEl.style.width = '100%';
        return text;
    });
```

---

### Enhancement 3: Preserve Alias Information

**File:** `src/utils/noteUtils.ts`  
**Priority:** Low  
**Impact:** Better context for AI

**Update output format in `processContextNotes()`:**

**Current:**
```typescript
contextContent += `---\nAttached: ${originalLink}\n\n`;
```

**Enhanced:**
```typescript
const displayInfo = alias ? ` (displayed as "${alias}")` : '';
contextContent += `---\nAttached: ${originalLink}${displayInfo}\n\n`;
```

**Example output:**
```
---
Attached: [[Long Document Name|short]] (displayed as "short")

[content here]
```

---

## Implementation Priority

### Phase 1: Critical Fixes (4 hours)
1. ✅ Fix force parameter bug
2. ✅ Standardize path format
3. ✅ Add token limit protection

### Phase 2: Important Enhancements (4 hours)
4. ✅ Add recursive expansion to context notes
5. ✅ Real-time validation UI

### Phase 3: Nice-to-Have (2 hours)
6. ✅ Preserve alias information
7. ✅ Add context size warnings

**Total Estimated Time:** 10 hours

---

## Testing After Fixes

After implementing fixes, run:

1. Full test suite from `CONTEXT_NOTES_AUDIT.md`
2. Quick test from `CONTEXT_NOTES_QUICK_TEST.md`
3. Regression tests for existing functionality
4. Performance tests with large notes

---

## Rollback Plan

If issues arise:

1. Revert commits for specific fixes
2. Each fix is independent and can be rolled back separately
3. Keep old behavior as fallback option in settings

---

**Document Version:** 1.0  
**Last Updated:** October 28, 2025  
**Status:** Ready for implementation
