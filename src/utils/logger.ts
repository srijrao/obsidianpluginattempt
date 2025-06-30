/**
 * Enhanced debug logger for the plugin.
 * @param debugMode Whether debug mode is enabled
 * @param level Log level: 'debug' | 'info' | 'warn' | 'error'. Defaults to 'debug'.
 * @param args Arguments to log.
 */
export function debugLog(debugMode: boolean, level: 'debug' | 'info' | 'warn' | 'error' = 'debug', ...args: any[]) {
    if (!debugMode) return;
    const timestamp = new Date().toISOString();
    const prefix = `[AI Assistant ${level.toUpperCase()} ${timestamp}]`;
    switch (level) {
        case 'info':
            
            console.info(prefix, ...args);
            break;
        case 'warn':
            
            console.warn(prefix, ...args);
            break;
        case 'error':
            
            console.error(prefix, ...args);
            break;
        default:
            
            console.debug(prefix, ...args);
    }
}
