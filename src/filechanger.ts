import { Notice, TFile, App } from "obsidian";
import { createProvider } from "../providers";
import { Message, MyPluginSettings } from "./types";

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

/*
-------------------------------
Function Definitions & Behavior
-------------------------------

generateTableOfContents(noteContent: string): string
---------------------------------------------------
- Scans the provided note content for all Markdown headers (lines starting with #, ##, ###, etc.).
- For each header, determines its level (number of #) and extracts the header text.
- Builds a hierarchical Table of Contents as a bullet list, indenting subheaders (2 spaces per level after H1).
- Returns the TOC as a string, or an empty string if no headers are found.

generateNoteTitle(app, settings, processMessages): Promise<void>
---------------------------------------------------------------
- Gets the active note in Obsidian and reads its content (up to 15,000 characters).
- Calls generateTableOfContents to create a TOC from the note's headers.
- Constructs a prompt for the LLM, including the TOC if present, and the note content.
- Sends the prompt to the LLM provider using the configured settings.
- Receives the generated title, copies it to the clipboard, and displays it in a Notice.

generateNoteSummary(app, settings, processMessages): Promise<void>
-----------------------------------------------------------------
- Gets the active note in Obsidian and reads its content (up to 15,000 characters).
- Calls generateTableOfContents to create a TOC from the note's headers.
- Constructs a prompt for the LLM, including the TOC if present, and the note content.
- Sends the prompt to the LLM provider using the configured settings.
- Receives the generated summary, copies it to the clipboard, and displays it in a Notice.

*/

/**
 * Generate a succinct title for the active note using the LLM provider.
 * Copies the result to clipboard and shows a Notice.
 */
