// Handles chat YAML load/save for chat notes
import { MyPluginSettings } from '../../types';
import { Notice } from 'obsidian';
import * as yaml from 'js-yaml';
import { getProviderFromUnifiedModel, getModelIdFromUnifiedModel } from '../../../providers';
import { MessageRenderer } from './MessageRenderer';

// Logging utility: uses plugin.debugLog if available, else falls back to console.log
function log(level: 'debug' | 'info' | 'warn' | 'error', ...args: any[]) {
    if (typeof window !== 'undefined' && (window as any).plugin && typeof (window as any).plugin.debugLog === 'function') {
        (window as any).plugin.debugLog(level, '[chatPersistence]', ...args);
    } else if (typeof console !== 'undefined') {
        // Only log info/warn/error by default
        if (level !== 'debug') console[level]('[chatPersistence]', ...args);
    }
}

export function buildChatYaml(settings: MyPluginSettings, provider?: string, model?: string): string {
    log('info', '[buildChatYaml] Entered function', { settings, provider, model });
    if (settings.selectedModel) {
        const providerType = getProviderFromUnifiedModel(settings.selectedModel);
        const modelId = getModelIdFromUnifiedModel(settings.selectedModel);
        const yamlObj = {
            provider: providerType,
            model: modelId,
            unified_model: settings.selectedModel,
            system_message: settings.systemMessage,
            temperature: settings.temperature
        };
        log('debug', '[buildChatYaml] Using unified model format', yamlObj);
        log('info', '[buildChatYaml] Returning YAML for unified model', { yaml: `---\n${yaml.dump(yamlObj)}---\n` });
        return `---\n${yaml.dump(yamlObj)}---\n`;
    } else {
        const yamlObj = {
            provider: provider || settings.provider,
            model: model || getCurrentModelForProvider(settings),
            system_message: settings.systemMessage,
            temperature: settings.temperature
        };
        log('debug', '[buildChatYaml] Using legacy model format', yamlObj);
        log('info', '[buildChatYaml] Returning YAML for legacy model', { yaml: `---\n${yaml.dump(yamlObj)}---\n` });
        return `---\n${yaml.dump(yamlObj)}---\n`;
    }
}

function getCurrentModelForProvider(settings: MyPluginSettings): string {
    log('debug', '[getCurrentModelForProvider] Called', { provider: settings.provider });
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
 * Logs every major step for traceability.
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
    log('info', '[saveChatAsNote] Entered function', { hasMessages: !!messages, hasChatContent: typeof chatContent === 'string' });
    let content = '';
    if (typeof chatContent === 'string') {
        content = chatContent;
        log('info', '[saveChatAsNote] Using provided chatContent string directly.');
    } else if (messages) {
        log('info', '[saveChatAsNote] Building chat content from message DOM nodes.');
        const messageRenderer = new MessageRenderer(app);
        messages.forEach((el: Element, index: number) => {
            const htmlElement = el as HTMLElement;
            if (htmlElement.classList.contains('tool-display-message')) {
                log('debug', `[saveChatAsNote] Skipping tool-display-message at index ${index}`);
                return;
            }
            const messageDataStr = htmlElement.dataset.messageData;
            let messageData = null;
            if (messageDataStr) {
                try {
                    messageData = JSON.parse(messageDataStr);
                    log('debug', `[saveChatAsNote] Parsed messageData at index ${index}`, messageData);
                } catch (e) {
                    log('warn', `[saveChatAsNote] Failed to parse messageData at index ${index}`, e);
                }
            }
            if (messageData && messageData.toolResults && messageData.toolResults.length > 0) {
                log('info', `[saveChatAsNote] Formatting message with toolResults at index ${index}`);
                content += messageRenderer.getMessageContentForCopy(messageData);
            } else {
                const rawContent = htmlElement.dataset.rawContent;
                const msg = rawContent !== undefined ? rawContent : el.querySelector('.message-content')?.textContent || '';
                log('debug', `[saveChatAsNote] Appending regular message at index ${index}`, { msg });
                content += msg;
            }
            if (index < messages.length - 1) {
                content += '\n\n' + chatSeparator + '\n\n';
            }
        });
        log('debug', '[saveChatAsNote] messages NodeList length:', { length: messages.length });
    } else {
        log('error', '[saveChatAsNote] Neither messages nor chatContent provided. Aborting.');
        throw new Error('Either messages or chatContent must be provided');
    }
    const yaml = buildChatYaml(settings, provider, model);
    log('info', '[saveChatAsNote] YAML frontmatter built. Stripping any existing YAML from chat content.');
    content = content.replace(/^---[\s\S]*?---\n?/, '');
    // Normalize all newlines to \n, then replace 3+ consecutive newlines with exactly two
    content = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    content = content.replace(/\n{3,}/g, '\n\n');
    content = content.replace(/\n+$/, ''); // Remove trailing newlines
    const noteContent = yaml + '\n' + content + '\n';
    // Generate filename with timestamp
    const now = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    const fileName = `Chat Export ${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())} ${pad(now.getHours())}-${pad(now.getMinutes())}.md`;
    let filePath = fileName;
    const folder = chatNoteFolder?.trim();
    if (folder) {
        log('info', `[saveChatAsNote] Ensuring chat note folder exists: ${folder}`);
        const folderExists = app.vault.getAbstractFileByPath(folder);
        if (!folderExists) {
            try {
                await app.vault.createFolder(folder);
                log('info', `[saveChatAsNote] Created chat note folder: ${folder}`);
            } catch (e) {
                if (!app.vault.getAbstractFileByPath(folder)) {
                    log('error', `[saveChatAsNote] Failed to create folder for chat note: ${folder}`, e);
                    new Notice('Failed to create folder for chat note.');
                    return;
                } else {
                    log('warn', `[saveChatAsNote] Folder already exists after race: ${folder}`);
                }
            }
        } else {
            log('debug', `[saveChatAsNote] Folder already exists: ${folder}`);
        }
        filePath = folder.replace(/[/\\]+$/, '') + '/' + fileName;
    }
    // Try to create the file, handle if it already exists
    let finalFilePath = filePath;
    let attempt = 1;
    while (app.vault.getAbstractFileByPath(finalFilePath)) {
        const extIndex = fileName.lastIndexOf('.');
        const base = extIndex !== -1 ? fileName.substring(0, extIndex) : fileName;
        const ext = extIndex !== -1 ? fileName.substring(extIndex) : '';
        finalFilePath = (folder ? folder.replace(/[/\\]+$/, '') + '/' : '') + `${base} (${attempt})${ext}`;
        log('warn', '[saveChatAsNote] File already exists, trying new filename', { finalFilePath });
        attempt++;
    }
    try {
        await app.vault.create(finalFilePath, noteContent);
        log('info', '[saveChatAsNote] Chat successfully saved as note', { finalFilePath });
        new Notice(`Chat saved as note: ${finalFilePath}`);
    } catch (e) {
        log('error', '[saveChatAsNote] Failed to save chat as note', { finalFilePath, error: e });
        new Notice('Failed to save chat as note.');
    }
    log('info', '[saveChatAsNote] Exiting function. Save process complete.');
}

