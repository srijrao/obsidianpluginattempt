# AI Assistant for Obsidian

A feature-rich AI assistant plugin for Obsidian that brings powerful AI capabilities directly into your note-taking workflow. Chat with multiple AI providers, automate vault operations with intelligent agents, and enhance your notes with AI-generated content—all without leaving Obsidian.

## Table of Contents

- [Key Features](#key-features)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Complete Function Reference](#complete-function-reference)
  - [Command Palette Commands](#command-palette-commands)
  - [Chat Interface](#chat-interface)
  - [Agent Mode & Tools](#agent-mode--tools)
  - [YAML Attribute Generation](#yaml-attribute-generation)
- [Configuration](#configuration)
  - [Provider Setup](#provider-setup)
  - [Settings Overview](#settings-overview)
- [Usage Examples](#usage-examples)
- [Troubleshooting](#troubleshooting)
- [Development](#development)
- [Contributing](#contributing)
- [License](#license)

## Key Features

### 🤖 Multi-Provider AI Support
- **OpenAI** - GPT-4, GPT-4 Turbo, GPT-3.5-turbo
- **Anthropic** - Claude 3 Opus, Sonnet, Haiku
- **Google Gemini** - Gemini 1.5 Pro, Flash
- **OpenRouter** - Access to 100+ models through a unified API
- **Ollama** - Run local models (Llama, Mistral, etc.) on your machine
- Seamless provider switching with unified model selection

### 💬 Advanced Chat Interface
- **Real-time streaming** responses with markdown rendering
- **Message regeneration** - regenerate any message in the conversation
- **Persistent chat history** - resume conversations across sessions
- **Context notes** - include specific notes as reference material
- **Reference current note** - automatically include active note content
- **Live/Source mode toggle** - view formatted or raw markdown
- **Token count display** - monitor context window usage
- **Clickable links** - navigate to notes directly from chat
- **Agent mode state preservation** - chat notes export/import with agent mode settings

### 🛠️ Agent Mode & Tool Execution
Enable Agent Mode to let AI autonomously use tools:
- **file_search** - Search vault by filename or content
- **file_read** - Read file contents
- **file_write** - Create or modify files with automatic backups
- **file_delete** - Safely delete files with recovery options
- **file_move** - Rename or relocate files
- **file_diff** - Compare file versions
- **file_list** - Browse directory structures
- **thought** - AI reasoning and planning tool
- **Context management tools** - Add/clear context notes programmatically

Configurable limits: max tool calls, timeout, iteration depth

### 📝 Context-Aware Features
- **Smart context assembly** - automatically include relevant notes
- **Reference note integration** - use any note as context
- **Recently opened files** - optionally include in system prompts
- **Expandable linked notes** - recursively include [[wiki links]]
- **Context window management** - automatic truncation to stay within limits

### ⚙️ Powerful Configuration
- **Model presets** - save and switch between model configurations
- **Custom system prompts** - define AI behavior and personality
- **Temperature & token controls** - fine-tune response characteristics
- **API testing** - verify connections before use
- **Dynamic model discovery** - auto-fetch available models from providers
- **YAML frontmatter generation** - AI-powered metadata creation

### 🎨 User Experience
- **Command palette integration** - access all features via `Ctrl/Cmd+P`
- **Keyboard shortcuts** - streamlined workflow
- **Debug mode** - detailed logging for troubleshooting
- **Performance dashboard** - monitor active streams and metrics
- **Automatic backups** - safe file operations with rollback
- **Extensible architecture** - easy to add providers and tools

## Installation

### From GitHub Releases (Recommended)
1. Download the latest release from [GitHub Releases](https://github.com/srijrao/obsidianpluginattempt/releases)
2. Extract the files to your vault's `.obsidian/plugins/ai-assistant-for-obsidian/` directory
3. Enable the plugin in Obsidian: Settings → Community plugins → Enable "AI Assistant for Obsidian"

### From Source
```bash
git clone https://github.com/srijrao/obsidianpluginattempt.git
cd obsidianpluginattempt
npm install
npm run build
```
Then copy `main.js`, `manifest.json`, and `styles.css` to your vault's `.obsidian/plugins/ai-assistant-for-obsidian/` directory.

## Quick Start

### 1. Configure Your AI Provider
1. Open Obsidian Settings → AI Assistant for Obsidian
2. Navigate to **Provider Configuration**
3. Select your preferred provider (OpenAI, Anthropic, Gemini, OpenRouter, or Ollama)
4. Enter your API key
5. Click **Test API Key** to verify connection
6. Select a model from the dropdown

### 2. Start Chatting
1. Press `Ctrl/Cmd+P` and type "Show AI Chat"
2. Type your message and press Enter
3. Watch AI responses stream in real-time

### 3. Try Agent Mode
1. In Settings → Agent Mode Settings, enable **Agent Mode**
2. In the chat, click the 🤖 robot button to activate
3. Ask AI to perform vault operations: *"Create a note called 'Project Ideas' with 3 bullet points"*
4. Watch as AI uses tools autonomously

### 4. Enhance with Context
1. Enable **Reference Current Note** to include active note content
2. Add important reference notes to **Context Notes** list
3. AI will now have access to this context in every conversation

## Complete Function Reference

### Command Palette Commands

All commands are accessible via `Ctrl/Cmd+P`. Search for "AI Assistant":

#### 🖥️ View & Interface Commands
- **Show AI Settings** - Open plugin configuration panel
- **Show AI Chat** - Open chat interface in sidebar
- **Open Performance Dashboard** - Monitor active streams, metrics, and performance

#### 🤖 AI Completion & Streaming
- **Get AI Completion** - Generate AI response from selected text or current note
- **End AI Stream** - Stop all active AI streaming operations
- **Debug AI Streams** - Display detailed stream debug information (requires debug mode)

#### 📄 Note Operations
- **Copy Active Note Name** - Copy current note name as wiki link `[[Note Name]]`
- **Insert Chat Start String** - Insert configured chat separator at cursor
- **Load Chat Note into Chat** - Parse current note as chat messages and load into chat view
- **Generate Note Title** - AI-generated title with multiple output modes (clipboard/filename/metadata)

#### 🗂️ Context Management
- **Clear Context Notes** - Remove all notes from context notes list
- **Copy Context Notes to Clipboard** - Export context notes configuration
- **Add Current Note to Context Notes** - Add active note to context notes
- **Add All Open Notes to Context Notes** - Add all workspace tabs to context notes

#### ⚙️ Settings Toggles
- **Toggle Enable Obsidian Links** - Enable/disable Obsidian `[[link]]` processing in responses
- **Toggle Enable Context Notes** - Enable/disable automatic context notes inclusion
- **Toggle Reference Current Note** - Include/exclude active note in AI queries

#### 📋 YAML Attribute Generation
- **Generate YAML: summary** - AI-generated summary in frontmatter (default)
- **Generate YAML: [custom]** - Custom generators configured in settings

### Chat Interface

The chat interface is the primary way to interact with AI models.

#### Core Features
- **Real-time Streaming** - See responses as they're generated, word by word
- **Markdown Rendering** - Full support for formatting, code blocks, lists, tables
- **Message Regeneration** - Regenerate any message (user or assistant) to try different responses
- **Persistent History** - Conversations saved automatically and restored on restart
- **Context Integration** - Seamlessly include current note and context notes
- **Token Counter** - Live display of context window usage
- **Live/Source Toggle** - Switch between formatted and raw markdown view
- **Clickable Links** - Navigate directly to `[[wiki links]]` from chat

#### Chat Controls & Buttons

**Top Bar Controls:**
- 🔄 **Model Selector** - Dropdown to switch between available models
- 📊 **Token Count** - Current tokens / Max context window
- 📝 **Reference Note Toggle** - Include active note in context
- 👁️ **Live/Source Mode** - Toggle between formatted and raw markdown
- 🤖 **Agent Mode** - Enable/disable AI tool execution
- 🗂️ **Context Notes Buttons**:
  - Clear all context notes
  - Add current note to context
  - Add all open notes to context

**Message Actions:**
- 🔄 **Regenerate** - Re-run query from this message (user or assistant)
- 🗑️ **Delete** - Remove message (click twice: first click → "Sure?" button)
- 📋 **Copy** - Copy message content to clipboard

**Chat Management:**
- **Send Message** - Type and press `Enter` (or click Send button)
- **Stop Generation** - Abort streaming response mid-generation
- **Clear Chat** - Erase current conversation
- **Save Session** - Save conversation with a name
- **Load Session** - Restore a previously saved conversation
- **Export Chat** - Export to a note file with agent mode state preservation
- **Load Chat Note** - Import chat from note with automatic agent mode restoration

#### Advanced Features

**Context Notes System:**
- Add specific notes as persistent reference material
- Notes included in every AI request
- Manage via buttons or settings panel
- Expandable linked notes (configurable depth)

**Reference Current Note:**
- Toggle to include/exclude active note content
- Updates automatically when switching notes
- Perfect for note-specific queries

**Recently Opened Files:**
- Optional system prompt enhancement
- Includes 3 most recent file paths
- Helps AI understand your current work context

### Agent Mode & Tools

Enable Agent Mode to unlock AI's ability to autonomously execute tools and perform complex vault operations.

#### What is Agent Mode?

Agent Mode transforms the AI from a passive responder into an active assistant that can:
- Read and analyze your vault files
- Create, modify, and organize notes
- Search across your knowledge base
- Plan multi-step operations
- Request clarification when needed

When enabled, AI receives tool descriptions and can call them as needed to accomplish tasks.

#### Built-in Tools (8 Core Tools)

##### 1. **file_search** 
Search your vault by filename or content
- **Use cases:** Find notes by topic, locate specific content
- **Parameters:** 
  - `query` - Search string (supports regex)
  - `searchType` - filename, content, or both
  - `fileType` - markdown, images, or all
  - `limit` - Max results to return

##### 2. **file_read**
Read the contents of any file in your vault
- **Use cases:** Analyze notes, reference existing content
- **Parameters:**
  - `path` - Relative path from vault root
- **Returns:** Full file content as text

##### 3. **file_write**
Create new files or modify existing ones
- **Use cases:** Generate notes, update content, batch operations
- **Parameters:**
  - `path` - Target file path
  - `content` - File content
  - `mode` - create, overwrite, or append
- **Safety:** Automatic backup before modifications

##### 4. **file_delete**
Safely remove files from vault
- **Use cases:** Clean up, remove temporary files
- **Parameters:**
  - `path` - File to delete
- **Safety:** Automatic backup before deletion, recoverable

##### 5. **file_move**
Rename or relocate files
- **Use cases:** Reorganize vault, fix naming
- **Parameters:**
  - `sourcePath` - Current file location
  - `targetPath` - New location/name
- **Safety:** Automatic link updates in other files

##### 6. **file_diff**
Compare file versions and show changes
- **Use cases:** Track edits, review changes
- **Parameters:**
  - `path` - File to compare
  - `compareWith` - Previous version or backup
- **Returns:** Highlighted differences

##### 7. **file_list**
List directory contents and vault structure
- **Use cases:** Browse folders, understand organization
- **Parameters:**
  - `path` - Directory to list (default: vault root)
  - `recursive` - Include subdirectories
- **Returns:** Files and folders with metadata

##### 8. **thought**
AI reasoning and planning tool (Meta-tool)
- **Use cases:** Plan complex operations, explain reasoning, summarize actions
- **Parameters:**
  - `content` - AI's internal reasoning or plan
- **Special:** Always shown to user, helps understand AI's thinking

#### Context Management Tool (Agent-accessible)

Use `context_notes_manage` with an `action` parameter to adjust context notes:

- `{"action": "clear", "confirm": true}` — remove all context notes and disable context usage
- `{"action": "add_current"}` — include the active note (use `force: true` to bypass duplicate checks)
- `{"action": "add_all_open", "maxNotes": 5}` — add up to five open notes (omit `maxNotes` to include all; add `force: true` to re-add existing links)

All commands accept optional `force` and `maxNotes` parameters as noted. Always set `confirm: true` when clearing to indicate the action is intentional.

#### Agent Mode Configuration

Configure in Settings → Agent Mode Settings:

**Core Settings:**
- **Enable Agent Mode** - Master toggle for tool execution
- **Max Tool Calls** - Limit total tool executions per conversation (default: 5)
- **Timeout** - Maximum time for tool operations in milliseconds (default: 30000)
- **Max Iterations** - Control reasoning loop depth (default: 10)

**Custom Agent System Message:**
- Override default agent instructions
- Define tool usage policies
- Set behavioral guidelines

**Tool Enable/Disable:**
- Selectively enable/disable individual tools
- Disabled tools won't appear in AI's tool list
- Useful for restricting AI capabilities

#### How Agent Mode Works

1. **User Request:** *"Find all notes about machine learning and create a summary note"*

2. **AI Planning:** Uses `thought` tool to plan:
   ```
   [Thought] I'll search for ML-related notes, read them, 
   and create a comprehensive summary.
   ```

3. **Tool Execution:**
   - Calls `file_search` with query "machine learning"
   - Calls `file_read` on each result
   - Calls `file_write` to create summary note

4. **Result Display:** Tool results shown in expandable cards with:
   - Tool name and parameters
   - Execution status
   - Results/output
   - Execution time

#### Agent Mode Best Practices

**✅ Good Agent Prompts:**
- *"Create a daily note for tomorrow with my usual template"*
- *"Find all notes tagged with #project and list them by modification date"*
- *"Reorganize my Inbox folder by moving completed tasks to Archive"*

**❌ Avoid:**
- Vague requests without clear goals
- Operations outside vault boundaries
- Requests requiring external tools (web scraping, APIs)

**Safety Features:**
- All file modifications create automatic backups
- Operations logged in debug mode
- Tool execution limits prevent runaway operations
- User can abort operations via Stop button

### YAML Attribute Generation

Generate AI-powered YAML frontmatter attributes for your notes.

#### How It Works

YAML commands use AI to analyze note content and generate metadata fields that are inserted into the frontmatter.

#### Default Command

**Generate Note Title** - Smart title generation with 3 output modes:

1. **Clipboard Mode**
   - Generates title and copies to clipboard
   - Allows manual review before using

2. **Replace Filename Mode**
   - Generates title and renames the file
   - Updates all links automatically
   - Useful for cleaning up "Untitled" notes

3. **Metadata Mode**
   - Inserts `title:` field in YAML frontmatter
   - Preserves existing frontmatter
   - Non-destructive addition

#### Custom YAML Generators

Create your own AI-powered metadata generators in Settings → YAML Attribute Generators.

**Configuration Fields:**
- **Attribute Name** - YAML field name (e.g., `summary`, `tags`, `category`)
- **AI Prompt** - Instructions for generating the value
- **Output Mode** - Clipboard or metadata insertion
- **Command Name** - Display name in command palette

**Example Configurations:**

```yaml
# Summary Generator
attributeName: summary
prompt: "Read this note and create a concise 1-2 sentence summary"
outputMode: metadata
commandName: Generate YAML: summary

# Tags Generator
attributeName: tags
prompt: "Analyze this note and suggest 3-5 relevant tags in YAML list format"
outputMode: metadata
commandName: Generate YAML: tags

# Category Generator
attributeName: category
prompt: "Determine the main category for this note (e.g., Personal, Work, Research)"
outputMode: metadata
commandName: Generate YAML: category

# Reading Time
attributeName: reading_time
prompt: "Estimate reading time in minutes for this note"
outputMode: metadata
commandName: Generate YAML: reading time
```

#### Usage

1. **Via Command Palette:**
   - Open note to enhance
   - Press `Ctrl/Cmd+P`
   - Search for "Generate YAML: [your generator name]"
   - AI analyzes content and inserts metadata

2. **Automatic Insertion:**
   - If `outputMode: metadata`, YAML is automatically inserted
   - Existing frontmatter preserved
   - New fields added cleanly

3. **Manual Review:**
   - If `outputMode: clipboard`, review before inserting
   - Paste manually where needed

#### Advanced Tips

**Multi-line Values:**
Use prompts that generate valid YAML multi-line syntax:
```yaml
prompt: "Create a summary using YAML block scalar format (|)"
```

**Structured Data:**
Generate lists or nested objects:
```yaml
attributeName: related_topics
prompt: "List 3-5 related topics in YAML list format with - prefix"
```

**Conditional Generation:**
Include context in prompts:
```yaml
prompt: "If this is a meeting note, extract attendees. Otherwise, return 'N/A'"
```

## Configuration

### Provider Setup

#### OpenAI Configuration
1. Navigate to: Settings → AI Assistant → Provider Configuration → OpenAI
2. **API Key:** Enter your OpenAI API key ([Get one here](https://platform.openai.com/api-keys))
3. **Base URL:** (Optional) Custom endpoint for OpenAI-compatible APIs
4. **Model Selection:** Choose from GPT-4, GPT-4 Turbo, GPT-3.5-turbo, etc.
5. **Test Connection:** Click "Test API Key" to verify
6. **Refresh Models:** Click "Refresh Available Models" to fetch latest models

**Supported Models:**
- `gpt-4` - Most capable, best for complex tasks
- `gpt-4-turbo` - Faster, 128k context window
- `gpt-3.5-turbo` - Fast and cost-effective
- Custom fine-tuned models

#### Anthropic (Claude) Configuration
1. Navigate to: Settings → AI Assistant → Provider Configuration → Anthropic
2. **API Key:** Enter Anthropic API key ([Sign up](https://www.anthropic.com/))
3. **Model Selection:** Choose Claude version
4. **Test Connection:** Verify setup

**Supported Models:**
- `claude-3-opus-20240229` - Most powerful, best reasoning
- `claude-3-sonnet-20240229` - Balanced performance/cost
- `claude-3-haiku-20240307` - Fastest, most economical

#### Google Gemini Configuration
1. Navigate to: Settings → AI Assistant → Provider Configuration → Google Gemini
2. **API Key:** Enter Google AI API key ([Get one](https://makersuite.google.com/app/apikey))
3. **Model Selection:** Choose Gemini version
4. **Test Connection:** Verify setup

**Supported Models:**
- `gemini-1.5-pro` - Advanced reasoning, 1M+ token context
- `gemini-1.5-flash` - Fast responses, efficient

#### OpenRouter Configuration
1. Navigate to: Settings → AI Assistant → Provider Configuration → OpenRouter
2. **API Key:** Enter OpenRouter API key ([Sign up](https://openrouter.ai/))
3. **Model Selection:** Choose from 100+ models
4. **Test Connection:** Verify setup

**Access to models like:**
- Claude (via OpenRouter)
- GPT-4 (via OpenRouter)
- Llama 2, Mistral, Mixtral
- Many open-source and commercial models

#### Ollama (Local AI) Configuration
1. **Install Ollama:** Download from [ollama.ai](https://ollama.ai/)
2. **Pull Models:** Run `ollama pull llama2` (or other models)
3. Navigate to: Settings → AI Assistant → Provider Configuration → Ollama
4. **Server URL:** Default `http://localhost:11434` (or your custom endpoint)
5. **Model Selection:** Choose from locally installed models
6. **Test Connection:** Verify Ollama is running

**Popular Local Models:**
- `llama2` - Meta's open-source LLM
- `mistral` - High-quality open model
- `codellama` - Specialized for code
- `mixtral` - MoE model, excellent performance

**Benefits:**
- ✅ Complete privacy - data never leaves your machine
- ✅ No API costs
- ✅ Works offline
- ✅ Fast responses with good hardware

### Settings Overview

#### AI Model Settings (Current Model Settings)

**Provider & Model Selection:**
- **Provider:** Choose AI service (OpenAI, Anthropic, Gemini, OpenRouter, Ollama)
- **Model:** Select specific model variant
- **Model Presets:** Save/load model configurations for quick switching

**Generation Parameters:**
- **Temperature:** Randomness in responses (0.0 = deterministic, 2.0 = very creative)
  - 0.0-0.3: Focused, consistent responses
  - 0.4-0.7: Balanced creativity
  - 0.8-2.0: More creative and varied
- **Max Tokens:** Maximum response length (model-dependent)
- **System Message:** Define AI personality and behavior
  - Default provides general assistant behavior
  - Customize for specific use cases (e.g., "You are a technical documentation expert")

**Streaming & UI:**
- **Enable Streaming:** Real-time response rendering (recommended: ON)
- **Enable Obsidian Links:** Process `[[wiki links]]` in AI responses

#### Context & Reference Settings

**Reference Current Note:**
- Toggle to include active note content in every AI request
- Useful for note-specific queries and enhancements
- Updates automatically when switching notes

**Context Notes:**
- **Enable Context Notes:** Master toggle for context note inclusion
- **Context Notes List:** Specific notes to always include as reference
  - Add via wiki links: `[[Important Reference]], [[Project Overview]]`
  - Or use buttons in chat UI
  - Notes included in full with every request

**Expand Linked Notes:**
- Recursively include notes linked from context notes
- **Max Link Expansion Depth:** How many levels deep to follow links
  - 1 = Direct links only
  - 2+ = Follow links recursively
  - Higher values increase token usage

**Recently Opened Files:**
- **Include Recently Opened:** Add 3 most recent file paths to system prompt
- Helps AI understand your current work context
- Paths are relative to vault root

#### Chat & Session Settings

**Chat Interface:**
- **Chat Separator:** String used to separate messages in exports
- **Chat Start String:** Marker for beginning of chat sections
- **Chat End String:** Marker for end of chat sections
- **Chat Note Folder:** Where to save exported chat notes

**Session Management:**
- **Max Sessions:** Maximum saved chat sessions (default: 20)
- **Auto Save Sessions:** Automatically save conversations
- **Session Name Format:** Customize saved session naming

**History & Persistence:**
- Chat history automatically saved to `chat-history.json`
- Sessions persist across Obsidian restarts
- Export conversations to vault as notes

#### Agent Mode Settings

**Core Agent Configuration:**
- **Enable Agent Mode:** Master toggle for tool execution capabilities
- **Max Tool Calls:** Limit tool executions per conversation (prevents runaway operations)
  - Recommended: 5-10 for safety
  - Higher for complex multi-step tasks
- **Timeout:** Maximum milliseconds for any single tool operation
  - Default: 30000 (30 seconds)
- **Max Iterations:** Maximum reasoning loops before stopping
  - Default: 10
  - Prevents infinite loops

**Custom Agent System Message:**
- Override default agent instructions
- Define tool usage policies
- Examples:
  ```
  Always use the thought tool before and after other tools.
  Never delete files without explicit user confirmation.
  Prefer creating notes in the "AI Generated" folder.
  ```

**Tool Enable/Disable:**
- Individually toggle each tool on/off
- Disabled tools don't appear in AI's tool list
- Useful for restricting capabilities:
  - Disable `file_delete` for safety
  - Disable `file_write` for read-only mode
  - Enable only `file_search` and `file_read` for research tasks

#### UI Behavior Settings

**Message Display:**
- **Collapse Old Reasoning:** Auto-collapse AI reasoning in older messages
  - Keeps chat clean and focused
  - Reasoning still accessible by expanding
- **Show Completion Notifications:** Display Notice when AI finishes
- **Include Reasoning in Exports:** Add AI reasoning to exported chat notes

**Performance:**
- **Debug Mode:** Enable detailed logging to console
  - All AI calls logged to `ai-calls/` folder
  - Stream debugging information
  - Tool execution traces
- **Performance Dashboard:** Monitor active streams and metrics

#### YAML Attribute Generators

Configure custom AI-powered frontmatter generators:

**Fields per Generator:**
- **Attribute Name:** YAML key (e.g., `summary`, `tags`)
- **Prompt:** AI instructions for generating value
- **Output Mode:** 
  - `metadata` - Auto-insert into frontmatter
  - `clipboard` - Copy to clipboard for manual insertion
- **Command Name:** Display name in command palette

**Management:**
- Add unlimited custom generators
- Each creates a command palette entry
- Delete unwanted generators
- Export/import configurations

#### Advanced Settings

**Performance Optimizations:**
- Message context pooling (automatic)
- LRU response caching
- Async debouncing for rapid requests

**Data & Privacy:**
- API keys stored in Obsidian's data.json (encrypted by Obsidian)
- Chat history in plugin data folder
- Backups in `backups.json` and `binary-backups/`
- No telemetry or external data transmission (except to chosen AI provider)

## Usage Examples

### Basic AI Completion

**Scenario:** Enhance selected text with AI

1. Select text in any note
2. Press `Ctrl/Cmd+P`
3. Run "AI Assistant: Get AI Completion"
4. AI response streams and appears below selection

**Example:**
```markdown
Selected: "quantum computing"

AI adds:
Quantum computing is a revolutionary approach to computation that 
leverages quantum mechanical phenomena like superposition and 
entanglement to process information...
```

### Interactive Chat Conversation

**Scenario:** Research assistant for note-taking

1. Open chat: `Ctrl/Cmd+P` → "Show AI Chat"
2. Enable context notes with your research materials
3. Chat naturally:

```
You: Explain the key differences between REST and GraphQL APIs

AI: [Streams comprehensive response with examples]

You: Which one should I use for a real-time dashboard?

AI: [Context-aware response referencing previous answer]
```

### Agent Mode State Preservation

**Scenario:** Export and import chats with agent mode settings

1. **Enable Agent Mode** and have an agent conversation
2. **Export Chat:** Click "Export Chat" to save as note
3. **YAML Frontmatter** automatically includes:
```yaml
---
agent_mode_enabled: true
agent_prompt: "You are an AI assistant with access to tools..."
---
```
4. **Load Chat Note:** Use "Load Chat Note into Chat" command
5. **Agent Mode** automatically enables with preserved settings

**Benefits:**
- Agent-enabled chats maintain their tool capabilities when exported
- No need to manually re-enable agent mode after loading
- Custom agent prompts are preserved
- Backward compatible with existing chat notes

### Agent Mode Automation

**Scenario 1: Vault Organization**

```
You: Find all notes in my Inbox folder that are older than 30 days 
     and move them to Archive

AI: [Uses thought tool] Planning to search Inbox, check dates, 
    and move files

    [Uses file_list on Inbox/]
    Found 12 files in Inbox

    [Uses file_read to check dates]
    Identified 5 files older than 30 days

    [Uses file_move repeatedly]
    Moved: Inbox/old-note-1.md → Archive/old-note-1.md
    Moved: Inbox/old-note-2.md → Archive/old-note-2.md
    ...

    ✅ Moved 5 files to Archive
```

**Scenario 2: Knowledge Synthesis**

```
You: Create a summary note of all my meeting notes from this week

AI: [Uses file_search] Searching for "meeting" notes...
    Found 4 meeting notes

    [Uses file_read] Reading each note...
    - Monday standup
    - Wednesday client call
    - Thursday planning session
    - Friday retrospective

    [Uses file_write] Creating "Weekly Meetings Summary.md"

    ✅ Created summary with key points from all 4 meetings
```

**Scenario 3: Content Generation**

```
You: Create a new note called "Python Best Practices" with 10 tips

AI: [Uses thought tool] Planning to create educational content

    [Uses file_write]
    Creating: Python Best Practices.md

    Content includes:
    1. Use virtual environments
    2. Follow PEP 8 style guide
    3. Write docstrings for functions
    ...
    10. Use type hints for clarity

    ✅ Note created at root/Python Best Practices.md
```

### YAML Generation Workflows

**Scenario 1: Batch Metadata Generation**

1. Create custom generators for `summary`, `tags`, `category`
2. For each note:
   - Open note
   - Run "Generate YAML: summary"
   - Run "Generate YAML: tags"
   - Run "Generate YAML: category"
3. Result:
```yaml
---
summary: Overview of machine learning fundamentals and key algorithms
tags: [ai, machine-learning, education, tutorial]
category: Technical Learning
---
```

**Scenario 2: Note Title Cleanup**

1. Open note with bad title: "Untitled 47"
2. Run "Generate Note Title"
3. Select "Replace Filename"
4. AI reads content and renames to: "Introduction to Neural Networks"
5. All links automatically updated

### Context Notes Strategy

**Scenario: Project-Specific Assistant**

1. **Setup Context:**
   - Add `[[Project Charter]]` to context notes
   - Add `[[Team Members]]` to context notes
   - Add `[[Technical Stack]]` to context notes

2. **Enable in Chat:**
   - Toggle "Enable Context Notes" ON
   - All requests now have project context

3. **Natural Queries:**
```
You: Draft a status update for this week

AI: [Aware of project charter and team]
    Based on the project goals outlined in your charter...
    
    Status Update - Week of [date]
    - Team: [references team members by name]
    - Stack: [references actual technologies]
    ...
```

### Advanced: Linked Note Expansion

**Scenario: Research with Connected Notes**

1. **Setup:**
   - Context Notes: `[[Research Overview]]`
   - Enable "Expand Linked Notes"
   - Set depth to 2

2. **Effect:**
   - `[[Research Overview]]` includes content
   - All notes linked FROM Research Overview included
   - Notes linked from those notes also included (depth 2)

3. **Use Case:**
```
Research Overview
  ├─ [[Paper 1 - Attention Mechanisms]]
  │   └─ [[Transformer Architecture]]
  ├─ [[Paper 2 - BERT]]
  └─ [[Implementation Notes]]

All 5 notes included automatically in AI context
```

### Recently Opened Files Context

**Scenario: Context-Aware Suggestions**

1. Enable "Include Recently Opened Files"
2. Work on several notes:
   - `Project Plan.md`
   - `Meeting Notes 2024-10-20.md`
   - `Budget Estimates.md`

3. Ask AI:
```
You: What should I focus on today?

AI: [Sees recent files in system prompt]
    Based on your recent work on the project plan, meeting notes, 
    and budget estimates, I suggest:
    
    1. Finalize budget estimates (you were just reviewing)
    2. Update project plan with decisions from yesterday's meeting
    3. Send summary to stakeholders
```

## Troubleshooting

### Common Issues

#### API Connection Problems

**Error: "Invalid API key"**
- ✅ Verify API key is correct (no extra spaces)
- ✅ Check account has available credits/quota
- ✅ Use "Test API Key" button in settings
- ✅ For OpenAI: Check [platform.openai.com](https://platform.openai.com/account/api-keys)
- ✅ For Anthropic: Verify at [console.anthropic.com](https://console.anthropic.com/)

**Error: "Connection timeout"**
- ✅ Check internet connection
- ✅ Verify no firewall blocking requests
- ✅ For Ollama: Ensure server is running (`ollama serve`)
- ✅ Test base URL in browser if using custom endpoint

**Error: "Rate limit exceeded"**
- ✅ Wait before retrying (provider-specific limits)
- ✅ Reduce request frequency
- ✅ Upgrade API tier if needed
- ✅ Check provider dashboard for limit details

#### Streaming Issues

**Responses not streaming**
- ✅ Enable streaming in: Settings → Current Model Settings → Enable Streaming
- ✅ Restart Obsidian
- ✅ Check provider supports streaming (all supported providers do)
- ✅ Look for errors in console (`Ctrl/Cmd+Shift+I`)

**Partial or cut-off responses**
- ✅ Increase "Max Tokens" in model settings
- ✅ Check token counter - may be hitting context window limit
- ✅ Reduce context notes or chat history
- ✅ Use model with larger context window (e.g., GPT-4 Turbo 128k)

**Stream never completes**
- ✅ Click Stop button to abort
- ✅ Check provider status page
- ✅ Try different model
- ✅ Look for errors in Debug mode

#### Agent Mode Problems

**Tools not executing**
- ✅ Verify Agent Mode is enabled: Settings → Agent Mode Settings → Enable Agent Mode
- ✅ Click 🤖 button in chat to activate agent mode for conversation
- ✅ Check specific tools aren't disabled in Tool Enable/Disable section
- ✅ Look for error messages in tool result cards
- ✅ Enable Debug Mode for detailed logs

**"Tool execution limit reached"**
- ✅ Increase "Max Tool Calls" in Agent Mode Settings
- ✅ Break complex tasks into smaller requests
- ✅ Agent will notify when limit reached - acknowledge and continue

**File operations failing**
- ✅ Verify file paths are relative to vault root
- ✅ Check file/folder permissions
- ✅ Ensure vault has write access
- ✅ Look for locked files (open in other apps)
- ✅ Check backup folder has space

**AI not using tools**
- ✅ Be specific in requests: *"Use file_search to find..."*
- ✅ Check if tools are disabled in settings
- ✅ Try higher capability model (GPT-4, Claude Opus)
- ✅ Review custom agent system message - may be overriding tool use

#### Context & Token Issues

**"Context window exceeded"**
- ✅ Clear chat history: Clear Chat button
- ✅ Reduce context notes list
- ✅ Disable "Expand Linked Notes" or reduce depth
- ✅ Use model with larger context (Gemini 1.5 Pro: 1M+ tokens)
- ✅ Plugin auto-truncates oldest messages - ensure this is working

**Token count seems wrong**
- ✅ Count includes: system prompt + context notes + chat history + current message
- ✅ Context notes can be large - check individual note sizes
- ✅ Token count is approximate (exact tokenization varies by model)

**Responses ignore context notes**
- ✅ Enable "Enable Context Notes" toggle in chat
- ✅ Verify notes exist and are readable
- ✅ Check note content isn't empty
- ✅ Try mentioning context explicitly: *"Based on my Project Charter note..."*

#### Chat Interface Issues

**Messages not appearing**
- ✅ Check if still streaming (stop button visible)
- ✅ Look for errors in message area
- ✅ Clear chat and try again
- ✅ Restart Obsidian

**Regeneration not working**
- ✅ Ensure chat history is loaded
- ✅ Check API connection
- ✅ Try different message
- ✅ Look for console errors

**Links not clickable**
- ✅ Ensure recent version (v2.1.0+)
- ✅ Links in format `[[Note Name]]` should be clickable
- ✅ Enable "Enable Obsidian Links" if relevant

**Live/Source mode toggle missing**
- ✅ Update to latest version (v2.1.0+)
- ✅ Look for toggle at top of chat interface
- ✅ Restart Obsidian if just updated

#### Performance Issues

**Slow responses**
- ✅ Check internet speed
- ✅ Try different provider/model
- ✅ Use local model via Ollama for speed
- ✅ Check Performance Dashboard for active streams
- ✅ Reduce context size

**High memory usage**
- ✅ Clear old chat history
- ✅ Reduce max sessions in settings
- ✅ Restart Obsidian periodically
- ✅ Check for memory leaks in Performance Dashboard

**Plugin lag or freezing**
- ✅ Disable other plugins temporarily to test
- ✅ Check console for errors
- ✅ Reduce agent max iterations
- ✅ Disable debug mode
- ✅ Report issue on GitHub with reproduction steps

### Debug Mode

Enable comprehensive logging for troubleshooting:

1. **Enable Debug Mode:**
   - Settings → UI Behavior Settings → Debug Mode ✅

2. **What it logs:**
   - All AI requests/responses to `ai-calls/` folder with timestamps
   - Stream lifecycle events to console
   - Tool execution traces
   - Message processing pipeline
   - Context assembly details

3. **Use Debug Commands:**
   - "Debug AI Streams" - Show active stream information
   - Console (`Ctrl/Cmd+Shift+I`) - Real-time logs
   - Performance Dashboard - Metrics and diagnostics

4. **Reading AI Call Logs:**
   - Location: `vault/.obsidian/plugins/ai-assistant-for-obsidian/ai-calls/`
   - Format: `ai-call-[timestamp].txt`
   - Contains: Full request, provider, model, parameters, response



## License

This project is licensed under the **MIT License**.

See the [LICENSE](LICENSE) file for full details.

### What This Means

✅ **You CAN:**
- Use this plugin for personal or commercial purposes
- Modify and adapt the code
- Distribute your modifications
- Include in other projects

✅ **You MUST:**
- Include the original copyright notice
- Include the MIT License text

❌ **No Warranty:**
- Software provided "as is"
- No liability for damages or issues

---

## Support & Community

### Get Help
- 📖 Read the [README](#) (you are here!)
- 🐛 Check [Issues](https://github.com/srijrao/obsidianpluginattempt/issues)
- 💬 Start a [Discussion](https://github.com/srijrao/obsidianpluginattempt/discussions)

### Stay Updated
- ⭐ Star the repository for updates
- 👁️ Watch for new releases
- 📢 Follow release notes for new features

### Show Support
If you find this plugin helpful:
- ⭐ **Star the repository** on GitHub
- 🐛 **Report bugs** you encounter
- 💡 **Suggest features** you'd like to see
- 🤝 **Contribute** code or documentation
- 📢 **Share** with other Obsidian users
- ☕ **Sponsor** development (if available)

### Acknowledgments

Built with:
- [Obsidian Plugin API](https://github.com/obsidianmd/obsidian-api)
- [OpenAI SDK](https://github.com/openai/openai-node)
- [Anthropic SDK](https://github.com/anthropics/anthropic-sdk-typescript)
- [Google Generative AI](https://github.com/google/generative-ai-js)
- TypeScript, esbuild, Jest

---

**Version:** 2.1.0  
**Author:** [srijrao](https://github.com/srijrao)  
**Repository:** [github.com/srijrao/obsidianpluginattempt](https://github.com/srijrao/obsidianpluginattempt)  
**Last Updated:** October 2025

---

*Made with ❤️ for the Obsidian community*
