import { Message } from '../types';

/**
 * Represents a detailed breakdown of token usage by source.
 */
export interface TokenBreakdown {
    /** Tokens from the system prompt */
    systemPrompt: number;
    /** Tokens from the reference note (if enabled) */
    referenceNote: number;
    /** Tokens from context notes */
    contextNotes: number;
    /** Tokens from chat history */
    chatHistory: number;
    /** Tokens from current user input */
    currentInput: number;
    /** Total tokens across all sources */
    total: number;
    /** Maximum tokens allowed by the model */
    modelMax: number;
}

/**
 * Estimates token count for text content.
 * Uses a simple approximation: 1 token ≈ 4 characters for English text.
 * This is a rough estimate similar to OpenAI's rule of thumb.
 * @param text The text to count tokens for
 * @returns Estimated token count
 */
export function estimateTokenCount(text: string): number {
    if (!text || typeof text !== 'string') return 0;
    
    // Remove extra whitespace and normalize
    const normalizedText = text.trim().replace(/\s+/g, ' ');
    
    // Simple approximation: 1 token ≈ 4 characters
    // This is roughly accurate for English text
    return Math.ceil(normalizedText.length / 4);
}

/**
 * Calculates total token count for an array of messages.
 * Includes role tokens and content tokens.
 * @param messages Array of messages to count tokens for
 * @returns Total estimated token count
 */
export function calculateTotalTokenCount(messages: Message[]): number {
    if (!messages || !Array.isArray(messages)) return 0;
    
    let totalTokens = 0;
    
    for (const message of messages) {
        // Count tokens for the role (system, user, assistant)
        totalTokens += estimateTokenCount(message.role);
        
        // Count tokens for the content
        totalTokens += estimateTokenCount(message.content);
        
        // Add a small overhead for message formatting (JSON structure, etc.)
        totalTokens += 4; // Rough estimate for message overhead
    }
    
    // Add overhead for the overall request structure
    totalTokens += 10;
    
    return totalTokens;
}

/**
 * Formats token count for display with appropriate units.
 * @param tokenCount The number of tokens
 * @returns Formatted string (e.g., "1.2K", "850", "2.1M")
 */
export function formatTokenCount(tokenCount: number): string {
    if (tokenCount < 1000) {
        return tokenCount.toString();
    } else if (tokenCount < 1000000) {
        return (tokenCount / 1000).toFixed(1) + 'K';
    } else {
        return (tokenCount / 1000000).toFixed(1) + 'M';
    }
}

/**
 * Gets a color class for token count display based on usage level.
 * @param tokenCount Current token count
 * @param maxTokens Maximum tokens for the model (optional)
 * @returns CSS class name for color styling
 */
export function getTokenCountColorClass(tokenCount: number, maxTokens?: number): string {
    const effectiveMax = maxTokens ?? 100000;
    const usage = tokenCount / effectiveMax;
    if (usage < 0.5) return 'token-count-low';      // < 50%
    if (usage < 0.8) return 'token-count-medium';   // 50-80%
    if (usage < 0.95) return 'token-count-high';    // 80-95%
    return 'token-count-critical';                   // > 95%
}

/**
 * Calculates token breakdown from a messages array.
 * Identifies different message types and calculates tokens for each category.
 * @param messages Array of messages to analyze
 * @param modelMax Maximum tokens for the current model
 * @returns TokenBreakdown object with detailed token counts
 */
