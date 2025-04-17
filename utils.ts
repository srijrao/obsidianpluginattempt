import { debug } from './settings';
// Remove WorkspaceEventName from the import
import { Notice, Workspace, Events, EventRef } from 'obsidian'; 
import { Message } from './types';

export class APIError extends Error {
    constructor(
        message: string,
        public status?: number,
        public code?: string
    ) {
        super(message);
        this.name = 'APIError';
    }
}

interface RetryOptions {
    maxRetries?: number;
    baseDelay?: number;
    maxDelay?: number;
}

export class APIHandler {
    private static readonly DEFAULT_OPTIONS: Required<RetryOptions> = {
        maxRetries: 3,
        baseDelay: 1000,
        maxDelay: 10000
    };

    static async fetchWithRetry(
        url: string,
        options: RequestInit,
        retryOptions: RetryOptions = {}
    ): Promise<Response> {
        const { maxRetries, baseDelay, maxDelay } = {
            ...this.DEFAULT_OPTIONS,
            ...retryOptions
        };

        let lastError: Error = new Error('Unknown error');
        let attempt = 0;

        while (attempt < maxRetries) {
            try {
                const response = await fetch(url, options);
                
                // Handle rate limiting
                if (response.status === 429) {
                    const retryAfter = response.headers.get('Retry-After');
                    const delay = retryAfter ? parseInt(retryAfter) * 1000 : this.calculateDelay(attempt, baseDelay, maxDelay);
                    debug(`Rate limited. Retrying in ${delay}ms`);
                    await this.delay(delay);
                    attempt++;
                    continue;
                }

                // Handle other error status codes
                if (!response.ok) {
                    const error = await this.handleErrorResponse(response);
                    if (this.isRetryableError(error)) {
                        const delay = this.calculateDelay(attempt, baseDelay, maxDelay);
                        debug(`Request failed with ${error.status}. Retrying in ${delay}ms`);
                        await this.delay(delay);
                        attempt++;
                        continue;
                    }
                    throw error;
                }

                return response;

            } catch (error) {
                lastError = error;
                if (!this.isRetryableError(error)) {
                    throw error;
                }

                if (attempt < maxRetries - 1) {
                    const delay = this.calculateDelay(attempt, baseDelay, maxDelay);
                    debug(`Request failed. Retrying in ${delay}ms`, error);
                    await this.delay(delay);
                }
                attempt++;
            }
        }

        throw lastError;
    }

    private static isRetryableError(error: any): boolean {
        // Network errors
        if (error instanceof TypeError && error.message === 'Failed to fetch') {
            return true;
        }

        // Rate limiting
        if (error instanceof APIError && error.status === 429) {
            return true;
        }

        // Server errors
        if (error instanceof APIError && error.status && error.status >= 500) {
            return true;
        }

        return false;
    }

    private static async handleErrorResponse(response: Response): Promise<APIError> {
        let errorMessage = `HTTP ${response.status}`;
        let errorCode: string | undefined;

        try {
            const data = await response.json();
            errorMessage = data.error?.message || data.message || errorMessage;
            errorCode = data.error?.code || data.code;
        } catch {
            // If JSON parsing fails, use status text
            errorMessage = response.statusText || errorMessage;
        }

        return new APIError(errorMessage, response.status, errorCode);
    }

    private static calculateDelay(attempt: number, baseDelay: number, maxDelay: number): number {
        // Exponential backoff with jitter
        const expDelay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
        const jitter = Math.random() * 0.1 * expDelay; // 10% jitter
        return Math.round(expDelay + jitter);
    }

    private static delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    static handleError(error: any): void {
        if (error instanceof APIError) {
            new Notice(`API Error: ${error.message}`);
            debug('API Error:', error);
        } else if (error.name === 'AbortError') {
            debug('Request aborted');
        } else {
            new Notice(`Error: ${error.message}`);
            debug('Unexpected error:', error);
        }
    }
}

export class EventManager {
    private subscriptions: (() => void)[] = [];

