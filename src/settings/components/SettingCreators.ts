import { App, PluginSettingTab, Setting, Notice } from 'obsidian';
import MyPlugin from '../../main'; // Adjust path as needed

/**
 * Utility class for creating common setting types in Obsidian plugin settings tabs.
 */
export class SettingCreators {
    private plugin: MyPlugin;
    private reRenderCallback: () => void;

    constructor(plugin: MyPlugin, reRenderCallback: () => void) {
        this.plugin = plugin;
        this.reRenderCallback = reRenderCallback;
    }

    /**
     * Creates a text input setting.
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
     * @param textComponent The TextComponent or TextAreaComponent to configure.
     * @param placeholder The placeholder text.
     * @param getValue A function to get the current value.
     * @param setValue A function to set the new value.
     * @param options Additional options for processing the input value (e.g., trim, undefinedIfEmpty).
     */
    private configureTextInput(
        textComponent: any, // TextComponent | TextAreaComponent
        placeholder: string,
        getValue: () => string,
        setValue: (value: string | undefined) => Promise<void>,
        options?: { trim?: boolean; undefinedIfEmpty?: boolean }
    ): void {
        textComponent
            .setPlaceholder(placeholder)
            .setValue(getValue() ?? '')
            .onChange(async (value: string) => {
                let processedValue: string | undefined = value;
                if (options?.trim) {
                    processedValue = processedValue.trim();
                }
                if (options?.undefinedIfEmpty && processedValue === '') {
                    processedValue = undefined;
                }
                await setValue(processedValue);
                this.reRenderCallback(); // Re-render the settings tab after value changes
            });
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
                    this.reRenderCallback(); // Re-render the settings tab after value changes
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
                    this.reRenderCallback(); // Re-render the settings tab after value changes
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
                        this.reRenderCallback(); // Re-render the settings tab after value changes
                    });
            });
    }
}
