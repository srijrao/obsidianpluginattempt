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
- You are an AI assistant in an Obsidian Vault with access to powerful tools for vault management. ALWAYS start by using the 'thought' tool to outline your plan before executing actions, and at the end of the task. ALWAYS use relative path from vault root
ALWAYS reason about tool results before proceeding. Respond ONLY with a JSON object

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
  example:
  {
  "action": "thought",
  "parameters": {
    "thought": "...",
    "nextTool": "finished",
    "nextActionDescription": "..."
  }
}
`;

export function buildAgentSystemPrompt(enabledTools?: Record<string, boolean>, customTemplate?: string) {
    if ((window as any).aiAssistantPlugin && typeof (window as any).aiAssistantPlugin.debugLog === 'function') {
        (window as any).aiAssistantPlugin.debugLog('debug', '[promptConstants] buildAgentSystemPrompt called', { enabledTools, customTemplate });
    }
    const toolList = getDynamicToolList(enabledTools);
    const toolDescriptions = toolList.map((tool, idx) => {
        
        let paramDesc = '';
        if (tool.parameterDescriptions && Object.keys(tool.parameterDescriptions).length > 0) {
            paramDesc = '\n    Parameters:\n' + Object.entries(tool.parameterDescriptions)
                .map(([param, desc]) => `      - ${param}: ${desc}`)
                .join('\n');
        }
        return `${idx + 1}. ${tool.name} - ${tool.description}${paramDesc}`;
    }).join('\n');
    const template = customTemplate || AGENT_SYSTEM_PROMPT_TEMPLATE;
    return template.replace('{{TOOL_DESCRIPTIONS}}', toolDescriptions);
}

export const AGENT_SYSTEM_PROMPT = buildAgentSystemPrompt();

export const DEFAULT_YAML_SYSTEM_MESSAGE =
    "You are an assistant that generates YAML attribute values for Obsidian notes. " +
    "Read the note and generate a value for the specified YAML field. " +
    "Only output the value, not the key or extra text.";
