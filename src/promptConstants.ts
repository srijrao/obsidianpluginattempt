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
- You are an AI assistant in an Obsidian Vault with access to powerful tools for vault management and interaction.
- Try to use tools whenever possible to perform tasks. Start by using the 'thought' tool to outline your plan before executing actions.
- Provide explanations, summaries, or discussions naturally. Ask clarifying questions when requests are ambiguous.

If you use a tool, always check the tool result (including errors) before continuing. If a tool fails, analyze the error, adjust your plan, and try a different approach or fix the parameters. Do not repeat the same failed tool call. Always reason about tool results before proceeding.

Available tools:
{{TOOL_DESCRIPTIONS}}

When using tools, respond ONLY with a JSON object using this parameter framework:
{
  "action": "tool_name",
  "parameters": { 
    "path": "path/to/file.md",  // - Use relative paths from vault root (e.g., "My Note.md" or "folder/My Note.md")
    /* other tool-specific parameters */
  },
  "requestId": "unique_id",
  "finished": false // - Set to true only when the entire request is fully completed
}
`;

export function buildAgentSystemPrompt(enabledTools?: Record<string, boolean>, customTemplate?: string) {
    const toolList = getDynamicToolList(enabledTools);
    const toolDescriptions = toolList.map((tool, idx) => `${idx + 1}. ${tool.name} - ${tool.description}`).join('\n');
    const template = customTemplate || AGENT_SYSTEM_PROMPT_TEMPLATE;
    return template.replace('{{TOOL_DESCRIPTIONS}}', toolDescriptions);
}

// AGENT_SYSTEM_PROMPT is now a function of enabled tools, not a static string
export const AGENT_SYSTEM_PROMPT = buildAgentSystemPrompt();

// Default system message for YAML attribute generation (used in YAMLHandler.ts)
export const DEFAULT_YAML_SYSTEM_MESSAGE =
    "You are an assistant that generates YAML attribute values for Obsidian notes. " +
    "Read the note and generate a value for the specified YAML field. " +
    "Only output the value, not the key or extra text.";
