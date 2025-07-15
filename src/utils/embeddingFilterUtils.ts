/**
 * @file embeddingFilterUtils.ts
 * @description Utility functions for filtering files based on embedding folder rules.
 */

import { TFile } from 'obsidian';
import { EmbeddingFolderFilter, FolderFilterRule } from '../types/settings';

/**
 * Check if a path matches a glob-like pattern.
 * Supports basic wildcards: * for any characters, ** for recursive directories.
 * 
 * @param pattern - The pattern to match against
 * @param path - The path to test
 * @returns True if the path matches the pattern
 */
export function matchesPattern(pattern: string, path: string): boolean {
    // Normalize paths (use forward slashes)
    const normalizedPattern = pattern.replace(/\\/g, '/');
    const normalizedPath = path.replace(/\\/g, '/');

    // Exact match
    if (normalizedPattern === normalizedPath) {
        return true;
    }

    // Build regex for glob-like matching
    let pat = normalizedPattern;
    let regexStr = '^';
    // Handle leading recursive wildcard '**/' by allowing optional prefix
    if (pat.startsWith('**/')) {
        regexStr += '(?:.*/)?';
        pat = pat.slice(3);
    }
    // Escape regex special characters (except glob wildcards)
    const escaped = pat.replace(/([.+?^${}()|[\]\\])/g, '\\$1');
    // Replace glob wildcards: ** -> .* and * -> [^/]*
    const body = escaped
        .replace(/\*\*/g, '§RECURSIVE§')
        .replace(/\*/g, '[^/]*')
        .replace(/§RECURSIVE§/g, '.*');
    regexStr += body + '$';
    
    try {
        const regex = new RegExp(regexStr);
        return regex.test(normalizedPath);
    } catch (error) {
        console.warn('Invalid pattern:', pattern, error);
        return false;
    }
}

/**
 * Check if a file path matches any of the folder filter rules.
 * 
 * @param filePath - The file path to check
 * @param rules - Array of folder filter rules
 * @returns True if the file matches any rule
 */
export function matchesAnyRule(filePath: string, rules: FolderFilterRule[]): boolean {
    if (!rules || rules.length === 0) {
        return false;
    }
    
    return rules.some(rule => {
        const normalizedRulePath = rule.path.replace(/\\/g, '/');
        const normalizedFilePath = filePath.replace(/\\/g, '/');
        
        if (rule.recursive) {
            // For recursive rules, check if the file is in the folder or any subfolder
            // First check if it matches the exact pattern
            if (matchesPattern(normalizedRulePath, normalizedFilePath)) {
                return true;
            }
            
            // Then check with /** appended if not already there
            const recursivePattern = normalizedRulePath.endsWith('/**') 
                ? normalizedRulePath 
                : `${normalizedRulePath}/**`;
            
            return matchesPattern(recursivePattern, normalizedFilePath);
        } else {
            // For non-recursive rules, only check direct children
            // Check if the rule path matches exactly
            if (matchesPattern(normalizedRulePath, normalizedFilePath)) {
                return true;
            }
            
            // Check with /* appended for direct children
            const directPattern = normalizedRulePath.endsWith('/*') 
                ? normalizedRulePath 
                : `${normalizedRulePath}/*`;
                
            return matchesPattern(directPattern, normalizedFilePath);
        }
    });
}

/**
 * Filter files based on embedding folder filter settings.
 * 
 * @param files - Array of TFile objects to filter
 * @param filterSettings - The embedding folder filter configuration
 * @returns Array of filtered TFile objects
 */
export function filterFilesForEmbedding(files: TFile[], filterSettings: EmbeddingFolderFilter): TFile[] {
    if (!filterSettings || filterSettings.mode === 'off' || !filterSettings.rules || filterSettings.rules.length === 0) {
        return files; // No filtering
    }
    
    return files.filter(file => {
        const filePath = file.path;
        const matchesRules = matchesAnyRule(filePath, filterSettings.rules);
        
        if (filterSettings.mode === 'include') {
            // Include mode: only include files that match the rules
            return matchesRules;
        } else if (filterSettings.mode === 'exclude') {
            // Exclude mode: exclude files that match the rules
            return !matchesRules;
        }
        
        return true; // Default: include all files
    });
}

/**
 * Get a human-readable description of the current filter settings.
 * 
 * @param filterSettings - The embedding folder filter configuration
 * @returns A description string
 */
export function getFilterDescription(filterSettings: EmbeddingFolderFilter): string {
    if (!filterSettings || filterSettings.mode === 'off' || !filterSettings.rules || filterSettings.rules.length === 0) {
        return 'No filtering (all files will be embedded)';
    }
    
    const ruleCount = filterSettings.rules.length;
    const modeText = filterSettings.mode === 'include' ? 'including only' : 'excluding';
    
    return `Active filtering: ${modeText} files from ${ruleCount} folder rule${ruleCount !== 1 ? 's' : ''}`;
}

/**
 * Validate a folder filter rule.
 * 
 * @param rule - The rule to validate
 * @returns Array of validation error messages (empty if valid)
 */
export function validateFilterRule(rule: FolderFilterRule): string[] {
    const errors: string[] = [];
    
    if (!rule.path || rule.path.trim() === '') {
        errors.push('Path cannot be empty');
    }
    
    // Check for invalid characters or patterns
    if (rule.path.includes('\\\\') || rule.path.includes('//')) {
        errors.push('Path contains invalid double slashes');
    }
    
    return errors;
}

/**
 * Normalize a folder path for consistent processing.
 * 
 * @param path - The path to normalize
 * @returns Normalized path
 */
export function normalizeFolderPath(path: string): string {
    return path
        .replace(/\\/g, '/') // Convert backslashes to forward slashes
        .replace(/\/+/g, '/') // Remove duplicate slashes
        .replace(/^\//, '') // Remove leading slash
        .replace(/\/$/, ''); // Remove trailing slash
}
