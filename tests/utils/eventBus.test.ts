/**
 * @file eventBus.test.ts
 * @description Tests for the event bus utility
 */

import { EventBus, globalEventBus } from '../../src/utils/eventBus';

describe('EventBus', () => {
    let eventBus: EventBus;

    beforeEach(() => {
        eventBus = new EventBus();
    });

    afterEach(() => {
        eventBus.clear();
    });

    describe('subscribe and publish', () => {
        it('should subscribe to events and receive published data', () => {
            const handler = jest.fn();
            eventBus.subscribe('test.event', handler);

            eventBus.publish('test.event', { data: 'test' });

            expect(handler).toHaveBeenCalledWith({ data: 'test' });
            expect(handler).toHaveBeenCalledTimes(1);
        });

        it('should support multiple subscribers', () => {
            const handler1 = jest.fn();
            const handler2 = jest.fn();

            eventBus.subscribe('test.event', handler1);
            eventBus.subscribe('test.event', handler2);

            eventBus.publish('test.event', { data: 'test' });

            expect(handler1).toHaveBeenCalledWith({ data: 'test' });
            expect(handler2).toHaveBeenCalledWith({ data: 'test' });
        });

        it('should not call handlers for different events', () => {
            const handler1 = jest.fn();
            const handler2 = jest.fn();

            eventBus.subscribe('event.one', handler1);
            eventBus.subscribe('event.two', handler2);

            eventBus.publish('event.one', { data: 'test' });

            expect(handler1).toHaveBeenCalled();
            expect(handler2).not.toHaveBeenCalled();
        });
    });

    describe('unsubscribe', () => {
        it('should return unsubscribe function', () => {
            const handler = jest.fn();
            const unsubscribe = eventBus.subscribe('test.event', handler);

            expect(typeof unsubscribe).toBe('function');
        });

        it('should stop receiving events after unsubscribe', () => {
            const handler = jest.fn();
            const unsubscribe = eventBus.subscribe('test.event', handler);

            eventBus.publish('test.event', { data: 'test1' });
            expect(handler).toHaveBeenCalledTimes(1);

            unsubscribe();

            eventBus.publish('test.event', { data: 'test2' });
            expect(handler).toHaveBeenCalledTimes(1); // Still 1, not called again
        });

        it('should handle unsubscribing non-existent subscription', () => {
            const handler = jest.fn();
            const unsubscribe = eventBus.subscribe('test.event', handler);
            
            unsubscribe();
            unsubscribe(); // Should not throw

            expect(() => unsubscribe()).not.toThrow();
        });
    });

    describe('subscribeOnce', () => {
        it('should call handler only once', async () => {
            const handler = jest.fn();
            eventBus.subscribeOnce('test.event', handler);

            await eventBus.publish('test.event', { data: 'test1' });
            await eventBus.publish('test.event', { data: 'test2' });

            expect(handler).toHaveBeenCalledTimes(1);
            expect(handler).toHaveBeenCalledWith({ data: 'test1' });
        });

        it('should return unsubscribe function', () => {
            const handler = jest.fn();
            const unsubscribe = eventBus.subscribeOnce('test.event', handler);

            expect(typeof unsubscribe).toBe('function');
        });

        it('should allow manual unsubscribe before event fires', () => {
            const handler = jest.fn();
            const unsubscribe = eventBus.subscribeOnce('test.event', handler);

            unsubscribe();
            eventBus.publish('test.event', { data: 'test' });

            expect(handler).not.toHaveBeenCalled();
        });
    });

    describe('clear and unsubscribe', () => {
        it('should remove all listeners for specific event with unsubscribe', () => {
            const handler1 = jest.fn();
            const handler2 = jest.fn();

            eventBus.subscribe('test.event', handler1);
            eventBus.subscribe('test.event', handler2);

            eventBus.unsubscribe('test.event');
            eventBus.publish('test.event', { data: 'test' });

            expect(handler1).not.toHaveBeenCalled();
            expect(handler2).not.toHaveBeenCalled();
        });

        it('should remove all listeners for all events with clear', () => {
            const handler1 = jest.fn();
            const handler2 = jest.fn();

            eventBus.subscribe('event.one', handler1);
            eventBus.subscribe('event.two', handler2);

            eventBus.clear();

            eventBus.publish('event.one', { data: 'test' });
            eventBus.publish('event.two', { data: 'test' });

            expect(handler1).not.toHaveBeenCalled();
            expect(handler2).not.toHaveBeenCalled();
        });
    });

    describe('wildcard subscriptions', () => {
        it('should get subscription count', () => {
            const handler1 = jest.fn();
            const handler2 = jest.fn();

            eventBus.subscribe('test.event1', handler1);
            eventBus.subscribe('test.event1', handler2);
            eventBus.subscribe('test.event2', handler1);

            expect(eventBus.getSubscriptionCount('test.event1')).toBe(2);
            expect(eventBus.getSubscriptionCount('test.event2')).toBe(1);
        });

        it('should get total subscription count', () => {
            const handler = jest.fn();

            eventBus.subscribe('test.event1', handler);
            eventBus.subscribe('test.event2', handler);

            expect(eventBus.getSubscriptionCount()).toBeGreaterThanOrEqual(2);
        });
    });

    describe('async handlers', () => {
        it('should handle async event handlers', async () => {
            const handler = jest.fn().mockResolvedValue(undefined);
            eventBus.subscribe('test.event', handler);

            await eventBus.publish('test.event', { data: 'test' });

            expect(handler).toHaveBeenCalled();
        });

        it('should not block on async handlers', () => {
            const handler = jest.fn(async () => {
                await new Promise(resolve => setTimeout(resolve, 100));
            });

            eventBus.subscribe('test.event', handler);

            const start = Date.now();
            eventBus.publish('test.event', { data: 'test' });
            const duration = Date.now() - start;

            // Should return immediately, not wait for async handler
            expect(duration).toBeLessThan(50);
        });
    });

    describe('error handling', () => {
        it('should handle errors in event handlers gracefully', async () => {
            const handler1 = jest.fn(() => {
                throw new Error('Handler error');
            });
            const handler2 = jest.fn();

            eventBus.subscribe('test.event', handler1);
            eventBus.subscribe('test.event', handler2);

            await expect(
                eventBus.publish('test.event', { data: 'test' })
            ).resolves.not.toThrow();

            // Second handler should still be called
            expect(handler2).toHaveBeenCalled();
        });
    });

    describe('globalEventBus', () => {
        it('should export a global event bus instance', () => {
            expect(globalEventBus).toBeDefined();
            expect(globalEventBus).toBeInstanceOf(EventBus);
        });
    });
});
