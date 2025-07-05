/**
 * Enhanced validation utilities with security hardening
 * Provides comprehensive input validation and sanitization
 */

// Constants for validation limits
const MAX_INPUT_LENGTH = 50000;
const MAX_API_KEY_LENGTH = 200;
const MIN_API_KEY_LENGTH = 20;

/**
 * Validates if a string is a plausible OpenAI API key.
 * Starts with 'sk-' and has a reasonable length.
 * @param key The API key string.
 * @returns True if the key is valid, false otherwise.
 */
export function isValidOpenAIApiKey(key: string): boolean {
    if (typeof key !== 'string') return false;
    if (key.length < MIN_API_KEY_LENGTH || key.length > MAX_API_KEY_LENGTH) return false;
    return key.startsWith('sk-') && key.length >= 40; // OpenAI keys are typically 40+ chars
}

/**
 * Validates if a string is a plausible Anthropic API key.
 * Starts with 'sk-ant-' and has a reasonable length.
 * @param key The API key string.
 * @returns True if the key is valid, false otherwise.
 */
export function isValidAnthropicApiKey(key: string): boolean {
    if (typeof key !== 'string') return false;
    if (key.length < MIN_API_KEY_LENGTH || key.length > MAX_API_KEY_LENGTH) return false;
    return key.startsWith('sk-ant-') && key.length >= 40; // Anthropic keys are typically 40+ chars
}

/**
 * Validates if a string is a plausible Google Gemini API key.
 * Google API keys are typically alphanumeric and long.
 * @param key The API key string.
 * @returns True if the key is valid, false otherwise.
 */
export function isValidGoogleApiKey(key: string): boolean {
    if (typeof key !== 'string') return false;
    if (key.length < MIN_API_KEY_LENGTH || key.length > MAX_API_KEY_LENGTH) return false;
    // Google API keys are typically long alphanumeric strings
    // A simple check for length and alphanumeric characters
    return key.length >= 30 && /^[a-zA-Z0-9_-]+$/.test(key);
}

/**
 * Validates if a string is a valid URL.
 * @param url The URL string.
 * @returns True if the string is a valid URL, false otherwise.
 */
export function isValidUrl(url: string): boolean {
    if (typeof url !== 'string') return false;
    if (url.length > 2048) return false; // Reasonable URL length limit
    
    try {
        const parsedUrl = new URL(url);
        // Only allow http and https protocols for security
        return ['http:', 'https:'].includes(parsedUrl.protocol);
    } catch (e) {
        return false;
    }
}

/**
 * Validates and sanitizes user input to prevent injection attacks
 * @param input The input string to validate
 * @returns Sanitized input string
 * @throws Error if input is invalid or too long
 */
export function validateUserInput(input: string): string {
    if (typeof input !== 'string') {
        throw new Error('Input must be a string');
    }
    
    if (input.length > MAX_INPUT_LENGTH) {
        throw new Error(`Input too long. Maximum length is ${MAX_INPUT_LENGTH} characters`);
    }
    
    // Basic sanitization to prevent common injection attempts
    return sanitizeInput(input);
}

/**
 * Sanitizes input string to prevent XSS and injection attacks
 * @param input The input string to sanitize
 * @returns Sanitized string
 */
export function sanitizeInput(input: string): string {
    if (typeof input !== 'string') return '';
    
    return input
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;')
        .replace(/\x00/g, '') // Remove null bytes
        .trim();
}

/**
 * Validates API key format and sanitizes it
 * @param key The API key to validate
 * @param provider The provider type for specific validation
 * @returns Validated and sanitized API key
 * @throws Error if key is invalid
 */
export function validateApiKey(key: string, provider: 'openai' | 'anthropic' | 'gemini'): string {
    if (typeof key !== 'string') {
        throw new Error('API key must be a string');
    }
    
    // Remove any whitespace
    const cleanKey = key.trim();
    
    if (cleanKey.length === 0) {
        throw new Error('API key cannot be empty');
    }
    
    // Validate based on provider
    let isValid = false;
    switch (provider) {
        case 'openai':
            isValid = isValidOpenAIApiKey(cleanKey);
            break;
        case 'anthropic':
            isValid = isValidAnthropicApiKey(cleanKey);
            break;
        case 'gemini':
            isValid = isValidGoogleApiKey(cleanKey);
            break;
    }
    
    if (!isValid) {
        throw new Error(`Invalid ${provider} API key format`);
    }
    
    return cleanKey;
}

/**
 * Validates temperature parameter for AI models
 * @param temperature The temperature value
 * @returns Validated temperature
 * @throws Error if temperature is invalid
 */
export function validateTemperature(temperature: unknown): number {
    if (typeof temperature !== 'number' || isNaN(temperature)) {
        throw new Error('Temperature must be a number');
    }
    
    if (temperature < 0 || temperature > 2) {
        throw new Error('Temperature must be between 0 and 2');
    }
    
    return temperature;
}

/**
 * Validates max tokens parameter for AI models
 * @param maxTokens The max tokens value
 * @returns Validated max tokens
 * @throws Error if max tokens is invalid
 */
export function validateMaxTokens(maxTokens: unknown): number {
    if (typeof maxTokens !== 'number' || isNaN(maxTokens)) {
        throw new Error('Max tokens must be a number');
    }
    
    if (maxTokens <= 0 || maxTokens > 100000) {
        throw new Error('Max tokens must be between 1 and 100000');
    }
    
    return Math.floor(maxTokens);
}

/**
 * Validates file path to prevent directory traversal attacks
 * @param path The file path to validate
 * @returns Validated path
 * @throws Error if path is invalid or dangerous
 */
export function validateFilePath(path: string): string {
    if (typeof path !== 'string') {
        throw new Error('File path must be a string');
    }
    
    const cleanPath = path.trim();
    
    if (cleanPath.length === 0) {
        throw new Error('File path cannot be empty');
    }
    
    // Check for directory traversal attempts
    if (cleanPath.includes('..') || cleanPath.includes('~')) {
        throw new Error('File path contains invalid characters');
    }
    
    // Check for absolute paths (should be relative)
    if (cleanPath.startsWith('/') || /^[A-Za-z]:/.test(cleanPath)) {
        throw new Error('File path must be relative');
    }
    
    return cleanPath;
}

/**
 * Validates content length to prevent excessive memory usage
 * @param content The content to validate
 * @param maxLength Maximum allowed length
 * @returns Validated content
 * @throws Error if content is too long
 */
export function validateContentLength(content: string, maxLength: number = MAX_INPUT_LENGTH): string {
    if (typeof content !== 'string') {
        throw new Error('Content must be a string');
    }
    
    if (content.length > maxLength) {
        throw new Error(`Content too long. Maximum length is ${maxLength} characters`);
    }
    
    return content;
}

/**
 * Rate limiting validation - checks if action is within rate limits
 * @param key Unique key for the action
 * @param limit Maximum number of actions allowed
 * @param windowMs Time window in milliseconds
 * @returns True if action is allowed, false if rate limited
 */
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

export function isWithinRateLimit(key: string, limit: number, windowMs: number): boolean {
    const now = Date.now();
    const entry = rateLimitMap.get(key);
    
    if (!entry || now > entry.resetTime) {
        // Reset or create new entry
        rateLimitMap.set(key, { count: 1, resetTime: now + windowMs });
        return true;
    }
    
    if (entry.count >= limit) {
        return false; // Rate limited
    }
    
    entry.count++;
    return true;
}

/**
 * Clears rate limit data for a specific key
 * @param key The key to clear
 */
export function clearRateLimit(key: string): void {
    rateLimitMap.delete(key);
}