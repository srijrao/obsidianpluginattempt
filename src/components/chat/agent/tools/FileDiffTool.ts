import { App, Modal, Notice, TFile, Vault, Editor } from 'obsidian';
import { Diff, diffLines } from 'diff';
import { Tool, ToolResult } from '../ToolRegistry';
import { PathValidator } from './pathValidation';
import { debugLog } from '../../../../utils/logger';
import { isTFile } from '../../../../utils/typeguards';

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
 * DEPRECATED: Generates a formatted suggestion block string for insertion into a file.
 * This function was used to create suggestion blocks that pollute the file content.
 * Use showFileChangeSuggestionsModal instead.
 * @param suggestionText The suggested change (diff or text).
 * @returns The suggestion block string.
 */
function createSuggestionBlock(suggestionText: string): string {
  return `\`\`\`suggestion\n${suggestionText}\n\`\`\``;
}

/**
 * DEPRECATED: Inserts a file change suggestion into a target file as a code block.
 * This function directly modifies the file which pollutes it with suggestion blocks.
 * Use showFileChangeSuggestionsModal instead.
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
  console.warn('insertFileChangeSuggestion is deprecated. Use showFileChangeSuggestionsModal instead.');
  
  
  
  
  //
  
  
  
  
  
  
}

/**
 * DEPRECATED: Removes the first suggestion block (```suggestion ...```) from a file.
 * This function was used to clean up suggestion blocks from files.
 * No longer needed with the modal-based approach.
 * @param vault The Obsidian Vault instance.
 * @param file The TFile to clean up.
 */
