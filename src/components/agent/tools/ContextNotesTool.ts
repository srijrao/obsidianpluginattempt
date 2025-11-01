import { App } from 'obsidian';
import { Tool, ToolResult } from '../ToolRegistry';
import MyPlugin from '../../../main';

type ContextAction = 'clear' | 'add_current' | 'add_all_open';

export class ContextNotesTool implements Tool {
    name = 'context_notes_manage';
    description = 'Manage context notes; set action to "clear" (use confirm=true) to remove all notes, "add_current" to include the active note, or "add_all_open" to capture open notes (optionally limit with maxNotes or override duplicates with force).';
    parameters = {
        action: {
            type: 'string',
            description: 'Action to perform: "clear", "add_current", or "add_all_open".',
            required: true,
            enum: ['clear', 'add_current', 'add_all_open']
        },
        confirm: {
            type: 'boolean',
            description: 'Set to true when action="clear" to confirm removing all context notes.',
            required: false
        },
        force: {
            type: 'boolean',
            description: 'Force adding notes even if they already exist (used with add_current or add_all_open).',
            required: false
        },
        maxNotes: {
            type: 'number',
            description: 'Maximum number of open notes to add when action="add_all_open".',
            required: false
        }
    };

    constructor(private app?: App, private plugin?: MyPlugin) {}

