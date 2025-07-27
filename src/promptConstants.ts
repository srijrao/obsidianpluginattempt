import { getAllToolClasses, getToolMetadata } from './components/agent/tools/toolcollect';

export const DEFAULT_TITLE_PROMPT = "You are a title generator. You will give succinct titles that do not contain backslashes, forward slashes, or colons. Only generate a title as your response.";

export const DEFAULT_SUMMARY_PROMPT = "Summarize the note content in 1-2 sentences, focusing on the main ideas and purpose.";

export const DEFAULT_GENERAL_SYSTEM_PROMPT = "You are a helpful assistant in an Obsidian Vault.";

export const getDynamicToolList = (enabledTools?: Record<string, boolean>, includeParameters: boolean = true) => {
    if ((window as any).aiAssistantPlugin && typeof (window as any).aiAssistantPlugin.debugLog === 'function') {
        (window as any).aiAssistantPlugin.debugLog('debug', '[promptConstants] getDynamicToolList called', { enabledTools, includeParameters });
    }
    
    const toolMetadata = getToolMetadata();
    return toolMetadata
        .filter(tool => tool.name === 'thought' || !enabledTools || enabledTools[tool.name] !== false)
        .map(tool => ({
            name: tool.name,
            description: tool.description,
            parameters: includeParameters ? tool.parameters : undefined,
            parameterDescriptions: includeParameters ? tool.parameterDescriptions : undefined
        }));
};

export const getToolParameters = (toolName: string) => {
    const toolMetadata = getToolMetadata();
    const tool = toolMetadata.find(t => t.name === toolName);
    return tool ? {
        parameters: tool.parameters,
        parameterDescriptions: tool.parameterDescriptions
    } : null;
};

export const AGENT_SYSTEM_PROMPT_TEMPLATE = `
You are an AI assistant in an Obsidian Vault with powerful tools for vault management.

WORKFLOW:
1. Use 'thought' tool first to plan your approach
2. Execute tools efficiently (multiple tools per response when logical)
3. Use 'thought' tool at completion to summarize results
4. Always use relative paths from vault root

EFFICIENCY GUIDELINES:
- Batch related operations (search → read → diff → move)
- Prefer file_diff over file_write for edits (shows preview)
- Use file_search before file_read when location unknown
- Use vault_tree for structure, file_list for specific directories
- Leverage auto-backup and .trash features for safety
- Handle errors gracefully and inform users of alternatives

Available tools:
{{TOOL_DESCRIPTIONS}}

IMPORTANT: When you want to use a tool other than 'thought', first use the 'thought' tool to specify which tool you want to use via the 'nextTool' parameter. Only after that will you receive the full parameter details for that specific tool.

Respond with consecutive JSON objects (no array wrapper):
{"action": "tool_name", "parameters": {...}, "requestId": "unique_id"}
`;

export const AGENT_SYSTEM_PROMPT_TEMPLATE_WITH_TOOL_DETAILS = `
You are an AI assistant in an Obsidian Vault with powerful tools for vault management.

WORKFLOW:
1. Use 'thought' tool first to plan your approach
2. Execute tools efficiently (multiple tools per response when logical)
3. Use 'thought' tool at completion to summarize results
4. Always use relative paths from vault root

EFFICIENCY GUIDELINES:
- Batch related operations (search → read → diff → move)
- Prefer file_diff over file_write for edits (shows preview)
- Use file_search before file_read when location unknown
- Use vault_tree for structure, file_list for specific directories
- Leverage auto-backup and .trash features for safety
- Handle errors gracefully and inform users of alternatives

Available tools:
{{TOOL_DESCRIPTIONS}}

{{REQUESTED_TOOL_DETAILS}}

Respond with consecutive JSON objects (no array wrapper):
{"action": "tool_name", "parameters": {...}, "requestId": "unique_id"}
`;

export function buildAgentSystemPrompt(enabledTools?: Record<string, boolean>, customTemplate?: string, requestedTool?: string) {
    if ((window as any).aiAssistantPlugin && typeof (window as any).aiAssistantPlugin.debugLog === 'function') {
        (window as any).aiAssistantPlugin.debugLog('debug', '[promptConstants] buildAgentSystemPrompt called', { enabledTools, customTemplate, requestedTool });
    }
    
    // If a specific tool is requested, use the detailed template
    const useDetailedTemplate = !!requestedTool;
    const template = customTemplate || (useDetailedTemplate ? AGENT_SYSTEM_PROMPT_TEMPLATE_WITH_TOOL_DETAILS : AGENT_SYSTEM_PROMPT_TEMPLATE);
    
    // Get tool list - include parameters only for thought tool in basic mode
    const toolList = getDynamicToolList(enabledTools, false); // Never include parameters in the main list
    
    const toolDescriptions = toolList.map((tool, idx) => {
        // Only show full parameters for the thought tool
        if (tool.name === 'thought') {
            const thoughtTool = getToolParameters('thought');
            let paramDesc = '';
            if (thoughtTool?.parameterDescriptions && Object.keys(thoughtTool.parameterDescriptions).length > 0) {
                paramDesc = '\n    Parameters:\n' + Object.entries(thoughtTool.parameterDescriptions)
                    .map(([param, desc]) => `      - ${param}: ${desc}`)
                    .join('\n');
            }
            return `${idx + 1}. ${tool.name} - ${tool.description}${paramDesc}`;
        } else {
            // Other tools show only description
            return `${idx + 1}. ${tool.name} - ${tool.description}`;
        }
    }).join('\n');
    
    let prompt = template.replace('{{TOOL_DESCRIPTIONS}}', toolDescriptions);
    
    // If a specific tool is requested, add its parameter details
    if (requestedTool && useDetailedTemplate) {
        const toolParams = getToolParameters(requestedTool);
        let toolDetails = '';
        if (toolParams?.parameterDescriptions && Object.keys(toolParams.parameterDescriptions).length > 0) {
            toolDetails = `\n\nRequested Tool Details:\n${requestedTool} - Parameters:\n` + 
                Object.entries(toolParams.parameterDescriptions)
                    .map(([param, desc]) => `  - ${param}: ${desc}`)
                    .join('\n');
        }
        prompt = prompt.replace('{{REQUESTED_TOOL_DETAILS}}', toolDetails);
    } else if (useDetailedTemplate) {
        prompt = prompt.replace('{{REQUESTED_TOOL_DETAILS}}', '');
    }
    
    return prompt;
}

export const AGENT_SYSTEM_PROMPT = buildAgentSystemPrompt();

export const DEFAULT_YAML_SYSTEM_MESSAGE =
    "You are an assistant that generates YAML attribute values for Obsidian notes. " +
    "Read the note and generate a value for the specified YAML field. " +
    "Only output the value, not the key or extra text.";
