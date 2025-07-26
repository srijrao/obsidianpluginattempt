import { normalizePath, Vault } from "obsidian";
import { debugLog } from "./logger";
import * as fs from "fs";
import * as path from "path";

// Use adm-zip for ZIP creation in Obsidian environment
let AdmZip: any;
try {
    AdmZip = require('adm-zip');
    console.log('adm-zip loaded successfully for ZIP creation');
} catch (e) {
    console.warn('adm-zip not available - archiving will be disabled:', e);
    AdmZip = null;
}

/**
 * Saves an AI call (request and response) as a TXT file in the specified folder within the Obsidian vault.
 *
 * The file is named using the current timestamp to ensure uniqueness. If a file with the same name already exists,
 * a random number is appended to the filename. The request and response are serialized as formatted JSON and stored
 * in separate sections within the TXT file.
 *
 * The function ensures that the target folder exists, creating it if necessary.
 * 
 * Logging is performed at each major step for traceability and debugging.
 *
 * @param request - The request object sent to the AI. This can be any serializable data structure.
 * @param response - The response object received from the AI. This can be any serializable data structure.
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
    let fileName = `ai-call-${timestamp}.txt`;
    let finalFilePath = path.join(targetFolder, fileName);
    debugLog(debugMode, 'info', '[saveAICalls.ts] finalFilePath:', finalFilePath);
    const fileContent = `# AI Call\n\n## Request\n\`\`\`json\n${JSON.stringify(request, null, 2)}\n\`\`\`\n\n## Response\n\`\`\`json\n${JSON.stringify(response, null, 2)}\n\`\`\``;

    // Save content as text file without compression

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
        fileName = `ai-call-${timestamp}-${Math.floor(Math.random() * 10000)}.txt`;
        finalFilePath = path.join(targetFolder, fileName);
        debugLog(debugMode, 'warn', `[saveAICalls.ts] File already exists, trying new filename (attempt ${attempts}):`, finalFilePath);
        if (attempts > 5) {
            debugLog(debugMode, 'error', '[saveAICalls.ts] Too many attempts to find unique filename, aborting.');
            throw new Error('Could not create a unique filename for AI call log.');
        }
    }

    try {
        fs.writeFileSync(finalFilePath, fileContent, 'utf8');
        debugLog(debugMode, 'info', '[saveAICalls.ts] AI call saved successfully in plugin folder as text file:', finalFilePath);
    } catch (e) {
        debugLog(debugMode, 'error', '[saveAICalls.ts] Failed to save AI call in plugin folder:', e);
        throw e;
    }
}

/**
 * Groups AI call files by date and compresses them into daily archives.
 * This function scans the ai-calls folder for individual files and groups them by date,
 * creating compressed daily archives and removing the original files.
 * 
 * @param plugin - The plugin instance, used to access settings for debug logging.
 * @param folder - (Optional) The folder path within the vault where the files are stored. Defaults to "ai-calls".
 */
export async function archiveAICallsByDate(
    plugin: { settings: { debugMode?: boolean }, app: any, manifest?: { id: string } },
    folder: string = "ai-calls"
) {
    const debugMode = plugin.settings.debugMode ?? false;

    // Get the vault base path
    const vaultBase = plugin.app.vault.adapter.basePath;
    const pluginId = plugin.manifest?.id || 'ai-assistant-for-obsidian';
    const pluginFolder = path.join(vaultBase, '.obsidian', 'plugins', pluginId);
    const targetFolder = path.join(pluginFolder, folder);

    if (!fs.existsSync(targetFolder)) {
        debugLog(debugMode, 'info', '[saveAICalls.ts] No ai-calls folder found, skipping archival');
        return;
    }

    try {
        const files = fs.readdirSync(targetFolder);
        const aiCallFiles = files.filter(file => 
            file.startsWith('ai-call-') && 
            (file.endsWith('.txt') || file.endsWith('.md') || file.endsWith('.gz'))
        );

        if (aiCallFiles.length === 0) {
            debugLog(debugMode, 'info', '[saveAICalls.ts] No AI call files found to archive');
            return;
        }

        // Group files by date
        const filesByDate = new Map<string, string[]>();
        const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format

        for (const file of aiCallFiles) {
            // Extract date from filename: ai-call-2025-07-25T...
            const dateMatch = file.match(/ai-call-(\d{4}-\d{2}-\d{2})/);
            if (dateMatch) {
                const fileDate = dateMatch[1];
                if (!filesByDate.has(fileDate)) {
                    filesByDate.set(fileDate, []);
                }
                filesByDate.get(fileDate)!.push(file);
            }
        }

        debugLog(debugMode, 'info', `[saveAICalls.ts] Found files for ${filesByDate.size} different dates`);

        // Process each date group
        for (const [date, dateFiles] of filesByDate.entries()) {
            // Skip today's files - keep them as individual files for ongoing use
            if (date === today) {
                debugLog(debugMode, 'info', `[saveAICalls.ts] Skipping today's files (${dateFiles.length} files)`);
                continue;
            }

            debugLog(debugMode, 'info', `[saveAICalls.ts] Processing date ${date} with ${dateFiles.length} files:`, dateFiles);
            try {
                await archiveDateFiles(targetFolder, date, dateFiles, debugMode);
                debugLog(debugMode, 'info', `[saveAICalls.ts] Successfully processed date ${date}`);
            } catch (error) {
                debugLog(debugMode, 'error', `[saveAICalls.ts] Failed to process date ${date}:`, error);
            }
        }

    } catch (e) {
        debugLog(debugMode, 'error', '[saveAICalls.ts] Error during AI call archival:', e);
        throw e;
    }
}

