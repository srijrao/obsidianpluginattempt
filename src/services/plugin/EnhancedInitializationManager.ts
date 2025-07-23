/**
 * @file EnhancedInitializationManager.ts
 * 
 * Phase 6: Enhanced Initialization Manager that integrates all architectural layers:
 * - Cross-cutting services (Phase 5)
 * - Agent services (Phase 4) 
 * - Event-driven communication (Phase 2)
 * - Service foundation (Phase 1)
 * 
 * This manager provides unified initialization with comprehensive error handling,
 * performance monitoring, and graceful service integration.
 */

import { App, Plugin } from 'obsidian';
import { IInitializationManager, IEventBus } from '../interfaces';
import { DIContainer, ServiceRegistry } from '../../utils/dependencyInjection';
import { ServiceFactory } from '../ServiceFactory';
import { globalEventBus } from '../../utils/eventBus';
import type MyPlugin from '../../main';
import type { MyPluginSettings } from '../../types';

// Cross-cutting services imports
import { CrossCuttingServicesHub } from '../crosscutting/CrossCuttingServicesHub';
import { CentralizedLogger, ScopedLogger } from '../crosscutting/CentralizedLogger';
import { MonitoringService } from '../crosscutting/MonitoringService';
import { SecurityManager } from '../crosscutting/SecurityManager';
import { ConfigurationService } from '../crosscutting/ConfigurationService';

// Agent services imports
import { AgentOrchestrator } from '../agent/AgentOrchestrator';
import { CommandProcessor } from '../agent/CommandProcessor';
import { ToolExecutionEngine } from '../agent/ToolExecutionEngine';
import { ToolDisplayManager } from '../agent/ToolDisplayManager';
import { ExecutionLimitManager } from '../agent/ExecutionLimitManager';

export interface EnhancedInitializationConfig {
    // Cross-cutting service configuration
    enableCrossCuttingServices?: boolean;
    enableCentralizedLogging?: boolean;
    enableMonitoring?: boolean;
    enableSecurity?: boolean;
    enableConfiguration?: boolean;
    
    // Agent service configuration  
    enableAgentServices?: boolean;
    enableToolExecution?: boolean;
    enableCommandProcessing?: boolean;
    enableExecutionLimits?: boolean;
    
    // Legacy service configuration
    enableBackupManager?: boolean;
    enableAgentMode?: boolean;
    enablePriority3Optimizations?: boolean;
    enableRecentlyOpenedFiles?: boolean;
    enableTestCommands?: boolean;
    
    // Performance configuration
    maxInitializationTime?: number;
    enablePerformanceMonitoring?: boolean;
    enableMemoryTracking?: boolean;
}

interface InitializationMetrics {
    startTime: number;
    coreServicesTime?: number;
    crossCuttingTime?: number;
    agentServicesTime?: number;
    viewsTime?: number;
    commandsTime?: number;
    totalTime?: number;
    memoryUsage?: {
        initial: number;
        final: number;
        peak: number;
    };
    servicesInitialized: string[];
    errors: Array<{ service: string; error: string; timestamp: number }>;
}

/**
 * Enhanced initialization manager for Phase 6 system integration
 */
export class EnhancedInitializationManager implements IInitializationManager {
    private isInitialized = false;
    private initializationOrder: string[] = [];
    private cleanupTasks: Array<() => Promise<void>> = [];
    private metrics: InitializationMetrics;
    private logger: ScopedLogger;
    
    // Service references for integration
    private crossCuttingHub: CrossCuttingServicesHub | null = null;
    private agentOrchestrator: AgentOrchestrator | null = null;

    constructor(
        private app: App,
        private plugin: MyPlugin,
        private container: DIContainer,
        private eventBus: IEventBus,
        private config: EnhancedInitializationConfig = {}
    ) {
        this.metrics = {
            startTime: Date.now(),
            servicesInitialized: [],
            errors: []
        };
        
        // Initialize temporary logger until centralized logging is available
        this.logger = new ScopedLogger(new CentralizedLogger(this.eventBus), 'EnhancedInitializationManager');
    }

