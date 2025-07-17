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
    constructor(app: App, private results: any[], private totalEmbeddings?: number) {
        super(app);
    }

    onOpen() {
        const { contentEl } = this;
        
        // Create header with stats
        const headerContainer = contentEl.createDiv({ cls: 'semantic-search-header' });
        headerContainer.createEl('h3', { text: 'Semantic Search Results' });
        
        if (this.totalEmbeddings !== undefined) {
            const statsEl = headerContainer.createDiv({ cls: 'search-stats' });
            statsEl.style.fontSize = '0.9em';
            statsEl.style.color = 'var(--text-muted)';
            statsEl.style.marginBottom = '10px';
            statsEl.setText(`Found ${this.results.length} results from ${this.totalEmbeddings} total embeddings`);
        }

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
 * Modal for showing embedding progress with cancel option
 */
class EmbeddingProgressModal extends Modal {
    private progressEl: HTMLElement;
    private statusEl: HTMLElement;
    private cancelBtn: HTMLButtonElement;
    private semanticBuilder: SemanticContextBuilder;
    private onCancel: () => void;
    private progressCallback: (processed: number, total: number) => void;

    constructor(app: App, semanticBuilder: SemanticContextBuilder, onCancel: () => void) {
        super(app);
        this.semanticBuilder = semanticBuilder;
        this.onCancel = onCancel;
        
        // Create the progress callback
        this.progressCallback = (processed: number, total: number) => {
            this.updateProgress(processed, total);
        };
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.createEl('h3', { text: 'Embedding Notes Progress' });

        this.statusEl = contentEl.createDiv({ cls: 'embedding-status' });
        this.statusEl.style.marginBottom = '15px';
        this.statusEl.setText('Starting embedding process...');

        this.progressEl = contentEl.createDiv({ cls: 'embedding-progress' });
        this.progressEl.style.width = '100%';
        this.progressEl.style.height = '20px';
        this.progressEl.style.backgroundColor = 'var(--background-modifier-border)';
        this.progressEl.style.borderRadius = '10px';
        this.progressEl.style.overflow = 'hidden';
        this.progressEl.style.marginBottom = '15px';

        const progressBar = this.progressEl.createDiv({ cls: 'progress-bar' });
        progressBar.style.width = '0%';
        progressBar.style.height = '100%';
        progressBar.style.backgroundColor = 'var(--interactive-accent)';
        progressBar.style.transition = 'width 0.3s ease';

        const buttonContainer = contentEl.createDiv({ cls: 'button-container' });
        buttonContainer.style.textAlign = 'center';

        this.cancelBtn = buttonContainer.createEl('button', { text: 'Cancel Embedding' });
        this.cancelBtn.style.padding = '8px 16px';
        this.cancelBtn.addEventListener('click', () => {
            this.onCancel();
            this.close();
        });
    }

    updateProgress(current: number, total: number, currentFile?: string) {
        const percentage = total > 0 ? Math.round((current / total) * 100) : 0;
        
        this.statusEl.setText(
            `Embedded ${current}/${total} notes (${percentage}%)` +
            (currentFile ? `\nProcessing: ${currentFile}` : '')
        );

        const progressBar = this.progressEl.querySelector('.progress-bar') as HTMLElement;
        if (progressBar) {
            progressBar.style.width = `${percentage}%`;
        }
    }
    
    getProgressCallback() {
        return this.progressCallback;
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}

/**
 * Registers vector store and semantic search commands.
 */
export function registerVectorStoreCommands(plugin: MyPlugin): void {
    // Embed currently open note command
    registerCommand(plugin, {
        id: 'embed-currently-open-note',
        name: 'Embed Currently Open Note',
        callback: async () => {
            try {
                const semanticBuilder = new SemanticContextBuilder(plugin.app, plugin);
                await semanticBuilder.initialize();
                await semanticBuilder.embedCurrentNote();
                
                // Get updated stats to show total count
                const stats = await semanticBuilder.getStats();
                const totalCount = stats ? stats.totalVectors : 0;
                new Notice(`Successfully embedded currently open note! Total embedded notes: ${totalCount}`);
            } catch (error) {
                debugLog(plugin.settings.debugMode ?? false, 'error', 'Failed to embed currently open note:', error);
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
                await semanticBuilder.initialize();
                
                // Check if embedding is already in progress
                if (semanticBuilder.isEmbeddingInProgress()) {
                    new Notice('Embedding is already in progress. Use "Cancel Embedding" to stop it.');
                    return;
                }
                
                // Show initial count
                const initialStats = await semanticBuilder.getStats();
                const initialCount = initialStats ? initialStats.totalVectors : 0;
                const totalNotes = plugin.app.vault.getMarkdownFiles().length;
                
                new Notice(`Starting embedding process... Currently have ${initialCount} embeddings for ${totalNotes} notes`);
                
                // Show progress modal
                const progressModal = new EmbeddingProgressModal(plugin.app, semanticBuilder, () => {
                    semanticBuilder.cancelEmbedding();
                });
                progressModal.open();
                
                await semanticBuilder.embedAllNotes({
                    onProgress: progressModal.getProgressCallback()
                });
                
                progressModal.close();
                
                // Final stats update
                const finalStats = await semanticBuilder.getStats();
                const finalCount = finalStats ? finalStats.totalVectors : 0;
                new Notice(`Embedding process completed. Total embedded notes: ${finalCount}`);
            } catch (error) {
                debugLog(plugin.settings.debugMode ?? false, 'error', 'Failed to embed notes:', error);
                new Notice(`Error: ${error.message}`);
            }
        }
    });

    // Cancel embedding command
    registerCommand(plugin, {
        id: 'cancel-embedding',
        name: 'Cancel Embedding Process',
        callback: async () => {
            try {
                const semanticBuilder = new SemanticContextBuilder(plugin.app, plugin);
                
                if (semanticBuilder.isEmbeddingInProgress()) {
                    semanticBuilder.cancelEmbedding();
                    new Notice('Embedding process cancellation requested...');
                } else {
                    new Notice('No embedding process is currently running.');
                }
            } catch (error) {
                debugLog(plugin.settings.debugMode ?? false, 'error', 'Failed to cancel embedding:', error);
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
                
                // Get total embedding count for context
                const stats = await semanticBuilder.getStats();
                const totalEmbeddings = stats ? stats.totalVectors : 0;
                
                const results = await semanticBuilder.semanticSearch(query, {
                    topK: 10,
                    minSimilarity: plugin.settings.semanticSimilarityThreshold || 0.7
                });

                const resultsModal = new SemanticSearchModal(plugin.app, results, totalEmbeddings);
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
                
                // Get stats before clearing to show what was removed
                const statsBefore = await semanticBuilder.getStats();
                const countBefore = statsBefore ? statsBefore.totalVectors : 0;
                
                await semanticBuilder.clearAllEmbeddings();
                
                new Notice(`Successfully cleared ${countBefore} embeddings from vector store`);
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
        callback: async () => {
            try {
                const semanticBuilder = new SemanticContextBuilder(plugin.app, plugin);
                const stats = await semanticBuilder.getStats();

                if (stats) {
                    const totalNotes = plugin.app.vault.getMarkdownFiles().length;
                    const embeddedCount = stats.totalVectors;
                    const percentage = totalNotes > 0 ? Math.round((embeddedCount / totalNotes) * 100) : 0;
                    
                    const statusSuffix = semanticBuilder.isEmbeddingInProgress() ? ' (⏳ Embedding in progress...)' : '';
                    
                    new Notice(
                        `Vector Store: ${embeddedCount} embeddings stored (${percentage}% of ${totalNotes} notes)${statusSuffix}`
                    );
                } else {
                    new Notice('Vector store not available on this platform');
                }
            } catch (error) {
                debugLog(plugin.settings.debugMode ?? false, 'error', 'Failed to get stats:', error);
                new Notice(`Error: ${error.message}`);
            }
        }
    });

    // Detailed vector store info command  
    registerCommand(plugin, {
        id: 'vector-store-detailed-info',
        name: 'Detailed Vector Store Information',
        callback: async () => {
            try {
                const semanticBuilder = new SemanticContextBuilder(plugin.app, plugin);
                const stats = await semanticBuilder.getStats();

                if (stats) {
                    const totalNotes = plugin.app.vault.getMarkdownFiles().length;
                    const embeddedCount = stats.totalVectors;
                    const notEmbedded = totalNotes - embeddedCount;
                    const percentage = totalNotes > 0 ? Math.round((embeddedCount / totalNotes) * 100) : 0;
                    
                    const recommendation = percentage < 50 ? 'Consider embedding more notes for better semantic search!' : 
                                           percentage < 80 ? 'Good coverage! You may want to embed a few more notes.' :
                                           'Excellent coverage! Your semantic search should work very well.';
                    
                    new Notice(
                        `📊 Vector Store Info: ${embeddedCount}/${totalNotes} notes embedded (${percentage}%). ${recommendation}`
                    );
                } else {
                    new Notice('Vector store not available on this platform');
                }
            } catch (error) {
                debugLog(plugin.settings.debugMode ?? false, 'error', 'Failed to get detailed info:', error);
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
                
                // Get total embedding count for context
                const stats = await semanticBuilder.getStats();
                const totalEmbeddings = stats ? stats.totalVectors : 0;
                
                const results = await semanticBuilder.semanticSearch(selection, {
                    topK: 5,
                    minSimilarity: plugin.settings.semanticSimilarityThreshold || 0.7
                });

                const resultsModal = new SemanticSearchModal(plugin.app, results, totalEmbeddings);
                resultsModal.open();
            } catch (error) {
                debugLog(plugin.settings.debugMode ?? false, 'error', 'Semantic search failed:', error);
                new Notice(`Error: ${error.message}`);
            }
        }
    });

    // Show notes missing embeddings command
    registerCommand(plugin, {
        id: 'show-missing-embeddings',
        name: 'Show Notes Missing Embeddings',
        callback: async () => {
            try {
                const semanticBuilder = new SemanticContextBuilder(plugin.app, plugin);
                await semanticBuilder.initialize();
                
                if (!semanticBuilder.initialized) {
                    new Notice('Vector store not available on this platform');
                    return;
                }

                // Get all files and check which ones have embeddings
                const allFiles = plugin.app.vault.getMarkdownFiles();
                const stats = await semanticBuilder.getStats();
                const embeddedCount = stats ? stats.totalVectors : 0;
                
                if (embeddedCount === 0) {
                    new Notice('No notes have been embedded yet. Use "Embed All Notes" to get started!');
                    return;
                }
                
                const missingCount = allFiles.length - embeddedCount;
                
                if (missingCount === 0) {
                    new Notice('🎉 All notes are embedded! Your semantic search is fully ready.');
                } else if (missingCount <= 5) {
                    new Notice(`${missingCount} notes still need embedding. Consider running "Embed All Notes" to complete coverage.`);
                } else {
                    new Notice(`${missingCount} out of ${allFiles.length} notes still need embedding (${Math.round((embeddedCount / allFiles.length) * 100)}% complete).`);
                }
            } catch (error) {
                debugLog(plugin.settings.debugMode ?? false, 'error', 'Failed to check missing embeddings:', error);
                new Notice(`Error: ${error.message}`);
            }
        }
    });

    // Hybrid Vector Manager Commands
    
    // Force backup command
    registerCommand(plugin, {
        id: 'hybrid-vector-force-backup',
        name: 'Hybrid Vector: Force Backup',
        callback: async () => {
            try {
                const semanticBuilder = new SemanticContextBuilder(plugin.app, plugin);
                await semanticBuilder.initialize();
                
                const hybridManager = semanticBuilder.getHybridVectorManager();
                if (hybridManager && 'forceBackup' in hybridManager) {
                    await hybridManager.forceBackup();
                    new Notice('✅ Vector backup completed successfully');
                } else {
                    new Notice('❌ Hybrid vector manager not available');
                }
            } catch (error) {
                debugLog(plugin.settings.debugMode ?? false, 'error', 'Failed to force backup:', error);
                new Notice(`Error: ${error.message}`);
            }
        }
    });

    // Force restore command
    registerCommand(plugin, {
        id: 'hybrid-vector-force-restore',
        name: 'Hybrid Vector: Force Restore from Backup',
        callback: async () => {
            try {
                const semanticBuilder = new SemanticContextBuilder(plugin.app, plugin);
                await semanticBuilder.initialize();
                
                const hybridManager = semanticBuilder.getHybridVectorManager();
                if (hybridManager && 'forceRestore' in hybridManager) {
                    await hybridManager.forceRestore();
                    new Notice('✅ Vector restore completed successfully');
                } else {
                    new Notice('❌ Hybrid vector manager not available');
                }
            } catch (error) {
                debugLog(plugin.settings.debugMode ?? false, 'error', 'Failed to force restore:', error);
                new Notice(`Error: ${error.message}`);
            }
        }
    });

    // Hybrid vector status command
    registerCommand(plugin, {
        id: 'hybrid-vector-status',
        name: 'Hybrid Vector: Status & Statistics',
        callback: async () => {
            try {
                const semanticBuilder = new SemanticContextBuilder(plugin.app, plugin);
                await semanticBuilder.initialize();
                
                const hybridManager = semanticBuilder.getHybridVectorManager();
                if (hybridManager && 'getStatus' in hybridManager) {
                    const status = await hybridManager.getStatus();
                    
                    const lastBackupStr = status.lastBackupTime > 0 
                        ? new Date(status.lastBackupTime).toLocaleString()
                        : 'Never';
                    
                    const changeStr = status.changesSinceBackup > 0 
                        ? ` (${status.changesSinceBackup} changes since backup)`
                        : '';
                    
                    const message = [
                        `📊 Hybrid Vector Storage Status:`,
                        `Ready: ${status.isReady ? '✅' : '❌'}`,
                        `Vectors: ${status.vectorCount}${changeStr}`,
                        `Last backup: ${lastBackupStr}`,
                        `Backup file: ${status.backupFilePath}`,
                        `Summary hash: ${status.metadata.summaryHash}`
                    ].join('\n');
                    
                    new Notice(message, 8000);
                } else {
                    new Notice('❌ Hybrid vector manager not available');
                }
            } catch (error) {
                debugLog(plugin.settings.debugMode ?? false, 'error', 'Failed to get hybrid vector status:', error);
                new Notice(`Error: ${error.message}`);
            }
        }
    });

}