export function calculateTokenBreakdown(messages: Message[], modelMax: number = 128000): TokenBreakdown {
    const breakdown: TokenBreakdown = {
        systemPrompt: 0,
        referenceNote: 0,
        contextNotes: 0,
        chatHistory: 0,
        currentInput: 0,
        total: 0,
        modelMax
    };
    
    if (!messages || !Array.isArray(messages)) {
        return breakdown;
    }
    
    // Analyze each message and categorize it
    for (let i = 0; i < messages.length; i++) {
        const message = messages[i];
        const tokenCount = estimateTokenCount(message.role) + estimateTokenCount(message.content) + 4;
        
        // System messages are typically at the beginning
        if (message.role === 'system') {
            // First system message is usually the main system prompt
            if (i === 0) {
                breakdown.systemPrompt += tokenCount;
            } else {
                // Additional system messages might be context notes or reference notes
                // Try to identify based on content patterns
                const content = message.content.toLowerCase();
                if (content.includes('reference note') || content.includes('current note')) {
                    breakdown.referenceNote += tokenCount;
                } else if (content.includes('context note') || content.includes('additional context')) {
                    breakdown.contextNotes += tokenCount;
                } else {
                    breakdown.systemPrompt += tokenCount;
                }
            }
        }
        // User and assistant messages are chat history
        // The last user message is considered current input
        else if (message.role === 'user') {
            // Check if this is the last user message
            const isLastUserMessage = !messages.slice(i + 1).some(m => m.role === 'user');
            if (isLastUserMessage && i === messages.length - 1) {
                breakdown.currentInput += tokenCount;
            } else {
                breakdown.chatHistory += tokenCount;
            }
        }
        else if (message.role === 'assistant') {
            breakdown.chatHistory += tokenCount;
        }
    }
    
    // Calculate total and add overhead
    breakdown.total = breakdown.systemPrompt + breakdown.referenceNote + 
                     breakdown.contextNotes + breakdown.chatHistory + 
                     breakdown.currentInput + 10; // Overall request overhead
    
    return breakdown;
}

/**
 * Formats token breakdown for display as a readable string.
 * @param breakdown TokenBreakdown object
 * @returns Formatted breakdown string
 */
export function formatTokenBreakdown(breakdown: TokenBreakdown): string {
    const parts: string[] = [];
    
    if (breakdown.systemPrompt > 0) {
        parts.push(`System: ${formatTokenCount(breakdown.systemPrompt)}`);
    }
    if (breakdown.referenceNote > 0) {
        parts.push(`Reference: ${formatTokenCount(breakdown.referenceNote)}`);
    }
    if (breakdown.contextNotes > 0) {
        parts.push(`Context: ${formatTokenCount(breakdown.contextNotes)}`);
    }
    if (breakdown.chatHistory > 0) {
        parts.push(`History: ${formatTokenCount(breakdown.chatHistory)}`);
    }
    if (breakdown.currentInput > 0) {
        parts.push(`Input: ${formatTokenCount(breakdown.currentInput)}`);
    }
    
    return parts.join(' | ');
}

/**
 * Creates colored HTML spans for token breakdown using Obsidian's CSS variables.
 * Each breakdown category uses the same base color as the total, but with different saturation levels.
 * @param breakdown TokenBreakdown object
 * @param totalColorClass The color class from the total token count (e.g., 'token-count-low')
 * @returns Array of HTMLSpanElement objects with colored text and badge styling
 */
export function createColoredBreakdownElements(breakdown: TokenBreakdown, totalColorClass: string = 'token-count-low'): HTMLSpanElement[] {
    const elements: HTMLSpanElement[] = [];
    
    const addElement = (text: string, saturationClass: string) => {
        const span = document.createElement('span');
        span.textContent = text;
        span.className = `ai-token-breakdown-badge ${totalColorClass} ${saturationClass}`;
        elements.push(span);
    };
    
    if (breakdown.systemPrompt > 0) {
        addElement(`System: ${formatTokenCount(breakdown.systemPrompt)}`, 'saturation-100');
    }
    if (breakdown.referenceNote > 0) {
        if (elements.length > 0) {
            const separator = document.createElement('span');
            separator.textContent = ' ';
            elements.push(separator);
        }
        addElement(`Reference: ${formatTokenCount(breakdown.referenceNote)}`, 'saturation-80');
    }
    if (breakdown.contextNotes > 0) {
        if (elements.length > 0) {
            const separator = document.createElement('span');
            separator.textContent = ' ';
            elements.push(separator);
        }
        addElement(`Context: ${formatTokenCount(breakdown.contextNotes)}`, 'saturation-60');
    }
    if (breakdown.chatHistory > 0) {
        if (elements.length > 0) {
            const separator = document.createElement('span');
            separator.textContent = ' ';
            elements.push(separator);
        }
        addElement(`History: ${formatTokenCount(breakdown.chatHistory)}`, 'saturation-40');
    }
    if (breakdown.currentInput > 0) {
        if (elements.length > 0) {
            const separator = document.createElement('span');
            separator.textContent = ' ';
            elements.push(separator);
        }
        addElement(`Input: ${formatTokenCount(breakdown.currentInput)}`, 'saturation-20');
    }
    
    return elements;
}
