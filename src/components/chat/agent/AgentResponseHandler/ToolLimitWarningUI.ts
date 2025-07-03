import { AgentContextWithToolLimit } from "./types";
import { CONSTANTS } from "./constants";

/**
 * UI handler for displaying and managing tool execution limit warnings.
 */
export class ToolLimitWarningUI {
    // Context containing plugin, execution state, and UI containers.
    private context: AgentContextWithToolLimit;

    /**
     * Constructs the ToolLimitWarningUI with the given context.
     * @param context The agent context with tool limit and UI references.
     */
    constructor(context: AgentContextWithToolLimit) {
        this.context = context;
    }

    /**
     * Creates the warning UI element for when the tool execution limit is reached.
     * @returns The warning HTMLElement.
     */
    createToolLimitWarning(): HTMLElement {
        const warning = document.createElement("div");
        warning.className = "tool-limit-warning";

        // Get agent settings and current execution state.
        const agentSettings = this.context.plugin.getAgentModeSettings();
        const effectiveLimit = this.getEffectiveToolLimit();
        const executionCount = this.context.getExecutionCount();

        // Set the warning's HTML and attach handlers for user actions.
        warning.innerHTML = this.createToolLimitWarningHTML(executionCount, effectiveLimit, agentSettings.maxToolCalls);
        this.attachToolLimitWarningHandlers(warning, agentSettings);

        return warning;
    }

    /**
     * Generates the HTML for the tool limit warning UI.
     * @param executionCount Number of tool executions used.
     * @param effectiveLimit The current effective tool limit.
     * @param maxToolCalls The default max tool calls from settings.
     * @returns HTML string for the warning.
     */
    private createToolLimitWarningHTML(executionCount: number, effectiveLimit: number, maxToolCalls: number): string {
        return `
            <div class="tool-limit-warning-text">
                <strong>⚠️ Tool execution limit reached</strong><br>
                Used ${executionCount}/${effectiveLimit} tool calls. 
                Choose how to proceed:
            </div>
            <div class="tool-limit-warning-actions">
                <div class="tool-limit-input-group">
                    <label for="additional-tools">Add more executions:</label>
                    <input type="number" id="additional-tools" min="1" max="${CONSTANTS.MAX_ADDITIONAL_TOOLS}" value="${maxToolCalls}" placeholder="5">
                    <button class="ai-chat-add-tools-button">Add & Continue</button>
                </div>
                <div class="tool-limit-button-group">
                    <button class="ai-chat-continue-button">Reset & Continue</button>
                    <span class="tool-limit-settings-link">Open Settings</span>
                </div>
            </div>
        `;
    }

    /**
     * Attaches event handlers for all warning UI actions.
     * @param warning The warning HTMLElement.
     * @param agentSettings The agent's settings object.
     */
    private attachToolLimitWarningHandlers(warning: HTMLElement, agentSettings: any): void {
        this.attachSettingsHandler(warning);
        this.attachAddToolsHandler(warning, agentSettings);
        this.attachContinueHandler(warning);
    }

    /**
     * Attaches the handler for the "Open Settings" link.
     * @param warning The warning HTMLElement.
     */
    private attachSettingsHandler(warning: HTMLElement): void {
        const settingsLink = warning.querySelector(".tool-limit-settings-link") as HTMLElement;
        if (settingsLink) {
            settingsLink.onclick = () => {
                // Open the plugin's settings tab in Obsidian.
                (this.context.app as any).setting.open();
                (this.context.app as any).setting.openTabById(this.context.plugin.manifest.id);
            };
        }
    }

    /**
     * Attaches the handler for the "Add & Continue" button.
     * @param warning The warning HTMLElement.
     * @param agentSettings The agent's settings object.
     */
    private attachAddToolsHandler(warning: HTMLElement, agentSettings: any): void {
        const addToolsButton = warning.querySelector(".ai-chat-add-tools-button") as HTMLElement;
        if (addToolsButton) {
            addToolsButton.onclick = () => {
                const input = warning.querySelector("#additional-tools") as HTMLInputElement;
                const additionalTools = parseInt(input.value) || agentSettings.maxToolCalls;

                if (additionalTools > 0) {
                    // Add more allowed tool executions and continue.
                    this.context.addToolExecutions(additionalTools);
                    this.removeWarningAndTriggerContinuation(warning, "continueTaskWithAdditionalTools", { additionalTools });
                }
            };
        }
    }

    /**
     * Attaches the handler for the "Reset & Continue" button.
     * @param warning The warning HTMLElement.
     */
    private attachContinueHandler(warning: HTMLElement): void {
        const continueButton = warning.querySelector(".ai-chat-continue-button") as HTMLElement;
        if (continueButton) {
            continueButton.onclick = () => {
                // Reset execution count and continue.
                this.context.resetExecutionCount();
                this.removeWarningAndTriggerContinuation(warning, "continueTask");
            };
        }
    }

    /**
     * Removes the warning UI and triggers a continuation event.
     * @param warning The warning HTMLElement.
     * @param eventType The event type to dispatch.
     * @param detail Optional event detail.
     */
    private removeWarningAndTriggerContinuation(warning: HTMLElement, eventType: string, detail?: any): void {
        warning.remove();
        this.hideToolContinuationContainerIfEmpty();

        const event = detail
            ? new CustomEvent(eventType, { detail })
            : new CustomEvent(eventType);

        this.context.messagesContainer.dispatchEvent(event);
    }

    /**
     * Hides the tool continuation container if it is empty.
     */
    private hideToolContinuationContainerIfEmpty(): void {
        if (this.context.toolContinuationContainer) {
            if (this.context.toolContinuationContainer.children.length === 0) {
                this.context.toolContinuationContainer.style.display = "none";
            }
        }
    }

    /**
     * Gets the current effective tool execution limit, considering temporary overrides.
     * @returns The effective tool limit.
     */
    private getEffectiveToolLimit(): number {
        const agentSettings = this.context.plugin.getAgentModeSettings();
        return this.context.getTemporaryMaxToolCalls() || agentSettings.maxToolCalls;
    }
}
