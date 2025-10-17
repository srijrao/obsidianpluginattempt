import { Setting } from 'obsidian';
import type { VaultBotPluginSettings } from '../settings';
import type { OpenAIProviderSettings, OpenRouterProviderSettings } from '../aiprovider';
import { ModelService } from '../services/model_service';
import { FuzzyModelDropdown } from './fuzzy_model_dropdown';
import { ModelInfo } from '../providers';

// A minimal "plugin-like" contract used by both Settings tab and Side Panel
export type PluginLike = {
  settings: VaultBotPluginSettings;
  saveSettings: () => Promise<void> | void;
};

// Utility function to create collapsible sections
function createCollapsibleSection(
  parent: HTMLElement,
  title: string,
  renderContent: (contentContainer: HTMLElement) => void,
  plugin: PluginLike,
  save: (immediate?: boolean) => Promise<void> | void,
  initiallyExpanded: boolean = true
) {
  // Ensure UI state exists
  if (!plugin.settings.uiState) {
    plugin.settings.uiState = { collapsedSections: {} };
  }
  if (!plugin.settings.uiState.collapsedSections) {
    plugin.settings.uiState.collapsedSections = {};
  }

  // Check saved state, fall back to initiallyExpanded if not saved
  const sectionKey = title.toLowerCase().replace(/[^a-z0-9]/g, '_');
  const isExpanded = plugin.settings.uiState.collapsedSections[sectionKey] !== undefined 
    ? !plugin.settings.uiState.collapsedSections[sectionKey]
    : initiallyExpanded;

  const section = parent.createDiv({ cls: 'vault-bot-collapsible-section' });
  const header = section.createDiv({ 
    cls: isExpanded ? 'vault-bot-collapsible-header' : 'vault-bot-collapsible-header collapsed',
    text: title 
  });
  const content = section.createDiv({ 
    cls: isExpanded ? 'vault-bot-collapsible-content' : 'vault-bot-collapsible-content hidden' 
  });

  header.addEventListener('click', async () => {
    const isCurrentlyExpanded = !content.classList.contains('hidden');
    if (isCurrentlyExpanded) {
      content.classList.add('hidden');
      header.classList.add('collapsed');
      if (plugin.settings.uiState?.collapsedSections) {
        plugin.settings.uiState.collapsedSections[sectionKey] = true;
      }
    } else {
      content.classList.remove('hidden');
      header.classList.remove('collapsed');
      if (plugin.settings.uiState?.collapsedSections) {
        plugin.settings.uiState.collapsedSections[sectionKey] = false;
      }
    }
    // Save the UI state
    await save();
  });

  renderContent(content);
  return section;
}

// Renders the shared Provider selector. Caller should pass a reRender function
// that clears and rebuilds the section so provider-specific controls refresh.
export function renderProviderSelector(
  container: HTMLElement,
  plugin: PluginLike,
  reRender: () => void,
  save: (immediate?: boolean) => Promise<void> | void
) {
  new Setting(container)
    .setName('Provider')
    .setDesc('Select the AI provider')
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
  // Ensure includeDatetime has a default value
  if (settings.includeDatetime === undefined) {
    settings.includeDatetime = true;
  }
}

// Render provider-specific model settings (model, system prompt, temperature, etc.).
export function renderProviderSpecificSettings(
  container: HTMLElement,
  plugin: PluginLike,
  save: (immediate?: boolean) => Promise<void> | void
) {
  ensureProviderDefaults(plugin.settings);

  if (plugin.settings.apiProvider === 'openai') {
    const openai = plugin.settings.aiProviderSettings.openai as OpenAIProviderSettings;

    createCollapsibleSection(container, 'Model', (content) => {
      renderModelSelector(content, plugin, openai, save, 'OpenAI');
    }, plugin, save);
    
    createCollapsibleSection(container, 'Date/Time', (content) => {
      renderDateTimeToggle(content, plugin, save);
    }, plugin, save);
    
    createCollapsibleSection(container, 'System Prompt & Temperature', (content) => {
      renderSystemPromptAndTemperature(content, openai, save);
    }, plugin, save);
    
    createCollapsibleSection(container, 'Linked Notes Settings', (content) => {
      renderLinkedNotesSettings(content, plugin, save);
    }, plugin, save);

  } else if (plugin.settings.apiProvider === 'openrouter') {
    const or = plugin.settings.aiProviderSettings.openrouter as OpenRouterProviderSettings;

    createCollapsibleSection(container, 'Model', (content) => {
      renderModelSelector(content, plugin, or, save, 'OpenRouter');
    }, plugin, save);
    
    createCollapsibleSection(container, 'Date/Time', (content) => {
      renderDateTimeToggle(content, plugin, save);
    }, plugin, save);
    
    createCollapsibleSection(container, 'System Prompt & Temperature', (content) => {
      renderSystemPromptAndTemperature(content, or, save);
    }, plugin, save);
    
    createCollapsibleSection(container, 'Linked Notes Settings', (content) => {
      renderLinkedNotesSettings(content, plugin, save);
    }, plugin, save);
    
    createCollapsibleSection(container, 'OpenRouter Analytics Settings', (content) => {
      renderOpenRouterSpecificSettings(content, or, save);
    }, plugin, save, false); // Default to collapsed
  }
}

