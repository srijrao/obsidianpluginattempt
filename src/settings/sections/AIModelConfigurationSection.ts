import { App, Setting, Notice } from "obsidian";
import MyPlugin from "../../main";
import { SettingCreators } from "../components/SettingCreators";
import { CollapsibleSectionRenderer } from "../../utils/CollapsibleSection";
import { AIDispatcher } from "../../utils/aiDispatcher";
import {
  isValidOpenAIApiKey,
  isValidAnthropicApiKey,
  isValidGoogleApiKey,
  isValidUrl,
} from "../../utils/validationUtils";
import { FuzzyModelDropdown } from "../../components/FuzzyModelDropdown";
import { ModelService } from "../../services/ModelService";
import type { ModelInfo } from "../../../providers/base";
import { providerRegistry } from "../../../providers";
import { ModelManagementSection } from "./ModelManagementSection";

/**
 * AIModelConfigurationSection is responsible for rendering the settings related to AI model configuration.
 * This includes API key settings for various providers, default model settings, and model management.
 */
export class AIModelConfigurationSection {
  private plugin: MyPlugin;
  private settingCreators: SettingCreators;
  private currentModelSettingsContainer: HTMLElement | null = null;
  private modelManagementSection: ModelManagementSection;

  /**
   * @param plugin The main plugin instance.
   * @param settingCreators An instance of SettingCreators for consistent UI element creation.
   */
  constructor(plugin: MyPlugin, settingCreators: SettingCreators) {
    this.plugin = plugin;
    this.settingCreators = settingCreators;
    this.modelManagementSection = new ModelManagementSection(plugin, settingCreators);
  }

