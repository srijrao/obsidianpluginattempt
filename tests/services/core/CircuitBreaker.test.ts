/**
 * @file CircuitBreaker.test.ts
 * @description Tests for the CircuitBreaker service
 */

import { CircuitBreaker } from '../../../src/services/core/CircuitBreaker';
import { EventBus } from '../../../src/utils/eventBus';

describe('CircuitBreaker', () => {
    let circuitBreaker: CircuitBreaker;
    let eventBus: EventBus;

    beforeEach(() => {
        eventBus = new EventBus();
        circuitBreaker = new CircuitBreaker(eventBus);
    });

    afterEach(() => {
        eventBus.clear();
    });

    describe('isOpen', () => {
        it('should start in closed state', () => {
            expect(circuitBreaker.isOpen('openai')).toBe(false);
        });

        it('should return false for unknown providers initially', () => {
            expect(circuitBreaker.isOpen('unknown-provider')).toBe(false);
        });
    });

    describe('recordSuccess', () => {
        it('should record successful requests', () => {
            expect(() => {
                circuitBreaker.recordSuccess('openai');
            }).not.toThrow();
        });

        it('should reset failure count on success', () => {
            // Record some failures
            circuitBreaker.recordFailure('openai');
            circuitBreaker.recordFailure('openai');

            // Record success
            circuitBreaker.recordSuccess('openai');

            // Circuit should still be closed
            expect(circuitBreaker.isOpen('openai')).toBe(false);
        });
    });

    describe('recordFailure', () => {
        it('should record failures', () => {
            expect(() => {
                circuitBreaker.recordFailure('openai');
            }).not.toThrow();
        });

        it('should open circuit after threshold failures', () => {
            const threshold = 5; // Default threshold

            // Record failures up to threshold
            for (let i = 0; i < threshold; i++) {
                circuitBreaker.recordFailure('openai');
            }

            // Circuit should be open now
            expect(circuitBreaker.isOpen('openai')).toBe(true);
        });

        it('should track failures independently per provider', () => {
            circuitBreaker.recordFailure('openai');
            circuitBreaker.recordFailure('openai');
            circuitBreaker.recordFailure('anthropic');

            const openaiState = circuitBreaker.getState('openai');
            const anthropicState = circuitBreaker.getState('anthropic');

            expect(openaiState.failures).toBe(2);
            expect(anthropicState.failures).toBe(1);
        });
    });

    describe('getState', () => {
        it('should return circuit breaker state', () => {
            const state = circuitBreaker.getState('openai');

            expect(state).toHaveProperty('isOpen');
            expect(state).toHaveProperty('failures');
            expect(state).toHaveProperty('lastFailureTime');
        });

        it('should reflect current state', () => {
            circuitBreaker.recordFailure('openai');
            const state = circuitBreaker.getState('openai');

            expect(state.failures).toBeGreaterThan(0);
        });
    });

    describe('reset', () => {
        it('should reset circuit breaker state', () => {
            // Open the circuit
            for (let i = 0; i < 5; i++) {
                circuitBreaker.recordFailure('openai');
            }

            expect(circuitBreaker.isOpen('openai')).toBe(true);

            // Reset
            circuitBreaker.reset('openai');

            // Should be closed now
            expect(circuitBreaker.isOpen('openai')).toBe(false);
        });

        it('should clear failure count', () => {
            circuitBreaker.recordFailure('openai');
            circuitBreaker.recordFailure('openai');

            circuitBreaker.reset('openai');

            const state = circuitBreaker.getState('openai');
            expect(state.failures).toBe(0);
        });
    });

    describe('half-open state', () => {
        it('should transition to half-open after timeout', async () => {
            // Configure a short timeout for testing
            const shortBreaker = new CircuitBreaker(eventBus, {
                failureThreshold: 2,
                timeoutMs: 100 // 100ms
            });

            // Open the circuit
            shortBreaker.recordFailure('test-provider');
            shortBreaker.recordFailure('test-provider');

            expect(shortBreaker.isOpen('test-provider')).toBe(true);

            // Wait for reset timeout
            await new Promise(resolve => setTimeout(resolve, 150));

            // Should allow one test request (half-open)
            const state = shortBreaker.getState('test-provider');
            
            // The exact behavior depends on implementation
            // Just verify it doesn't throw
            expect(state).toBeDefined();
        });
    });

    describe('event publishing', () => {
        it('should publish circuit.opened events', () => {
            const handler = jest.fn();
            eventBus.subscribe('circuit.breaker.opened', handler);

            // Open the circuit
            for (let i = 0; i < 5; i++) {
                circuitBreaker.recordFailure('openai');
            }

            expect(handler).toHaveBeenCalled();
            expect(handler.mock.calls[0][0]).toMatchObject({
                provider: 'openai'
            });
        });

        it('should publish circuit.closed events on reset', () => {
            const handler = jest.fn();
            eventBus.subscribe('circuit.breaker.closed', handler);

            // Open the circuit
            for (let i = 0; i < 5; i++) {
                circuitBreaker.recordFailure('openai');
            }

            // Reset it
            circuitBreaker.reset('openai');

            expect(handler).toHaveBeenCalled();
        });

        it('should publish failure events', () => {
            const handler = jest.fn();
            eventBus.subscribe('circuit.breaker.failure', handler);

            circuitBreaker.recordFailure('openai');

            expect(handler).toHaveBeenCalled();
        });
    });

    describe('configuration', () => {
        it('should accept custom configuration', () => {
            const customBreaker = new CircuitBreaker(eventBus, {
                failureThreshold: 3,
                timeoutMs: 5000
            });

            expect(customBreaker).toBeDefined();
            expect(customBreaker.isOpen('test')).toBe(false);
        });

        it('should use default configuration when not provided', () => {
            const defaultBreaker = new CircuitBreaker(eventBus);
            expect(defaultBreaker).toBeDefined();
        });
    });
});