    /**
     * Phase 6: Enhanced core initialization with integrated services
     */
    async initializeCore(): Promise<void> {
        if (this.isInitialized) {
            throw new Error('EnhancedInitializationManager already initialized');
        }

        const startTime = Date.now();
        this.trackMemoryUsage('initial');

        try {
            this.eventBus.publish('initialization.started', {
                phase: 'core',
                timestamp: startTime,
                config: this.config
            });

            this.logger.info('Starting Phase 6 core initialization', {
                enabledServices: this.getEnabledServices()
            });

            // Step 1: Register fundamental services
            await this.registerCoreServices();
            
            // Step 2: Initialize cross-cutting services hub (Phase 5 integration)
            if (this.config.enableCrossCuttingServices !== false) {
                await this.initializeCrossCuttingServices();
            }
            
            // Step 3: Initialize agent services (Phase 4 integration)
            if (this.config.enableAgentServices !== false) {
                await this.initializeAgentServices();
            }
            
            // Step 4: Initialize legacy services for compatibility
            await this.initializeLegacyServices();

            this.metrics.coreServicesTime = Date.now() - startTime;
            this.trackMemoryUsage('peak');

            this.eventBus.publish('initialization.core_completed', {
                services: this.initializationOrder,
                timestamp: Date.now(),
                duration: this.metrics.coreServicesTime,
                memoryUsage: this.metrics.memoryUsage
            });

            this.logger.info('Core initialization completed successfully', {
                servicesCount: this.initializationOrder.length,
                duration: this.metrics.coreServicesTime,
                services: this.initializationOrder
            });

        } catch (error: any) {
            this.recordError('core_initialization', error);
            this.eventBus.publish('initialization.failed', {
                phase: 'core',
                error: error.message,
                timestamp: Date.now(),
                metrics: this.metrics
            });
            
            this.logger.error('Core initialization failed', {
                error: error.message,
                stack: error.stack,
                metrics: this.metrics
            });
            
            throw error;
        }
    }

    /**
     * Initialize cross-cutting services hub and all related services
     */
    private async initializeCrossCuttingServices(): Promise<void> {
        const startTime = Date.now();
        
        try {
            this.logger.info('Initializing cross-cutting services');

            // Initialize the hub that coordinates all cross-cutting services
            // The hub will initialize individual services internally
            this.crossCuttingHub = new CrossCuttingServicesHub(
                this.eventBus
            );
            
            // Get initialized services from the hub
            const centralizedLogger = this.crossCuttingHub.getLogger();
            const monitoringService = this.crossCuttingHub.getMonitoring();
            const securityManager = this.crossCuttingHub.getSecurity();
            const configurationService = this.crossCuttingHub.getConfiguration();

            // Register services in DI container
            this.container.registerSingleton('centralizedLogger', () => centralizedLogger);
            this.container.registerSingleton('monitoringService', () => monitoringService);
            this.container.registerSingleton('securityManager', () => securityManager);
            this.container.registerSingleton('configurationService', () => configurationService);
            this.container.registerSingleton('crossCuttingHub', () => this.crossCuttingHub);

            // Replace temporary logger with centralized one
            this.logger = centralizedLogger.createScopedLogger('EnhancedInitializationManager');

            this.addToInitializationOrder([
                'centralizedLogger',
                'monitoringService', 
                'securityManager',
                'configurationService',
                'crossCuttingHub'
            ]);

            this.metrics.crossCuttingTime = Date.now() - startTime;

            this.logger.info('Cross-cutting services initialized successfully', {
                duration: this.metrics.crossCuttingTime,
                services: ['centralizedLogger', 'monitoringService', 'securityManager', 'configurationService', 'crossCuttingHub']
            });

        } catch (error: any) {
            this.recordError('cross_cutting_services', error);
            throw new Error(`Failed to initialize cross-cutting services: ${error.message}`);
        }
    }

