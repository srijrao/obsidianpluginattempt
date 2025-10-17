/**
 * Fuzzy Model Dropdown Component
 * 
 * Provides a fuzzy search modal for selecting AI models with rich metadata.
 * Extends Obsidian's FuzzySuggestModal for model selection.
 */

import { FuzzySuggestModal, App } from 'obsidian';
import type { ModelInfo } from '../../providers/base';

/**
 * Fuzzy search modal for AI model selection
 */
export class FuzzyModelDropdown extends FuzzySuggestModal<ModelInfo> {
    private models: ModelInfo[];
    private onSelect: (model: ModelInfo) => void;

    constructor(app: App, models: ModelInfo[], onSelect: (model: ModelInfo) => void) {
        super(app);
        this.models = models;
        this.onSelect = onSelect;
        
        // Set modal title
        this.setPlaceholder('Search for a model...');
    }

    /**
     * Get all items for the fuzzy search
     */
    getItems(): ModelInfo[] {
        return this.models;
    }

    /**
     * Get the display text for each item
     * 
     * This is used by the fuzzy search algorithm
     */
    getItemText(model: ModelInfo): string {
        // Include model name, ID, and description for searching
        const searchableText = [
            model.name,
            model.id,
            model.description || '',
            model.provider || ''
        ].join(' ');
        
        return searchableText;
    }

    /**
     * Render each item in the suggestion list
     */
    renderSuggestion(item: any, el: HTMLElement): void {
        const model = item.item as ModelInfo;
        el.createDiv({ cls: 'fuzzy-model-item' }, (div) => {
            // Model name (title)
            div.createDiv({ cls: 'fuzzy-model-title', text: model.name });
            
            // Model details container
            const detailsDiv = div.createDiv({ cls: 'fuzzy-model-details' });
            
            // Model ID
            detailsDiv.createSpan({ cls: 'fuzzy-model-id', text: model.id });
            
            // Provider badge
            if (model.provider) {
                detailsDiv.createSpan({ 
                    cls: `fuzzy-model-provider provider-${model.provider}`, 
                    text: model.provider.toUpperCase() 
                });
            }
            
            // Context length
            if (model.context_length) {
                detailsDiv.createSpan({ 
                    cls: 'fuzzy-model-context', 
                    text: `${(model.context_length / 1000).toFixed(0)}k tokens` 
                });
            }
            
            // Description
            if (model.description) {
                div.createDiv({ cls: 'fuzzy-model-description', text: model.description });
            }
        });
    }

    /**
     * Called when an item is selected
     */
    onChooseItem(model: ModelInfo): void {
        this.onSelect(model);
    }
}

/**
 * Add custom styles for the fuzzy model dropdown
 * This should be called once when the plugin loads
 */
export function addFuzzyModelDropdownStyles(): void {
    // Check if styles are already added
    if (document.getElementById('fuzzy-model-dropdown-styles')) {
        return;
    }
    
    const styleEl = document.createElement('style');
    styleEl.id = 'fuzzy-model-dropdown-styles';
    styleEl.textContent = `
        .fuzzy-model-item {
            padding: 8px 0;
        }
        
        .fuzzy-model-title {
            font-weight: 600;
            font-size: 14px;
            margin-bottom: 4px;
        }
        
        .fuzzy-model-details {
            display: flex;
            gap: 8px;
            align-items: center;
            margin-bottom: 4px;
            font-size: 11px;
            color: var(--text-muted);
        }
        
        .fuzzy-model-id {
            font-family: var(--font-monospace);
            background-color: var(--background-modifier-border);
            padding: 2px 6px;
            border-radius: 3px;
        }
        
        .fuzzy-model-provider {
            padding: 2px 6px;
            border-radius: 3px;
            font-weight: 600;
            font-size: 10px;
            text-transform: uppercase;
        }
        
        .fuzzy-model-provider.provider-openai {
            background-color: rgba(16, 185, 129, 0.1);
            color: rgb(16, 185, 129);
        }
        
        .fuzzy-model-provider.provider-anthropic {
            background-color: rgba(245, 158, 11, 0.1);
            color: rgb(245, 158, 11);
        }
        
        .fuzzy-model-provider.provider-gemini {
            background-color: rgba(59, 130, 246, 0.1);
            color: rgb(59, 130, 246);
        }
        
        .fuzzy-model-provider.provider-openrouter {
            background-color: rgba(168, 85, 247, 0.1);
            color: rgb(168, 85, 247);
        }
        
        .fuzzy-model-context {
            padding: 2px 6px;
            background-color: var(--background-modifier-border);
            border-radius: 3px;
        }
        
        .fuzzy-model-description {
            font-size: 12px;
            color: var(--text-muted);
            font-style: italic;
            margin-top: 4px;
        }
    `;
    
    document.head.appendChild(styleEl);
}
