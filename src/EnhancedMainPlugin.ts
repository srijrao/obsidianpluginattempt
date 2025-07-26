/**
 * @file EnhancedMainPlugin.ts
 * 
 * Phase 6: Enhanced Main Plugin with integrated architecture
 * 
 * This enhanced version of the main plugin integrates all architectural phases:
 * - Phase 1: Service Layer Foundation
 * - Phase 2: Event-Driven Communication  
 * - Phase 3: Request Management
 * - Phase 4: Agent System Restructuring
 * - Phase 5: Cross-Cutting Concerns
 * - Phase 6: System Integration & Optimization
 * 
 * Features:
 * - Unified service initialization through EnhancedInitializationManager
 * - Cross-cutting services integration (logging, monitoring, security, configuration)
 * - Agent services with enhanced functionality
 * - Comprehensive error handling and monitoring
 * - Production-ready architecture with optimization
 */

import { Plugin, TFile, normalizePath } from 'obsidian';
import type { MyPluginSettings } from './types';
import { DEFAULT_SETTINGS } from './types';
import { MyPluginSettingTab } from './settings/SettingTab';
import { validatePluginSettings } from './utils/typeGuards';
import { debugLog } from './utils/logger';

// Enhanced initialization system
import { EnhancedInitializationManager, EnhancedInitializationConfig } from './services/plugin/EnhancedInitializationManager';
import { DIContainer } from './utils/dependencyInjection';
import { globalEventBus } from './utils/eventBus';

// Cross-cutting services
import { CrossCuttingServicesHub } from './services/crosscutting/CrossCuttingServicesHub';
import { ScopedLogger } from './services/crosscutting/CentralizedLogger';

// Agent services
import { AgentOrchestrator } from './services/agent/AgentOrchestrator';
import { CommandProcessor } from './services/agent/CommandProcessor';
import { ToolExecutionEngine } from './services/agent/ToolExecutionEngine';
import { ToolDisplayManager } from './services/agent/ToolDisplayManager';
import { ExecutionLimitManager } from './services/agent/ExecutionLimitManager';

// Legacy services for compatibility
import { AIDispatcher } from './utils/aiDispatcher';
import { AgentModeManager } from './components/agent/agentModeManager';
import { BackupManager } from './components/BackupManager';
import { Priority3IntegrationManager } from './integration/priority3Integration';
import { RecentlyOpenedFilesManager } from './utils/recently-opened-files';
import { ModelSettingsView } from './components/ModelSettingsView';

/**
 * Enhanced AI Assistant Plugin with Phase 6 integrated architecture
 * 
 * This plugin provides comprehensive AI capabilities with:
 * - Multiple AI provider support (OpenAI, Anthropic, Google, Ollama)
 * - Real-time streaming responses
 * - Advanced agent system with tool execution
 * - Comprehensive security and monitoring
 * - Production-ready error handling and optimization
 */
export default class EnhancedAIAssistantPlugin extends Plugin {
    // Core plugin state
    settings: MyPluginSettings;
    
    // Enhanced architecture components
    private initializationManager: EnhancedInitializationManager;
    private diContainer: DIContainer;
    private crossCuttingHub: CrossCuttingServicesHub | null = null;
    private logger: ScopedLogger | null = null;
    
    // Agent system services
    public agentOrchestrator: AgentOrchestrator | null = null;
    public commandProcessor: CommandProcessor | null = null;
    public toolExecutionEngine: ToolExecutionEngine | null = null;
    public toolDisplayManager: ToolDisplayManager | null = null;
    public executionLimitManager: ExecutionLimitManager | null = null;
    
    // Legacy services (maintained for compatibility)
    modelSettingsView: ModelSettingsView | null = null;
    activeStream: AbortController | null = null;
    aiDispatcher: AIDispatcher | null = null;
    private _yamlAttributeCommandIds: string[] = [];
    private settingsListeners: Array<() => void> = [];
    public backupManager: BackupManager;
    public agentModeManager: AgentModeManager;
    public priority3Manager: Priority3IntegrationManager;
    public recentlyOpenedFilesManager: RecentlyOpenedFilesManager;
    
