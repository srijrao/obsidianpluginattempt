/**
 * Utility for creating collapsible sections with consistent styling
 */
export class CollapsibleSectionRenderer {
    
    /**
     * Creates a collapsible section with a header that can be toggled
     */
    static createCollapsibleSection(
        containerEl: HTMLElement, 
        title: string, 
        contentCallback: (sectionEl: HTMLElement) => void | Promise<void>,
        expanded: boolean = false
    ): void {
        // Create collapsible container
        const collapsibleContainer = containerEl.createEl('div');
        collapsibleContainer.addClass('ai-collapsible-section');
        
        // Create header that can be clicked to toggle
        const headerEl = collapsibleContainer.createEl('div');
        headerEl.addClass('ai-collapsible-header');
        
        const arrow = headerEl.createEl('span');
        arrow.addClass('ai-collapsible-arrow');
        arrow.textContent = expanded ? '▼' : '▶';
        
        const titleSpan = headerEl.createEl('span');
        titleSpan.textContent = title;
        
        // Create content container
        const contentEl = collapsibleContainer.createEl('div');
        contentEl.addClass('ai-collapsible-content');
        contentEl.style.display = expanded ? 'block' : 'none';
        
        // Toggle functionality
        let isExpanded = expanded;
        headerEl.addEventListener('click', () => {
            isExpanded = !isExpanded;
            contentEl.style.display = isExpanded ? 'block' : 'none';
            arrow.textContent = isExpanded ? '▼' : '▶';
        });
        
        // Call the content callback to populate the section
        const result = contentCallback(contentEl);
        if (result instanceof Promise) {
            result.catch(error => console.error('Error in collapsible section:', error));
        }
    }
}
