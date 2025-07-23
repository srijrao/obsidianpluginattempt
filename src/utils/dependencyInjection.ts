/**
 * @file dependencyInjection.ts
 *
 * Enhanced Dependency Injection container for the AI Assistant plugin.
 * Provides centralized dependency management, lifecycle control, service registration,
 * and integration with the event bus system.
 */

import { App } from 'obsidian';
import type MyPlugin from '../main';
import { AIDispatcher } from './aiDispatcher';
import { ErrorHandler } from './errorHandler';
import { LRUCache } from './lruCache';
import { AsyncBatcher, ParallelExecutor } from './asyncOptimizer';
import { IEventBus, globalEventBus } from './eventBus';
import * as ServiceInterfaces from '../services/interfaces';
import { IEventBus as IEventBusInterface } from '../services/interfaces';

export type ServiceLifecycle = 'singleton' | 'transient' | 'scoped';

export interface ServiceDefinition<T = any> {
    factory: (container: DIContainer) => T;
    lifecycle: ServiceLifecycle;
    dependencies?: string[];
}

export interface ServiceMetadata {
    name: string;
    lifecycle: ServiceLifecycle;
    dependencies: string[];
    createdAt: number;
    lastAccessed: number;
    accessCount: number;
}

/**
 * Dependency Injection Container
 */
export class DIContainer {
    private services = new Map<string, ServiceDefinition>();
    private instances = new Map<string, any>();
    private metadata = new Map<string, ServiceMetadata>();
    private scopes = new Map<string, Map<string, any>>();
    private currentScope: string | null = null;
    private isDisposed = false;
    private eventBus: IEventBus;
    private serviceInitializationOrder: string[] = [];

    constructor(eventBus: IEventBus = globalEventBus) {
        this.eventBus = eventBus;
        this.registerCoreServices();
    }

    /**
     * Register a service with the container
     */
    register<T>(
        name: string,
        factory: (container: DIContainer) => T,
        lifecycle: ServiceLifecycle = 'singleton',
        dependencies: string[] = []
    ): void {
        if (this.isDisposed) {
            throw new Error('Cannot register services on disposed container');
        }

        this.services.set(name, {
            factory,
            lifecycle,
            dependencies
        });

        this.metadata.set(name, {
            name,
            lifecycle,
            dependencies,
            createdAt: Date.now(),
            lastAccessed: 0,
            accessCount: 0
        });
    }

    /**
     * Register a service with interface validation
     */
    registerService<T>(
        name: string,
        factory: (container: DIContainer) => T,
        lifecycle: ServiceLifecycle = 'singleton',
        dependencies: string[] = [],
        interfaceValidator?: (instance: T) => boolean
    ): void {
        const enhancedFactory = (container: DIContainer) => {
            const instance = factory(container);
            
            // Validate interface if validator provided
            if (interfaceValidator && !interfaceValidator(instance)) {
                throw new Error(`Service '${name}' does not implement required interface`);
            }
            
            // Emit service registration event
            this.eventBus.publish('service.registered', {
                name,
                lifecycle,
                dependencies,
                timestamp: Date.now()
            });
            
            return instance;
        };

        this.register(name, enhancedFactory, lifecycle, dependencies);
        this.serviceInitializationOrder.push(name);
    }

    /**
     * Register a singleton service
     */
    registerSingleton<T>(
        name: string,
        factory: (container: DIContainer) => T,
        dependencies: string[] = []
    ): void {
        this.register(name, factory, 'singleton', dependencies);
    }

    /**
     * Register a transient service (new instance every time)
     */
    registerTransient<T>(
        name: string,
        factory: (container: DIContainer) => T,
        dependencies: string[] = []
    ): void {
        this.register(name, factory, 'transient', dependencies);
    }

    /**
     * Register a scoped service (one instance per scope)
     */
    registerScoped<T>(
        name: string,
        factory: (container: DIContainer) => T,
        dependencies: string[] = []
    ): void {
        this.register(name, factory, 'scoped', dependencies);
    }

