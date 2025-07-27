# Compressed Tool Format Prototype

## Current vs Compressed Format Comparison

### Current Format (Verbose)
```
1. file_search - Find files by name/content. Supports regex, content search, and file type filtering. Use when file location is unknown.
    Parameters:
      - query: Search term (supports regex with useRegex=true)
      - filterType: File type filter: "markdown", "image", or "all"
      - maxResults: Maximum items to return (prevents overwhelming output)
      - searchContent: Search within file contents (markdown only)
      - useRegex: Treat query as regular expression

2. thought - Plan your approach and summarize completion. Use at start (planning) and end (summary). Set nextTool to "finished" when task complete.
    Parameters:
      - thought: The reasoning step or summary to record
      - nextTool: Next tool name or "finished" when task complete
      - nextActionDescription: Brief description of next step or completion status
```

**Character count: ~650 characters for 2 tools**

### Compressed Format (Optimized)
```
Tools:
1. file_search - Find files by name/content | query(str), filterType(md|img|all), maxResults(num), searchContent(bool), useRegex(bool)
2. thought - Plan approach, summarize completion | thought(str,req), nextTool(str,req), nextActionDescription(str,req)
```

**Character count: ~220 characters for 2 tools**

**Reduction: 66%**

## Full Tool Set Comparison

### Current Full Format (~3000+ characters)
```
Available tools:
1. file_search - Find files by name/content. Supports regex, content search, and file type filtering. Use when file location is unknown.
    Parameters:
      - query: Search term (supports regex with useRegex=true)
      - filterType: File type filter: "markdown", "image", or "all"
      - maxResults: Maximum items to return (prevents overwhelming output)
      - searchContent: Search within file contents (markdown only)
      - useRegex: Treat query as regular expression
2. file_read - Read file content from vault. Use before editing or when content analysis is needed. Supports size limits for large files.
    Parameters:
      - path: File path relative to vault root
      - maxSize: Maximum file size in bytes for large file handling
3. file_write - Create new files or completely rewrite existing ones. Auto-creates parent folders and backups. Use file_diff for edits.
    Parameters:
      - path: File path relative to vault root
      - content: Complete file content to write
      - createIfNotExists: Create file if missing (default: true)
      - backup: Create backup before changes (recommended: true)
      - createParentFolders: Create parent folders automatically if needed
4. file_diff - Show file change preview with diff visualization. Requires user approval before applying. Preferred for edits and corrections.
    Parameters:
      - path: Path to the file.
      - originalContent: Original content for comparison.
      - suggestedContent: New content for the file.
      - insertPosition: Line number for suggestion insertion.
5. file_move - Move or rename files/folders. Auto-creates destination folders. Use for organization and restructuring.
    Parameters:
      - sourcePath: Path of the source file.
      - path: Alias for sourcePath.
      - destinationPath: New path for the file.
      - newName: New name for the file (if renaming within same folder). If provided, destinationPath is ignored.
      - createFolders: Create parent folders if they don't exist.
      - overwrite: Whether to overwrite destination if it exists.
6. thought - Plan your approach and summarize completion. Use at start (planning) and end (summary). Set nextTool to "finished" when task complete.
    Parameters:
      - thought: The reasoning step or summary to record
      - nextTool: Next tool name or "finished" when task complete
      - nextActionDescription: Brief description of next step or completion status
7. file_list - List files/folders in directory. Use recursive=true for deep exploration, false for overview. Essential for navigation.
    Parameters:
      - path: File/folder path relative to vault root
      - recursive: Include subdirectories (true) or current level only (false)
      - maxResults: Maximum items to return (prevents overwhelming output)
8. vault_tree - Generate hierarchical folder tree view. Shows vault organization structure. Use for understanding overall layout.
    Parameters:
      - path: Starting path for the tree (defaults to vault root)
      - maxDepth: Maximum depth to traverse
      - maxItems: Maximum total items to include
      - showFolders: Whether to include folders in the tree
9. file_delete - Delete files/folders safely. Moves to .trash by default (recoverable). Creates backups before deletion. Requires confirmation.
    Parameters:
      - path: File/folder path relative to vault root
      - backup: Create backup before changes (recommended: true)
      - confirmDeletion: Required safety confirmation for deletions
      - useTrash: Move to .trash instead of permanent deletion (safer)
10. get_user_feedback - Ask user questions with text or multiple choice responses. Pauses execution until answered. Use when user input required.
    Parameters:
      - question: The question to ask the user
      - type: Type of response expected: "text" for free text input, "choice" for multiple choice
      - choices: Array of choices for multiple choice questions (required if type is "choice")
      - timeout: Timeout in milliseconds to wait for response (default: 300000 = 5 minutes)
      - allowCustomAnswer: For choice type, allow user to provide custom text answer in addition to choices
      - placeholder: Placeholder text for text input
```