// Render model selector with dropdown and fuzzy search
function renderModelSelector(
  container: HTMLElement,
  plugin: PluginLike,
  providerSettings: OpenAIProviderSettings | OpenRouterProviderSettings,
  save: (immediate?: boolean) => Promise<void> | void,
  providerName: string
) {
  const modelService = ModelService.getInstance();
  let models: ModelInfo[] = [];
  let loadingModels = false;

  const setting = new Setting(container)
    .setName('Model')
    .setDesc(`Select a ${providerName} model`);

  // Create container for dropdown and buttons with responsive layout
  const controlContainer = setting.controlEl.createDiv({ cls: 'vault-bot-model-control-container' });

  // Create top row for dropdown
  const dropdownRow = controlContainer.createDiv({ cls: 'vault-bot-model-dropdown-row' });

  const dropdown = dropdownRow.createEl('select', { cls: 'dropdown' });

  // Create button row for search and refresh buttons
  const buttonRow = controlContainer.createDiv({ cls: 'vault-bot-model-button-row' });

  // Create search button for fuzzy search
  const searchButton = buttonRow.createEl('button', {
    text: '🔍 Search',
    cls: 'mod-cta'
  });

  // Create refresh button
  const refreshButton = buttonRow.createEl('button', {
    text: '🔄',
    title: 'Refresh models'
  });

  // Function to populate dropdown
  const populateDropdown = (modelList: ModelInfo[], selectedModel: string) => {
    dropdown.empty();

    // Add manual input option
    const manualOption = dropdown.createEl('option', {
      value: '__manual__',
      text: '✏️ Enter manually...'
    });

    if (modelList.length === 0) {
      const loadingOption = dropdown.createEl('option', {
        value: '__loading__',
        text: loadingModels ? '⏳ Loading models...' : '❌ Failed to load models'
      });
    } else {

      // Add model options
      modelList.forEach(model => {
        dropdown.createEl('option', {
          value: model.id,
          text: model.name
        });
      });
    }

    // Set current value
    if (modelList.find(m => m.id === selectedModel)) {
      dropdown.value = selectedModel;
    } else {
      dropdown.value = '__manual__';
    }
  };

  // Function to show manual input
  const showManualInput = () => {
    controlContainer.empty();

    // Recreate the layout structure for manual input
    const inputRow = controlContainer.createDiv({ cls: 'vault-bot-model-input-row' });

    const textInput = inputRow.createEl('input', {
      type: 'text',
      value: providerSettings.model,
      placeholder: `e.g. ${providerName === 'OpenAI' ? 'gpt-4o' : 'openai/gpt-4o'}`
    });

    const buttonRow = controlContainer.createDiv({ cls: 'vault-bot-model-button-row' });

    const backButton = buttonRow.createEl('button', {
      text: '← Back to dropdown'
    });

    textInput.addEventListener('input', async () => {
      providerSettings.model = textInput.value;
      await save();
    });

    backButton.addEventListener('click', () => {
      controlContainer.empty();

      // Recreate the original layout
      const dropdownRow = controlContainer.createDiv({ cls: 'vault-bot-model-dropdown-row' });
      dropdownRow.appendChild(dropdown);

      const buttonRow = controlContainer.createDiv({ cls: 'vault-bot-model-button-row' });
      buttonRow.appendChild(searchButton);
      buttonRow.appendChild(refreshButton);

      populateDropdown(models, providerSettings.model);
    });

    textInput.focus();
  };

  // Dropdown change handler
  dropdown.addEventListener('change', async () => {
    if (dropdown.value === '__manual__') {
      showManualInput();
    } else if (dropdown.value !== '__loading__' && dropdown.value !== '__separator__') {
      providerSettings.model = dropdown.value;
      await save();
    }
  });

  // Search button handler
  searchButton.addEventListener('click', () => {
    if (models.length === 0) return;

    const modal = new FuzzyModelDropdown(
      (plugin as any).app,
      models,
      async (selectedModel) => {
        providerSettings.model = selectedModel.id;
        await save();
        populateDropdown(models, selectedModel.id);
      }
    );
    modal.open();
  });

  // Refresh button handler
  refreshButton.addEventListener('click', async () => {
    loadingModels = true;
    populateDropdown([], providerSettings.model);
    refreshButton.disabled = true;
    refreshButton.textContent = '⏳';

    try {
      models = await modelService.getModels(plugin.settings, true);
      populateDropdown(models, providerSettings.model);
    } finally {
      loadingModels = false;
      refreshButton.disabled = false;
      refreshButton.textContent = '🔄';
    }
  });

  // Initial load
  loadingModels = true;
  populateDropdown([], providerSettings.model);

  modelService.getModels(plugin.settings).then(fetchedModels => {
    models = fetchedModels;
    loadingModels = false;
    populateDropdown(models, providerSettings.model);
  }).catch(() => {
    loadingModels = false;
    populateDropdown([], providerSettings.model);
  });
}

