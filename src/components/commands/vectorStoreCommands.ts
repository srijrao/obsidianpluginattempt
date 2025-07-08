/**
 * @file vectorStoreCommands.ts
 * @description Commands for managing vector store and semantic search functionality.
 */

import { Editor, Notice, Modal, App } from 'obsidian';
import type MyPlugin from '../../main';
import { SemanticContextBuilder } from '../agent/memory-handling/SemanticContextBuilder';
import { registerCommand } from '../../utils/pluginUtils';
import { debugLog } from '../../utils/logger';

/**
 * Modal for semantic search results display
 */
class SemanticSearchModal extends Modal {
    constructor(app: App, private results: any[]) {
        super(app);
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.createEl('h3', { text: 'Semantic Search Results' });
        
        if (this.results.length === 0) {
            contentEl.createEl('p', { text: 'No results found.' });
            return;
        }

        this.results.forEach((result, index) => {
            const resultEl = contentEl.createDiv({ cls: 'semantic-search-result' });
            resultEl.style.marginBottom = '15px';
            resultEl.style.padding = '10px';
            resultEl.style.border = '1px solid var(--background-modifier-border)';
            resultEl.style.borderRadius = '5px';
            
            const headerEl = resultEl.createDiv({ cls: 'result-header' });
            headerEl.style.marginBottom = '5px';
            headerEl.style.fontWeight = 'bold';
            headerEl.setText(`${index + 1}. Similarity: ${result.similarity.toFixed(3)}`);
            
            if (result.filePath) {
                const pathEl = resultEl.createDiv({ cls: 'result-path' });
                pathEl.style.fontSize = '0.9em';
                pathEl.style.color = 'var(--text-muted)';
                pathEl.setText(`File: ${result.filePath}`);
            }
            
            const resultContentEl = resultEl.createDiv({ cls: 'result-content' });
            resultContentEl.style.marginTop = '10px';
            resultContentEl.style.whiteSpace = 'pre-wrap';
            resultContentEl.setText(result.text);
        });
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}

/**
 * Modal for semantic search input
 */
class SemanticSearchInputModal extends Modal {
    private result: string | null = null;

    constructor(app: App) {
        super(app);
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.createEl('h3', { text: 'Semantic Search' });
        
        const inputEl = contentEl.createEl('input', {
            type: 'text',
            placeholder: 'Enter your search query...'
        });
        inputEl.style.width = '100%';
        inputEl.style.marginBottom = '10px';
        inputEl.style.padding = '8px';
        
        const buttonContainer = contentEl.createDiv();
        
        const searchBtn = buttonContainer.createEl('button', { text: 'Search' });
        searchBtn.style.marginRight = '10px';
        
        const cancelBtn = buttonContainer.createEl('button', { text: 'Cancel' });
        
        searchBtn.addEventListener('click', () => {
            this.result = inputEl.value.trim();
            if (this.result) {
                this.close();
            }
        });
        
        cancelBtn.addEventListener('click', () => {
            this.result = null;
            this.close();
        });
        
        inputEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                this.result = inputEl.value.trim();
                if (this.result) {
                    this.close();
                }
            } else if (e.key === 'Escape') {
                this.result = null;
                this.close();
            }
        });
        
        inputEl.focus();
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }

    async getSearchQuery(): Promise<string | null> {
        return new Promise((resolve) => {
            this.onClose = () => {
                this.contentEl.empty();
                resolve(this.result);
            };
            this.open();
        });
    }
}

/**
 * Registers vector store and semantic search commands.
 */
export function registerVectorStoreCommands(plugin: MyPlugin): void {
    // Embed current note command
    registerCommand(plugin, {
        id: 'embed-current-note',
        name: 'Embed Current Note',
        callback: async () => {
            try {
                const semanticBuilder = new SemanticContextBuilder(plugin.app, plugin);
                await semanticBuilder.embedCurrentNote();
                new Notice('Successfully embedded current note');
            } catch (error) {
                debugLog(plugin.settings.debugMode ?? false, 'error', 'Failed to embed current note:', error);
                new Notice(`Error: ${error.message}`);
            }
        }
    });

    // Embed all notes command
    registerCommand(plugin, {
        id: 'embed-all-notes',
        name: 'Embed All Notes',
        callback: async () => {
            if (!plugin.settings.openaiSettings.apiKey) {
                new Notice('OpenAI API key required for embedding generation');
                return;
            }

            try {
                const semanticBuilder = new SemanticContextBuilder(plugin.app, plugin);
                await semanticBuilder.embedAllNotes();
            } catch (error) {
                debugLog(plugin.settings.debugMode ?? false, 'error', 'Failed to embed notes:', error);
                new Notice(`Error: ${error.message}`);
            }
        }
    });

    // Semantic search command
    registerCommand(plugin, {
        id: 'semantic-search',
        name: 'Semantic Search',
        callback: async () => {
            try {
                const modal = new SemanticSearchInputModal(plugin.app);
                const query = await modal.getSearchQuery();
                
                if (!query) return;

                const semanticBuilder = new SemanticContextBuilder(plugin.app, plugin);
                const results = await semanticBuilder.semanticSearch(query, {
                    topK: 10,
                    minSimilarity: plugin.settings.semanticSimilarityThreshold || 0.7
                });

                const resultsModal = new SemanticSearchModal(plugin.app, results);
                resultsModal.open();
            } catch (error) {
                debugLog(plugin.settings.debugMode ?? false, 'error', 'Semantic search failed:', error);
                new Notice(`Error: ${error.message}`);
            }
        }
    });

    // Clear embeddings command
    registerCommand(plugin, {
        id: 'clear-all-embeddings',
        name: 'Clear All Embeddings',
        callback: async () => {
            try {
                const semanticBuilder = new SemanticContextBuilder(plugin.app, plugin);
                await semanticBuilder.clearAllEmbeddings();
            } catch (error) {
                debugLog(plugin.settings.debugMode ?? false, 'error', 'Failed to clear embeddings:', error);
                new Notice(`Error: ${error.message}`);
            }
        }
    });

    // Show vector store stats command
    registerCommand(plugin, {
        id: 'vector-store-stats',
        name: 'Vector Store Statistics',
        callback: () => {
            try {
                const semanticBuilder = new SemanticContextBuilder(plugin.app, plugin);
                const stats = semanticBuilder.getStats();
                
                if (stats) {
                    new Notice(`Vector Store: ${stats.totalVectors} embeddings stored`);
                } else {
                    new Notice('Vector store not available on this platform');
                }
            } catch (error) {
                debugLog(plugin.settings.debugMode ?? false, 'error', 'Failed to get stats:', error);
                new Notice(`Error: ${error.message}`);
            }
        }
    });

    // Semantic search with selection command
    registerCommand(plugin, {
        id: 'semantic-search-selection',
        name: 'Semantic Search with Selection',
        editorCallback: async (editor: Editor) => {
            try {
                const selection = editor.getSelection();
                if (!selection.trim()) {
                    new Notice('Please select some text to search for similar content');
                    return;
                }

                const semanticBuilder = new SemanticContextBuilder(plugin.app, plugin);
                const results = await semanticBuilder.semanticSearch(selection, {
                    topK: 5,
                    minSimilarity: plugin.settings.semanticSimilarityThreshold || 0.7
                });

                const resultsModal = new SemanticSearchModal(plugin.app, results);
                resultsModal.open();
            } catch (error) {
                debugLog(plugin.settings.debugMode ?? false, 'error', 'Semantic search failed:', error);
                new Notice(`Error: ${error.message}`);
            }
        }
    });
}
