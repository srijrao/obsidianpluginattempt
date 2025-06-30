import { App, Modal, Notice, TFile, Vault, Editor } from 'obsidian';
import { Diff, diffLines } from 'diff';
import { Tool, ToolResult } from '../ToolRegistry';
import { PathValidator } from './pathValidation';
import { debugLog } from '../../../../utils/logger';


/**
 * Interface for a file change suggestion, including file details and callbacks.
 */
export interface FileChangeSuggestion {
  file: TFile;
  suggestionText: string;
  onAccept?: () => void;
  onReject?: () => void;
}

/**
 * Generates a formatted suggestion block string for insertion into a file.
 * @param suggestionText The suggested change (diff or text).
 * @returns The suggestion block string.
 */
function createSuggestionBlock(suggestionText: string): string {
  return `\`\`\`suggestion\n${suggestionText}\n\`\`\``;
}

/**
 * Inserts a file change suggestion into a target file as a code block.
 * @param vault The Obsidian Vault instance.
 * @param file The target TFile to insert the suggestion into.
 * @param suggestionText The suggested change (diff or text).
 * @param position Optional: line number to insert at (default: end of file).
 */
export async function insertFileChangeSuggestion(
  vault: Vault,
  file: TFile,
  suggestionText: string,
  position?: number
): Promise<void> {
  const content = await vault.read(file);
  const lines = content.split('\n');
  const suggestionBlock = createSuggestionBlock(suggestionText);

  if (position !== undefined && position >= 0 && position <= lines.length) {
    lines.splice(position, 0, suggestionBlock);
  } else {
    lines.push(suggestionBlock);
  }
  await vault.modify(file, lines.join('\n'));
}

/**
 * Removes the first suggestion block (```suggestion ...```) from a file.
 * @param vault The Obsidian Vault instance.
 * @param file The TFile to clean up.
 */
export async function removeSuggestionBlockFromFile(vault: Vault, file: TFile): Promise<void> {
  const content = await vault.read(file);
  // Regex to match a suggestion code block (greedy, multiline)
  const newContent = content.replace(/```suggestion[\s\S]*?```\s*/m, '');
  await vault.modify(file, newContent);
}

/**
 * Modal dialog to display multiple file change suggestions.
 */
class FileChangeSuggestionsModal extends Modal {
  suggestions: FileChangeSuggestion[];

  constructor(app: App, suggestions: FileChangeSuggestion[]) {
    super(app);
    this.suggestions = suggestions;
  }

  async onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('ai-assistant-modal');
    // Set modal size directly
    contentEl.style.minWidth = '600px';
    contentEl.style.maxWidth = '80vw';
    contentEl.style.minHeight = '400px';
    contentEl.style.maxHeight = '80vh';
    contentEl.style.overflowY = 'auto';
    contentEl.createEl('h2', { text: 'File Change Suggestions' });

    this.renderSuggestions();
  }

  renderSuggestions() {
    const { contentEl } = this;
    // Remove all suggestion containers except the title
    Array.from(contentEl.querySelectorAll('.suggestion-container, .no-suggestions')).forEach(el => el.remove());

    if (!this.suggestions.length) {
      contentEl.createEl('div', { text: 'No suggestions available.', cls: 'no-suggestions' });
      return;
    }

    this.suggestions.forEach((s, idx) => {
      const container = contentEl.createDiv('suggestion-container');
      container.createEl('h4', { text: s.file?.path || '(No file path)' });
      container.createEl('pre', { text: s.suggestionText || '(No suggestion text)' });

      const btnRow = container.createDiv('suggestion-btn-row');
      const acceptBtn = btnRow.createEl('button', { text: 'Accept' });
      const rejectBtn = btnRow.createEl('button', { text: 'Reject' });

      acceptBtn.onclick = async () => {
        try {
          if (s.onAccept) await s.onAccept();
          new Notice('Suggestion accepted');
        } catch (e) {
          new Notice('Failed to accept suggestion: ' + (e?.message || e));
        }
        // Remove this suggestion and re-render
        this.suggestions.splice(idx, 1);
        this.renderSuggestions();
      };
      rejectBtn.onclick = async () => {
        try {
          if (s.onReject) await s.onReject();
          await removeSuggestionBlockFromFile(this.app.vault, s.file);
          new Notice('Suggestion rejected and cleaned up');
        } catch (e) {
          new Notice('Failed to reject suggestion: ' + (e?.message || e));
        }
        // Remove this suggestion and re-render
        this.suggestions.splice(idx, 1);
        this.renderSuggestions();
      };
    });
  }

  onClose() {
    this.contentEl.empty();
  }
}