function renderDateTimeToggle(
  container: HTMLElement,
  plugin: PluginLike,
  save: (immediate?: boolean) => Promise<void> | void
) {
  new Setting(container)
    .setName('Include Date/Time in System Messages')
    .setDesc('Automatically prepend current date and time to system messages for temporal context')
    .addToggle((toggle) => {
      toggle
        .setValue(plugin.settings.includeDatetime !== false) // Default to true if not specified
        .onChange(async (value) => {
          plugin.settings.includeDatetime = value;
          await save();
        });
      return toggle;
    });
}

// Helper function to render the conditional HTML links setting
function renderConditionalHtmlLinksSetting(
  extractContainer: HTMLElement,
  plugin: PluginLike,
  save: (immediate?: boolean) => Promise<void> | void
) {
  // Remove any existing conditional setting safely
  if (extractContainer.querySelector) {
    const existingConditional = extractContainer.querySelector('.vault-bot-conditional-html-links');
    if (existingConditional) {
      existingConditional.remove();
    }
  } else {
    // Fallback for test environments - remove all elements with the expected class
    const children = Array.from(extractContainer.children || []);
    children.forEach(child => {
      if ((child as any).classList && (child as any).classList.contains('vault-bot-conditional-html-links')) {
        child.remove();
      }
    });
  }

  // Add the conditional setting if extractNotesInReadingView is enabled
  if (plugin.settings.extractNotesInReadingView) {
    const conditionalDiv = extractContainer.createDiv({ cls: 'vault-bot-conditional-html-links' });
    new Setting(conditionalDiv)
      .setName('Include Links Found in Rendered HTML')
      .setDesc('When extracting notes in reading view, also scan the rendered HTML for additional links to include.')
      .addToggle((toggle) => {
        toggle
          .setValue(plugin.settings.includeLinksInRenderedHTML === true)
          .onChange(async (value) => {
            plugin.settings.includeLinksInRenderedHTML = value;
            await save();
          });
        return toggle;
      });
  }
}

