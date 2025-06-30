import MyPlugin from "../../main";
import { MyPluginSettings } from "../../types/settings"; 

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
        plugin: MyPlugin,
        settingsType: keyof MyPluginSettings 
    ): void {
        
        
        (plugin.settings[settingsType] as Record<string, boolean> | undefined) = (plugin.settings[settingsType] as Record<string, boolean> | undefined) || {};

        
        let isExpanded = ((plugin.settings[settingsType] as Record<string, boolean> | undefined) || {})[title] ?? false;

        
        const collapsibleContainer = containerEl.createEl('div');
        collapsibleContainer.addClass('ai-collapsible-section');
        
        
        const headerEl = collapsibleContainer.createEl('div');
        headerEl.addClass('ai-collapsible-header');
        
        const arrow = headerEl.createEl('span');
        arrow.addClass('ai-collapsible-arrow');
        arrow.textContent = isExpanded ? '▼' : '▶';
        
        const titleSpan = headerEl.createEl('span');
        titleSpan.textContent = title;
        
        
        const contentEl = collapsibleContainer.createEl('div');
        contentEl.addClass('ai-collapsible-content');
        contentEl.style.display = isExpanded ? 'block' : 'none';
        
        
        headerEl.addEventListener('click', async () => { 
            isExpanded = !isExpanded;
            contentEl.style.display = isExpanded ? 'block' : 'none';
            arrow.textContent = isExpanded ? '▼' : '▶';

            
            ((plugin.settings[settingsType] as Record<string, boolean> | undefined) || {})[title] = isExpanded;
            await plugin.saveSettings();
        });
        
        
        const result = contentCallback(contentEl);
        if (result instanceof Promise) {
            result.catch(error => console.error('Error in collapsible section:', error));
        }
    }
}