/**
 * Displays file change suggestions in a modal dialog.
 * 
 * This function creates and opens a modal dialog that lists all provided file change suggestions.
 * Each suggestion includes the file path, the suggested change text, and buttons for accepting or rejecting the suggestion.
 * When a user clicks "Accept" or "Reject", the corresponding callback functions (`onAccept` or `onReject`) are invoked if provided.
 * 
 * Behavior:
 * - The modal displays suggestions in a scrollable list if there are many suggestions.
 * - Clicking "Accept" triggers the `onAccept` callback, shows a notice, and closes the modal.
 * - Clicking "Reject" triggers the `onReject` callback, shows a notice, and closes the modal.
 * - If no callbacks are provided, the buttons simply close the modal without further action.
 * 
 * Edge Cases:
 * - If the `suggestions` array is empty, the modal will display a message indicating no suggestions are available.
 * - If a suggestion lacks a file path or suggestion text, it will still be displayed but may appear incomplete.
 * 
 * @param app The Obsidian App instance.
 * @param suggestions Array of FileChangeSuggestion objects, each containing file details and optional callbacks.
 */
export function showFileChangeSuggestionsModal(
  app: App,
  suggestions: FileChangeSuggestion[]
) {
  new FileChangeSuggestionsModal(app, suggestions).open();
}

/**
 * Utility to format a diff or suggestion for display in the UI.
 * Highlights added lines in green and removed lines in red.
 * @param suggestionText The suggestion or diff string.
 * @returns Formatted HTML string.
 */
export function formatSuggestionForDisplay(suggestionText: string): string {
  const html = suggestionText
    .split('\n')
    .map(line => {
      if (line.startsWith('+')) return `<span class="suggestion-add">${line}</span>`;
      if (line.startsWith('-')) return `<span class="suggestion-remove">${line}</span>`;
      return line;
    })
    .join('<br>');
  return `<pre>${html}</pre>`;
}

/**
 * Inserts a suggestion block inline at a specific line in the editor.
 * @param editor The Obsidian Editor instance.
 * @param suggestionText The suggestion or diff string.
 * @param line The line number to insert the suggestion at.
 */
export function showInlineFileChangeSuggestion(
  editor: Editor,
  suggestionText: string,
  line: number
) {
  const suggestionBlock = createSuggestionBlock(suggestionText);
  editor.replaceRange(suggestionBlock, { line, ch: 0 });
}

/**
 * Highlights a line in the editor to indicate a suggested change.
 * @param editor The Obsidian Editor instance.
 * @param line The line number to highlight.
 * @param className Optional: CSS class for custom highlight styling.
 * @param duration Optional: How long to keep the highlight (ms).
 */
export function highlightFileChangeSuggestion(
  editor: Editor,
  line: number,
  className = 'ai-suggestion-highlight',
  duration = 2000
) {
  // @ts-ignore: CodeMirror's addLineClass is available in Obsidian's Editor but is not part of the TypeScript definitions.
  const handle = editor.addLineClass(line, 'background', className);
  setTimeout(() => {
    // @ts-ignore: CodeMirror's removeLineClass is available in Obsidian's Editor.
    // @ts-ignore: CodeMirror's removeLineClass is available in Obsidian's Editor but not in its type definitions.
    editor.removeLineClass(line, 'background', className);
  }, duration);
}

// Constants for button symbols
const BUTTON_SYMBOLS = {
  accept: '✓',
  reject: '✗',
};

/**
 * Creates an HTML widget for accepting or rejecting an inline suggestion.
 * @param idx The index of the change in the changes array.
 * @param onAccept Callback function for accepting the suggestion.
 * @param onReject Callback function for rejecting the suggestion.
 * @returns The created HTMLElement widget.
 */
function createSuggestionWidget(
  idx: number,
  onAccept: (i: number) => void,
  onReject: (i: number) => void
): HTMLElement {
  const widget = document.createElement('span');
  widget.className = 'ai-suggestion-widget';

  const acceptBtn = document.createElement('button');
  acceptBtn.textContent = BUTTON_SYMBOLS.accept;
  acceptBtn.title = 'Accept suggestion';
  acceptBtn.onclick = (e) => {
    e.preventDefault();
    onAccept(idx);
  };

  const rejectBtn = document.createElement('button');
  rejectBtn.textContent = BUTTON_SYMBOLS.reject;
  rejectBtn.title = 'Reject suggestion';
  rejectBtn.onclick = (e) => {
    e.preventDefault();
    onReject(idx);
  };

  widget.appendChild(acceptBtn);
  widget.appendChild(rejectBtn);
  return widget;
}

