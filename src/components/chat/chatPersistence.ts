// Handles chat YAML load/save for chat notes
import { MyPluginSettings } from '../../types';
import { Notice } from 'obsidian';
import * as yaml from 'js-yaml';
import { getProviderFromUnifiedModel, getModelIdFromUnifiedModel } from '../../../providers';
import { MessageRenderer } from './MessageRenderer';

export function buildChatYaml(settings: MyPluginSettings, provider?: string, model?: string): string {
    // Use unified model if available, otherwise fall back to legacy provider/model
    if (settings.selectedModel) {
        const providerType = getProviderFromUnifiedModel(settings.selectedModel);
        const modelId = getModelIdFromUnifiedModel(settings.selectedModel);
        const yamlObj = {
            provider: providerType,
            model: modelId,
            unified_model: settings.selectedModel, // Add unified model ID for future compatibility
            system_message: settings.systemMessage,
            temperature: settings.temperature
        };
        return `---\n${yaml.dump(yamlObj)}---\n`;
    } else {
        // Legacy format
        const yamlObj = {
            provider: provider || settings.provider,
            model: model || getCurrentModelForProvider(settings),
            system_message: settings.systemMessage,
            temperature: settings.temperature
        };
        return `---\n${yaml.dump(yamlObj)}---\n`;
    }
}

function getCurrentModelForProvider(settings: MyPluginSettings): string {
    switch (settings.provider) {
        case 'openai':
            return settings.openaiSettings.model;
        case 'anthropic':
            return settings.anthropicSettings.model;
        case 'gemini':
            return settings.geminiSettings.model;
        case 'ollama':
            return settings.ollamaSettings.model;
        default:
            return '';
    }
}

/**
 * Save chat as note, accepting either a NodeList of message elements or a pre-formatted chatContent string.
 */
export async function saveChatAsNote({
    app,
    messages,
    chatContent,
    settings,
    provider,
    model,
    chatSeparator,
    chatNoteFolder,
    agentResponseHandler
}: {
    app: any,
    messages?: NodeListOf<Element>,
    chatContent?: string,
    settings: MyPluginSettings,
    provider?: string,
    model?: string,
    chatSeparator: string,
    chatNoteFolder?: string,
    agentResponseHandler?: any
}) {
    let content = '';
    if (typeof chatContent === 'string') {
        content = chatContent;
    } else if (messages) {
        const messageRenderer = new MessageRenderer(app);
        messages.forEach((el: Element, index: number) => {
            const htmlElement = el as HTMLElement;
            // Skip tool display messages as they're handled inline now
            if (htmlElement.classList.contains('tool-display-message')) {
                return;
            }
            
            // Check if this message has tool results data
            const messageDataStr = htmlElement.dataset.messageData;
            let messageData = null;
            if (messageDataStr) {
                try {
                    messageData = JSON.parse(messageDataStr);
                } catch (e) {
                    // Removed redundant console.log for cleaner production code.
                }
            }
            
            // If message has tool results, use MessageRenderer for proper inline formatting
            if (messageData && messageData.toolResults && messageData.toolResults.length > 0) {
                content += messageRenderer.getMessageContentForCopy(messageData);
            } else {
                // For regular messages, use raw content if available, otherwise text content
                const rawContent = htmlElement.dataset.rawContent;
                const msg = rawContent !== undefined ? rawContent : el.querySelector('.message-content')?.textContent || '';
                content += msg;
            }
            
            if (index < messages.length - 1) {
                content += '\n\n' + chatSeparator + '\n\n';
            }
        });
    } else {
        throw new Error('Either messages or chatContent must be provided');
    }
    const yaml = buildChatYaml(settings, provider, model);
    // Remove any existing YAML frontmatter from content
    content = content.replace(/^---[\s\S]*?---\n?/, '');
    const noteContent = yaml + '\n' + content.trimStart();
    // Generate filename with timestamp
    const now = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    const fileName = `Chat Export ${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())} ${pad(now.getHours())}-${pad(now.getMinutes())}.md`;
    let filePath = fileName;
    const folder = chatNoteFolder?.trim();
    if (folder) {
        // Ensure the folder exists, create if not
        const folderExists = app.vault.getAbstractFileByPath(folder);
        if (!folderExists) {
            try {
                await app.vault.createFolder(folder);
            } catch (e) {
                // Folder may already exist due to race condition
                if (!app.vault.getAbstractFileByPath(folder)) {
                    new Notice('Failed to create folder for chat note.');
                    return;
                }
            }
        }
        filePath = folder.replace(/[/\\]+$/, '') + '/' + fileName;
    }
    // Try to create the file, handle if it already exists
    let finalFilePath = filePath;
    let attempt = 1;
    while (app.vault.getAbstractFileByPath(finalFilePath)) {
        // Append a number to the filename if it already exists
        const extIndex = fileName.lastIndexOf('.');
        const base = extIndex !== -1 ? fileName.substring(0, extIndex) : fileName;
        const ext = extIndex !== -1 ? fileName.substring(extIndex) : '';
        finalFilePath = (folder ? folder.replace(/[/\\]+$/, '') + '/' : '') + `${base} (${attempt})${ext}`;
        attempt++;
    }
    try {
        await app.vault.create(finalFilePath, noteContent);
        new Notice(`Chat saved as note: ${finalFilePath}`);
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

    // Handle unified model format first
    if (yamlObj.unified_model) {
        settings.selectedModel = yamlObj.unified_model;
    } else if (yamlObj.provider && yamlObj.model) {
        // Convert legacy format to unified model format
        const unifiedModelId = `${yamlObj.provider}:${yamlObj.model}`;
        settings.selectedModel = unifiedModelId;
        
        // Also update the legacy provider-specific settings for backward compatibility
        settings.provider = yamlObj.provider;
        switch (yamlObj.provider) {
            case 'openai':
                settings.openaiSettings.model = yamlObj.model;
                break;
            case 'anthropic':
                settings.anthropicSettings.model = yamlObj.model;
                break;
            case 'gemini':
                settings.geminiSettings.model = yamlObj.model;
                break;
            case 'ollama':
                settings.ollamaSettings.model = yamlObj.model;
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
    settings.systemMessage = newSystemMessage;
    settings.temperature = newTemperature;
    
    if (plugin.onSettingsLoadedFromNote) {
        plugin.onSettingsLoadedFromNote(settings);
    }
    
    return {
        provider: yamlObj.provider,
        model: yamlObj.model,
        unifiedModel: settings.selectedModel,
        systemMessage: newSystemMessage,
        temperature: newTemperature
    };
}