    /**
     * Initialize agent services with cross-cutting integration
     */
    private async initializeAgentServices(): Promise<void> {
        const startTime = Date.now();
        
        if (!this.crossCuttingHub) {
            throw new Error('Cross-cutting services must be initialized before agent services');
        }

        try {
            this.logger.info('Initializing agent services with cross-cutting integration');

            const logger = this.crossCuttingHub.getLogger();
            const monitoring = this.crossCuttingHub.getMonitoring();
            const security = this.crossCuttingHub.getSecurity();

            // Initialize agent services with cross-cutting dependencies
            const commandProcessor = new CommandProcessor(this.plugin);

            const toolExecutionEngine = new ToolExecutionEngine(
                this.app,
                this.plugin,
                this.eventBus
            );

            const toolDisplayManager = new ToolDisplayManager(this.eventBus);

            const executionLimitManager = new ExecutionLimitManager(this.eventBus);

            const agentOrchestrator = new AgentOrchestrator(
                this.app,
                commandProcessor,
                toolExecutionEngine,
                executionLimitManager,
                toolDisplayManager,
                this.eventBus
            );

            this.agentOrchestrator = agentOrchestrator;

            // Register services in DI container
            this.container.registerSingleton('commandProcessor', () => commandProcessor);
            this.container.registerSingleton('toolExecutionEngine', () => toolExecutionEngine);
            this.container.registerSingleton('toolDisplayManager', () => toolDisplayManager);
            this.container.registerSingleton('executionLimitManager', () => executionLimitManager);
            this.container.registerSingleton('agentOrchestrator', () => agentOrchestrator);

            // Add services to plugin for external access
            (this.plugin as any).commandProcessor = commandProcessor;
            (this.plugin as any).toolExecutionEngine = toolExecutionEngine;
            (this.plugin as any).toolDisplayManager = toolDisplayManager;
            (this.plugin as any).executionLimitManager = executionLimitManager;
            (this.plugin as any).agentOrchestrator = agentOrchestrator;

            this.addToInitializationOrder([
                'commandProcessor',
                'toolExecutionEngine',
                'toolDisplayManager', 
                'executionLimitManager',
                'agentOrchestrator'
            ]);

            this.metrics.agentServicesTime = Date.now() - startTime;

            this.logger.info('Agent services initialized successfully', {
                duration: this.metrics.agentServicesTime,
                services: ['commandProcessor', 'toolExecutionEngine', 'toolDisplayManager', 'executionLimitManager', 'agentOrchestrator']
            });

        } catch (error: any) {
            this.recordError('agent_services', error);
            throw new Error(`Failed to initialize agent services: ${error.message}`);
        }
    }

    /**
     * Initialize legacy services for backward compatibility
     */
    private async initializeLegacyServices(): Promise<void> {
        try {
            this.logger.info('Initializing legacy services for compatibility');

            // Initialize service registry
            if (this.config.enableBackupManager !== false) {
                await this.initializeServiceRegistry();
            }

            // Initialize backup manager
            if (this.config.enableBackupManager !== false) {
                await this.initializeBackupManager();
            }

            // Initialize agent mode manager
            if (this.config.enableAgentMode !== false) {
                await this.initializeAgentModeManager();
            }

            // Initialize AI dispatcher replacement
            await this.initializeAIService();

            // Initialize Priority 3 optimizations
            if (this.config.enablePriority3Optimizations !== false) {
                await this.initializePriority3Optimizations();
            }

            // Initialize recently opened files manager
            if (this.config.enableRecentlyOpenedFiles !== false) {
                await this.initializeRecentlyOpenedFilesManager();
            }

            this.logger.info('Legacy services initialized successfully');

        } catch (error: any) {
            this.recordError('legacy_services', error);
            // Don't throw - legacy services are optional
            this.logger.warn('Some legacy services failed to initialize', { error: error.message });
        }
    }

    /**
     * Enhanced views initialization with monitoring
     */
    async initializeViews(): Promise<void> {
        const startTime = Date.now();

        try {
            this.eventBus.publish('initialization.started', {
                phase: 'views',
                timestamp: startTime
            });

            this.logger.info('Initializing views and UI components');

            // Register view types
            await this.registerViews();

            // Setup workspace event listeners
            await this.setupWorkspaceEvents();

            this.metrics.viewsTime = Date.now() - startTime;

            this.eventBus.publish('initialization.views_completed', {
                timestamp: Date.now(),
                duration: this.metrics.viewsTime
            });

            this.logger.info('Views initialized successfully', {
                duration: this.metrics.viewsTime
            });

        } catch (error: any) {
            this.recordError('views', error);
            this.eventBus.publish('initialization.failed', {
                phase: 'views',
                error: error.message,
                timestamp: Date.now()
            });
            
            this.logger.error('Views initialization failed', { error: error.message });
            throw error;
        }
    }

