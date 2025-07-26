/**
 * @file testRunner.ts
 * @description Test runner for development and debugging
 */

import type MyPlugin from '../src/main';
import { Notice } from 'obsidian';

/**
 * Registers test commands for development and debugging purposes.
 * Only available when debug mode is enabled.
 */
export function registerTestCommands(plugin: MyPlugin) {
    // Basic IndexedDB test
    plugin.addCommand({
        id: 'test-basic-indexeddb',
        name: 'Test: Basic IndexedDB Functionality',
        callback: async () => {
            try {
                new Notice('Testing basic IndexedDB functionality...');
                await runBasicIndexedDBTest();
                new Notice('✅ IndexedDB test completed successfully!');
            } catch (error) {
                new Notice(`❌ IndexedDB test failed: ${error.message}`);
                console.error('IndexedDB test failed:', error);
            }
        }
    });

    // Helper function for basic IndexedDB test
    async function runBasicIndexedDBTest() {
        try {
            // Test basic IndexedDB functionality
            const dbName = 'test-db-' + Date.now();
            
            const db = await new Promise<IDBDatabase>((resolve, reject) => {
                const request = indexedDB.open(dbName, 1);
                
                request.onerror = () => reject(new Error('Failed to open test database'));
                request.onsuccess = () => resolve(request.result);
                
                request.onupgradeneeded = (event) => {
                    const db = (event.target as IDBOpenDBRequest).result;
                    const store = db.createObjectStore('test', { keyPath: 'id' });
                };
            });
            
            // Test write operation
            await new Promise<void>((resolve, reject) => {
                const transaction = db.transaction(['test'], 'readwrite');
                const store = transaction.objectStore('test');
                const request = store.put({ id: 1, name: 'Hello IndexedDB' });
                
                request.onsuccess = () => resolve();
                request.onerror = () => reject(new Error('Failed to write test data'));
            });
            
            // Test read operation
            const result = await new Promise<any>((resolve, reject) => {
                const transaction = db.transaction(['test'], 'readonly');
                const store = transaction.objectStore('test');
                const request = store.get(1);
                
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(new Error('Failed to read test data'));
            });
            
            db.close();
            
            // Clean up test database
            indexedDB.deleteDatabase(dbName);
            
            console.log('✅ IndexedDB basic test: SUCCESS', result);
        } catch (error) {
            console.error('❌ IndexedDB basic test: ERROR', error);
            throw error;
        }
    }

    console.log('Test commands registered for basic functionality debugging');
}
