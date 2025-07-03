import { CONSTANTS } from "./constants";

/**
 * Converts all backslashes in a file path to the configured path separator (usually '/').
 * @param path The file path to normalize.
 * @returns The normalized path with consistent separators.
 */
export function normalizePath(path: string): string {
    return path.replace(/\\/g, CONSTANTS.PATH_SEPARATOR);
}

/**
 * Converts an object to a JSON string with consistent indentation.
 * @param obj The object to stringify.
 * @returns The pretty-printed JSON string.
 */
export function stringifyJson(obj: any): string {
    return JSON.stringify(obj, null, CONSTANTS.JSON_INDENT);
}
