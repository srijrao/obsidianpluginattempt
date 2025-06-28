import { App, Setting, Notice } from 'obsidian';
import MyPlugin from '../../main';
import { SettingCreators } from '../components/SettingCreators';
import { CollapsibleSectionRenderer } from '../../components/chat/CollapsibleSection';
import { createToolInstances } from '../../components/chat/agent/tools/toolcollect'; // Adjust path as needed
import { AGENT_SYSTEM_PROMPT_TEMPLATE } from '../../promptConstants'; // Adjust path as needed

export class AgentConfigSection {
    private app: App; // Add app property
    private plugin: MyPlugin;
    private settingCreators: SettingCreators;

    constructor(app: App, plugin: MyPlugin, settingCreators: SettingCreators) { // Add app to constructor
        this.app = app; // Initialize app
        this.plugin = plugin;
        this.settingCreators = settingCreators;
        if (this.plugin && typeof this.plugin.debugLog === 'function') {
            this.plugin.debugLog('debug', '[AgentConfigSection] constructor called');
        }
    }

    async render(containerEl: HTMLElement): Promise<void> {
        if (this.plugin && typeof this.plugin.debugLog === 'function') {
            this.plugin.debugLog('info', '[AgentConfigSection] render called');
        }
        CollapsibleSectionRenderer.createCollapsibleSection(
            containerEl,
            'Agent Mode Settings',
            async (sectionEl: HTMLElement) => {
                if (this.plugin && typeof this.plugin.debugLog === 'function') {
                    this.plugin.debugLog('debug', '[AgentConfigSection] rendering section', { agentMode: this.plugin.settings.agentMode });
                }

                sectionEl.createEl('div', {
                    text: 'Agent Mode allows the AI to use tools like file creation, reading, and modification. Configure the limits and behavior for tool usage.',
                    cls: 'setting-item-description',
                    attr: { style: 'margin-bottom: 1em;' }
                });

                this.settingCreators.createToggleSetting(sectionEl, 'Enable Agent Mode by Default', 'Start new conversations with Agent Mode enabled.',
                    () => this.plugin.settings.agentMode?.enabled ?? false,
                    async (value) => {
                        if (!this.plugin.settings.agentMode) {
                            this.plugin.settings.agentMode = { enabled: false, maxToolCalls: 10, timeoutMs: 30000, maxIterations: 10 };
                        }
                        this.plugin.settings.agentMode.enabled = value;
                        await this.plugin.saveSettings();
                    });

                this.settingCreators.createSliderSetting(sectionEl, 'Max Tool Calls per Conversation', 'Maximum number of tools the AI can use in a single conversation to prevent runaway execution.',
                    { min: 1, max: 50, step: 1 },
                    () => this.plugin.settings.agentMode?.maxToolCalls ?? 10,
                    async (value) => {
                        if (!this.plugin.settings.agentMode) {
                            this.plugin.settings.agentMode = { enabled: false, maxToolCalls: 10, timeoutMs: 30000, maxIterations: 10 };
                        }
                        this.plugin.settings.agentMode.maxToolCalls = value;
                        await this.plugin.saveSettings();
                    });
                this.settingCreators.createSliderSetting(sectionEl, 'Tool Execution Timeout (seconds)', 'Maximum time to wait for each tool to complete before timing out.',
                    { min: 5, max: 300, step: 5 },
                    () => (this.plugin.settings.agentMode?.timeoutMs ?? 30000) / 1000,
                    async (value) => {
                        if (!this.plugin.settings.agentMode) {
                            this.plugin.settings.agentMode = { enabled: false, maxToolCalls: 10, timeoutMs: 30000, maxIterations: 10 };
                        }
                        this.plugin.settings.agentMode.timeoutMs = value * 1000;
                        await this.plugin.saveSettings();
                    });

                // Custom Agent System Message Setting
                sectionEl.createEl('h4', { text: 'Agent System Message' });
                sectionEl.createEl('div', {
                    text: 'Customize the system message used when Agent Mode is enabled. Use {{TOOL_DESCRIPTIONS}} to include the available tools list.',
                    cls: 'setting-item-description',
                    attr: { style: 'margin-bottom: 0.5em;' }
                });

                const agentMessageContainer = sectionEl.createDiv('agent-message-container');
                agentMessageContainer.style.display = 'flex';
                agentMessageContainer.style.gap = '0.5em';
                agentMessageContainer.style.alignItems = 'flex-start';
                agentMessageContainer.style.marginBottom = '1em';

                const textareaContainer = agentMessageContainer.createDiv();
                textareaContainer.style.flex = '1';

                const textarea = textareaContainer.createEl('textarea');
                textarea.rows = 8;
                textarea.style.width = '100%';
                textarea.style.minHeight = '120px';
                textarea.style.fontFamily = 'monospace';
                textarea.style.fontSize = '0.9em';
                textarea.placeholder = 'Enter custom agent system message template...';
                textarea.value = this.plugin.settings.customAgentSystemMessage || '';

                const buttonContainer = agentMessageContainer.createDiv();
                buttonContainer.style.display = 'flex';
                buttonContainer.style.flexDirection = 'column';
                buttonContainer.style.gap = '0.25em';

                const resetButton = buttonContainer.createEl('button', { text: 'Reset to Default' });
                resetButton.style.padding = '0.25em 0.5em';
                resetButton.style.fontSize = '0.8em';
                resetButton.addEventListener('click', async () => {
                    // const { AGENT_SYSTEM_PROMPT_TEMPLATE } = await import('./promptConstants'); // Original import
                    textarea.value = AGENT_SYSTEM_PROMPT_TEMPLATE;
                    this.plugin.settings.customAgentSystemMessage = AGENT_SYSTEM_PROMPT_TEMPLATE;
                    await this.plugin.saveSettings();
                });

                const clearButton = buttonContainer.createEl('button', { text: 'Use Default' });
                clearButton.style.padding = '0.25em 0.5em';
                clearButton.style.fontSize = '0.8em';
                clearButton.addEventListener('click', async () => {
                    textarea.value = '';
                    this.plugin.settings.customAgentSystemMessage = undefined;
                    await this.plugin.saveSettings();
                });

                textarea.addEventListener('input', async () => {
                    const value = textarea.value.trim();
                    this.plugin.settings.customAgentSystemMessage = value || undefined;
                    await this.plugin.saveSettings();
                });
            },
            this.plugin,
            'generalSectionsExpanded'
        );

        CollapsibleSectionRenderer.createCollapsibleSection(
            containerEl,
            'Agent Tools',
            async (sectionEl: HTMLElement) => {
                this.renderToolToggles(sectionEl);
            },
            this.plugin,
            'generalSectionsExpanded'
        );
    }