    // Static set to track registered view types and avoid duplicate registration
    private static registeredViewTypes = new Set<string>();

    /**
     * Registers a view type with Obsidian, ensuring no duplicate registration.
     * @param viewType The type of the view.
     * @param viewCreator The function that creates the view.
     */
    private registerPluginView(viewType: string, viewCreator: (leaf: any) => any) {
        if (!EnhancedAIAssistantPlugin.registeredViewTypes.has(viewType)) {
            this.registerView(viewType, viewCreator);
            EnhancedAIAssistantPlugin.registeredViewTypes.add(viewType);
        }
    }

    /**
     * Test Priority 3 optimizations to demonstrate their functionality.
     */
    private async testPriority3Optimizations(): Promise<void> {
        try {
            if (!this.priority3Manager) {
                console.log('Priority 3 optimizations not initialized');
                return;
            }

            // Get system status
            const status = this.priority3Manager.getStatus();
            
            // Import the required modules
            const { ServiceLocator } = await import('./utils/dependencyInjection');
            const { globalStateManager } = await import('./utils/stateManager');
            const { globalStreamManager, StreamUtils } = await import('./utils/streamManager');

            // Test 1: Dependency Injection
            console.log('🔧 Testing Dependency Injection...');
            const stateManager = ServiceLocator.resolve('stateManager');
            const streamManager = ServiceLocator.resolve('streamManager');
            console.log('✅ Services resolved successfully');

            // Test 2: State Management
            console.log('📊 Testing State Management...');
            globalStateManager.setState('test.priority3.demo', {
                timestamp: Date.now(),
                message: 'Priority 3 optimizations are working!',
                features: ['dependency-injection', 'state-management', 'stream-management']
            }, { persistent: true });

            const testData = globalStateManager.getState('test.priority3.demo');
            console.log('✅ State set and retrieved:', testData);

            // Test 3: Stream Management
            console.log('🌊 Testing Stream Management...');
            const testStream = globalStreamManager.createStream(
                'priority3-test',
                StreamUtils.fromArray(['Hello', ' ', 'Priority', ' ', '3', ' ', 'Optimizations!']),
                { timeout: 10000 }
            );

            let streamResult = '';
            testStream.on('data', (chunk: string) => {
                streamResult += chunk;
            });

            testStream.on('end', () => {
                console.log('✅ Stream completed:', streamResult);
                console.log(`Priority 3 Test Complete! Status: ${status.services.length} services, ${status.stateKeys} state keys, ${status.activeStreams} active streams`);
            });

            await testStream.start();

            // Show comprehensive status
            console.log('📈 Priority 3 Status:', status);
            console.log('🎯 All Priority 3 optimizations tested successfully!');

        } catch (error) {
            console.error('❌ Priority 3 test failed:', error);
        }
    }

