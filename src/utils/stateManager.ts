/**
 * @file stateManager.ts
 * 
 * Centralized state management system for the AI Assistant plugin.
 * Provides reactive state management, event-driven updates, and state persistence.
 */

import { EventEmitter } from 'events';
import { LRUCache } from './lruCache';
import { errorHandler } from './errorHandler';

export type StateChangeListener<T = any> = (newState: T, oldState: T, path: string) => void;
export type StateValidator<T = any> = (value: T, path: string) => boolean | string;
export type StateTransformer<T = any> = (value: T, path: string) => T;

export interface StateOptions {
    persistent?: boolean;
    validator?: StateValidator;
    transformer?: StateTransformer;
    debounceMs?: number;
}

export interface StateSnapshot {
    timestamp: number;
    state: any;
    version: number;
}

/**
 * Centralized State Manager with reactive updates
 */
export class StateManager extends EventEmitter {
    private state: Record<string, any> = {};
    private stateListeners = new Map<string, Set<StateChangeListener>>();
    private validators = new Map<string, StateValidator>();
    private transformers = new Map<string, StateTransformer>();
    private persistentKeys = new Set<string>();
    private debounceTimers = new Map<string, NodeJS.Timeout>();
    private snapshots: LRUCache<StateSnapshot>;
    private version = 0;
    private isDisposed = false;

    constructor(private storageKey: string = 'ai-assistant-state') {
        super();
        this.snapshots = new LRUCache<StateSnapshot>({
            maxSize: 50,
            defaultTTL: 60 * 60 * 1000, // 1 hour
        });
        this.loadPersistedState();
    }

    /**
     * Set a value in the state
     */
    setState<T>(path: string, value: T, options: StateOptions = {}): void {
        if (this.isDisposed) {
            throw new Error('Cannot set state on disposed StateManager');
        }

        try {
            // Apply transformer if provided
            const transformer = options.transformer || this.transformers.get(path);
            const transformedValue = transformer ? transformer(value, path) : value;

            // Validate the value
            const validator = options.validator || this.validators.get(path);
            if (validator) {
                const validationResult = validator(transformedValue, path);
                if (validationResult !== true) {
                    const errorMessage = typeof validationResult === 'string' 
                        ? validationResult 
                        : `Invalid value for state path: ${path}`;
                    throw new Error(errorMessage);
                }
            }

            const oldValue = this.getState(path);
            
            // Set the value using dot notation
            this.setNestedValue(this.state, path, transformedValue);
            this.version++;

            // Handle persistence
            if (options.persistent) {
                this.persistentKeys.add(path);
            }

            // Create snapshot
            this.createSnapshot();

            // Notify listeners (with debouncing if specified)
            const debounceMs = options.debounceMs || 0;
            if (debounceMs > 0) {
                this.debouncedNotify(path, transformedValue, oldValue, debounceMs);
            } else {
                this.notifyListeners(path, transformedValue, oldValue);
            }

            // Persist if needed
            if (this.persistentKeys.has(path)) {
                this.persistState();
            }

        } catch (error) {
            errorHandler.handleError(error, {
                component: 'StateManager',
                operation: 'setState',
                metadata: { path, valueType: typeof value }
            });
            throw error;
        }
    }

    /**
     * Get a value from the state
     */
    getState<T>(path: string, defaultValue?: T): T {
        if (this.isDisposed) {
            throw new Error('Cannot get state from disposed StateManager');
        }

        try {
            const value = this.getNestedValue(this.state, path);
            return value !== undefined ? value : (defaultValue as T);
        } catch (error) {
            errorHandler.handleError(error, {
                component: 'StateManager',
                operation: 'getState',
                metadata: { path }
            });
            return defaultValue as T;
        }
    }

    /**
     * Check if a state path exists
     */
    hasState(path: string): boolean {
        return this.getNestedValue(this.state, path) !== undefined;
    }

    /**
     * Delete a state path
     */
    deleteState(path: string): void {
        if (this.isDisposed) {
            throw new Error('Cannot delete state from disposed StateManager');
        }

        const oldValue = this.getState(path);
        this.deleteNestedValue(this.state, path);
        this.version++;
        
        this.persistentKeys.delete(path);
        this.notifyListeners(path, undefined, oldValue);
        this.createSnapshot();
        this.persistState();
    }

    /**
     * Subscribe to state changes for a specific path
     */
    subscribe<T>(path: string, listener: StateChangeListener<T>): () => void {
        if (!this.stateListeners.has(path)) {
            this.stateListeners.set(path, new Set());
        }
        
        this.stateListeners.get(path)!.add(listener);

        // Return unsubscribe function
        return () => {
            const pathListeners = this.stateListeners.get(path);
            if (pathListeners) {
                pathListeners.delete(listener);
                if (pathListeners.size === 0) {
                    this.stateListeners.delete(path);
                }
            }
        };
    }

    /**
     * Subscribe to all state changes
     */
    subscribeAll(listener: StateChangeListener): () => void {
        this.on('stateChange', listener);
        return () => this.off('stateChange', listener);
    }

