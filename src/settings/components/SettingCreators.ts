import { App, PluginSettingTab, Setting, Notice } from 'obsidian';
import MyPlugin from '../../main'; 

/**
 * Utility class for creating common setting types in Obsidian plugin settings tabs.
 * Provides methods to create text inputs, dropdowns, toggles, and sliders with consistent behavior.
 */
export class SettingCreators {
    private plugin: MyPlugin;
    private reRenderCallback: () => void;

    /**
     * @param plugin The plugin instance, used for saving settings.
     * @param reRenderCallback A callback function to re-render the settings tab/modal.
     */
    constructor(plugin: MyPlugin, reRenderCallback: () => void) {
        this.plugin = plugin;
        this.reRenderCallback = reRenderCallback;
    }

    /**
     * Creates a text input setting (either single-line or multi-line).
     * @param containerEl The HTML element to append the setting to.
     * @param name The name of the setting.
     * @param desc The description of the setting.
     * @param placeholder The placeholder text for the input.
     * @param getValue A function to get the current value of the setting.
     * @param setValue A function to set the new value of the setting.
     * @param options Additional options for the text input (e.g., trim, undefinedIfEmpty, isTextArea).
     */
    createTextSetting(
        containerEl: HTMLElement,
        name: string,
        desc: string,
        placeholder: string,
        getValue: () => string,
        setValue: (value: string | undefined) => Promise<void>,
        options?: { trim?: boolean; undefinedIfEmpty?: boolean; isTextArea?: boolean }
    ): void {
        new Setting(containerEl)
            .setName(name)
            .setDesc(desc)
            .then(setting => {
                const textInputOptions = {
                    trim: options?.trim,
                    undefinedIfEmpty: options?.undefinedIfEmpty
                };
                if (options?.isTextArea) {
                    setting.addTextArea(text => this.configureTextInput(text, placeholder, getValue, setValue, textInputOptions));
                } else {
                    setting.addText(text => this.configureTextInput(text, placeholder, getValue, setValue, textInputOptions));
                }
            });
    }

    /**
     * Configures a text input (either single-line or multi-line).
     * Handles value processing (trimming, setting to undefined if empty) and saving on blur.
     * @param textComponent The TextComponent or TextAreaComponent to configure.
     * @param placeholder The placeholder text.
     * @param getValue A function to get the current value.
     * @param setValue A function to set the new value.
     * @param options Additional options for processing the input value (e.g., trim, undefinedIfEmpty).
     */
    private configureTextInput(
        textComponent: any, 
        placeholder: string,
        getValue: () => string,
        setValue: (value: string | undefined) => Promise<void>,
        options?: { trim?: boolean; undefinedIfEmpty?: boolean }
    ): void {
        textComponent
            .setPlaceholder(placeholder)
            .setValue(getValue() ?? '')
            .onChange((value: string) => {
                // Process the input value based on options
                let processedValue: string | undefined = value;
                if (options?.trim && processedValue) {
                    processedValue = processedValue.trim();
                }
                if (options?.undefinedIfEmpty && processedValue === '') {
                    processedValue = undefined;
                }
                // Update the setting value without immediately saving to disk
                this.updateSettingValueOnly(setValue, processedValue);
            });
        
        // Save settings and re-render on blur (when the input loses focus)
        textComponent.inputEl.addEventListener('blur', async () => {
            await this.plugin.saveSettings();
            this.reRenderCallback(); 
        });
    }

    /**
     * Helper method to update setting value without triggering a full save to disk immediately.
     * This is useful for inputs where changes are frequent (e.g., textareas) and saving should be debounced or on blur.
     * @param setValue The function to call to update the setting's value.
     * @param value The new value for the setting.
     */
    private updateSettingValueOnly(setValue: (value: string | undefined) => Promise<void>, value: string | undefined): void {
        // Temporarily override saveSettings to prevent immediate disk write
        const originalSaveSettings = this.plugin.saveSettings;
        this.plugin.saveSettings = async () => {
            // Do nothing
        };
        
        try {
            setValue(value);
        } catch (e) {
            console.warn('Error updating setting value:', e);
        } finally {
            // Restore original saveSettings function
            this.plugin.saveSettings = originalSaveSettings;
        }
    }

    /**
     * Creates a dropdown setting.
     * @param containerEl The HTML element to append the setting to.
     * @param name The name of the setting.
     * @param desc The description of the setting.
     * @param options A record of option values to display names.
     * @param getValue A function to get the current value of the setting.
     * @param setValue A function to set the new value of the setting.
     */
    createDropdownSetting(
        containerEl: HTMLElement,
        name: string,
        desc: string,
        options: Record<string, string>,
        getValue: () => string,
        setValue: (value: string) => Promise<void>
    ): void {
        new Setting(containerEl)
            .setName(name)
            .setDesc(desc)
            .addDropdown(drop => {
                Object.entries(options).forEach(([key, display]) => drop.addOption(key, display));
                drop.setValue(getValue());
                drop.onChange(async (value: string) => {
                    await setValue(value);
                    this.reRenderCallback(); 
                });
            });
    }

    /**
     * Creates a toggle (checkbox) setting.
     * @param containerEl The HTML element to append the setting to.
     * @param name The name of the setting.
     * @param desc The description of the setting.
     * @param getValue A function to get the current boolean value.
     * @param setValue A function to set the new boolean value.
     * @param onChangeCallback An optional callback to run after the value changes and settings are saved.
     */
    createToggleSetting(
        containerEl: HTMLElement,
        name: string,
        desc: string,
        getValue: () => boolean,
        setValue: (value: boolean) => Promise<void>,
        onChangeCallback?: () => void
    ): void {
        new Setting(containerEl)
            .setName(name)
            .setDesc(desc)
            .addToggle(toggle => toggle
                .setValue(getValue())
                .onChange(async (value) => {
                    await setValue(value);
                    if (onChangeCallback) {
                        onChangeCallback();
                    }
                    this.reRenderCallback(); 
                }));
    }

    /**
     * Creates a slider setting.
     * @param containerEl The HTML element to append the setting to.
     * @param name The name of the setting.
     * @param desc The description of the setting.
     * @param limits An object defining min, max, and step for the slider.
     * @param getValue A function to get the current numeric value.
     * @param setValue A function to set the new numeric value.
     */
    createSliderSetting(
        containerEl: HTMLElement,
        name: string,
        desc: string,
        limits: { min: number, max: number, step: number },
        getValue: () => number,
        setValue: (value: number) => Promise<void>
    ): void {
        new Setting(containerEl)
            .setName(name)
            .setDesc(desc)
            .addSlider(slider => {
                slider.setLimits(limits.min, limits.max, limits.step)
                    .setValue(getValue())
                    .setDynamicTooltip()
                    .onChange(async (value: number) => {
                        await setValue(value);
                        this.reRenderCallback(); 
                    });
            });
    }
}
