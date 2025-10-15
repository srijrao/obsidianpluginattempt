/**
 * @file logger.test.ts
 * @description Tests for the logger utility
 */

import { debugLog } from '../../src/utils/logger';

describe('debugLog', () => {
    let consoleSpy: {
        debug: jest.SpyInstance;
        info: jest.SpyInstance;
        warn: jest.SpyInstance;
        error: jest.SpyInstance;
    };

    beforeEach(() => {
        consoleSpy = {
            debug: jest.spyOn(console, 'debug').mockImplementation(),
            info: jest.spyOn(console, 'info').mockImplementation(),
            warn: jest.spyOn(console, 'warn').mockImplementation(),
            error: jest.spyOn(console, 'error').mockImplementation(),
        };
    });

    afterEach(() => {
        Object.values(consoleSpy).forEach(spy => spy.mockRestore());
    });

    it('should not log when debug mode is disabled', () => {
        debugLog(false, 'debug', 'test message');
        expect(consoleSpy.debug).not.toHaveBeenCalled();
    });

    it('should log debug messages when debug mode is enabled', () => {
        debugLog(true, 'debug', 'test message');
        expect(consoleSpy.debug).toHaveBeenCalled();
        const callArgs = consoleSpy.debug.mock.calls[0];
        expect(callArgs[0]).toMatch(/\[AI Assistant DEBUG/);
        expect(callArgs[1]).toBe('test message');
    });

    it('should log info messages', () => {
        debugLog(true, 'info', 'info message');
        expect(consoleSpy.info).toHaveBeenCalled();
        const callArgs = consoleSpy.info.mock.calls[0];
        expect(callArgs[0]).toMatch(/\[AI Assistant INFO/);
        expect(callArgs[1]).toBe('info message');
    });

    it('should log warn messages', () => {
        debugLog(true, 'warn', 'warning message');
        expect(consoleSpy.warn).toHaveBeenCalled();
        const callArgs = consoleSpy.warn.mock.calls[0];
        expect(callArgs[0]).toMatch(/\[AI Assistant WARN/);
        expect(callArgs[1]).toBe('warning message');
    });

    it('should log error messages', () => {
        debugLog(true, 'error', 'error message');
        expect(consoleSpy.error).toHaveBeenCalled();
        const callArgs = consoleSpy.error.mock.calls[0];
        expect(callArgs[0]).toMatch(/\[AI Assistant ERROR/);
        expect(callArgs[1]).toBe('error message');
    });

    it('should handle multiple arguments', () => {
        debugLog(true, 'debug', 'message', { key: 'value' }, 123);
        expect(consoleSpy.debug).toHaveBeenCalled();
        const callArgs = consoleSpy.debug.mock.calls[0];
        expect(callArgs).toHaveLength(4);
        expect(callArgs[1]).toBe('message');
        expect(callArgs[2]).toEqual({ key: 'value' });
        expect(callArgs[3]).toBe(123);
    });

    it('should include timestamp in log prefix', () => {
        debugLog(true, 'debug', 'test');
        expect(consoleSpy.debug).toHaveBeenCalled();
        const callArgs = consoleSpy.debug.mock.calls[0];
        // Check for ISO timestamp format
        expect(callArgs[0]).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it('should default to debug level when no level specified', () => {
        debugLog(true, undefined as any, 'test');
        expect(consoleSpy.debug).toHaveBeenCalled();
    });
});