async function archiveDateFiles(
    targetFolder: string, 
    date: string, 
    files: string[], 
    debugMode: boolean
): Promise<void> {
    const archiveFileName = `ai-calls-${date}.zip`;
    const archiveFilePath = path.join(targetFolder, archiveFileName);

    debugLog(debugMode, 'info', `[saveAICalls.ts] Attempting to create archive at: ${archiveFilePath}`);

    // Skip if archive already exists
    if (fs.existsSync(archiveFilePath)) {
        debugLog(debugMode, 'info', `[saveAICalls.ts] Archive for ${date} already exists, skipping`);
        return;
    }

    // Check if adm-zip is available
    if (!AdmZip) {
        debugLog(debugMode, 'warn', `[saveAICalls.ts] adm-zip not available, skipping archive creation for ${date} (files will remain as individual files)`);
        return;
    }

    debugLog(debugMode, 'info', `[saveAICalls.ts] Creating ZIP archive using adm-zip for ${date} with ${files.length} files`);

    try {
        const zip = new AdmZip();
        const filesToDelete: string[] = [];

        // Add each file individually to the ZIP
        for (const file of files) {
            const filePath = path.join(targetFolder, file);
            try {
                if (file.endsWith('.gz')) {
                    debugLog(debugMode, 'warn', `[saveAICalls.ts] Skipping .gz file: ${file}`);
                    continue;
                }

                // Add file to ZIP with original filename
                zip.addLocalFile(filePath, '', file);
                filesToDelete.push(filePath);
                debugLog(debugMode, 'debug', `[saveAICalls.ts] Added file to ZIP: ${file}`);

            } catch (e) {
                debugLog(debugMode, 'warn', `[saveAICalls.ts] Failed to add file ${file} to ZIP:`, e);
            }
        }

        // Write the ZIP file
        zip.writeZip(archiveFilePath);
        debugLog(debugMode, 'info', `[saveAICalls.ts] ZIP archive created: ${archiveFileName}`);

        // Delete original files after successful archival
        for (const filePath of filesToDelete) {
            try {
                fs.unlinkSync(filePath);
                debugLog(debugMode, 'debug', `[saveAICalls.ts] Deleted original file: ${path.basename(filePath)}`);
            } catch (e) {
                debugLog(debugMode, 'warn', `[saveAICalls.ts] Failed to delete file ${filePath}:`, e);
            }
        }

        debugLog(debugMode, 'info', `[saveAICalls.ts] Successfully created ZIP archive with ${filesToDelete.length} individual files`);

    } catch (e) {
        debugLog(debugMode, 'error', `[saveAICalls.ts] Failed to create archive for ${date}:`, e);
        throw e;
    }
}

/**
 * Creates a ZIP archive using adm-zip library with individual files preserved.
 */
