import { ItemView, WorkspaceLeaf, Notice, Modal, App, Setting, MarkdownRenderer, Menu, TFile } from 'obsidian';
import MyPlugin from '../../main';
import { Message, ChatSession } from '../../types';
import { createProvider } from '../../../providers';
import { SettingsModal } from './SettingsModal';
import { Buttons } from './Buttons';
import { Commands } from './Commands';
import { Prompt } from './Prompt';
import { BotMessage } from './BotMessage';
import { UserMessage } from './UserMessage';

export const VIEW_TYPE_CHAT = 'chat-view';

declare module 'obsidian' {
    interface Workspace {
        on(name: 'ai-assistant:open-settings', callback: () => void): EventRef;
    }
}

/**
 * ChatView component that integrates all chat components
 */
export class ChatView extends ItemView {
    private plugin: MyPlugin;
    private messagesContainer: HTMLElement;
    private inputContainer: HTMLElement;
    private buttonsContainer: HTMLElement;
    private sessionSelector: HTMLSelectElement;
    private activeStream: AbortController | null = null;
    private prompt: Prompt;
    private commands: Commands;

    constructor(leaf: WorkspaceLeaf, plugin: MyPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType(): string {
        return VIEW_TYPE_CHAT;
    }

    getDisplayText(): string {
        return 'AI Chat';
    }

    getIcon(): string {
        return 'message-square';
    }

    async onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('ai-chat-view');

        // Create session management container
        const sessionContainer = contentEl.createDiv('ai-chat-session-container');
        
        // Add session selector with metadata
        this.sessionSelector = sessionContainer.createEl('select', {
            cls: 'ai-chat-session-selector'
        });
        this.updateSessionSelector();

        // Session metadata display
        const metadataContainer = sessionContainer.createDiv('ai-chat-session-metadata');
        this.updateSessionMetadata();

        // Session management buttons
        const sessionButtons = sessionContainer.createDiv('ai-chat-session-buttons');
        
        const newSessionButton = sessionButtons.createEl('button', {
            text: 'New Session'
        });
        newSessionButton.addEventListener('click', () => this.createNewSession());

        const renameSessionButton = sessionButtons.createEl('button', {
            text: 'Rename'
        });
        renameSessionButton.addEventListener('click', () => this.renameCurrentSession());

        const deleteSessionButton = sessionButtons.createEl('button', {
            text: 'Delete'
        });
        deleteSessionButton.addEventListener('click', () => this.deleteCurrentSession());

        // Add export/import buttons
        const exportButton = sessionButtons.createEl('button', {
            text: 'Export'
        });
        exportButton.addEventListener('click', () => this.exportCurrentSession());

        const importButton = sessionButtons.createEl('button', {
            text: 'Import'
        });
        importButton.addEventListener('click', () => this.importSession());

        // Session selector change handler
        this.sessionSelector.addEventListener('change', () => {
            this.plugin.settings.activeSessionId = this.sessionSelector.value;
            this.plugin.saveSettings();
            this.loadSession(this.sessionSelector.value);
            this.updateSessionMetadata();
        });

        // Messages container
        this.messagesContainer = contentEl.createDiv('ai-chat-messages');

        // Initialize components
        this.buttonsContainer = contentEl.createDiv('ai-chat-buttons');
        const buttons = new Buttons();
        this.commands = new Commands(
            this.app,
            this.plugin,
            this.messagesContainer,
            () => this.prompt.setState({ isDisabled: false, isSending: false })
        );
        this.prompt = new Prompt(this.app, buttons, this.commands);

        // Input container
        this.inputContainer = contentEl.createDiv('ai-chat-input-container');
        this.inputContainer.appendChild(this.prompt.getContainer());

        // Load or create initial session
        if (this.plugin.settings.activeSessionId) {
            this.loadSession(this.plugin.settings.activeSessionId);
        } else {
            this.createNewSession();
        }

        // Register event handler for settings
        this.registerEvent(
            this.app.workspace.on('ai-assistant:open-settings', () => {
                const settingsModal = new SettingsModal(this.app, this.plugin);
                settingsModal.open();
            })
        );
    }

