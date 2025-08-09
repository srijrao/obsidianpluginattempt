/**
 * @file dataFlowIntegration.test.ts
 * @description Integration tests for data flow between old and new systems during architectural transition
 * 
 * This test suite focuses on:
 * - Request/response data flow between AIDispatcher and AIService
 * - Cache data sharing and consistency
 * - Streaming data coordination
 * - Request queuing and processing coordination
 * - Metrics data aggregation across systems
 */

import { AIDispatcher } from '../src/utils/aiDispatcher';
import { AIService } from '../src/services/core/AIService';
import { RequestManager } from '../src/services/core/RequestManager';
import { CacheManager } from '../src/services/core/CacheManager';
import { RateLimiter } from '../src/services/core/RateLimiter';
import { CircuitBreaker } from '../src/services/core/CircuitBreaker';
import { MetricsCollector } from '../src/services/core/MetricsCollector';
import { EventBus } from '../src/utils/eventBus';
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

describe('Data Flow Integration Tests', () => {
  let oldAIDispatcher: AIDispatcher;
  let newAIService: AIService;
  let requestManager: RequestManager;
  let cacheManager: CacheManager;
  let rateLimiter: RateLimiter;
  let circuitBreaker: CircuitBreaker;
  let metricsCollector: MetricsCollector;
  let eventBus: EventBus;
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
    eventBus = new EventBus();

    // Create new system services
    requestManager = new RequestManager(eventBus);
    cacheManager = new CacheManager(eventBus);
    rateLimiter = new RateLimiter(eventBus);
    circuitBreaker = new CircuitBreaker(eventBus);
    metricsCollector = new MetricsCollector(eventBus);

    newAIService = new AIService(
      eventBus,
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
    eventBus.clear();
  });

  describe('Request/Response Data Flow', () => {
    test('should maintain data integrity across system boundaries', async () => {
      const testMessages: Message[] = [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Hello, how are you?' }
      ];
      const testOptions: CompletionOptions = {
        temperature: 0.8
      };

      const expectedResponse = 'I am doing well, thank you for asking!';

      mockProvider.getCompletion.mockImplementation(async (messages, options) => {
        // Verify data integrity
        expect(messages).toEqual(testMessages);
        expect(options.temperature).toBe(0.8);

        if (options.streamCallback) {
          options.streamCallback(expectedResponse);
        }
      });

      // Test old system
      await oldAIDispatcher.getCompletion(testMessages, testOptions);

      // Test new system
      const request: CompletionRequest = {
        messages: testMessages,
        options: testOptions,
        provider: 'openai',
      };

      const response = await newAIService.getCompletion(request);

      // Verify response integrity
      expect(response.content).toBe(expectedResponse);
      expect(response.provider).toBe('openai');
      expect(mockProvider.getCompletion).toHaveBeenCalledTimes(2);
    });

    test('should handle complex message structures consistently', async () => {
      const complexMessages: Message[] = [
        { role: 'system', content: 'System message with special chars: àáâãäå' },
        { role: 'user', content: 'User message with emojis: 🚀🎉🔥' },
        { role: 'assistant', content: 'Previous assistant response' },
        { role: 'user', content: 'Follow-up question with code:\n```javascript\nconsole.log("hello");\n```' }
      ];

      const options: CompletionOptions = { temperature: 0.5 };

      mockProvider.getCompletion.mockImplementation(async (messages, opts) => {
        // Verify complex data is preserved
        expect(messages).toHaveLength(4);
        expect(messages[0].content).toContain('àáâãäå');
        expect(messages[1].content).toContain('🚀🎉🔥');
        expect(messages[3].content).toContain('```javascript');

        if (opts.streamCallback) {
          opts.streamCallback('Complex response handled correctly');
        }
      });

      // Test both systems with complex data
      await oldAIDispatcher.getCompletion(complexMessages, options);

      const request: CompletionRequest = {
        messages: complexMessages,
        options,
        provider: 'openai',
      };

      await newAIService.getCompletion(request);

      expect(mockProvider.getCompletion).toHaveBeenCalledTimes(2);
    });

    test('should handle streaming data flow correctly', async () => {
      const messages: Message[] = [{ role: 'user', content: 'Stream test' }];
      const streamChunks: string[] = [];
      const options: CompletionOptions = {
        temperature: 0.7,
        streamCallback: (chunk: string) => {
          streamChunks.push(chunk);
        }
      };

      const testChunks = ['Hello', ' ', 'world', '!', ' ', 'This', ' ', 'is', ' ', 'streaming', '.'];

      mockProvider.getCompletion.mockImplementation(async (msgs, opts) => {
        if (opts.streamCallback) {
          for (const chunk of testChunks) {
            opts.streamCallback(chunk);
          }
        }
      });

      // Test streaming in new system
      const request: CompletionRequest = {
        messages,
        options,
        provider: 'openai',
      };

      await newAIService.getCompletion(request);

      expect(streamChunks).toEqual(testChunks);
      expect(streamChunks.join('')).toBe('Hello world! This is streaming.');
    });
  });

  describe('Cache Data Coordination', () => {
    test('should handle cache key generation consistently', async () => {
      const messages: Message[] = [{ role: 'user', content: 'Cache test message' }];
      const options: CompletionOptions = { temperature: 0.7 };

      // Mock cache operations
      const mockCacheKey = 'test-cache-key-123';
      const mockCachedResponse = 'Cached response content';

      // Spy on cache operations
      const oldCacheGetSpy = jest.spyOn(oldAIDispatcher as any, 'getFromCache');
      const oldCacheSetSpy = jest.spyOn(oldAIDispatcher as any, 'setCache');
      const newCacheGetSpy = jest.spyOn(cacheManager, 'get');
      const newCacheSetSpy = jest.spyOn(cacheManager, 'set');

      // Mock cache responses
      oldCacheGetSpy.mockReturnValue(null);
      newCacheGetSpy.mockResolvedValue(null);

      mockProvider.getCompletion.mockImplementation(async (msgs, opts) => {
        if (opts.streamCallback) {
          opts.streamCallback('Fresh response');
        }
      });

      // Execute requests
      await oldAIDispatcher.getCompletion(messages, options);

      const request: CompletionRequest = {
        messages,
        options,
        provider: 'openai',
      };

      await newAIService.getCompletion(request);

      // Verify cache operations occurred
      expect(oldCacheGetSpy).toHaveBeenCalled();
      expect(oldCacheSetSpy).toHaveBeenCalled();
      expect(newCacheGetSpy).toHaveBeenCalled();
      expect(newCacheSetSpy).toHaveBeenCalled();
    });

    test('should handle cache data format consistency', async () => {
      const messages: Message[] = [{ role: 'user', content: 'Format test' }];
      const options: CompletionOptions = { temperature: 0.5 };
      const testResponse = 'Consistent cache format response';

      mockProvider.getCompletion.mockImplementation(async (msgs, opts) => {
        if (opts.streamCallback) {
          opts.streamCallback(testResponse);
        }
      });

      // Test cache data format in new system
      const request: CompletionRequest = {
        messages,
        options,
        provider: 'openai',
      };

      await newAIService.getCompletion(request);

      // Verify cache was set with correct format
      expect(cacheManager.set).toHaveBeenCalledWith(
        expect.any(String),
        testResponse
      );
    });

    test('should handle cache TTL coordination', async () => {
      const messages: Message[] = [{ role: 'user', content: 'TTL test' }];
      const options: CompletionOptions = { temperature: 0.7 };

      mockProvider.getCompletion.mockImplementation(async (msgs, opts) => {
        if (opts.streamCallback) {
          opts.streamCallback('TTL test response');
        }
      });

      const request: CompletionRequest = {
        messages,
        options,
        provider: 'openai',
      };

      await newAIService.getCompletion(request);

      // Verify cache TTL is handled
      const cacheStats = cacheManager.getStats();
      expect(cacheStats).toBeDefined();
      expect(typeof cacheStats.size).toBe('number');
    });
  });

  describe('Request Queue Data Flow', () => {
    test('should handle request queuing data consistency', async () => {
      const messages: Message[] = [{ role: 'user', content: 'Queue test' }];
      const options: CompletionOptions = { temperature: 0.8 };

      // Mock rate limiting to trigger queuing
      jest.spyOn(rateLimiter, 'checkLimit').mockReturnValue(false);
      jest.spyOn(requestManager, 'queueRequest').mockResolvedValue(undefined);

      const request: CompletionRequest = {
        messages,
        options,
        provider: 'openai',
        priority: 5,
      };

      await newAIService.getCompletion(request);

      // Verify request was queued with correct data
      expect(requestManager.queueRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          messages,
          options,
          provider: 'openai',
          priority: 5,
        })
      );
    });

    test('should maintain request priority during queuing', async () => {
      const highPriorityMessages: Message[] = [{ role: 'user', content: 'High priority' }];
      const lowPriorityMessages: Message[] = [{ role: 'user', content: 'Low priority' }];
      const options: CompletionOptions = { temperature: 0.7 };

      // Mock rate limiting
      jest.spyOn(rateLimiter, 'checkLimit').mockReturnValue(false);
      const queueSpy = jest.spyOn(requestManager, 'queueRequest').mockResolvedValue(undefined);

      // Queue high priority request
      const highPriorityRequest: CompletionRequest = {
        messages: highPriorityMessages,
        options,
        provider: 'openai',
        priority: 10,
      };

      // Queue low priority request
      const lowPriorityRequest: CompletionRequest = {
        messages: lowPriorityMessages,
        options,
        provider: 'openai',
        priority: 1,
      };

      await newAIService.getCompletion(highPriorityRequest);
      await newAIService.getCompletion(lowPriorityRequest);

      // Verify priority data is preserved
      expect(queueSpy).toHaveBeenNthCalledWith(1, expect.objectContaining({ priority: 10 }));
      expect(queueSpy).toHaveBeenNthCalledWith(2, expect.objectContaining({ priority: 1 }));
    });

    test('should handle queue overflow gracefully', async () => {
      const messages: Message[] = [{ role: 'user', content: 'Overflow test' }];
      const options: CompletionOptions = { temperature: 0.7 };

      // Mock queue overflow
      jest.spyOn(rateLimiter, 'checkLimit').mockReturnValue(false);
      jest.spyOn(requestManager, 'queueRequest').mockRejectedValue(new Error('Queue full'));

      const request: CompletionRequest = {
        messages,
        options,
        provider: 'openai',
      };

      // Should handle queue overflow gracefully
      await expect(newAIService.getCompletion(request)).rejects.toThrow('Queue full');
    });
  });

  describe('Metrics Data Aggregation', () => {
    test('should collect metrics data consistently across systems', async () => {
      const messages: Message[] = [{ role: 'user', content: 'Metrics test' }];
      const options: CompletionOptions = { temperature: 0.7 };

      mockProvider.getCompletion.mockImplementation(async (msgs, opts) => {
        // Simulate processing time
        await new Promise(resolve => setTimeout(resolve, 100));
        if (opts.streamCallback) {
          opts.streamCallback('Metrics response');
        }
      });

      // Execute requests in both systems
      await oldAIDispatcher.getCompletion(messages, options);

      const request: CompletionRequest = {
        messages,
        options,
        provider: 'openai',
      };

      await newAIService.getCompletion(request);

      // Check metrics collection
      const oldMetrics = oldAIDispatcher.getMetrics();
      const newStats = newAIService.getStats();

      expect(oldMetrics.totalRequests).toBeGreaterThan(0);
      expect(oldMetrics.successfulRequests).toBeGreaterThan(0);
      expect(newStats.metrics).toBeDefined();
    });

    test('should handle metrics data format evolution', async () => {
      const messages: Message[] = [{ role: 'user', content: 'Evolution test' }];
      const options: CompletionOptions = { temperature: 0.7 };

      mockProvider.getCompletion.mockImplementation(async (msgs, opts) => {
        if (opts.streamCallback) {
          opts.streamCallback('Evolution response');
        }
      });

      const request: CompletionRequest = {
        messages,
        options,
        provider: 'openai',
      };

      await newAIService.getCompletion(request);

      // New system should have enhanced metrics
      const stats = newAIService.getStats();
      expect(stats).toHaveProperty('requests');
      expect(stats).toHaveProperty('cache');
      expect(stats).toHaveProperty('rateLimits');
      expect(stats).toHaveProperty('circuitBreakers');
      expect(stats).toHaveProperty('metrics');
    });

    test('should aggregate performance metrics correctly', async () => {
      const messages: Message[] = [{ role: 'user', content: 'Performance metrics test' }];
      const options: CompletionOptions = { temperature: 0.7 };

      // Mock different response times
      mockProvider.getCompletion
        .mockImplementationOnce(async (msgs, opts) => {
          await new Promise(resolve => setTimeout(resolve, 50));
          if (opts.streamCallback) opts.streamCallback('Fast response');
        })
        .mockImplementationOnce(async (msgs, opts) => {
          await new Promise(resolve => setTimeout(resolve, 150));
          if (opts.streamCallback) opts.streamCallback('Slow response');
        });

      const request: CompletionRequest = {
        messages,
        options,
        provider: 'openai',
      };

      // Execute multiple requests
      await newAIService.getCompletion(request);
      await newAIService.getCompletion(request);

      // Verify metrics aggregation
      const detailedMetrics = metricsCollector.getDetailedMetrics();
      expect(detailedMetrics.totalRequests).toBe(2);
      expect(detailedMetrics.successfulRequests).toBe(2);
      expect(detailedMetrics.averageResponseTime).toBeGreaterThan(0);
    });
  });

  describe('Error Data Propagation', () => {
    test('should propagate error data consistently', async () => {
      const messages: Message[] = [{ role: 'user', content: 'Error test' }];
      const options: CompletionOptions = { temperature: 0.7 };
      const testError = new Error('Test error with data');
      testError.name = 'TestError';

      mockProvider.getCompletion.mockRejectedValue(testError);

      // Test error propagation in both systems
      await expect(oldAIDispatcher.getCompletion(messages, options)).rejects.toThrow('Test error with data');

      const request: CompletionRequest = {
        messages,
        options,
        provider: 'openai',
      };

      await expect(newAIService.getCompletion(request)).rejects.toThrow('Test error with data');

      // Verify error metrics are collected
      const oldMetrics = oldAIDispatcher.getMetrics();
      expect(oldMetrics.failedRequests).toBeGreaterThan(0);
    });

    test('should handle error data serialization', async () => {
      const messages: Message[] = [{ role: 'user', content: 'Serialization test' }];
      const options: CompletionOptions = { temperature: 0.7 };

      const complexError = new Error('Complex error');
      (complexError as any).code = 'COMPLEX_ERROR';
      (complexError as any).details = {
        provider: 'openai',
        model: 'gpt-3.5-turbo',
        timestamp: Date.now()
      };

      mockProvider.getCompletion.mockRejectedValue(complexError);

      const request: CompletionRequest = {
        messages,
        options,
        provider: 'openai',
      };

      try {
        await newAIService.getCompletion(request);
      } catch (error: any) {
        expect(error.message).toBe('Complex error');
        expect(error.code).toBe('COMPLEX_ERROR');
      }
    });
  });

  describe('Data Consistency During Concurrent Operations', () => {
    test('should maintain data consistency with concurrent requests', async () => {
      const baseMessage = 'Concurrent test';
      const options: CompletionOptions = { temperature: 0.7 };

      mockProvider.getCompletion.mockImplementation(async (msgs, opts) => {
        // Simulate variable processing time
        const delay = Math.random() * 100;
        await new Promise(resolve => setTimeout(resolve, delay));
        
        if (opts.streamCallback) {
          opts.streamCallback(`Response for: ${msgs[0].content}`);
        }
      });

      // Create concurrent requests
      const requests = Array.from({ length: 10 }, (_, i) => {
        const messages: Message[] = [{ role: 'user', content: `${baseMessage} ${i}` }];
        const request: CompletionRequest = {
          messages,
          options,
          provider: 'openai',
        };
        return newAIService.getCompletion(request);
      });

      const responses = await Promise.all(requests);

      // Verify all responses are unique and correct
      responses.forEach((response, index) => {
        expect(response.content).toBe(`Response for: ${baseMessage} ${index}`);
      });

      expect(responses).toHaveLength(10);
    });

    test('should handle data race conditions gracefully', async () => {
      const messages: Message[] = [{ role: 'user', content: 'Race condition test' }];
      const options: CompletionOptions = { temperature: 0.7 };

      let callCount = 0;
      mockProvider.getCompletion.mockImplementation(async (msgs, opts) => {
        const currentCall = ++callCount;
        // Simulate race condition with delayed response
        await new Promise(resolve => setTimeout(resolve, Math.random() * 50));
        
        if (opts.streamCallback) {
          opts.streamCallback(`Race response ${currentCall}`);
        }
      });

      const request: CompletionRequest = {
        messages,
        options,
        provider: 'openai',
      };

      // Fire multiple concurrent requests
      const promises = [
        newAIService.getCompletion(request),
        newAIService.getCompletion(request),
        newAIService.getCompletion(request),
      ];

      const responses = await Promise.all(promises);

      // All requests should complete successfully
      expect(responses).toHaveLength(3);
      responses.forEach(response => {
        expect(response.content).toMatch(/Race response \d+/);
      });
    });
  });
});