export async function removeSuggestionBlockFromFile(vault: Vault, file: TFile): Promise<void> {
  console.warn('removeSuggestionBlockFromFile is deprecated. No longer needed with modal-based suggestions.');
  
  
  
  
  
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
    
    Array.from(contentEl.querySelectorAll('.suggestion-container, .no-suggestions')).forEach(el => el.remove());

    if (!this.suggestions.length) {
      contentEl.createEl('div', { text: 'No suggestions available.', cls: 'no-suggestions' });
      return;
    }

    this.suggestions.forEach((s, idx) => {
      const container = contentEl.createDiv('suggestion-container');
      container.createEl('h4', { text: s.file?.path || '(No file path)' });
      
      
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

      const btnRow = container.createDiv('suggestion-btn-row');
      const acceptBtn = btnRow.createEl('button', { text: 'Accept' });
      const rejectBtn = btnRow.createEl('button', { text: 'Reject' });
      
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

      acceptBtn.onclick = async () => {
        try {
          if (s.onAccept) await s.onAccept();
          new Notice('Suggestion accepted');
        } catch (e) {
          new Notice('Failed to accept suggestion: ' + (e?.message || e));
        }
        
        this.suggestions.splice(idx, 1);
        this.renderSuggestions();
        if (this.suggestions.length === 0) {
          this.close();
        }
      };
      rejectBtn.onclick = async () => {
        try {
          if (s.onReject) await s.onReject();
          new Notice('Suggestion rejected');
        } catch (e) {
          new Notice('Failed to reject suggestion: ' + (e?.message || e));
        }
        
        this.suggestions.splice(idx, 1);
        this.renderSuggestions();
        if (this.suggestions.length === 0) {
          this.close();
        }
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
 * DEPRECATED: Inserts a suggestion block inline at a specific line in the editor.
 * This function directly modifies the file content which is not the desired behavior.
 * Use showFileChangeSuggestionsModal instead.
 * @param editor The Obsidian Editor instance.
 * @param suggestionText The suggestion or diff string.
 * @param line The line number to insert the suggestion at.
 */
export function showInlineFileChangeSuggestion(
  editor: Editor,
  suggestionText: string,
  line: number
) {
  
  
  
  console.warn('showInlineFileChangeSuggestion is deprecated. Use showFileChangeSuggestionsModal instead.');
}

/**
 * DEPRECATED: Highlights a line in the editor to indicate a suggested change.
 * This function uses CodeMirror methods that are not available on the Obsidian Editor interface.
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
  
  
  
  
  
  
  console.warn('highlightFileChangeSuggestion is deprecated due to unsupported CodeMirror methods.');
}

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
 * DEPRECATED: Renders inline suggestions with highlights and strikethroughs, and adds accept/reject widgets.
 * This function uses CodeMirror methods that are not available on the Obsidian Editor interface.
 * Use showFileChangeSuggestionsModal instead.
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
  
  console.warn('renderInlineSuggestions is deprecated due to unsupported CodeMirror methods. Use showFileChangeSuggestionsModal instead.');
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
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
    filePath?: string; 
    originalContent?: string;
    suggestedContent: string;
    action?: 'compare' | 'apply' | 'suggest';
    insertPosition?: number;
    editor?: Editor; 
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

            
            if (!isTFile(file)) {
                debugLog(debugMode, 'warn', '[FileDiffTool] File not found or not a TFile:', filePath);
                return {
                    success: false,
                    error: `File not found: ${filePath}`
                };
            }

            const currentContent = originalContent || await this.app.vault.read(file);
            debugLog(debugMode, 'debug', '[FileDiffTool] Current content loaded.');

            
            let activeEditor = editor;
            if (!activeEditor) {
                activeEditor = await this.getOrOpenFileEditor(file, debugMode);
            }

            
            if (activeEditor) {
                return await this.showInlineSuggestion(activeEditor, file, currentContent, suggestedContent, insertPosition, debugMode);
            } else {
                
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

    private generateDiff(original: string, suggested: string, debugMode: boolean): string {
        debugLog(debugMode, 'debug', '[FileDiffTool] generateDiff called');
        const diffParts = diffLines(original, suggested);
        const diff: string[] = [];
        for (const part of diffParts) {
            const lines = part.value.split('\n');
            
            if (lines[lines.length - 1] === '') lines.pop();
            for (const line of lines) {
                if (part.added) {
                    diff.push(`+${line}`);
                } else if (part.removed) {
                    diff.push(`-${line}`);
                }
                
            }
        }
        debugLog(debugMode, 'debug', '[FileDiffTool] Diff result:', diff);
        return diff.join('\n');
    }

    /**
     * Gets an editor for the specified file, opening it if necessary
     */
    private async getOrOpenFileEditor(file: TFile, debugMode: boolean): Promise<Editor | undefined> {
        debugLog(debugMode, 'debug', '[FileDiffTool] Attempting to get or open editor for file:', file.path);
        
        try {
            
            const leaves = this.app.workspace.getLeavesOfType('markdown');
            for (const leaf of leaves) {
                if (leaf.view && 'file' in leaf.view && leaf.view.file === file) {
                    debugLog(debugMode, 'debug', '[FileDiffTool] Found existing editor for file');
                    if ('editor' in leaf.view && leaf.view.editor) {
                        
                        this.app.workspace.setActiveLeaf(leaf);
                        return leaf.view.editor as Editor;
                    }
                }
            }
            
            
            debugLog(debugMode, 'debug', '[FileDiffTool] File not open, attempting to open it');
            const leaf = this.app.workspace.getUnpinnedLeaf();
            if (leaf) {
                await leaf.openFile(file);
                
                await new Promise(resolve => setTimeout(resolve, 100));
                
                if (leaf.view && 'editor' in leaf.view && leaf.view.editor) {
                    debugLog(debugMode, 'debug', '[FileDiffTool] Successfully opened file and got editor');
                    return leaf.view.editor as Editor;
                }
            }
            
            debugLog(debugMode, 'warn', '[FileDiffTool] Could not get or create editor for file');
            return undefined;
        } catch (error) {
            debugLog(debugMode, 'error', '[FileDiffTool] Error getting or opening editor:', error);
            return undefined;
        }
    }

    /**
     * Utility function to clean up any remaining suggestion blocks from a file
     * Can be called manually if needed to remove leftover suggestion blocks
     */
    async cleanupSuggestionBlocks(filePath: string): Promise<ToolResult> {
        try {
            const file = this.app.vault.getAbstractFileByPath(filePath);
            if (!isTFile(file)) {
                return {
                    success: false,
                    error: `File not found: ${filePath}`
                };
            }

            const content = await this.app.vault.read(file);
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
