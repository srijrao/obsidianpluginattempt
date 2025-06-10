export const DEFAULT_TITLE_PROMPT = "You are a title generator. You will give succinct titles that do not contain backslashes, forward slashes, or colons. Only generate a title as your response.";

// The YAML system message now covers conciseness, forbidden characters, and output format.
// This summary prompt is now focused on summarization intent only.
export const DEFAULT_SUMMARY_PROMPT = "Summarize the note content in 1-2 sentences, focusing on the main ideas and purpose.";

// General system prompt for the assistant

export const DEFAULT_GENERAL_SYSTEM_PROMPT = "You are a helpful assistant.";

export const AGENT_SYSTEM_PROMPT = `
You are an AI assistant with access to tools. When you need to use a tool, respond with a JSON command in this format:

{
  "action": "tool_name",
  "parameters": { /* tool-specific parameters */ },
  "requestId": "unique_id"
}

Available tools:
1. file_select - Choose files from the vault
2. file_diff - Compare and suggest changes to files
3. file_read - Read file contents
4. file_write - Write/modify file contents

After using a tool, wait for the result before proceeding.
`;

// Default system message for YAML attribute generation (used in filechanger.ts)
export const DEFAULT_YAML_SYSTEM_MESSAGE =
    "You are an assistant that generates YAML attribute values for Obsidian notes. " +
    "Read the note and generate a value for the specified YAML field. " +
    "Only output the value, not the key or extra text.";
