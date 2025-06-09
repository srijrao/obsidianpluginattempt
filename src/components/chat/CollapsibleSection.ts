import MyPlugin from "../../main"; // Added import

/**
 * Utility for creating collapsible sections with consistent styling
 */
export class CollapsibleSectionRenderer {
    
    /**
     * Creates a collapsible section with a header that can be toggled
     */
    static createCollapsibleSection(
        containerEl: HTMLElement, 
        title: string, // Will serve as the sectionKey
        contentCallback: (sectionEl: HTMLElement) => void | Promise<void>,
        // expanded: boolean = false, // Removed, state comes from settings
        plugin: MyPlugin, // Added
        settingsType: 'generalSectionsExpanded' | 'providerConfigExpanded' // Added
    ): void {
        // Ensure the settings objects exist (they should be initialized by DEFAULT_SETTINGS)
        plugin.settings[settingsType] = plugin.settings[settingsType] || {};

        // Read initial state from settings, default to false (collapsed) if not found for this specific title
        let isExpanded = (plugin.settings[settingsType] as Record<string, boolean>)[title] ?? false;

        // Create collapsible container
        const collapsibleContainer = containerEl.createEl('div');
        collapsibleContainer.addClass('ai-collapsible-section');
        
        // Create header that can be clicked to toggle
        const headerEl = collapsibleContainer.createEl('div');
        headerEl.addClass('ai-collapsible-header');
        
        const arrow = headerEl.createEl('span');
        arrow.addClass('ai-collapsible-arrow');
        arrow.textContent = isExpanded ? '▼' : '▶';
        
        const titleSpan = headerEl.createEl('span');
        titleSpan.textContent = title;
        
        // Create content container
        const contentEl = collapsibleContainer.createEl('div');
        contentEl.addClass('ai-collapsible-content');
        contentEl.style.display = isExpanded ? 'block' : 'none';
        
        // Toggle functionality
        // let isExpanded = expanded; // Removed, isExpanded is now from settings
        headerEl.addEventListener('click', async () => { // Made async for saveSettings
            isExpanded = !isExpanded;
            contentEl.style.display = isExpanded ? 'block' : 'none';
            arrow.textContent = isExpanded ? '▼' : '▶';

            // Save the state
            (plugin.settings[settingsType] as Record<string, boolean>)[title] = isExpanded;
            await plugin.saveSettings();
        });
        
        // Call the content callback to populate the section
        const result = contentCallback(contentEl);
        if (result instanceof Promise) {
            result.catch(error => console.error('Error in collapsible section:', error));
        }
    }
}