    private updateSessionSelector() {
        this.sessionSelector.empty();
        const { sessions } = this.plugin.settings;
        sessions.forEach(session => {
            const option = this.sessionSelector.createEl('option', {
                value: session.id,
                text: session.name
            });
            if (session.id === this.plugin.settings.activeSessionId) {
                option.selected = true;
            }
        });
    }

    private updateSessionMetadata() {
        const metadataContainer = this.contentEl.querySelector('.ai-chat-session-metadata');
        if (!metadataContainer) return;

        metadataContainer.empty();
        
        const sessionId = this.plugin.settings.activeSessionId;
        if (!sessionId) return;

        const session = this.plugin.settings.sessions.find(s => s.id === sessionId);
        if (!session) return;

        const created = new Date(session.created).toLocaleString();
        const lastUpdated = new Date(session.lastUpdated).toLocaleString();
        
        metadataContainer.createSpan({
            text: `Created: ${created}`
        });
        metadataContainer.createSpan({
            text: ` • Last updated: ${lastUpdated}`
        });
    }

    private async createNewSession() {
        const now = new Date();
        const year = now.getFullYear();
        const month = (now.getMonth() + 1).toString().padStart(2, '0');
        const day = now.getDate().toString().padStart(2, '0');
        let hours = now.getHours();
        const minutes = now.getMinutes().toString().padStart(2, '0');
        const ampm = hours >= 12 ? ' PM' : ' AM';
        hours = hours % 12;
        hours = hours ? hours : 12; // the hour '0' should be '12'
        const time = `${hours.toString().padStart(2, '0')}:${minutes}${ampm}`;

        const defaultName = `${year}-${month}-${day}_${time}`;
        
        const session: ChatSession = {
            id: crypto.randomUUID(),
            name: defaultName,
            created: Date.now(),
            lastUpdated: Date.now(),
            messages: []
        };

        // Prune old sessions if we're at the limit
        if (this.plugin.settings.sessions.length >= this.plugin.settings.maxSessions) {
            this.plugin.settings.sessions = this.plugin.settings.sessions
                .sort((a, b) => b.lastUpdated - a.lastUpdated)
                .slice(0, this.plugin.settings.maxSessions - 1);
        }

        this.plugin.settings.sessions.push(session);
        this.plugin.settings.activeSessionId = session.id;
        await this.plugin.saveSettings();
        
        this.updateSessionSelector();
        this.updateSessionMetadata();
        this.messagesContainer.empty();
        // No welcome message; start with a blank chat for new sessions
    }

    private async renameCurrentSession() {
        const sessionId = this.plugin.settings.activeSessionId;
        if (!sessionId) return;

        const session = this.plugin.settings.sessions.find(s => s.id === sessionId);
        if (!session) return;

        const modal = new Modal(this.app);
        modal.titleEl.setText('Rename Session');
        
        const contentEl = modal.contentEl;
        const inputEl = contentEl.createEl('input', {
            type: 'text',
            value: session.name
        });
        
        const buttonContainer = contentEl.createDiv('modal-button-container');
        const saveButton = buttonContainer.createEl('button', {
            text: 'Save'
        });
        saveButton.addEventListener('click', async () => {
            session.name = inputEl.value;
            session.lastUpdated = Date.now();
            await this.plugin.saveSettings();
            this.updateSessionSelector();
            this.updateSessionMetadata();
            modal.close();
        });

        const cancelButton = buttonContainer.createEl('button', {
            text: 'Cancel'
        });
        cancelButton.addEventListener('click', () => modal.close());

        modal.open();
    }

