import { getAllToolClasses, getToolMetadata } from './components/agent/tools/toolcollect';

export const DEFAULT_TITLE_PROMPT = "You are a title generator. You will give succinct titles that do not contain backslashes, forward slashes, or colons. Only generate a title as your response.";

export const DEFAULT_SUMMARY_PROMPT = "Summarize the note content in 1-2 sentences, focusing on the main ideas and purpose.";

export const DEFAULT_GENERAL_SYSTEM_PROMPT = "You are a helpful assistant in an Obsidian Vault.";

export const getDynamicToolList = (enabledTools?: Record<string, boolean>) => {
    if ((window as any).aiAssistantPlugin && typeof (window as any).aiAssistantPlugin.debugLog === 'function') {
        (window as any).aiAssistantPlugin.debugLog('debug', '[promptConstants] getDynamicToolList called', { enabledTools });
    }
    
    const toolMetadata = getToolMetadata();
    return toolMetadata
        .filter(tool => tool.name === 'thought' || !enabledTools || enabledTools[tool.name] !== false)
        .map(tool => ({
            name: tool.name,
            description: tool.description,
            parameters: tool.parameters,
            parameterDescriptions: tool.parameterDescriptions
        }));
};

export const AGENT_SYSTEM_PROMPT_TEMPLATE = `
- AI assistant for Obsidian Vault with vault management tools.
- ALWAYS use 'thought' tool first to plan, then at end to summarize.
- Use relative paths from vault root.
- Respond with JSON objects only (consecutive, not array format).

Available tools:
{{TOOL_DESCRIPTIONS}}

When using tools, respond ONLY with JSON objects using this parameter framework:

Multiple tool calls (no commas between objects):
{
  "action": "tool1",
  "parameters": { /* ... */ },
  "requestId": "..."
}
{
  "action": "tool2",
  "parameters": { /* ... */ },
  "requestId": "..."
}
`;

export function buildAgentSystemPrompt(enabledTools?: Record<string, boolean>, customTemplate?: string) {
    if ((window as any).aiAssistantPlugin && typeof (window as any).aiAssistantPlugin.debugLog === 'function') {
        (window as any).aiAssistantPlugin.debugLog('debug', '[promptConstants] buildAgentSystemPrompt called', { enabledTools, customTemplate });
    }
    const toolList = getDynamicToolList(enabledTools);
    const toolDescriptions = toolList.map((tool, idx) => {
        return `${idx + 1}. ${tool.name} - ${tool.description}`;
    }).join('\n');
    const template = customTemplate || AGENT_SYSTEM_PROMPT_TEMPLATE;
    return template.replace('{{TOOL_DESCRIPTIONS}}', toolDescriptions);
}

export const AGENT_SYSTEM_PROMPT = buildAgentSystemPrompt();

export const DEFAULT_YAML_SYSTEM_MESSAGE =
    "You are an assistant that generates YAML attribute values for Obsidian notes. " +
    "Read the note and generate a value for the specified YAML field. " +
    "Only output the value, not the key or extra text.";
