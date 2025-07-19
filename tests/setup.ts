/**
 * @file setup.ts
 * @description Jest test setup file for the AI Assistant Obsidian plugin
 */

import 'jest-environment-jsdom';

// Mock IndexedDB for testing
import 'fake-indexeddb/auto';

// Add structuredClone polyfill for Node.js environment
if (typeof globalThis.structuredClone === 'undefined') {
  globalThis.structuredClone = (obj: any) => {
    if (obj === null || typeof obj !== 'object') return obj;
    if (obj instanceof Date) return new Date(obj.getTime());
    if (obj instanceof Array) return obj.map(item => globalThis.structuredClone(item));
    if (typeof obj === 'object') {
      const cloned: any = {};
      for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
          cloned[key] = globalThis.structuredClone(obj[key]);
        }
      }
      return cloned;
    }
    return obj;
  };
}

// Global test setup
beforeEach(async () => {
  // Clear all mocks before each test
  jest.clearAllMocks();
  
  // Reset IndexedDB state completely
  if (typeof indexedDB !== 'undefined') {
    // Clear all databases
    const databases = (indexedDB as any)._databases;
    if (databases) {
      Object.keys(databases).forEach(name => {
        delete databases[name];
      });
    }
    
    // Clear all connections
    const connections = (indexedDB as any)._connections;
    if (connections) {
      Object.keys(connections).forEach(name => {
        delete connections[name];
      });
    }
    
    // Reset any cached state
    if ((indexedDB as any)._cachedState) {
      (indexedDB as any)._cachedState = {};
    }
  }
  
  // Reset global state that might persist between tests
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.clear();
  }
  
  if (typeof window !== 'undefined' && window.sessionStorage) {
    window.sessionStorage.clear();
  }
});

afterEach(() => {
  // Clean up after each test
  jest.restoreAllMocks();
});

// Global test utilities
declare global {
  namespace jest {
    interface Matchers<R> {
      toBeValidVector(): R;
      toHaveValidMetadata(): R;
    }
  }
}

// Custom Jest matchers for vector testing
expect.extend({
  toBeValidVector(received: any) {
    const pass = (
      received &&
      typeof received.id === 'string' &&
      typeof received.text === 'string' &&
      Array.isArray(received.embedding) &&
      received.embedding.every((val: any) => typeof val === 'number') &&
      typeof received.timestamp === 'number'
    );

    if (pass) {
      return {
        message: () => `expected ${received} not to be a valid vector`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected ${received} to be a valid vector with id, text, embedding array, and timestamp`,
        pass: false,
      };
    }
  },

  toHaveValidMetadata(received: any) {
    const pass = (
      received &&
      typeof received.vectorCount === 'number' &&
      typeof received.lastModified === 'number' &&
      typeof received.summaryHash === 'string' &&
      typeof received.version === 'string' &&
      typeof received.lastBackup === 'number'
    );

    if (pass) {
      return {
        message: () => `expected ${received} not to have valid metadata`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected ${received} to have valid metadata with vectorCount, lastModified, summaryHash, version, and lastBackup`,
        pass: false,
      };
    }
  },
});