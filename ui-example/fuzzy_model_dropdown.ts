import { FuzzySuggestModal, FuzzyMatch } from 'obsidian';
import { ModelInfo } from '../providers';

export class FuzzyModelDropdown extends FuzzySuggestModal<ModelInfo> {
    private models: ModelInfo[];
    private onSelect: (model: ModelInfo) => void;

    constructor(
        app: any,
        models: ModelInfo[],
        onSelect: (model: ModelInfo) => void,
        placeholder = 'Search models...'
    ) {
        super(app);
        this.models = models;
        this.onSelect = onSelect;
        this.setPlaceholder(placeholder);
    }

    getItems(): ModelInfo[] {
        return this.models;
    }

    getItemText(model: ModelInfo): string {
        return `${model.name} - ${model.description || model.id}`;
    }

    onChooseItem(model: ModelInfo, _evt: MouseEvent | KeyboardEvent): void {
        this.onSelect(model);
    }

    renderSuggestion(fuzzyMatch: FuzzyMatch<ModelInfo>, el: HTMLElement): void {
        const model = fuzzyMatch.item;
        
        // Use Obsidian's built-in suggestion styling
        const titleEl = el.createDiv({ cls: 'suggestion-title' });
        titleEl.setText(model.name);
        
        if (model.description && model.description !== model.id) {
            const noteEl = el.createDiv({ cls: 'suggestion-note' });
            noteEl.setText(model.description);
        }
        
        if (model.context_length) {
            const auxEl = el.createDiv({ cls: 'suggestion-aux' });
            auxEl.setText(`${model.context_length.toLocaleString()} tokens`);
        }
    }
}
