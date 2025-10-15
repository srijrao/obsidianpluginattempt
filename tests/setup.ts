/**
 * @file setup.ts
 * @description Test setup and global configuration for Jest
 */

// Mock Obsidian Notice
(global as any).Notice = jest.fn().mockImplementation((message: string) => {
    // Mock implementation
    return { message };
});

// Mock window.crypto for tests
Object.defineProperty(global, 'crypto', {
    value: {
        getRandomValues: (arr: any) => {
            for (let i = 0; i < arr.length; i++) {
                arr[i] = Math.floor(Math.random() * 256);
            }
            return arr;
        }
    }
});

// Setup fetch mock
global.fetch = jest.fn();

// Mock timers setup helper
export const setupTimers = () => {
    jest.useFakeTimers();
};

export const cleanupTimers = () => {
    jest.clearAllTimers();
    jest.useRealTimers();
};

// Common test utilities
export const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const flushPromises = () => new Promise(resolve => setImmediate(resolve));

// Cleanup after each test
afterEach(() => {
    jest.clearAllMocks();
});