    async execute(params: any, context: any): Promise<ToolResult> {
        const actualParams = params?.parameters || params || {};
        const action = actualParams.action as ContextAction | undefined;
        const plugin = this.resolvePlugin(context);

        if (!plugin) {
            return { success: false, error: 'Plugin instance not available' };
        }

        if (!action || !this.isValidAction(action)) {
            return { success: false, error: 'Invalid action. Use clear, add_current, or add_all_open.' };
        }

        const app = this.resolveApp(context);
        this.log(plugin, 'info', '[ContextNotesTool] execute called', { action, params: actualParams });

        try {
            switch (action) {
                case 'clear':
                    return await this.clearContext(plugin);
                case 'add_current':
                    if (!app) {
                        return { success: false, error: 'App instance not available' };
                    }
                    return await this.addCurrentNote(app, plugin, actualParams.force);
                case 'add_all_open':
                    if (!app) {
                        return { success: false, error: 'App instance not available' };
                    }
                    return await this.addAllOpenNotes(app, plugin, actualParams.maxNotes, actualParams.force);
                default:
                    return { success: false, error: 'Unhandled action' };
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.log(plugin, 'error', '[ContextNotesTool] Action failed', { action, message });
            return { success: false, error: `Failed to ${this.describeAction(action)}: ${message}` };
        }
    }

    private async clearContext(plugin: MyPlugin): Promise<ToolResult> {
        plugin.settings.contextNotes = '';
        plugin.settings.enableContextNotes = false;
        await plugin.saveSettings();

        this.log(plugin, 'info', '[ContextNotesTool] Context notes cleared');

        return {
            success: true,
            data: {
                message: 'Context notes cleared successfully',
                notesCleared: true,
                contextEnabled: false
            }
        };
    }

    private async addCurrentNote(app: App, plugin: MyPlugin, force?: boolean): Promise<ToolResult> {
        const file = app.workspace.getActiveFile();
        if (!file) {
            return { success: false, error: 'No active note found to add to context' };
        }

        const link = `[[${file.path}]]`;
        const existing = plugin.settings.contextNotes || '';

        // Check for duplicates only if force is not true
        if (!force) {
            const alreadyExists = new RegExp(`\\[\\[${this.escapeRegExp(file.path)}\\]\\]`).test(existing);
            if (alreadyExists) {
                return {
                    success: true,
                    data: {
                        message: `Note "${file.basename}" is already in context`,
                        notePath: file.path,
                        alreadyExists: true,
                        contextEnabled: plugin.settings.enableContextNotes
                    }
                };
            }
        }

        // Add the note (force allows duplicates)
        const updated = existing ? `${existing}\n${link}` : link;
        plugin.settings.contextNotes = updated;
        plugin.settings.enableContextNotes = true;
        await plugin.saveSettings();

        this.log(plugin, 'info', '[ContextNotesTool] Added current note to context', {
            notePath: file.path,
            noteBasename: file.basename
        });

        return {
            success: true,
            data: {
                message: `Added "${file.basename}" to context notes`,
                notePath: file.path,
                noteBasename: file.basename,
                contextEnabled: true,
                totalContextNotes: updated.split('\n').filter(Boolean).length
            }
        };
    }

    private async addAllOpenNotes(app: App, plugin: MyPlugin, maxNotes?: number, force?: boolean): Promise<ToolResult> {
        const leaves = app.workspace.getLeavesOfType('markdown');
        if (!leaves.length) {
            return { success: false, error: 'No open notes found in the workspace' };
        }

        const allPaths = leaves
            .map(leaf => (leaf as any).view?.file?.path)
            .filter((path: string | undefined): path is string => Boolean(path));

        if (!allPaths.length) {
            return { success: false, error: 'No valid note files found in open leaves' };
        }

        const normalizedMax = this.normalizeMaxNotes(maxNotes);
        const targetPaths = normalizedMax ? allPaths.slice(0, normalizedMax) : allPaths;

        const existing = plugin.settings.contextNotes || '';
        const lines = existing.split(/\r?\n/).filter(Boolean);
        const existingSet = new Set(lines);

        const addedPaths: string[] = [];
        let skippedCount = 0;

        for (const path of targetPaths) {
            const link = `[[${path}]]`;
            if (!force && existingSet.has(link)) {
                skippedCount++;
                continue;
            }

            if (!existingSet.has(link)) {
                existingSet.add(link);
            }
            addedPaths.push(path);
        }

        if (!addedPaths.length) {
            return {
                success: true,
                data: {
                    message: 'All open notes are already in context',
                    totalOpenNotes: targetPaths.length,
                    addedCount: 0,
                    skippedCount,
                    contextEnabled: plugin.settings.enableContextNotes
                }
            };
        }

        const updated = Array.from(existingSet).join('\n');
        plugin.settings.contextNotes = updated;
        plugin.settings.enableContextNotes = true;
        await plugin.saveSettings();

        const detailedAdded = addedPaths.map(path => {
            const file = app.vault.getAbstractFileByPath(path) as { name?: string } | null | undefined;
            return {
                path,
                basename: file?.name || path.split('/').pop() || path
            };
        });

        this.log(plugin, 'info', '[ContextNotesTool] Added open notes to context', {
            addedCount: addedPaths.length,
            skippedCount,
            totalOpenNotes: targetPaths.length
        });

        return {
            success: true,
            data: {
                message: `Added ${addedPaths.length} open note${addedPaths.length === 1 ? '' : 's'} to context${skippedCount > 0 ? ` (${skippedCount} already existed)` : ''}`,
                totalOpenNotes: targetPaths.length,
                addedCount: addedPaths.length,
                skippedCount,
                contextEnabled: true,
                totalContextNotes: updated.split('\n').filter(Boolean).length,
                addedPaths: detailedAdded
            }
        };
    }

    private resolvePlugin(context: any): MyPlugin | undefined {
        return this.plugin || context?.plugin;
    }

    private resolveApp(context: any): App | undefined {
        return this.app || context?.app || context?.plugin?.app;
    }

    private isValidAction(action: string): action is ContextAction {
        return action === 'clear' || action === 'add_current' || action === 'add_all_open';
    }

    private describeAction(action: ContextAction): string {
        switch (action) {
            case 'clear':
                return 'clear context notes';
            case 'add_current':
                return 'add the current note to context';
            case 'add_all_open':
                return 'add open notes to context';
            default:
                return 'perform action';
        }
    }

    private escapeRegExp(value: string): string {
        return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    private normalizeMaxNotes(maxNotes: unknown): number | undefined {
        const numeric = typeof maxNotes === 'number' ? maxNotes : Number(maxNotes);
        if (!Number.isFinite(numeric) || numeric <= 0) {
            return undefined;
        }
        return Math.floor(numeric);
    }

    private log(plugin: MyPlugin | undefined, level: 'debug' | 'info' | 'warn' | 'error', message: string, data?: Record<string, unknown>): void {
        if (plugin?.debugLog) {
            plugin.debugLog(level, message, data);
        }
    }
}