    /**
     * Resolve a service by name
     */
    resolve<T>(name: string): T {
        if (this.isDisposed) {
            throw new Error('Cannot resolve services from disposed container');
        }

        const service = this.services.get(name);
        if (!service) {
            throw new Error(`Service '${name}' not registered`);
        }

        // Update metadata
        const meta = this.metadata.get(name)!;
        meta.lastAccessed = Date.now();
        meta.accessCount++;

        // Check for circular dependencies
        this.checkCircularDependencies(name, new Set());

        switch (service.lifecycle) {
            case 'singleton':
                return this.resolveSingleton(name, service);
            case 'transient':
                return this.resolveTransient(name, service);
            case 'scoped':
                return this.resolveScoped(name, service);
            default:
                throw new Error(`Unknown lifecycle: ${service.lifecycle}`);
        }
    }

    /**
     * Resolve with dependency validation and circular dependency detection
     */
    resolveWithValidation<T>(name: string, expectedInterface?: string): T {
        const instance = this.resolve<T>(name);
        
        // Emit service resolution event
        this.eventBus.publish('service.resolved', {
            name,
            timestamp: Date.now(),
            expectedInterface
        });
        
        return instance;
    }

    /**
     * Check if a service is registered
     */
    isRegistered(name: string): boolean {
        return this.services.has(name);
    }

    /**
     * Get all registered service names
     */
    getRegisteredServices(): string[] {
        return Array.from(this.services.keys());
    }

    /**
     * Get service metadata
     */
    getServiceMetadata(name: string): ServiceMetadata | undefined {
        return this.metadata.get(name);
    }

    /**
     * Get all service metadata
     */
    getAllServiceMetadata(): ServiceMetadata[] {
        return Array.from(this.metadata.values());
    }

    /**
     * Create a new scope
     */
    createScope(scopeId: string): void {
        if (this.scopes.has(scopeId)) {
            throw new Error(`Scope '${scopeId}' already exists`);
        }
        this.scopes.set(scopeId, new Map());
    }

    /**
     * Enter a scope
     */
    enterScope(scopeId: string): void {
        if (!this.scopes.has(scopeId)) {
            this.createScope(scopeId);
        }
        this.currentScope = scopeId;
    }

    /**
     * Exit current scope
     */
    exitScope(): void {
        this.currentScope = null;
    }

    /**
     * Dispose a scope and all its instances
     */
    disposeScope(scopeId: string): void {
        const scope = this.scopes.get(scopeId);
        if (scope) {
            // Dispose all instances in the scope
            for (const [, instance] of scope) {
                this.disposeInstance(instance);
            }
            this.scopes.delete(scopeId);
        }

        if (this.currentScope === scopeId) {
            this.currentScope = null;
        }
    }

    /**
     * Dispose the entire container
     */
    dispose(): void {
        if (this.isDisposed) return;

        // Dispose all scopes
        for (const scopeId of this.scopes.keys()) {
            this.disposeScope(scopeId);
        }

        // Dispose all singleton instances
        for (const [, instance] of this.instances) {
            this.disposeInstance(instance);
        }

        this.services.clear();
        this.instances.clear();
        this.metadata.clear();
        this.scopes.clear();
        this.currentScope = null;
        this.isDisposed = true;
    }

    /**
     * Get container statistics
     */
    getStats(): {
        totalServices: number;
        singletonInstances: number;
        activeScopes: number;
        totalResolutions: number;
        memoryUsage: number;
    } {
        const totalResolutions = Array.from(this.metadata.values())
            .reduce((sum, meta) => sum + meta.accessCount, 0);

        return {
            totalServices: this.services.size,
            singletonInstances: this.instances.size,
            activeScopes: this.scopes.size,
            totalResolutions,
            memoryUsage: this.estimateMemoryUsage()
        };
    }

    /**
     * Initialize all services in dependency order
     */
    async initializeServices(): Promise<void> {
        const initOrder = this.calculateInitializationOrder();
        
        for (const serviceName of initOrder) {
            try {
                const instance = this.resolve(serviceName);
                
                // Call initialize method if it exists
                if (instance && typeof (instance as any).initialize === 'function') {
                    await (instance as any).initialize();
                }
                
                this.eventBus.publish('service.initialized', {
                    name: serviceName,
                    timestamp: Date.now()
                });
            } catch (error: any) {
                this.eventBus.publish('service.initialization.failed', {
                    name: serviceName,
                    error: error.message,
                    timestamp: Date.now()
                });
                throw error;
            }
        }
    }

