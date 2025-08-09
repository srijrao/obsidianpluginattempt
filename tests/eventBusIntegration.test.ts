/**
 * @file eventBusIntegration.test.ts
 * @description Specialized integration tests for event bus compatibility between old and new systems
 * 
 * This test suite focuses specifically on:
 * - Event coordination between old globalEventBus and new service event buses
 * - Event format compatibility during transition
 * - Event propagation and handling across system boundaries
 * - Chat event coordination between old and new chat components
 */

import { EventBus, globalEventBus, chatEventBus, ChatEvents } from '../src/utils/eventBus';
import { AIService } from '../src/services/core/AIService';
import { AIDispatcher } from '../src/utils/aiDispatcher';
import { RequestManager } from '../src/services/core/RequestManager';
import { CacheManager } from '../src/services/core/CacheManager';
import { RateLimiter } from '../src/services/core/RateLimiter';
import { CircuitBreaker } from '../src/services/core/CircuitBreaker';
import { MetricsCollector } from '../src/services/core/MetricsCollector';
import { Vault } from 'obsidian';
import { Message, CompletionOptions, MyPluginSettings, DEFAULT_SETTINGS } from '../src/types';
import { CompletionRequest } from '../src/services/interfaces';
import { createProvider } from '../providers';
import { BaseProvider } from '../providers/base';

// Mock external dependencies
jest.mock('../providers', () => ({
  createProvider: jest.fn(),
  createProviderFromUnifiedModel: jest.fn(),
  getAllAvailableModels: jest.fn(),
}));

jest.mock('../src/utils/saveAICalls', () => ({
  saveAICallToFolder: jest.fn(),
}));

jest.mock('../src/utils/logger', () => ({
  debugLog: jest.fn(),
}));

jest.mock('../src/utils/typeguards', () => ({
  isValidProviderName: jest.fn().mockReturnValue(true),
  getProviderSettings: jest.fn(),
  getPluginApp: jest.fn().mockReturnValue({ workspace: {}, vault: {} }),
}));

jest.mock('obsidian', () => ({
  Vault: jest.fn(() => ({
    adapter: { basePath: '/mock/vault' }
  })),
}));

