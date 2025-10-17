/**
 * Provider Registry System
 * 
 * This file provides a registry pattern for AI providers, allowing providers to
 * self-register and enabling dynamic provider discovery without hardcoded lists.
 */

import { BaseProvider } from './base';
import { MyPluginSettings } from '../src/types';

/**
 * Configuration field definition for provider settings UI
 */
export interface ConfigField {
    /** Display label for the field */
    label: string;
    /** Placeholder text for the input */
    placeholder: string;
    /** Optional validator function */
    validator?: (value: string) => boolean;
    /** Whether this field is required */
    required?: boolean;
    /** Field type (text, password, url) */
    type?: 'text' | 'password' | 'url';
}

/**
 * Metadata describing a provider's capabilities and configuration
 */
export interface ProviderMetadata {
    /** Unique identifier for the provider (e.g., 'openai', 'anthropic') */
    id: string;
    /** Human-readable display name */
    name: string;
    /** Brief description of the provider */
    description: string;
    /** Configuration fields required by this provider */
    configFields: {
        apiKey?: ConfigField;
        serverUrl?: ConfigField;
        baseUrl?: ConfigField;
        [key: string]: ConfigField | undefined;
    };
    /** Whether this provider supports streaming */
    supportsStreaming?: boolean;
    /** Whether this provider is currently implemented */
    isImplemented?: boolean;
}

/**
 * Factory function type for creating provider instances
 */
export type ProviderFactory = (settings: MyPluginSettings) => BaseProvider;

/**
 * Registry entry containing metadata and factory
 */
interface ProviderRegistryEntry {
    metadata: ProviderMetadata;
    factory: ProviderFactory;
}

/**
 * Central registry for AI providers
 * 
 * Providers register themselves at module load time, making it easy to
 * add new providers without modifying core code.
 */
export class ProviderRegistry {
    private providers = new Map<string, ProviderRegistryEntry>();

    /**
     * Register a new provider
     * 
     * @param metadata - Provider metadata including ID, name, and config fields
     * @param factory - Factory function to create provider instances
     */
    register(metadata: ProviderMetadata, factory: ProviderFactory): void {
        if (this.providers.has(metadata.id)) {
            console.warn(`Provider '${metadata.id}' is already registered. Overwriting.`);
        }
        
        this.providers.set(metadata.id, { metadata, factory });
        console.log(`[ProviderRegistry] Registered provider: ${metadata.id} (${metadata.name})`);
    }

    /**
     * Create a provider instance by ID
     * 
     * @param id - Provider ID
     * @param settings - Plugin settings
     * @returns Provider instance
     * @throws Error if provider ID is unknown
     */
    getProvider(id: string, settings: MyPluginSettings): BaseProvider {
        const entry = this.providers.get(id);
        if (!entry) {
            throw new Error(`Unknown provider: ${id}. Available providers: ${this.getAllProviderIds().join(', ')}`);
        }
        return entry.factory(settings);
    }

    /**
     * Get all registered provider IDs
     * 
     * @returns Array of provider IDs
     */
    getAllProviderIds(): string[] {
        return Array.from(this.providers.keys());
    }

    /**
     * Get metadata for a specific provider
     * 
     * @param id - Provider ID
     * @returns Provider metadata or undefined if not found
     */
    getMetadata(id: string): ProviderMetadata | undefined {
        return this.providers.get(id)?.metadata;
    }

    /**
     * Get metadata for all registered providers
     * 
     * @returns Array of provider metadata
     */
    getAllMetadata(): ProviderMetadata[] {
        return Array.from(this.providers.values()).map(entry => entry.metadata);
    }

    /**
     * Check if a provider is registered
     * 
     * @param id - Provider ID
     * @returns True if provider is registered
     */
    hasProvider(id: string): boolean {
        return this.providers.has(id);
    }

    /**
     * Get all implemented providers
     * 
     * @returns Array of provider IDs that are fully implemented
     */
    getImplementedProviders(): string[] {
        return Array.from(this.providers.values())
            .filter(entry => entry.metadata.isImplemented !== false)
            .map(entry => entry.metadata.id);
    }

    /**
     * Clear all registered providers (primarily for testing)
     */
    clear(): void {
        this.providers.clear();
    }

    /**
     * Get the number of registered providers
     */
    get size(): number {
        return this.providers.size;
    }
}

/**
 * Singleton instance of the provider registry
 * 
 * Import this instance to register or access providers.
 */
export const providerRegistry = new ProviderRegistry();
