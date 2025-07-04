/**
 * @file priority3Integration.ts
 * 
 * Integration layer for Priority 3 optimizations.
 * Demonstrates how to integrate dependency injection, state management, and stream management
 * into the main plugin architecture.
 */

import { Plugin } from 'obsidian';
import { DIContainer, ServiceLocator, DIContainerFactory } from '../utils/dependencyInjection';
import { globalStateManager, StateUtils } from '../utils/stateManager';
import { globalStreamManager, StreamUtils } from '../utils/streamManager';
import { errorHandler } from '../utils/errorHandler';
import { LRUCache } from '../utils/lruCache';
import { AsyncOptimizerFactory } from '../utils/asyncOptimizer';

/**
 * Priority 3 Integration Manager
 * Coordinates all Priority 3 optimizations
 */
export class Priority3IntegrationManager {
    private container: DIContainer;
    private stateUnsubscribers: Array<() => void> = [];
    private isInitialized = false;

    constructor(private plugin: Plugin) {
        this.container = new DIContainer();
    }

    /**
     * Initialize all Priority 3 systems
     */
    async initialize(): Promise<void> {
        if (this.isInitialized) {
            throw new Error('Priority 3 systems already initialized');
        }

        try {
            // 1. Setup Dependency Injection
            await this.setupDependencyInjection();

            // 2. Initialize State Management
            await this.setupStateManagement();

            // 3. Configure Stream Management
            await this.setupStreamManagement();

            // 4. Setup Integration Monitoring
            this.setupMonitoring();

            // 5. Register cleanup handlers
            this.setupCleanup();

            this.isInitialized = true;
            console.log('Priority 3 optimizations initialized successfully');

        } catch (error) {
            errorHandler.handleError(error, {
                component: 'Priority3IntegrationManager',
                operation: 'initialize'
            });
            throw error;
        }
    }

    /**
     * Setup dependency injection container
     */
    private async setupDependencyInjection(): Promise<void> {
        // Register core services
        this.container.registerSingleton('plugin', () => this.plugin);
        this.container.registerSingleton('stateManager', () => globalStateManager);
        this.container.registerSingleton('streamManager', () => globalStreamManager);
        this.container.registerSingleton('errorHandler', () => errorHandler);
        this.container.registerSingleton('asyncOptimizerFactory', () => AsyncOptimizerFactory);

        // Register plugin-specific services
        this.container.registerSingleton('settingsCache', () => 
            new LRUCache({ maxSize: 100, defaultTTL: 5 * 60 * 1000 })
        );

        this.container.registerTransient('httpClient', () => {
            // Create HTTP client with optimizations
            return {
                async fetch(url: string, options?: RequestInit) {
                    const throttler = AsyncOptimizerFactory.createAPIThrottler();
                    return throttler.throttle(() => fetch(url, options));
                }
            };
        });

        this.container.registerScoped('chatSession', () => ({
            id: `session-${Date.now()}`,
            messages: [],
            startTime: Date.now(),
            dispose: () => console.log('Chat session disposed')
        }));

        // Make container globally available
        ServiceLocator.initialize(this.container);

        console.log('Dependency injection system configured');
    }

    /**
     * Setup centralized state management
     */
    private async setupStateManagement(): Promise<void> {
        // Initialize plugin state structure
        globalStateManager.setState('plugin.version', this.plugin.manifest.version, {
            persistent: true
        });

        globalStateManager.setState('plugin.initialized', false);
        globalStateManager.setState('plugin.performance', {
            startTime: Date.now(),
            memoryUsage: 0,
            operationCount: 0
        });

        // Setup state validators
        globalStateManager.registerValidator('settings.apiKey', (value: string) => {
            return value && value.length > 10 ? true : 'API key must be at least 10 characters';
        });

        globalStateManager.registerValidator('chat.maxMessages', (value: number) => {
            return value > 0 && value <= 1000 ? true : 'Max messages must be between 1 and 1000';
        });

        // Setup state transformers
        globalStateManager.registerTransformer('settings.theme', (value: string) => {
            return value.toLowerCase().trim();
        });

        // Create computed states
        StateUtils.createComputed(
            globalStateManager,
            ['plugin.performance.operationCount', 'plugin.performance.startTime'],
            ([operations, startTime]) => {
                const duration = Date.now() - startTime;
                return duration > 0 ? operations / (duration / 1000) : 0;
            },
            'plugin.performance.operationsPerSecond'
        );

        // Subscribe to critical state changes
        this.stateUnsubscribers.push(
            globalStateManager.subscribe('plugin.error', (error) => {
                if (error) {
                    console.error('Plugin error state changed:', error);
                    this.handleCriticalError(error);
                }
            }),

            globalStateManager.subscribe('plugin.performance.memoryUsage', (usage) => {
                if (typeof usage === 'number' && usage > 100 * 1024 * 1024) { // 100MB threshold
                    console.warn('High memory usage detected:', usage);
                    this.handleHighMemoryUsage();
                }
            }),

            globalStateManager.subscribeAll((newValue, oldValue, path) => {
                // Log all state changes in development
                if (process.env.NODE_ENV === 'development') {
                    console.log(`State changed: ${path}`, { oldValue, newValue });
                }
            })
        );

        // Mark state management as ready
        globalStateManager.setState('plugin.stateManagement.ready', true);
        console.log('State management system configured');
    }

