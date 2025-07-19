/**
 * Simple debouncer utility
 * Replaces the complex AsyncOptimizer with basic debouncing functionality
 */

export class SimpleDebouncer {
    private timer: NodeJS.Timeout | null = null;
    private delay: number;

    constructor(delay: number = 300) {
        this.delay = delay;
    }

    /**
     * Debounce a function call
     */
    debounce(fn: () => void | Promise<void>): void {
        if (this.timer) {
            clearTimeout(this.timer);
        }
        
        this.timer = setTimeout(() => {
            fn();
        }, this.delay);
    }

    /**
     * Cancel any pending debounced function
     */
    cancel(): void {
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
    }
}

/**
 * Simple throttler utility
 */
export class SimpleThrottler {
    private lastCall: number = 0;
    private delay: number;

    constructor(delay: number = 300) {
        this.delay = delay;
    }

    /**
     * Throttle a function call
     */
    throttle(fn: () => void | Promise<void>): void {
        const now = Date.now();
        if (now - this.lastCall >= this.delay) {
            this.lastCall = now;
            fn();
        }
    }
}