    registerWorkspaceEvent(
        workspace: Workspace,
        event: string, // Change type back to string
        callback: (...args: any[]) => any
    ): void {
        // Add 'as any' back if needed, but workspace.on might accept string directly
        const eventRef = workspace.on(event as any, callback); 
        this.subscriptions.push(() => {
            workspace.offref(eventRef);
        });
    }

    addEventListener(element: HTMLElement, event: string, callback: EventListener): void {
        element.addEventListener(event, callback);
        this.subscriptions.push(() => element.removeEventListener(event, callback));
    }

    cleanup(): void {
        let error: Error | undefined;
        
        for (const unsubscribe of this.subscriptions) {
            try {
                unsubscribe();
            } catch (e) {
                if (!error && e instanceof Error) {
                    error = e;
                }
            }
        }
        
        this.subscriptions = [];
        
        if (error) {
            throw error;
        }
    }
}

/**
 * Manages streaming responses with optimized buffering and backpressure handling
 */
export class StreamManager {
    private static readonly BUFFER_SIZE = 1024; // 1KB buffer size
    private static readonly FLUSH_INTERVAL = 50; // 50ms flush interval

    private buffer: string = '';
    private flushTimeout: NodeJS.Timeout | null = null;
    private lastFlushTime: number = 0;
    private isPaused: boolean = false;

    private onWrite: (chunk: string) => void | Promise<void>;
    private onComplete?: () => void;
    private onError?: (error: Error) => void;

    constructor(
        onWrite: (chunk: string) => void | Promise<void>,
        onComplete?: () => void,
        onError?: (error: Error) => void
    ) {
        this.onWrite = onWrite;
        this.onComplete = onComplete;
        this.onError = onError;
    }

    /**
     * Add data to the stream buffer
     */
    async write(chunk: string): Promise<void> {
        try {
            await this.onWrite(chunk);
        } catch (error) {
            this.onError?.(error instanceof Error ? error : new Error(String(error)));
        }
    }

    /**
     * Force flush the buffer
     */
    flush(): void {
        if (this.buffer && !this.isPaused) {
            const now = Date.now();
            const timeSinceLastFlush = now - this.lastFlushTime;

            // Implement rate limiting
            if (timeSinceLastFlush < StreamManager.FLUSH_INTERVAL) {
                this.scheduleFlush();
                return;
            }

            try {
                this.onWrite(this.buffer);
                this.buffer = '';
                this.lastFlushTime = now;
            } catch (error) {
                this.onError?.(error as Error);
            }
        }
    }

    /**
     * Schedule a buffer flush
     */
    private scheduleFlush(): void {
        if (!this.flushTimeout) {
            this.flushTimeout = setTimeout(() => {
                this.flushTimeout = null;
                this.flush();
            }, StreamManager.FLUSH_INTERVAL);
        }
    }

    /**
     * Pause stream processing
     */
    pause(): void {
        this.isPaused = true;
    }

    /**
     * Resume stream processing
     */
    resume(): void {
        this.isPaused = false;
        if (this.buffer.length > 0) {
            this.flush();
        }
    }

    /**
     * Complete the stream
     */
    complete(): void {
        this.flush();
        if (this.flushTimeout) {
            clearTimeout(this.flushTimeout);
            this.flushTimeout = null;
        }
        this.onComplete?.();
    }

    /**
     * Clean up resources
     */
    destroy(): void {
        if (this.flushTimeout) {
            clearTimeout(this.flushTimeout);
            this.flushTimeout = null;
        }
        this.buffer = '';
    }
}

/**
 * Cache for managing chat messages with memory optimizations
 */
export class MessageCache {
    private static readonly MAX_CACHE_SIZE = 100;
    private messages: Message[] = [];
    private messageMap = new Map<string, HTMLElement>();