/**
 * Loads YAML frontmatter from a chat note and applies settings to the plugin.
 * Logs every major step for traceability.
 */
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
    log('info', '[loadChatYamlAndApplySettings] Entered function', { file: file?.path || file?.name || file });
    log('debug', '[loadChatYamlAndApplySettings] File content loaded. Extracting YAML frontmatter.');
    let content = await app.vault.read(file);
    const yamlMatch = content.match(/^---\n([\s\S]*?)\n---/);
    let yamlObj: any = {};
    if (yamlMatch) {
        try {
            yamlObj = yaml.load(yamlMatch[1]) || {};
            log('info', '[loadChatYamlAndApplySettings] YAML frontmatter parsed', yamlObj);
        } catch (e) {
            log('warn', '[loadChatYamlAndApplySettings] Failed to parse YAML frontmatter', e);
            yamlObj = {};
        }
    } else {
        log('warn', '[loadChatYamlAndApplySettings] No YAML frontmatter found in file.');
    }
    // Handle unified model format first
    if (yamlObj.unified_model) {
        settings.selectedModel = yamlObj.unified_model;
        log('info', '[loadChatYamlAndApplySettings] Loaded unified_model from YAML', yamlObj.unified_model);
        log('info', '[loadChatYamlAndApplySettings] Set selectedModel from unified_model', { selectedModel: settings.selectedModel });
    } else if (yamlObj.provider && yamlObj.model) {
        const unifiedModelId = `${yamlObj.provider}:${yamlObj.model}`;
        settings.selectedModel = unifiedModelId;
        log('info', '[loadChatYamlAndApplySettings] Loaded legacy provider/model from YAML', { provider: yamlObj.provider, model: yamlObj.model });
        log('info', '[loadChatYamlAndApplySettings] Set selectedModel from provider/model', { selectedModel: settings.selectedModel });
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
    } else {
        log('warn', '[loadChatYamlAndApplySettings] No model/provider found in YAML. Using existing settings.');
    }
    let newSystemMessage = yamlObj.system_message || settings.systemMessage;
    let newTemperature = settings.temperature;
    if (yamlObj.temperature !== undefined) {
        const tempNum = parseFloat(yamlObj.temperature);
        if (!isNaN(tempNum)) {
            newTemperature = tempNum;
            log('info', '[loadChatYamlAndApplySettings] Loaded temperature from YAML', newTemperature);
        } else {
            log('warn', '[loadChatYamlAndApplySettings] Invalid temperature in YAML, using existing value.', yamlObj.temperature);
        }
    }
    settings.systemMessage = newSystemMessage;
    settings.temperature = newTemperature;
    log('info', '[loadChatYamlAndApplySettings] Applied settings from YAML', { selectedModel: settings.selectedModel, systemMessage: newSystemMessage, temperature: newTemperature });
    if (plugin.onSettingsLoadedFromNote) {
        log('debug', '[loadChatYamlAndApplySettings] Calling plugin.onSettingsLoadedFromNote');
        plugin.onSettingsLoadedFromNote(settings);
    }
    log('info', '[loadChatYamlAndApplySettings] Exiting function. YAML load/apply process complete.');
    return {
        provider: yamlObj.provider,
        model: yamlObj.model,
        unifiedModel: settings.selectedModel,
        systemMessage: newSystemMessage,
        temperature: newTemperature
    };
}
