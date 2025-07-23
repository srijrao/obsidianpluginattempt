import { IConfigurationService, ConfigSchema, ConfigChangeCallback, ValidationResult } from '../interfaces';

/**
 * Centralized Configuration Service
 *
 * Provides:
 * - Typed config access with validation
 * - Reactive change notifications
 * - Schema-based config validation
 * - Import/export and reload support
 */
export class ConfigurationService implements IConfigurationService {
    private config: Record<string, any> = {};
    private schema: ConfigSchema = {};
    private subscribers: Map<string, Set<ConfigChangeCallback>> = new Map();

    constructor(initialConfig?: Record<string, any>, schema?: ConfigSchema) {
        if (schema) this.schema = schema;
        if (initialConfig) this.config = { ...initialConfig };
    }

    get<T>(key: string, defaultValue?: T): T {
        return this.config[key] !== undefined ? this.config[key] : defaultValue!;
    }

    set<T>(key: string, value: T): Promise<void> {
        const oldValue = this.config[key];
        this.config[key] = value;
        this.notifySubscribers(key, value, oldValue);
        return Promise.resolve();
    }

    has(key: string): boolean {
        return this.config.hasOwnProperty(key);
    }

    subscribe(key: string, callback: ConfigChangeCallback): () => void {
        if (!this.subscribers.has(key)) {
            this.subscribers.set(key, new Set());
        }
        this.subscribers.get(key)!.add(callback);
        return () => this.subscribers.get(key)!.delete(callback);
    }

    validate(config: any): ValidationResult {
        const errors: string[] = [];
        const schema = this.schema;
        for (const key in schema) {
            const def = schema[key];
            const value = config[key];
            if (def.required && (value === undefined || value === null)) {
                errors.push(`Missing required config: ${key}`);
            }
            if (def.validation && !def.validation(value)) {
                errors.push(`Invalid value for ${key}`);
            }
        }
        return {
            isValid: errors.length === 0,
            errors
        };
    }

    reload(): Promise<void> {
        // Placeholder for async reload (e.g. from disk)
        return Promise.resolve();
    }

    export(): string {
        return JSON.stringify(this.config, null, 2);
    }

    import(config: string): Promise<void> {
        try {
            const parsed = JSON.parse(config);
            this.config = { ...parsed };
            // Notify all subscribers
            Object.keys(parsed).forEach(key => {
                this.notifySubscribers(key, parsed[key], undefined);
            });
            return Promise.resolve();
        } catch (e) {
            return Promise.reject(e);
        }
    }

    getSchema(): ConfigSchema {
        return this.schema;
    }

    private notifySubscribers(key: string, newValue: any, oldValue: any) {
        if (this.subscribers.has(key)) {
            this.subscribers.get(key)!.forEach(cb => cb(newValue, oldValue, key));
        }
    }
}
