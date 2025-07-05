/**
 * Centralized constants for AgentResponseHandler and related modules.
 */
export const CONSTANTS = {
    NOTIFICATION_DISPLAY_DELAY: 100,
    NOTIFICATION_AUTO_REMOVE_DELAY: 5000,
    NOTIFICATION_FADE_DELAY: 300,
    MAX_ADDITIONAL_TOOLS: 100, 
    REASONING_ID_PREFIX: 'reasoning-',
    TOOL_DISPLAY_ID_SEPARATOR: '-',
    ERROR_MESSAGES: {
        TOOL_EXECUTION_FAILED: 'Tool execution failed',
        TOOL_EXECUTION_TIMEOUT: 'Tool execution timed out',
        COPY_FAILED: 'Failed to copy tool result',
        RERUN_FAILED: 'Failed to re-run tool'
    },
    JSON_INDENT: 2,
    MD_EXTENSION: '.md',
    PATH_SEPARATOR: '/',
    COMMAND_KEY_SEPARATOR: ':'
} as const;
