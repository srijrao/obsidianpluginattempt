import { AgentContextWithToolLimit } from "./types";
import { CONSTANTS } from "./constants";

export class ToolLimitWarningUI {
    private context: AgentContextWithToolLimit;
    constructor(context: AgentContextWithToolLimit) {
        this.context = context;
    }

    createToolLimitWarning(): HTMLElement {
        const warning = document.createElement("div");
        warning.className = "tool-limit-warning";

        const agentSettings = this.context.plugin.getAgentModeSettings();
        const effectiveLimit = this.getEffectiveToolLimit();
        const executionCount = this.context.getExecutionCount();

        warning.innerHTML = this.createToolLimitWarningHTML(executionCount, effectiveLimit, agentSettings.maxToolCalls);
        this.attachToolLimitWarningHandlers(warning, agentSettings);

        return warning;
    }

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

    private attachToolLimitWarningHandlers(warning: HTMLElement, agentSettings: any): void {
        this.attachSettingsHandler(warning);
        this.attachAddToolsHandler(warning, agentSettings);
        this.attachContinueHandler(warning);
    }

    private attachSettingsHandler(warning: HTMLElement): void {
        const settingsLink = warning.querySelector(".tool-limit-settings-link") as HTMLElement;
        if (settingsLink) {
            settingsLink.onclick = () => {
                (this.context.app as any).setting.open();
                (this.context.app as any).setting.openTabById(this.context.plugin.manifest.id);
            };
        }
    }

    private attachAddToolsHandler(warning: HTMLElement, agentSettings: any): void {
        const addToolsButton = warning.querySelector(".ai-chat-add-tools-button") as HTMLElement;
        if (addToolsButton) {
            addToolsButton.onclick = () => {
                const input = warning.querySelector("#additional-tools") as HTMLInputElement;
                const additionalTools = parseInt(input.value) || agentSettings.maxToolCalls;

                if (additionalTools > 0) {
                    this.context.addToolExecutions(additionalTools);
                    this.removeWarningAndTriggerContinuation(warning, "continueTaskWithAdditionalTools", { additionalTools });
                }
            };
        }
    }

    private attachContinueHandler(warning: HTMLElement): void {
        const continueButton = warning.querySelector(".ai-chat-continue-button") as HTMLElement;
        if (continueButton) {
            continueButton.onclick = () => {
                this.context.resetExecutionCount();
                this.removeWarningAndTriggerContinuation(warning, "continueTask");
            };
        }
    }

    private removeWarningAndTriggerContinuation(warning: HTMLElement, eventType: string, detail?: any): void {
        warning.remove();
        this.hideToolContinuationContainerIfEmpty();

        const event = detail
            ? new CustomEvent(eventType, { detail })
            : new CustomEvent(eventType);

        this.context.messagesContainer.dispatchEvent(event);
    }

    private hideToolContinuationContainerIfEmpty(): void {
        if (this.context.toolContinuationContainer) {
            if (this.context.toolContinuationContainer.children.length === 0) {
                this.context.toolContinuationContainer.style.display = "none";
            }
        }
    }

    private getEffectiveToolLimit(): number {
        const agentSettings = this.context.plugin.getAgentModeSettings();
        return this.context.getTemporaryMaxToolCalls() || agentSettings.maxToolCalls;
    }
}