    /**
     * Calculate service initialization order based on dependencies
     */
    private calculateInitializationOrder(): string[] {
        const visited = new Set<string>();
        const visiting = new Set<string>();
        const order: string[] = [];

        const visit = (serviceName: string) => {
            if (visiting.has(serviceName)) {
                throw new Error(`Circular dependency detected involving service: ${serviceName}`);
            }
            if (visited.has(serviceName)) {
                return;
            }

            visiting.add(serviceName);
            
            const service = this.services.get(serviceName);
            if (service && service.dependencies) {
                for (const dep of service.dependencies) {
                    visit(dep);
                }
            }
            
            visiting.delete(serviceName);
            visited.add(serviceName);
            order.push(serviceName);
        };

        for (const serviceName of this.services.keys()) {
            visit(serviceName);
        }

        return order;
    }

    /**
     * Get service dependency graph
     */
    getDependencyGraph(): Record<string, string[]> {
        const graph: Record<string, string[]> = {};
        
        for (const [name, service] of this.services) {
            graph[name] = service.dependencies || [];
        }
        
        return graph;
    }

    private registerCoreServices(): void {
        // Register core services that are commonly used
        this.registerSingleton('errorHandler', () => ErrorHandler.getInstance());
        this.registerSingleton('eventBus', () => this.eventBus);
    }

    private resolveSingleton<T>(name: string, service: ServiceDefinition<T>): T {
        if (this.instances.has(name)) {
            return this.instances.get(name);
        }

        const instance = this.createInstance(name, service);
        this.instances.set(name, instance);
        return instance;
    }

    private resolveTransient<T>(name: string, service: ServiceDefinition<T>): T {
        return this.createInstance(name, service);
    }

    private resolveScoped<T>(name: string, service: ServiceDefinition<T>): T {
        if (!this.currentScope) {
            throw new Error(`Cannot resolve scoped service '${name}' outside of a scope`);
        }

        const scope = this.scopes.get(this.currentScope)!;
        if (scope.has(name)) {
            return scope.get(name);
        }

        const instance = this.createInstance(name, service);
        scope.set(name, instance);
        return instance;
    }

    private createInstance<T>(name: string, service: ServiceDefinition<T>): T {
        // Resolve dependencies first
        const dependencies = service.dependencies || [];
        const resolvedDependencies = dependencies.map(dep => this.resolve(dep));

        try {
            return service.factory(this);
        } catch (error) {
            throw new Error(`Failed to create instance of '${name}': ${error.message}`);
        }
    }

    private checkCircularDependencies(name: string, visited: Set<string>): void {
        if (visited.has(name)) {
            throw new Error(`Circular dependency detected: ${Array.from(visited).join(' -> ')} -> ${name}`);
        }

        visited.add(name);
        const service = this.services.get(name);
        if (service && service.dependencies) {
            for (const dep of service.dependencies) {
                this.checkCircularDependencies(dep, new Set(visited));
            }
        }
        visited.delete(name);
    }

    private disposeInstance(instance: any): void {
        if (instance && typeof instance.dispose === 'function') {
            try {
                instance.dispose();
            } catch (error) {
                console.warn('Error disposing instance:', error);
            }
        }
    }

    private estimateMemoryUsage(): number {
        // Rough estimation of memory usage
        let size = 0;
        size += this.services.size * 100; // Approximate size per service definition
        size += this.instances.size * 500; // Approximate size per instance
        size += this.metadata.size * 200; // Approximate size per metadata entry
        return size;
    }
}

/**
 * Service locator pattern for global access
 */
export class ServiceLocator {
    private static container: DIContainer | null = null;

    static initialize(container: DIContainer): void {
        ServiceLocator.container = container;
    }

    static getContainer(): DIContainer {
        if (!ServiceLocator.container) {
            throw new Error('ServiceLocator not initialized. Call initialize() first.');
        }
        return ServiceLocator.container;
    }

    static resolve<T>(name: string): T {
        return ServiceLocator.getContainer().resolve<T>(name);
    }

