import { App, Setting } from 'obsidian';
import MyPlugin from '../../main';
import { SettingCreators } from '../components/SettingCreators';
import { CollapsibleSectionRenderer } from '../../components/chat/CollapsibleSection';

export class PluginBehaviorSection {
    private plugin: MyPlugin;
    private settingCreators: SettingCreators;

    constructor(plugin: MyPlugin, settingCreators: SettingCreators) {
        this.plugin = plugin;
        this.settingCreators = settingCreators;
    }

    async render(containerEl: HTMLElement): Promise<void> {
        CollapsibleSectionRenderer.createCollapsibleSection(
            containerEl,
            'Plugin Behavior',
            async (sectionEl: HTMLElement) => {
                this.settingCreators.createToggleSetting(sectionEl, 'Auto-Open Model Settings', 'Automatically open the AI model settings panel when the plugin loads.',
                    () => this.plugin.settings.autoOpenModelSettings,
                    async (value) => { this.plugin.settings.autoOpenModelSettings = value; await this.plugin.saveSettings(); });
            },
            this.plugin,
            'generalSectionsExpanded'
        );
    }
}
