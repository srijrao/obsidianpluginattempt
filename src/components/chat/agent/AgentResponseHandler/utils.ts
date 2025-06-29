import { CONSTANTS } from "./constants";

/**
 * Normalize path separators to forward slashes.
 */
export function normalizePath(path: string): string {
    return path.replace(/\\/g, CONSTANTS.PATH_SEPARATOR);
}

/**
 * Helper method to stringify JSON with consistent indentation.
 */
export function stringifyJson(obj: any): string {
    return JSON.stringify(obj, null, CONSTANTS.JSON_INDENT);
}
