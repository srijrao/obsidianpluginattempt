/**
 * Type guards and runtime validation utilities
 * Provides type safety for external inputs and API interactions
 */

import { MyPluginSettings } from '../types';
import { TFile, TFolder } from 'obsidian';

/**
 * Valid provider names for type safety
 */
export const VALID_PROVIDER_NAMES = ['openai', 'anthropic', 'gemini', 'ollama'] as const;
export type ValidProviderName = typeof VALID_PROVIDER_NAMES[number];

/**
 * Type guard to check if a string is a valid provider name
 * @param value - The value to check
 * @returns True if the value is a valid provider name
 */
export function isValidProviderName(value: unknown): value is ValidProviderName {
    return typeof value === 'string' && VALID_PROVIDER_NAMES.includes(value as ValidProviderName);
}

/**
 * Type guard to check if an object has the basic structure of plugin settings
 * @param value - The value to check
 * @returns True if the value appears to be valid plugin settings
 */
export function isPluginSettings(value: unknown): value is Partial<MyPluginSettings> {
    if (!value || typeof value !== 'object') {
        return false;
    }
    
    const obj = value as Record<string, unknown>;
    
    // Check for required basic properties
    return (
        (obj.provider === undefined || isValidProviderName(obj.provider)) &&
        (obj.debugMode === undefined || typeof obj.debugMode === 'boolean') &&
        (obj.selectedModel === undefined || typeof obj.selectedModel === 'string')
    );
}

/**
 * Type guard to check if a value is a valid vault adapter with basePath
 * @param value - The value to check
 * @returns True if the value has a basePath property
 */
export function isVaultAdapterWithBasePath(value: unknown): value is { basePath: string } {
    return (
        value !== null &&
        typeof value === 'object' &&
        'basePath' in value &&
        typeof (value as any).basePath === 'string'
    );
}

/**
 * Type guard to check if a value is a string
 * @param value - The value to check
 * @returns True if the value is a string
 */
export function isString(value: unknown): value is string {
    return typeof value === 'string';
}

/**
 * Type guard to check if a value is a number
 * @param value - The value to check
 * @returns True if the value is a number
 */
export function isNumber(value: unknown): value is number {
    return typeof value === 'number' && !isNaN(value);
}

/**
 * Type guard to check if a value is a boolean
 * @param value - The value to check
 * @returns True if the value is a boolean
 */
export function isBoolean(value: unknown): value is boolean {
    return typeof value === 'boolean';
}

/**
 * Type guard to check if a value is an object (not null, not array)
 * @param value - The value to check
 * @returns True if the value is a plain object
 */
