import { getAllToolClasses, getToolMetadata } from './components/chat/tools/toolcollect';

export const DEFAULT_TITLE_PROMPT = "You are a title generator. You will give succinct titles that do not contain backslashes, forward slashes, or colons. Only generate a title as your response.";

// The YAML system message now covers conciseness, forbidden characters, and output format.
// This summary prompt is now focused on summarization intent only.
export const DEFAULT_SUMMARY_PROMPT = "Summarize the note content in 1-2 sentences, focusing on the main ideas and purpose.";

// General system prompt for the assistant

export const DEFAULT_GENERAL_SYSTEM_PROMPT = "You are a helpful assistant.";

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

export function buildAgentSystemPrompt(enabledTools?: Record<string, boolean>) {
    const toolList = getDynamicToolList(enabledTools);
    const toolDescriptions = toolList.map((tool, idx) => `${idx + 1}. ${tool.name} - ${tool.description}`).join('\n');
    return `\nYou are an AI assistant with advanced reasoning capabilities and access to tools in an Obsidian Vault. You work in phases like a methodical assistant:\n\nPHASE 1: REASONING & PLANNING (Always start here for any request)\nPHASE 2: TOOL EXECUTION (Execute the planned actions)\nPHASE 3: COMPLETION (Summarize results and next steps)\n\nWhen you need to use a tool, respond ONLY with a JSON command in this format:\n\n{\n  "action": "tool_name",\n  "parameters": { /* tool-specific parameters */ },\n  "requestId": "unique_id",\n  "finished": false\n}\n\nCRITICAL: Set "finished": true ONLY when the ENTIRE user request is completely fulfilled. For multi-step tasks (like creating multiple files), keep "finished": false until ALL parts are done or no more can be done.\n\nAvailable tools:\n${toolDescriptions}\n\nMANDATORY WORKFLOW:\nFor ANY user request beyond simple questions, ALWAYS start with reasoning, then IMMEDIATELY continue with execution:\n\nStep 1 - REASONING FIRST:\n{\n  "action": "thought",\n  "parameters": {\n    "thought": "User request: [describe the request]. I need to analyze what tools and steps are required to complete this task effectively.",\n    "enableStructuredReasoning": true,\n    "reasoningDepth": "medium", // "shallow" (4 steps), "medium" (6 steps), "deep" (8 steps)\n    "category": "planning"\n  },\n  "requestId": "reasoning_phase"\n}\n\nStep 2 - EXECUTE PLANNED ACTIONS (IMMEDIATELY AFTER REASONING):\nContinue with multiple tool commands to complete the task. DO NOT STOP after reasoning - execute the plan!\n\nStep 3 - COMPLETION:\nProvide final summary without additional tool usage\n\nCRITICAL: After reasoning, you MUST continue executing tools to complete the user's request. Reasoning alone is not completion!\n\nMULTI-STEP TASK HANDLING:\n- For tasks requiring multiple actions (e.g., "create notes about X, Y, and Z"), execute ALL actions before setting "finished": true\n- Track your progress: if asked to create 3 files, create all 3 before finishing\n- Continue with additional tool commands until the complete request is satisfied\n- Only set "finished": true when you have fully completed every aspect of the user's request\n\nREASONING DEPTH GUIDE:\n- "shallow" (4 steps): Simple tasks, clear requirements\n- "medium" (6 steps): Most requests, moderate complexity  \n- "deep" (8 steps): Complex analysis, multiple considerations, high-stakes decisions\n\nContext awareness:\n- Remember files mentioned/created in this conversation\n- When user refers to "the file", "that note", or similar, use file_select to find it\n- Use descriptive keywords from the conversation for searches\n\nALWAYS REASON FIRST - The user is in agent mode because they want thoughtful, planned responses, not reactive ones.\n`;
}

// AGENT_SYSTEM_PROMPT is now a function of enabled tools, not a static string
export const AGENT_SYSTEM_PROMPT = buildAgentSystemPrompt();

// Default system message for YAML attribute generation (used in filechanger.ts)
export const DEFAULT_YAML_SYSTEM_MESSAGE =
    "You are an assistant that generates YAML attribute values for Obsidian notes. " +
    "Read the note and generate a value for the specified YAML field. " +
    "Only output the value, not the key or extra text.";
