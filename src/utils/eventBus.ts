/**
 * @file eventBus.ts
 * 
 * Event Bus system for decoupling components through event-driven communication.
 * Provides type-safe event publishing and subscription with automatic cleanup.
 */

export type EventHandler<T = any> = (data: T) => void | Promise<void>;
export type UnsubscribeFunction = () => void;

export interface EventSubscription {
    event: string;
    handler: EventHandler;
    once: boolean;
    id: string;
}

/**
 * Core event bus interface for type-safe event communication
 */
export interface IEventBus {
    publish<T>(event: string, data: T): Promise<void>;
    subscribe<T>(event: string, handler: EventHandler<T>): UnsubscribeFunction;
    subscribeOnce<T>(event: string, handler: EventHandler<T>): UnsubscribeFunction;
    unsubscribe(event: string, handler?: EventHandler): void;
    clear(): void;
    getSubscriptionCount(event?: string): number;
}

/**
 * Event types for the AI Assistant plugin
 */
export interface ChatEvents {
    'message.sent': { content: string; role: 'user' | 'assistant'; timestamp: string };
    'message.received': { content: string; role: 'user' | 'assistant'; timestamp: string };
    'stream.started': { streamId: string; provider: string };
    'stream.chunk': { streamId: string; chunk: string; totalLength: number };
    'stream.completed': { streamId: string; content: string; duration: number };
    'stream.error': { streamId: string; error: string };
    'stream.aborted': { streamId: string; reason: string };
    'tool.executed': { command: any; result: any; duration: number };
    'tool.error': { command: any; error: string };
    'agent.mode.changed': { enabled: boolean; settings: any };
    'settings.changed': { key: string; oldValue: any; newValue: any };
    'cache.hit': { key: string; type: string };
    'cache.miss': { key: string; type: string };
    'rate.limit.reached': { provider: string; resetTime: number };
    'circuit.breaker.opened': { provider: string; failures: number };
    'circuit.breaker.closed': { provider: string };
}

/**
 * Event Bus implementation with type safety and performance optimizations
 */
export class EventBus implements IEventBus {
    private subscriptions = new Map<string, EventSubscription[]>();
    private subscriptionIdCounter = 0;
    private isDisposed = false;

    /**
     * Publishes an event to all subscribers
     */
    async publish<T>(event: string, data: T): Promise<void> {
        if (this.isDisposed) {
            console.warn(`[EventBus] Cannot publish to disposed event bus: ${event}`);
            return;
        }

        const eventSubscriptions = this.subscriptions.get(event);
        if (!eventSubscriptions || eventSubscriptions.length === 0) {
            return;
        }

        // Create a copy to avoid issues if handlers modify the subscription list
        const handlersToCall = [...eventSubscriptions];
        const onceHandlers: string[] = [];

        // Execute all handlers
        const promises = handlersToCall.map(async (subscription) => {
            try {
                const result = subscription.handler(data);
                if (result instanceof Promise) {
                    await result;
                }
                
                // Mark once handlers for removal
                if (subscription.once) {
                    onceHandlers.push(subscription.id);
                }
            } catch (error) {
                console.error(`[EventBus] Error in event handler for '${event}':`, error);
            }
        });

        // Wait for all handlers to complete
        await Promise.all(promises);

        // Remove once handlers
        if (onceHandlers.length > 0) {
            this.removeSubscriptionsByIds(event, onceHandlers);
        }
    }

    /**
     * Subscribes to an event
     */
    subscribe<T>(event: string, handler: EventHandler<T>): UnsubscribeFunction {
        if (this.isDisposed) {
            console.warn(`[EventBus] Cannot subscribe to disposed event bus: ${event}`);
            return () => {};
        }

        const subscription: EventSubscription = {
            event,
            handler: handler as EventHandler,
            once: false,
            id: `sub_${++this.subscriptionIdCounter}`
        };

        if (!this.subscriptions.has(event)) {
            this.subscriptions.set(event, []);
        }

        this.subscriptions.get(event)!.push(subscription);

        // Return unsubscribe function
        return () => {
            this.removeSubscriptionById(event, subscription.id);
        };
    }

