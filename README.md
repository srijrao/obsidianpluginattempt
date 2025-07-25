# AI Assistant for Obsidian

A feature-rich AI assistant plugin for Obsidian, designed to supercharge your note-taking and knowledge workflows with advanced language models and automation tools. Seamlessly chat with AI, automate tasks, and interact with your vault using multiple providers—all from within Obsidian.

## Table of Contents

- [Key Features](#key-features)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Complete Function Reference](#complete-function-reference)
  - [Command Palette Commands](#command-palette-commands)
  - [Chat Interface](#chat-interface)
  - [Agent Mode & Tools](#agent-mode--tools)
  - [Vector Store & Semantic Search](#vector-store--semantic-search)
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

- **Multi-Provider Support:** Use OpenAI (ChatGPT, GPT-4), Anthropic (Claude), Google Gemini, Ollama (local models), and more. Easily switch between providers and models in plugin settings.
- **Modern Chat Interface:** Chat with AI in a dedicated sidebar or panel, with real-time streaming responses and markdown rendering.
- **Context-Aware Commands:** Run AI actions on selected text, entire notes, or across your vault. Summarize, rewrite, or generate content contextually.
- **Agent Mode & Tool Use:** Enable "Agent Mode" to let the AI use built-in tools for automation and reasoning. 10 powerful tools including file operations, search, and planning.
- **Vector Store & Semantic Search:** 12 commands for embedding notes and performing semantic searches across your vault.
- **Custom Prompts & Templates:** Create, edit, and manage your own prompt templates for any workflow.
- **Session & History Management:** Save, load, and revisit chat sessions. View and manage chat history directly in the plugin.
- **Model Settings & Testing:** Fine-tune model parameters (temperature, max tokens, etc.), test API connections, and refresh available models from the settings UI.
- **Secure API Key Storage:** API keys are stored securely in your Obsidian settings.
- **Context Notes & Referencing:** Optionally include the current note, context notes, and chat history in AI prompts for more relevant responses.
- **YAML Attribute Commands:** Generate and insert YAML frontmatter attributes (like title and summary) using AI.
- **Performance Dashboard:** Monitor plugin performance and active streams.
- **Highly Extendable:** Add new providers or tools via the `providers/` and `components/` directories.

## Installation

1. Download the latest release from the [GitHub Releases](https://github.com/your-repo/releases) page or clone this repository.
2. Place the plugin folder (`ai-assistant-for-obsidian`) into your vault's `.obsidian/plugins/` directory.
3. If installing from source, run `npm install` and `npm run build` in the plugin folder to compile the plugin (requires Node.js and npm).
4. Enable the plugin in Obsidian's Settings → Community Plugins.

## Quick Start

1. **Configure a Provider:** Go to Settings → AI Assistant for Obsidian and add your API key for your preferred provider (OpenAI, Anthropic, etc.).
2. **Open Chat:** Use `Ctrl+P` → "Show AI Chat" to open the chat interface.
3. **Test Basic Functionality:** Try "Get AI Completion" on selected text in any note.
4. **Enable Agent Mode:** In settings, enable Agent Mode to unlock advanced automation capabilities.
5. **Try Semantic Search:** Use "Embed All Notes" then "Semantic Search" to find related content.

## Complete Function Reference

### Command Palette Commands

Access all commands via `Ctrl+P` (or `Cmd+P` on Mac) and search for "AI Assistant":

#### View & Interface Commands
- **Show AI Settings** - Open the AI settings and configuration panel
- **Show AI Chat** - Open the AI chat interface in the sidebar
- **Open Performance Dashboard** - Monitor plugin performance and active streams

#### AI Completion & Streaming
- **Get AI Completion** - Generate AI response based on selected text or current note content
- **End AI Stream** - Stop any active AI streaming operations
- **Debug AI Streams** - Display debug information about active AI streams (debug mode only)

#### Note Operations
- **Copy Active Note Name** - Copy the current note's name as a wiki link `[[Note Name]]` to clipboard
- **Insert Chat Start String** - Insert the configured chat start string at cursor position
- **Load Chat Note into Chat** - Parse the current note as chat messages and load into chat interface
- **Generate Note Title** - Use AI to generate a title for the current note

#### Context Management
- **Clear Context Notes** - Remove all notes from the context notes setting
- **Copy Context Notes to Clipboard** - Copy the current context notes configuration to clipboard
- **Add Current Note to Context Notes** - Add the active note to the context notes list

#### Settings Toggles
- **Toggle Enable Obsidian Links** - Enable/disable Obsidian-style link processing in AI responses
- **Toggle Enable Context Notes** - Enable/disable automatic inclusion of context notes in AI queries

#### YAML Attribute Generation
Dynamic commands based on your configuration:
- **Generate YAML: summary** - Generate and insert a summary in YAML frontmatter (default)
- **Custom YAML commands** - Additional commands based on your `yamlAttributeGenerators` settings

### Chat Interface

The chat interface provides a modern, interactive way to communicate with AI:

#### Features
- **Real-time Streaming:** See AI responses as they're generated
- **Markdown Rendering:** Full markdown support including code blocks, lists, and formatting
- **Session Management:** Save, load, and manage multiple chat sessions
- **Tool Rich Display:** Interactive cards showing agent tool executions with expandable details
- **Message History:** Persistent chat history across Obsidian sessions
- **Context Integration:** Automatic inclusion of current note and context notes (when enabled)

#### Chat Controls
- **Send Message:** Type and press Enter or click Send
- **Stop Generation:** Click Stop button during AI response generation
- **Clear Chat:** Clear current conversation
- **Save Session:** Save current chat as a named session
- **Load Session:** Load a previously saved chat session
- **Export Chat:** Export conversation to a note

### Agent Mode & Tools

When Agent Mode is enabled, the AI can use powerful tools to interact with your vault and perform complex tasks.

#### Available Tools

1. **file_search** - Search for files within the vault
   - Search by filename, content, or file type
   - Support for regex patterns
   - Filter by markdown, images, or all files
   - Configurable result limits

2. **file_read** - Read the contents of files
   - Read any file in your vault
   - Returns full file content
   - Supports all text-based file types

3. **file_write** - Create or modify files
   - Create new files with specified content
   - Modify existing files
   - Automatic backup creation
   - Directory creation as needed

4. **file_diff** - Show differences between file versions
   - Compare current file with previous versions
   - Highlight changes and modifications
   - Useful for tracking edits

5. **file_move** - Move or rename files
   - Rename files and folders
   - Move files between directories
   - Update internal links automatically

6. **file_list** - List directory contents
   - Browse vault structure
   - List files and folders
   - Recursive directory listing

7. **file_delete** - Delete files safely
   - Remove files with backup creation
   - Confirmation prompts for safety
   - Recoverable deletions

8. **vault_tree** - Display vault structure
   - Show complete vault hierarchy
   - Understand folder organization
   - Navigate vault structure

9. **thought** - AI reasoning and planning
   - Record AI reasoning steps
   - Plan multi-step operations
   - Track progress through complex tasks

10. **get_user_feedback** - Request user input
    - Ask for clarification during tasks
    - Get user preferences and decisions
    - Interactive task execution

#### Agent Mode Configuration
- **Max Tool Calls:** Limit the number of tool executions per session
- **Timeout:** Set maximum time for tool operations
- **Max Iterations:** Control how many reasoning loops the agent can perform
- **Tool Selection:** Enable/disable specific tools based on your needs

### Vector Store & Semantic Search

The plugin includes a powerful semantic search system using vector embeddings:

#### Embedding Commands
- **Embed Currently Open Note** - Create embedding for the active note
- **Embed All Notes** - Process all notes in your vault for semantic search
- **Cancel Embedding Process** - Stop ongoing embedding operations
- **Show Notes Missing Embeddings** - Identify notes that haven't been embedded yet

#### Search Commands
- **Semantic Search** - Search for semantically similar content using natural language
- **Semantic Search with Selection** - Use selected text as search query for similar content

#### Management Commands
- **Vector Store Statistics** - View embedding counts and coverage statistics
- **Detailed Vector Store Information** - Comprehensive statistics and recommendations
- **Clear All Embeddings** - Remove all stored embeddings to start fresh

#### Hybrid Vector Management
- **Hybrid Vector: Force Backup** - Manually backup vector database
- **Hybrid Vector: Force Restore** - Restore vector database from backup
- **Hybrid Vector: Status & Statistics** - View hybrid vector system status

#### Configuration Options
- **Enable Semantic Context:** Toggle semantic search integration
- **Max Semantic Context Chunks:** Control how many similar chunks to include
- **Similarity Threshold:** Set minimum similarity score for results
- **Folder Filtering:** Include/exclude specific folders from embedding

### YAML Attribute Generation

Generate and manage YAML frontmatter attributes using AI:

#### Default Commands
- **Generate Note Title** - Create titles with multiple output modes:
  - Clipboard: Copy generated title
  - Replace Filename: Rename the note file
  - Metadata: Insert into YAML frontmatter

#### Custom YAML Generators
Configure custom YAML attribute generators in settings:
- **Attribute Name:** The YAML field name (e.g., "summary", "tags", "category")
- **Prompt:** The AI prompt for generating the attribute value
- **Output Mode:** Clipboard or metadata insertion
- **Command Name:** Custom command name in the command palette

#### Example Configurations
```yaml
# Example custom generators
- attributeName: "summary"
  prompt: "Generate a concise summary of this note"
  outputMode: "metadata"
  commandName: "Generate YAML: summary"

- attributeName: "tags"
  prompt: "Generate relevant tags for this content"
  outputMode: "metadata"
  commandName: "Generate YAML: tags"
```

## Configuration

### Provider Setup

#### OpenAI Configuration
1. Go to Settings → AI Assistant for Obsidian → Provider Configuration → OpenAI
2. Enter your OpenAI API key
3. Optionally set a custom base URL for alternative endpoints
4. Select your preferred model (GPT-4, GPT-3.5-turbo, etc.)
5. Click "Test API Key" to verify connection

#### Anthropic (Claude) Configuration
1. Navigate to Provider Configuration → Anthropic
2. Enter your Anthropic API key
3. Choose your preferred Claude model
4. Test the connection

#### Google Gemini Configuration
1. Go to Provider Configuration → Google Gemini
2. Enter your Google AI API key
3. Select the Gemini model version
4. Verify the setup with the test button

#### Ollama (Local AI) Configuration
1. Install and run Ollama on your local machine
2. Navigate to Provider Configuration → Ollama
3. Set the server URL (default: http://localhost:11434)
4. Select from available local models
5. Test the connection

### Settings Overview

#### AI Model Settings
- **Provider:** Choose between OpenAI, Anthropic, Gemini, or Ollama
- **Model Selection:** Pick specific models from your chosen provider
- **Temperature:** Control randomness in AI responses (0.0 = deterministic, 1.0 = creative)
- **Max Tokens:** Set maximum response length
- **System Message:** Customize the AI's behavior and personality
- **Streaming:** Enable real-time response streaming

#### Context & Reference Settings
- **Reference Current Note:** Include active note content in AI queries
- **Enable Context Notes:** Automatically include specified context notes
- **Context Notes:** List of notes to include as context (wiki links)
- **Expand Linked Notes:** Recursively include linked notes
- **Max Link Expansion Depth:** Control how deep to follow note links

#### Chat & Session Settings
- **Chat Separator:** String used to separate messages in exported chats
- **Chat Start/End Strings:** Markers for chat sections in notes
- **Max Sessions:** Maximum number of saved chat sessions
- **Auto Save Sessions:** Automatically save chat sessions
- **Chat Note Folder:** Folder for saving chat exports

#### Agent Mode Settings
- **Enable Agent Mode:** Allow AI to use tools for automation
- **Max Tool Calls:** Limit tool executions per session
- **Timeout:** Maximum time for tool operations
- **Max Iterations:** Control reasoning loop depth
- **Custom Agent System Message:** Override default agent instructions

#### Vector Store Settings
- **Enable Semantic Context:** Use vector embeddings for context
- **Max Semantic Context Chunks:** Number of similar chunks to include
- **Similarity Threshold:** Minimum similarity score for inclusion
- **Embedding Folder Filter:** Include/exclude specific folders

#### UI Behavior Settings
- **Collapse Old Reasoning:** Auto-collapse reasoning in older messages
- **Show Completion Notifications:** Display notifications when tasks complete
- **Include Reasoning in Exports:** Add AI reasoning to exported content

## Usage Examples

### Basic AI Completion
1. Select text in any note
2. Open command palette (`Ctrl+P`)
3. Run "AI Assistant: Get AI Completion"
4. The AI response will be inserted below your selection

### Chat Conversation
1. Open chat with "AI Assistant: Show AI Chat"
2. Type your question or request
3. Press Enter or click Send
4. View the streaming response
5. Continue the conversation naturally

### Agent Mode Automation
1. Enable Agent Mode in settings
2. Open chat and ask: "Find all notes about project management and create a summary"
3. Watch as the AI:
   - Uses `file_search` to find relevant notes
   - Uses `file_read` to examine content
   - Uses `thought` to plan the summary
   - Provides a comprehensive response

### Semantic Search Workflow
1. Run "AI Assistant: Embed All Notes" (one-time setup)
2. Use "AI Assistant: Semantic Search"
3. Enter a natural language query like "productivity tips"
4. Review semantically similar content from across your vault

### YAML Generation
1. Open a note you want to enhance
2. Run "AI Assistant: Generate Note Title"
3. Choose output mode (clipboard, filename, or metadata)
4. For custom attributes, configure generators in settings

### Context Notes Setup
1. Add important reference notes to Context Notes in settings
2. Enable "Enable Context Notes"
3. All AI interactions will now include this context automatically
4. Use "Add Current Note to Context Notes" to quickly add the active note

## Troubleshooting

### Common Issues

#### API Key Problems
- **Error: Invalid API key**
  - Verify your API key is correct and active
  - Check if you have sufficient credits/quota
  - Use the "Test API Key" button in settings

#### Streaming Issues
- **Responses not streaming**
  - Check if streaming is enabled in settings
  - Try disabling and re-enabling streaming
  - Restart Obsidian if issues persist

#### Agent Mode Problems
- **Tools not working**
  - Ensure Agent Mode is enabled in settings
  - Check that specific tools aren't disabled
  - Verify file permissions for file operations

#### Vector Store Issues
- **Semantic search not working**
  - Run "Embed All Notes" first
  - Check Vector Store Statistics for embedding count
  - Verify OpenAI API key (required for embeddings)

#### Performance Issues
- **Slow responses**
  - Check your internet connection
  - Try a different model or provider
  - Use the Performance Dashboard to monitor

### Debug Mode
Enable debug mode in settings for detailed logging:
1. Go to Settings → AI Assistant → Debug Mode
2. Enable debug logging
3. Check the console (Ctrl+Shift+I) for detailed information
4. Use "Debug AI Streams" command for stream information

### Getting Help
- Check the console for error messages
- Use the Performance Dashboard to monitor plugin status
- Review settings for misconfigurations
- Test API connections using built-in test buttons

## Development

### Building from Source
```bash
# Clone the repository
git clone https://github.com/your-repo/ai-assistant-for-obsidian.git
cd ai-assistant-for-obsidian

# Install dependencies
npm install

# Build the plugin
npm run build

# For development with auto-rebuild
npm run dev
```

### Project Structure
- `src/` - Main source code
  - `components/` - UI components and commands
  - `providers/` - AI provider implementations
  - `services/` - Core services and utilities
  - `types/` - TypeScript type definitions
- `tests/` - Test files
- `docs/` - Documentation

### Adding New Providers
1. Create a new provider class in `providers/`
2. Implement the required interface methods
3. Add provider configuration to settings
4. Register the provider in the main plugin file

### Adding New Tools
1. Create a new tool class in `src/components/agent/tools/`
2. Implement the `Tool` interface
3. Add the tool to `toolcollect.ts`
4. Configure tool permissions in settings

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

### Guidelines
- Follow the existing code style
- Add documentation for new features
- Test your changes thoroughly
- Update the README if needed

## License

This project is licensed under the MIT License. See the `LICENSE` file for details.

---

## Support

If you find this plugin helpful, consider:
- ⭐ Starring the repository
- 🐛 Reporting bugs and issues
- 💡 Suggesting new features
- 🤝 Contributing code or documentation

For support and questions, please open an issue on GitHub.