    /**
     * Add a message to the cache
     */
    addMessage(message: Message, element: HTMLElement): void {
        const id = this.generateMessageId();
        this.messages.push(message);
        this.messageMap.set(id, element);
        element.dataset.messageId = id;

        // Trim cache if it exceeds max size
        if (this.messages.length > MessageCache.MAX_CACHE_SIZE) {
            const removed = this.messages.shift();
            if (removed) {
                const oldestElement = this.findElementByMessage(removed);
                if (oldestElement) {
                    const oldestId = oldestElement.dataset.messageId;
                    if (oldestId) {
                        this.messageMap.delete(oldestId);
                    }
                }
            }
        }
    }

    /**
     * Get all messages in chronological order
     */
    getMessages(): Message[] {
        return [...this.messages];
    }

    /**
     * Get the element associated with a message
     */
    getElement(messageId: string): HTMLElement | undefined {
        return this.messageMap.get(messageId);
    }

    /**
     * Find an element by its message content
     */
    private findElementByMessage(message: Message): HTMLElement | undefined {
        for (const [id, element] of this.messageMap.entries()) {
            const content = element.querySelector('.message-content')?.textContent;
            if (content === message.content) {
                return element;
            }
        }
        return undefined;
    }

    /**
     * Generate a unique message ID
     */
    private generateMessageId(): string {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }

    /**
     * Remove a message and its element from the cache
     */
    removeMessage(messageId: string): void {
        const element = this.messageMap.get(messageId);
        if (element) {
            const index = this.messages.findIndex(msg => 
                element.querySelector('.message-content')?.textContent === msg.content
            );
            if (index !== -1) {
                this.messages.splice(index, 1);
            }
            this.messageMap.delete(messageId);
        }
    }

    /**
     * Clear all messages from the cache
     */
    clear(): void {
        this.messages = [];
        this.messageMap.clear();
    }

    /**
     * Get the number of messages in the cache
     */
    size(): number {
        return this.messages.length;
    }

    /**
     * Update a message's content
     */
    updateMessage(messageId: string, newContent: string): void {
        const element = this.messageMap.get(messageId);
        if (element) {
            const index = this.messages.findIndex(msg => 
                element.querySelector('.message-content')?.textContent === msg.content
            );
            if (index !== -1) {
                this.messages[index].content = newContent;
            }
            element.dataset.rawContent = newContent;
        }
    }
}

/**
 * Virtual scroller for efficient rendering of large message lists
 */
export class VirtualScroller {
    private static readonly BUFFER_SIZE = 10; // Number of items to render above/below viewport
    private static readonly ITEM_HEIGHT = 100; // Default item height estimate in pixels

    private containerEl: HTMLElement;
    private contentEl: HTMLElement;
    private items: any[] = [];
    private renderedItems = new Map<number, HTMLElement>();
    private lastScrollTop = 0;
    private resizeObserver: ResizeObserver;
    private itemHeights = new Map<number, number>();
    private averageItemHeight = VirtualScroller.ITEM_HEIGHT;
    private totalHeight = 0;
    private visibleRange = { start: 0, end: 0 };

    constructor(
        containerEl: HTMLElement,
        private renderItem: (item: any, index: number) => HTMLElement,
        private options: {
            onScroll?: (scrollTop: number) => void;
            onVisibleRangeChange?: (start: number, end: number) => void;
        } = {}
    ) {
        this.containerEl = containerEl;
        this.containerEl.style.overflow = 'auto';
        this.containerEl.style.position = 'relative';

        // Create content element
        this.contentEl = document.createElement('div');
        this.contentEl.style.position = 'relative';
        this.containerEl.appendChild(this.contentEl);

        // Setup scroll handler with throttling
        this.containerEl.addEventListener('scroll', this.throttle(this.onScroll.bind(this), 16));

        // Setup resize observer
        this.resizeObserver = new ResizeObserver(this.throttle(this.updateItemHeights.bind(this), 100));
    }

    /**
     * Set the items to be rendered
     */
    setItems(items: any[]): void {
        this.items = items;
        this.updateLayout();
        this.render();
    }

