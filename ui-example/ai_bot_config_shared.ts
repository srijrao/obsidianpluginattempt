import { Setting } from 'obsidian';
import type { VaultBotPluginSettings } from '../settings';
import type { OpenAIProviderSettings, OpenRouterProviderSettings } from '../aiprovider';

// A minimal "plugin-like" contract used by Settings tab, Side Panel, and Modal
export type PluginLike = {
  settings: VaultBotPluginSettings;
  saveSettings: () => Promise<void> | void;
};

// Ensure defaults exist for provider blocks to avoid undefined access.
function ensureProviderDefaults(settings: VaultBotPluginSettings) {
  if (!settings.aiProviderSettings.openai) {
    settings.aiProviderSettings.openai = {
      api_key: '',
      model: 'gpt-4o',
      system_prompt: 'You are a helpful assistant.',
      temperature: 1.0,
    } as OpenAIProviderSettings;
  }
  if (!settings.aiProviderSettings.openrouter) {
    settings.aiProviderSettings.openrouter = {
      api_key: '',
      model: 'openai/gpt-4o',
      system_prompt: 'You are a helpful assistant.',
      temperature: 1.0,
      site_url: '',
      site_name: 'Obsidian Vault-Bot',
    } as OpenRouterProviderSettings;
  }
}

// Renders the API Provider selector dropdown. Caller should pass a reRender function
// that clears and rebuilds the section so provider-specific controls refresh.
export function renderApiProviderSelector(
  container: HTMLElement,
  plugin: PluginLike,
  reRender: () => void,
  save: (immediate?: boolean) => Promise<void> | void
) {
  ensureProviderDefaults(plugin.settings);
  
  new Setting(container)
    .setName('API Provider')
    .setDesc('Select the AI provider to use.')
    .addDropdown((dropdown) => {
      dropdown
        .addOption('openai', 'OpenAI')
        .addOption('openrouter', 'OpenRouter')
        .setValue(plugin.settings.apiProvider)
        .onChange(async (value) => {
          plugin.settings.apiProvider = value;
          await save(true);
          reRender();
        });
      return dropdown;
    });
}

// Renders the API Key input fields for all providers
export function renderApiKeyField(
  container: HTMLElement,
  plugin: PluginLike,
  save: (immediate?: boolean) => Promise<void> | void
) {
  ensureProviderDefaults(plugin.settings);
  
  const currentProvider = plugin.settings.apiProvider;
  
  // Render API key field for OpenAI
  const openaiSettings = plugin.settings.aiProviderSettings.openai;
  new Setting(container)
    .setName('OpenAI API Key')
    .setDesc(`Your API key for OpenAI.${currentProvider === 'openai' ? ' (Currently Active)' : ''}`)
    .addText(text => {
      text
        .setPlaceholder('Enter your OpenAI API key')
        .setValue(openaiSettings?.api_key || '')
        .onChange(async (value) => {
          if (openaiSettings) {
            openaiSettings.api_key = value;
            await save();
          }
        });
      text.inputEl.type = 'password';
      return text;
    });

  // Render API key field for OpenRouter
  const openrouterSettings = plugin.settings.aiProviderSettings.openrouter;
  new Setting(container)
    .setName('OpenRouter API Key')
    .setDesc(`Your API key for OpenRouter.${currentProvider === 'openrouter' ? ' (Currently Active)' : ''}`)
    .addText(text => {
      text
        .setPlaceholder('Enter your OpenRouter API key')
        .setValue(openrouterSettings?.api_key || '')
        .onChange(async (value) => {
          if (openrouterSettings) {
            openrouterSettings.api_key = value;
            await save();
          }
        });
      text.inputEl.type = 'password';
      return text;
    });
}

// Renders the Record chat AI calls toggle
export function renderRecordingToggle(
  container: HTMLElement,
  plugin: PluginLike,
  save: (immediate?: boolean) => Promise<void> | void
) {
  new Setting(container)
    .setName('Record chat AI calls')
    .setDesc('May record sensitive chat content. Do not enable if you store private data you do not want on disk.')
    .addToggle(toggle => toggle
      .setValue(plugin.settings.recordApiCalls)
      .onChange(async (value) => {
        plugin.settings.recordApiCalls = value;
        await save();
      }));
}

