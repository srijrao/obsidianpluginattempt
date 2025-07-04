import { normalizePath, Vault } from "obsidian";
import { debugLog } from "./logger";

/**
 * Saves an AI call (request and response) as a Markdown file in the specified folder within the Obsidian vault.
 *
 * The file is named using the current timestamp to ensure uniqueness. If a file with the same name already exists,
 * a random number is appended to the filename. The request and response are serialized as formatted JSON and stored
 * in separate sections within the Markdown file.
 *
 * The function ensures that the target folder exists, creating it if necessary.
 * 
 * Logging is performed at each major step for traceability and debugging.
 *
 * @param request - The request object sent to the AI. This can be any serializable data structure.
 * @param response - The response object received from the AI. This can be any serializable data structure.
 * @param vault - The Obsidian Vault instance where the file will be saved.
 * @param plugin - The plugin instance, used to access settings for debug logging.
 * @param folder - (Optional) The folder path within the vault where the file will be stored. Defaults to "ai-calls".
 *
 * @throws Will throw an error if the file cannot be created for reasons other than the folder already existing.
 */
export async function saveAICallToFolder(
    request: any,
    response: any,
    vault: Vault,
    plugin: { settings: { debugMode?: boolean } },
    folder: string = "ai-calls"
) {
    const debugMode = plugin.settings.debugMode ?? false;

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const fileName = `${folder}/ai-call-${timestamp}.md`;
    const fileContent = `# AI Call\n\n## Request\n\`\`\`json\n${JSON.stringify(request, null, 2)}\n\`\`\`\n\n## Response\n\`\`\`json\n${JSON.stringify(response, null, 2)}\n\`\`\``;

    // Ensure the folder exists
    const folderPath = normalizePath(folder);
    try {
        if (!vault.getAbstractFileByPath(folderPath)) {
            debugLog(debugMode, 'info', '[saveAICalls.ts] Folder does not exist, creating:', folderPath);
            await vault.createFolder(folderPath);
            debugLog(debugMode, 'info', '[saveAICalls.ts] Folder created:', folderPath);
        } else {
            debugLog(debugMode, 'debug', '[saveAICalls.ts] Folder already exists:', folderPath);
        }
    } catch (e) {
        // Folder may already exist, ignore error
        debugLog(debugMode, 'warn', '[saveAICalls.ts] Error creating folder (may already exist):', e);
    }

    // Check if file exists, if so, append a random string
    let finalFileName = fileName;
    let attempts = 0;
    while (vault.getAbstractFileByPath(normalizePath(finalFileName))) {
        attempts++;
        finalFileName = `${folder}/ai-call-${timestamp}-${Math.floor(Math.random() * 10000)}.md`;
        debugLog(debugMode, 'warn', `[saveAICalls.ts] File already exists, trying new filename (attempt ${attempts}):`, finalFileName);
        if (attempts > 5) {
            debugLog(debugMode, 'error', '[saveAICalls.ts] Too many attempts to find unique filename, aborting.');
            throw new Error('Could not create a unique filename for AI call log.');
        }
    }

    try {
        await vault.create(finalFileName, fileContent);
        debugLog(debugMode, 'info', '[saveAICalls.ts] AI call saved successfully:', finalFileName);
    } catch (e) {
        debugLog(debugMode, 'error', '[saveAICalls.ts] Failed to save AI call:', e);
        throw e;
    }
}