function renderLinkedNotesSettings(
  container: HTMLElement,
  plugin: PluginLike,
  save: (immediate?: boolean) => Promise<void> | void
) {
  // Ensure all linked notes settings have default values
  if (plugin.settings.includeCurrentNote === undefined) {
    plugin.settings.includeCurrentNote = true;
  }
  if (plugin.settings.includeOpenNotes === undefined) {
    plugin.settings.includeOpenNotes = false;
  }
  if (plugin.settings.includeLinkedNotes === undefined) {
    plugin.settings.includeLinkedNotes = true;
  }
  if (plugin.settings.extractNotesInReadingView === undefined) {
    plugin.settings.extractNotesInReadingView = false;
  }
  if (plugin.settings.includeLinksInRenderedHTML === undefined) {
    plugin.settings.includeLinksInRenderedHTML = false;
  }
  if (plugin.settings.linkRecursionDepth === undefined) {
    plugin.settings.linkRecursionDepth = 1;
  }
  if (plugin.settings.noteExclusionsLevel1 === undefined) {
    plugin.settings.noteExclusionsLevel1 = [];
  }
  if (plugin.settings.noteExclusionsDeepLink === undefined) {
    plugin.settings.noteExclusionsDeepLink = [];
  }

  new Setting(container)
    .setName('Include Current Note')
    .setDesc('Automatically include the content of the current note in your message.')
    .addToggle((toggle) => {
      toggle
        .setValue(plugin.settings.includeCurrentNote !== false)
        .onChange(async (value) => {
          plugin.settings.includeCurrentNote = value;
          await save();
        });
      return toggle;
    });

  new Setting(container)
    .setName('Include All Open Notes')
    .setDesc('Automatically include the content of all open notes in the workspace in your message.')
    .addToggle((toggle) => {
      toggle
        .setValue(plugin.settings.includeOpenNotes === true)
        .onChange(async (value) => {
          plugin.settings.includeOpenNotes = value;
          await save();
        });
      return toggle;
    });

  new Setting(container)
    .setName('Include Linked Notes')
    .setDesc('Automatically include the content of notes referenced by [[wikilinks]] or markdown links in your message.')
    .addToggle((toggle) => {
      toggle
        .setValue(plugin.settings.includeLinkedNotes !== false)
        .onChange(async (value) => {
          plugin.settings.includeLinkedNotes = value;
          await save();
        });
      return toggle;
    });

  // Create a container for the Extract in Reading View setting and its conditional child
  const extractContainer = container.createDiv();

  new Setting(extractContainer)
    .setName('Extract in Reading View')
    .setDesc('Render included notes to HTML and extract text content instead of using raw markdown.')
    .addToggle((toggle) => {
      toggle
        .setValue(plugin.settings.extractNotesInReadingView === true)
        .onChange(async (value) => {
          plugin.settings.extractNotesInReadingView = value;
          await save();
          // Re-render just the conditional setting
          renderConditionalHtmlLinksSetting(extractContainer, plugin, save);
        });
      return toggle;
    });

  // Render the conditional setting initially
  renderConditionalHtmlLinksSetting(extractContainer, plugin, save);

  new Setting(container)
    .setName('Link Recursion Depth')
    .setDesc('How many levels of linked notes to include. 1 = only directly linked notes, 2 = also include notes linked from those notes, etc.')
    .addSlider((slider) => {
      slider
        .setLimits(1, 3, 1)
        .setValue(plugin.settings.linkRecursionDepth || 1)
        .setDynamicTooltip()
        .onChange(async (value) => {
          plugin.settings.linkRecursionDepth = value;
          await save();
        });
      return slider;
    });
}

function renderSystemPromptAndTemperature(
  container: HTMLElement,
  providerSettings: OpenAIProviderSettings | OpenRouterProviderSettings,
  save: (immediate?: boolean) => Promise<void> | void
) {
  new Setting(container)
    .setName('System Prompt')
    .setDesc('The system prompt that defines the AI assistant behavior')
    .addTextArea((text) => {
      text
        .setPlaceholder('You are a helpful assistant...')
        .setValue(providerSettings.system_prompt)
        .onChange(async (value) => {
          providerSettings.system_prompt = value;
          await save();
        });
      const anyInput: any = (text as any).inputEl;
      if (anyInput) {
        if (typeof anyInput.rows !== 'undefined') anyInput.rows = 4;
        if (anyInput.style) anyInput.style.width = '100%';
      }
      return text;
    });

  new Setting(container)
    .setName('Temperature')
    .setDesc('Controls randomness: 0 = focused, 2 = creative')
    .addSlider((slider) => {
      slider
        .setLimits(0, 2, 0.1)
        .setValue(providerSettings.temperature)
        .setDynamicTooltip()
        .onChange(async (value) => {
          providerSettings.temperature = value;
          await save();
        });
      return slider;
    });
}

function renderOpenRouterSpecificSettings(
  container: HTMLElement,
  or: OpenRouterProviderSettings,
  save: (immediate?: boolean) => Promise<void> | void
) {
  new Setting(container)
    .setName('Site URL (Optional)')
    .setDesc('Your site URL for OpenRouter analytics')
    .addText((text) => {
      text
        .setPlaceholder('https://yoursite.com')
        .setValue(or.site_url || '')
        .onChange(async (value) => {
          or.site_url = value;
          await save();
        });
      return text;
    });

  new Setting(container)
    .setName('Site Name (Optional)')
    .setDesc('Your site name for OpenRouter analytics')
    .addText((text) => {
      text
        .setPlaceholder('Your App Name')
        .setValue(or.site_name || '')
        .onChange(async (value) => {
          or.site_name = value;
          await save();
        });
      return text;
    });
}

// Render the complete Model Settings section (with header + provider selector + fields).
// This function manages its own re-render cycle so both Settings and Side Panel can
// import and display identical UI with a single call.
export function renderModelSettingsSection(
  container: HTMLElement,
  plugin: PluginLike,
  save: (immediate?: boolean) => Promise<void> | void
) {
  const reRender = () => {
    container.empty();
    container.classList.add('vault-bot-ui'); // Add global UI class for font sizing
    container.createEl('h2', { text: 'AI Bot Model Settings' });
    renderProviderSelector(container, plugin, reRender, save);
    renderProviderSpecificSettings(container, plugin, save);
  };
  reRender();
}