    static isInitialized(): boolean {
        return ServiceLocator.container !== null;
    }

    static dispose(): void {
        if (ServiceLocator.container) {
            ServiceLocator.container.dispose();
            ServiceLocator.container = null;
        }
    }
}

/**
 * Decorator for automatic dependency injection
 */
export function Injectable(name: string, lifecycle: ServiceLifecycle = 'singleton') {
    return function <T extends new (...args: any[]) => any>(constructor: T) {
        const container = ServiceLocator.getContainer();
        container.register(name, () => new constructor(), lifecycle);
        return constructor;
    };
}

/**
 * Factory for creating pre-configured DI containers
 */
export class DIContainerFactory {
    /**
     * Create a container for the AI Assistant plugin
     */
    static createPluginContainer(app: App, plugin: MyPlugin): DIContainer {
        const container = new DIContainer();

        // Register core Obsidian services
        container.registerSingleton('app', () => app);
        container.registerSingleton('plugin', () => plugin);
        container.registerSingleton('vault', () => app.vault);
        container.registerSingleton('workspace', () => app.workspace);

        // Register plugin-specific services
        container.registerSingleton('aiDispatcher', (c) => {
            const vault = c.resolve<typeof app.vault>('vault');
            const pluginInstance = c.resolve<MyPlugin>('plugin');
            return new AIDispatcher(vault, pluginInstance);
        }, ['vault', 'plugin']);

        // Register utility services
        container.registerSingleton('errorHandler', () => ErrorHandler.getInstance());

        return container;
    }

    /**
     * Create a container for testing
     */
    static createTestContainer(): DIContainer {
        const container = new DIContainer();
        
        // Register mock services for testing
        container.registerSingleton('mockService', () => ({ test: true }));
        
        return container;
    }

    /**
     * Create a container with enhanced service registration
     */
    static createEnhancedPluginContainer(app: App, plugin: MyPlugin): DIContainer {
        const container = new DIContainer();

        // Register core Obsidian services
        container.registerSingleton('app', () => app);
        container.registerSingleton('plugin', () => plugin);
        container.registerSingleton('vault', () => app.vault);
        container.registerSingleton('workspace', () => app.workspace);

        // Register enhanced services with interface validation
        container.registerService('aiService', (c) => {
            const vault = c.resolve<typeof app.vault>('vault');
            const pluginInstance = c.resolve<MyPlugin>('plugin');
            return new AIDispatcher(vault, pluginInstance);
        }, 'singleton', ['vault', 'plugin']);

        // Register utility services
        container.registerSingleton('errorHandler', () => ErrorHandler.getInstance());
        container.registerSingleton('eventBus', () => globalEventBus);

        return container;
    }
}

/**
 * Enhanced Service Registry for organizing service registration
 */
export interface IServiceRegistry {
    registerCoreServices(): void;
    registerChatServices(): void;
    registerAgentServices(): void;
    registerUIServices(): void;
}

export class ServiceRegistry implements IServiceRegistry {
    constructor(private container: DIContainer) {}

    registerCoreServices(): void {
        // Core infrastructure services
        this.container.registerService<IEventBusInterface>(
            'eventBus',
            () => globalEventBus,
            'singleton'
        );

        this.container.registerService<ServiceInterfaces.IErrorBoundary>(
            'errorBoundary',
            (c) => new ErrorBoundaryService(c.resolve('eventBus')),
            'singleton',
            ['eventBus']
        );

        this.container.registerService<ServiceInterfaces.IConfigurationManager>(
            'configManager',
            (c) => new ConfigurationManagerService(c.resolve('eventBus')),
            'singleton',
            ['eventBus']
        );
    }

    registerChatServices(): void {
        // Chat-related services
        this.container.registerService<ServiceInterfaces.IChatService>(
            'chatService',
            (c) => new ChatServiceImpl(
                c.resolve('eventBus'),
                c.resolve('aiService')
            ),
            'singleton',
            ['eventBus', 'aiService']
        );

        this.container.registerService<ServiceInterfaces.IChatUIManager>(
            'chatUIManager',
            (c) => new ChatUIManagerImpl(c.resolve('eventBus')),
            'singleton',
            ['eventBus']
        );

        this.container.registerService<ServiceInterfaces.IStreamCoordinator>(
            'streamCoordinator',
            (c) => new StreamCoordinatorImpl(
                c.resolve('eventBus'),
                c.resolve('aiService')
            ),
            'singleton',
            ['eventBus', 'aiService']
        );
    }