  /**
   * Renders the AI Model Configuration section into the provided container element.
   * @param containerEl The HTML element to render the section into.
   */
  async render(containerEl: HTMLElement): Promise<void> {
    // Current Model Settings Section (renamed from "Default AI Model Settings")
    CollapsibleSectionRenderer.createCollapsibleSection(
      containerEl,
      "Current Model Settings",
      async (sectionEl: HTMLElement) => {
        this.currentModelSettingsContainer = sectionEl; // Store reference
        await this.renderAIModelSettings(sectionEl);
      },
      this.plugin,
      "generalSectionsExpanded"
    );

    // Section for API Keys & Providers
    CollapsibleSectionRenderer.createCollapsibleSection(
      containerEl,
      "API Keys & Providers",
      async (sectionEl: HTMLElement) => {
        // OpenAI Configuration Section
        CollapsibleSectionRenderer.createCollapsibleSection(
          sectionEl,
          "OpenAI Configuration",
          async (subSectionEl: HTMLElement) => {
            this.settingCreators.createTextSetting(
              subSectionEl,
              "OpenAI API Key",
              "Enter your OpenAI API key",
              "Enter your API key",
              () => this.plugin.settings.openaiSettings.apiKey,
              async (value) => {
                if (value && !isValidOpenAIApiKey(value)) {
                  new Notice(
                    "Invalid OpenAI API Key format. Please check your key."
                  );
                  return;
                }
                this.plugin.settings.openaiSettings.apiKey = value ?? "";
                await this.plugin.saveSettings();
              }
            );

            this.settingCreators.createTextSetting(
              subSectionEl,
              "OpenAI Base URL",
              "Custom base URL for OpenAI API (optional, leave empty for default)",
              "https://api.openai.com/v1",
              () => this.plugin.settings.openaiSettings.baseUrl || "",
              async (value) => {
                this.plugin.settings.openaiSettings.baseUrl = value;
                await this.plugin.saveSettings();
              },
              { trim: true, undefinedIfEmpty: true }
            );

            this.renderProviderTestSection(subSectionEl, "openai", "OpenAI");
          },
          this.plugin,
          "providerConfigExpanded"
        );

        // Anthropic Configuration Section
        CollapsibleSectionRenderer.createCollapsibleSection(
          sectionEl,
          "Anthropic Configuration",
          async (subSectionEl: HTMLElement) => {
            this.settingCreators.createTextSetting(
              subSectionEl,
              "Anthropic API Key",
              "Enter your Anthropic API key",
              "Enter your API key",
              () => this.plugin.settings.anthropicSettings.apiKey,
              async (value) => {
                if (value && !isValidAnthropicApiKey(value)) {
                  new Notice(
                    "Invalid Anthropic API Key format. Please check your key."
                  );
                  return;
                }
                this.plugin.settings.anthropicSettings.apiKey = value ?? "";
                await this.plugin.saveSettings();
              }
            );

            this.renderProviderTestSection(
              subSectionEl,
              "anthropic",
              "Anthropic"
            );
          },
          this.plugin,
          "providerConfigExpanded"
        );

        // Google Gemini Configuration Section
        CollapsibleSectionRenderer.createCollapsibleSection(
          sectionEl,
          "Google Gemini Configuration",
          async (subSectionEl: HTMLElement) => {
            this.settingCreators.createTextSetting(
              subSectionEl,
              "Google API Key",
              "Enter your Google API key",
              "Enter your API key",
              () => this.plugin.settings.geminiSettings.apiKey,
              async (value) => {
                if (value && !isValidGoogleApiKey(value)) {
                  new Notice(
                    "Invalid Google API Key format. Please check your key."
                  );
                  return;
                }
                this.plugin.settings.geminiSettings.apiKey = value ?? "";
                await this.plugin.saveSettings();
              }
            );

            this.renderProviderTestSection(
              subSectionEl,
              "gemini",
              "Google Gemini"
            );
          },
          this.plugin,
          "providerConfigExpanded"
        );

        // Ollama Configuration Section
        CollapsibleSectionRenderer.createCollapsibleSection(
          sectionEl,
          "Ollama Configuration",
          async (subSectionEl: HTMLElement) => {
            this.settingCreators.createTextSetting(
              subSectionEl,
              "Ollama Server URL",
              "Enter your Ollama server URL (default: http://localhost:11434)",
              "http://localhost:11434",
              () => this.plugin.settings.ollamaSettings.serverUrl,
              async (value) => {
                if (value && !isValidUrl(value)) {
                  new Notice(
                    "Invalid Ollama Server URL format. Please enter a valid URL."
                  );
                  return;
                }
                this.plugin.settings.ollamaSettings.serverUrl = value ?? "";
                await this.plugin.saveSettings();
              }
            );

            subSectionEl.createEl("div", {
              cls: "setting-item-description",
              text: "To use Ollama:",
            });
            const steps = subSectionEl.createEl("ol");
            steps.createEl("li", {
              text: "Install Ollama from https://ollama.ai",
            });
            steps.createEl("li", { text: "Start the Ollama server" });
            steps.createEl("li", {
              text: 'Pull models using "ollama pull model-name"',
            });
            steps.createEl("li", {
              text: "Test connection to see available models",
            });

            this.renderProviderTestSection(subSectionEl, "ollama", "Ollama");
          },
          this.plugin,
          "providerConfigExpanded"
        );

        // OpenRouter Configuration Section
        CollapsibleSectionRenderer.createCollapsibleSection(
          sectionEl,
          "OpenRouter Configuration",
          async (subSectionEl: HTMLElement) => {
            this.settingCreators.createTextSetting(
              subSectionEl,
              "OpenRouter API Key",
              "Enter your OpenRouter API key (access 100+ models from multiple providers)",
              "sk-or-v1-...",
              () => this.plugin.settings.openrouterSettings?.apiKey || "",
              async (value) => {
                if (value && !value.startsWith("sk-or-")) {
                  new Notice(
                    'Invalid OpenRouter API Key format. Keys should start with "sk-or-"'
                  );
                  return;
                }
                if (!this.plugin.settings.openrouterSettings) {
                  this.plugin.settings.openrouterSettings = {
                    apiKey: "",
                    model: "openai/gpt-4-turbo",
                    availableModels: [],
                  };
                }
                this.plugin.settings.openrouterSettings.apiKey = value ?? "";
                await this.plugin.saveSettings();
              }
            );

            subSectionEl.createEl("div", {
              cls: "setting-item-description",
              text: "OpenRouter provides access to models from OpenAI, Anthropic, Google, Meta, and more through a single API.",
            });

            const infoDiv = subSectionEl.createEl("div", {
              cls: "setting-item-description",
            });
            const linkEl = infoDiv.createEl("a", {
              text: "Get your API key from openrouter.ai",
            });
            linkEl.setAttribute("href", "https://openrouter.ai/keys");

            this.renderProviderTestSection(
              subSectionEl,
              "openrouter",
              "OpenRouter"
            );
          },
          this.plugin,
          "providerConfigExpanded"
        );
      },
      this.plugin,
      "providerConfigExpanded"
    );

    // Model Management Section (Model Setting Presets)
    await this.modelManagementSection.render(containerEl);
  }