    /**
     * Setup stream management
     */
    private async setupStreamManagement(): Promise<void> {
        // Register common stream transformers
        globalStreamManager.registerTransformer('jsonParse', (chunk: string) => {
            try {
                return JSON.parse(chunk);
            } catch {
                return chunk;
            }
        });

        globalStreamManager.registerTransformer('textDecode', (chunk: Uint8Array) => {
            return new TextDecoder().decode(chunk);
        });

        globalStreamManager.registerTransformer('markdown', (text: string) => {
            // Simple markdown processing
            return text
                .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                .replace(/\*(.*?)\*/g, '<em>$1</em>');
        });

        // Register common stream filters
        globalStreamManager.registerFilter('nonEmpty', (chunk: any) => {
            return chunk !== null && chunk !== undefined && chunk !== '';
        });

        globalStreamManager.registerFilter('validJson', (chunk: string) => {
            try {
                JSON.parse(chunk);
                return true;
            } catch {
                return false;
            }
        });

        // Setup stream event handlers
        globalStreamManager.on('streamCreated', (id, state) => {
            globalStateManager.setState(`streams.${id}`, {
                status: state.status,
                createdAt: state.createdAt
            });
        });

        globalStreamManager.on('streamDestroyed', (id) => {
            globalStateManager.deleteState(`streams.${id}`);
        });

        console.log('Stream management system configured');
    }

    /**
     * Setup monitoring and metrics collection
     */
    private setupMonitoring(): void {
        // Collect metrics every 30 seconds
        setInterval(() => {
            if (!this.isInitialized) return;

            try {
                const diStats = this.container.getStats();
                const stateStats = globalStateManager.getStats();
                const streamStats = globalStreamManager.getStats();

                // Update performance state
                globalStateManager.setState('plugin.performance.metrics', {
                    timestamp: Date.now(),
                    dependencyInjection: diStats,
                    stateManagement: stateStats,
                    streamManagement: streamStats,
                    memoryUsage: this.estimateMemoryUsage()
                });

                // Check for performance issues
                this.checkPerformanceThresholds(diStats, stateStats, streamStats);

            } catch (error) {
                errorHandler.handleError(error, {
                    component: 'Priority3IntegrationManager',
                    operation: 'monitoring'
                });
            }
        }, 30000);

        console.log('Monitoring system configured');
    }

    /**
     * Setup cleanup handlers
     */
    private setupCleanup(): void {
        // Cleanup on plugin unload
        this.plugin.register(() => {
            this.dispose();
        });

        // Periodic cleanup
        setInterval(() => {
            if (!this.isInitialized) return;

            try {
                // Cleanup old streams
                const cleaned = globalStreamManager.cleanup(5 * 60 * 1000); // 5 minutes
                if (cleaned > 0) {
                    console.log(`Cleaned up ${cleaned} old streams`);
                }

                // Cleanup old state snapshots
                const snapshots = globalStateManager.getSnapshots();
                if (snapshots.length > 20) {
                    // Keep only the 20 most recent snapshots
                    console.log(`Managing ${snapshots.length} state snapshots`);
                }

            } catch (error) {
                errorHandler.handleError(error, {
                    component: 'Priority3IntegrationManager',
                    operation: 'cleanup'
                });
            }
        }, 2 * 60 * 1000); // Every 2 minutes

        console.log('Cleanup handlers configured');
    }

    /**
     * Handle critical errors
     */
    private handleCriticalError(error: any): void {
        // Create error snapshot
        globalStateManager.createSnapshot();
        
        // Pause non-essential streams
        const activeStreams = globalStreamManager.getActiveStreams();
        for (const stream of activeStreams) {
            if (!stream.id.includes('critical')) {
                globalStreamManager.pauseStream(stream.id);
            }
        }

        // Notify user if needed
        console.error('Critical error handled:', error);
    }

    /**
     * Handle high memory usage
     */
    private handleHighMemoryUsage(): void {
        // Force cleanup
        globalStreamManager.cleanup(60000); // 1 minute threshold
        
        // Clear non-essential caches
        const settingsCache = ServiceLocator.resolve<LRUCache<any>>('settingsCache');
        settingsCache.clear();

        // Create memory usage snapshot
        globalStateManager.createSnapshot();
        
        console.warn('High memory usage mitigation applied');
    }

