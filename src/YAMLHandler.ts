import { Notice, TFile, App, Plugin } from "obsidian";
import { AIDispatcher } from "./utils/aiDispatcher";
import { Message, MyPluginSettings } from "./types";
import { DEFAULT_TITLE_PROMPT, DEFAULT_SUMMARY_PROMPT, DEFAULT_YAML_SYSTEM_MESSAGE } from "./promptConstants";
import { registerCommand } from "./utils/pluginUtils";
import * as yaml from "js-yaml";
import { debugLog } from "./utils/logger";
import { withTemporarySetting } from "./utils/typeGuards";

/**
 * Generates a Table of Contents from all headers in the note content.
 * It parses lines starting with '#' to identify headers and formats them
 * into an indented bullet point list.
 *
 * @param noteContent The content of the note as a string.
 * @returns A string representing the Table of Contents, or an empty string if no headers are found.
 */
function generateTableOfContents(noteContent: string): string {
    // Filter lines that start with 1 to 6 '#' characters followed by a space and text
    const headerLines = noteContent.split('\n').filter(line => /^#{1,6}\s+.+/.test(line));
    if (headerLines.length === 0) return "";
    return headerLines
        .map(line => {
            // Extract the header level (number of #) and the title text
            const match = line.match(/^(#{1,6})\s+(.+)/);
            if (!match) return ""; // Should not happen due to filter, but good practice
            const level = match[1].length;
            const title = match[2].trim();
            
            // Create an indented bullet point based on header level
            return `${'  '.repeat(level - 1)}- ${title}`;
        })
        .join('\n'); // Join the lines back into a single string
}

const DEBUG = true;

/**
 * Generates a title for the active note using an AI model.
 * It reads the active note, optionally includes a generated Table of Contents,
 * and sends the content to the AI provider to generate a title.
 * The generated title can be copied to the clipboard, inserted into the note's metadata,
 * or used to rename the note file based on user settings.
 *
 * @param app The Obsidian App instance.
 * @param settings The plugin settings, including AI provider and model configuration.
 * @param processMessages A function to process messages before sending to the AI provider.
 */
export async function generateNoteTitle(
    app: App,
    settings: MyPluginSettings,
    processMessages: (messages: Message[]) => Promise<Message[]>,
    dispatcher?: AIDispatcher
) {
    debugLog(DEBUG, 'debug', "Starting generateNoteTitle");
    const activeFile = app.workspace.getActiveFile();
    if (!activeFile) {
        new Notice("No active note found.");
        return;
    }
    // Read the active note content and slice to a maximum length to avoid hitting model token limits
    let noteContent = await app.vault.cachedRead(activeFile);
    noteContent = noteContent.slice(0, 15000);

    // Generate Table of Contents from the note content
    const toc = generateTableOfContents(noteContent);

    // Define the prompt and user content for the AI model
    const prompt = DEFAULT_TITLE_PROMPT;
    // Include TOC in user content if it exists
    const userContent = (toc && toc.trim().length > 0 ? "Table of Contents:\n" + toc + "\n\n" : "") + noteContent;
    
    try {
        debugLog(DEBUG, 'debug', "Provider:", settings.provider);
        
        // Use dispatcher for all completions
        const aiDispatcher = dispatcher ?? new AIDispatcher(app.vault, { settings, saveSettings: async () => {} });
        
        // Construct the initial messages array for the AI model
        const messages: Message[] = [
            { role: "system", content: prompt },
            { role: "user", content: userContent }
        ];

        debugLog(DEBUG, 'debug', "Original messages:", JSON.stringify(messages));
        
        // Temporarily disable context notes processing to ensure only the note content is used for title generation
        const processedMessages = await withTemporarySetting(
            settings,
            'enableContextNotes',
            false,
            async () => {
                debugLog(DEBUG, 'debug', "Context notes temporarily disabled for title generation");
                return await processMessages(messages);
            }
        );
        debugLog(DEBUG, 'debug', "Processed messages:", JSON.stringify(processedMessages));

        if (!processedMessages || processedMessages.length === 0) {
            debugLog(DEBUG, 'debug', "No processed messages!");
            new Notice("No valid messages to send to the model. Please check your note content.");
            return;
        }

        debugLog(DEBUG, 'debug', "Calling dispatcher.getCompletion");
        let resultBuffer = "";
        // Use dispatcher to get completion, streaming the response
        await aiDispatcher.getCompletion(processedMessages, {
            temperature: 0,
            streamCallback: (chunk: string) => {
                resultBuffer += chunk; // Accumulate streamed chunks
            }
        });
        debugLog(DEBUG, 'debug', "Result from dispatcher (buffered):", resultBuffer);

        // Extract and trim the generated title
        let title = resultBuffer.trim();
        debugLog(DEBUG, 'debug', "Extracted title before sanitization:", title);

        // Sanitize the title by removing characters invalid for filenames or YAML keys
        title = title.replace(/[\\/:]/g, "").trim();
        debugLog(DEBUG, 'debug', "Sanitized title:", title);

        // Handle the generated title based on the configured output mode
        if (title && typeof title === "string" && title.length > 0) {
            const outputMode = settings.titleOutputMode ?? "clipboard";
            debugLog(DEBUG, 'debug', "Output mode:", outputMode);
            if (outputMode === "replace-filename") {
                // Rename the note file
                const file = app.workspace.getActiveFile();
                if (file) {
                    const ext = file.extension ? "." + file.extension : "";
                    const sanitized = title;
                    const parentPath = file.parent ? file.parent.path : "";
                    const newPath = parentPath ? (parentPath + "/" + sanitized + ext) : (sanitized + ext);
                    if (file.path !== newPath) {
                        await app.fileManager.renameFile(file, newPath);
                        new Notice(`Note renamed to: ${sanitized}${ext}`);
                    } else {
                        new Notice(`Note title is already: ${sanitized}${ext}`);
                    }
                }
            } else if (outputMode === "metadata") {
                // Insert the title into the note's YAML frontmatter
                const file = app.workspace.getActiveFile();
                if (file) {
                    await upsertYamlField(app, file, "title", title);
                    new Notice(`Inserted title into metadata: ${title}`);
                }
            } else {
                // Copy the title to the clipboard (default mode)
                try {
                    await navigator.clipboard.writeText(title);
                    new Notice(`Generated title (copied): ${title}`);
                } catch (e) {
                    new Notice(`Generated title: ${title}`);
                }
            }
        } else {
            debugLog(DEBUG, 'debug', "No title generated after sanitization.");
            new Notice("No title generated.");
        }
    } catch (err) {
        new Notice("Error generating title: " + (err?.message ?? err));
    }
}

/**
 * Generic function to generate and insert/update a YAML attribute in the active note
 * using an AI model. It uses a default system message and temperature 0.
 * The generated value can be inserted into the note's YAML frontmatter or copied to the clipboard.
 *
 * @param app The Obsidian App instance.
 * @param settings The plugin settings, including AI provider and model configuration.
 * @param processMessages A function to process messages before sending to the AI provider.
 * @param attributeName The name of the YAML attribute to generate and insert/update.
 * @param prompt The prompt to send to the AI model for generating the attribute value.
 * @param outputMode The desired output mode ('metadata' to insert into YAML, or 'clipboard' to copy). Defaults to 'metadata'.
 */
export async function generateYamlAttribute(
    app: App,
    settings: MyPluginSettings,
    processMessages: (messages: Message[]) => Promise<Message[]>,
    attributeName: string,
    prompt: string,
    outputMode: string = "metadata",
    dispatcher?: AIDispatcher
) {
    debugLog(DEBUG, 'debug', `Starting generateYamlAttribute for ${attributeName}`);
    const activeFile = app.workspace.getActiveFile();
    if (!activeFile) {
        new Notice("No active note found.");
        return;
    }
    // Read the active note content and slice to a maximum length
    let noteContent = await app.vault.cachedRead(activeFile);
    noteContent = noteContent.slice(0, 15000);

    // Construct the messages array with a default system message and the user prompt + note content
    const messages: Message[] = [
        { role: "system", content: DEFAULT_YAML_SYSTEM_MESSAGE },
        { role: "user", content: prompt + "\n\n" + noteContent }
    ];

    // Temporarily disable context notes processing
    debugLog(DEBUG, 'debug', "Original messages:", JSON.stringify(messages));
    
    try {
        // Temporarily disable context notes processing to ensure only the note content is used
        const processedMessages = await withTemporarySetting(
            settings,
            'enableContextNotes',
            false,
            async () => {
                debugLog(DEBUG, 'debug', "Context notes temporarily disabled for YAML attribute generation");
                return await processMessages(messages);
            }
        );
        debugLog(DEBUG, 'debug', "Processed messages:", JSON.stringify(processedMessages));

        if (!processedMessages || processedMessages.length === 0) {
            debugLog(DEBUG, 'debug', "No processed messages!");
            new Notice("No valid messages to send to the model. Please check your note content.");
            return;
        }
        debugLog(DEBUG, 'debug', "Calling dispatcher.getCompletion");
        
        // Use dispatcher for all completions
        const aiDispatcher = dispatcher ?? new AIDispatcher(app.vault, { settings, saveSettings: async () => {} });
        let resultBuffer = "";
        // Use dispatcher to get completion, streaming the response
        await aiDispatcher.getCompletion(processedMessages, {
            temperature: 0, // Always use temperature 0 for predictable YAML output
            streamCallback: (chunk: string) => {
                resultBuffer += chunk; // Accumulate streamed chunks
            }
        });
        debugLog(DEBUG, 'debug', "Result from dispatcher (buffered):", resultBuffer);

        // Extract and trim the generated value
        let value = resultBuffer.trim();
        debugLog(DEBUG, 'debug', "Extracted value before sanitization:", value);
        // Sanitize the value
        value = value.replace(/[\\/]/g, "").trim();
        debugLog(DEBUG, 'debug', "Sanitized value:", value);

        // Handle the generated value based on the configured output mode
        if (value && typeof value === "string" && value.length > 0) {
            debugLog(DEBUG, 'debug', "Output mode:", outputMode);
            if (outputMode === "metadata") {
                // Insert the value into the note's YAML frontmatter
                await upsertYamlField(app, activeFile, attributeName, value);
                new Notice(`Inserted ${attributeName} into metadata: ${value}`);
            } else {
                // Copy the value to the clipboard
                try {
                    await navigator.clipboard.writeText(value);
                    new Notice(`Generated ${attributeName} (copied): ${value}`);
                } catch (e) {
                    new Notice(`Generated ${attributeName}: ${value}`);
                }
            }
        } else {
            debugLog(DEBUG, 'debug', `No value generated for ${attributeName} after sanitization.`);
            new Notice(`No value generated for ${attributeName}.`);
        }
    } catch (processError) {
        debugLog(DEBUG, 'debug', "Error in processMessages or provider.getCompletion:", processError);
        throw processError;
    }
}

/**
 * Inserts or updates a field in the YAML frontmatter of a given note file.
 * If the frontmatter exists, the field is updated or added. If not, new frontmatter is created
 * with the specified field and value.
 *
 * @param app The Obsidian App instance.
 * @param file The TFile object representing the note file.
 * @param field The name of the YAML field to upsert.
 * @param value The value to set for the YAML field.
 */
export async function upsertYamlField(app: App, file: TFile, field: string, value: string) {
    let content = await app.vault.read(file);
    let newContent = content;
    // Regex to find the YAML frontmatter block
    const frontmatterRegex = /^---\n([\s\S]*?)\n---/;
    const match = content.match(frontmatterRegex);
    if (match) {
        // Frontmatter exists, parse it
        let yamlObj: any = {};
        try {
            yamlObj = yaml.load(match[1]) || {}; // Load existing YAML, handle potential errors or empty frontmatter
        } catch (e) {
            yamlObj = {}; // If parsing fails, start with an empty object
        }
        yamlObj[field] = value; // Add or update the specified field
        // Dump the updated object back to YAML format
        const newYaml = yaml.dump(yamlObj, { lineWidth: -1 }).trim();
        // Replace the old frontmatter with the new one
        newContent = content.replace(frontmatterRegex, `---\n${newYaml}\n---`);
    } else {
        // No frontmatter exists, create a new one
        const newYaml = yaml.dump({ [field]: value }, { lineWidth: -1 }).trim();
        // Prepend the new frontmatter to the original content
        newContent = `---\n${newYaml}\n---\n` + content;
    }
    // Write the modified content back to the file
    await app.vault.modify(file, newContent);
}

/**
 * Registers commands dynamically for generating YAML attributes based on plugin settings.
 * It first removes any previously registered YAML attribute commands to avoid duplicates.
 *
 * @param plugin The Obsidian Plugin instance.
 * @param settings The plugin settings, including configured YAML attribute generators.
 * @param processMessages A function to process messages before sending to the AI provider.
 * @param yamlAttributeCommandIds An array of previously registered command IDs to remove.
 * @param debugLog The debug logging function.
 * @returns An array of the newly registered command IDs.
 */
export function registerYamlAttributeCommands(
    plugin: Plugin,
    settings: MyPluginSettings,
    processMessages: (messages: Message[]) => Promise<Message[]>,
    yamlAttributeCommandIds: string[],
    debugLog: (level: 'debug' | 'info' | 'warn' | 'error', ...args: any[]) => void
): string[] {
    debugLog('debug', '[YAMLHandler.ts] registerYamlAttributeCommands called');
    // Remove previously registered commands to prevent duplicates when settings change
    if (yamlAttributeCommandIds && yamlAttributeCommandIds.length > 0) {
        for (const id of yamlAttributeCommandIds) {
            // @ts-ignore: Obsidian Plugin API has undocumented method to remove commands
            plugin.app.commands.removeCommand(id);
            debugLog('debug', '[YAMLHandler.ts] Removed previous YAML command', { id });
        }
    }
    
    const newCommandIds: string[] = [];
    
    // Iterate through the configured YAML attribute generators in settings
    if (settings.yamlAttributeGenerators && Array.isArray(settings.yamlAttributeGenerators)) {
        for (const gen of settings.yamlAttributeGenerators) {
            // Skip if essential properties are missing
            if (!gen.attributeName || !gen.prompt || !gen.commandName) continue;
            // Generate a unique command ID
            const id = `generate-yaml-attribute-${gen.attributeName}`;
            debugLog('debug', '[YAMLHandler.ts] Registering YAML attribute command', { id, gen });
            
            // Register the command with Obsidian
            registerCommand(plugin, {
                id,
                name: gen.commandName,
                callback: async () => {
                    // Call the generic generator function when the command is triggered
                    await generateYamlAttribute(
                        plugin.app,
                        settings,
                        processMessages,
                        gen.attributeName,
                        gen.prompt,
                        gen.outputMode
                    );
                }
            });
            newCommandIds.push(id); // Add the new command ID to the list
        }
    }
    
    return newCommandIds; // Return the list of newly registered command IDs
}
