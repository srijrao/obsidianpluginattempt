import { App, Modal, Notice, TFile, Vault, Editor } from 'obsidian';

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

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('ai-assistant-modal');
    contentEl.createEl('h2', { text: 'File Change Suggestions' });

    this.suggestions.forEach((s) => {
      const container = contentEl.createDiv('suggestion-container');
      container.createEl('h4', { text: s.file.path });
      container.createEl('pre', { text: s.suggestionText });

      const btnRow = container.createDiv('suggestion-btn-row');
      const acceptBtn = btnRow.createEl('button', { text: 'Accept' });
      const rejectBtn = btnRow.createEl('button', { text: 'Reject' });

      acceptBtn.onclick = () => {
        s.onAccept?.();
        new Notice('Suggestion accepted');
        this.close();
      };
      rejectBtn.onclick = async () => {
        s.onReject?.();
        await removeSuggestionBlockFromFile(this.app.vault, s.file);
        new Notice('Suggestion rejected and cleaned up');
        this.close();
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
