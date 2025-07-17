/**
 * @file VectorStoreSettingsSection.ts
 * @description Settings section for configuring vector store and semantic search functionality.
 */

import { Setting, Notice, Modal, TextComponent, DropdownComponent } from 'obsidian';
import MyPlugin from '../../main';
import { SettingCreators } from '../components/SettingCreators';
import { SemanticContextBuilder } from '../../components/agent/memory-handling/SemanticContextBuilder';
import { showNotice } from '../../utils/generalUtils';
import { FolderFilterRule } from '../../types/settings';
import { validateFilterRule, normalizeFolderPath, getFilterDescription } from '../../utils/embeddingFilterUtils';

/**
 * VectorStoreSettingsSection
 * ---------------------------
 * Manages settings related to vector store and semantic search functionality.
 */
export class VectorStoreSettingsSection {
    private semanticContextBuilder: SemanticContextBuilder | null = null;

    constructor(
        private plugin: MyPlugin,
        private settingCreators: SettingCreators
    ) {
        // Initialize semantic context builder if available
        try {
            this.semanticContextBuilder = new SemanticContextBuilder(plugin.app, plugin);
        } catch (error) {
            console.warn('SemanticContextBuilder not available:', error);
        }
    }

    /**
     * Renders the vector store settings section.
     */
    render(containerEl: HTMLElement): void {
        // Vector Store Status
        new Setting(containerEl)
            .setName('Vector Store Status')
            .setDesc('Current status of the semantic memory system')
            .addText(text => {
                text.setValue('Loading...');
                text.setDisabled(true);
                
                // Load stats asynchronously
                if (this.semanticContextBuilder) {
                    (async () => {
                        try {
                            // Ensure initialization first
                            if (!this.semanticContextBuilder!.initialized) {
                                text.setValue('Initializing...');
                                await this.semanticContextBuilder!.initialize();
                            }
                            
                            const stats = await this.semanticContextBuilder!.getStats();
                            if (stats) {
                                text.setValue(`${stats.totalVectors} embeddings stored`);
                            } else {
                                text.setValue('Vector store ready (no embeddings yet)');
                            }
                        } catch (error) {
                            text.setValue(`Error: ${error.message}`);
                        }
                    })();
                } else {
                    text.setValue('Vector store unavailable');
                }
            });

        // Enable Semantic Context
        new Setting(containerEl)
            .setName('Enable Semantic Context')
            .setDesc('Use semantic search to find relevant context for AI completions. Requires embeddings to be generated first.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableSemanticContext ?? false)
                .onChange(async (value) => {
                    this.plugin.settings.enableSemanticContext = value;
                    await this.plugin.saveSettings();
                }));

        // Semantic Context Settings
        if (this.plugin.settings.enableSemanticContext) {
            new Setting(containerEl)
                .setName('Max Context Chunks')
                .setDesc('Maximum number of relevant chunks to include in AI context')
                .addSlider(slider => slider
                    .setLimits(1, 10, 1)
                    .setValue(this.plugin.settings.maxSemanticContextChunks ?? 3)
                    .setDynamicTooltip()
                    .onChange(async (value) => {
                        this.plugin.settings.maxSemanticContextChunks = value;
                        await this.plugin.saveSettings();
                    }));

            new Setting(containerEl)
                .setName('Similarity Threshold')
                .setDesc('Minimum similarity score for including context (0.0 to 1.0)')
                .addSlider(slider => slider
                    .setLimits(0.0, 1.0, 0.1)
                    .setValue(this.plugin.settings.semanticSimilarityThreshold ?? 0.7)
                    .setDynamicTooltip()
                    .onChange(async (value) => {
                        this.plugin.settings.semanticSimilarityThreshold = value;
                        await this.plugin.saveSettings();
                    }));
        }

        // Folder Filtering Settings
        const filterSettings = this.plugin.settings.embeddingFolderFilter || { mode: 'off', rules: [] };
        
        new Setting(containerEl)
            .setName('Folder Filtering')
            .setDesc('Control which folders are included or excluded from embedding')
            .addDropdown(dropdown => dropdown
                .addOption('off', 'No filtering (all files)')
                .addOption('include', 'Include only (whitelist)')
                .addOption('exclude', 'Exclude (blacklist)')
                .setValue(filterSettings.mode)
                .onChange(async (value: 'off' | 'include' | 'exclude') => {
                    if (!this.plugin.settings.embeddingFolderFilter) {
                        this.plugin.settings.embeddingFolderFilter = { mode: 'off', rules: [] };
                    }
                    this.plugin.settings.embeddingFolderFilter.mode = value;
                    await this.plugin.saveSettings();
                    // Refresh the section to show/hide rule controls
                    containerEl.empty();
                    this.render(containerEl);
                }));

        // Show filter status
        const filterDesc = getFilterDescription(filterSettings);
        const statusEl = containerEl.createDiv({
            text: filterDesc,
            cls: 'setting-item-description'
        });
        statusEl.style.marginBottom = '10px';
        statusEl.style.fontStyle = 'italic';

        // Show folder rules if filtering is enabled
        if (filterSettings.mode !== 'off') {
            // Rules header
            const rulesHeader = containerEl.createEl('h4', { text: 'Folder Rules' });
            rulesHeader.style.marginTop = '20px';
            rulesHeader.style.marginBottom = '10px';

            // Rules list
            const rulesContainer = containerEl.createDiv({ cls: 'folder-rules-container' });
            rulesContainer.style.marginBottom = '15px';

            const renderRules = () => {
                rulesContainer.empty();
                
                const rules = this.plugin.settings.embeddingFolderFilter?.rules || [];
                
                rules.forEach((rule, index) => {
                    const ruleEl = rulesContainer.createDiv({ cls: 'folder-rule-item' });
                    ruleEl.style.border = '1px solid var(--background-modifier-border)';
                    ruleEl.style.borderRadius = '5px';
                    ruleEl.style.padding = '10px';
                    ruleEl.style.marginBottom = '10px';
                    ruleEl.style.backgroundColor = 'var(--background-secondary)';

                    // Rule path input
                    const pathSetting = new Setting(ruleEl)
                        .setName(`Folder Path ${index + 1}`)
                        .setDesc('Folder path (supports * and ** wildcards)')
                        .addText(text => {
                            text.setPlaceholder('e.g., Notes/**, Templates/*, Archive')
                                .setValue(rule.path)
                                .onChange((value) => {
                                    // Update path immediately on change without saving
                                    if (this.plugin.settings.embeddingFolderFilter?.rules) {
                                        this.plugin.settings.embeddingFolderFilter.rules[index].path = normalizeFolderPath(value);
                                    }
                                });
                            
                            // Save settings on blur
                            text.inputEl.addEventListener('blur', async () => {
                                await this.plugin.saveSettings();
                            });
                        });

                    // Recursive toggle
                    new Setting(ruleEl)
                        .setName('Recursive')
                        .setDesc('Include subdirectories')
                        .addToggle(toggle => toggle
                            .setValue(rule.recursive)
                            .onChange(async (value) => {
                                if (this.plugin.settings.embeddingFolderFilter?.rules) {
                                    this.plugin.settings.embeddingFolderFilter.rules[index].recursive = value;
                                    await this.plugin.saveSettings();
                                }
                            }));

                    // Description input
                    new Setting(ruleEl)
                        .setName('Description')
                        .setDesc('Optional description for this rule')
                        .addText(text => {
                            text.setPlaceholder('e.g., Project notes, Templates')
                                .setValue(rule.description || '')
                                .onChange((value) => {
                                    // Update description immediately on change without saving
                                    if (this.plugin.settings.embeddingFolderFilter?.rules) {
                                        this.plugin.settings.embeddingFolderFilter.rules[index].description = value;
                                    }
                                });
                            
                            // Save settings on blur
                            text.inputEl.addEventListener('blur', async () => {
                                await this.plugin.saveSettings();
                            });
                        });

                    // Delete rule button
                    new Setting(ruleEl)
                        .addButton(button => button
                            .setButtonText('Delete Rule')
                            .setWarning()
                            .onClick(async () => {
                                if (this.plugin.settings.embeddingFolderFilter?.rules) {
                                    this.plugin.settings.embeddingFolderFilter.rules.splice(index, 1);
                                    await this.plugin.saveSettings();
                                    renderRules();
                                }
                            }));
                });

                // Add new rule button
                const addRuleButton = rulesContainer.createDiv();
                new Setting(addRuleButton)
                    .setName('Add Folder Rule')
                    .setDesc('Add a new folder path to the filter')
                    .addButton(button => button
                        .setButtonText('Add Rule')
                        .setCta()
                        .onClick(async () => {
                            if (!this.plugin.settings.embeddingFolderFilter) {
                                this.plugin.settings.embeddingFolderFilter = { mode: 'include', rules: [] };
                            }
                            
                            const newRule: FolderFilterRule = {
                                path: '',
                                recursive: true,
                                description: ''
                            };
                            
                            this.plugin.settings.embeddingFolderFilter.rules.push(newRule);
                            await this.plugin.saveSettings();
                            renderRules();
                        }));

                // Help text
                const helpEl = rulesContainer.createDiv({
                    cls: 'setting-item-description'
                });
                helpEl.innerHTML = `
                    <strong>Pattern Examples:</strong><br>
                    • <code>Notes</code> - Files directly in Notes folder<br>
                    • <code>Notes/**</code> - All files in Notes and subdirectories<br>
                    • <code>**/Templates</code> - Any Templates folder anywhere<br>
                    • <code>Archive/*</code> - Files directly in Archive folder<br>
                    • <code>*.md</code> - All markdown files (not recommended for folders)
                `;
                helpEl.style.marginTop = '15px';
                helpEl.style.padding = '10px';
                helpEl.style.backgroundColor = 'var(--background-primary-alt)';
                helpEl.style.borderRadius = '5px';
            };

            renderRules();
        }

        // Embedding Management Actions
        const actionsContainer = containerEl.createDiv({ cls: 'vector-store-actions' });
        
        // Embed All Notes
        new Setting(actionsContainer)
            .setName('Embed All Notes')
            .setDesc('Generate embeddings for notes in your vault. Respects folder filtering settings above.')
            .addButton(button => button
                .setButtonText('Embed All Notes')
                .setCta()
                .onClick(async () => {
                    if (!this.semanticContextBuilder) {
                        showNotice('Vector store not available on this platform');
                        return;
                    }
                    
                    if (!this.plugin.settings.openaiSettings.apiKey) {
                        showNotice('OpenAI API key required for embedding generation');
                        return;
                    }

                    try {
                        // Ensure initialization
                        if (!this.semanticContextBuilder.initialized) {
                            button.setButtonText('Initializing...');
                            button.setDisabled(true);
                            await this.semanticContextBuilder.initialize();
                        }

                        button.setButtonText('Embedding...');
                        button.setDisabled(true);
                        await this.semanticContextBuilder.embedAllNotes();
                        button.setButtonText('Embed All Notes');
                        button.setDisabled(false);
                        // Refresh the display to update stats
                        containerEl.empty();
                        this.render(containerEl);
                    } catch (error) {
                        button.setButtonText('Embed All Notes');
                        button.setDisabled(false);
                        showNotice(`Error: ${error.message}`);
                    }
                }));

        // Clear All Embeddings
        new Setting(actionsContainer)
            .setName('Clear All Embeddings')
            .setDesc('Remove all stored embeddings from the vector database')
            .addButton(button => button
                .setButtonText('Clear All')
                .setWarning()
                .onClick(async () => {
                    if (!this.semanticContextBuilder) {
                        showNotice('Vector store not available');
                        return;
                    }

                    try {
                        // Ensure initialization
                        if (!this.semanticContextBuilder.initialized) {
                            await this.semanticContextBuilder.initialize();
                        }

                        await this.semanticContextBuilder.clearAllEmbeddings();
                        // Refresh the display to update stats
                        containerEl.empty();
                        this.render(containerEl);
                    } catch (error) {
                        showNotice(`Error: ${error.message}`);
                    }
                }));

        // Test Semantic Search
        let searchQuery = '';
        new Setting(actionsContainer)
            .setName('Test Semantic Search')
            .setDesc('Test the semantic search functionality with a sample query')
            .addText(text => text
                .setPlaceholder('Enter search query...')
                .onChange((value) => {
                    searchQuery = value;
                }))
            .addButton(button => button
                .setButtonText('Search')
                .onClick(async () => {
                    if (!this.semanticContextBuilder) {
                        showNotice('Vector store not available');
                        return;
                    }

                    if (!searchQuery.trim()) {
                        showNotice('Please enter a search query');
                        return;
                    }

                    try {
                        // Ensure initialization
                        if (!this.semanticContextBuilder.initialized) {
                            button.setButtonText('Initializing...');
                            button.setDisabled(true);
                            await this.semanticContextBuilder.initialize();
                            button.setButtonText('Search');
                            button.setDisabled(false);
                        }

                        button.setButtonText('Searching...');
                        button.setDisabled(true);

                        const results = await this.semanticContextBuilder.semanticSearch(searchQuery, {
                            topK: 3,
                            minSimilarity: this.plugin.settings.semanticSimilarityThreshold ?? 0.7
                        });

                        button.setButtonText('Search');
                        button.setDisabled(false);

                        if (results.length === 0) {
                            showNotice('No similar content found. Make sure you have generated embeddings first.');
                        } else {
                            const resultText = results.map((r, i) => 
                                `${i + 1}. [${r.similarity.toFixed(3)}] ${r.text.slice(0, 100)}...`
                            ).join('\n\n');
                            
                            // Create a modal to show results
                            const modal = new Modal(this.plugin.app);
                            modal.titleEl.setText('Semantic Search Results');
                            modal.contentEl.createEl('pre', { text: resultText });
                            modal.open();
                        }
                    } catch (error) {
                        button.setButtonText('Search');
                        button.setDisabled(false);
                        showNotice(`Search error: ${error.message}`);
                    }
                }));

        // Information Box
        const infoEl = containerEl.createDiv({ cls: 'setting-item-description' });
        infoEl.style.marginTop = '20px';
        infoEl.style.padding = '10px';
        infoEl.style.border = '1px solid var(--background-modifier-border)';
        infoEl.style.borderRadius = '5px';
        infoEl.innerHTML = `
            <strong>About Semantic Memory:</strong><br>
            The vector store provides semantic memory capabilities by storing embeddings of your notes and conversations. 
            This allows the AI to find and include relevant context even when the exact keywords don't match.<br><br>
            <strong>Requirements:</strong><br>
            • OpenAI API key for embedding generation<br>
            • Initial embedding generation for your notes<br><br>
            <strong>Cross-Platform:</strong> Works on both Obsidian Desktop and Mobile devices.<br><br>
            <strong>Privacy:</strong> Embeddings are stored locally using IndexedDB and never sent to external services except for the initial generation.
        `;
    }
}