    private async deleteCurrentSession() {
        const sessionId = this.plugin.settings.activeSessionId;
        if (!sessionId) return;

        const confirmModal = new Modal(this.app);
        confirmModal.titleEl.setText('Delete Session');
        
        const contentEl = confirmModal.contentEl;
        contentEl.setText('Are you sure you want to delete this chat session? This cannot be undone.');
        
        const buttonContainer = contentEl.createDiv('modal-button-container');
        const deleteButton = buttonContainer.createEl('button', {
            text: 'Delete',
            cls: 'mod-warning'
        });
        deleteButton.addEventListener('click', async () => {
            this.plugin.settings.sessions = this.plugin.settings.sessions.filter(s => s.id !== sessionId);
            
            // Set active session to the most recent one or create new
            if (this.plugin.settings.sessions.length > 0) {
                this.plugin.settings.activeSessionId = this.plugin.settings.sessions[0].id;
                this.loadSession(this.plugin.settings.activeSessionId);
            } else {
                this.plugin.settings.activeSessionId = undefined;
                await this.createNewSession();
            }
            
            await this.plugin.saveSettings();
            this.updateSessionSelector();
            this.updateSessionMetadata();
            confirmModal.close();
        });

        const cancelButton = buttonContainer.createEl('button', {
            text: 'Cancel'
        });
        cancelButton.addEventListener('click', () => confirmModal.close());

        confirmModal.open();
    }

    private async exportCurrentSession() {
        const sessionId = this.plugin.settings.activeSessionId;
        if (!sessionId) return;

        const session = this.plugin.settings.sessions.find(s => s.id === sessionId);
        if (!session) return;

        const exportData = JSON.stringify(session, null, 2);
        const blob = new Blob([exportData], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `${session.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    private async importSession() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        
        input.addEventListener('change', async () => {
            const file = input.files?.[0];
            if (!file) return;

            try {
                const text = await file.text();
                const session: ChatSession = JSON.parse(text);

                // Validate the imported data
                if (!session.id || !session.name || !session.created || !session.lastUpdated || !Array.isArray(session.messages)) {
                    throw new Error('Invalid session data');
                }

                // Generate a new ID to avoid conflicts
                session.id = crypto.randomUUID();
                
                // Update timestamps
                session.lastUpdated = Date.now();

                // Prune old sessions if needed
                if (this.plugin.settings.sessions.length >= this.plugin.settings.maxSessions) {
                    this.plugin.settings.sessions = this.plugin.settings.sessions
                        .sort((a, b) => b.lastUpdated - a.lastUpdated)
                        .slice(0, this.plugin.settings.maxSessions - 1);
                }

                // Add the imported session
                this.plugin.settings.sessions.push(session);
                this.plugin.settings.activeSessionId = session.id;
                await this.plugin.saveSettings();
                
                this.updateSessionSelector();
                this.updateSessionMetadata();
                this.loadSession(session.id);
                
                new Notice('Session imported successfully');
            } catch (error) {
                new Notice('Failed to import session: ' + error.message);
            }
        });

        input.click();
    }

    private loadSession(sessionId: string) {
        const session = this.plugin.settings.sessions.find(s => s.id === sessionId);
        if (!session) return;

        this.messagesContainer.empty();
        session.messages.forEach(msg => {
            // Only add user and assistant messages, skip system messages
            if (msg.role !== 'system') {
                this.addMessage(msg.role as 'user' | 'assistant', msg.content);
            }
        });
    }

    private addMessage(role: 'user' | 'assistant', content: string) {
        const MessageClass = role === 'user' ? UserMessage : BotMessage;
        const messageComponent = new MessageClass(this.app, this.plugin, content);
        const messageEl = messageComponent.getElement();
        this.messagesContainer.appendChild(messageEl);
        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;

        // Update session with new message
        if (this.plugin.settings.autoSaveSessions && this.plugin.settings.activeSessionId) {
            const session = this.plugin.settings.sessions.find(s => s.id === this.plugin.settings.activeSessionId);
            if (session) {
                session.messages.push({ role, content });
                session.lastUpdated = Date.now();
                this.plugin.saveSettings();
            }
        }
    }

    async onClose() {
        // Clean up active processes
        this.commands.stopGeneration();
    }
}
