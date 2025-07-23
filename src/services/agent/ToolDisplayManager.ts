import { ToolCommand, ToolResult } from '../../types';
import { ToolRichDisplay } from '../../components/agent/ToolRichDisplay';
import { IToolDisplayManager, IEventBus } from '../interfaces';

/**
 * Tool Display Manager
 * 
 * Manages creation, updates, and lifecycle of tool result displays.
 * Provides centralized display management with event coordination.
 */
export class ToolDisplayManager implements IToolDisplayManager {
    private displays: Map<string, ToolRichDisplay> = new Map();
    private displayMetadata: Map<string, { command: ToolCommand; result: ToolResult; createdAt: number }> = new Map();
    private displayCounter: number = 0;

    constructor(private eventBus: IEventBus) {
        // Listen for tool execution events to auto-create displays
        this.eventBus.subscribe('tool.executed', (data: any) => {
            if (data?.command && data?.result) {
                this.createDisplay(data.command, data.result);
            }
        });

        // Listen for tool re-execution events to update displays
        this.eventBus.subscribe('tool.reexecuted', (data: any) => {
            if (data?.displayId && data?.result) {
                this.updateDisplay(data.displayId, data.result);
            }
        });
    }

    /**
     * Creates a new tool display for a command and result.
     */
    createDisplay(command: ToolCommand, result: ToolResult): ToolRichDisplay {
        const displayId = this.generateDisplayId(command);
        
        const display = new ToolRichDisplay({
            command,
            result,
            onRerun: () => this.handleRerun(displayId, command),
            onCopy: () => this.handleCopy(displayId, command, result)
        });

        this.displays.set(displayId, display);
        this.displayMetadata.set(displayId, {
            command,
            result,
            createdAt: Date.now()
        });

        // Publish display creation event
        this.eventBus.publish('tool_display.created', {
            displayId,
            command,
            result,
            timestamp: Date.now()
        });

        return display;
    }

    /**
     * Updates an existing display with a new result.
     */
    updateDisplay(displayId: string, result: ToolResult): void {
        const display = this.displays.get(displayId);
        const metadata = this.displayMetadata.get(displayId);
        
        if (display && metadata) {
            display.updateResult(result);
            
            // Update stored metadata
            this.displayMetadata.set(displayId, {
                ...metadata,
                result
            });
            
            // Publish display update event
            this.eventBus.publish('tool_display.updated', {
                displayId,
                result,
                timestamp: Date.now()
            });
        } else {
            console.warn(`[ToolDisplayManager] Display with ID ${displayId} not found for update`);
        }
    }

    /**
     * Gets all currently managed displays.
     */
    getDisplays(): Map<string, ToolRichDisplay> {
        return new Map(this.displays);
    }

    /**
     * Gets a specific display by ID.
     */
    getDisplay(displayId: string): ToolRichDisplay | undefined {
        return this.displays.get(displayId);
    }

    /**
     * Removes a display from management.
     */
    removeDisplay(displayId: string): boolean {
        const display = this.displays.get(displayId);
        
        if (display) {
            // Clean up the display component
            display.unload();
            this.displays.delete(displayId);
            this.displayMetadata.delete(displayId);
            
            // Publish removal event
            this.eventBus.publish('tool_display.removed', {
                displayId,
                timestamp: Date.now()
            });
            
            return true;
        }
        
        return false;
    }

    /**
     * Clears all displays.
     */
    clearDisplays(): void {
        const displayIds = Array.from(this.displays.keys());
        
        // Unload all displays
        for (const display of this.displays.values()) {
            display.unload();
        }
        
        this.displays.clear();
        this.displayMetadata.clear();
        
        // Publish bulk clear event
        this.eventBus.publish('tool_display.cleared', {
            clearedCount: displayIds.length,
            displayIds,
            timestamp: Date.now()
        });
    }