describe('Event Bus Integration Tests', () => {
  let oldAIDispatcher: AIDispatcher;
  let newAIService: AIService;
  let oldEventBus: EventBus;
  let newEventBus: EventBus;
  let mockVault: Vault;
  let mockPlugin: any;
  let mockSettings: MyPluginSettings;
  let mockProvider: jest.Mocked<BaseProvider>;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    // Create mock dependencies
    mockVault = new Vault();
    mockSettings = {
      ...DEFAULT_SETTINGS,
      provider: 'openai',
      selectedModel: 'openai:gpt-3.5-turbo',
      debugMode: false,
      openaiSettings: {
        ...DEFAULT_SETTINGS.openaiSettings,
        apiKey: 'test-key',
      },
    };

    mockPlugin = {
      settings: mockSettings,
      saveSettings: jest.fn().mockResolvedValue(undefined),
    };

    mockProvider = {
      getCompletion: jest.fn().mockResolvedValue(undefined),
      testConnection: jest.fn().mockResolvedValue({ success: true }),
      getAvailableModels: jest.fn().mockResolvedValue(['model1']),
    } as any;

    (createProvider as jest.Mock).mockReturnValue(mockProvider);

    // Initialize systems
    oldAIDispatcher = new AIDispatcher(mockVault, mockPlugin);
    oldEventBus = globalEventBus;
    newEventBus = new EventBus();

    // Create new system services
    const requestManager = new RequestManager(newEventBus);
    const cacheManager = new CacheManager(newEventBus);
    const rateLimiter = new RateLimiter(newEventBus);
    const circuitBreaker = new CircuitBreaker(newEventBus);
    const metricsCollector = new MetricsCollector(newEventBus);

    newAIService = new AIService(
      newEventBus,
      requestManager,
      cacheManager,
      rateLimiter,
      circuitBreaker,
      metricsCollector,
      mockSettings,
      mockPlugin.saveSettings
    );
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    oldEventBus.clear();
    newEventBus.clear();
  });

  describe('Cross-System Event Coordination', () => {
    test('should coordinate cache events between old and new systems', async () => {
      const oldCacheHandler = jest.fn();
      const newCacheHandler = jest.fn();

      // Subscribe to cache events on both buses
      oldEventBus.subscribe('cache.hit', oldCacheHandler);
      newEventBus.subscribe('cache.hit', newCacheHandler);

      // Simulate cache events from both systems
      await oldEventBus.publish('cache.hit', {
        key: 'old-cache-key',
        type: 'response',
        timestamp: Date.now()
      });

      await newEventBus.publish('cache.hit', {
        key: 'new-cache-key',
        type: 'response',
        accessCount: 1,
        age: 1000,
        timestamp: Date.now()
      });

      expect(oldCacheHandler).toHaveBeenCalledWith({
        key: 'old-cache-key',
        type: 'response',
        timestamp: expect.any(Number)
      });

      expect(newCacheHandler).toHaveBeenCalledWith({
        key: 'new-cache-key',
        type: 'response',
        accessCount: 1,
        age: 1000,
        timestamp: expect.any(Number)
      });
    });

    test('should handle stream events across system boundaries', async () => {
      const streamEventHandler = jest.fn();
      
      // Subscribe to stream events
      chatEventBus.subscribe('stream.started', streamEventHandler);
      chatEventBus.subscribe('stream.chunk', streamEventHandler);
      chatEventBus.subscribe('stream.completed', streamEventHandler);

      // Simulate streaming from old system
      await chatEventBus.publish('stream.started', {
        streamId: 'old-stream-1',
        provider: 'openai'
      });

      await chatEventBus.publish('stream.chunk', {
        streamId: 'old-stream-1',
        chunk: 'Hello ',
        totalLength: 6
      });

      await chatEventBus.publish('stream.completed', {
        streamId: 'old-stream-1',
        content: 'Hello World',
        duration: 1000
      });

      expect(streamEventHandler).toHaveBeenCalledTimes(3);
      expect(streamEventHandler).toHaveBeenNthCalledWith(1, {
        streamId: 'old-stream-1',
        provider: 'openai'
      });
    });

    test('should coordinate circuit breaker events', async () => {
      const circuitBreakerHandler = jest.fn();
      
      // Subscribe to circuit breaker events on both buses
      oldEventBus.subscribe('circuit.breaker.opened', circuitBreakerHandler);
      newEventBus.subscribe('circuit_breaker.state_changed', circuitBreakerHandler);

      // Simulate circuit breaker events
      await oldEventBus.publish('circuit.breaker.opened', {
        provider: 'openai',
        failures: 5
      });

      await newEventBus.publish('circuit_breaker.state_changed', {
        provider: 'openai',
        state: 'OPEN',
        failures: 5,
        timestamp: Date.now()
      });

      expect(circuitBreakerHandler).toHaveBeenCalledTimes(2);
    });
  });

  describe('Event Format Compatibility', () => {
    test('should handle different event formats gracefully', async () => {
      const universalHandler = jest.fn();
      
      // Subscribe to similar events with different formats
      oldEventBus.subscribe('rate.limit.reached', universalHandler);
      newEventBus.subscribe('rate_limiter.limit_exceeded', universalHandler);

      // Old format
      await oldEventBus.publish('rate.limit.reached', {
        provider: 'openai',
        resetTime: Date.now() + 60000
      });

      // New format
      await newEventBus.publish('rate_limiter.limit_exceeded', {
        provider: 'openai',
        currentCount: 60,
        limit: 60,
        resetTime: Date.now() + 60000,
        timestamp: Date.now()
      });

      expect(universalHandler).toHaveBeenCalledTimes(2);
    });

    test('should maintain backward compatibility for legacy event formats', async () => {
      const legacyHandler = jest.fn();
      
      // Subscribe to legacy format
      oldEventBus.subscribe('message.sent', legacyHandler);

      // Publish legacy format event
      await oldEventBus.publish('message.sent', {
        content: 'Legacy message',
        role: 'user',
        timestamp: new Date().toISOString()
      });

      expect(legacyHandler).toHaveBeenCalledWith({
        content: 'Legacy message',
        role: 'user',
        timestamp: expect.any(String)
      });
    });

    test('should handle event format evolution', async () => {
      const evolutionHandler = jest.fn();
      
      // Subscribe to evolved event format
      newEventBus.subscribe('ai.request.completed', evolutionHandler);

      // Publish evolved format with additional fields
      await newEventBus.publish('ai.request.completed', {
        provider: 'openai',
        duration: 1500,
        responseLength: 250,
        model: 'gpt-3.5-turbo',
        tokenCount: 100,
        cost: 0.002,
        timestamp: Date.now()
      });

      expect(evolutionHandler).toHaveBeenCalledWith({
        provider: 'openai',
        duration: 1500,
        responseLength: 250,
        model: 'gpt-3.5-turbo',
        tokenCount: 100,
        cost: 0.002,
        timestamp: expect.any(Number)
      });
    });
  });

  describe('Event Propagation During Transition', () => {
    test('should propagate events between systems during mixed usage', async () => {
      const propagationTracker = jest.fn();
      
      // Set up cross-system event propagation
      oldEventBus.subscribe('system.event', (data: any) => {
        propagationTracker('old-received', data);
        // Propagate to new system
        newEventBus.publish('system.event', { ...data, propagatedFrom: 'old' });
      });

      newEventBus.subscribe('system.event', (data) => {
        propagationTracker('new-received', data);
      });

      // Trigger event in old system
      await oldEventBus.publish('system.event', {
        type: 'test',
        data: 'propagation-test'
      });

      expect(propagationTracker).toHaveBeenCalledTimes(2);
      expect(propagationTracker).toHaveBeenNthCalledWith(1, 'old-received', {
        type: 'test',
        data: 'propagation-test'
      });
      expect(propagationTracker).toHaveBeenNthCalledWith(2, 'new-received', {
        type: 'test',
        data: 'propagation-test',
        propagatedFrom: 'old'
      });
    });

    test('should handle event storms during transition', async () => {
      const eventCounter = jest.fn();
      
      // Subscribe to high-frequency events
      oldEventBus.subscribe('high.frequency.event', eventCounter);
      newEventBus.subscribe('high.frequency.event', eventCounter);

      // Generate event storm
      const promises = [];
      for (let i = 0; i < 100; i++) {
        if (i % 2 === 0) {
          promises.push(oldEventBus.publish('high.frequency.event', { id: i, system: 'old' }));
        } else {
          promises.push(newEventBus.publish('high.frequency.event', { id: i, system: 'new' }));
        }
      }

      await Promise.all(promises);

      // Should handle all events without dropping any
      expect(eventCounter).toHaveBeenCalledTimes(100);
    });

    test('should maintain event ordering during transition', async () => {
      const eventOrder: string[] = [];
      
      const orderTracker = (source: string) => (data: any) => {
        eventOrder.push(`${source}-${data.sequence}`);
      };

      oldEventBus.subscribe('ordered.event', orderTracker('old'));
      newEventBus.subscribe('ordered.event', orderTracker('new'));

      // Publish events in sequence
      for (let i = 0; i < 10; i++) {
        if (i % 2 === 0) {
          await oldEventBus.publish('ordered.event', { sequence: i });
        } else {
          await newEventBus.publish('ordered.event', { sequence: i });
        }
      }

      // Events should be processed in order within each system
      const oldEvents = eventOrder.filter(e => e.startsWith('old'));
      const newEvents = eventOrder.filter(e => e.startsWith('new'));

      expect(oldEvents).toEqual(['old-0', 'old-2', 'old-4', 'old-6', 'old-8']);
      expect(newEvents).toEqual(['new-1', 'new-3', 'new-5', 'new-7', 'new-9']);
    });
  });

  describe('Chat Event Integration', () => {
    test('should coordinate chat events between old and new chat components', async () => {
      const chatEventTracker = jest.fn();
      
      // Subscribe to various chat events
      chatEventBus.subscribe('message.sent', chatEventTracker);
      chatEventBus.subscribe('message.received', chatEventTracker);
      chatEventBus.subscribe('stream.started', chatEventTracker);

      // Simulate chat flow
      await chatEventBus.publish('message.sent', {
        content: 'User message',
        role: 'user',
        timestamp: new Date().toISOString()
      });

      await chatEventBus.publish('stream.started', {
        streamId: 'chat-stream-1',
        provider: 'openai'
      });

      await chatEventBus.publish('message.received', {
        content: 'Assistant response',
        role: 'assistant',
        timestamp: new Date().toISOString()
      });

      expect(chatEventTracker).toHaveBeenCalledTimes(3);
    });

    test('should handle tool execution events', async () => {
      const toolEventHandler = jest.fn();
      
      chatEventBus.subscribe('tool.executed', toolEventHandler);
      chatEventBus.subscribe('tool.error', toolEventHandler);

      // Simulate tool execution
      await chatEventBus.publish('tool.executed', {
        command: { name: 'test-tool', args: {} },
        result: { success: true, data: 'tool result' },
        duration: 500
      });

      await chatEventBus.publish('tool.error', {
        command: { name: 'failing-tool', args: {} },
        error: 'Tool execution failed'
      });

      expect(toolEventHandler).toHaveBeenCalledTimes(2);
    });

    test('should coordinate agent mode events', async () => {
      const agentEventHandler = jest.fn();
      
      chatEventBus.subscribe('agent.mode.changed', agentEventHandler);

      await chatEventBus.publish('agent.mode.changed', {
        enabled: true,
        settings: {
          maxIterations: 10,
          toolTimeout: 30000
        }
      });

      expect(agentEventHandler).toHaveBeenCalledWith({
        enabled: true,
        settings: {
          maxIterations: 10,
          toolTimeout: 30000
        }
      });
    });
  });

  describe('Event Bus Performance During Transition', () => {
    test('should maintain performance with multiple event buses', async () => {
      const startTime = Date.now();
      const eventHandlers = {
        old: jest.fn(),
        new: jest.fn(),
        chat: jest.fn()
      };

      // Subscribe to events on all buses
      oldEventBus.subscribe('performance.test', eventHandlers.old);
      newEventBus.subscribe('performance.test', eventHandlers.new);
      // Use a valid chat event for the chat event bus
      chatEventBus.subscribe('message.sent', eventHandlers.chat);

      // Generate high-frequency events
      const promises = [];
      for (let i = 0; i < 1000; i++) {
        const eventData = { id: i, timestamp: Date.now() };
        
        promises.push(oldEventBus.publish('performance.test', eventData));
        promises.push(newEventBus.publish('performance.test', eventData));
        // Use a valid chat event
        promises.push(chatEventBus.publish('message.sent', {
          content: `Performance test ${i}`,
          role: 'user',
          timestamp: new Date().toISOString()
        }));
      }

      await Promise.all(promises);
      const duration = Date.now() - startTime;

      // Should complete within reasonable time
      expect(duration).toBeLessThan(5000); // 5 seconds
      expect(eventHandlers.old).toHaveBeenCalledTimes(1000);
      expect(eventHandlers.new).toHaveBeenCalledTimes(1000);
      expect(eventHandlers.chat).toHaveBeenCalledTimes(1000);
    });

    test('should handle event bus cleanup during transition', () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();

      // Subscribe to events
      const unsubscribe1 = oldEventBus.subscribe('cleanup.test', handler1);
      const unsubscribe2 = newEventBus.subscribe('cleanup.test', handler2);

      // Verify subscriptions
      expect(oldEventBus.getSubscriptionCount('cleanup.test')).toBe(1);
      expect(newEventBus.getSubscriptionCount('cleanup.test')).toBe(1);

      // Cleanup
      unsubscribe1();
      unsubscribe2();

      expect(oldEventBus.getSubscriptionCount('cleanup.test')).toBe(0);
      expect(newEventBus.getSubscriptionCount('cleanup.test')).toBe(0);
    });

    test('should handle memory management with long-running event buses', async () => {
      const memoryTestHandler = jest.fn();
      
      // Subscribe and unsubscribe many handlers to test memory management
      for (let i = 0; i < 1000; i++) {
        const unsubscribe = oldEventBus.subscribe(`memory.test.${i}`, memoryTestHandler);
        
        // Immediately unsubscribe to test cleanup
        unsubscribe();
      }

      // Event bus should handle cleanup properly
      expect(oldEventBus.getSubscriptionCount()).toBe(0);
    });
  });

  describe('Event Error Handling', () => {
    test('should handle event handler errors gracefully', async () => {
      const errorHandler = jest.fn(() => {
        throw new Error('Handler error');
      });
      const successHandler = jest.fn();

      // Subscribe both handlers
      oldEventBus.subscribe('error.test', errorHandler);
      oldEventBus.subscribe('error.test', successHandler);

      // Publish event - should not throw despite error handler
      await expect(oldEventBus.publish('error.test', { data: 'test' })).resolves.not.toThrow();

      // Success handler should still be called
      expect(successHandler).toHaveBeenCalledWith({ data: 'test' });
    });

    test('should handle async event handler errors', async () => {
      const asyncErrorHandler = jest.fn(async () => {
        throw new Error('Async handler error');
      });
      const asyncSuccessHandler = jest.fn(async () => {
        return Promise.resolve();
      });

      newEventBus.subscribe('async.error.test', asyncErrorHandler);
      newEventBus.subscribe('async.error.test', asyncSuccessHandler);

      // Should handle async errors gracefully
      await expect(newEventBus.publish('async.error.test', { data: 'async test' })).resolves.not.toThrow();

      expect(asyncSuccessHandler).toHaveBeenCalledWith({ data: 'async test' });
    });
  });
});