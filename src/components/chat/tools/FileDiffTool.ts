import { App, TFile } from 'obsidian';
import { Tool, ToolResult } from '../agent/ToolRegistry';
import { 
    FileChangeSuggestion, 
    insertFileChangeSuggestion, 
    showFileChangeSuggestionsModal,
    formatSuggestionForDisplay 
} from '../filediffhandler';
import { PathValidator } from './pathValidation';

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
    description = 'Compare and suggest changes to files';    parameters = {
        path: {
            type: 'string',
            description: 'Path to the file to compare/modify (relative to vault root or absolute path within vault)',
            required: true
        },
        originalContent: {
            type: 'string',
            description: 'Original content for comparison (if not provided, reads from file)',
            required: false
        },
        suggestedContent: {
            type: 'string',
            description: 'Suggested new content for the file',
            required: true
        },
        action: {
            type: 'string',
            enum: ['compare', 'apply', 'suggest'],
            description: 'Action to perform: compare files, apply changes, or show suggestion UI',
            default: 'suggest'
        },
        insertPosition: {
            type: 'number',
            description: 'Line number to insert suggestion at (for suggest action)',
            required: false
        }
    };

    private pathValidator: PathValidator;

    constructor(private app: App) {
        this.pathValidator = new PathValidator(app);
    }    async execute(params: FileDiffParams, context: any): Promise<ToolResult> {
        // Normalize parameter names for backward compatibility
        const inputPath = params.path || params.filePath;
        // Fallback: support legacy 'text' param as 'suggestedContent'
        const suggestedContent = params.suggestedContent || (params as any).text;
        const { originalContent, action = 'suggest', insertPosition } = params;

        if (inputPath === undefined || inputPath === null) {
            return {
                success: false,
                error: 'path parameter is required'
            };
        }

        // Validate and normalize the path to ensure it's within the vault
        let filePath: string;
        try {
            filePath = this.pathValidator.validateAndNormalizePath(inputPath);
        } catch (error: any) {
            return {
                success: false,
                error: `Path validation failed: ${error.message}`
            };
        }

        if (!suggestedContent) {
            return {
                success: false,
                error: 'suggestedContent parameter is required'
            };
        }

        try {
            const file = this.app.vault.getAbstractFileByPath(filePath);
            
            if (!file || !(file instanceof TFile)) {
                return {
                    success: false,
                    error: `File not found: ${filePath}`
                };
            }

            const currentContent = originalContent || await this.app.vault.read(file);

            switch (action) {
                case 'compare':
                    return this.compareFiles(currentContent, suggestedContent, filePath);
                
                case 'apply':
                    return this.applyChanges(file, suggestedContent);
                
                case 'suggest':
                default:
                    return this.showSuggestion(file, currentContent, suggestedContent, insertPosition);
            }
        } catch (error: any) {
            return {
                success: false,
                error: `Failed to process file diff: ${error.message}`
            };
        }
    }

    private compareFiles(originalContent: string, suggestedContent: string, filePath: string): ToolResult {
        const diff = this.generateDiff(originalContent, suggestedContent);
        
        return {
            success: true,
            data: {
                action: 'compare',
                filePath,
                diff,
                formattedDiff: formatSuggestionForDisplay(diff),
                hasChanges: diff.length > 0
            }
        };
    }

    private async applyChanges(file: TFile, suggestedContent: string): Promise<ToolResult> {
        try {
            await this.app.vault.modify(file, suggestedContent);
            
            return {
                success: true,
                data: {
                    action: 'apply',
                    filePath: file.path,
                    size: suggestedContent.length
                }
            };
        } catch (error: any) {
            return {
                success: false,
                error: `Failed to apply changes: ${error.message}`
            };
        }
    }

    private async showSuggestion(
        file: TFile, 
        originalContent: string, 
        suggestedContent: string, 
        insertPosition?: number
    ): Promise<ToolResult> {
        const diff = this.generateDiff(originalContent, suggestedContent);
        
        if (diff.length === 0) {
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
                    this.app.vault.modify(file, suggestedContent);
                },
                onReject: () => {
                    // Do nothing on reject
                }
            };

            // Option 1: Show modal UI
            showFileChangeSuggestionsModal(this.app, [suggestion]);

            // Option 2: Insert suggestion block into file (if insertPosition provided)
            if (insertPosition !== undefined) {
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
            return {
                success: false,
                error: `Failed to show suggestion: ${error.message}`
            };
        }
    }

    private generateDiff(original: string, suggested: string): string {
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
        
        return diff.join('\n');
    }
}
