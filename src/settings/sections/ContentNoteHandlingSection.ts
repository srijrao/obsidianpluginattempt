import { App, Setting } from 'obsidian';
import MyPlugin from '../../main';
import { SettingCreators } from '../components/SettingCreators';

/**
 * ContentNoteHandlingSection is responsible for rendering settings related to how the plugin handles note content
 * for chat context, and for managing YAML attribute generators.
 */
export class ContentNoteHandlingSection {
    private plugin: MyPlugin;
    private settingCreators: SettingCreators;

    /**
     * @param plugin The main plugin instance.
     * @param settingCreators An instance of SettingCreators for consistent UI element creation.
     */
    constructor(plugin: MyPlugin, settingCreators: SettingCreators) {
        this.plugin = plugin;
        this.settingCreators = settingCreators;
    }

    /**
     * Renders the Content & Note Handling settings sections into the provided container element.
     * This includes chat customization, note reference settings, data handling, and YAML attribute generators.
     * @param containerEl The HTML element to render the sections into.
     */
    async render(containerEl: HTMLElement): Promise<void> {
        // Chat Customization Section Header
        containerEl.createEl('h3', { text: 'Chat Customization' });
        
        // Chat Separator Setting
        this.settingCreators.createTextSetting(
            containerEl, 
            'Chat Separator', 
            'The string used to separate chat messages.', 
            '----',
            () => this.plugin.settings.chatSeparator ?? '',
            async (value) => { 
                this.plugin.settings.chatSeparator = value ?? ''; 
                await this.plugin.saveSettings(); 
            }
        );
        
        // Chat Start String Setting
        this.settingCreators.createTextSetting(
            containerEl, 
            'Chat Start String', 
            'The string that indicates where to start taking the note for context.', 
            '===START===',
            () => this.plugin.settings.chatStartString ?? '',
            async (value) => { 
                this.plugin.settings.chatStartString = value ?? ''; 
                await this.plugin.saveSettings(); 
            }
        );
        
        // Chat End String Setting
        this.settingCreators.createTextSetting(
            containerEl, 
            'Chat End String', 
            'The string that indicates where to end taking the note for context.', 
            '===END===',
            () => this.plugin.settings.chatEndString ?? '',
            async (value) => { 
                this.plugin.settings.chatEndString = value ?? ''; 
                await this.plugin.saveSettings(); 
            }
        );
        
        // Title Prompt Setting
        this.settingCreators.createTextSetting(
            containerEl, 
            'Title Prompt', 
            'The prompt used for generating note titles.', 
            'You are a title generator...',
            () => this.plugin.settings.titlePrompt,
            async (value) => { 
                this.plugin.settings.titlePrompt = value ?? ''; 
                await this.plugin.saveSettings(); 
            },
            { isTextArea: true }
        );
        
        // Title Output Mode Dropdown
        this.settingCreators.createDropdownSetting(
            containerEl, 
            'Title Output Mode', 
            'Choose what to do with the generated note title.',
            { 'clipboard': 'Copy to clipboard', 'replace-filename': 'Replace note filename', 'metadata': 'Insert into metadata' },
            () => this.plugin.settings.titleOutputMode ?? 'clipboard',
            async (value) => { 
                this.plugin.settings.titleOutputMode = value as any; 
                await this.plugin.saveSettings(); 
            }
        );
        
        // Summary Output Mode Dropdown
        this.settingCreators.createDropdownSetting(
            containerEl, 
            'Summary Output Mode', 
            'Choose what to do with the generated note summary.',
            { 'clipboard': 'Copy to clipboard', 'metadata': 'Insert into metadata' },
            () => this.plugin.settings.summaryOutputMode ?? 'clipboard',
            async (value) => { 
                this.plugin.settings.summaryOutputMode = value as any; 
                await this.plugin.saveSettings(); 
            }
        );

        // Note Reference Settings Section Header
        containerEl.createEl('h3', { text: 'Note Reference Settings' });
        
        // Enable Obsidian Links Toggle
        this.settingCreators.createToggleSetting(
            containerEl,
            'Enable Obsidian Links',
            'Read Obsidian links in messages using [[filename]] syntax',
            () => this.plugin.settings.enableObsidianLinks,
            async (value) => {
                this.plugin.settings.enableObsidianLinks = value;
                await this.plugin.saveSettings();
            }
        );

        // Enable Context Notes Toggle
        this.settingCreators.createToggleSetting(
            containerEl,
            'Enable Context Notes',
            'Attach specified note content to chat messages',
            () => this.plugin.settings.enableContextNotes,
            async (value) => {
                this.plugin.settings.enableContextNotes = value;
                await this.plugin.saveSettings();
            }
        );

        // Context Notes Text Area
        const contextNotesContainer = containerEl.createDiv('context-notes-container');
        contextNotesContainer.style.marginBottom = '24px';

        new Setting(contextNotesContainer)
            .setName('Context Notes')
            .setDesc('Notes to attach as context (supports [[filename]] and [[another note#header]] syntax)')
            .addTextArea(text => {
                text.setPlaceholder('[[Note Name]]\n[[Another Note#Header]]')
                    .setValue(this.plugin.settings.contextNotes || '')
                    .onChange((value) => {
                        // Update setting immediately on change
                        this.plugin.settings.contextNotes = value;
                    });
                
                // Save settings on blur
                text.inputEl.addEventListener('blur', async () => {
                    await this.plugin.saveSettings();
                });
                
                text.inputEl.rows = 4;
                text.inputEl.style.width = '100%';
            });

        // Data Handling Section Header
        containerEl.createEl('h3', { text: 'Data Handling' });
        
        // Expand Linked Notes Recursively Toggle
        this.settingCreators.createToggleSetting(
            containerEl, 
            'Expand Linked Notes Recursively', 
            'If enabled, when fetching a note, also fetch and expand links within that note recursively (prevents infinite loops).',
            () => this.plugin.settings.expandLinkedNotesRecursively ?? false,
            async (value) => { 
                this.plugin.settings.expandLinkedNotesRecursively = value; 
                await this.plugin.saveSettings(); 
            }
        );

        // Max Link Expansion Depth Slider (only visible if recursive expansion is enabled)
        if (this.plugin.settings.expandLinkedNotesRecursively) {
            this.settingCreators.createSliderSetting(
                containerEl, 
                'Max Link Expansion Depth', 
                'Maximum depth for recursively expanding linked notes (1-3).',
                { min: 1, max: 3, step: 1 },
                () => this.plugin.settings.maxLinkExpansionDepth ?? 2,
                async (value) => { 
                    this.plugin.settings.maxLinkExpansionDepth = value; 
                    await this.plugin.saveSettings(); 
                }
            );
        }

        // Chat Note Folder Text Setting
        this.settingCreators.createTextSetting(
            containerEl, 
            'Chat Note Folder', 
            'Folder to save exported chat notes (relative to vault root, leave blank for root)', 
            'e.g. AI Chats',
            () => this.plugin.settings.chatNoteFolder ?? '',
            async (value) => { 
                this.plugin.settings.chatNoteFolder = value ?? ''; 
                await this.plugin.saveSettings(); 
            },
            { trim: true }
        );

        // YAML Attribute Generators Section Header
        containerEl.createEl('h3', { text: 'YAML Attribute Generators' });
        this.renderYamlAttributeGenerators(containerEl);
    }

