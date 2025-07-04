import { normalizePath, Vault } from "obsidian";
import { debugLog } from "./logger";
import * as fs from "fs";
import * as path from "path";

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
    plugin: { settings: { debugMode?: boolean }, app: any, manifest?: { id: string } },
    folder: string = "ai-calls"
) {
    const debugMode = plugin.settings.debugMode ?? false;

    // Get the vault base path
    const vaultBase = plugin.app.vault.adapter.basePath;
    // Get the plugin folder name from manifest.id, fallback to old name if missing
    const pluginId = plugin.manifest?.id || 'ai-assistant-for-obsidian';
    const pluginFolder = path.join(vaultBase, '.obsidian', 'plugins', pluginId);
    debugLog(debugMode, 'info', '[saveAICalls.ts] pluginFolder:', pluginFolder);

    const targetFolder = path.join(pluginFolder, folder);
    debugLog(debugMode, 'info', '[saveAICalls.ts] targetFolder:', targetFolder);

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    let fileName = `ai-call-${timestamp}.md`;
    let finalFilePath = path.join(targetFolder, fileName);
    debugLog(debugMode, 'info', '[saveAICalls.ts] finalFilePath:', finalFilePath);
    const fileContent = `# AI Call\n\n## Request\n\`\`\`json\n${JSON.stringify(request, null, 2)}\n\`\`\`\n\n## Response\n\`\`\`json\n${JSON.stringify(response, null, 2)}\n\`\`\``;

    // Ensure the folder exists
    try {
        if (!fs.existsSync(targetFolder)) {
            debugLog(debugMode, 'info', '[saveAICalls.ts] Plugin folder does not exist, creating:', targetFolder);
            fs.mkdirSync(targetFolder, { recursive: true });
            debugLog(debugMode, 'info', '[saveAICalls.ts] Plugin folder created:', targetFolder);
        } else {
            debugLog(debugMode, 'debug', '[saveAICalls.ts] Plugin folder already exists:', targetFolder);
        }
    } catch (e) {
        debugLog(debugMode, 'warn', '[saveAICalls.ts] Error creating plugin folder (may already exist):', e);
    }

    // Check if file exists, if so, append a random string
    let attempts = 0;
    while (fs.existsSync(finalFilePath)) {
        attempts++;
        fileName = `ai-call-${timestamp}-${Math.floor(Math.random() * 10000)}.md`;
        finalFilePath = path.join(targetFolder, fileName);
        debugLog(debugMode, 'warn', `[saveAICalls.ts] File already exists, trying new filename (attempt ${attempts}):`, finalFilePath);
        if (attempts > 5) {
            debugLog(debugMode, 'error', '[saveAICalls.ts] Too many attempts to find unique filename, aborting.');
            throw new Error('Could not create a unique filename for AI call log.');
        }
    }

    try {
        fs.writeFileSync(finalFilePath, fileContent, 'utf8');
        debugLog(debugMode, 'info', '[saveAICalls.ts] AI call saved successfully in plugin folder:', finalFilePath);
    } catch (e) {
        debugLog(debugMode, 'error', '[saveAICalls.ts] Failed to save AI call in plugin folder:', e);
        throw e;
    }
}