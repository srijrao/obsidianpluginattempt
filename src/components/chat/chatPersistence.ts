// Handles chat YAML load/save for chat notes
import { MyPluginSettings } from '../../types';
import { Notice } from 'obsidian';
import * as yaml from 'js-yaml';

export function buildChatYaml(settings: MyPluginSettings, provider: string, model: string): string {
    const yamlObj = {
        provider,
        model,
        system_message: settings.systemMessage,
        temperature: settings.temperature
    };
    return `---\n${yaml.dump(yamlObj)}---\n`;
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
            yamlObj = yaml.load(yamlMatch[1]) || {};
        } catch (e) {
            yamlObj = {};
        }
    }
    // Improved provider/model selection logic: prioritize model
    let newProvider = settings.provider;
    let newModel = settings.openaiSettings?.model || settings.anthropicSettings?.model || settings.geminiSettings?.model || settings.ollamaSettings?.model;
    const availableProviders = plugin.getAvailableProviders ? plugin.getAvailableProviders() : [];
    // 1. If a model is specified, find a provider that supports it
    if (yamlObj.model) {
        let found = false;
        for (const prov of availableProviders) {
            const models = plugin.getModelsForProvider ? plugin.getModelsForProvider(prov) : [];
            if (models.includes(yamlObj.model)) {
                newProvider = prov;
                newModel = yamlObj.model;
                found = true;
                break;
            }
        }
        // If not found, keep previous provider/model
    } else if (yamlObj.provider && availableProviders.includes(yamlObj.provider)) {
        // 2. If only provider is specified, use previous model for that provider
        newProvider = yamlObj.provider;
        switch (newProvider) {
            case 'openai':
                newModel = settings.openaiSettings.model;
                break;
            case 'anthropic':
                newModel = settings.anthropicSettings.model;
                break;
            case 'gemini':
                newModel = settings.geminiSettings.model;
                break;
            case 'ollama':
                newModel = settings.ollamaSettings.model;
                break;
        }
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