    /**
     * Enhanced commands initialization with monitoring
     */
    async initializeCommands(): Promise<void> {
        const startTime = Date.now();

        try {
            this.eventBus.publish('initialization.started', {
                phase: 'commands',
                timestamp: startTime
            });

            this.logger.info('Initializing commands and keyboard shortcuts');

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
            this.metrics.commandsTime = Date.now() - startTime;
            this.metrics.totalTime = Date.now() - this.metrics.startTime;
            this.trackMemoryUsage('final');

            this.eventBus.publish('initialization.commands_completed', {
                timestamp: Date.now(),
                duration: this.metrics.commandsTime
            });

            this.eventBus.publish('initialization.completed', {
                totalServices: this.initializationOrder.length,
                totalDuration: this.metrics.totalTime,
                metrics: this.metrics,
                timestamp: Date.now()
            });

            this.logger.info('Commands and system initialization completed successfully', {
                duration: this.metrics.commandsTime,
                totalDuration: this.metrics.totalTime,
                totalServices: this.initializationOrder.length,
                metrics: this.metrics
            });

            // Log system status after initialization
            if (this.crossCuttingHub) {
                const systemStatus = this.crossCuttingHub.getSystemStatus();
                this.logger.info('System status after initialization', systemStatus);
            }

        } catch (error: any) {
            this.recordError('commands', error);
            this.eventBus.publish('initialization.failed', {
                phase: 'commands',
                error: error.message,
                timestamp: Date.now(),
                metrics: this.metrics
            });
            
            this.logger.error('Commands initialization failed', { 
                error: error.message,
                metrics: this.metrics
            });
            
            throw error;
        }
    }

    /**
     * Enhanced cleanup with comprehensive service disposal
     */
    async cleanup(): Promise<void> {
        try {
            this.logger.info('Starting system cleanup', {
                servicesCount: this.initializationOrder.length,
                cleanupTasksCount: this.cleanupTasks.length
            });

            this.eventBus.publish('cleanup.started', {
                timestamp: Date.now(),
                services: this.initializationOrder
            });

            // Execute cleanup tasks in reverse order
            for (const cleanupTask of this.cleanupTasks.reverse()) {
                try {
                    await cleanupTask();
                } catch (error: any) {
                    this.logger.warn('Cleanup task failed', { error: error.message });
                }
            }

            // Dispose cross-cutting services
            if (this.crossCuttingHub) {
                // Export final metrics and logs before disposal
                const finalMetrics = this.crossCuttingHub.getMonitoring().exportMetrics();
                const finalLogs = this.crossCuttingHub.getLogger().exportLogs();
                
                this.logger.info('Final system metrics', { metrics: finalMetrics });
                this.logger.info('Cleanup completed successfully', {
                    metricsExported: Object.keys(finalMetrics).length,
                    logsExported: finalLogs.length
                });
                
                // Note: CrossCuttingServicesHub doesn't have dispose method yet
                // This would be added in a future iteration
                // await this.crossCuttingHub.dispose();
            }

            this.eventBus.publish('cleanup.completed', {
                timestamp: Date.now(),
                duration: Date.now() - this.metrics.startTime
            });

            this.isInitialized = false;
            this.initializationOrder = [];
            this.cleanupTasks = [];

        } catch (error: any) {
            this.eventBus.publish('cleanup.failed', {
                error: error.message,
                timestamp: Date.now()
            });
            throw error;
        }
    }

    /**
     * Get comprehensive system status
     */
    getSystemStatus(): {
        isInitialized: boolean;
        initializationMetrics: InitializationMetrics;
        servicesStatus: { [key: string]: any };
        systemHealth: any;
    } {
        const status = {
            isInitialized: this.isInitialized,
            initializationMetrics: this.metrics,
            servicesStatus: {} as { [key: string]: any },
            systemHealth: null as any
        };

        // Get cross-cutting services status
        if (this.crossCuttingHub) {
            status.systemHealth = this.crossCuttingHub.getSystemStatus();
            status.servicesStatus.crossCutting = this.crossCuttingHub.getSystemStatus().services;
        }

        // Get agent services status  
        if (this.agentOrchestrator) {
            status.servicesStatus.agent = {
                orchestrator: 'active',
                // Could add more agent service status here
            };
        }

        return status;
    }

    // Utility methods
    private addToInitializationOrder(services: string[]): void {
        this.initializationOrder.push(...services);
        this.metrics.servicesInitialized.push(...services);
    }