    /**
     * Register a validator for a state path
     */
    registerValidator(path: string, validator: StateValidator): void {
        this.validators.set(path, validator);
    }

    /**
     * Register a transformer for a state path
     */
    registerTransformer(path: string, transformer: StateTransformer): void {
        this.transformers.set(path, transformer);
    }

    /**
     * Get the entire state object (read-only)
     */
    getFullState(): Readonly<Record<string, any>> {
        return Object.freeze(JSON.parse(JSON.stringify(this.state)));
    }

    /**
     * Reset the entire state
     */
    resetState(newState: Record<string, any> = {}): void {
        if (this.isDisposed) {
            throw new Error('Cannot reset state on disposed StateManager');
        }

        const oldState = this.getFullState();
        this.state = { ...newState };
        this.version++;
        
        this.createSnapshot();
        this.emit('stateReset', this.state, oldState);
        this.persistState();
    }

    /**
     * Create a snapshot of the current state
     */
    createSnapshot(): void {
        const snapshot: StateSnapshot = {
            timestamp: Date.now(),
            state: JSON.parse(JSON.stringify(this.state)),
            version: this.version
        };
        
        this.snapshots.set(`snapshot-${this.version}`, snapshot);
    }

    /**
     * Restore state from a snapshot
     */
    restoreSnapshot(version: number): boolean {
        const snapshot = this.snapshots.get(`snapshot-${version}`);
        if (!snapshot) {
            return false;
        }

        const oldState = this.getFullState();
        this.state = JSON.parse(JSON.stringify(snapshot.state));
        this.version = snapshot.version;
        
        this.emit('stateRestored', this.state, oldState, snapshot);
        this.persistState();
        return true;
    }

    /**
     * Get available snapshots
     */
    getSnapshots(): StateSnapshot[] {
        return this.snapshots.values().sort((a, b) => b.timestamp - a.timestamp);
    }

    /**
     * Get current state version
     */
    getVersion(): number {
        return this.version;
    }

    /**
     * Batch multiple state updates
     */
    batch(updates: Array<{ path: string; value: any; options?: StateOptions }>): void {
        if (this.isDisposed) {
            throw new Error('Cannot batch updates on disposed StateManager');
        }

        const oldStates = new Map<string, any>();
        
        try {
            // Collect old states
            for (const update of updates) {
                oldStates.set(update.path, this.getState(update.path));
            }

            // Apply all updates without notifications
            for (const update of updates) {
                this.setNestedValue(this.state, update.path, update.value);
                if (update.options?.persistent) {
                    this.persistentKeys.add(update.path);
                }
            }

            this.version++;
            this.createSnapshot();

            // Notify all listeners at once
            for (const update of updates) {
                const oldValue = oldStates.get(update.path);
                this.notifyListeners(update.path, update.value, oldValue);
            }

            this.persistState();

        } catch (error) {
            // Rollback on error
            for (const [path, oldValue] of oldStates) {
                this.setNestedValue(this.state, path, oldValue);
            }
            throw error;
        }
    }

    /**
     * Watch for changes to multiple paths
     */
    watch(paths: string[], listener: (changes: Array<{ path: string; newValue: any; oldValue: any }>) => void): () => void {
        const unsubscribers: Array<() => void> = [];
        const changes: Array<{ path: string; newValue: any; oldValue: any }> = [];
        let debounceTimer: NodeJS.Timeout | null = null;

        for (const path of paths) {
            const unsubscribe = this.subscribe(path, (newValue, oldValue, changePath) => {
                changes.push({ path: changePath, newValue, oldValue });
                
                if (debounceTimer) {
                    clearTimeout(debounceTimer);
                }
                
                debounceTimer = setTimeout(() => {
                    if (changes.length > 0) {
                        listener([...changes]);
                        changes.length = 0;
                    }
                }, 10); // Small debounce to batch rapid changes
            });
            
            unsubscribers.push(unsubscribe);
        }

        return () => {
            unsubscribers.forEach(unsub => unsub());
            if (debounceTimer) {
                clearTimeout(debounceTimer);
            }
        };
    }

    /**
     * Get state statistics
     */
    getStats(): {
        totalKeys: number;
        persistentKeys: number;
        listeners: number;
        snapshots: number;
        version: number;
        memoryUsage: number;
    } {
        const totalListeners = Array.from(this.stateListeners.values())
            .reduce((sum, set) => sum + set.size, 0);

        return {
            totalKeys: this.countKeys(this.state),
            persistentKeys: this.persistentKeys.size,
            listeners: totalListeners,
            snapshots: this.snapshots.size(),
            version: this.version,
            memoryUsage: this.estimateMemoryUsage()
        };
    }

    /**
     * Dispose the state manager
     */
    dispose(): void {
        if (this.isDisposed) return;

        // Clear all timers
        for (const timer of this.debounceTimers.values()) {
            clearTimeout(timer);
        }
        this.debounceTimers.clear();

        // Clear all listeners
        this.stateListeners.clear();
        this.removeAllListeners();

        // Clear state
        this.state = {};
        this.validators.clear();
        this.transformers.clear();
        this.persistentKeys.clear();
        this.snapshots.destroy();

        this.isDisposed = true;
    }

