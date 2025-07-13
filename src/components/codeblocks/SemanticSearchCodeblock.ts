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
        
        const results = await semanticBuilder.semanticSearch(query, {
            topK: 5,
            minSimilarity: plugin.settings.semanticSimilarityThreshold || 0.7
        });

        // Remove loading indicator
        loadingEl.remove();

        // Render results
        renderSemanticSearchResults(el, results, query, plugin);

    } catch (error) {
        loadingEl.remove();
        debugLog(plugin.settings.debugMode ?? false, 'error', 'Semantic search codeblock failed:', error);
        
        el.createEl('div', {
            text: `Error: ${error.message}`,
            cls: 'semantic-search-error'
        });
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
    
    // Add header
    const headerEl = el.createEl('div', { cls: 'semantic-search-header' });
    headerEl.createEl('h4', { 
        text: `Semantic Search: "${query}"`,
        cls: 'semantic-search-title'
    });
    headerEl.createEl('span', {
        text: `${results.length} results`,
        cls: 'semantic-search-count'
    });

    if (results.length === 0) {
        el.createEl('div', {
            text: 'No similar content found.',
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

        // Result header with similarity score
        const resultHeader = resultEl.createEl('div', { cls: 'semantic-search-result-header' });
        
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

        // Result content
        const contentEl = resultEl.createEl('div', { 
            cls: 'semantic-search-content'
        });
        
        // Highlight query terms in the content
        const highlightedContent = highlightQueryTerms(result.text, query);
        contentEl.innerHTML = highlightedContent;
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
