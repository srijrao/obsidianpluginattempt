// Global test setup

// Mock Obsidian API
global.require = jest.fn() as any;

// Mock indexedDB for tests
if (typeof indexedDB === 'undefined') {
  (global as any).indexedDB = {
    open: jest.fn(() => ({
      onupgradeneeded: jest.fn(),
      onsuccess: jest.fn(),
      onerror: jest.fn(),
      result: {},
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      error: null,
      readyState: 'done',
      transaction: null,
      source: null,
    })),
    deleteDatabase: jest.fn(),
    cmp: jest.fn(),
  };
}

// Mock DOM APIs that might be used
Object.defineProperty(window, 'localStorage', {
  value: {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
    clear: jest.fn(),
  },
  writable: true,
});

// Mock console methods to avoid noise in tests
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

// Mock setTimeout and setInterval for testing
jest.useFakeTimers();