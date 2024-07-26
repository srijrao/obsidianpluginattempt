# obsidianpluginattempt
Obsidian Plugin for LLM Integration with Customizable Settings

# obsidianpluginattempt

This plugin integrates LLMs into your Obsidian workflow, allowing you to generate AI-powered completions directly within your notes.


## Features

- Generate AI completions using OpenAI's models
- Customizable system message and model settings
- Stream responses for real-time interaction
- Ability to include current date in system messages
- Easy-to-use interface for adjusting model parameters

## Installation

1. Download the latest release from the GitHub repository
2. Extract the zip file in your Obsidian plugins folder: `<vault>/.obsidian/plugins/`
3. Reload Obsidian
4. Enable the plugin in Settings -> Community Plugins

## Usage

1. Set up your OpenAI API key in the plugin settings
2. Use the ribbon icon or command palette to open Model Settings
3. Customize your model settings as desired
4. In any note, select text or place your cursor at the end of a line
5. Use the command palette to run "Get OpenAI Completion"
6. The AI-generated text will be inserted into your note

## Commands

- **Get OpenAI Completion**: Generate AI text based on the current selection or line
- **End OpenAI Stream**: Stop the current AI text generation
- **Show Model Settings**: Open the Model Settings view

## Settings

- **API Key**: Your OpenAI API key
- **System Message**: The initial prompt for the AI
- **Include Date with System Message**: Option to add the current date to the system message
- **Model**: Choose from available OpenAI models
- **Temperature**: Adjust the randomness of the AI's output (0-1)
- **Max Tokens**: Set the maximum length of the AI's response

## Development

To set up the development environment:

1. Clone this repository
2. Run `npm install` to install dependencies
3. Run `npm run dev` to start compilation in watch mode

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

[MIT License](LICENSE)
