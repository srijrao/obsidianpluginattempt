import { App, Setting } from 'obsidian';
import MyPlugin from '../../main';
import { SettingCreators } from '../components/SettingCreators';
import { CollapsibleSectionRenderer } from '../../components/chat/CollapsibleSection';

export class DataHandlingSection {
    private plugin: MyPlugin;
    private settingCreators: SettingCreators;

    constructor(plugin: MyPlugin, settingCreators: SettingCreators) {
        this.plugin = plugin;
        this.settingCreators = settingCreators;
    }

    async render(containerEl: HTMLElement): Promise<void> {
        CollapsibleSectionRenderer.createCollapsibleSection(
            containerEl,
            'Note & Data Handling',
            async (sectionEl: HTMLElement) => {
                this.settingCreators.createToggleSetting(sectionEl, 'Expand Linked Notes Recursively', 'If enabled, when fetching a note, also fetch and expand links within that note recursively (prevents infinite loops).',
                    () => this.plugin.settings.expandLinkedNotesRecursively ?? false,
                    async (value) => { this.plugin.settings.expandLinkedNotesRecursively = value; await this.plugin.saveSettings(); /* this.display(); // Re-render to show/hide slider */ },
                    () => { /* this.display(); */ }); // Re-render needs to be handled by the main settings tab

                if (this.plugin.settings.expandLinkedNotesRecursively) {
                    this.settingCreators.createSliderSetting(sectionEl, 'Max Link Expansion Depth', 'Maximum depth for recursively expanding linked notes (1-3).',
                        { min: 1, max: 3, step: 1 },
                        () => this.plugin.settings.maxLinkExpansionDepth ?? 2,
                        async (value) => { this.plugin.settings.maxLinkExpansionDepth = value; await this.plugin.saveSettings(); });
                }

                this.settingCreators.createTextSetting(sectionEl, 'Chat Note Folder', 'Folder to save exported chat notes (relative to vault root, leave blank for root)', 'e.g. AI Chats',
                    () => this.plugin.settings.chatNoteFolder ?? '',
                    async (value) => { this.plugin.settings.chatNoteFolder = value ?? ''; await this.plugin.saveSettings(); },
                    { trim: true });

                // YAML Attribute Generators will be a sub-section here conceptually, rendered by its own method
                this.renderYamlAttributeGenerators(sectionEl); // This method creates its own h3, which is fine as a sub-header
            },
            this.plugin,
            'generalSectionsExpanded'
        );
    }

    /**
     * Renders the YAML Attribute Generators section.
     * @param containerEl The HTML element to append the section to.
     */
    private renderYamlAttributeGenerators(containerEl: HTMLElement): void {
        containerEl.createEl('h3', { text: 'YAML Attribute Generators' });
        containerEl.createEl('div', { text: 'Configure custom YAML attribute generators. Each entry will create a command to generate and insert/update a YAML field in your notes.' }).style.marginBottom = '1em';

        const yamlGens = this.plugin.settings.yamlAttributeGenerators ?? [];
        yamlGens.forEach((gen, idx) => {
            const autoCommandName = gen.attributeName ? `Generate YAML: ${gen.attributeName}` : `YAML Generator #${idx + 1}`;
            new Setting(containerEl)
                .setName(autoCommandName)
                .setDesc(`YAML field: ${gen.attributeName}`)
                .addText(text => this.settingCreators.createTextSetting(containerEl, 'YAML Attribute Name', '', 'YAML Attribute Name', () => gen.attributeName, async (value) => {
                    if (this.plugin.settings.yamlAttributeGenerators) {
                        this.plugin.settings.yamlAttributeGenerators[idx].attributeName = value ?? '';
                        this.plugin.settings.yamlAttributeGenerators[idx].commandName = value ? `Generate YAML: ${value}` : '';
                        await this.plugin.saveSettings();
                        // this.display(); // Re-render to update the command name - needs to be handled by main settings tab
                    }
                }))
                .addTextArea(text => this.settingCreators.createTextSetting(containerEl, 'Prompt for LLM', '', 'Prompt for LLM', () => gen.prompt, async (value) => {
                    if (this.plugin.settings.yamlAttributeGenerators) {
                        this.plugin.settings.yamlAttributeGenerators[idx].prompt = value ?? '';
                        await this.plugin.saveSettings();
                    }
                }, { isTextArea: true }))
                .addDropdown(drop => {
                    drop.addOption('clipboard', 'Copy to clipboard');
                    drop.addOption('metadata', 'Insert into metadata');
                    drop.setValue(gen.outputMode);
                    drop.onChange(async (value) => {
                        if (this.plugin.settings.yamlAttributeGenerators) {
                            this.plugin.settings.yamlAttributeGenerators[idx].outputMode = value as any;
                            await this.plugin.saveSettings();
                        }
                    });
                })
                .addExtraButton(btn => {
                    btn.setIcon('cross')
                        .setTooltip('Delete')
                        .onClick(async () => {
                            if (this.plugin.settings.yamlAttributeGenerators) {
                                this.plugin.settings.yamlAttributeGenerators.splice(idx, 1);
                                await this.plugin.saveSettings();
                                // this.display(); // Re-render needs to be handled by main settings tab
                            }
                        });
                });
        });

        new Setting(containerEl)
            .addButton(btn => {
                btn.setButtonText('Add YAML Attribute Generator')
                    .setCta()
                    .onClick(async () => {
                        if (!this.plugin.settings.yamlAttributeGenerators) this.plugin.settings.yamlAttributeGenerators = [];
                        this.plugin.settings.yamlAttributeGenerators.push({
                            attributeName: '',
                            prompt: '',
                            outputMode: 'metadata',
                            commandName: 'New YAML Generator'
                        });
                        await this.plugin.saveSettings();
                        // this.display(); // Re-render needs to be handled by main settings tab
                    });
            });
    }
}