  /**
   * Renders the provider connection test section.
   * Allows users to test their API key and fetch available models for a given provider.
   * @param containerEl The HTML element to append the section to.
   * @param provider The ID of the provider (e.g., 'openai', 'anthropic').
   * @param displayName The display name of the provider (e.g., 'OpenAI', 'Anthropic').
   */
  private renderProviderTestSection(
    containerEl: HTMLElement,
    provider: "openai" | "anthropic" | "gemini" | "ollama" | "openrouter",
    displayName: string
  ): void {
    const settings = this.plugin.settings[
      `${provider}Settings` as keyof typeof this.plugin.settings
    ] as any;

    new Setting(containerEl)
      .setName("Test Connection")
      .setDesc(
        `Verify your API key and fetch available models for ${displayName}`
      )
      .addButton((button) =>
        button.setButtonText("Test").onClick(async () => {
          button.setButtonText("Testing...");
          button.setDisabled(true);
          try {
            // Use dispatcher for connection testing
            const aiDispatcher = new AIDispatcher(
              this.plugin.app.vault,
              this.plugin
            );
            const result = await aiDispatcher.testConnection(provider);

            if (result.success && result.models) {
              settings.availableModels = result.models;
              settings.lastTestResult = {
                timestamp: Date.now(),
                success: true,
                message: result.message,
              };
              await this.plugin.saveSettings();

              // Refresh all available models after a successful test
              this.plugin.settings.availableModels =
                await aiDispatcher.getAllUnifiedModels();
              await this.plugin.saveSettings();

              new Notice(result.message);
            } else {
              settings.lastTestResult = {
                timestamp: Date.now(),
                success: false,
                message: result.message,
              };
              new Notice(result.message);
            }
          } catch (error) {
            const err = error as Error;
            new Notice(`Error: ${err.message}`);
          } finally {
            button.setButtonText("Test");
            button.setDisabled(false);
          }
        })
      );

    if (settings.lastTestResult) {
      const date = new Date(settings.lastTestResult.timestamp);
      containerEl.createEl("div", {
        text: `Last test: ${date.toLocaleString()} - ${
          settings.lastTestResult.message
        }`,
        cls: settings.lastTestResult.success ? "success" : "error",
      });
    }

    if (settings.availableModels && settings.availableModels.length > 0) {
      const modelsText =
        settings.availableModels.length > 10
          ? `${settings.availableModels.length} models available`
          : `Available models: ${settings.availableModels.join(", ")}`;

      containerEl.createEl("div", {
        text: modelsText,
        cls: "setting-item-description",
      });

      // Add "Browse Models" button if we have model metadata
      new Setting(containerEl)
        .setName("Browse Models")
        .setDesc("Browse and search through available models with fuzzy search")
        .addButton((button) =>
          button.setButtonText("Browse Models").onClick(async () => {
            try {
              const modelService = ModelService.getInstance();
              const models = await modelService.getModelsForProvider(
                provider as any,
                this.plugin.settings,
                false // Don't force refresh, use cache
              );

              const modal = new FuzzyModelDropdown(
                this.plugin.app,
                models,
                (selectedModel: ModelInfo) => {
                  new Notice(`Selected: ${selectedModel.name}`);
                  // You can add logic here to set the selected model
                },
                this.plugin
              );
              modal.open();
            } catch (error) {
              const err = error as Error;
              new Notice(`Error loading models: ${err.message}`);
            }
          })
        );
    }
  }

