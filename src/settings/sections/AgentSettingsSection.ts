import { App, Setting } from 'obsidian';
import MyPlugin from '../../main';
import { SettingCreators } from '../components/SettingCreators';
import { createToolInstances } from '../../components/chat/agent/tools/toolcollect';
import { AGENT_SYSTEM_PROMPT_TEMPLATE } from '../../promptConstants';

/**
 * AgentSettingsSection is responsible for rendering the settings related to Agent Mode.
 * This includes toggling agent mode, setting tool limits, and enabling/disabling individual tools.
 */
export class AgentSettingsSection {
    private app: App;
    private plugin: MyPlugin;
    private settingCreators: SettingCreators;

    /**
     * @param app The Obsidian App instance.
     * @param plugin The main plugin instance.
     * @param settingCreators An instance of SettingCreators for consistent UI element creation.
     */
    constructor(app: App, plugin: MyPlugin, settingCreators: SettingCreators) {
        this.app = app;
        this.plugin = plugin;
        this.settingCreators = settingCreators;
        if (this.plugin && typeof this.plugin.debugLog === 'function') {
            this.plugin.debugLog('debug', '[AgentSettingsSection] constructor called');
        }
    }

    /**
     * Renders the Agent Mode settings section into the provided container element.
     * @param containerEl The HTML element to render the section into.
     */
    async render(containerEl: HTMLElement): Promise<void> {
        if (this.plugin && typeof this.plugin.debugLog === 'function') {
            this.plugin.debugLog('info', '[AgentSettingsSection] render called');
        }

        
        containerEl.createEl('h3', { text: 'Agent Mode Settings' });
        
        containerEl.createEl('div', {
            text: 'Agent Mode allows the AI to use tools like file creation, reading, and modification. Configure the limits and behavior for tool usage.',
            cls: 'setting-item-description',
            attr: { style: 'margin-bottom: 1em;' }
        });

        // Toggle for enabling Agent Mode by default
        this.settingCreators.createToggleSetting(
            containerEl, 
            'Enable Agent Mode by Default', 
            'Start new conversations with Agent Mode enabled.',
            () => this.plugin.settings.agentMode?.enabled ?? false,
            async (value) => {
                if (!this.plugin.settings.agentMode) {
                    this.plugin.settings.agentMode = { enabled: false, maxToolCalls: 10, timeoutMs: 30000, maxIterations: 10 };
                }
                this.plugin.settings.agentMode.enabled = value;
                await this.plugin.saveSettings();
            }
        );

        // Slider for Max Tool Calls per Conversation
        this.settingCreators.createSliderSetting(
            containerEl, 
            'Max Tool Calls per Conversation', 
            'Maximum number of tools the AI can use in a single conversation to prevent runaway execution.',
            { min: 1, max: 50, step: 1 },
            () => this.plugin.settings.agentMode?.maxToolCalls ?? 10,
            async (value) => {
                if (!this.plugin.settings.agentMode) {
                    this.plugin.settings.agentMode = { enabled: false, maxToolCalls: 10, timeoutMs: 30000, maxIterations: 10 };
                }
                this.plugin.settings.agentMode.maxToolCalls = value;
                await this.plugin.saveSettings();
            }
        );

        // Slider for Tool Execution Timeout
        this.settingCreators.createSliderSetting(
            containerEl, 
            'Tool Execution Timeout (seconds)', 
            'Maximum time to wait for each tool to complete before timing out.',
            { min: 5, max: 300, step: 5 },
            () => (this.plugin.settings.agentMode?.timeoutMs ?? 30000) / 1000,
            async (value) => {
                if (!this.plugin.settings.agentMode) {
                    this.plugin.settings.agentMode = { enabled: false, maxToolCalls: 10, timeoutMs: 30000, maxIterations: 10 };
                }
                this.plugin.settings.agentMode.timeoutMs = value * 1000;
                await this.plugin.saveSettings();
            }
        );

        // Slider for Max Iterations per Task Continuation
        this.settingCreators.createSliderSetting(
            containerEl, 
            'Max Iterations per Task Continuation',
            'Maximum number of times the agent can iterate in a single task continuation to prevent infinite loops.',
            { min: 1, max: 20, step: 1 },
            () => this.plugin.settings.agentMode?.maxIterations ?? 10,
            async (value) => {
                if (!this.plugin.settings.agentMode) {
                    this.plugin.settings.agentMode = { enabled: false, maxToolCalls: 10, timeoutMs: 30000, maxIterations: 10 };
                }
                this.plugin.settings.agentMode.maxIterations = value;
                await this.plugin.saveSettings();
            }
        );

        // Agent System Message section header
        containerEl.createEl('h3', { text: 'Agent System Message' });
        
        containerEl.createEl('div', {
            text: 'Customize the system message used when Agent Mode is enabled. Use {{TOOL_DESCRIPTIONS}} to include the available tools list.',
            cls: 'setting-item-description',
            attr: { style: 'margin-bottom: 0.5em;' }
        });

        const agentMessageContainer = containerEl.createDiv('agent-message-container');
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

        // Reset to Default button for agent system message
        const resetButton = buttonContainer.createEl('button', { text: 'Reset to Default' });
        resetButton.style.padding = '0.25em 0.5em';
        resetButton.style.fontSize = '0.8em';
        resetButton.addEventListener('click', async () => {
            textarea.value = AGENT_SYSTEM_PROMPT_TEMPLATE;
            this.plugin.settings.customAgentSystemMessage = AGENT_SYSTEM_PROMPT_TEMPLATE;
            await this.plugin.saveSettings();
        });

        // Use Default (clear custom message) button
        const clearButton = buttonContainer.createEl('button', { text: 'Use Default' });
        clearButton.style.padding = '0.25em 0.5em';
        clearButton.style.fontSize = '0.8em';
        clearButton.addEventListener('click', async () => {
            textarea.value = '';
            this.plugin.settings.customAgentSystemMessage = undefined;
            await this.plugin.saveSettings();
        });

        // Save custom agent system message on input
        textarea.addEventListener('input', async () => {
            const value = textarea.value.trim();
            this.plugin.settings.customAgentSystemMessage = value || undefined;
            await this.plugin.saveSettings();
        });

        // Agent Tools section header
        containerEl.createEl('h3', { text: 'Agent Tools' });
        
        this.renderToolToggles(containerEl);
    }

