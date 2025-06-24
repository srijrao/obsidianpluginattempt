import { Message } from "../types";

/**
 * Represents a chat session
 * 
 * @property id - Unique identifier for the session
 * @property name - Human-readable name for the session
 * @property created - Timestamp when the session was created
 * @property lastUpdated - Timestamp when the session was last updated
 * @property messages - List of messages in the session
 */
export interface ChatSession {
    id: string;
    name: string;
    created: number;
    lastUpdated: number;
    messages: Message[];
}

/**
 * Represents task status and progress
 */
export interface TaskStatus {
    status: 'idle' | 'running' | 'stopped' | 'completed' | 'limit_reached' | 'waiting_for_user';
    progress?: {
        current: number;
        total?: number;
        description?: string;
    };
    toolExecutionCount: number;
    maxToolExecutions: number;
    canContinue?: boolean;
    lastUpdateTime: string;
}