export function isObject(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Type guard to check if a value is an array
 * @param value - The value to check
 * @returns True if the value is an array
 */
export function isArray(value: unknown): value is unknown[] {
    return Array.isArray(value);
}

/**
 * Validates and safely casts a provider name with runtime checking
 * @param value - The value to validate
 * @returns The validated provider name
 * @throws Error if the value is not a valid provider name
 */
export function validateProviderName(value: unknown): ValidProviderName {
    if (!isValidProviderName(value)) {
        throw new Error(`Invalid provider name: ${value}. Must be one of: ${VALID_PROVIDER_NAMES.join(', ')}`);
    }
    return value;
}

/**
 * Validates and safely casts plugin settings with runtime checking
 * @param value - The value to validate
 * @returns The validated settings object
 * @throws Error if the value is not valid plugin settings
 */
export function validatePluginSettings(value: unknown): Partial<MyPluginSettings> {
    if (!isPluginSettings(value)) {
        throw new Error('Invalid plugin settings object');
    }
    return value;
}

/**
 * Safely gets a string property from an object with validation
 * @param obj - The object to get the property from
 * @param key - The property key
 * @param defaultValue - Default value if property is missing or invalid
 * @returns The string value or default
 */
export function getStringProperty(obj: unknown, key: string, defaultValue: string = ''): string {
    if (!isObject(obj) || !(key in obj)) {
        return defaultValue;
    }
    
    const value = obj[key];
    return isString(value) ? value : defaultValue;
}

/**
 * Safely gets a number property from an object with validation
 * @param obj - The object to get the property from
 * @param key - The property key
 * @param defaultValue - Default value if property is missing or invalid
 * @returns The number value or default
 */
export function getNumberProperty(obj: unknown, key: string, defaultValue: number = 0): number {
    if (!isObject(obj) || !(key in obj)) {
        return defaultValue;
    }
    
    const value = obj[key];
    return isNumber(value) ? value : defaultValue;
}

/**
 * Safely gets a boolean property from an object with validation
 * @param obj - The object to get the property from
 * @param key - The property key
 * @param defaultValue - Default value if property is missing or invalid
 * @returns The boolean value or default
 */
export function getBooleanProperty(obj: unknown, key: string, defaultValue: boolean = false): boolean {
    if (!isObject(obj) || !(key in obj)) {
        return defaultValue;
    }
    
    const value = obj[key];
    return isBoolean(value) ? value : defaultValue;
}

/**
 * Type guard to check if a value is a non-empty string
 * @param value - The value to check
 * @returns True if the value is a non-empty string
 */
export function isNonEmptyString(value: unknown): value is string {
    return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Type guard to check if a value is a valid message object
 * @param value - The value to check
 * @returns True if the value is a valid message
 */
export function isValidMessage(value: unknown): value is { role: string; content: string } {
    if (!isObject(value)) {
        return false;
    }
    
    const obj = value as Record<string, unknown>;
    return (
        isNonEmptyString(obj.role) &&
        ['system', 'user', 'assistant'].includes(obj.role) &&
        isString(obj.content)
    );
}

/**
 * Type guard to check if a value is a valid messages array
 * @param value - The value to check
 * @returns True if the value is a valid messages array
 */
export function isValidMessagesArray(value: unknown): value is Array<{ role: string; content: string }> {
    if (!isArray(value) || value.length === 0) {
        return false;
    }
    
    return value.every(isValidMessage);
}

/**
 * Type guard to check if a value is a valid API key (non-empty string)
 * @param value - The value to check
 * @returns True if the value is a valid API key
 */
export function isValidApiKey(value: unknown): value is string {
    return isNonEmptyString(value) && value.length >= 8; // Minimum reasonable API key length
}

/**
 * Type guard to check if a value is a valid URL
 * @param value - The value to check
 * @returns True if the value is a valid URL
 */
export function isValidUrl(value: unknown): value is string {
    if (!isString(value)) {
        return false;
    }
    
    try {
        new URL(value);
        return true;
    } catch {
        return false;
    }
}

/**
 * Type guard to check if a value is a valid file path (basic validation)
 * @param value - The value to check
 * @returns True if the value appears to be a valid file path
 */
export function isValidFilePath(value: unknown): value is string {
    if (!isNonEmptyString(value)) {
        return false;
    }
    
    // Basic path validation - no null bytes, reasonable length
    return !value.includes('\0') && value.length < 1000;
}

/**
 * Type guard to check if a value is within a numeric range
 * @param value - The value to check
 * @param min - Minimum value (inclusive)
 * @param max - Maximum value (inclusive)
 * @returns True if the value is a number within the range
 */
export function isNumberInRange(value: unknown, min: number, max: number): value is number {
    return isNumber(value) && value >= min && value <= max;
}

/**
 * Type guard to check if a value is a valid temperature (0-2)
 * @param value - The value to check
 * @returns True if the value is a valid temperature
 */
export function isValidTemperature(value: unknown): value is number {
    return isNumberInRange(value, 0, 2);
}

/**
 * Type guard to check if a value is a function
 * @param value - The value to check
 * @returns True if the value is a function
 */
export function isFunction(value: unknown): value is Function {
    return typeof value === 'function';
}

/**
 * Validates that an array contains only items of a specific type
 * @param value - The array to validate
 * @param itemValidator - Function to validate each item
 * @returns True if all items pass validation
 */
export function isArrayOf<T>(value: unknown, itemValidator: (item: unknown) => item is T): value is T[] {
    if (!isArray(value)) {
        return false;
    }
    
    return value.every(itemValidator);
}

/**
 * Type guard to check if a value is a valid completion options object
 * @param value - The value to check
 * @returns True if the value is valid completion options
 */
export function isValidCompletionOptions(value: unknown): value is {
    temperature?: number;
    streamCallback?: Function;
} {
    if (!isObject(value)) {
        return false;
    }
    
    const obj = value as Record<string, unknown>;
    
    return (
        (obj.temperature === undefined || isValidTemperature(obj.temperature)) &&
        (obj.streamCallback === undefined || isFunction(obj.streamCallback))
    );
}

/**
 * Type guard to check if a value is a TFile
 * @param value - The value to check
 * @returns True if the value is a TFile
 */
export function isTFile(value: unknown): value is TFile {
    return (
        value !== null &&
        typeof value === 'object' &&
        'stat' in value &&
        'basename' in value &&
        'extension' in value
    );
}

/**
 * Type guard to check if a value is a TFolder
 * @param value - The value to check
 * @returns True if the value is a TFolder
 */
export function isTFolder(value: unknown): value is TFolder {
    return (
        value !== null &&
        typeof value === 'object' &&
        'children' in value &&
        'isRoot' in value
    );
}