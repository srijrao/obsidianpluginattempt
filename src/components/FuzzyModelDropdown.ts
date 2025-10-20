/**
 * Fuzzy Model Dropdown Component
 * 
 * Provides a fuzzy search modal for selecting AI models with rich metadata.
 * Extends Obsidian's FuzzySuggestModal for model selection.
 * Features: favorites (starred models), recent models, fuzzy search.
 */

import { FuzzySuggestModal, App, setIcon } from 'obsidian';
import type { ModelInfo } from '../../providers/base';
import type MyPlugin from '../main';
import { toggleFavoriteModel, isFavoriteModel, sortModelsByRelevance, trackRecentModel } from '../utils/modelTracking';

/**
 * Fuzzy search modal for AI model selection with favorites and recents
 */
export class FuzzyModelDropdown extends FuzzySuggestModal<ModelInfo> {
    private models: ModelInfo[];
    private onSelect: (model: ModelInfo) => void;
    private plugin: MyPlugin;

    constructor(app: App, models: ModelInfo[], onSelect: (model: ModelInfo) => void, plugin: MyPlugin) {
        super(app);
        this.models = sortModelsByRelevance(plugin, models); // Sort to show favorites/recents first
        this.onSelect = onSelect;
        this.plugin = plugin;
        
        // Set modal title
        this.setPlaceholder('Search for a model... (⭐ = favorite, 🕐 = recent)');
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
        const isFavorite = isFavoriteModel(this.plugin, model.id);
        const isRecent = this.plugin.settings.recentModels?.includes(model.id) || false;
        
        el.createDiv({ cls: 'fuzzy-model-item' }, (div) => {
            // Header row with title and star button
            const headerDiv = div.createDiv({ cls: 'fuzzy-model-header' });
            
            // Model name (title)
            const titleDiv = headerDiv.createDiv({ cls: 'fuzzy-model-title' });
            
            // Add indicators
            if (isFavorite) {
                titleDiv.createSpan({ cls: 'fuzzy-model-indicator favorite', text: '⭐ ' });
            }
            if (isRecent && !isFavorite) {
                titleDiv.createSpan({ cls: 'fuzzy-model-indicator recent', text: '🕐 ' });
            }
            titleDiv.appendText(model.name);
            
            // Star button for favoriting
            const starBtn = headerDiv.createDiv({ cls: 'fuzzy-model-star-btn' });
            setIcon(starBtn, isFavorite ? 'star' : 'star-off');
            starBtn.setAttribute('aria-label', isFavorite ? 'Unfavorite' : 'Favorite');
            starBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                e.preventDefault();
                const nowFavorited = await toggleFavoriteModel(this.plugin, model.id);
                setIcon(starBtn, nowFavorited ? 'star' : 'star-off');
                starBtn.setAttribute('aria-label', nowFavorited ? 'Unfavorite' : 'Favorite');
                
                // Re-sort the models and update display
                this.models = sortModelsByRelevance(this.plugin, this.models);
                
                // Force re-render by updating the input value (triggers search again)
                const input = this.inputEl as HTMLInputElement;
                const currentValue = input.value;
                input.value = currentValue + ' ';
                input.value = currentValue;
                input.dispatchEvent(new Event('input'));
            });
            
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
        // Track this model as recently used
        trackRecentModel(this.plugin, model.id);
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
        
        .fuzzy-model-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 4px;
        }
        
        .fuzzy-model-title {
            font-weight: 600;
            font-size: 14px;
            flex: 1;
        }
        
        .fuzzy-model-indicator {
            font-size: 12px;
            margin-right: 4px;
        }
        
        .fuzzy-model-indicator.favorite {
            color: gold;
        }
        
        .fuzzy-model-indicator.recent {
            color: var(--text-muted);
        }
        
        .fuzzy-model-star-btn {
            cursor: pointer;
            padding: 4px;
            border-radius: 4px;
            opacity: 0.6;
            transition: opacity 0.2s, background-color 0.2s;
        }
        
        .fuzzy-model-star-btn:hover {
            opacity: 1;
            background-color: var(--background-modifier-hover);
        }
        
        .fuzzy-model-star-btn svg {
            width: 16px;
            height: 16px;
            color: gold;
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
        
        .fuzzy-model-provider.provider-ollama {
            background-color: rgba(139, 92, 246, 0.1);
            color: rgb(139, 92, 246);
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
