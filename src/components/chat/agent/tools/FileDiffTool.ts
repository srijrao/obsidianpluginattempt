import { App, TFile } from 'obsidian';
import { Tool, ToolResult } from '../ToolRegistry';
import { 
    FileChangeSuggestion, 
    insertFileChangeSuggestion, 
    showFileChangeSuggestionsModal,
    formatSuggestionForDisplay 
} from './../../../../components/chat/filediffhandler';
import { PathValidator } from './pathValidation';
import { debugLog } from '../../../../utils/logger';

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