  /**
   * Renders the AI Model Settings section.
   * This includes system message, streaming, temperature, model selection, and other chat settings.
   * @param containerEl The HTML element to append the section to.
   */
  async renderAIModelSettings(containerEl: HTMLElement): Promise<void> {
    // Render quick preset buttons if presets exist
    if (
      this.plugin.settings.modelSettingPresets &&
      this.plugin.settings.modelSettingPresets.length > 0
    ) {
      const presetContainer = containerEl.createDiv();
      presetContainer.addClass("model-preset-buttons");
      presetContainer.createEl("div", {
        text: "Quick Presets:",
        cls: "setting-item-name",
      });
      this.plugin.settings.modelSettingPresets.forEach((preset, idx) => {
        const btn = presetContainer.createEl("button", { text: preset.name });
        btn.style.marginRight = "0.5em";
        btn.onclick = async () => {
          // Apply preset settings
          if (preset.selectedModel !== undefined)
            this.plugin.settings.selectedModel = preset.selectedModel;
          if (preset.systemMessage !== undefined)
            this.plugin.settings.systemMessage = preset.systemMessage;
          if (preset.temperature !== undefined)
            this.plugin.settings.temperature = preset.temperature;
          if (preset.enableStreaming !== undefined)
            this.plugin.settings.enableStreaming = preset.enableStreaming;
          await this.plugin.saveSettings();
          new Notice(`Applied preset: ${preset.name}`);
        };
      });
    }

    // System Message Setting
    new Setting(containerEl)
      .setName("System Message")
      .setDesc("Set the system message for the AI")
      .addTextArea((text) => {
        text
          .setPlaceholder("You are a helpful assistant.")
          .setValue(this.plugin.settings.systemMessage)
          .onChange((value) => {
            // Update setting immediately on change
            this.plugin.settings.systemMessage = value;
          });

        // Save settings on blur to prevent frequent saves during typing
        text.inputEl.addEventListener("blur", async () => {
          await this.plugin.saveSettings();
        });

        return text;
      });

    // Refresh Available Models Button
    new Setting(containerEl)
      .setName("Refresh Available Models")
      .setDesc(
        "Test connections to all configured providers and refresh available models"
      )
      .addButton((button) =>
        button.setButtonText("Refresh Models").onClick(async () => {
          button.setButtonText("Refreshing...");
          button.setDisabled(true);

          try {
            await this.refreshAllAvailableModels();
            new Notice("Successfully refreshed available models");
          } catch (error) {
            const err = error as Error;
            new Notice(`Error refreshing models: ${err.message}`);
          } finally {
            button.setButtonText("Refresh Models");
            button.setDisabled(false);
          }
        })
      );

    // Render unified model dropdown
    await this.renderUnifiedModelDropdown(containerEl);

    // Temperature Slider
    new Setting(containerEl)
      .setName("Temperature")
      .setDesc("Set the randomness of the model's output (0-1)")
      .addSlider((slider) =>
        slider
          .setLimits(0, 1, 0.1)
          .setValue(this.plugin.settings.temperature)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.temperature = value;
            await this.plugin.saveSettings();
          })
      );

    // Enable Obsidian Links
    new Setting(containerEl)
      .setName("Enable Obsidian Links")
      .setDesc("Read Obsidian links in messages using [[filename]] syntax")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.enableObsidianLinks)
          .onChange(async (value) => {
            this.plugin.settings.enableObsidianLinks = value;
            await this.plugin.saveSettings();
          })
      );

    // Enable Context Notes
    new Setting(containerEl)
      .setName("Enable Context Notes")
      .setDesc("Attach specified note content to chat messages")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.enableContextNotes)
          .onChange(async (value) => {
            this.plugin.settings.enableContextNotes = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Include Recently Opened Notes")
      .setDesc("Include the three most recently opened notes in the system message context")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.includeRecentlyOpenedNotes)
          .onChange(async (value) => {
            this.plugin.settings.includeRecentlyOpenedNotes = value;
            await this.plugin.saveSettings();
          })
      );
    // Context Notes textarea
    const contextNotesContainer = containerEl.createDiv(
      "context-notes-container"
    );
    contextNotesContainer.style.marginBottom = "24px";

    new Setting(contextNotesContainer)
      .setName("Context Notes")
      .setDesc(
        "Notes to attach as context (supports [[filename]] and [[filename#header]] syntax)"
      )
      .addTextArea((text) => {
        text
          .setPlaceholder("[[Note Name]]\n[[Another Note#Header]]")
          .setValue(this.plugin.settings.contextNotes || "")
          .onChange((value) => {
            // Update setting value immediately on change
            this.plugin.settings.contextNotes = value;
          });
        // Save settings on blur
        text.inputEl.addEventListener("blur", async () => {
          await this.plugin.saveSettings();
        });
        // Style textarea
        text.inputEl.rows = 4;
        text.inputEl.style.width = "100%";
        return text;
      });

    // Expand Linked Notes Recursively
    new Setting(containerEl)
      .setName("Expand Linked Notes Recursively")
      .setDesc(
        "If enabled, when fetching a note, also fetch and expand links within that note recursively (prevents infinite loops)."
      )
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.expandLinkedNotesRecursively ?? false)
          .onChange(async (value) => {
            this.plugin.settings.expandLinkedNotesRecursively = value;
            await this.plugin.saveSettings();
          })
      );

    // Enable Streaming Toggle
    new Setting(containerEl)
      .setName("Enable Streaming")
      .setDesc("Enable or disable streaming for completions")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.enableStreaming)
          .onChange(async (value) => {
            this.plugin.settings.enableStreaming = value;
            await this.plugin.saveSettings();
          })
      );

    // Include Time with System Message
    new Setting(containerEl)
      .setName("Include Time with System Message")
      .setDesc("Add the current time along with the date to the system message")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.includeTimeWithSystemMessage)
          .onChange(async (value) => {
            this.plugin.settings.includeTimeWithSystemMessage = value;
            await this.plugin.saveSettings();
          })
      );
  }

  /**
   * Renders only the current model settings (for use in modal).
   * This is a streamlined version without API Keys, Providers, or Model Management sections.
   * @param containerEl The HTML element to append the section to.
   */
  async renderCurrentModelSettingsOnly(
    containerEl: HTMLElement
  ): Promise<void> {
    // Just render the AI Model Settings without the collapsible wrapper
    await this.renderAIModelSettings(containerEl);
  }

  /**
   * Renders the unified model selection using FuzzyModelDropdown.
   * This allows users to select from all available models across all configured providers with fuzzy search.
   * Uses ModelService to fetch rich model metadata (same as "Browse Models").
   * @param containerEl The HTML element to append the dropdown to.
   */
  private async renderUnifiedModelDropdown(
    containerEl: HTMLElement
  ): Promise<void> {
    new Setting(containerEl)
      .setName("Selected Model")
      .setDesc(
        "Choose from all available models across all configured providers"
      )
      .addButton((button) =>
        button.setButtonText("Select Model").onClick(async () => {
          try {
            // Use ModelService to get rich model metadata (same as Browse Models)
            const modelService = ModelService.getInstance();
            const models = await modelService.getAllModelsWithMetadata(
              this.plugin.settings,
              false // Don't force refresh, use cache
            );
            
            if (models.length === 0) {
              new Notice("No models available - configure providers and refresh models first");
              return;
            }

            const modal = new FuzzyModelDropdown(
              this.plugin.app,
              models,
              async (selectedModel: ModelInfo) => {
                // Extract the original model ID (remove provider prefix)
                const [provider, ...modelIdParts] = selectedModel.id.split(":");
                const originalModelId = modelIdParts.join(":");
                
                this.plugin.settings.selectedModel = selectedModel.id;
                this.plugin.settings.provider = provider as any;
                
                await this.plugin.saveSettings();
                new Notice(`Selected: ${selectedModel.name}`);
              },
              this.plugin
            );
            modal.open();
          } catch (error) {
            const err = error as Error;
            new Notice(`Error loading models: ${err.message}`);
          }
        })
      );

    // Display currently selected model info
    if (this.plugin.settings.selectedModel) {
      try {
        const modelService = ModelService.getInstance();
        const models = await modelService.getAllModelsWithMetadata(
          this.plugin.settings,
          false
        );
        
        const selectedModel = models.find(
          (model) => model.id === this.plugin.settings.selectedModel
        );
        
        if (selectedModel) {
          const infoEl = containerEl.createEl("div", {
            cls: "setting-item-description",
          });
          infoEl.setText(`Currently using: ${selectedModel.name} (${selectedModel.provider})`);
        }
      } catch (error) {
        console.error("Error displaying selected model:", error);
      }
    }
  }

  /**
   * Refreshes available models from all configured providers using the dispatcher.
   * This function uses the dispatcher to refresh models from all providers.
   */
  private async refreshAllAvailableModels(): Promise<void> {
    const aiDispatcher = new AIDispatcher(this.plugin.app.vault, this.plugin);

    try {
      // Use dispatcher to refresh all provider models
      await aiDispatcher.refreshAllProviderModels();
      this.plugin.settings.availableModels =
        await aiDispatcher.getAllUnifiedModels();
      await this.plugin.saveSettings();
    } catch (error) {
      console.error("Error refreshing all available models:", error);
    }
  }

  /**
   * Renders the Available Models section in the Model Management settings.
   * This section displays all models available from configured providers and allows
   * deleting local copies of models.
   * @param containerEl The HTML element to append the section to.
   */
  private async renderAvailableModelsSection(
    containerEl: HTMLElement
  ): Promise<void> {
    const availableModels = this.plugin.settings.availableModels || [];

    if (availableModels.length === 0) {
      containerEl.createEl("div", {
        text: "No models available. Configure providers and refresh to load models.",
        cls: "setting-item-description",
      });
      return;
    }

    // Create a table to display models
    const table = containerEl.createEl("table");
    const thead = table.createEl("thead");
    const tbody = table.createEl("tbody");

    // Header row
    const headerRow = thead.createEl("tr");
    headerRow.createEl("th", { text: "Model" });
    headerRow.createEl("th", { text: "Provider" });
    headerRow.createEl("th", { text: "Actions" });

    // Data rows
    for (const model of availableModels) {
      const row = tbody.createEl("tr");
      row.createEl("td", { text: model.name });
      row.createEl("td", { text: model.provider });

      // Actions column
      const actionsCell = row.createEl("td");

      // Delete action
      new Setting(actionsCell)
        .setName("")
        .setDesc("Delete local copy of this model")
        .addButton((button) =>
          button
            .setButtonText("Delete")
            .setWarning()
            .onClick(async () => {
              const confirmed = confirm(
                `Are you sure you want to delete the local copy of the model "${model.name}"?`
              );
              if (confirmed) {
                try {
                  // Delete the model file from the filesystem
                  await this.plugin.app.vault.adapter.remove(
                    `ai-models/${model.id}.json`
                  );

                  // Refresh available models after deletion
                  const aiDispatcher = new AIDispatcher(
                    this.plugin.app.vault,
                    this.plugin
                  );
                  this.plugin.settings.availableModels =
                    await aiDispatcher.getAllUnifiedModels();
                  await this.plugin.saveSettings();

                  new Notice(`Deleted model "${model.name}"`);

                  // Re-render the section to reflect changes
                  containerEl.empty();
                  await this.renderAvailableModelsSection(containerEl);
                } catch (error) {
                  const err = error as Error;
                  new Notice(`Error deleting model: ${err.message}`);
                }
              }
            })
        )
        .addButton((button) =>
          button.setButtonText("Re-download").onClick(async () => {
            const confirmed = confirm(
              `Are you sure you want to re-download the model "${model.name}"?`
            );
            if (confirmed) {
              try {
                // TODO: Implement model re-download logic
                new Notice(
                  `Re-download feature is not yet implemented. Please pull the model again using the provider settings.`
                );
              } catch (error) {
                const err = error as Error;
                new Notice(`Error re-downloading model: ${err.message}`);
              }
            }
          })
        );
    }
  }

  /**
   * Refreshes the Current Model Settings section to reflect preset changes.
   * Call this after adding, deleting, or modifying presets.
   */
  private refreshCurrentModelSettings(): void {
    if (this.currentModelSettingsContainer) {
      this.currentModelSettingsContainer.empty();
      this.renderAIModelSettings(this.currentModelSettingsContainer);
    }
  }
}
