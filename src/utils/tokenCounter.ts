import { Message } from '../types';

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
    if (!maxTokens) {
        // Default behavior without limit knowledge
        if (tokenCount < 1000) return 'token-count-low';
        if (tokenCount < 4000) return 'token-count-medium';
        return 'token-count-high';
    }
    
    const usage = tokenCount / maxTokens;
    if (usage < 0.5) return 'token-count-low';      // < 50%
    if (usage < 0.8) return 'token-count-medium';   // 50-80%
    if (usage < 0.95) return 'token-count-high';    // 80-95%
    return 'token-count-critical';                   // > 95%
}