    private recordError(service: string, error: Error): void {
        this.metrics.errors.push({
            service,
            error: error.message,
            timestamp: Date.now()
        });
    }

    private trackMemoryUsage(phase: 'initial' | 'peak' | 'final'): void {
        const usage = (performance as any).memory?.usedJSHeapSize || 0;
        
        if (!this.metrics.memoryUsage) {
            this.metrics.memoryUsage = { initial: 0, final: 0, peak: 0 };
        }
        
        this.metrics.memoryUsage[phase] = usage;
    }

    private getEnabledServices(): string[] {
        const enabled = [];
        
        if (this.config.enableCrossCuttingServices !== false) enabled.push('cross-cutting');
        if (this.config.enableAgentServices !== false) enabled.push('agent');
        if (this.config.enableBackupManager !== false) enabled.push('backup');
        if (this.config.enableAgentMode !== false) enabled.push('agentMode');
        if (this.config.enablePriority3Optimizations !== false) enabled.push('priority3');
        if (this.config.enableRecentlyOpenedFiles !== false) enabled.push('recentFiles');
        if (this.config.enableTestCommands) enabled.push('testCommands');
        
        return enabled;
    }

    // Legacy service initialization methods (reused from original InitializationManager)
    private async registerCoreServices(): Promise<void> {
        this.container.registerSingleton('app', () => this.app);
        this.container.registerSingleton('plugin', () => this.plugin);
        this.container.registerSingleton('vault', () => this.app.vault);
        this.container.registerSingleton('workspace', () => this.app.workspace);
        this.container.registerSingleton('eventBus', () => this.eventBus);

        this.addToInitializationOrder(['app', 'plugin', 'vault', 'workspace', 'eventBus']);
    }

    private async initializeServiceRegistry(): Promise<void> {
        const serviceRegistry = new ServiceRegistry(this.container);
        serviceRegistry.registerCoreServices();
        this.container.registerSingleton('serviceRegistry', () => serviceRegistry);
        this.addToInitializationOrder(['serviceRegistry']);
    }

    private async initializeBackupManager(): Promise<void> {
        try {
            const { BackupManager } = await import('../../components/BackupManager');
            const pluginDataPath = this.app.vault.configDir + '/plugins/ai-assistant-for-obsidian';
            
            const backupManager = new BackupManager(this.app, pluginDataPath);
            await backupManager.initialize();
            
            (this.plugin as any).backupManager = backupManager;
            this.container.registerSingleton('backupManager', () => backupManager);
            
            this.addToInitializationOrder(['backupManager']);
        } catch (error) {
            this.logger.warn('Failed to initialize backup manager', { error });
        }
    }

    private async initializeAgentModeManager(): Promise<void> {
        try {
            const { AgentModeManager } = await import('../../components/agent/agentModeManager');
            
            const agentModeManager = new AgentModeManager(
                this.plugin.settings,
                () => this.plugin.saveSettings(),
                () => (this.plugin as any).emitSettingsChange(),
                (level: string, ...args: any[]) => this.plugin.debugLog(level as any, ...args)
            );
            
            (this.plugin as any).agentModeManager = agentModeManager;
            this.container.registerSingleton('agentModeManager', () => agentModeManager);
            
            this.addToInitializationOrder(['agentModeManager']);
        } catch (error) {
            this.logger.warn('Failed to initialize agent mode manager', { error });
        }
    }

    private async initializeAIService(): Promise<void> {
        try {
            const aiService = ServiceFactory.createAIService(
                this.eventBus,
                this.plugin.settings,
                () => this.plugin.saveSettings()
            );
            
            (this.plugin as any).aiDispatcher = aiService;
            this.container.registerSingleton('aiService', () => aiService);
            
            this.addToInitializationOrder(['aiService']);
            this.cleanupTasks.push(async () => {
                aiService.dispose();
            });
        } catch (error) {
            this.logger.warn('Failed to initialize AI service', { error });
        }
    }

    private async initializePriority3Optimizations(): Promise<void> {
        try {
            const { Priority3IntegrationManager } = await import('../../integration/priority3Integration');
            
            const priority3Manager = new Priority3IntegrationManager(this.plugin);
            await priority3Manager.initialize();
            
            (this.plugin as any).priority3Manager = priority3Manager;
            this.container.registerSingleton('priority3Manager', () => priority3Manager);
            
            this.addToInitializationOrder(['priority3Manager']);
            this.cleanupTasks.push(async () => {
                priority3Manager.dispose();
            });
        } catch (error) {
            this.logger.warn('Failed to initialize Priority 3 optimizations', { error });
        }
    }