    /**
     * Renders the YAML Attribute Generators section.
     * This section allows users to define custom YAML attributes that can be generated by the AI
     * and inserted into notes.
     * @param containerEl The HTML element to append the section to.
     */
    private renderYamlAttributeGenerators(containerEl: HTMLElement): void {
        containerEl.createEl('div', { 
            text: 'Configure custom YAML attribute generators. Each entry will create a command to generate and insert/update a YAML field in your notes.',
            cls: 'setting-item-description',
            attr: { style: 'margin-bottom: 1em;' }
        });

        const yamlGens = this.plugin.settings.yamlAttributeGenerators ?? [];
        yamlGens.forEach((gen, idx) => {
            const autoCommandName = gen.attributeName ? `Generate YAML: ${gen.attributeName}` : `YAML Generator #${idx + 1}`;
            
            // Container for each YAML generator setting block
            const genContainer = containerEl.createDiv({ cls: 'yaml-generator-container' });
            genContainer.style.border = '1px solid var(--background-modifier-border)';
            genContainer.style.borderRadius = '6px';
            genContainer.style.padding = '1em';
            genContainer.style.marginBottom = '1em';
            
            genContainer.createEl('h4', { text: autoCommandName });

            // YAML Attribute Name Setting
            new Setting(genContainer)
                .setName('YAML Attribute Name')
                .setDesc('The YAML field name to insert/update')
                .addText(text => {
                    text.setPlaceholder('YAML Attribute Name')
                        .setValue(gen.attributeName)
                        .onChange((value) => {
                            // Update attribute name and command name immediately on change
                            if (this.plugin.settings.yamlAttributeGenerators) {
                                this.plugin.settings.yamlAttributeGenerators[idx].attributeName = value ?? '';
                                this.plugin.settings.yamlAttributeGenerators[idx].commandName = value ? `Generate YAML: ${value}` : '';
                            }
                        });
                    
                    // Save settings on blur
                    text.inputEl.addEventListener('blur', async () => {
                        await this.plugin.saveSettings();
                    });
                });

            // Prompt for LLM Setting
            new Setting(genContainer)
                .setName('Prompt for LLM')
                .setDesc('The prompt to send to the AI for generating the YAML value')
                .addTextArea(text => {
                    text.setPlaceholder('Prompt for LLM')
                        .setValue(gen.prompt)
                        .onChange((value) => {
                            // Update prompt immediately on change
                            if (this.plugin.settings.yamlAttributeGenerators) {
                                this.plugin.settings.yamlAttributeGenerators[idx].prompt = value ?? '';
                            }
                        });
                    
                    // Save settings on blur
                    text.inputEl.addEventListener('blur', async () => {
                        await this.plugin.saveSettings();
                    });
                    
                    text.inputEl.rows = 3;
                    text.inputEl.style.width = '100%';
                });

            // Output Mode Dropdown
            new Setting(genContainer)
                .setName('Output Mode')
                .setDesc('Where to put the generated YAML attribute')
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
                });

            // Delete YAML Generator Button
            new Setting(genContainer)
                .addExtraButton(btn => {
                    btn.setIcon('cross')
                        .setTooltip('Delete this YAML generator')
                        .onClick(async () => {
                            if (this.plugin.settings.yamlAttributeGenerators) {
                                this.plugin.settings.yamlAttributeGenerators.splice(idx, 1);
                                await this.plugin.saveSettings();
                            }
                        });
                });
        });

        // Add YAML Attribute Generator Button
        new Setting(containerEl)
            .addButton(btn => {
                btn.setButtonText('Add YAML Attribute Generator')
                    .setCta()
                    .onClick(async () => {
                        if (!this.plugin.settings.yamlAttributeGenerators) this.plugin.settings.yamlAttributeGenerators = [];
                        this.plugin.settings.yamlAttributeGenerators.push(JSON.parse(JSON.stringify({
                            attributeName: '',
                            prompt: '',
                            outputMode: 'metadata',
                            commandName: 'New YAML Generator'
                        })));
                        await this.plugin.saveSettings();
                    });
            });
    }
}