    /**
     * Renders the Tool Enable/Disable section.
     * @param containerEl The HTML element to append the section to.
     */
    private renderToolToggles(containerEl: HTMLElement): void {
        containerEl.createEl('h3', { text: 'Agent Tools' });
        containerEl.createEl('div', {
            text: 'Enable or disable individual agent tools. Disabled tools will not be available to the agent or appear in the system prompt.',
            cls: 'setting-item-description',
            attr: { style: 'margin-bottom: 0.5em;' }
        });
        const tools = createToolInstances(this.app, this.plugin);
        if (!this.plugin.settings.enabledTools) {
            this.plugin.settings.enabledTools = {};
        }
        tools.forEach(tool => {
            if (!tool) {
                console.error('[AI Assistant] Settings: Encountered an undefined tool object in tools array!');
                return;
            }
            if (typeof tool.name === 'undefined') {
                console.error('[AI Assistant] Settings: CRITICAL - Tool object has undefined name:', tool);
            }
            // Do not render a toggle for the 'thought' tool; it is always enabled
            if (tool.name === 'thought') {
                if (!this.plugin.settings.enabledTools) {
                    this.plugin.settings.enabledTools = {};
                }
                this.plugin.settings.enabledTools['thought'] = true;
                return;
            }
            this.settingCreators.createToggleSetting(
                containerEl,
                `${tool.name} (${tool.description})`,
                `Enable or disable the "${tool.name}" tool.`,
                () => {
                    if (typeof tool.name === 'undefined') {
                        console.error('[AI Assistant] Settings: CRITICAL - Trying to get toggle state for tool with undefined name!');
                        return false;
                    }
                    return !!this.plugin.settings.enabledTools && this.plugin.settings.enabledTools[tool.name] !== false;
                },
                async (value) => {
                    if (typeof tool.name === 'undefined') {
                        console.error('[AI Assistant] Settings: CRITICAL - Trying to set toggle state for tool with undefined name! Skipping save.');
                        return;
                    }
                    if (!this.plugin.settings.enabledTools) {
                        this.plugin.settings.enabledTools = {};
                    }
                    this.plugin.settings.enabledTools[tool.name] = value;
                    await this.plugin.saveSettings();
                }
            );
        });
    }
}
