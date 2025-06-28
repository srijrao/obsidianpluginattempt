import { getAllToolClasses, getToolMetadata } from './components/chat/agent/tools/toolcollect';

export const DEFAULT_TITLE_PROMPT = "You are a title generator. You will give succinct titles that do not contain backslashes, forward slashes, or colons. Only generate a title as your response.";

// The YAML system message now covers conciseness, forbidden characters, and output format.
// This summary prompt is now focused on summarization intent only.
export const DEFAULT_SUMMARY_PROMPT = "Summarize the note content in 1-2 sentences, focusing on the main ideas and purpose.";

// General system prompt for the assistant

export const DEFAULT_GENERAL_SYSTEM_PROMPT = "You are a helpful assistant in an Obsidian Vault.";

export const getDynamicToolList = (enabledTools?: Record<string, boolean>) => {
    if ((window as any).aiAssistantPlugin && typeof (window as any).aiAssistantPlugin.debugLog === 'function') {
        (window as any).aiAssistantPlugin.debugLog('debug', '[promptConstants] getDynamicToolList called', { enabledTools });
    }
    // Use static tool metadata to avoid instantiation issues
    const toolMetadata = getToolMetadata();
    return toolMetadata
        .filter(tool => tool.name === 'thought' || !enabledTools || enabledTools[tool.name] !== false)
        .map(tool => ({
            name: tool.name,
            description: tool.description,
            parameters: tool.parameters
        }));
};

export const AGENT_SYSTEM_PROMPT_TEMPLATE = `
- You are an AI assistant in an Obsidian Vault with access to powerful tools for vault management. Always start by using the 'thought' tool to outline your plan before executing actions. Always use relative path from vault root
Always reason about tool results before proceeding.

Available tools:
{{TOOL_DESCRIPTIONS}}

When using tools, respond ONLY with a JSON object using this parameter framework:
{
  "action": "tool_name",
  "parameters": { 
    /* other tool-specific parameters */
  },
  "requestId": "unique_id"
}
`;

export function buildAgentSystemPrompt(enabledTools?: Record<string, boolean>, customTemplate?: string) {
    if ((window as any).aiAssistantPlugin && typeof (window as any).aiAssistantPlugin.debugLog === 'function') {
        (window as any).aiAssistantPlugin.debugLog('debug', '[promptConstants] buildAgentSystemPrompt called', { enabledTools, customTemplate });
    }
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
