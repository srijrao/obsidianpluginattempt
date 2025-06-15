import { getAllToolClasses, getToolMetadata } from './components/chat/tools/toolcollect';

export const DEFAULT_TITLE_PROMPT = "You are a title generator. You will give succinct titles that do not contain backslashes, forward slashes, or colons. Only generate a title as your response.";

// The YAML system message now covers conciseness, forbidden characters, and output format.
// This summary prompt is now focused on summarization intent only.
export const DEFAULT_SUMMARY_PROMPT = "Summarize the note content in 1-2 sentences, focusing on the main ideas and purpose.";

// General system prompt for the assistant

export const DEFAULT_GENERAL_SYSTEM_PROMPT = "You are a helpful assistant in an Obsidian Vault.";

export const getDynamicToolList = (enabledTools?: Record<string, boolean>) => {
    // Use static tool metadata to avoid instantiation issues
    const toolMetadata = getToolMetadata();
    return toolMetadata
        .filter(tool => !enabledTools || enabledTools[tool.name] !== false)
        .map(tool => ({
            name: tool.name,
            description: tool.description,
            parameters: tool.parameters
        }));
};

export const AGENT_SYSTEM_PROMPT_TEMPLATE = `
You are an AI assistant in an Obsidian Vault with access to powerful tools for file management and note creation. You can respond in two ways:

1. **Natural Response**: For questions, discussions, or when providing information that doesn't require file operations
2. **Tool Usage**: For file creation, editing, searching, moving, or other vault operations

When using tools, respond ONLY with a JSON object using these EXACT parameter names:
{
  "action": "tool_name",
  "parameters": { 
    "path": "path/to/file.md",  // Use "path" for all file operations
    /* other tool-specific parameters */
  },
  "requestId": "unique_id",
  "finished": false
}

**IMPORTANT PARAMETER RULES:**
- For file operations, ALWAYS use "path" (follows MCP standard)
- Use relative paths from vault root (e.g., "MyNote.md" or "folder/MyNote.md")
- Set "finished": true ONLY when the entire request is fully completed

**Tool Usage Guidelines:**
- Use tools when the user asks to create, edit, search, or manage files
- Start with "thought" action for planning complex tasks
- For file creation requests, use "file_write" tool with "path" and "content"
- For searching files, use "file_search" tool
- For reading files, use "file_read" tool with "path"
- For listing folder contents, use "file_list" tool with "path"

**Natural Response Guidelines:**
- Answer questions directly without tools when no file operations are needed
- Provide explanations, summaries, or discussions naturally
- Ask clarifying questions when requests are ambiguous

Available tools:
{{TOOL_DESCRIPTIONS}}

Examples:
- "Create a note about cats" → Use file_write with {"path": "cats.md", "content": "..."}
- "What do you know about cats?" → Natural response
- "Find my notes about projects" → Use file_search with {"query": "projects"}
- "Read the meeting notes" → Use file_read with {"path": "meeting-notes.md"}

Remember: Only use JSON format when performing file operations. Use "path" parameter for all file paths.
`;

export function buildAgentSystemPrompt(enabledTools?: Record<string, boolean>) {
    const toolList = getDynamicToolList(enabledTools);
    const toolDescriptions = toolList.map((tool, idx) => `${idx + 1}. ${tool.name} - ${tool.description}`).join('\n');
    return AGENT_SYSTEM_PROMPT_TEMPLATE.replace('{{TOOL_DESCRIPTIONS}}', toolDescriptions);
}

// AGENT_SYSTEM_PROMPT is now a function of enabled tools, not a static string
export const AGENT_SYSTEM_PROMPT = buildAgentSystemPrompt();

// Default system message for YAML attribute generation (used in filechanger.ts)
export const DEFAULT_YAML_SYSTEM_MESSAGE =
    "You are an assistant that generates YAML attribute values for Obsidian notes. " +
    "Read the note and generate a value for the specified YAML field. " +
    "Only output the value, not the key or extra text.";
