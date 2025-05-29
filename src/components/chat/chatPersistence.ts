// Handles chat YAML load/save for chat notes
import { MyPluginSettings } from '../../types';
import { Notice } from 'obsidian';

export function buildChatYaml(settings: MyPluginSettings, provider: string, model: string): string {
    return `---\nprovider: ${provider}\nmodel: ${model}\nsystem_message: |\n  ${settings.systemMessage.replace(/\n/g, '\n  ')}\ntemperature: ${settings.temperature}\n---\n`;
}

export async function saveChatAsNote({
    app,
    messages,
    settings,
    provider,
    model,
    chatSeparator,
    chatNoteFolder
}: {
    app: any,
    messages: NodeListOf<Element>,
    settings: MyPluginSettings,
    provider: string,
    model: string,
    chatSeparator: string,
    chatNoteFolder?: string
}) {
    let chatContent = '';
    messages.forEach((el: Element, index: number) => {
        // Prefer raw markdown content if available
        const rawContent = (el as HTMLElement).dataset.rawContent;
        const content = rawContent !== undefined ? rawContent : el.querySelector('.message-content')?.textContent || '';
        chatContent += content;
        if (index < messages.length - 1) {
            chatContent += '\n\n' + chatSeparator + '\n\n';
        }
    });
    const yaml = buildChatYaml(settings, provider, model);
    // Remove any existing YAML frontmatter from chatContent
    chatContent = chatContent.replace(/^---[\s\S]*?---\n?/, '');
    const noteContent = yaml + '\n' + chatContent.trimStart();
    // Generate filename with timestamp
    const now = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    const fileName = `Chat Export ${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())} ${pad(now.getHours())}-${pad(now.getMinutes())}.md`;
    let filePath = fileName;
    const folder = chatNoteFolder?.trim();
    if (folder) {
        filePath = folder.replace(/[/\\]+$/, '') + '/' + fileName;
    }
    try {
        await app.vault.create(filePath, noteContent);
        new Notice(`Chat saved as note: ${filePath}`);
    } catch (e) {
        new Notice('Failed to save chat as note.');
    }
}

// Add a function for loading YAML and applying settings (see previous logic)
export async function loadChatYamlAndApplySettings({
    app,
    plugin,
    settings,
    file
}: {
    app: any,
    plugin: any,
    settings: MyPluginSettings,
    file: any
}) {
    // Read file contents
    let content = await app.vault.read(file);
    // Extract YAML frontmatter
    const yamlMatch = content.match(/^---\n([\s\S]*?)\n---/);
    let yamlObj: any = {};
    if (yamlMatch) {
        try {
            // Use Obsidian's built-in YAML parser if available, else fallback to a simple parse
            if (app.metadataCache && app.metadataCache.getFileCache) {
                const cache = app.metadataCache.getFileCache(file);
                if (cache && cache.frontmatter) {
                    yamlObj = { ...cache.frontmatter };
                }
            } else {
                // Fallback: basic YAML parse (not full-featured)
                yamlMatch[1].split(/\n(?=\w)/).forEach((line: string) => {
                    const [key, ...rest] = line.split(':');
                    if (key && rest.length) {
                        yamlObj[key.trim()] = rest.join(':').trim();
                    }
                });
            }
        } catch (e) {
            // Ignore YAML parse errors, fallback to empty
            yamlObj = {};
        }
    }
    // Robustly apply settings with graceful fallbacks
    // Provider
    let newProvider = yamlObj.provider || settings.provider;
    // Model
    let newModel = yamlObj.model;
    // If model is not available for provider, fallback to previous
    const availableProviders = plugin.getAvailableProviders ? plugin.getAvailableProviders() : [];
    if (availableProviders.length && !availableProviders.includes(newProvider)) {
        // Try to find provider for the model
        const bestProvider = availableProviders.find((prov: string) => {
            const models = plugin.getModelsForProvider ? plugin.getModelsForProvider(prov) : [];
            return models.includes(newModel);
        });
        if (bestProvider) newProvider = bestProvider;
        else newProvider = settings.provider;
    }
    // System message
    let newSystemMessage = yamlObj.system_message || settings.systemMessage;
    // Temperature
    let newTemperature = settings.temperature;
    if (yamlObj.temperature !== undefined) {
        const tempNum = parseFloat(yamlObj.temperature);
        if (!isNaN(tempNum)) newTemperature = tempNum;
    }
    // Apply settings
    settings.provider = newProvider;
    // Set the model for the correct provider
    if (newModel) {
        switch (newProvider) {
            case 'openai':
                settings.openaiSettings.model = newModel;
                break;
            case 'anthropic':
                settings.anthropicSettings.model = newModel;
                break;
            case 'gemini':
                settings.geminiSettings.model = newModel;
                break;
            case 'ollama':
                settings.ollamaSettings.model = newModel;
                break;
        }
    }
    settings.systemMessage = newSystemMessage;
    settings.temperature = newTemperature;
    // Optionally, update UI or plugin state if needed
    if (plugin.onSettingsLoadedFromNote) {
        plugin.onSettingsLoadedFromNote(settings);
    }
    return {
        provider: newProvider,
        model: newModel,
        systemMessage: newSystemMessage,
        temperature: newTemperature
    };
}
