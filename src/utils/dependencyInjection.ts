/**
 * @file dependencyInjection.ts
 * 
 * Dependency Injection container for the AI Assistant plugin.
 * Provides centralized dependency management, lifecycle control, and service registration.
 */

import { App } from 'obsidian';
import type MyPlugin from '../main';
import { AIDispatcher } from './aiDispatcher';
import { ErrorHandler } from './errorHandler';
import { SimpleCache } from './simpleCache';

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

    constructor() {
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

    private registerCoreServices(): void {
        // Register core services that are commonly used
        this.registerSingleton('errorHandler', () => ErrorHandler.getInstance());
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
}