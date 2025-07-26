/**
 * @file setup.ts
 * @description Jest test setup file for the AI Assistant Obsidian plugin
 */

import 'jest-environment-jsdom';

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

// Global test utilities can be added here as needed