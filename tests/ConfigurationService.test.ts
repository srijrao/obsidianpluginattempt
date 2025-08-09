/**
 * @file ConfigurationService.test.ts
 * @description Comprehensive test suite for ConfigurationService
 */

import { ConfigurationService } from '../src/services/crosscutting/ConfigurationService';
import { IConfigurationService, ConfigSchema, ConfigChangeCallback, ValidationResult } from '../src/services/interfaces';

describe('ConfigurationService', () => {
  let configService: ConfigurationService;
  let mockSchema: ConfigSchema;
  let initialConfig: Record<string, any>;

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup mock schema
    mockSchema = {
      'app.name': {
        type: 'string',
        required: true,
        default: 'AI Assistant',
        description: 'Application name'
      },
      'app.version': {
        type: 'string',
        required: false,
        default: '1.0.0',
        description: 'Application version'
      },
      'logging.level': {
        type: 'string',
        required: true,
        default: 'info',
        description: 'Logging level',
        validation: (value: string) => ['debug', 'info', 'warn', 'error'].includes(value)
      },
      'logging.maxLogs': {
        type: 'number',
        required: false,
        default: 1000,
        description: 'Maximum number of logs to retain',
        validation: (value: number) => value > 0 && value <= 10000
      },
      'features.enabled': {
        type: 'boolean',
        required: false,
        default: true,
        description: 'Enable advanced features'
      },
      'api.endpoints': {
        type: 'array',
        required: false,
        default: [],
        description: 'API endpoints configuration'
      },
      'database.config': {
        type: 'object',
        required: false,
        default: {},
        description: 'Database configuration object'
      }
    };

    // Setup initial configuration
    initialConfig = {
      'app.name': 'Test App',
      'app.version': '2.0.0',
      'logging.level': 'debug',
      'logging.maxLogs': 500,
      'features.enabled': false,
      'api.endpoints': ['http://api1.test', 'http://api2.test'],
      'database.config': {
        host: 'localhost',
        port: 5432,
        database: 'testdb'
      }
    };

    // Create service instance
    configService = new ConfigurationService(initialConfig, mockSchema);
  });

  describe('constructor', () => {
    test('should initialize with initial config and schema', () => {
      expect(configService).toBeInstanceOf(ConfigurationService);
      expect(configService.get('app.name')).toBe('Test App');
      expect(configService.getSchema()).toEqual(mockSchema);
    });

    test('should initialize with empty config when none provided', () => {
      const emptyService = new ConfigurationService();
      expect(emptyService.get('nonexistent')).toBeUndefined();
    });

    test('should initialize with schema only', () => {
      const schemaOnlyService = new ConfigurationService(undefined, mockSchema);
      expect(schemaOnlyService.getSchema()).toEqual(mockSchema);
    });

    test('should handle null/undefined initial values', () => {
      const nullService = new ConfigurationService(null as any);
      expect(nullService.get('test')).toBeUndefined();
    });
  });

  describe('get method', () => {
    test('should retrieve existing configuration values', () => {
      expect(configService.get('app.name')).toBe('Test App');
      expect(configService.get('logging.level')).toBe('debug');
      expect(configService.get('features.enabled')).toBe(false);
    });

    test('should return default value when key does not exist', () => {
      expect(configService.get('nonexistent.key', 'default-value')).toBe('default-value');
      expect(configService.get('missing.number', 42)).toBe(42);
      expect(configService.get('missing.boolean', true)).toBe(true);
    });

    test('should return undefined when key does not exist and no default provided', () => {
      expect(configService.get('nonexistent.key')).toBeUndefined();
    });

    test('should handle complex object retrieval', () => {
      const dbConfig = configService.get('database.config');
      expect(dbConfig).toEqual({
        host: 'localhost',
        port: 5432,
        database: 'testdb'
      });
    });

    test('should handle array retrieval', () => {
      const endpoints = configService.get('api.endpoints');
      expect(endpoints).toEqual(['http://api1.test', 'http://api2.test']);
    });

    test('should handle type-specific retrieval', () => {
      expect(configService.get<string>('app.name')).toBe('Test App');
      expect(configService.get<number>('logging.maxLogs')).toBe(500);
      expect(configService.get<boolean>('features.enabled')).toBe(false);
      expect(configService.get<string[]>('api.endpoints')).toEqual(['http://api1.test', 'http://api2.test']);
    });
  });

  describe('set method', () => {
    test('should set new configuration values', async () => {
      await configService.set('new.key', 'new-value');
      expect(configService.get('new.key')).toBe('new-value');
    });

    test('should update existing configuration values', async () => {
      await configService.set('app.name', 'Updated App');
      expect(configService.get('app.name')).toBe('Updated App');
    });

    test('should handle different data types', async () => {
      await configService.set('test.string', 'string-value');
      await configService.set('test.number', 123);
      await configService.set('test.boolean', true);
      await configService.set('test.array', [1, 2, 3]);
      await configService.set('test.object', { key: 'value' });

      expect(configService.get('test.string')).toBe('string-value');
      expect(configService.get('test.number')).toBe(123);
      expect(configService.get('test.boolean')).toBe(true);
      expect(configService.get('test.array')).toEqual([1, 2, 3]);
      expect(configService.get('test.object')).toEqual({ key: 'value' });
    });

    test('should handle null and undefined values', async () => {
      await configService.set('test.null', null);
      await configService.set('test.undefined', undefined);

      expect(configService.get('test.null')).toBeNull();
      expect(configService.get('test.undefined')).toBeUndefined();
    });

    test('should return resolved promise', async () => {
      const result = await configService.set('test.key', 'test-value');
      expect(result).toBeUndefined(); // Promise<void>
    });
  });

  describe('has method', () => {
    test('should return true for existing keys', () => {
      expect(configService.has('app.name')).toBe(true);
      expect(configService.has('logging.level')).toBe(true);
      expect(configService.has('database.config')).toBe(true);
    });

    test('should return false for non-existing keys', () => {
      expect(configService.has('nonexistent.key')).toBe(false);
      expect(configService.has('missing.value')).toBe(false);
    });

    test('should handle edge cases', () => {
      expect(configService.has('')).toBe(false);
      expect(configService.has(null as any)).toBe(false);
      expect(configService.has(undefined as any)).toBe(false);
    });

    test('should work with dynamically added keys', async () => {
      expect(configService.has('dynamic.key')).toBe(false);
      
      await configService.set('dynamic.key', 'dynamic-value');
      
      expect(configService.has('dynamic.key')).toBe(true);
    });
  });

  describe('subscribe method', () => {
    test('should subscribe to configuration changes', async () => {
      const callback = jest.fn();
      const unsubscribe = configService.subscribe('app.name', callback);

      await configService.set('app.name', 'New App Name');

      expect(callback).toHaveBeenCalledWith('New App Name', 'Test App', 'app.name');
      expect(typeof unsubscribe).toBe('function');
    });

    test('should handle multiple subscribers for same key', async () => {
      const callback1 = jest.fn();
      const callback2 = jest.fn();
      const callback3 = jest.fn();

      configService.subscribe('logging.level', callback1);
      configService.subscribe('logging.level', callback2);
      configService.subscribe('logging.level', callback3);

      await configService.set('logging.level', 'error');

      expect(callback1).toHaveBeenCalledWith('error', 'debug', 'logging.level');
      expect(callback2).toHaveBeenCalledWith('error', 'debug', 'logging.level');
      expect(callback3).toHaveBeenCalledWith('error', 'debug', 'logging.level');
    });

    test('should handle subscribers for different keys', async () => {
      const nameCallback = jest.fn();
      const levelCallback = jest.fn();

      configService.subscribe('app.name', nameCallback);
      configService.subscribe('logging.level', levelCallback);

      await configService.set('app.name', 'Changed Name');
      await configService.set('logging.level', 'warn');

      expect(nameCallback).toHaveBeenCalledWith('Changed Name', 'Test App', 'app.name');
      expect(levelCallback).toHaveBeenCalledWith('warn', 'debug', 'logging.level');
      expect(nameCallback).not.toHaveBeenCalledWith('warn', expect.any(String), 'logging.level');
    });

    test('should unsubscribe correctly', async () => {
      const callback = jest.fn();
      const unsubscribe = configService.subscribe('app.version', callback);

      await configService.set('app.version', '3.0.0');
      expect(callback).toHaveBeenCalledTimes(1);

      unsubscribe();

      await configService.set('app.version', '4.0.0');
      expect(callback).toHaveBeenCalledTimes(1); // Should not be called again
    });

    test('should handle subscription to non-existing keys', async () => {
      const callback = jest.fn();
      configService.subscribe('new.key', callback);

      await configService.set('new.key', 'first-value');

      expect(callback).toHaveBeenCalledWith('first-value', undefined, 'new.key');
    });

    test('should handle complex object changes', async () => {
      const callback = jest.fn();
      configService.subscribe('database.config', callback);

      const newConfig = { host: 'remote', port: 3306, database: 'proddb' };
      await configService.set('database.config', newConfig);

      expect(callback).toHaveBeenCalledWith(
        newConfig,
        { host: 'localhost', port: 5432, database: 'testdb' },
        'database.config'
      );
    });
  });

  describe('validate method', () => {
    test('should validate configuration against schema', () => {
      const validConfig = {
        'app.name': 'Valid App',
        'logging.level': 'info',
        'logging.maxLogs': 2000
      };

      const result = configService.validate(validConfig);

      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    test('should detect missing required fields', () => {
      const invalidConfig = {
        'app.version': '1.0.0'
        // Missing required 'app.name' and 'logging.level'
      };

      const result = configService.validate(invalidConfig);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Missing required config: app.name');
      expect(result.errors).toContain('Missing required config: logging.level');
    });

    test('should validate using custom validation functions', () => {
      const invalidConfig = {
        'app.name': 'Valid App',
        'logging.level': 'invalid-level', // Should fail validation
        'logging.maxLogs': -100 // Should fail validation
      };

      const result = configService.validate(invalidConfig);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Invalid value for logging.level');
      expect(result.errors).toContain('Invalid value for logging.maxLogs');
    });

    test('should handle null and undefined values in validation', () => {
      const configWithNulls = {
        'app.name': null,
        'logging.level': undefined
      };

      const result = configService.validate(configWithNulls);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Missing required config: app.name');
      expect(result.errors).toContain('Missing required config: logging.level');
    });

    test('should validate empty configuration', () => {
      const result = configService.validate({});

      expect(result.isValid).toBe(false);
      expect(result.errors?.length || 0).toBeGreaterThan(0);
    });

    test('should handle validation with no schema', () => {
      const noSchemaService = new ConfigurationService();
      const result = noSchemaService.validate({ 'any.key': 'any-value' });

      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    test('should validate complex nested objects', () => {
      const configWithComplexObject = {
        'app.name': 'Test App',
        'logging.level': 'info',
        'database.config': {
          host: 'localhost',
          port: 5432,
          credentials: {
            username: 'admin',
            password: 'secret'
          }
        }
      };

      const result = configService.validate(configWithComplexObject);
      expect(result.isValid).toBe(true);
    });
  });

  describe('reload method', () => {
    test('should return resolved promise', async () => {
      const result = await configService.reload();
      expect(result).toBeUndefined(); // Promise<void>
    });

    test('should be callable multiple times', async () => {
      await configService.reload();
      await configService.reload();
      await configService.reload();
      // Should not throw
    });
  });

  describe('export method', () => {
    test('should export configuration as JSON string', () => {
      const exported = configService.export();
      const parsed = JSON.parse(exported);

      expect(parsed).toEqual(initialConfig);
    });

    test('should export empty configuration', () => {
      const emptyService = new ConfigurationService();
      const exported = emptyService.export();
      const parsed = JSON.parse(exported);

      expect(parsed).toEqual({});
    });

    test('should handle complex objects in export', () => {
      const exported = configService.export();
      const parsed = JSON.parse(exported);

      expect(parsed['database.config']).toEqual({
        host: 'localhost',
        port: 5432,
        database: 'testdb'
      });
      expect(parsed['api.endpoints']).toEqual(['http://api1.test', 'http://api2.test']);
    });

    test('should export after modifications', async () => {
      await configService.set('new.key', 'new-value');
      await configService.set('app.name', 'Modified App');

      const exported = configService.export();
      const parsed = JSON.parse(exported);

      expect(parsed['new.key']).toBe('new-value');
      expect(parsed['app.name']).toBe('Modified App');
    });
  });

  describe('import method', () => {
    test('should import valid JSON configuration', async () => {
      const newConfig = {
        'imported.key': 'imported-value',
        'app.name': 'Imported App',
        'features.enabled': true
      };

      await configService.import(JSON.stringify(newConfig));

      expect(configService.get('imported.key')).toBe('imported-value');
      expect(configService.get('app.name')).toBe('Imported App');
      expect(configService.get('features.enabled')).toBe(true);
    });

    test('should notify subscribers on import', async () => {
      const callback = jest.fn();
      configService.subscribe('app.name', callback);

      const newConfig = { 'app.name': 'Imported App Name' };
      await configService.import(JSON.stringify(newConfig));

      expect(callback).toHaveBeenCalledWith('Imported App Name', undefined, 'app.name');
    });

    test('should handle empty configuration import', async () => {
      await configService.import('{}');
      // Should not throw and should work normally
      expect(configService.get('app.name')).toBe('Test App'); // Original value preserved
    });

    test('should reject invalid JSON', async () => {
      await expect(configService.import('invalid json')).rejects.toThrow();
      await expect(configService.import('{')).rejects.toThrow();
      await expect(configService.import('')).rejects.toThrow();
    });

    test('should handle complex object import', async () => {
      const complexConfig = {
        'complex.object': {
          nested: {
            deeply: {
              value: 'deep-value',
              array: [1, 2, 3, { nested: true }]
            }
          }
        }
      };

      await configService.import(JSON.stringify(complexConfig));

      const imported = configService.get('complex.object') as any;
      expect(imported.nested.deeply.value).toBe('deep-value');
      expect(imported.nested.deeply.array).toEqual([1, 2, 3, { nested: true }]);
    });

    test('should overwrite existing configuration', async () => {
      expect(configService.get('app.name')).toBe('Test App');

      const newConfig = { 'app.name': 'Completely New App' };
      await configService.import(JSON.stringify(newConfig));

      expect(configService.get('app.name')).toBe('Completely New App');
    });

    test('should handle null and undefined values in import', async () => {
      const configWithNulls = {
        'null.value': null,
        'undefined.value': undefined,
        'normal.value': 'normal'
      };

      await configService.import(JSON.stringify(configWithNulls));

      expect(configService.get('null.value')).toBeNull();
      expect(configService.get('undefined.value')).toBeUndefined();
      expect(configService.get('normal.value')).toBe('normal');
    });
  });

  describe('getSchema method', () => {
    test('should return the configuration schema', () => {
      const schema = configService.getSchema();
      expect(schema).toEqual(mockSchema);
    });

    test('should return empty schema when none provided', () => {
      const noSchemaService = new ConfigurationService();
      const schema = noSchemaService.getSchema();
      expect(schema).toEqual({});
    });

    test('should return immutable schema reference', () => {
      const schema1 = configService.getSchema();
      const schema2 = configService.getSchema();
      expect(schema1).toBe(schema2); // Same reference
    });
  });

  describe('edge cases and error handling', () => {
    test('should handle very long configuration keys', async () => {
      const longKey = 'a'.repeat(1000);
      await configService.set(longKey, 'long-key-value');
      expect(configService.get(longKey)).toBe('long-key-value');
    });

    test('should handle very large configuration values', async () => {
      const largeValue = 'x'.repeat(100000);
      await configService.set('large.value', largeValue);
      expect(configService.get('large.value')).toBe(largeValue);
    });

    test('should handle special characters in keys', async () => {
      const specialKeys = [
        'key.with.dots',
        'key-with-dashes',
        'key_with_underscores',
        'key with spaces',
        'key/with/slashes',
        'key@with@symbols'
      ];

      for (const key of specialKeys) {
        await configService.set(key, `value-for-${key}`);
        expect(configService.get(key)).toBe(`value-for-${key}`);
      }
    });

    test('should handle circular references in configuration', async () => {
      const circularObj: any = { name: 'circular' };
      circularObj.self = circularObj;

      // Should not throw when setting
      await configService.set('circular.object', circularObj);
      
      const retrieved = configService.get('circular.object') as any;
      expect(retrieved.name).toBe('circular');
      expect(retrieved.self).toBe(retrieved); // Circular reference preserved
    });

    test('should handle concurrent modifications', async () => {
      const promises = [];
      
      // Concurrent sets
      for (let i = 0; i < 100; i++) {
        promises.push(configService.set(`concurrent.key.${i}`, `value-${i}`));
      }

      await Promise.all(promises);

      // Verify all values were set
      for (let i = 0; i < 100; i++) {
        expect(configService.get(`concurrent.key.${i}`)).toBe(`value-${i}`);
      }
    });

    test('should handle subscription cleanup on multiple unsubscribes', () => {
      const callback = jest.fn();
      const unsubscribe = configService.subscribe('test.key', callback);

      // Multiple unsubscribes should not throw
      unsubscribe();
      unsubscribe();
      unsubscribe();
    });

    test('should handle malformed validation functions', () => {
      const badSchema: ConfigSchema = {
        'bad.validation': {
          type: 'string',
          validation: null as any // Invalid validation function
        }
      };

      const badService = new ConfigurationService({}, badSchema);
      const result = badService.validate({ 'bad.validation': 'test' });

      // Should handle gracefully
      expect(result.isValid).toBe(true); // No validation function means no validation error
    });
  });

  describe('performance and memory management', () => {
    test('should handle large number of configuration keys', async () => {
      const startTime = Date.now();

      // Add many configuration keys
      for (let i = 0; i < 1000; i++) {
        await configService.set(`perf.key.${i}`, `value-${i}`);
      }

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Should complete in reasonable time
      expect(duration).toBeLessThan(5000); // Less than 5 seconds

      // Verify all keys are accessible
      expect(configService.get('perf.key.0')).toBe('value-0');
      expect(configService.get('perf.key.999')).toBe('value-999');
    });

    test('should handle large number of subscribers', async () => {
      const callbacks: jest.Mock[] = [];

      // Add many subscribers
      for (let i = 0; i < 100; i++) {
        const callback = jest.fn();
        callbacks.push(callback);
        configService.subscribe('popular.key', callback);
      }

      await configService.set('popular.key', 'popular-value');

      // All callbacks should be called
      callbacks.forEach(callback => {
        expect(callback).toHaveBeenCalledWith('popular-value', undefined, 'popular.key');
      });
    });

    test('should handle memory efficiently with frequent changes', async () => {
      const key = 'memory.test';
      
      // Make many changes to the same key
      for (let i = 0; i < 1000; i++) {
        await configService.set(key, `value-${i}`);
      }

      // Should still work correctly
      expect(configService.get(key)).toBe('value-999');
    });
  });

  describe('integration scenarios', () => {
    test('should work with real-world configuration patterns', async () => {
      // Database configuration
      await configService.set('database.primary', {
        host: 'db1.example.com',
        port: 5432,
        database: 'production',
        ssl: true,
        pool: { min: 2, max: 10 }
      });

      // API configuration
      await configService.set('api.endpoints', {
        auth: 'https://auth.api.com',
        data: 'https://data.api.com',
        files: 'https://files.api.com'
      });

      // Feature flags
      await configService.set('features', {
        newUI: true,
        betaFeatures: false,
        analytics: true,
        debugging: false
      });

      // Verify complex retrieval
      const dbConfig = configService.get('database.primary') as any;
      expect(dbConfig.host).toBe('db1.example.com');
      expect(dbConfig.pool.max).toBe(10);

      const features = configService.get('features') as any;
      expect(features.newUI).toBe(true);
      expect(features.betaFeatures).toBe(false);
    });

    test('should support configuration inheritance patterns', async () => {
      // Base configuration
      await configService.set('base.timeout', 5000);
      await configService.set('base.retries', 3);

      // Environment-specific overrides
      await configService.set('development.timeout', 10000);
      await configService.set('production.retries', 5);

      // Simulate configuration resolution
      const env = 'development';
      const timeout = configService.get(`${env}.timeout`) || configService.get('base.timeout');
      const retries = configService.get(`${env}.retries`) || configService.get('base.retries');

      expect(timeout).toBe(10000); // Overridden
      expect(retries).toBe(3); // From base
    });

    test('should handle configuration versioning', async () => {
      // Version 1 configuration
      await configService.set('config.version', '1.0');
      await configService.set('config.data', { format: 'v1', settings: ['a', 'b'] });

      // Upgrade to version 2
      await configService.set('config.version', '2.0');
      await configService.set('config.data', { 
        format: 'v2', 
        settings: { a: true, b: false },
        newFeature: 'enabled'
      });

      expect(configService.get('config.version')).toBe('2.0');
      expect((configService.get('config.data') as any).format).toBe('v2');
      expect((configService.get('config.data') as any).newFeature).toBe('enabled');
    });
  });

  describe('enterprise-level enhancements', () => {
    test('should handle high-volume concurrent set operations on single key without data loss', async () => {
      const concurrency = 100;
      let finalValue = '';
      const expectedFinalValue = `value-${concurrency - 1}`;

      const setPromises = [];
      for (let i = 0; i < concurrency; i++) {
        setPromises.push(configService.set('concurrent.single.key', `value-${i}`));
      }
      await Promise.all(setPromises);

      // Give a tiny moment for any async operations to settle, though `set` is sync for now
      await new Promise(resolve => setTimeout(resolve, 10));

      finalValue = configService.get('concurrent.single.key');
      expect(finalValue).toBe(expectedFinalValue); // Expect the last set value to persist
    });

    test('should handle concurrent import operations reliably', async () => {
      const importCount = 10;
      const importPromises = [];

      for (let i = 0; i < importCount; i++) {
        const config = JSON.stringify({ [`imported.key.${i}`]: `value-${i}` });
        importPromises.push(configService.import(config));
      }
      await Promise.all(importPromises);

      // Verify all imported keys are present
      for (let i = 0; i < importCount; i++) {
        expect(configService.get(`imported.key.${i}`)).toBe(`value-${i}`);
      }
    });

    test('should support configuration schema evolution (adding new fields)', async () => {
      // Scenario: Existing config and then schema evolves adding 'new.feature.flag'
      const oldConfig = {
        'app.name': 'Legacy App',
        'logging.level': 'info'
      };
      
      const evolvingSchema = {
        ...mockSchema,
        'new.feature.flag': {
          type: 'boolean' as 'boolean', // Explicitly cast to literal type
          required: false,
          default: false,
          description: 'A new feature flag'
        },
        'new.mandatory.setting': {
            type: 'string' as 'string', // Explicitly cast to literal type
            required: true,
            default: 'default_val',
            description: 'A new mandatory setting'
        }
      };

      const evolvingConfigService = new ConfigurationService(oldConfig, evolvingSchema);

      // Old config should still be valid with new optional fields
      const validationResult = evolvingConfigService.validate(oldConfig);
      expect(validationResult.isValid).toBe(false); // New mandatory field is missing
      expect(validationResult.errors).toContain('Missing required config: new.mandatory.setting');

      // Now add new mandatory setting and validate
      const updatedConfig = { ...oldConfig, 'new.mandatory.setting': 'new_val' };
      const updatedValidationResult = evolvingConfigService.validate(updatedConfig);
      expect(updatedValidationResult.isValid).toBe(true);

      // New fields should have defaults when not explicitly set
      expect(evolvingConfigService.get('new.feature.flag')).toBe(false);
      expect(evolvingConfigService.get('new.mandatory.setting')).toBe('new_val');
    });

    test('should maintain performance with extremely large configuration objects', async () => {
      const largeConfig: Record<string, any> = {};
      const numberOfKeys = 10000;
      for (let i = 0; i < numberOfKeys; i++) {
        largeConfig[`key.${i}`] = `value-${i}_${'long_string_'.repeat(10)}`;
      }
      largeConfig['nested.deeply.config'] = {
        level1: {
          level2: {
            level3: {
              level4: {
                final: 'deep_value'
              }
            }
          }
        }
      };

      const startTimeParse = Date.now();
      await configService.import(JSON.stringify(largeConfig));
      const endTimeParse = Date.now();
      const parseDuration = endTimeParse - startTimeParse;

      expect(parseDuration).toBeLessThan(2000); // Should parse quickly (e.g., < 2 seconds)

      const startTimeGet = Date.now();
      expect(configService.get('key.5000')).toBe(`value-5000_${'long_string_'.repeat(10)}`);
      expect((configService.get('nested.deeply.config') as any).level1.level2.level3.level4.final).toBe('deep_value');
      const endTimeGet = Date.now();
      const getDuration = endTimeGet - startTimeGet;

      expect(getDuration).toBeLessThan(100); // Should retrieve quickly (e.g., < 100 ms)

      // Test memory usage (heuristic)
      const initialMemory = process.memoryUsage().heapUsed;
      configService.export(); // Force serialization to estimate memory
      if (global.gc) {
        global.gc();
      }
      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;
      expect(memoryIncrease).toBeLessThan(initialMemory * 2); // Should not double memory for large config
    });

    test('conceptual: sensitive configuration values should ideally be encrypted or handled securely', () => {
      // NOTE: The current ConfigurationService stores values directly.
      // For enterprise-level security, sensitive values (e.g., API keys, database credentials)
      // should ideally be encrypted at rest and decrypted on access, or managed by a secure vault.
      // This test serves as a documentation point for this future enhancement.
      const sensitiveConfigKey = 'security.api_key';
      const sensitiveValue = 'super_secret_api_key_123';

      configService.set(sensitiveConfigKey, sensitiveValue);
      // Currently, retrieving it returns the plain text.
      expect(configService.get(sensitiveConfigKey)).toBe(sensitiveValue);

      // In a real enterprise system, one would expect custom
      // `getSecure` or `setSecure` methods, or integration with
      // HSM/KMS for these values.
    });
  });
});