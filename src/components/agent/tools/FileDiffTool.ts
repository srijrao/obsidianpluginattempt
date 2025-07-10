import { App, Modal, Notice, TFile, Vault, Editor } from 'obsidian';
import { diffLines } from 'diff';
import type { Change } from 'diff';
import { Tool, ToolResult } from '../ToolRegistry';
import { PathValidator } from './pathValidation';
import { debugLog } from '../../../utils/logger';
import { isTFile } from '../../../utils/typeGuards';
import { getOrOpenFileEditor } from '../../../utils/editorUtils';
import { getTFileByPath } from '../../../utils/fileUtils'; // Import the new utility

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
 * Modal dialog to display multiple file change suggestions.
 * Each suggestion can be accepted or rejected by the user.
 */
class FileChangeSuggestionsModal extends Modal {
  suggestions: FileChangeSuggestion[];

  constructor(app: App, suggestions: FileChangeSuggestion[]) {
    super(app);
    this.suggestions = suggestions;
  }

  /**
   * Called when the modal is opened.
   * Sets up the modal UI and renders suggestions.
   */
  async onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('ai-assistant-modal');
    // Set modal size and style
    contentEl.style.minWidth = '600px';
    contentEl.style.maxWidth = '80vw';
    contentEl.style.minHeight = '400px';
    contentEl.style.maxHeight = '80vh';
    contentEl.style.overflowY = 'auto';
    contentEl.createEl('h2', { text: 'File Change Suggestions' });

    this.renderSuggestions();
  }

  /**
   * Renders all suggestions in the modal.
   * Each suggestion shows the file path, diff, and accept/reject buttons.
   */
  renderSuggestions() {
    const { contentEl } = this;
    // Remove previous suggestion containers
    Array.from(contentEl.querySelectorAll('.suggestion-container, .no-suggestions')).forEach(el => el.remove());

    if (!this.suggestions.length) {
      contentEl.createEl('div', { text: 'No suggestions available.', cls: 'no-suggestions' });
      return;
    }

    this.suggestions.forEach((s, idx) => {
      const container = contentEl.createDiv('suggestion-container');
      container.createEl('h4', { text: s.file?.path || '(No file path)' });

      // Render the diff/suggestion text with color coding
      const diffEl = container.createEl('pre', { cls: 'suggestion-diff' });
      diffEl.style.backgroundColor = '#f5f5f5';
      diffEl.style.border = '1px solid #ddd';
      diffEl.style.borderRadius = '4px';
      diffEl.style.padding = '12px';
      diffEl.style.maxHeight = '300px';
      diffEl.style.overflowY = 'auto';
      diffEl.style.fontSize = '12px';
      diffEl.style.lineHeight = '1.4';

      if (s.suggestionText) {
        const lines = s.suggestionText.split('\n');
        lines.forEach(line => {
          const lineEl = diffEl.createEl('div');
          if (line.startsWith('+')) {
            lineEl.style.backgroundColor = '#d4edda';
            lineEl.style.color = '#155724';
          } else if (line.startsWith('-')) {
            lineEl.style.backgroundColor = '#f8d7da';
            lineEl.style.color = '#721c24';
          }
          lineEl.textContent = line;
        });
      } else {
        diffEl.textContent = '(No suggestion text)';
      }

      // Accept/Reject buttons
      const btnRow = container.createDiv('suggestion-btn-row');
      const acceptBtn = btnRow.createEl('button', { text: 'Accept' });
      const rejectBtn = btnRow.createEl('button', { text: 'Reject' });

      // Style buttons
      acceptBtn.style.backgroundColor = '#28a745';
      acceptBtn.style.color = 'white';
      acceptBtn.style.border = 'none';
      acceptBtn.style.padding = '8px 16px';
      acceptBtn.style.marginRight = '8px';
      acceptBtn.style.borderRadius = '4px';
      acceptBtn.style.cursor = 'pointer';

      rejectBtn.style.backgroundColor = '#dc3545';
      rejectBtn.style.color = 'white';
      rejectBtn.style.border = 'none';
      rejectBtn.style.padding = '8px 16px';
      rejectBtn.style.borderRadius = '4px';
      rejectBtn.style.cursor = 'pointer';

      // Accept button handler
      acceptBtn.onclick = async () => {
        try {
          if (s.onAccept) await s.onAccept();
          new Notice('Suggestion accepted');
        } catch (e) {
          new Notice('Failed to accept suggestion: ' + (e?.message || e));
        }
        // Remove suggestion and re-render
        this.suggestions.splice(idx, 1);
        this.renderSuggestions();
        if (this.suggestions.length === 0) {
          this.close();
        }
      };
      // Reject button handler
      rejectBtn.onclick = async () => {
        try {
          if (s.onReject) await s.onReject();
          new Notice('Suggestion rejected');
        } catch (e) {
          new Notice('Failed to reject suggestion: ' + (e?.message || e));
        }
        // Remove suggestion and re-render
        this.suggestions.splice(idx, 1);
        this.renderSuggestions();
        if (this.suggestions.length === 0) {
          this.close();
        }
      };
    });
  }

  /**
   * Called when the modal is closed.
   * Cleans up the modal content.
   */
  onClose() {
    this.contentEl.empty();
  }
}

