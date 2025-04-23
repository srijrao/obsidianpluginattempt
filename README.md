# obsidianpluginattempt
Obsidian Plugin for LLM Integration with Customizable Settings

This plugin integrates various LLM providers into your Obsidian workflow, allowing you to generate AI-powered completions directly within your notes.

## Features

- Generate AI completions using multiple providers (OpenAI, Anthropic, Gemini, Ollama)
- Customizable system message and model settings
- Stream responses for real-time interaction
- Ability to include current date and time in system messages
- Easy-to-use interface for adjusting model parameters

## Installation

1. Download the latest release from the GitHub repository.
2. Extract the zip file in your Obsidian plugins folder: `<vault>/.obsidian/plugins/`.
3. Reload Obsidian.
4. Enable the plugin in Settings -> Community Plugins.

## Usage

1. Set up your API key for the desired provider in the plugin settings.
2. Use the ribbon icon or command palette to open Model Settings.
3. Customize your model settings as desired.
4. In any note, select text or place your cursor at the end of a line.
5. Use the command palette to run "Get AI Completion."
6. The AI-generated text will be inserted into your note.

## Example Usage

1. Open a note in Obsidian.
2. Select some text or place your cursor at the end of a line.
3. Use the command palette (Ctrl+P or Cmd+P) to run "Get AI Completion."
4. The AI-generated text will be inserted into your note.

## Commands

- **Get AI Completion**: Generate AI text based on the current selection or line
- **End AI Stream**: Stop the current AI text generation
- **Show Model Settings**: Open the Model Settings view

## Settings

- **API Key**: Your API key for the selected provider (OpenAI, Anthropic, Gemini, Ollama)
- **System Message**: The initial prompt for the AI
- **Include Date with System Message**: Option to append the current date to the system message for better context
- **Include Time with System Message**: Option to append the current time along with the date to the system message
- **Provider**: Choose from supported providers (OpenAI, Anthropic, Gemini, Ollama)
- **Model**: Choose from available models for the selected provider
- **Temperature**: Adjust the randomness of the AI's output (0-1)
- **Max Tokens**: Set the maximum length of the AI's response

## Development

To set up the development environment:

1. Clone this repository.
2. Run `npm install` to install dependencies.
3. Run `npm run dev` to start compilation in watch mode.
4. Load the plugin in Obsidian by enabling "Developer Mode" in settings and loading the plugin folder.

## Troubleshooting

- **API Key Not Working**: Ensure your API key is correctly entered in the plugin settings.
- **Connection Issues**: Verify your internet connection and ensure the selected provider's service is operational.
- **Streaming Not Working**: Check if streaming is enabled in the plugin settings.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

[MIT License](LICENSE)