/**
 * Renders inline suggestions with highlights and strikethroughs, and adds accept/reject widgets.
 * This mimics the visuals and UX of obsidian-proofreader.
 * @param editor The Obsidian Editor instance.
 * @param changes Array of change objects, each with `from`, `to`, `text`, and `type` ('add' | 'remove').
 * @param onAccept Callback for accepting a specific change.
 * @param onReject Callback for rejecting a specific change.
 */
export function renderInlineSuggestions(
  editor: Editor,
  changes: Array<{
    from: { line: number; ch: number };
    to: { line: number; ch: number };
    text: string;
    type: 'add' | 'remove';
  }>,
  onAccept: (changeIdx: number) => void,
  onReject: (changeIdx: number) => void
) {
  const batchSize = 50; // Process changes in batches of 50
  for (let i = 0; i < changes.length; i += batchSize) {
    const batch = changes.slice(i, i + batchSize);
    batch.forEach((change, idx) => {
      const className = change.type === 'add' ? 'ai-suggestion-add' : 'ai-suggestion-remove';
      // @ts-ignore: CodeMirror's markText is available in Obsidian's Editor but is not part of the TypeScript definitions for the Editor interface.
      editor.markText(change.from, change.to, {
        className,
        clearOnEnter: false,
        title: change.type === 'add' ? 'Suggested addition' : 'Suggested removal',
      });
      // @ts-ignore: CodeMirror's addWidget is available in Obsidian's Editor but is not included in the TypeScript type definitions.
      editor.addWidget(change.to, createSuggestionWidget(idx + i, onAccept, onReject), false);
    });
  }
}

/**
 * Interface representing a change in a line of text.
 */
export interface LineChange {
  type: 'add' | 'remove' | 'context';
  value: string;
  line: number; // line number in the original or new file
}

/**
 * Generate a list of line changes between two texts.
 * @param oldText The original file content.
 * @param newText The new (suggested) file content.
 * @returns Array of LineChange objects.
 */
export function getLineChanges(oldText: string, newText: string): LineChange[] {
  const diff = diffLines(oldText, newText);
  const changes: LineChange[] = [];
  let oldLine = 0;
  let newLine = 0;
  for (const part of diff) {
    const lines = part.value.split('\n');
    // Remove trailing empty string from split if present
    if (lines[lines.length - 1] === '') lines.pop();
    for (const line of lines) {
      if (part.added) {
        changes.push({ type: 'add', value: line, line: newLine });
        newLine++;
      } else if (part.removed) {
        changes.push({ type: 'remove', value: line, line: oldLine });
        oldLine++;
      } else {
        changes.push({ type: 'context', value: line, line: oldLine });
        oldLine++;
        newLine++;
      }
    }
  }
  return changes;
}

export interface FileDiffParams {
    path: string;
    filePath?: string; // Legacy support
    originalContent?: string;
    suggestedContent: string;
    action?: 'compare' | 'apply' | 'suggest';
    insertPosition?: number;
}

export class FileDiffTool implements Tool {
    name = 'file_diff';
    description = 'Manages file changes: presents suggestions for user review. This tool is essential for precise file manipulation and collaborative editing workflows.';
    parameters = {
        path: {
            type: 'string',
            description: 'Path to the file.',
            required: true
        },
        originalContent: {
            type: 'string',
            description: 'Original content for comparison.',
            required: false
        },
        suggestedContent: {
            type: 'string',
            description: 'New content for the file.',
            required: true
        },
        insertPosition: {
            type: 'number',
            description: 'Line number for suggestion insertion.',
            required: false
        }
    };

    private pathValidator: PathValidator;

    constructor(private app: App) {
        this.pathValidator = new PathValidator(app);
    }

