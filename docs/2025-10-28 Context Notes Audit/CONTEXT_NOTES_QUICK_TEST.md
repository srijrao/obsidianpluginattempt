# Context Notes - Quick Testing Guide

**Purpose:** Fast verification of all context notes functionality  
**Time Required:** ~15 minutes  
**Prerequisites:** Plugin installed and enabled

---

## Quick Test Setup

### Create Test Notes

Create these notes in your vault:

**Note: "Test Context 1"**
```markdown
This is the first test context note.
It contains basic content for testing.
```

**Note: "Test Context 2"**
```markdown
# Section A
Content in section A

# Section B
Content in section B
```

**Note: "Test Recursive A"**
```markdown
This is note A.
It references [[Test Recursive B]].
```

**Note: "Test Recursive B"**
```markdown
This is note B.
It references [[Test Recursive A]].
```

**Note: "Test Chain 1"**
```markdown
Chain level 1
Links to [[Test Chain 2]]
```

**Note: "Test Chain 2"**
```markdown
Chain level 2
Links to [[Test Chain 3]]
```

**Note: "Test Chain 3"**
```markdown
Chain level 3
Links to [[Test Chain 4]]
```

**Note: "Test Chain 4"**
```markdown
Chain level 4
End of chain
```

---

## Test Sequence

### Test 1: Basic Context Notes (2 min)

1. Open Settings → AI Assistant
2. Find "Context Notes" textarea
3. Add:
   ```
   [[Test Context 1]]
   [[Test Context 2#Section B]]
   ```
4. Enable "Enable Context Notes" toggle
5. Open chat view
6. Click context notes button (should show active)
7. Send message: "Hello"
8. Check `ai-calls/` folder for latest log
9. **Verify:** Log contains "Test Context 1" content and only "Section B" from Test Context 2

**Expected Result:** ✅ Both notes appear in system message with correct content

---

### Test 2: Inline Links (2 min)

1. Ensure "Enable Obsidian Links" is ON
2. In chat, send: `Please read [[Test Context 1]] and summarize`
3. Check latest AI call log
4. **Verify:** Message contains note content with markers:
   ```
   [[Test Context 1]]
   
   ---
   Note Name: Test Context 1
   Content:
   This is the first test context note.
   ---
   ```

**Expected Result:** ✅ Note content inserted inline with proper formatting

---

### Test 3: Recursive Expansion (3 min)

1. Open Settings → AI Assistant
2. Enable "Expand Linked Notes Recursively"
3. Set "Max Link Expansion Depth" to 2
4. In chat, send: `Read [[Test Recursive A]]`
5. Check AI call log
6. **Verify:** 
   - Test Recursive A content appears
   - Test Recursive B content appears
   - Second reference to A shows: `[Recursive link omitted: already included]`

**Expected Result:** ✅ Cycle detected and prevented

---

### Test 4: Depth Limiting (2 min)

1. Ensure recursive expansion is ON
2. Set max depth to 2
3. Send: `Read [[Test Chain 1]]`
4. Check AI call log
5. **Verify:**
   - Chain 1 appears (depth 0)
   - Chain 2 appears (depth 1)
   - Chain 3 appears (depth 2)
   - Chain 4 does NOT appear (exceeds depth)

**Expected Result:** ✅ Expansion stops at depth 2

---

### Test 5: Commands (3 min)

1. Open command palette (Ctrl/Cmd + P)
2. Run: "AI Assistant: Clear Context Notes"
3. **Verify:** Notice appears, context notes cleared
4. Open a note (any note)
5. Run: "AI Assistant: Add Current Note to Context Notes"
6. **Verify:** Notice shows note added
7. Check Settings → Context Notes textarea
8. **Verify:** Note appears as `[[note name]]`
9. Run "Add Current Note to Context Notes" again
10. **Verify:** Notice says "already in context notes"

**Expected Result:** ✅ All commands work correctly

---

### Test 6: Agent Tools (3 min)

**Prerequisites:** Enable Agent Mode in settings

1. Clear context notes (if any)
2. Open chat
3. Send: "Add the current note to my context notes"
4. **Verify:** 
   - AI uses `context_notes_manage` tool
   - Tool shows success
   - AI confirms action
5. Check Settings → Context Notes
6. **Verify:** Current note added
7. Send: "Clear my context notes"
8. **Verify:**
   - AI uses tool with action=clear
   - Context notes cleared
9. Open 3 different notes
10. Send: "Add all open notes to context"
11. **Verify:** All 3 notes added

**Expected Result:** ✅ Agent can manage context notes

---

## Quick Verification Checklist

After running all tests, verify:

- [ ] Context notes appear in AI calls
- [ ] Header references work (`[[note#header]]`)
- [ ] Inline links expand correctly
- [ ] Recursive expansion works
- [ ] Cycle detection prevents infinite loops
- [ ] Depth limiting enforced
- [ ] Clear command works
- [ ] Add current note command works
- [ ] Duplicate prevention works
- [ ] Agent tools functional

---

## Common Issues & Solutions

### Issue: Context notes not appearing in AI calls

**Solution:**
1. Check "Enable Context Notes" is ON
2. Verify context notes button in chat is active (highlighted)
3. Check AI call log to confirm

### Issue: Links not expanding

**Solution:**
1. Check "Enable Obsidian Links" is ON
2. Verify note names are correct (case-sensitive)
3. Check note exists in vault

### Issue: Recursive expansion not working

**Solution:**
1. Enable "Expand Linked Notes Recursively"
2. Set max depth > 0
3. Verify links use correct syntax `[[note]]`

### Issue: Agent tools not working

**Solution:**
1. Enable Agent Mode in settings
2. Verify model supports tool use (Claude, GPT-4, etc.)
3. Check agent mode is active in chat

---

## Debug Mode

For detailed logging:

1. Open Settings → AI Assistant
2. Enable "Debug Mode"
3. Open Developer Console (Ctrl+Shift+I)
4. Run tests
5. Check console for detailed logs

Look for:
- `[contextBuilder]` - Context building logs
- `[ContextNotesTool]` - Agent tool logs
- `[noteUtils]` - Link processing logs

---

## Performance Test

Test with large notes:

1. Create note with 5,000+ words
2. Add to context notes
3. Send message
4. **Monitor:**
   - Response time
   - Token count
   - Any errors

**Warning:** Very large context may exceed model limits

---

## Cleanup

After testing:

1. Run "Clear Context Notes" command
2. Delete test notes (optional)
3. Disable debug mode
4. Reset settings to preferences

---

## Report Issues

If you find bugs:

1. Note the exact steps to reproduce
2. Check AI call logs for error details
3. Check console for error messages
4. Document expected vs actual behavior
5. Create issue with details

---

**Quick Test Version:** 1.0  
**Last Updated:** October 28, 2025  
**Estimated Time:** 15 minutes
