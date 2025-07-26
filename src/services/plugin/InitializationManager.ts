/**
 * @file InitializationManager.ts
 * 
 * Initialization Manager for handling plugin startup and shutdown.
 * Extracted from main plugin to follow single responsibility principle.
 */

import { App, Plugin } from 'obsidian';
import { IInitializationManager, IEventBus } from '../interfaces';
import { DIContainer, ServiceRegistry } from '../../utils/dependencyInjection';
import { ServiceFactory } from '../ServiceFactory';
import { globalEventBus } from '../../utils/eventBus';
import type MyPlugin from '../../main';
import type { MyPluginSettings } from '../../types';

export interface InitializationConfig {
    enableBackupManager?: boolean;
    enableAgentMode?: boolean;
    enablePriority3Optimizations?: boolean;
    enableRecentlyOpenedFiles?: boolean;
    enableTestCommands?: boolean;
}

/**
 * Manages the initialization and cleanup of plugin components
 */
export class InitializationManager implements IInitializationManager {
    private isInitialized = false;
    private initializationOrder: string[] = [];
    private cleanupTasks: Array<() => Promise<void>> = [];

    constructor(
        private app: App,
        private plugin: MyPlugin,
        private container: DIContainer,
        private eventBus: IEventBus,
        private config: InitializationConfig = {}
    ) {}

    /**
     * Initializes core services and dependencies
     */
    async initializeCore(): Promise<void> {
        if (this.isInitialized) {
            throw new Error('InitializationManager already initialized');
        }

        try {
            this.eventBus.publish('initialization.started', {
                phase: 'core',
                timestamp: Date.now()
            });

            // Register core services with DI container
            await this.registerCoreServices();

            // Initialize service registry
            await this.initializeServiceRegistry();

            // Initialize backup manager if enabled
            if (this.config.enableBackupManager !== false) {
                await this.initializeBackupManager();
            }

            // Initialize agent mode manager if enabled
            if (this.config.enableAgentMode !== false) {
                await this.initializeAgentModeManager();
            }

            // Initialize AI dispatcher replacement
            await this.initializeAIService();

            // Initialize Priority 3 optimizations if enabled
            if (this.config.enablePriority3Optimizations !== false) {
                await this.initializePriority3Optimizations();
            }

            // Initialize recently opened files manager if enabled
            if (this.config.enableRecentlyOpenedFiles !== false) {
                await this.initializeRecentlyOpenedFilesManager();
            }

            this.eventBus.publish('initialization.core_completed', {
                services: this.initializationOrder,
                timestamp: Date.now()
            });

        } catch (error: any) {
            this.eventBus.publish('initialization.failed', {
                phase: 'core',
                error: error.message,
                timestamp: Date.now()
            });
            throw error;
        }
    }

    /**
     * Initializes views and UI components
     */
    async initializeViews(): Promise<void> {
        try {
            this.eventBus.publish('initialization.started', {
                phase: 'views',
                timestamp: Date.now()
            });

            // Register view types
            await this.registerViews();

            // Setup workspace event listeners
            await this.setupWorkspaceEvents();

            this.eventBus.publish('initialization.views_completed', {
                timestamp: Date.now()
            });

        } catch (error: any) {
            this.eventBus.publish('initialization.failed', {
                phase: 'views',
                error: error.message,
                timestamp: Date.now()
            });
            throw error;
        }
    }

    /**
     * Initializes commands and keyboard shortcuts
     */
    async initializeCommands(): Promise<void> {
        try {
            this.eventBus.publish('initialization.started', {
                phase: 'commands',
                timestamp: Date.now()
            });

            // Register all plugin commands
            await this.registerCommands();

            // Register YAML attribute commands
            await this.registerYAMLCommands();

            // Register test commands if in debug mode
            if (this.config.enableTestCommands && this.plugin.settings.debugMode) {
                await this.registerTestCommands();
            }

            // Register markdown processors
            await this.registerMarkdownProcessors();

            this.isInitialized = true;

            this.eventBus.publish('initialization.commands_completed', {
                timestamp: Date.now()
            });

            this.eventBus.publish('initialization.completed', {
                totalServices: this.initializationOrder.length,
                duration: Date.now(),
                timestamp: Date.now()
            });

        } catch (error: any) {
            this.eventBus.publish('initialization.failed', {
                phase: 'commands',
                error: error.message,
                timestamp: Date.now()
            });
            throw error;
        }
    }