    registerAgentServices(): void {
        // Agent and tool execution services
        this.container.registerService<ServiceInterfaces.IAgentService>(
            'agentService',
            (c) => new AgentServiceImpl(
                c.resolve('eventBus'),
                c.resolve('toolExecutionEngine')
            ),
            'singleton',
            ['eventBus', 'toolExecutionEngine']
        );

        this.container.registerService<ServiceInterfaces.IToolExecutionEngine>(
            'toolExecutionEngine',
            (c) => new ToolExecutionEngineImpl(c.resolve('eventBus')),
            'singleton',
            ['eventBus']
        );

        this.container.registerService<ServiceInterfaces.IExecutionLimitManager>(
            'executionLimitManager',
            (c) => new ExecutionLimitManagerImpl(c.resolve('eventBus')),
            'singleton',
            ['eventBus']
        );
    }

    registerUIServices(): void {
        // UI management services
        this.container.registerService<ServiceInterfaces.IViewManager>(
            'viewManager',
            (c) => new ViewManagerImpl(
                c.resolve('app'),
                c.resolve('eventBus')
            ),
            'singleton',
            ['app', 'eventBus']
        );

        this.container.registerService<ServiceInterfaces.ICommandManager>(
            'commandManager',
            (c) => new CommandManagerImpl(
                c.resolve('plugin'),
                c.resolve('eventBus')
            ),
            'singleton',
            ['plugin', 'eventBus']
        );
    }
}

// Placeholder implementations - these will be implemented in subsequent phases
class ErrorBoundaryService implements ServiceInterfaces.IErrorBoundary {
    constructor(private eventBus: IEventBusInterface) {}
    async wrap<T>(operation: () => Promise<T>): Promise<T> { return operation(); }
    handleError(error: Error, context: ServiceInterfaces.ErrorContext): void {}
    getErrorStats(): ServiceInterfaces.ErrorStats { return { totalErrors: 0, errorsByService: {}, errorsByType: {}, recentErrors: [] }; }
    clearErrors(): void {}
}

class ConfigurationManagerService implements ServiceInterfaces.IConfigurationManager {
    constructor(private eventBus: IEventBusInterface) {}
    get<T>(key: string): T { return undefined as any; }
    async set<T>(key: string, value: T): Promise<void> {}
    subscribe(key: string, callback: (value: any) => void): () => void { return () => {}; }
    validate(config: any): ServiceInterfaces.ValidationResult { return { isValid: true, errors: [], warnings: [] }; }
    export(): string { return '{}'; }
    async import(config: string): Promise<void> {}
}

class ChatServiceImpl implements ServiceInterfaces.IChatService {
    constructor(private eventBus: IEventBusInterface, private aiService: ServiceInterfaces.IAIService) {}
    async sendMessage(content: string): Promise<void> {}
    async regenerateMessage(messageId: string): Promise<void> {}
    async clearHistory(): Promise<void> {}
    async getHistory(): Promise<any[]> { return []; }
    async addMessage(message: any): Promise<void> {}
    async updateMessage(timestamp: string, role: string, oldContent: string, newContent: string, metadata?: any): Promise<void> {}
}

class ChatUIManagerImpl implements ServiceInterfaces.IChatUIManager {
    constructor(private eventBus: IEventBusInterface) {}
    createChatInterface(): HTMLElement { return document.createElement('div'); }
    updateMessageDisplay(message: any): void {}
    scrollToBottom(): void {}
    showTypingIndicator(): void {}
    hideTypingIndicator(): void {}
    updateModelDisplay(modelName: string): void {}
    updateReferenceNoteIndicator(isEnabled: boolean, fileName?: string): void {}
}