    /**
     * Subscribes to an event for one-time execution
     */
    subscribeOnce<T>(event: string, handler: EventHandler<T>): UnsubscribeFunction {
        if (this.isDisposed) {
            console.warn(`[EventBus] Cannot subscribe to disposed event bus: ${event}`);
            return () => {};
        }

        const subscription: EventSubscription = {
            event,
            handler: handler as EventHandler,
            once: true,
            id: `once_${++this.subscriptionIdCounter}`
        };

        if (!this.subscriptions.has(event)) {
            this.subscriptions.set(event, []);
        }

        this.subscriptions.get(event)!.push(subscription);

        // Return unsubscribe function
        return () => {
            this.removeSubscriptionById(event, subscription.id);
        };
    }

    /**
     * Unsubscribes from an event
     */
    unsubscribe(event: string, handler?: EventHandler): void {
        if (!this.subscriptions.has(event)) {
            return;
        }

        if (handler) {
            // Remove specific handler
            const subscriptions = this.subscriptions.get(event)!;
            const filtered = subscriptions.filter(sub => sub.handler !== handler);
            
            if (filtered.length === 0) {
                this.subscriptions.delete(event);
            } else {
                this.subscriptions.set(event, filtered);
            }
        } else {
            // Remove all handlers for the event
            this.subscriptions.delete(event);
        }
    }

    /**
     * Clears all subscriptions
     */
    clear(): void {
        this.subscriptions.clear();
        this.subscriptionIdCounter = 0;
    }

    /**
     * Gets the number of subscriptions for an event or total
     */
    getSubscriptionCount(event?: string): number {
        if (event) {
            return this.subscriptions.get(event)?.length || 0;
        }
        
        let total = 0;
        for (const subs of this.subscriptions.values()) {
            total += subs.length;
        }
        return total;
    }

    /**
     * Gets all registered event names
     */
    getRegisteredEvents(): string[] {
        return Array.from(this.subscriptions.keys());
    }

    /**
     * Disposes the event bus and clears all subscriptions
     */
    dispose(): void {
        this.clear();
        this.isDisposed = true;
    }

    /**
     * Removes a subscription by ID
     */
    private removeSubscriptionById(event: string, id: string): void {
        const subscriptions = this.subscriptions.get(event);
        if (!subscriptions) return;

        const filtered = subscriptions.filter(sub => sub.id !== id);
        
        if (filtered.length === 0) {
            this.subscriptions.delete(event);
        } else {
            this.subscriptions.set(event, filtered);
        }
    }

    /**
     * Removes multiple subscriptions by IDs
     */
    private removeSubscriptionsByIds(event: string, ids: string[]): void {
        const subscriptions = this.subscriptions.get(event);
        if (!subscriptions) return;

        const idsSet = new Set(ids);
        const filtered = subscriptions.filter(sub => !idsSet.has(sub.id));
        
        if (filtered.length === 0) {
            this.subscriptions.delete(event);
        } else {
            this.subscriptions.set(event, filtered);
        }
    }
}

/**
 * Global event bus instance
 */
export const globalEventBus = new EventBus();

/**
 * Typed event bus for specific event types
 */
export class TypedEventBus<TEvents extends Record<string, any>> {
    constructor(private eventBus: IEventBus = globalEventBus) {}

    publish<K extends keyof TEvents>(event: K, data: TEvents[K]): Promise<void> {
        return this.eventBus.publish(event as string, data);
    }

    subscribe<K extends keyof TEvents>(
        event: K, 
        handler: EventHandler<TEvents[K]>
    ): UnsubscribeFunction {
        return this.eventBus.subscribe(event as string, handler);
    }

    subscribeOnce<K extends keyof TEvents>(
        event: K, 
        handler: EventHandler<TEvents[K]>
    ): UnsubscribeFunction {
        return this.eventBus.subscribeOnce(event as string, handler);
    }

    unsubscribe<K extends keyof TEvents>(event: K, handler?: EventHandler<TEvents[K]>): void {
        this.eventBus.unsubscribe(event as string, handler);
    }
}

/**
 * Chat-specific typed event bus
 */
export const chatEventBus = new TypedEventBus<ChatEvents>();

/**
 * Event bus factory for creating isolated event buses
 */
export class EventBusFactory {
    static create(): IEventBus {
        return new EventBus();
    }

    static createTyped<TEvents extends Record<string, any>>(): TypedEventBus<TEvents> {
        return new TypedEventBus<TEvents>(new EventBus());
    }
}