### Compressed Full Format (~900 characters)
```
Tools:
1. file_search - Find files by name/content | query(str), filterType(md|img|all), maxResults(num), searchContent(bool), useRegex(bool)
2. file_read - Read file content | path(str,req), maxSize(num)
3. file_write - Create/rewrite files | path(str,req), content(str,req), createIfNotExists(bool), backup(bool), createParentFolders(bool)
4. file_diff - Show change preview | path(str,req), originalContent(str,req), suggestedContent(str,req), insertPosition(num)
5. file_move - Move/rename files | sourcePath(str,req), destinationPath(str), newName(str), createFolders(bool), overwrite(bool)
6. thought - Plan approach, summarize | thought(str,req), nextTool(str,req), nextActionDescription(str,req)
7. file_list - List directory contents | path(str,req), recursive(bool), maxResults(num)
8. vault_tree - Show folder hierarchy | path(str), maxDepth(num), maxItems(num), showFolders(bool)
9. file_delete - Delete files safely | path(str,req), backup(bool), confirmDeletion(bool,req), useTrash(bool)
10. get_user_feedback - Ask user questions | question(str,req), type(text|choice,req), choices(arr), timeout(num), allowCustomAnswer(bool), placeholder(str)
```

**Reduction: 70%**

## Ultra-Compressed Format (~400 characters)
```
Tools: file_search(q,type,max,content,regex), file_read(path,size), file_write(path,content,create,backup,folders), file_diff(path,orig,new,pos), file_move(src,dest,name,folders,overwrite), thought(text,next,desc), file_list(path,recursive,max), vault_tree(path,depth,items,folders), file_delete(path,backup,confirm,trash), get_feedback(q,type,choices,timeout,custom,placeholder)
```

**Reduction: 87%**

## Context-Aware Tool Loading

### File Operations Context
```
User mentions: "edit", "modify", "change", "update", "create"
Load: file_read, file_write, file_diff, thought
```

### Search Context
```
User mentions: "find", "search", "locate", "look for"
Load: file_search, file_list, vault_tree, thought
```

### Organization Context
```
User mentions: "move", "organize", "delete", "rename"
Load: file_move, file_delete, file_list, thought
```

## Implementation Strategy

### Phase 1: Compressed Format
1. Replace verbose descriptions with concise versions
2. Use abbreviated parameter notation
3. Maintain essential functionality information
4. **Target: 60-70% reduction**

### Phase 2: Context Loading
1. Analyze user message for intent keywords
2. Load relevant tool subset
3. Always include core tools (thought, file_read)
4. **Additional 20-30% reduction**

### Phase 3: Dynamic Discovery
1. Implement tool help system
2. Allow on-demand parameter details
3. Progressive tool loading
4. **Further optimization based on usage**

## Configuration Options

```typescript
interface PromptOptimizationConfig {
  format: 'verbose' | 'compressed' | 'ultra' | 'contextual';
  maxPromptSize: number;
  coreTools: string[];
  enableContextLoading: boolean;
  enableToolDiscovery: boolean;
}
```

## Expected Results

| Format | Character Count | Reduction | Functionality |
|--------|----------------|-----------|---------------|
| Current | ~3000 | 0% | Full |
| Compressed | ~900 | 70% | Full |
| Ultra | ~400 | 87% | Requires help system |
| Contextual | ~300-600 | 80-90% | Full with discovery |

## Next Steps

1. Implement compressed format generator
2. Add context analysis for tool filtering
3. Create tool discovery mechanism
4. Test with real scenarios
5. Measure performance impact