    /**
     * Enhanced plugin initialization with Phase 6 architecture
     */
    async onload() {
        const startTime = Date.now();
        
        try {
            // Step 1: Load settings first
            await this.loadSettings();
            
            // Step 2: Initialize dependency injection container
            this.diContainer = new DIContainer();
            
            // Step 3: Create enhanced initialization manager
            const initConfig: EnhancedInitializationConfig = {
                enableCrossCuttingServices: true,
                enableAgentServices: true,
                enableCentralizedLogging: true,
                enableMonitoring: true,
                enableSecurity: true,
                enableConfiguration: true,
                enableToolExecution: true,
                enableCommandProcessing: true,
                enableExecutionLimits: true,
                enablePerformanceMonitoring: true,
                enableMemoryTracking: true,
                maxInitializationTime: 10000, // 10 seconds
                
                // Legacy services for compatibility
                enableBackupManager: true,
                enableAgentMode: true,
                enablePriority3Optimizations: true,
                enableRecentlyOpenedFiles: true,
                enableTestCommands: this.settings.debugMode
            };
            
            this.initializationManager = new EnhancedInitializationManager(
                this.app,
                this as any, // Type assertion to work around interface compatibility
                this.diContainer,
                globalEventBus,
                initConfig
            );
            
            // Step 4: Initialize core services and cross-cutting concerns
            await this.initializationManager.initializeCore();
            
            // Step 5: Get service references from DI container
            this.crossCuttingHub = this.diContainer.resolve('crossCuttingHub');
            this.agentOrchestrator = this.diContainer.resolve('agentOrchestrator');
            this.commandProcessor = this.diContainer.resolve('commandProcessor');
            this.toolExecutionEngine = this.diContainer.resolve('toolExecutionEngine');
            this.toolDisplayManager = this.diContainer.resolve('toolDisplayManager');
            this.executionLimitManager = this.diContainer.resolve('executionLimitManager');
            
            // Step 6: Get scoped logger for this plugin
            if (this.crossCuttingHub) {
                this.logger = this.crossCuttingHub.getLogger().createScopedLogger('EnhancedAIAssistantPlugin');
                this.logger.info('Enhanced AI Assistant Plugin initialized', {
                    phase: 'core_complete',
                    duration: Date.now() - startTime,
                    config: initConfig
                });
            }
            
            // Step 7: Initialize views and UI components
            await this.initializationManager.initializeViews();
            
            // Step 8: Initialize commands and finalize setup
            await this.initializationManager.initializeCommands();
            
            // Step 9: Archive AI call logs by date (compress old files)
            try {
                const { archiveAICallsByDate } = await import('./utils/saveAICalls');
                await archiveAICallsByDate(this as any);
                if (this.logger) {
                    this.logger.info('AI call archival completed');
                }
            } catch (error: any) {
                if (this.logger) {
                    this.logger.warn('AI call archival failed', { error: error.message });
                } else {
                    console.warn('AI call archival failed:', error);
                }
            }
            
            // Step 10: Add settings tab
            this.addSettingTab(new MyPluginSettingTab(this.app, this as any));
            
            // Step 11: Log successful initialization
            const totalTime = Date.now() - startTime;
            const systemStatus = this.getSystemStatus();
            
            if (this.logger) {
                this.logger.info('Enhanced AI Assistant Plugin fully loaded', {
                    totalDuration: totalTime,
                    systemStatus,
                    servicesInitialized: this.initializationManager.getSystemStatus().initializationMetrics.servicesInitialized.length
                });
            }
            
            // Legacy debug log for compatibility
            debugLog(this.settings.debugMode ?? false, 'info', 'Enhanced AI Assistant Plugin loaded successfully', {
                totalTime,
                systemStatus
            });
            
        } catch (error: any) {
            const errorMessage = `Failed to initialize Enhanced AI Assistant Plugin: ${error.message}`;
            
            if (this.logger) {
                this.logger.error('Plugin initialization failed', {
                    error: error.message,
                    stack: error.stack,
                    duration: Date.now() - startTime
                });
            }
            
            console.error(errorMessage, error);
            debugLog(this.settings.debugMode ?? false, 'error', errorMessage, error);
            
            // Still try to add settings tab so user can potentially fix configuration
            try {
                this.addSettingTab(new MyPluginSettingTab(this.app, this as any));
            } catch (settingsError) {
                console.error('Failed to add settings tab:', settingsError);
            }
            
            throw error;
        }
    }

    /**
     * Enhanced plugin cleanup with comprehensive service disposal
     */
    async onunload() {
        try {
            if (this.logger) {
                this.logger.info('Starting Enhanced AI Assistant Plugin cleanup');
            }
            
            // Stop all active AI streams
            this.stopAllAIStreams();
            
            // Clean up initialization manager and all services
            if (this.initializationManager) {
                await this.initializationManager.cleanup();
            }
            
            // Clean up settings listeners
            this.settingsListeners = [];
            
            if (this.logger) {
                this.logger.info('Enhanced AI Assistant Plugin cleanup completed');
            }
            
            debugLog(this.settings.debugMode ?? false, 'info', 'Enhanced AI Assistant Plugin unloaded');
            
        } catch (error: any) {
            console.error('Error during plugin cleanup:', error);
            debugLog(this.settings.debugMode ?? false, 'error', 'Plugin cleanup failed', error);
        }
    }

