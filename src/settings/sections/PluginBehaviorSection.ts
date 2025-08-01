import { App, Setting } from 'obsidian';
import MyPlugin from '../../main';
import { SettingCreators } from '../components/SettingCreators';
import { CollapsibleSectionRenderer } from '../../utils/CollapsibleSection';

/**
 * PluginBehaviorSection is responsible for rendering settings related to the overall plugin behavior.
 * This includes options like automatically opening model settings on plugin load.
 */
export class PluginBehaviorSection {
    private plugin: MyPlugin;
    private settingCreators: SettingCreators;

    /**
     * @param plugin The main plugin instance.
     * @param settingCreators An instance of SettingCreators for consistent UI element creation.
     */
    constructor(plugin: MyPlugin, settingCreators: SettingCreators) {
        this.plugin = plugin;
        this.settingCreators = settingCreators;
    }

    /**
     * Renders the Plugin Behavior settings section into the provided container element.
     * This section is collapsible.
     * @param containerEl The HTML element to render the section into.
     */
    async render(containerEl: HTMLElement): Promise<void> {
        CollapsibleSectionRenderer.createCollapsibleSection(
            containerEl,
            'Plugin Behavior',
            async (sectionEl: HTMLElement) => {
                // Plugin behavior settings can be added here in the future
                sectionEl.createEl('div', { 
                    text: 'Additional plugin behavior settings will be available here.',
                    cls: 'setting-item-description'
                });
            },
            this.plugin,
            'generalSectionsExpanded'
        );
    }
}
