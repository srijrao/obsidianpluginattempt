import MyPlugin from "../main";
import { MyPluginSettings } from "../types/settings"; 

/**
 * CollapsibleSectionRenderer provides a utility for creating collapsible UI sections
 * with consistent styling and persistent expand/collapse state.
 */
export class CollapsibleSectionRenderer {
    /**
     * Creates a collapsible section with a header that can be toggled.
     * The expanded/collapsed state is persisted in plugin settings.
     * 
     * @param containerEl The parent container element to append the section to.
     * @param title The title of the collapsible section.
     * @param contentCallback Callback to populate the section content (receives the content element).
     * @param plugin The plugin instance (for settings and saving state).
     * @param settingsType The key in MyPluginSettings where expand/collapse state is stored.
     */
    static createCollapsibleSection(
        containerEl: HTMLElement, 
        title: string, 
        contentCallback: (sectionEl: HTMLElement) => void | Promise<void>,
        plugin: MyPlugin,
        settingsType: keyof MyPluginSettings 
    ): void {
        // Ensure the settings object for this section exists
        (plugin.settings[settingsType] as Record<string, boolean> | undefined) = (plugin.settings[settingsType] as Record<string, boolean> | undefined) || {};

        // Get the persisted expand/collapse state for this section
        let isExpanded = ((plugin.settings[settingsType] as Record<string, boolean> | undefined) || {})[title] ?? false;

        // Create the main container for the collapsible section
        const collapsibleContainer = containerEl.createEl('div');
        collapsibleContainer.addClass('ai-collapsible-section');

        // Create the header element (clickable to toggle)
        const headerEl = collapsibleContainer.createEl('div');
        headerEl.addClass('ai-collapsible-header');

        // Arrow indicator for expand/collapse
        const arrow = headerEl.createEl('span');
        arrow.addClass('ai-collapsible-arrow');
        arrow.textContent = isExpanded ? '▼' : '▶';

        // Title text
        const titleSpan = headerEl.createEl('span');
        titleSpan.textContent = title;

        // Content element (shown/hidden based on state)
        const contentEl = collapsibleContainer.createEl('div');
        contentEl.addClass('ai-collapsible-content');
        contentEl.style.display = isExpanded ? 'block' : 'none';

        // Toggle expand/collapse on header click, and persist state
        headerEl.addEventListener('click', async () => { 
            isExpanded = !isExpanded;
            contentEl.style.display = isExpanded ? 'block' : 'none';
            arrow.textContent = isExpanded ? '▼' : '▶';

            // Persist the expand/collapse state in plugin settings
            ((plugin.settings[settingsType] as Record<string, boolean> | undefined) || {})[title] = isExpanded;
            await plugin.saveSettings();
        });

        // Populate the content using the provided callback
        const result = contentCallback(contentEl);
        if (result instanceof Promise) {
            result.catch(error => console.error('Error in collapsible section:', error));
        }
    }
}