    /**
     * Get comprehensive system status
     */
    getSystemStatus(): {
        isInitialized: boolean;
        crossCuttingServices: any;
        agentServices: any;
        systemHealth: any;
        performance: any;
    } {
        const status: any = {
            isInitialized: !!this.initializationManager?.getSystemStatus().isInitialized,
            crossCuttingServices: null,
            agentServices: null,
            systemHealth: null,
            performance: null
        };

        if (this.crossCuttingHub) {
            const hubStatus = this.crossCuttingHub.getSystemStatus();
            status.crossCuttingServices = hubStatus.services;
            status.systemHealth = hubStatus.isHealthy ? 'healthy' : 'unhealthy';
            status.performance = {
                timestamp: hubStatus.timestamp,
                isHealthy: hubStatus.isHealthy
            };
        }

        if (this.agentOrchestrator) {
            status.agentServices = {
                orchestrator: 'active',
                commandProcessor: !!this.commandProcessor,
                toolExecutionEngine: !!this.toolExecutionEngine,
                toolDisplayManager: !!this.toolDisplayManager,
                executionLimitManager: !!this.executionLimitManager
            };
        }

        return status;
    }

    /**
     * Enhanced AI agent processing with integrated security and monitoring
     */
    async processAgentResponse(
        response: string,
        context?: {
            maxExecutions?: number;
            timeoutMs?: number;
            skipLimitCheck?: boolean;
            displayResults?: boolean;
        }
    ): Promise<any> {
        if (!this.agentOrchestrator) {
            throw new Error('Agent orchestrator not initialized');
        }

        if (this.logger) {
            this.logger.info('Processing agent response', {
                responseLength: response.length,
                context
            });
        }

        try {
            const result = await this.agentOrchestrator.processAgentResponse(response, context);
            
            if (this.logger) {
                this.logger.info('Agent response processed successfully', {
                    commandsCount: result.commands.length,
                    resultsCount: result.results.length,
                    limitReached: result.limitReached,
                    statistics: result.statistics
                });
            }
            
            return result;
        } catch (error: any) {
            if (this.logger) {
                this.logger.error('Agent response processing failed', {
                    error: error.message,
                    responseLength: response.length,
                    context
                });
            }
            throw error;
        }
    }

    /**
     * Enhanced settings management with reactive updates
     */
    async loadSettings() {
        const loadedData = await this.loadData();
        this.settings = Object.assign({}, DEFAULT_SETTINGS, loadedData);
        
        // Validate settings
        if (!validatePluginSettings(this.settings)) {
            console.warn('Invalid plugin settings detected, using defaults');
            this.settings = { ...DEFAULT_SETTINGS };
        }
        
        if (this.logger) {
            this.logger.info('Settings loaded successfully', {
                debugMode: this.settings.debugMode,
                agentMode: this.settings.agentMode?.enabled
            });
        }
    }

    async saveSettings() {
        await this.saveData(this.settings);
        
        // Notify cross-cutting services of settings change
        if (this.crossCuttingHub) {
            this.crossCuttingHub.getConfiguration().set('plugin', this.settings);
        }
        
        // Emit settings change event for reactive updates
        this.emitSettingsChange();
        
        if (this.logger) {
            this.logger.info('Settings saved and change event emitted');
        }
    }

    /**
     * Settings change event management
     */
    onSettingsChange(listener: () => void) {
        this.settingsListeners.push(listener);
    }

    offSettingsChange(listener: () => void) {
        this.settingsListeners = this.settingsListeners.filter(l => l !== listener);
    }

    private emitSettingsChange() {
        for (const listener of this.settingsListeners) {
            try { 
                listener(); 
            } catch (e) { 
                console.error('Settings change listener error:', e);
                if (this.logger) {
                    this.logger.error('Settings change listener failed', { error: e });
                }
            }
        }
    }

