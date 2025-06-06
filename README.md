# AI Assistant for Obsidian

A powerful AI assistant plugin for Obsidian, designed to enhance your note-taking workflow with advanced language model capabilities. Supports multiple providers (OpenAI, Anthropic, Gemini, Ollama, and more) and offers a chat interface, context-aware commands, and customizable prompts.

## Features

- **Multi-provider support:** Easily switch between OpenAI, Anthropic, Gemini, Ollama, and other LLM providers.
- **Chat interface:** Interact with AI directly inside Obsidian using a modern chat UI.
- **Context-aware commands:** Run AI commands on selected text, entire notes, or vault-wide.
- **Customizable prompts:** Create and manage your own prompt templates for various tasks.
- **Session management:** Save, load, and manage chat sessions and histories.
- **Model settings:** Fine-tune model parameters and preferences per provider.
- **Secure API key storage:** API keys are stored securely within Obsidian settings.

## Installation

1. Download the latest release from the [GitHub Releases](https://github.com/your-repo/releases) page or clone this repository.
2. Place the plugin folder (`ai-assistant-for-obsidian`) into your Obsidian vault's `.obsidian/plugins/` directory.
3. Enable the plugin in Obsidian's Settings > Community Plugins.

## Usage

- Open the command palette (Ctrl+P) and search for "AI Assistant" commands.
- Use the chat panel to interact with the AI, ask questions, or generate content.
- Select text in a note and run context-aware commands for summarization, rewriting, or custom prompts.
- Manage chat sessions and view chat history from the plugin sidebar.

## Configuration

1. Go to Settings > AI Assistant for Obsidian.
2. Choose your preferred AI provider and enter the required API key.
3. Adjust model parameters (temperature, max tokens, etc.) as needed.
4. Create or edit custom prompts for your workflow.

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
- See `REFACTORING.md` for architecture notes.

## Contributing

Contributions are welcome! Please open issues or pull requests for bug fixes, new features, or improvements.

## License

This project is licensed under the MIT License. See the `LICENSE` file for details.