/**
 * Displays file change suggestions in a modal dialog.
 * Each suggestion can be accepted or rejected by the user.
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
 * Interface representing a change in a line of text.
 */
export interface LineChange {
  type: 'add' | 'remove' | 'context';
  value: string;
  line: number; 
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
    // Remove trailing empty line from split
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

/**
 * Parameters for the file diff tool.
 */
export interface FileDiffParams {
    path: string;
    filePath?: string; 
    originalContent?: string;
    suggestedContent: string;
    action?: 'compare' | 'apply' | 'suggest';
    insertPosition?: number;
    editor?: Editor; 
}

/**
 * Tool for managing file diffs and presenting suggestions for user review.
 * Supports diff generation, modal suggestion display, and file modification.
 */
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

    /**
     * Executes the file diff tool.
     * Loads the file, generates a diff, and presents a modal for user review.
     * @param params FileDiffParams
     * @param context Execution context (may include debugMode)
     * @returns ToolResult indicating success or failure
     */
    async execute(params: FileDiffParams, context: any): Promise<ToolResult> {
        const debugMode = context?.plugin?.settings?.debugMode ?? true;
        debugLog(debugMode, 'debug', '[FileDiffTool] execute called with params:', params);

        // Use either 'path' or legacy 'filePath'
        const inputPath = params.path || params.filePath;
        const suggestedContent = params.suggestedContent || (params as any).text;
        const { originalContent, insertPosition, editor } = params;

        if (inputPath === undefined || inputPath === null) {
            debugLog(debugMode, 'warn', '[FileDiffTool] Missing path parameter');
            return {
                success: false,
                error: 'path parameter is required'
            };
        }

        // Validate and normalize the input path
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
            const file = getTFileByPath(this.app, filePath, debugMode); // Use the utility function
            debugLog(debugMode, 'debug', '[FileDiffTool] Got file:', file);

            // Ensure file exists and is a TFile
            if (!file) {
                debugLog(debugMode, 'warn', '[FileDiffTool] File not found or not a TFile:', filePath);
                return {
                    success: false,
                    error: `File not found: ${filePath}`
                };
            }

            // Use provided originalContent or read from file
            const currentContent = originalContent || await this.app.vault.read(file);
            debugLog(debugMode, 'debug', '[FileDiffTool] Current content loaded.');

            // Try to get an active editor for the file
            let activeEditor = editor;
            if (!activeEditor) {
                activeEditor = await getOrOpenFileEditor(this.app, file, debugMode); // Use the utility function
            }

            // If editor is available, show modal suggestion
            if (activeEditor) {
                return await this.showInlineSuggestion(activeEditor, file, currentContent, suggestedContent, insertPosition, debugMode);
            } else {
                // No editor: generate text-based diff suggestion
                debugLog(debugMode, 'debug', '[FileDiffTool] No editor available, generating text-based diff suggestion');
                const diff = this.generateDiff(currentContent, suggestedContent, debugMode);

                if (diff.length === 0) {
                    debugLog(debugMode, 'debug', '[FileDiffTool] No changes detected');
                    return {
                        success: true,
                        data: {
                            action: 'suggest',
                            filePath: file.path,
                            message: 'No changes detected between current and suggested content'
                        }
                    };
                }

                return {
                    success: true,
                    data: {
                        action: 'suggest',
                        filePath: file.path,
                        diff: diff,
                        originalContent: currentContent,
                        suggestedContent: suggestedContent,
                        message: `Suggested changes for ${file.path}:\n\n${diff}`
                    }
                };
            }
        } catch (error: any) {
            debugLog(debugMode, 'error', '[FileDiffTool] Failed to process file diff:', error);
            return {
                success: false,
                error: `Failed to process file diff: ${error.message}`
            };
        }
    }

    /**
     * Shows a modal with the diff suggestion and handles user acceptance/rejection.
     * @param editor The active editor for the file.
     * @param file The TFile being edited.
     * @param currentContent The current file content.
     * @param suggestedContent The new content to suggest.
     * @param insertPosition Optional line number for insertion.
     * @param debugMode Whether to log debug output.
     * @returns ToolResult indicating modal was shown.
     */
    async showInlineSuggestion(editor: Editor, file: TFile, currentContent: string, suggestedContent: string, insertPosition: number | undefined, debugMode: boolean): Promise<ToolResult> {
        debugLog(debugMode, 'debug', '[FileDiffTool] showInlineSuggestion called');
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

        // Show modal with suggestion
        debugLog(debugMode, 'debug', '[FileDiffTool] Showing file change suggestion modal');
        const suggestion: FileChangeSuggestion = {
            file: file,
            suggestionText: diff,
            onAccept: async () => {
                debugLog(debugMode, 'debug', '[FileDiffTool] User accepted suggestion');
                await this.app.vault.modify(file, suggestedContent);
                new Notice(`Applied changes to ${file.path}`);
            },
            onReject: async () => {
                debugLog(debugMode, 'debug', '[FileDiffTool] User rejected suggestion');
                new Notice(`Rejected changes to ${file.path}`);
            }
        };

        showFileChangeSuggestionsModal(this.app, [suggestion]);

        return {
            success: true,
            data: {
                action: 'modal-suggest',
                filePath: file.path,
                diff,
                message: `Showing diff suggestion modal for ${file.path}`
            }
        };
    }

    /**
     * Generates a unified diff string between the original and suggested content.
     * Uses the diffLines function to compute line-by-line differences.
     * Lines added are prefixed with '+', removed with '-', unchanged lines are omitted.
     * @param original The original file content.
     * @param suggested The new (suggested) file content.
     * @param debugMode Whether to log debug output.
     * @returns A unified diff string.
     */
    private generateDiff(original: string, suggested: string, debugMode: boolean): string {
        debugLog(debugMode, 'debug', '[FileDiffTool] generateDiff called');
        const diffParts = diffLines(original, suggested);
        const diff: string[] = [];
        for (const part of diffParts) {
            const lines = part.value.split('\n');
            // Remove trailing empty line from split
            if (lines[lines.length - 1] === '') lines.pop();
            for (const line of lines) {
                if (part.added) {
                    diff.push(`+${line}`); // Added lines
                } else if (part.removed) {
                    diff.push(`-${line}`); // Removed lines
                }
                // Context (unchanged) lines are omitted from the diff output
            }
        }
        debugLog(debugMode, 'debug', '[FileDiffTool] Diff result:', diff);
        return diff.join('\n');
    }

    /**
     * Utility function to clean up any remaining suggestion blocks from a file.
     * Can be called manually if needed to remove leftover suggestion blocks.
     * @param filePath The path of the file to clean up.
     * @returns ToolResult indicating cleanup status.
     */
    async cleanupSuggestionBlocks(filePath: string): Promise<ToolResult> {
        const debugMode = true; // Assuming debugMode is always true for cleanup, or pass it as a parameter
        try {
            const file = getTFileByPath(this.app, filePath, debugMode); // Use the utility function
            if (!file) {
                return {
                    success: false,
                    error: `File not found: ${filePath}`
                };
            }

            const content = await this.app.vault.read(file);
            // Remove all suggestion blocks from the file content
            const cleanedContent = content.replace(/```suggestion[\s\S]*?```\s*/gm, '');
            if (content !== cleanedContent) {
                await this.app.vault.modify(file, cleanedContent);
                return {
                    success: true,
                    data: {
                        action: 'cleanup',
                        filePath: file.path,
                        message: 'Cleaned up suggestion blocks from file'
                    }
                };
            } else {
                return {
                    success: true,
                    data: {
                        action: 'cleanup',
                        filePath: file.path,
                        message: 'No suggestion blocks found to clean up'
                    }
                };
            }
        } catch (error: any) {
            return {
                success: false,
                error: `Failed to clean up suggestion blocks: ${error.message}`
            };
        }
    }
}
