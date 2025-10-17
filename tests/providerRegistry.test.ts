/**
 * Tests for Provider Registry
 * 
 * Tests the provider registration and lookup functionality
 */

import { ProviderRegistry, ProviderMetadata } from '../providers/registry';
import type { MyPluginSettings } from '../src/types';
import { BaseProvider } from '../providers/base';

describe('ProviderRegistry', () => {
    let registry: ProviderRegistry;

    beforeEach(() => {
        registry = new ProviderRegistry();
    });

    afterEach(() => {
        registry.clear();
    });

    describe('Provider Registration', () => {
        test('should register a provider', () => {
            const metadata: ProviderMetadata = {
                id: 'test-provider',
                name: 'Test Provider',
                description: 'A test provider',
                configFields: {
                    apiKey: {
                        label: 'API Key',
                        placeholder: 'test-key',
                        required: true,
                        type: 'password'
                    }
                },
                supportsStreaming: true,
                isImplemented: true
            };

            const factory = (settings: MyPluginSettings) => ({} as BaseProvider);

            registry.register(metadata, factory);

            expect(registry.hasProvider('test-provider')).toBe(true);
            expect(registry.size).toBe(1);
        });

        test('should warn when overwriting existing provider', () => {
            const metadata: ProviderMetadata = {
                id: 'test-provider',
                name: 'Test Provider',
                description: 'A test provider',
                configFields: {}
            };

            const factory = (settings: MyPluginSettings) => ({} as BaseProvider);
            
            const warnSpy = jest.spyOn(console, 'warn').mockImplementation();

            registry.register(metadata, factory);
            registry.register(metadata, factory); // Register again

            expect(warnSpy).toHaveBeenCalledWith(
                expect.stringContaining("Provider 'test-provider' is already registered")
            );

            warnSpy.mockRestore();
        });
    });

    describe('Provider Lookup', () => {
        test('should get provider metadata', () => {
            const metadata: ProviderMetadata = {
                id: 'test-provider',
                name: 'Test Provider',
                description: 'A test provider',
                configFields: {}
            };

            registry.register(metadata, () => ({} as BaseProvider));

            const retrieved = registry.getMetadata('test-provider');
            expect(retrieved).toEqual(metadata);
        });

        test('should return undefined for unknown provider metadata', () => {
            const retrieved = registry.getMetadata('unknown-provider');
            expect(retrieved).toBeUndefined();
        });

        test('should throw error when creating unknown provider', () => {
            expect(() => {
                registry.getProvider('unknown-provider', {} as MyPluginSettings);
            }).toThrow('Unknown provider: unknown-provider');
        });

        test('should return all provider IDs', () => {
            registry.register(
                { id: 'provider1', name: 'Provider 1', description: '', configFields: {} },
                () => ({} as BaseProvider)
            );
            registry.register(
                { id: 'provider2', name: 'Provider 2', description: '', configFields: {} },
                () => ({} as BaseProvider)
            );

            const ids = registry.getAllProviderIds();
            expect(ids).toContain('provider1');
            expect(ids).toContain('provider2');
            expect(ids).toHaveLength(2);
        });

        test('should return all metadata', () => {
            const metadata1: ProviderMetadata = {
                id: 'provider1',
                name: 'Provider 1',
                description: 'First provider',
                configFields: {}
            };
            const metadata2: ProviderMetadata = {
                id: 'provider2',
                name: 'Provider 2',
                description: 'Second provider',
                configFields: {}
            };

            registry.register(metadata1, () => ({} as BaseProvider));
            registry.register(metadata2, () => ({} as BaseProvider));

            const allMetadata = registry.getAllMetadata();
            expect(allMetadata).toHaveLength(2);
            expect(allMetadata).toContainEqual(metadata1);
            expect(allMetadata).toContainEqual(metadata2);
        });
    });

    describe('Provider Filtering', () => {
        test('should get implemented providers only', () => {
            registry.register(
                { id: 'implemented', name: 'Implemented', description: '', configFields: {}, isImplemented: true },
                () => ({} as BaseProvider)
            );
            registry.register(
                { id: 'not-implemented', name: 'Not Implemented', description: '', configFields: {}, isImplemented: false },
                () => ({} as BaseProvider)
            );

            const implemented = registry.getImplementedProviders();
            expect(implemented).toContain('implemented');
            expect(implemented).not.toContain('not-implemented');
        });

        test('should treat providers without isImplemented flag as implemented', () => {
            registry.register(
                { id: 'default-implemented', name: 'Default', description: '', configFields: {} },
                () => ({} as BaseProvider)
            );

            const implemented = registry.getImplementedProviders();
            expect(implemented).toContain('default-implemented');
        });
    });

    describe('Registry Management', () => {
        test('should check if provider exists', () => {
            registry.register(
                { id: 'test', name: 'Test', description: '', configFields: {} },
                () => ({} as BaseProvider)
            );

            expect(registry.hasProvider('test')).toBe(true);
            expect(registry.hasProvider('nonexistent')).toBe(false);
        });

        test('should clear all providers', () => {
            registry.register(
                { id: 'test1', name: 'Test 1', description: '', configFields: {} },
                () => ({} as BaseProvider)
            );
            registry.register(
                { id: 'test2', name: 'Test 2', description: '', configFields: {} },
                () => ({} as BaseProvider)
            );

            expect(registry.size).toBe(2);
            
            registry.clear();
            
            expect(registry.size).toBe(0);
            expect(registry.getAllProviderIds()).toHaveLength(0);
        });

        test('should track registry size', () => {
            expect(registry.size).toBe(0);

            registry.register(
                { id: 'test', name: 'Test', description: '', configFields: {} },
                () => ({} as BaseProvider)
            );

            expect(registry.size).toBe(1);
        });
    });
});