// Enable this for verbose debugging
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
    // Snip to 15,000 chars
    noteContent = noteContent.slice(0, 15000);

    // Generate Table of Contents from all headers in the note
    const toc = generateTableOfContents(noteContent);

    // Compose the prompt
    let prompt =
        "You are a title generator. You will give succinct titles that does not contain backslashes, forward slashes, or colons. Only generate a title as your response for:\n\n";
    if (toc && toc.trim().length > 0) {
        prompt += "Table of Contents:\n" + toc + "\n\n";
    }
    prompt += noteContent;

    // Use the provider system
    try {
        debug("Provider:", settings.provider);
        const provider = createProvider(settings);
        // Compose messages: system = instruction, user = note content (with TOC)
        const messages: Message[] = [
            { role: "system", content: "You are a title generator. You will give succinct titles that does not contain backslashes, forward slashes, or colons. Only generate a title as your response." },
            { role: "user", content: (toc && toc.trim().length > 0 ? "Table of Contents:\n" + toc + "\n\n" : "") + noteContent }
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

            // Ensure there are messages to send
            if (!processedMessages || processedMessages.length === 0) {
                debug("No processed messages!");
                new Notice("No valid messages to send to the model. Please check your note content.");
                return;
            }

            // Get completion (buffer streamed output)
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
                    // Rename the note file (preserve extension)
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
                    // Insert or update title in YAML frontmatter using helper
                    const file = app.workspace.getActiveFile();
                    if (file) {
                        await upsertYamlField(app, file, "title", title);
                        new Notice(`Inserted title into metadata: ${title}`);
                    }
                } else {
                    // Clipboard (default)
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
 * Generate a concise summary for the active note using the LLM provider.
 * Prepends the Table of Contents (if present) to the note content for the LLM.
 * Copies the result to clipboard and shows a Notice.
 */
export async function generateNoteSummary(
    app: App,
    settings: MyPluginSettings,
    processMessages: (messages: Message[]) => Promise<Message[]>
) {
    debug("Starting generateNoteSummary");
    const activeFile = app.workspace.getActiveFile();
    if (!activeFile) {
        new Notice("No active note found.");
        return;
    }
    let noteContent = await app.vault.cachedRead(activeFile);
    noteContent = noteContent.slice(0, 15000);

    // Generate Table of Contents from all headers in the note
    const toc = generateTableOfContents(noteContent);

    // Compose the prompt
    let prompt =
        "You are a note summarizer. Read the note content and generate a concise summary (2–4 sentences) that captures the main ideas and purpose of the note. Do not include backslashes, forward slashes, or colons. Only output the summary as your response.\n\n";
    if (toc && toc.trim().length > 0) {
        prompt += "Table of Contents:\n" + toc + "\n\n";
    }
    prompt += noteContent;

    // Use the provider system
    try {
        debug("Provider:", settings.provider);
        const provider = createProvider(settings);
        // Compose messages: system = instruction, user = note content (with TOC)
        const messages: Message[] = [
            { role: "system", content: "You are a note summarizer. Read the note content and generate a concise summary (2–4 sentences) that captures the main ideas and purpose of the note. Do not include backslashes, forward slashes, or colons. Only output the summary as your response." },
            { role: "user", content: (toc && toc.trim().length > 0 ? "Table of Contents:\n" + toc + "\n\n" : "") + noteContent }
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

            // Ensure there are messages to send
            if (!processedMessages || processedMessages.length === 0) {
                debug("No processed messages!");
                new Notice("No valid messages to send to the model. Please check your note content.");
                return;
            }

            // Get completion (buffer streamed output)
            debug("Calling provider.getCompletion");
            let resultBuffer = "";
            await provider.getCompletion(processedMessages, {
                temperature: 0,
                streamCallback: (chunk: string) => {
                    resultBuffer += chunk;
                }
            });
            debug("Result from provider (buffered):", resultBuffer);

            let summary = resultBuffer.trim();
            debug("Extracted summary before sanitization:", summary);

            // Remove forbidden characters: backslashes, forward slashes, colons
            summary = summary.replace(/[\\/:]/g, "").trim();
            debug("Sanitized summary:", summary);

            if (summary && typeof summary === "string" && summary.length > 0) {
                const outputMode = settings.summaryOutputMode ?? "clipboard";
                debug("Output mode:", outputMode);
                if (outputMode === "metadata") {
                    // Insert or update summary in YAML frontmatter using helper
                    const file = app.workspace.getActiveFile();
                    if (file) {
                        await upsertYamlField(app, file, "summary", summary);
                        new Notice(`Inserted summary into metadata: ${summary}`);
                    }
                } else {
                    // Clipboard (default)
                    try {
                        await navigator.clipboard.writeText(summary);
                        new Notice(`Generated summary (copied): ${summary}`);
                    } catch (e) {
                        new Notice(`Generated summary: ${summary}`);
                    }
                }
            } else {
                debug("No summary generated after sanitization.");
                new Notice("No summary generated.");
            }
        } catch (processError) {
            debug("Error in processMessages or provider.getCompletion:", processError);
            (settings as any).enableContextNotes = originalEnableContextNotes;
            throw processError;
        }
    } catch (err) {
        new Notice("Error generating summary: " + (err?.message ?? err));
    }
}

/**
 * Insert or update a field in the YAML frontmatter of a note.
 * If the field exists, it is updated. If not, it is added.
 * If no frontmatter exists, it is created.
 */
export async function upsertYamlField(app: App, file: TFile, field: string, value: string) {
    let content = await app.vault.read(file);
    if (/^---\n[\s\S]*?\n---/.test(content)) {
        // Update or add field (replace all occurrences to avoid duplicates)
        content = content.replace(
            /^---\n([\s\S]*?)\n---/,
            (match, yaml) => {
                // Remove all existing field lines
                const cleanedYaml = yaml.replace(new RegExp(`^${field}:.*$`, "gm"), "").replace(/^\s*\n/gm, "");
                // Add the field at the top
                return "---\n" + `${field}: ${value}\n` + cleanedYaml.trimEnd() + "\n---";
            }
        );
    } else {
        // No frontmatter, add it
        content = `---\n${field}: ${value}\n---\n` + content;
    }
    await app.vault.modify(file, content);
}
