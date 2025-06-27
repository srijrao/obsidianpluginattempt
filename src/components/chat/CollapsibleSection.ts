import MyPlugin from "../../main";
import { MyPluginSettings } from "../../types/settings"; // Corrected import

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
        plugin: MyPlugin,
        settingsType: keyof MyPluginSettings // Changed to accept any key from MyPluginSettings
    ): void {
        // Ensure the settings objects exist (they should be initialized by DEFAULT_SETTINGS)
        // This cast is necessary because TypeScript can't infer that settingsType will always lead to a Record<string, boolean>
        (plugin.settings[settingsType] as Record<string, boolean> | undefined) = (plugin.settings[settingsType] as Record<string, boolean> | undefined) || {};

        // Read initial state from settings, default to false (collapsed) if not found for this specific title
        let isExpanded = ((plugin.settings[settingsType] as Record<string, boolean> | undefined) || {})[title] ?? false;

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
        headerEl.addEventListener('click', async () => { // Made async for saveSettings
            isExpanded = !isExpanded;
            contentEl.style.display = isExpanded ? 'block' : 'none';
            arrow.textContent = isExpanded ? '▼' : '▶';

            // Save the state
            ((plugin.settings[settingsType] as Record<string, boolean> | undefined) || {})[title] = isExpanded;
            await plugin.saveSettings();
        });
        
        // Call the content callback to populate the section
        const result = contentCallback(contentEl);
        if (result instanceof Promise) {
            result.catch(error => console.error('Error in collapsible section:', error));
        }
    }
}