    async execute(params: FileDiffParams, context: any): Promise<ToolResult> {
        const debugMode = context?.plugin?.settings?.debugMode ?? true;
        debugLog(debugMode, 'debug', '[FileDiffTool] execute called with params:', params);

        // Normalize parameter names for backward compatibility
        const inputPath = params.path || params.filePath;
        // Fallback: support legacy 'text' param as 'suggestedContent'
        const suggestedContent = params.suggestedContent || (params as any).text;
        const { originalContent, insertPosition } = params;

        if (inputPath === undefined || inputPath === null) {
            debugLog(debugMode, 'warn', '[FileDiffTool] Missing path parameter');
            return {
                success: false,
                error: 'path parameter is required'
            };
        }

        // Validate and normalize the path to ensure it's within the vault
        let filePath: string;
        try {
            filePath = this.pathValidator.validateAndNormalizePath(inputPath);
            debugLog(debugMode, 'debug', '[FileDiffTool] Normalized filePath:', filePath);
        } catch (error: any) {
            debugLog(debugMode, 'error', '[FileDiffTool] Path validation failed:', error);
            return {
                success: false,
                error: `Path validation failed: ${error.message}`
            };
        }

        if (!suggestedContent) {
            debugLog(debugMode, 'warn', '[FileDiffTool] Missing suggestedContent parameter');
            return {
                success: false,
                error: 'suggestedContent parameter is required'
            };
        }

        try {
            const file = this.app.vault.getAbstractFileByPath(filePath);
            debugLog(debugMode, 'debug', '[FileDiffTool] Got file:', file);

            if (!file || !(file instanceof TFile)) {
                debugLog(debugMode, 'warn', '[FileDiffTool] File not found or not a TFile:', filePath);
                return {
                    success: false,
                    error: `File not found: ${filePath}`
                };
            }

            const currentContent = originalContent || await this.app.vault.read(file);
            debugLog(debugMode, 'debug', '[FileDiffTool] Current content loaded. Only suggest action supported.');

            // Always show suggestion
            return await this.showSuggestion(file, currentContent, suggestedContent, insertPosition, debugMode);
        } catch (error: any) {
            debugLog(debugMode, 'error', '[FileDiffTool] Failed to process file diff:', error);
            return {
                success: false,
                error: `Failed to process file diff: ${error.message}`
            };
        }
    }

    async showSuggestion(file: TFile, currentContent: string, suggestedContent: string, insertPosition: number | undefined, debugMode: boolean): Promise<ToolResult> {
        debugLog(debugMode, 'debug', '[FileDiffTool] showSuggestion called');
        const diff = this.generateDiff(currentContent, suggestedContent, debugMode);
        debugLog(debugMode, 'debug', '[FileDiffTool] Suggestion diff:', diff);

        if (diff.length === 0) {
            debugLog(debugMode, 'debug', '[FileDiffTool] No changes detected');
            return {
                success: true,
                data: {
                    action: 'suggest',
                    filePath: file.path,
                    message: 'No changes detected'
                }
            };
        }

        try {
            // Create suggestion with callbacks
            const suggestion: FileChangeSuggestion = {
                file,
                suggestionText: diff,
                onAccept: () => {
                    debugLog(debugMode, 'debug', '[FileDiffTool] Suggestion accepted for file:', file.path);
                    this.app.vault.modify(file, suggestedContent);
                },
                onReject: () => {
                    debugLog(debugMode, 'debug', '[FileDiffTool] Suggestion rejected for file:', file.path);
                    // Do nothing on reject
                }
            };

            // Option 1: Show modal UI
            debugLog(debugMode, 'debug', '[FileDiffTool] Showing file change suggestions modal');
            showFileChangeSuggestionsModal(this.app, [suggestion]);

            // Option 2: Insert suggestion block into file (if insertPosition provided)
            if (insertPosition !== undefined) {
                debugLog(debugMode, 'debug', '[FileDiffTool] Inserting suggestion block at position:', insertPosition);
                await insertFileChangeSuggestion(this.app.vault, file, diff, insertPosition);
            }

            return {
                success: true,
                data: {
                    action: 'suggest',
                    filePath: file.path,
                    diff,
                    suggestionInserted: insertPosition !== undefined
                }
            };
        } catch (error: any) {
            debugLog(debugMode, 'error', '[FileDiffTool] Failed to show suggestion:', error);
            return {
                success: false,
                error: `Failed to show suggestion: ${error.message}`
            };
        }
    }

    private generateDiff(original: string, suggested: string, debugMode: boolean): string {
        // TODO: For large files, consider using a more efficient diff algorithm/library (e.g. diff-match-patch)
        debugLog(debugMode, 'debug', '[FileDiffTool] generateDiff called');
        const originalLines = original.split('\n');
        const suggestedLines = suggested.split('\n');
        const diff: string[] = [];
        const maxLines = Math.max(originalLines.length, suggestedLines.length);
        for (let i = 0; i < maxLines; i++) {
            const originalLine = originalLines[i] || '';
            const suggestedLine = suggestedLines[i] || '';
            if (originalLine !== suggestedLine) {
                if (originalLine && !suggestedLine) {
                    diff.push(`-${originalLine}`);
                } else if (!originalLine && suggestedLine) {
                    diff.push(`+${suggestedLine}`);
                } else if (originalLine !== suggestedLine) {
                    diff.push(`-${originalLine}`);
                    diff.push(`+${suggestedLine}`);
                }
            }
        }
        debugLog(debugMode, 'debug', '[FileDiffTool] Diff result:', diff);
        return diff.join('\n');
    }
}
