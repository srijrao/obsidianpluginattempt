import { Notice, TFile, App } from "obsidian";
import { createProvider } from "../providers";
import { Message, MyPluginSettings } from "./types";
import { DEFAULT_TITLE_PROMPT, DEFAULT_SUMMARY_PROMPT, DEFAULT_YAML_SYSTEM_MESSAGE } from "./prompts";
import * as yaml from "js-yaml";

/**
 * Generate a Table of Contents from all headers in the note.
 * Returns a string with indented bullet points, or an empty string if no headers.
 */
function generateTableOfContents(noteContent: string): string {
    const headerLines = noteContent.split('\n').filter(line => /^#{1,6}\s+.+/.test(line));
    if (headerLines.length === 0) return "";
    return headerLines
        .map(line => {
            const match = line.match(/^(#{1,6})\s+(.+)/);
            if (!match) return "";
            const level = match[1].length;
            const title = match[2].trim();
            // Indent based on header level (2 spaces per level after H1)
            return `${'  '.repeat(level - 1)}- ${title}`;
        })
        .join('\n');
}

const DEBUG = true;

function debug(...args: any[]) {
    if (DEBUG) {
        console.log("[DEBUG]", ...args);
    }
}

export async function generateNoteTitle(
    app: App,
    settings: MyPluginSettings,
    processMessages: (messages: Message[]) => Promise<Message[]>
) {
    debug("Starting generateNoteTitle");
    const activeFile = app.workspace.getActiveFile();
    if (!activeFile) {
        new Notice("No active note found.");
        return;
    }
    let noteContent = await app.vault.cachedRead(activeFile);
    noteContent = noteContent.slice(0, 15000);

    // Generate Table of Contents from all headers in the note
    const toc = generateTableOfContents(noteContent);

    // Use the default title prompt from prompts.ts
    const prompt = DEFAULT_TITLE_PROMPT;
    const userContent = (toc && toc.trim().length > 0 ? "Table of Contents:\n" + toc + "\n\n" : "") + noteContent;

    try {
        debug("Provider:", settings.provider);
        const provider = createProvider(settings);
        // Compose messages: system = prompt, user = note content (with TOC)
        const messages: Message[] = [
            { role: "system", content: prompt },
            { role: "user", content: userContent }
        ];

        debug("Original messages:", JSON.stringify(messages));
        const originalEnableContextNotes = settings.enableContextNotes;
        debug("Original enableContextNotes:", originalEnableContextNotes);
        (settings as any).enableContextNotes = false;

        try {
            const processedMessages = await processMessages(messages);
            debug("Processed messages:", JSON.stringify(processedMessages));
            (settings as any).enableContextNotes = originalEnableContextNotes;

            if (!processedMessages || processedMessages.length === 0) {
                debug("No processed messages!");
                new Notice("No valid messages to send to the model. Please check your note content.");
                return;
            }

            debug("Calling provider.getCompletion");
            let resultBuffer = "";
            await provider.getCompletion(processedMessages, {
                temperature: 0,
                streamCallback: (chunk: string) => {
                    resultBuffer += chunk;
                }
            });
            debug("Result from provider (buffered):", resultBuffer);

            let title = resultBuffer.trim();
            debug("Extracted title before sanitization:", title);

            // Remove forbidden characters: backslashes, forward slashes, colons
            title = title.replace(/[\\/:]/g, "").trim();
            debug("Sanitized title:", title);

            if (title && typeof title === "string" && title.length > 0) {
                const outputMode = settings.titleOutputMode ?? "clipboard";
                debug("Output mode:", outputMode);
                if (outputMode === "replace-filename") {
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
                    const file = app.workspace.getActiveFile();
                    if (file) {
                        await upsertYamlField(app, file, "title", title);
                        new Notice(`Inserted title into metadata: ${title}`);
                    }
                } else {
                    try {
                        await navigator.clipboard.writeText(title);
                        new Notice(`Generated title (copied): ${title}`);
                    } catch (e) {
                        new Notice(`Generated title: ${title}`);
                    }
                }
            } else {
                debug("No title generated after sanitization.");
                new Notice("No title generated.");
            }
        } catch (processError) {
            debug("Error in processMessages or provider.getCompletion:", processError);
            (settings as any).enableContextNotes = originalEnableContextNotes;
            throw processError;
        }
    } catch (err) {
        new Notice("Error generating title: " + (err?.message ?? err));
    }
}

/**
 * Generic function to generate and insert/update a YAML attribute in the active note.
 * Always uses the default system message and temperature 0.
 */
export async function generateYamlAttribute(
    app: App,
    settings: MyPluginSettings,
    processMessages: (messages: Message[]) => Promise<Message[]>,
    attributeName: string,
    prompt: string,
    outputMode: string = "metadata"
) {
    debug(`Starting generateYamlAttribute for ${attributeName}`);
    const activeFile = app.workspace.getActiveFile();
    if (!activeFile) {
        new Notice("No active note found.");
        return;
    }
    let noteContent = await app.vault.cachedRead(activeFile);
    noteContent = noteContent.slice(0, 15000);

    // Compose messages: system = default system message, user = prompt + note content
    const messages: Message[] = [
        { role: "system", content: DEFAULT_YAML_SYSTEM_MESSAGE },
        { role: "user", content: prompt + "\n\n" + noteContent }
    ];

    // Use processMessages for Obsidian link expansion, but skip context notes
    debug("Original messages:", JSON.stringify(messages));
    const originalEnableContextNotes = settings.enableContextNotes;
    debug("Original enableContextNotes:", originalEnableContextNotes);
    (settings as any).enableContextNotes = false;

    try {
        const processedMessages = await processMessages(messages);
        debug("Processed messages:", JSON.stringify(processedMessages));
        (settings as any).enableContextNotes = originalEnableContextNotes;

        if (!processedMessages || processedMessages.length === 0) {
            debug("No processed messages!");
            new Notice("No valid messages to send to the model. Please check your note content.");
            return;
        }

        // Get completion (buffer streamed output)
        debug("Calling provider.getCompletion");
        const provider = createProvider(settings);
        let resultBuffer = "";
        await provider.getCompletion(processedMessages, {
            temperature: 0,
            streamCallback: (chunk: string) => {
                resultBuffer += chunk;
            }
        });
        debug("Result from provider (buffered):", resultBuffer);

        let value = resultBuffer.trim();
        debug("Extracted value before sanitization:", value);
        value = value.replace(/[\\/]/g, "").trim(); // Allow colons in YAML values
        debug("Sanitized value:", value);

        if (value && typeof value === "string" && value.length > 0) {
            debug("Output mode:", outputMode);
            if (outputMode === "metadata") {
                // Insert or update attribute in YAML frontmatter using helper
                await upsertYamlField(app, activeFile, attributeName, value);
                new Notice(`Inserted ${attributeName} into metadata: ${value}`);
            } else {
                // Clipboard (default)
                try {
                    await navigator.clipboard.writeText(value);
                    new Notice(`Generated ${attributeName} (copied): ${value}`);
                } catch (e) {
                    new Notice(`Generated ${attributeName}: ${value}`);
                }
            }
        } else {
            debug(`No value generated for ${attributeName} after sanitization.`);
            new Notice(`No value generated for ${attributeName}.`);
        }
    } catch (processError) {
        debug("Error in processMessages or provider.getCompletion:", processError);
        (settings as any).enableContextNotes = originalEnableContextNotes;
        throw processError;
    }
}

/**
 * Insert or update a field in the YAML frontmatter of a note.
 * If the field exists, it is updated. If not, it is added.
 * If no frontmatter exists, it is created.
 */
export async function upsertYamlField(app: App, file: TFile, field: string, value: string) {
    let content = await app.vault.read(file);
    let newContent = content;
    const frontmatterRegex = /^---\n([\s\S]*?)\n---/;
    const match = content.match(frontmatterRegex);
    if (match) {
        // Parse YAML frontmatter
        let yamlObj: any = {};
        try {
            yamlObj = yaml.load(match[1]) || {};
        } catch (e) {
            yamlObj = {};
        }
        yamlObj[field] = value;
        const newYaml = yaml.dump(yamlObj, { lineWidth: -1 }).trim();
        newContent = content.replace(frontmatterRegex, `---\n${newYaml}\n---`);
    } else {
        // No frontmatter, add it
        const newYaml = yaml.dump({ [field]: value }, { lineWidth: -1 }).trim();
        newContent = `---\n${newYaml}\n---\n` + content;
    }
    await app.vault.modify(file, newContent);
}