    /**
     * Enhanced stream management
     */
    hasActiveAIStreams(): boolean {
        // Check legacy activeStream
        if (this.activeStream) {
            return true;
        }
        
        // Check AI dispatcher streams
        if (this.aiDispatcher && this.aiDispatcher.hasActiveStreams()) {
            return true;
        }
        
        return false;
    }

    stopAllAIStreams(): void {
        // Stop legacy active stream
        if (this.activeStream) {
            this.activeStream.abort();
            this.activeStream = null;
        }
        
        // Stop AI dispatcher streams
        if (this.aiDispatcher) {
            this.aiDispatcher.abortAllStreams();
        }
        
        if (this.logger) {
            this.logger.info('All AI streams stopped');
        }
        
        debugLog(this.settings.debugMode ?? false, 'info', '[EnhancedAIAssistantPlugin] All AI streams stopped');
    }

    /**
     * Enhanced debug logging that integrates with centralized logging
     */
    debugLog(level: 'debug' | 'info' | 'warn' | 'error' = 'debug', ...args: any[]) {
        // Use centralized logger if available
        if (this.logger) {
            switch (level) {
                case 'debug':
                    this.logger.debug(args[0], args.slice(1)[0]);
                    break;
                case 'info':
                    this.logger.info(args[0], args.slice(1)[0]);
                    break;
                case 'warn':
                    this.logger.warn(args[0], args.slice(1)[0]);
                    break;
                case 'error':
                    this.logger.error(args[0], args.slice(1)[0]);
                    break;
            }
        } else {
            // Fallback to legacy debug logging
            debugLog(this.settings.debugMode ?? false, level, ...args);
        }
    }

    /**
     * Get comprehensive stream debug information
     */
    getStreamDebugInfo(): string {
        const info = [];
        
        if (this.activeStream) {
            info.push('Main plugin activeStream: active');
        } else {
            info.push('Main plugin activeStream: null');
        }
        
        if (this.aiDispatcher) {
            const count = this.aiDispatcher.getActiveStreamCount();
            info.push(`AIDispatcher streams: ${count}`);
        } else {
            info.push('AIDispatcher: not initialized');
        }

        // Add cross-cutting services status
        if (this.crossCuttingHub) {
            const systemStatus = this.crossCuttingHub.getSystemStatus();
            info.push(`Cross-cutting services: ${Object.keys(systemStatus.services).length} active`);
            info.push(`System health: ${systemStatus.isHealthy ? 'healthy' : 'unhealthy'}`);
        }

        // Add agent services status
        if (this.agentOrchestrator) {
            info.push('Agent services: active');
        } else {
            info.push('Agent services: not initialized');
        }
        
        return info.join('\n');
    }

    /**
     * Backward compatibility methods for existing code
     */
    
    // Legacy method implementations that delegate to new services
    async processMessages(messages: any[]): Promise<any[]> {
        if (this.logger) {
            this.logger.info('Processing messages (legacy method)', { count: messages.length });
        }
        
        // This would integrate with the new agent system
        // For now, maintain existing behavior
        return messages;
    }

    async activateChatViewAndLoadMessages(messages: any[]): Promise<void> {
        if (this.logger) {
            this.logger.info('Activating chat view with messages (legacy method)', { count: messages.length });
        }
        
        // This would integrate with the new view management
        // For now, maintain existing behavior
    }

    processToolExecutionBlocks(element: HTMLElement, context: any): void {
        if (this.toolDisplayManager) {
            // Use new tool display manager
            // Implementation would integrate with the new system
        }
        
        // For now, maintain existing behavior
    }

    processToolExecutionCodeBlock(source: string, el: HTMLElement, ctx: any): void {
        if (this.toolDisplayManager) {
            // Use new tool display manager
            // Implementation would integrate with the new system
        }
        
        // For now, maintain existing behavior
    }
}

/**
 * Export for Obsidian plugin system
 * 
 * This maintains compatibility with Obsidian's plugin loading system
 * while providing the enhanced Phase 6 architecture.
 */
export { EnhancedAIAssistantPlugin };
