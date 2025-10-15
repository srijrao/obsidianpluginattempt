
export const DEFAULT_TITLE_PROMPT = "You are a title generator. You will give succinct titles that do not contain backslashes, forward slashes, or colons. Only generate a title as your response.";

export const DEFAULT_SUMMARY_PROMPT = "Summarize the note content in 1-2 sentences, focusing on the main ideas and purpose.";

export const DEFAULT_GENERAL_SYSTEM_PROMPT = "You are a helpful assistant in an Obsidian Vault.";

export const DEFAULT_YAML_SYSTEM_MESSAGE =
    "You are an assistant that generates YAML attribute values for Obsidian notes. " +
    "Read the note and generate a value for the specified YAML field. " +
    "Only output the value, not the key or extra text.";