    /**
     * Renders the Tool Enable/Disable section.
     * Allows users to enable or disable individual tools available to the agent.
     * @param containerEl The HTML element to append the section to.
     */
    private renderToolToggles(containerEl: HTMLElement): void {
        containerEl.createEl('div', {
            text: 'Enable or disable individual agent tools. Disabled tools will not be available to the agent or appear in the system prompt.',
            cls: 'setting-item-description',
            attr: { style: 'margin-bottom: 0.5em;' }
        });
        // Get all available tool instances
        const tools = createToolInstances(this.app, this.plugin);
        // Initialize enabledTools setting if it doesn't exist
        if (!this.plugin.settings.enabledTools) {
            this.plugin.settings.enabledTools = {};
        }
        // Render a toggle for each tool
        tools.forEach(tool => {
            if (!tool) {
                console.error('[AI Assistant] Settings: Encountered an undefined tool object in tools array!');
                return;
            }
            if (typeof tool.name === 'undefined') {
                console.error('[AI Assistant] Settings: CRITICAL - Tool object has undefined name:', tool);
            }
            
            // Special handling for 'thought' tool: always enabled and not configurable by user
            if (tool.name === 'thought') {
                if (!this.plugin.settings.enabledTools) {
                    this.plugin.settings.enabledTools = {};
                }
                this.plugin.settings.enabledTools['thought'] = true; // Ensure thought tool is always enabled
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
                    // Default to true if not explicitly set to false
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
