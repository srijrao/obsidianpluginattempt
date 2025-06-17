# AI Assistant for Obsidian

A feature-rich AI assistant plugin for Obsidian, designed to supercharge your note-taking and knowledge workflows with advanced language models and automation tools. Seamlessly chat with AI, automate tasks, and interact with your vault using multiple providers—all from within Obsidian.

## Key Features

- **Multi-Provider Support:** Use OpenAI (ChatGPT, GPT-4), Anthropic (Claude), Google Gemini, Ollama (local models), and more. Easily switch between providers and models.
- **Modern Chat Interface:** Chat with AI in a dedicated sidebar or panel, with real-time streaming responses and markdown rendering.
- **Context-Aware Commands:** Run AI actions on selected text, entire notes, or across your vault. Summarize, rewrite, or generate content contextually.
- **Agent Mode & Tool Use:** Enable “Agent Mode” to let the AI use built-in tools (file search, read/write, diff, move, rename, etc.) for advanced automation and reasoning.
- **Custom Prompts & Templates:** Create, edit, and manage your own prompt templates for any workflow.
- **Session & History Management:** Save, load, and revisit chat sessions. View and manage chat history directly in the plugin.
- **Model Settings & Testing:** Fine-tune model parameters (temperature, max tokens, etc.) and test API connections per provider.
- **Secure API Key Storage:** API keys are stored securely in your Obsidian settings.
- **Context Notes & Referencing:** Optionally include the current note, context notes, and chat history in AI prompts for more relevant responses.
- **YAML Attribute Commands:** Generate and insert YAML frontmatter attributes (like title and summary) using AI.
- **Highly Extendable:** Add new providers or tools via the `providers/` and `components/chat/tools/` directories.

## Installation

1. Download the latest release from the [GitHub Releases](https://github.com/your-repo/releases) page or clone this repository.
2. Place the plugin folder (`ai-assistant-for-obsidian`) into your vault’s `.obsidian/plugins/` directory.
3. Enable the plugin in Obsidian’s Settings → Community Plugins.

## Usage

- Open the command palette (Ctrl+P) and search for “AI Assistant” commands.
- Use the chat panel to interact with the AI, ask questions, or generate content.
- Select text in a note and run context-aware commands for summarization, rewriting, or custom prompts.
- Enable “Agent Mode” to let the AI use tools for file operations and advanced tasks.
- Manage chat sessions and view chat history from the plugin sidebar.

### Example: Summarize a Note
1. Open a note and select the text you want to summarize.
2. Open the command palette and run `AI Assistant: Summarize Selection`.
3. The summary will appear in the chat panel or be inserted into your note.

### Example: Use Agent Mode for Automation
1. Enable Agent Mode from the chat panel or plugin settings.
2. Ask the AI to "Find all notes mentioning 'project X' and summarize them".
3. The AI will use built-in tools to search, read, and summarize relevant notes.

### Example: Generate YAML Frontmatter
1. Open a note and run `AI Assistant: Generate Note Title` or `Generate Note Summary` from the command palette.
2. The plugin will insert or update the YAML frontmatter with AI-generated content.

## Agent Mode & Tools

When Agent Mode is enabled, the AI can use a set of built-in tools to:
- Search for files and content in your vault
- Read, write, move, and rename files
- Show file diffs
- List files in folders
- Generate thoughts or plans before acting

This allows for advanced workflows, such as multi-step reasoning, automated refactoring, or batch operations. You can control which tools are enabled in the plugin settings.

## Configuration

1. Go to Settings → AI Assistant for Obsidian.
2. Choose your preferred AI provider and enter the required API key.
3. Adjust model parameters (temperature, max tokens, etc.) as needed.
4. Create or edit custom prompts and context note settings for your workflow.

## Supported Providers

- OpenAI (ChatGPT, GPT-4, etc.)
- Anthropic (Claude)
- Google Gemini
- Ollama (local models)
- Extendable via the `providers/` directory

## Development

- Clone the repository and run `npm install` to install dependencies.
- Use `npm run build` to compile the plugin (uses esbuild).
- Source code is in the `src/` and `providers/` directories.

## Contributing

Contributions are welcome! Please open issues or pull requests for bug fixes, new features, or improvements.

## License

This project is licensed under the MIT License. See the `LICENSE` file for details.