    /**
     * Update layout calculations
     */
    private updateLayout(): void {
        // Calculate average item height from known heights
        if (this.itemHeights.size > 0) {
            const totalHeight = Array.from(this.itemHeights.values()).reduce((a, b) => a + b, 0);
            this.averageItemHeight = totalHeight / this.itemHeights.size;
        }

        // Update total content height
        this.totalHeight = this.items.length * this.averageItemHeight;
        this.contentEl.style.height = `${this.totalHeight}px`;
    }

    /**
     * Render visible items
     */
    private render(): void {
        const containerHeight = this.containerEl.offsetHeight;
        const scrollTop = this.containerEl.scrollTop;

        // Calculate visible range
        const startIndex = Math.max(0, Math.floor(scrollTop / this.averageItemHeight) - VirtualScroller.BUFFER_SIZE);
        const endIndex = Math.min(
            this.items.length,
            Math.ceil((scrollTop + containerHeight) / this.averageItemHeight) + VirtualScroller.BUFFER_SIZE
        );

        // Update visible range
        if (startIndex !== this.visibleRange.start || endIndex !== this.visibleRange.end) {
            this.visibleRange = { start: startIndex, end: endIndex };
            this.options.onVisibleRangeChange?.(startIndex, endIndex);
        }

        // Remove items that are no longer visible
        for (const [index, element] of this.renderedItems.entries()) {
            if (index < startIndex || index >= endIndex) {
                element.remove();
                this.renderedItems.delete(index);
                this.resizeObserver.unobserve(element);
            }
        }

        // Render newly visible items
        for (let i = startIndex; i < endIndex; i++) {
            if (!this.renderedItems.has(i) && i < this.items.length) {
                const item = this.items[i];
                const element = this.renderItem(item, i);
                
                // Position the element absolutely
                element.style.position = 'absolute';
                element.style.top = `${this.getItemOffset(i)}px`;
                element.style.width = '100%';
                
                this.contentEl.appendChild(element);
                this.renderedItems.set(i, element);
                this.resizeObserver.observe(element);
            }
        }
    }

    /**
     * Calculate item offset
     */
    private getItemOffset(index: number): number {
        let offset = 0;
        for (let i = 0; i < index; i++) {
            offset += this.itemHeights.get(i) || this.averageItemHeight;
        }
        return offset;
    }

    /**
     * Handle scroll events
     */
    private onScroll(): void {
        const scrollTop = this.containerEl.scrollTop;
        if (Math.abs(scrollTop - this.lastScrollTop) > 1) {
            this.render();
            this.options.onScroll?.(scrollTop);
            this.lastScrollTop = scrollTop;
        }
    }

    /**
     * Update item heights and re-render if needed
     */
    private updateItemHeights(): void {
        let needsUpdate = false;
        this.renderedItems.forEach((element, index) => {
            const height = element.offsetHeight;
            if (this.itemHeights.get(index) !== height) {
                this.itemHeights.set(index, height);
                needsUpdate = true;
            }
        });

        if (needsUpdate) {
            this.updateLayout();
            this.render();
        }
    }

    /**
     * Scroll to a specific item
     */
    scrollToItem(index: number, behavior: ScrollBehavior = 'auto'): void {
        const offset = this.getItemOffset(index);
        this.containerEl.scrollTo({
            top: offset,
            behavior
        });
    }

    /**
     * Scroll to the bottom of the list
     */
    scrollToBottom(behavior: ScrollBehavior = 'auto'): void {
        this.containerEl.scrollTo({
            top: this.totalHeight,
            behavior
        });
    }

    /**
     * Throttle function calls
     */
    private throttle(func: Function, limit: number): (...args: any[]) => void {
        let inThrottle = false;
        return (...args: any[]) => {
            if (!inThrottle) {
                func.apply(this, args);
                inThrottle = true;
                setTimeout(() => {
                    inThrottle = false;
                }, limit);
            }
        };
    }

    /**
     * Clean up resources
     */
    destroy(): void {
        this.resizeObserver.disconnect();
        this.renderedItems.clear();
        this.itemHeights.clear();
        this.contentEl.remove();
    }
}