async function createAdmZipArchive(
    targetFolder: string, 
    date: string, 
    files: string[], 
    debugMode: boolean
): Promise<void> {
    const archiveFileName = `ai-calls-${date}.zip`;
    const archiveFilePath = path.join(targetFolder, archiveFileName);
    
    debugLog(debugMode, 'info', `[saveAICalls.ts] Creating ZIP archive using adm-zip for ${date} with ${files.length} files`);

    try {
        const zip = new AdmZip();
        const filesToDelete: string[] = [];

        // Add each file individually to the ZIP
        for (const file of files) {
            const filePath = path.join(targetFolder, file);
            try {
                if (file.endsWith('.gz')) {
                    debugLog(debugMode, 'warn', `[saveAICalls.ts] Skipping .gz file: ${file}`);
                    continue;
                }

                // Add file to ZIP with original filename
                zip.addLocalFile(filePath, '', file);
                filesToDelete.push(filePath);
                debugLog(debugMode, 'debug', `[saveAICalls.ts] Added file to ZIP: ${file}`);

            } catch (e) {
                debugLog(debugMode, 'warn', `[saveAICalls.ts] Failed to add file ${file} to ZIP:`, e);
            }
        }

        // Write the ZIP file
        zip.writeZip(archiveFilePath);
        debugLog(debugMode, 'info', `[saveAICalls.ts] ZIP archive created: ${archiveFileName}`);

        // Delete original files after successful archival
        for (const filePath of filesToDelete) {
            try {
                fs.unlinkSync(filePath);
                debugLog(debugMode, 'debug', `[saveAICalls.ts] Deleted original file: ${path.basename(filePath)}`);
            } catch (e) {
                debugLog(debugMode, 'warn', `[saveAICalls.ts] Failed to delete file ${filePath}:`, e);
            }
        }

        debugLog(debugMode, 'info', `[saveAICalls.ts] Successfully created ZIP archive with ${filesToDelete.length} individual files`);

    } catch (e) {
        debugLog(debugMode, 'error', `[saveAICalls.ts] Failed to create adm-zip archive for ${date}:`, e);
        throw e;
    }
}

/**
 * Utility function to manually trigger AI call archival.
 * Can be called from commands or settings UI.
 */
export async function manualArchiveAICalls(
    plugin: { settings: { debugMode?: boolean }, app: any, manifest?: { id: string } },
    folder: string = "ai-calls"
): Promise<{ success: boolean; message: string; archivedDates: string[]; details: any }> {
    try {
        const debugMode = plugin.settings.debugMode ?? false;
        const vaultBase = plugin.app.vault.adapter.basePath;
        const pluginId = plugin.manifest?.id || 'ai-assistant-for-obsidian';
        const targetFolder = require('path').join(vaultBase, '.obsidian', 'plugins', pluginId, folder);

        debugLog(debugMode, 'info', `[saveAICalls.ts] Manual archive starting - target folder: ${targetFolder}`);

        if (!require('fs').existsSync(targetFolder)) {
            return {
                success: false,
                message: 'No AI calls folder found',
                archivedDates: [],
                details: { targetFolder, exists: false }
            };
        }

        const files = require('fs').readdirSync(targetFolder);
        debugLog(debugMode, 'info', `[saveAICalls.ts] Found ${files.length} total files in folder:`, files);

        const aiCallFiles = files.filter((file: string) => 
            file.startsWith('ai-call-') && 
            (file.endsWith('.txt') || file.endsWith('.md') || file.endsWith('.gz'))
        );

        debugLog(debugMode, 'info', `[saveAICalls.ts] Found ${aiCallFiles.length} AI call files:`, aiCallFiles);

        if (aiCallFiles.length === 0) {
            return {
                success: true,
                message: 'No AI call files found to archive',
                archivedDates: [],
                details: { totalFiles: files.length, aiCallFiles: [] }
            };
        }

        await archiveAICallsByDate(plugin, folder);

        // Count how many dates were processed
        const dateSet = new Set<string>();
        const today = new Date().toISOString().split('T')[0];
        
        for (const file of aiCallFiles) {
            const dateMatch = file.match(/ai-call-(\d{4}-\d{2}-\d{2})/);
            if (dateMatch && dateMatch[1] !== today) {
                dateSet.add(dateMatch[1]);
            }
        }

        // Check what files exist after archiving
        const finalFiles = require('fs').readdirSync(targetFolder);
        const zipFiles = finalFiles.filter((file: string) => file.endsWith('.zip'));

        debugLog(debugMode, 'info', `[saveAICalls.ts] After archiving - total files: ${finalFiles.length}, ZIP files: ${zipFiles.length}`);

        return {
            success: true,
            message: `Successfully archived AI calls for ${dateSet.size} dates`,
            archivedDates: Array.from(dateSet),
            details: {
                targetFolder,
                totalFiles: files.length,
                aiCallFiles: aiCallFiles.length,
                processedDates: dateSet.size,
                finalFiles: finalFiles.length,
                zipFiles,
                compressionMethod: AdmZip ? 'adm-zip' : 'none',
                admZipAvailable: !!AdmZip
            }
        };

    } catch (error: any) {
        return {
            success: false,
            message: `Archival failed: ${error.message}`,
            archivedDates: [],
            details: { error: error.message, stack: error.stack }
        };
    }
}