    /**
     * Performs cleanup when plugin is unloaded
     */
    async cleanup(): Promise<void> {
        if (!this.isInitialized) {
            return;
        }

        try {
            this.eventBus.publish('cleanup.started', {
                timestamp: Date.now()
            });

            // Execute cleanup tasks in reverse order
            for (const cleanupTask of this.cleanupTasks.reverse()) {
                try {
                    await cleanupTask();
                } catch (error) {
                    console.warn('Error during cleanup:', error);
                }
            }

            // Dispose services
            await this.disposeServices();

            // Clear registrations
            this.clearRegistrations();

            this.isInitialized = false;

            this.eventBus.publish('cleanup.completed', {
                timestamp: Date.now()
            });

        } catch (error: any) {
            this.eventBus.publish('cleanup.failed', {
                error: error.message,
                timestamp: Date.now()
            });
            throw error;
        }
    }

    /**
     * Gets initialization status
     */
    getInitializationStatus(): {
        isInitialized: boolean;
        initializedServices: string[];
        config: InitializationConfig;
    } {
        return {
            isInitialized: this.isInitialized,
            initializedServices: [...this.initializationOrder],
            config: { ...this.config }
        };
    }

    /**
     * Registers core services with the DI container
     */
    private async registerCoreServices(): Promise<void> {
        // Register Obsidian core services
        this.container.registerSingleton('app', () => this.app);
        this.container.registerSingleton('plugin', () => this.plugin);
        this.container.registerSingleton('vault', () => this.app.vault);
        this.container.registerSingleton('workspace', () => this.app.workspace);
        this.container.registerSingleton('eventBus', () => this.eventBus);

        this.initializationOrder.push('app', 'plugin', 'vault', 'workspace', 'eventBus');
    }

    /**
     * Initializes the service registry with new architecture services
     */
    private async initializeServiceRegistry(): Promise<void> {
        const serviceRegistry = new ServiceRegistry(this.container);
        
        // Register core services
        serviceRegistry.registerCoreServices();
        
        this.container.registerSingleton('serviceRegistry', () => serviceRegistry);
        this.initializationOrder.push('serviceRegistry');
    }

    /**
     * Initializes the backup manager
     */
    private async initializeBackupManager(): Promise<void> {
        const { BackupManager } = await import('../../components/BackupManager');
        const pluginDataPath = this.app.vault.configDir + '/plugins/ai-assistant-for-obsidian';
        
        const backupManager = new BackupManager(this.app, pluginDataPath);
        await backupManager.initialize();
        
        (this.plugin as any).backupManager = backupManager;
        this.container.registerSingleton('backupManager', () => backupManager);
        
        this.initializationOrder.push('backupManager');
        this.cleanupTasks.push(async () => {
            // Backup manager cleanup if needed
        });
    }

    /**
     * Initializes the agent mode manager
     */
    private async initializeAgentModeManager(): Promise<void> {
        const { AgentModeManager } = await import('../../components/agent/agentModeManager');
        
        const agentModeManager = new AgentModeManager(
            this.plugin.settings,
            () => this.plugin.saveSettings(),
            () => (this.plugin as any).emitSettingsChange(),
            (level: string, ...args: any[]) => this.plugin.debugLog(level as any, ...args)
        );
        
        (this.plugin as any).agentModeManager = agentModeManager;
        this.container.registerSingleton('agentModeManager', () => agentModeManager);
        
        this.initializationOrder.push('agentModeManager');
    }

    /**
     * Initializes the new AI service to replace AIDispatcher
     */
    private async initializeAIService(): Promise<void> {
        const aiService = ServiceFactory.createAIService(
            this.eventBus,
            this.plugin.settings,
            () => this.plugin.saveSettings()
        );
        
        (this.plugin as any).aiDispatcher = aiService; // Maintain compatibility
        this.container.registerSingleton('aiService', () => aiService);
        
        this.initializationOrder.push('aiService');
        this.cleanupTasks.push(async () => {
            aiService.dispose();
        });
    }

    /**
     * Initializes Priority 3 optimizations
     */
    private async initializePriority3Optimizations(): Promise<void> {
        try {
            const { Priority3IntegrationManager } = await import('../../integration/priority3Integration');
            
            const priority3Manager = new Priority3IntegrationManager(this.plugin);
            await priority3Manager.initialize();
            
            (this.plugin as any).priority3Manager = priority3Manager;
            this.container.registerSingleton('priority3Manager', () => priority3Manager);
            
            this.initializationOrder.push('priority3Manager');
            this.cleanupTasks.push(async () => {
                priority3Manager.dispose();
            });
        } catch (error) {
            console.warn('Failed to initialize Priority 3 optimizations:', error);
        }
    }