    /**
     * Gets displays by command action type.
     */
    getDisplaysByAction(action: string): ToolRichDisplay[] {
        const matchingDisplays: ToolRichDisplay[] = [];
        
        for (const [displayId, display] of this.displays.entries()) {
            const metadata = this.displayMetadata.get(displayId);
            if (metadata && metadata.command.action === action) {
                matchingDisplays.push(display);
            }
        }
        
        return matchingDisplays;
    }

    /**
     * Gets displays with specific result status.
     */
    getDisplaysByStatus(success: boolean): ToolRichDisplay[] {
        const matchingDisplays: ToolRichDisplay[] = [];
        
        for (const [displayId, display] of this.displays.entries()) {
            const metadata = this.displayMetadata.get(displayId);
            if (metadata && metadata.result.success === success) {
                matchingDisplays.push(display);
            }
        }
        
        return matchingDisplays;
    }

    /**
     * Gets displays created within a time range.
     */
    getDisplaysByTimeRange(startTime: number, endTime: number): ToolRichDisplay[] {
        const matchingDisplays: ToolRichDisplay[] = [];
        
        for (const [displayId, display] of this.displays.entries()) {
            const metadata = this.displayMetadata.get(displayId);
            if (metadata && metadata.createdAt >= startTime && metadata.createdAt <= endTime) {
                matchingDisplays.push(display);
            }
        }
        
        return matchingDisplays;
    }

    /**
     * Creates a display for note embedding (without re-run functionality).
     */
    createNoteDisplay(command: ToolCommand, result: ToolResult): HTMLElement {
        return ToolRichDisplay.createNoteDisplay(command, result, {
            onCopy: () => this.handleCopy('note', command, result)
        });
    }

    /**
     * Exports all displays to markdown format.
     */
    exportDisplaysToMarkdown(): string {
        const displays = Array.from(this.displays.values());
        
        if (displays.length === 0) {
            return '<!-- No tool displays to export -->';
        }

        const markdownParts = displays.map((display, index) => {
            return `## Tool Execution ${index + 1}\n\n${display.toMarkdown()}\n`;
        });

        return markdownParts.join('\n---\n\n');
    }

    /**
     * Gets summary statistics for all displays.
     */
    getDisplayStats(): {
        total: number;
        successful: number;
        failed: number;
        byAction: Record<string, number>;
    } {
        const stats = {
            total: this.displays.size,
            successful: 0,
            failed: 0,
            byAction: {} as Record<string, number>
        };

        for (const [displayId, display] of this.displays.entries()) {
            const metadata = this.displayMetadata.get(displayId);
            if (metadata) {
                const { command, result } = metadata;
                
                if (result.success) {
                    stats.successful++;
                } else {
                    stats.failed++;
                }
                
                stats.byAction[command.action] = (stats.byAction[command.action] || 0) + 1;
            }
        }

        return stats;
    }

    /**
     * Handles re-run action for a display.
     */
    private handleRerun(displayId: string, command: ToolCommand): void {
        // Publish rerun request event - the AgentOrchestrator should handle actual execution
        this.eventBus.publish('tool_display.rerun_requested', {
            displayId,
            command,
            timestamp: Date.now()
        });
    }

    /**
     * Handles copy action for a display.
     */
    private handleCopy(displayId: string, command: ToolCommand, result: ToolResult): void {
        // Publish copy event for tracking/analytics
        this.eventBus.publish('tool_display.copy_requested', {
            displayId,
            command,
            result,
            timestamp: Date.now()
        });

        // The actual copying is handled by the ToolRichDisplay component itself
    }

    /**
     * Generates a unique display ID for a command.
     */
    private generateDisplayId(command: ToolCommand): string {
        this.displayCounter++;
        const timestamp = Date.now();
        const requestId = command.requestId || 'unknown';
        return `display_${command.action}_${requestId}_${timestamp}_${this.displayCounter}`;
    }

    /**
     * Cleanup method for when the manager is being destroyed.
     */
    destroy(): void {
        this.clearDisplays();
        // Event bus subscriptions should be cleaned up automatically
    }
}