// Renders the Debug Mode toggle
export function renderDebugModeToggle(
  container: HTMLElement,
  plugin: PluginLike,
  save: (immediate?: boolean) => Promise<void> | void
) {
  new Setting(container)
    .setName('Debug Mode')
    .setDesc('Enable console logging for debugging purposes. When disabled, only errors will be logged.')
    .addToggle(toggle => toggle
      .setValue(plugin.settings.debugMode === true)
      .onChange(async (value) => {
        plugin.settings.debugMode = value;
        await save();
      }));
}

// Renders the Chat Separator text input field
export function renderChatSeparatorField(
  container: HTMLElement,
  plugin: PluginLike,
  save: (immediate?: boolean) => Promise<void> | void
) {
  new Setting(container)
    .setName('Chat Separator')
    .setDesc('The separator used to distinguish between messages in a chat.')
    .addText(text => text
      .setPlaceholder('e.g. ---')
      .setValue(plugin.settings.chatSeparator)
      .onChange(async (value) => {
        plugin.settings.chatSeparator = value;
        await save();
      }));
}

// Renders the Chat Default Save Location field.
export function renderChatSaveLocationField(
  container: HTMLElement,
  plugin: PluginLike,
  save: (immediate?: boolean) => Promise<void> | void
) {
  new Setting(container)
    .setName('Chat Default Save Location')
    .setDesc('Default folder for saving chat conversations to notes. Leave empty to save to vault root.')
    .addText((text) => {
      text
        .setPlaceholder('chats/ (leave empty for vault root)')
        .setValue(plugin.settings.chatDefaultSaveLocation || '')
        .onChange(async (value) => {
          plugin.settings.chatDefaultSaveLocation = value.trim();
          await save();
        });
    });
}

// Renders the Chat Auto-Save Notes toggle.
export function renderChatAutoSaveToggle(
  container: HTMLElement,
  plugin: PluginLike,
  save: (immediate?: boolean) => Promise<void> | void
) {
  new Setting(container)
    .setName('Auto-save chat notes')
    .setDesc('Automatically save chat conversations to notes when starting a new chat.')
    .addToggle((toggle) => {
      toggle
        .setValue(plugin.settings.chatAutoSaveNotes || false)
        .onChange(async (value) => {
          plugin.settings.chatAutoSaveNotes = value;
          await save();
        });
    });
}

// Renders the Open Chat View button.
export function renderOpenChatViewButton(
  container: HTMLElement,
  onOpenChat: () => void
) {
  new Setting(container)
    .setName('Open Chat View')
    .setDesc('Open the AI chat interface in a dedicated view.')
    .addButton((button) => {
      button
        .setButtonText('Open Chat')
        .setCta()
        .onClick(onOpenChat);
    });
}

// Renders the complete Core AI Bot Configuration section (with header + all fields).
// This function manages its own re-render cycle so Settings, Modal, and Side Panel can
// import and display identical UI with a single call.
export function renderCoreConfigSection(
  container: HTMLElement,
  plugin: PluginLike,
  save: (immediate?: boolean) => Promise<void> | void,
  onOpenChat?: () => void
) {
  const reRender = () => {
    container.empty();
    container.createEl('h2', { text: 'AI Bot Configuration' });
    renderApiProviderSelector(container, plugin, reRender, save);
    renderApiKeyField(container, plugin, save);
    renderRecordingToggle(container, plugin, save);
    renderDebugModeToggle(container, plugin, save);
    renderChatSeparatorField(container, plugin, save);
    renderChatSaveLocationField(container, plugin, save);
    renderChatAutoSaveToggle(container, plugin, save);
    
    // Add chat view button if callback provided
    if (onOpenChat) {
      renderOpenChatViewButton(container, onOpenChat);
    }
  };
  reRender();
}