    /**
     * Initializes recently opened files manager
     */
    private async initializeRecentlyOpenedFilesManager(): Promise<void> {
        try {
            const { RecentlyOpenedFilesManager } = await import('../../utils/recently-opened-files');
            
            const recentlyOpenedFilesManager = RecentlyOpenedFilesManager.getInstance(this.app);
            
            (this.plugin as any).recentlyOpenedFilesManager = recentlyOpenedFilesManager;
            this.container.registerSingleton('recentlyOpenedFilesManager', () => recentlyOpenedFilesManager);
            
            this.initializationOrder.push('recentlyOpenedFilesManager');
            this.cleanupTasks.push(async () => {
                recentlyOpenedFilesManager.destroy();
            });
        } catch (error) {
            console.warn('Failed to initialize recently opened files manager:', error);
        }
    }

    /**
     * Registers plugin views
     */
    private async registerViews(): Promise<void> {
        const { ChatView, VIEW_TYPE_CHAT } = await import('../../chat');
        const { ModelSettingsView } = await import('../../components/ModelSettingsView');
        const { VIEW_TYPE_MODEL_SETTINGS } = await import('../../components/commands/viewCommands');

        // Register views with Obsidian
        this.plugin.registerView(VIEW_TYPE_CHAT, (leaf) => new ChatView(leaf, this.plugin));
        this.plugin.registerView(VIEW_TYPE_MODEL_SETTINGS, (leaf) => new ModelSettingsView(leaf, this.plugin));
    }

    /**
     * Sets up workspace event listeners
     */
    private async setupWorkspaceEvents(): Promise<void> {
        // Auto-open model settings if configured
        // Note: onLayoutReady returns void, so we'll handle this differently
        if (this.plugin.settings.autoOpenModelSettings) {
            // Use a timeout to ensure layout is ready
            setTimeout(() => {
                const { activateView } = require('../../utils/viewManager');
                const { VIEW_TYPE_MODEL_SETTINGS } = require('../../components/commands/viewCommands');
                activateView(this.app, VIEW_TYPE_MODEL_SETTINGS);
            }, 100);
        }
    }

    /**
     * Registers plugin commands
     */
    private async registerCommands(): Promise<void> {
        const { registerAllCommands } = await import('../../components/commands/commandRegistry');
        
        (this.plugin as any)._yamlAttributeCommandIds = registerAllCommands(
            this.plugin,
            this.plugin.settings,
            (messages: any[]) => (this.plugin as any).processMessages(messages),
            (messages: any[]) => (this.plugin as any).activateChatViewAndLoadMessages(messages),
            { current: (this.plugin as any).activeStream },
            (stream: AbortController | null) => { (this.plugin as any).activeStream = stream; },
            (this.plugin as any)._yamlAttributeCommandIds || []
        );
    }

    /**
     * Registers YAML attribute commands
     */
    private async registerYAMLCommands(): Promise<void> {
        const { registerYamlAttributeCommands } = await import('../../YAMLHandler');
        
        (this.plugin as any)._yamlAttributeCommandIds = registerYamlAttributeCommands(
            this.plugin,
            this.plugin.settings,
            (messages: any[]) => (this.plugin as any).processMessages(messages),
            (this.plugin as any)._yamlAttributeCommandIds || [],
            (level: string, ...args: any[]) => this.plugin.debugLog(level as any, ...args)
        );
    }

    /**
     * Registers test commands for debugging
     */
    private async registerTestCommands(): Promise<void> {
        try {
            const { registerTestCommands } = await import('../../../tests/testRunner');
            registerTestCommands(this.plugin);
        } catch (error) {
            console.warn('Failed to register test commands:', error);
        }
    }

    /**
     * Registers markdown processors
     */
    private async registerMarkdownProcessors(): Promise<void> {
        // Register tool execution block processor
        this.plugin.registerMarkdownPostProcessor((element, context) => {
            (this.plugin as any).processToolExecutionBlocks(element, context);
        });

        // Register code block processor
        this.plugin.registerMarkdownCodeBlockProcessor("ai-tool-execution", (source, el, ctx) => {
            (this.plugin as any).processToolExecutionCodeBlock(source, el, ctx);
        });

    }

    /**
     * Disposes all registered services
     */
    private async disposeServices(): Promise<void> {
        // Dispose DI container
        this.container.dispose();

        // Clear service registry
        const { ServiceRegistry } = await import('../ServiceFactory');
        ServiceRegistry.clear();
    }

    /**
     * Clears all registrations
     */
    private clearRegistrations(): Promise<void> {
        this.initializationOrder = [];
        this.cleanupTasks = [];
        return Promise.resolve();
    }
}