    private async initializeRecentlyOpenedFilesManager(): Promise<void> {
        try {
            const { RecentlyOpenedFilesManager } = await import('../../utils/recently-opened-files');
            
            const recentlyOpenedFilesManager = RecentlyOpenedFilesManager.getInstance(this.app);
            
            (this.plugin as any).recentlyOpenedFilesManager = recentlyOpenedFilesManager;
            this.container.registerSingleton('recentlyOpenedFilesManager', () => recentlyOpenedFilesManager);
            
            this.addToInitializationOrder(['recentlyOpenedFilesManager']);
            this.cleanupTasks.push(async () => {
                recentlyOpenedFilesManager.destroy();
            });
        } catch (error) {
            this.logger.warn('Failed to initialize recently opened files manager', { error });
        }
    }

    private async registerViews(): Promise<void> {
        try {
            const { ChatView, VIEW_TYPE_CHAT } = await import('../../chat');
            const { ModelSettingsView } = await import('../../components/ModelSettingsView');
            const { VIEW_TYPE_MODEL_SETTINGS } = await import('../../components/commands/viewCommands');

            this.plugin.registerView(VIEW_TYPE_CHAT, (leaf) => new ChatView(leaf, this.plugin));
            this.plugin.registerView(VIEW_TYPE_MODEL_SETTINGS, (leaf) => new ModelSettingsView(leaf, this.plugin));
        } catch (error) {
            this.logger.warn('Failed to register views', { error });
        }
    }

    private async setupWorkspaceEvents(): Promise<void> {
        try {
            if (this.plugin.settings.autoOpenModelSettings) {
                setTimeout(() => {
                    const { activateView } = require('../../utils/viewManager');
                    const { VIEW_TYPE_MODEL_SETTINGS } = require('../../components/commands/viewCommands');
                    activateView(this.app, VIEW_TYPE_MODEL_SETTINGS);
                }, 100);
            }
        } catch (error) {
            this.logger.warn('Failed to setup workspace events', { error });
        }
    }

    private async registerCommands(): Promise<void> {
        try {
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
        } catch (error) {
            this.logger.warn('Failed to register commands', { error });
        }
    }

    private async registerYAMLCommands(): Promise<void> {
        try {
            const { registerYamlAttributeCommands } = await import('../../YAMLHandler');
            
            (this.plugin as any)._yamlAttributeCommandIds = registerYamlAttributeCommands(
                this.plugin,
                this.plugin.settings,
                (messages: any[]) => (this.plugin as any).processMessages(messages),
                (this.plugin as any)._yamlAttributeCommandIds || [],
                (level: string, ...args: any[]) => this.plugin.debugLog(level as any, ...args)
            );
        } catch (error) {
            this.logger.warn('Failed to register YAML commands', { error });
        }
    }

    private async registerTestCommands(): Promise<void> {
        try {
            const { registerTestCommands } = await import('../../../tests/testRunner');
            registerTestCommands(this.plugin);
        } catch (error) {
            this.logger.warn('Failed to register test commands', { error });
        }
    }

    private async registerMarkdownProcessors(): Promise<void> {
        try {
            this.plugin.registerMarkdownPostProcessor((element, context) => {
                (this.plugin as any).processToolExecutionBlocks(element, context);
            });

            this.plugin.registerMarkdownCodeBlockProcessor("ai-tool-execution", (source, el, ctx) => {
                (this.plugin as any).processToolExecutionCodeBlock(source, el, ctx);
            });

            const { registerSemanticSearchCodeblock } = await import('../../components/codeblocks/SemanticSearchCodeblock');
            registerSemanticSearchCodeblock(this.plugin);
        } catch (error) {
            this.logger.warn('Failed to register markdown processors', { error });
        }
    }
}

/**
 * Factory function for creating enhanced initialization manager
 */
export function createEnhancedInitializationManager(
    app: App,
    plugin: MyPlugin,
    container: DIContainer,
    eventBus: IEventBus,
    config: EnhancedInitializationConfig = {}
): EnhancedInitializationManager {
    return new EnhancedInitializationManager(app, plugin, container, eventBus, config);
}