class StreamCoordinatorImpl implements ServiceInterfaces.IStreamCoordinator {
    constructor(private eventBus: IEventBusInterface, private aiService: ServiceInterfaces.IAIService) {}
    async startStream(messages: any[]): Promise<string> { return ''; }
    stopStream(): void {}
    isStreaming(): boolean { return false; }
    getActiveStreams(): string[] { return []; }
    abortStream(streamId: string): void {}
}

class AgentServiceImpl implements ServiceInterfaces.IAgentService {
    constructor(private eventBus: IEventBusInterface, private toolEngine: ServiceInterfaces.IToolExecutionEngine) {}
    async processResponse(response: string): Promise<ServiceInterfaces.AgentResult> {
        return { processedText: response, toolResults: [], hasTools: false, taskStatus: {} };
    }
    async executeTools(commands: any[]): Promise<any[]> { return []; }
    isLimitReached(): boolean { return false; }
    resetExecutionCount(): void {}
    getExecutionStats(): ServiceInterfaces.ExecutionStats { 
        return { 
            executionCount: 0, 
            maxExecutions: 10, 
            remaining: 10, 
            averageExecutionTime: 0,
            successfulExecutions: 0,
            failedExecutions: 0,
            totalExecutions: 0
        }; 
    }
    isAgentModeEnabled(): boolean { return false; }
    async setAgentModeEnabled(enabled: boolean): Promise<void> {}
}

class ToolExecutionEngineImpl implements ServiceInterfaces.IToolExecutionEngine {
    constructor(private eventBus: IEventBusInterface) {}
    async executeCommand(command: any): Promise<any> { return { success: true }; }
    canExecute(command: any): boolean { return true; }
    getExecutionStats(): ServiceInterfaces.ExecutionStats { 
        return { 
            executionCount: 0, 
            maxExecutions: 10, 
            remaining: 10, 
            averageExecutionTime: 0,
            successfulExecutions: 0,
            failedExecutions: 0,
            totalExecutions: 0
        }; 
    }
    registerTool(tool: any): void {}
    unregisterTool(toolName: string): void {}
}

class ExecutionLimitManagerImpl implements ServiceInterfaces.IExecutionLimitManager {
    private currentCount = 0;
    private limit = 10;
    private lastResetTime = Date.now();
    private autoReset = false;
    private resetIntervalMs = 60000; // 1 minute

    constructor(private eventBus: IEventBusInterface) {}
    
    isLimitReached(): boolean { return this.currentCount >= this.limit; }
    canExecute(count: number): boolean { return this.currentCount + count <= this.limit; }
    addExecutions(count: number): void { this.currentCount += count; }
    resetLimit(): void { 
        this.currentCount = 0; 
        this.lastResetTime = Date.now();
    }
    getLimit(): number { return this.limit; }
    setLimit(limit: number): void { this.limit = limit; }
    getCurrentCount(): number { return this.currentCount; }
    getRemaining(): number { return Math.max(0, this.limit - this.currentCount); }
    getUsagePercentage(): number { return (this.currentCount / this.limit) * 100; }
    getStatus() {
        return {
            count: this.currentCount,
            limit: this.limit,
            remaining: this.getRemaining(),
            percentage: this.getUsagePercentage(),
            isLimitReached: this.isLimitReached(),
            lastResetTime: this.lastResetTime,
            autoReset: this.autoReset,
            resetIntervalMs: this.resetIntervalMs
        };
    }
    setAutoReset(enabled: boolean, intervalMs?: number): void {
        this.autoReset = enabled;
        if (intervalMs) this.resetIntervalMs = intervalMs;
    }
    destroy(): void {
        // Cleanup any timers or resources
    }
}

class ViewManagerImpl implements ServiceInterfaces.IViewManager {
    constructor(private app: App, private eventBus: IEventBusInterface) {}
    registerViews(): void {}
    async activateView(type: string): Promise<void> {}
    getActiveViews(): ServiceInterfaces.ViewInfo[] { return []; }
    async closeView(type: string): Promise<void> {}
}

class CommandManagerImpl implements ServiceInterfaces.ICommandManager {
    constructor(private plugin: any, private eventBus: IEventBusInterface) {}
    registerCommands(): void {}
    unregisterCommands(): void {}
    async executeCommand(id: string, ...args: any[]): Promise<void> {}
    getRegisteredCommands(): string[] { return []; }
}