    private setNestedValue(obj: any, path: string, value: any): void {
        const keys = path.split('.');
        let current = obj;

        for (let i = 0; i < keys.length - 1; i++) {
            const key = keys[i];
            if (!(key in current) || typeof current[key] !== 'object') {
                current[key] = {};
            }
            current = current[key];
        }

        current[keys[keys.length - 1]] = value;
    }

    private getNestedValue(obj: any, path: string): any {
        const keys = path.split('.');
        let current = obj;

        for (const key of keys) {
            if (current === null || current === undefined || !(key in current)) {
                return undefined;
            }
            current = current[key];
        }

        return current;
    }

    private deleteNestedValue(obj: any, path: string): void {
        const keys = path.split('.');
        let current = obj;

        for (let i = 0; i < keys.length - 1; i++) {
            const key = keys[i];
            if (!(key in current) || typeof current[key] !== 'object') {
                return; // Path doesn't exist
            }
            current = current[key];
        }

        delete current[keys[keys.length - 1]];
    }

    private notifyListeners(path: string, newValue: any, oldValue: any): void {
        // Notify specific path listeners
        const pathListeners = this.stateListeners.get(path);
        if (pathListeners) {
            for (const listener of pathListeners) {
                try {
                    listener(newValue, oldValue, path);
                } catch (error) {
                    errorHandler.handleError(error, {
                        component: 'StateManager',
                        operation: 'notifyListeners',
                        metadata: { path }
                    });
                }
            }
        }

        // Notify global listeners
        this.emit('stateChange', newValue, oldValue, path);
    }

    private debouncedNotify(path: string, newValue: any, oldValue: any, debounceMs: number): void {
        const existingTimer = this.debounceTimers.get(path);
        if (existingTimer) {
            clearTimeout(existingTimer);
        }

        const timer = setTimeout(() => {
            this.notifyListeners(path, newValue, oldValue);
            this.debounceTimers.delete(path);
        }, debounceMs);

        this.debounceTimers.set(path, timer);
    }

    private loadPersistedState(): void {
        try {
            const stored = localStorage.getItem(this.storageKey);
            if (stored) {
                const parsed = JSON.parse(stored);
                this.state = parsed.state || {};
                this.persistentKeys = new Set(parsed.persistentKeys || []);
                this.version = parsed.version || 0;
            }
        } catch (error) {
            errorHandler.handleError(error, {
                component: 'StateManager',
                operation: 'loadPersistedState'
            });
        }
    }

    private persistState(): void {
        try {
            const persistentState: any = {};
            for (const key of this.persistentKeys) {
                const value = this.getState(key);
                if (value !== undefined) {
                    this.setNestedValue(persistentState, key, value);
                }
            }

            const toStore = {
                state: persistentState,
                persistentKeys: Array.from(this.persistentKeys),
                version: this.version,
                timestamp: Date.now()
            };

            localStorage.setItem(this.storageKey, JSON.stringify(toStore));
        } catch (error) {
            errorHandler.handleError(error, {
                component: 'StateManager',
                operation: 'persistState'
            });
        }
    }

    private countKeys(obj: any, depth = 0): number {
        if (depth > 10 || typeof obj !== 'object' || obj === null) {
            return 0;
        }

        let count = 0;
        for (const key in obj) {
            count++;
            if (typeof obj[key] === 'object' && obj[key] !== null) {
                count += this.countKeys(obj[key], depth + 1);
            }
        }
        return count;
    }

    private estimateMemoryUsage(): number {
        try {
            return JSON.stringify(this.state).length * 2; // Rough estimate
        } catch {
            return 0;
        }
    }
}

/**
 * Global state manager instance
 */
export const globalStateManager = new StateManager();

/**
 * State management utilities
 */
export class StateUtils {
    /**
     * Create a computed state that updates when dependencies change
     */
    static createComputed<T>(
        stateManager: StateManager,
        dependencies: string[],
        computeFn: (values: any[]) => T,
        targetPath: string
    ): () => void {
        const updateComputed = () => {
            const values = dependencies.map(dep => stateManager.getState(dep));
            const computed = computeFn(values);
            stateManager.setState(targetPath, computed);
        };

        // Initial computation
        updateComputed();

        // Watch dependencies
        const unsubscribe = stateManager.watch(dependencies, updateComputed);
        return unsubscribe;
    }

    /**
     * Create a state slice with a specific prefix
     */
    static createSlice(stateManager: StateManager, prefix: string) {
        return {
            get: <T>(path: string, defaultValue?: T) => 
                stateManager.getState<T>(`${prefix}.${path}`, defaultValue),
            
            set: <T>(path: string, value: T, options?: StateOptions) => 
                stateManager.setState(`${prefix}.${path}`, value, options),
            
            subscribe: <T>(path: string, listener: StateChangeListener<T>) => 
                stateManager.subscribe(`${prefix}.${path}`, listener),
            
            delete: (path: string) => 
                stateManager.deleteState(`${prefix}.${path}`)
        };
    }
}