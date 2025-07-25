/**
 * @file SemanticSearchCodeblock.ts
 * @description Renders semantic search results as live codeblocks in notes
 */

import { MarkdownPostProcessorContext } from 'obsidian';
import type MyPlugin from '../../main';
import { SemanticContextBuilder } from '../agent/memory-handling/SemanticContextBuilder';
import { debugLog } from '../../utils/logger';

/**
 * Registers the semantic search codeblock processor
 */
export function registerSemanticSearchCodeblock(plugin: MyPlugin): void {
    plugin.registerMarkdownCodeBlockProcessor('semantic-search', async (source, el, ctx) => {
        await processSemanticSearchCodeblock(source, el, ctx, plugin);
    });
}

/**
 * Processes a semantic search codeblock and renders results
 */
async function processSemanticSearchCodeblock(
    source: string,
    el: HTMLElement,
    ctx: MarkdownPostProcessorContext,
    plugin: MyPlugin
): Promise<void> {
    // Clear any existing content
    el.empty();

    // Parse the query from the codeblock content
    const query = source.trim();
    
    if (!query) {
        el.createEl('div', { 
            text: 'Enter a search query in the codeblock',
            cls: 'semantic-search-empty'
        });
        return;
    }

    // Add main container class
    el.addClass('semantic-search-container');

    // Add loading indicator
    const loadingEl = el.createEl('div', { 
        text: 'Searching...',
        cls: 'semantic-search-loading'
    });

    try {
        // Perform the semantic search
        const semanticBuilder = new SemanticContextBuilder(plugin.app, plugin);
        
        // Initialize the semantic builder if not already initialized
        if (!semanticBuilder.initialized) {
            await semanticBuilder.initialize();
        }
        
        // Check if we have any embeddings
        const stats = await semanticBuilder.getStats();
        console.log(`Semantic search debug: ${stats?.totalVectors || 0} total embeddings available`);
        debugLog(plugin.settings.debugMode ?? false, 'info', `Semantic search: ${stats?.totalVectors || 0} total embeddings available`);
        
        console.log(`Attempting semantic search for query: "${query}"`);
        const results = await semanticBuilder.semanticSearch(query, {
            topK: plugin.settings.semanticSearchResultCount ?? 10,
            minSimilarity: 0.0
        });
        console.log(`Semantic search completed. Found ${results.length} results`);

        // Remove loading indicator
        loadingEl.remove();

        // Add debug info if no results but embeddings exist
        if (results.length === 0 && stats && stats.totalVectors > 0) {
            console.warn(`No results found for query "${query}" despite having ${stats.totalVectors} embeddings`);
            el.createEl('div', {
                text: `Debug: Found ${stats.totalVectors} total embeddings but no results for query "${query}". This might indicate an embedding service issue.`,
                cls: 'semantic-search-error'
            });
            return;
        }

        // Render results
        renderSemanticSearchResults(el, results, query, plugin);

    } catch (error) {
        loadingEl.remove();
        console.error('Semantic search codeblock failed:', error);
        debugLog(plugin.settings.debugMode ?? false, 'error', 'Semantic search codeblock failed:', error);
        
        // Show detailed error information
        const errorEl = el.createEl('div', {
            cls: 'semantic-search-error'
        });
        
        errorEl.createEl('div', {
            text: `Error: ${error.message}`
        });
        
        if (error.stack) {
            const stackEl = errorEl.createEl('details');
            stackEl.createEl('summary', { text: 'Error Details' });
            stackEl.createEl('pre', { 
                text: error.stack,
                attr: { style: 'font-size: 0.8em; margin-top: 10px; white-space: pre-wrap;' }
            });
        }
    }
}

/**
 * Renders semantic search results in the codeblock element
 */
function renderSemanticSearchResults(
    el: HTMLElement,
    results: any[],
    query: string,
    plugin: MyPlugin
): void {
    // Add main container with semantic search class
    el.addClass('semantic-search-container');
    
    // Add header with query and result count
    const headerEl = el.createEl('div', { cls: 'semantic-search-header' });
    headerEl.createEl('h4', { 
        text: `Query: "${query}"`,
        cls: 'semantic-search-title'
    });
    headerEl.createEl('span', {
        text: `${results.length} embeddings found`,
        cls: 'semantic-search-count'
    });

    if (results.length === 0) {
        el.createEl('div', {
            text: 'No embeddings found. Make sure you have embedded some notes first using "AI Assistant: Embed All Notes" or "AI Assistant: Embed Currently Open Note".',
            cls: 'semantic-search-no-results'
        });
        return;
    }

    // Create results container
    const resultsContainer = el.createEl('div', { cls: 'semantic-search-results' });

    results.forEach((result, index) => {
        const resultEl = resultsContainer.createEl('div', { 
            cls: 'semantic-search-result'
        });

        // Result header with similarity score and ranking
        const resultHeader = resultEl.createEl('div', { cls: 'semantic-search-result-header' });
        
        const rankEl = resultHeader.createEl('span', { 
            cls: 'semantic-search-rank',
            text: `#${index + 1}`
        });
        
        const scoreEl = resultHeader.createEl('span', { 
            cls: 'semantic-search-score',
            text: `${(result.similarity * 100).toFixed(1)}%`
        });
        
        // Add file link if available
        if (result.filePath) {
            const linkEl = resultHeader.createEl('a', {
                cls: 'semantic-search-file-link',
                text: result.filePath,
                href: result.filePath
            });
            
            linkEl.addEventListener('click', (e) => {
                e.preventDefault();
                // Open the file in Obsidian
                const file = plugin.app.vault.getAbstractFileByPath(result.filePath);
                if (file) {
                    plugin.app.workspace.openLinkText(result.filePath, '', false);
                }
            });
        }

        // Result content (truncated for readability)
        const contentEl = resultEl.createEl('div', { 
            cls: 'semantic-search-content'
        });
        
        const truncatedText = result.text.length > 200 ? result.text.substring(0, 200) + '...' : result.text;
        contentEl.textContent = truncatedText;
    });
}

/**
 * Highlights query terms in the result content
 */
function highlightQueryTerms(text: string, query: string): string {
    const queryWords = query.toLowerCase().split(/\s+/).filter(word => word.length > 2);
    let highlightedText = text;
    
    queryWords.forEach(word => {
        const regex = new RegExp(`(${word})`, 'gi');
        highlightedText = highlightedText.replace(regex, '<mark>$1</mark>');
    });
    
    return highlightedText;
}
