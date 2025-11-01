import { ConfigurationService } from '../src/services/crosscutting/ConfigurationService';
import { ConfigSchema } from '../src/services/interfaces';

describe('ConfigurationService', () => {
  let configService: ConfigurationService;
  let mockSchema: ConfigSchema;

  beforeEach(() => {
    mockSchema = {
      'test.string': {
        type: 'string',
        default: 'default',
        description: 'Test string config'
      },
      'test.number': {
        type: 'number',
        default: 42,
        description: 'Test number config'
      },
      'test.boolean': {
        type: 'boolean',
        default: true,
        description: 'Test boolean config'
      },
      'test.required': {
        type: 'string',
        required: true,
        description: 'Required config'
      }
    };
    configService = new ConfigurationService({}, mockSchema);
  });

  describe('Basic CRUD Operations', () => {
    test('get() returns stored values', () => {
      configService.set('test.key', 'test-value');
      expect(configService.get('test.key')).toBe('test-value');
    });

    test('get() returns default values when key does not exist', () => {
      expect(configService.get('nonexistent', 'default-value')).toBe('default-value');
    });

    test('get() returns undefined when no default provided for nonexistent key', () => {
      expect(configService.get('nonexistent')).toBeUndefined();
    });

    test('set() stores values and returns promise', async () => {
      const result = configService.set('test.key', 'test-value');
      expect(result).toBeInstanceOf(Promise);
      await result;
      expect(configService.get('test.key')).toBe('test-value');
    });

    test('has() returns true for existing keys', () => {
      configService.set('test.key', 'value');
      expect(configService.has('test.key')).toBe(true);
    });

    test('has() returns false for non-existing keys', () => {
      expect(configService.has('nonexistent')).toBe(false);
    });
  });

  describe('Subscription System', () => {
    test('subscribe() adds change listeners', () => {
      const callback = jest.fn();
      configService.subscribe('test.key', callback);

      configService.set('test.key', 'new-value');

      expect(callback).toHaveBeenCalledWith('new-value', undefined, 'test.key');
    });

    test('subscribe() returns unsubscribe function', () => {
      const callback = jest.fn();
      const unsubscribe = configService.subscribe('test.key', callback);

      unsubscribe();
      configService.set('test.key', 'new-value');

      expect(callback).not.toHaveBeenCalled();
    });

    test('multiple subscribers receive notifications', () => {
      const callback1 = jest.fn();
      const callback2 = jest.fn();

      configService.subscribe('test.key', callback1);
      configService.subscribe('test.key', callback2);

      configService.set('test.key', 'new-value');

      expect(callback1).toHaveBeenCalledWith('new-value', undefined, 'test.key');
      expect(callback2).toHaveBeenCalledWith('new-value', undefined, 'test.key');
    });

    test('subscribers receive old and new values correctly', () => {
      const callback = jest.fn();
      configService.subscribe('test.key', callback);

      configService.set('test.key', 'first-value');
      configService.set('test.key', 'second-value');

      expect(callback).toHaveBeenNthCalledWith(1, 'first-value', undefined, 'test.key');
      expect(callback).toHaveBeenNthCalledWith(2, 'second-value', 'first-value', 'test.key');
    });

    test('unsubscribe function removes listeners', () => {
      const callback1 = jest.fn();
      const callback2 = jest.fn();

      const unsubscribe1 = configService.subscribe('test.key', callback1);
      configService.subscribe('test.key', callback2);

      unsubscribe1();
      configService.set('test.key', 'new-value');

      expect(callback1).not.toHaveBeenCalled();
      expect(callback2).toHaveBeenCalledWith('new-value', undefined, 'test.key');
    });
  });

  describe('Validation', () => {
    test('validate() passes valid configurations', () => {
      const validConfig = {
        'test.string': 'value',
        'test.number': 100,
        'test.boolean': false,
        'test.required': 'required-value'
      };

      const result = configService.validate(validConfig);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('validate() rejects missing required fields', () => {
      const invalidConfig = {
        'test.string': 'value',
        'test.number': 100,
        'test.boolean': false
        // missing test.required
      };

      const result = configService.validate(invalidConfig);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Missing required config: test.required');
    });

    test('validate() passes when required fields are present', () => {
      const validConfig = {
        'test.required': 'present'
      };

      const result = configService.validate(validConfig);
      expect(result.isValid).toBe(true);
    });

    test('validate() handles empty config object', () => {
      const result = configService.validate({});
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Missing required config: test.required');
    });
  });

  describe('Import/Export', () => {
    test('export() returns JSON string of all config', () => {
      configService.set('test.key1', 'value1');
      configService.set('test.key2', 'value2');

      const exported = configService.export();
      const parsed = JSON.parse(exported);

      expect(parsed['test.key1']).toBe('value1');
      expect(parsed['test.key2']).toBe('value2');
    });

    test('import() loads valid JSON configurations', async () => {
      const configData = JSON.stringify({
        'test.key1': 'imported-value1',
        'test.key2': 'imported-value2'
      });

      await configService.import(configData);

      expect(configService.get('test.key1')).toBe('imported-value1');
      expect(configService.get('test.key2')).toBe('imported-value2');
    });

    test('import() notifies subscribers of all changes', async () => {
      const callback = jest.fn();
      configService.subscribe('test.key1', callback);

      const configData = JSON.stringify({
        'test.key1': 'new-value'
      });

      await configService.import(configData);

      expect(callback).toHaveBeenCalledWith('new-value', undefined, 'test.key1');
    });

    test('import() rejects invalid JSON', async () => {
      const invalidJson = '{ invalid json }';

      await expect(configService.import(invalidJson)).rejects.toThrow();
    });

    test('import() handles empty JSON object', async () => {
      await configService.import('{}');
      expect(configService.get('nonexistent')).toBeUndefined();
    });
  });

  describe('Schema Management', () => {
    test('getSchema() returns current schema', () => {
      const schema = configService.getSchema();
      expect(schema).toEqual(mockSchema);
    });

    test('constructor accepts initial config', () => {
      const initialConfig = { 'test.initial': 'value' };
      const service = new ConfigurationService(initialConfig, mockSchema);

      expect(service.get('test.initial')).toBe('value');
    });

    test('constructor handles undefined schema', () => {
      const service = new ConfigurationService();
      expect(service.getSchema()).toEqual({});
    });
  });

  describe('Edge Cases', () => {
    test('handles undefined values', () => {
      configService.set('test.undefined', undefined);
      expect(configService.get('test.undefined')).toBeUndefined();
      expect(configService.has('test.undefined')).toBe(true);
    });

    test('handles null values', () => {
      configService.set('test.null', null);
      expect(configService.get('test.null')).toBeNull();
      expect(configService.has('test.null')).toBe(true);
    });

    test('handles complex nested objects', () => {
      const complexObject = {
        nested: {
          array: [1, 2, 3],
          string: 'value'
        }
      };

      configService.set('test.complex', complexObject);
      expect(configService.get('test.complex')).toEqual(complexObject);
    });

    test('handles array values', () => {
      const arrayValue = [1, 'two', { three: 3 }];
      configService.set('test.array', arrayValue);
      expect(configService.get('test.array')).toEqual(arrayValue);
    });

    test('reload() placeholder works', async () => {
      // Currently just resolves, but can be extended for file-based config
      await expect(configService.reload()).resolves.toBeUndefined();
    });
  });

  describe('Concurrent Operations', () => {
    test('handles multiple simultaneous subscriptions', () => {
      const callbacks = [jest.fn(), jest.fn(), jest.fn()];
      const unsubscribes = callbacks.map(cb => configService.subscribe('test.key', cb));

      configService.set('test.key', 'value');

      callbacks.forEach(callback => {
        expect(callback).toHaveBeenCalledWith('value', undefined, 'test.key');
      });

      // Test selective unsubscribe
      unsubscribes[1]();
      configService.set('test.key', 'value2');

      expect(callbacks[0]).toHaveBeenCalledWith('value2', 'value', 'test.key');
      expect(callbacks[1]).not.toHaveBeenCalledWith('value2', 'value', 'test.key');
      expect(callbacks[2]).toHaveBeenCalledWith('value2', 'value', 'test.key');
    });

    test('handles rapid configuration changes', () => {
      const callback = jest.fn();
      configService.subscribe('test.key', callback);

      // Rapid changes
      configService.set('test.key', 'value1');
      configService.set('test.key', 'value2');
      configService.set('test.key', 'value3');

      expect(callback).toHaveBeenCalledTimes(3);
      expect(callback).toHaveBeenNthCalledWith(1, 'value1', undefined, 'test.key');
      expect(callback).toHaveBeenNthCalledWith(2, 'value2', 'value1', 'test.key');
      expect(callback).toHaveBeenNthCalledWith(3, 'value3', 'value2', 'test.key');
    });
  });
});