    /**
     * Check performance thresholds
     */
    private checkPerformanceThresholds(diStats: any, stateStats: any, streamStats: any): void {
        const warnings: string[] = [];

        // Check DI performance
        if (diStats.resolutionCount > 10000) {
            warnings.push('High dependency resolution count');
        }

        // Check state management performance
        if (stateStats.listeners > 1000) {
            warnings.push('High number of state listeners');
        }

        if (stateStats.memoryUsage > 50 * 1024 * 1024) { // 50MB
            warnings.push('High state memory usage');
        }

        // Check stream performance
        if (streamStats.activeStreams > 50) {
            warnings.push('High number of active streams');
        }

        if (streamStats.averageThroughput < 1000) { // bytes per second
            warnings.push('Low stream throughput');
        }

        if (warnings.length > 0) {
            globalStateManager.setState('plugin.performance.warnings', warnings);
            console.warn('Performance warnings:', warnings);
        }
    }

    /**
     * Estimate memory usage
     */
    private estimateMemoryUsage(): number {
        try {
            // Simple memory estimation
            const stateSize = JSON.stringify(globalStateManager.getFullState()).length;
            const containerSize = this.container.getStats().totalServices * 1000; // rough estimate
            return stateSize + containerSize;
        } catch {
            return 0;
        }
    }

    /**
     * Get integration status
     */
    getStatus(): {
        initialized: boolean;
        services: string[];
        stateKeys: number;
        activeStreams: number;
        memoryUsage: number;
    } {
        return {
            initialized: this.isInitialized,
            services: this.container.getRegisteredServices(),
            stateKeys: globalStateManager.getStats().totalKeys,
            activeStreams: globalStreamManager.getStats().activeStreams,
            memoryUsage: this.estimateMemoryUsage()
        };
    }

    /**
     * Dispose all systems
     */
    dispose(): void {
        if (!this.isInitialized) return;

        try {
            // Unsubscribe from state changes
            this.stateUnsubscribers.forEach(unsub => unsub());
            this.stateUnsubscribers = [];

            // Dispose stream manager
            globalStreamManager.dispose();

            // Dispose state manager
            globalStateManager.dispose();

            // Dispose container
            this.container.dispose();

            this.isInitialized = false;
            console.log('Priority 3 systems disposed');

        } catch (error) {
            errorHandler.handleError(error, {
                component: 'Priority3IntegrationManager',
                operation: 'dispose'
            });
        }
    }
}

/**
 * Example usage in main plugin class
 */
export class ExamplePluginIntegration extends Plugin {
    private priority3Manager: Priority3IntegrationManager;

    async onload() {
        // Initialize Priority 3 optimizations
        this.priority3Manager = new Priority3IntegrationManager(this);
        await this.priority3Manager.initialize();

        // Example: Use dependency injection
        const stateManager = ServiceLocator.resolve<typeof globalStateManager>('stateManager');
        const streamManager = ServiceLocator.resolve<typeof globalStreamManager>('streamManager');

        // Example: Setup plugin-specific state
        stateManager.setState('plugin.name', this.manifest.name, { persistent: true });
        stateManager.setState('plugin.settings', await this.loadData() || {});

        // Example: Handle streaming AI responses
        this.addCommand({
            id: 'stream-ai-response',
            name: 'Stream AI Response',
            callback: () => this.handleStreamingAIResponse()
        });

        console.log('Plugin loaded with Priority 3 optimizations');
    }

    async onunload() {
        // Cleanup is handled automatically by the integration manager
        console.log('Plugin unloaded');
    }

    private async handleStreamingAIResponse() {
        const streamManager = ServiceLocator.resolve<typeof globalStreamManager>('streamManager');
        const stateManager = ServiceLocator.resolve<typeof globalStateManager>('stateManager');

        try {
            // Create a mock streaming response
            const mockData = ['Hello', ' ', 'world', '!', ' ', 'This', ' ', 'is', ' ', 'streaming', '.'];
            const source = StreamUtils.fromArray(mockData);

            // Create managed stream
            const stream = streamManager.createStream('ai-response', source, {
                timeout: 30000,
                backpressureThreshold: 1024
            });

            // Transform and process
            const textStream = stream
                .filter('nonEmpty')
                .transform((chunk: string) => chunk.trim());

            let response = '';
            textStream.on('data', (chunk: string) => {
                response += chunk;
                stateManager.setState('chat.currentResponse', response);
            });

            textStream.on('end', () => {
                stateManager.setState('chat.lastResponse', response);
                stateManager.setState('chat.currentResponse', '');
            });

            await textStream.start();

        } catch (error) {
            errorHandler.handleError(error, {
                component: 'ExamplePluginIntegration',
                operation: 'handleStreamingAIResponse'
            });
        }
    }
}