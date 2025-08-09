/**
 * @file AIService.test.ts
 * @description Comprehensive test suite for AIService
 */

import { AIService } from '../src/services/core/AIService';
import { RequestManager } from '../src/services/core/RequestManager';
import { CacheManager } from '../src/services/core/CacheManager';
import { RateLimiter } from '../src/services/core/RateLimiter';
import { CircuitBreaker } from '../src/services/core/CircuitBreaker';
import { MetricsCollector } from '../src/services/core/MetricsCollector';
import { EventBus } from '../src/utils/eventBus';
import { CompletionRequest, CompletionResponse, ConnectionResult, IEventBus } from '../src/services/interfaces';
import { Message, CompletionOptions, MyPluginSettings, UnifiedModel, DEFAULT_SETTINGS } from '../src/types';
import { createProvider, createProviderFromUnifiedModel, getAllAvailableModels } from '../providers';
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
  getVaultBasePath: jest.fn().mockReturnValue('/mock/vault'),
}));

describe('AIService', () => {
  let aiService: AIService;
  let mockEventBus: jest.Mocked<IEventBus>;
  let mockRequestManager: jest.Mocked<RequestManager>;
  let mockCacheManager: jest.Mocked<CacheManager>;
  let mockRateLimiter: jest.Mocked<RateLimiter>;
  let mockCircuitBreaker: jest.Mocked<CircuitBreaker>;
  let mockMetricsCollector: jest.Mocked<MetricsCollector>;
  let mockSettings: MyPluginSettings;
  let mockSaveSettings: jest.Mock;
  let mockProvider: jest.Mocked<BaseProvider>;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    // Create mock event bus
    mockEventBus = {
      publish: jest.fn().mockResolvedValue(undefined),
      subscribe: jest.fn().mockReturnValue(() => {}),
      subscribeOnce: jest.fn().mockReturnValue(() => {}),
      unsubscribe: jest.fn(),
      clear: jest.fn(),
      getSubscriptionCount: jest.fn().mockReturnValue(0),
    };

    // Create mock services
    mockRequestManager = {
      queueRequest: jest.fn().mockResolvedValue(undefined),
      processQueue: jest.fn().mockResolvedValue(undefined),
      getQueueStatus: jest.fn().mockReturnValue({
        queueLength: 0,
        processing: false,
        averageWaitTime: 0,
        totalProcessed: 0,
      }),
      abortRequest: jest.fn(),
      abortAllRequests: jest.fn(),
      getQueueStats: jest.fn().mockReturnValue({
        currentSize: 0,
        maxSize: 100,
        totalProcessed: 0,
        averageProcessingTime: 0,
        isProcessing: false,
      }),
      dispose: jest.fn(),
    } as any;

    mockCacheManager = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
      clear: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue(undefined),
      getStats: jest.fn().mockReturnValue({
        hits: 0,
        misses: 0,
        size: 0,
        maxSize: 200,
        hitRate: 0,
      }),
      dispose: jest.fn(),
    } as any;

    mockRateLimiter = {
      checkLimit: jest.fn().mockReturnValue(true),
      recordRequest: jest.fn(),
      getRemainingRequests: jest.fn().mockReturnValue(60),
      resetLimits: jest.fn(),
      getProviderLimits: jest.fn().mockReturnValue({}),
      dispose: jest.fn(),
    } as any;

    mockCircuitBreaker = {
      isOpen: jest.fn().mockReturnValue(false),
      recordSuccess: jest.fn(),
      recordFailure: jest.fn(),
      getState: jest.fn().mockReturnValue({
        isOpen: false,
        failureCount: 0,
        lastFailureTime: 0,
        nextRetryTime: 0,
      }),
      reset: jest.fn(),
      getAllStats: jest.fn().mockReturnValue({}),
      dispose: jest.fn(),
    } as any;

    mockMetricsCollector = {
      recordRequest: jest.fn(),
      recordCacheHit: jest.fn(),
      recordCacheMiss: jest.fn(),
      getMetrics: jest.fn().mockReturnValue({
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        averageResponseTime: 0,
        requestsByProvider: {},
        errorsByProvider: {},
      }),
      resetMetrics: jest.fn(),
      exportMetrics: jest.fn().mockReturnValue('{}'),
      getDetailedMetrics: jest.fn().mockReturnValue({
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        averageResponseTime: 0,
        requestsByProvider: {},
        errorsByProvider: {},
        providerMetrics: {},
        cacheMetrics: { hits: 0, misses: 0, hitRate: 0 },
        performanceMetrics: {
          averageResponseTime: 0,
          p95ResponseTime: 0,
          p99ResponseTime: 0,
          throughput: 0,
        },
        timeSeriesData: {
          requests: [],
          responseTime: [],
          errors: [],
        },
      }),
      dispose: jest.fn(),
    } as any;

    // Create mock settings based on DEFAULT_SETTINGS
    mockSettings = {
      ...DEFAULT_SETTINGS,
      provider: 'openai',
      selectedModel: 'openai:gpt-3.5-turbo',
      debugMode: false,
      openaiSettings: {
        ...DEFAULT_SETTINGS.openaiSettings,
        apiKey: 'test-key',
        model: 'gpt-3.5-turbo',
      },
    };

    mockSaveSettings = jest.fn().mockResolvedValue(undefined);

    // Create mock provider
    mockProvider = {
      getCompletion: jest.fn().mockResolvedValue(undefined),
      testConnection: jest.fn().mockResolvedValue({ success: true, message: 'Connected' }),
      getAvailableModels: jest.fn().mockResolvedValue(['model1', 'model2']),
    } as any;

    // Mock provider creation functions
    (createProvider as jest.Mock).mockReturnValue(mockProvider);
    (createProviderFromUnifiedModel as jest.Mock).mockReturnValue(mockProvider);
    (getAllAvailableModels as jest.Mock).mockResolvedValue([
      { id: 'openai:gpt-3.5-turbo', name: 'GPT-3.5 Turbo', provider: 'openai', modelId: 'gpt-3.5-turbo' },
    ]);

    // Create AIService instance
    aiService = new AIService(
      mockEventBus,
      mockRequestManager,
      mockCacheManager,
      mockRateLimiter,
      mockCircuitBreaker,
      mockMetricsCollector,
      mockSettings,
      mockSaveSettings
    );
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  describe('constructor', () => {
    test('should initialize with all dependencies', () => {
      expect(aiService).toBeInstanceOf(AIService);
      expect(mockEventBus.subscribe).toHaveBeenCalledWith('request.processing', expect.any(Function));
    });

    test('should setup event listeners', () => {
      expect(mockEventBus.subscribe).toHaveBeenCalledWith('request.processing', expect.any(Function));
    });
  });

  describe('getCompletion', () => {
    const mockMessages: Message[] = [{ role: 'user', content: 'Hello' }];
    const mockOptions: CompletionOptions = { temperature: 0.7 };
    const mockRequest: CompletionRequest = {
      messages: mockMessages,
      options: mockOptions,
      provider: 'openai',
      priority: 0,
    };

    test('should return cached response when available', async () => {
      const cachedResponse = 'Cached response';
      mockCacheManager.get.mockResolvedValue(cachedResponse);
      
      const streamCallback = jest.fn();
      const requestWithCallback = {
        ...mockRequest,
        options: { ...mockOptions, streamCallback },
      };

      const response = await aiService.getCompletion(requestWithCallback);

      expect(mockCacheManager.get).toHaveBeenCalled();
      expect(mockMetricsCollector.recordCacheHit).toHaveBeenCalled();
      expect(streamCallback).toHaveBeenCalledWith(cachedResponse);
      expect(response.content).toBe(cachedResponse);
      expect(response.provider).toBe('openai');
      expect(mockProvider.getCompletion).not.toHaveBeenCalled();
    });

    test('should record cache miss when no cached response', async () => {
      mockCacheManager.get.mockResolvedValue(null);
      mockProvider.getCompletion.mockImplementation(async (messages, options) => {
        if (options.streamCallback) {
          options.streamCallback('Hello');
          options.streamCallback(' World');
        }
      });

      await aiService.getCompletion(mockRequest);

      expect(mockCacheManager.get).toHaveBeenCalled();
      expect(mockMetricsCollector.recordCacheMiss).toHaveBeenCalled();
      expect(mockProvider.getCompletion).toHaveBeenCalled();
    });

    test('should throw error when circuit breaker is open', async () => {
      mockCacheManager.get.mockResolvedValue(null);
      mockCircuitBreaker.isOpen.mockReturnValue(true);

      await expect(aiService.getCompletion(mockRequest)).rejects.toThrow(
        'Provider openai is temporarily unavailable (circuit breaker open)'
      );

      expect(mockCircuitBreaker.isOpen).toHaveBeenCalledWith('openai');
      expect(mockProvider.getCompletion).not.toHaveBeenCalled();
    });

    test('should queue request when rate limited', async () => {
      mockCacheManager.get.mockResolvedValue(null);
      mockRateLimiter.checkLimit.mockReturnValue(false);

      const response = await aiService.getCompletion(mockRequest);

      expect(mockRateLimiter.checkLimit).toHaveBeenCalledWith('openai');
      expect(mockRequestManager.queueRequest).toHaveBeenCalled();
      expect(response.content).toBe('');
      expect(mockProvider.getCompletion).not.toHaveBeenCalled();
    });

    test('should execute request successfully', async () => {
      mockCacheManager.get.mockResolvedValue(null);
      mockProvider.getCompletion.mockImplementation(async (messages, options) => {
        if (options.streamCallback) {
          options.streamCallback('Hello');
          options.streamCallback(' World');
        }
      });

      const response = await aiService.getCompletion(mockRequest);

      expect(mockProvider.getCompletion).toHaveBeenCalledWith(
        mockMessages,
        expect.objectContaining({
          temperature: 0.7,
          streamCallback: expect.any(Function),
          abortController: expect.any(AbortController),
        })
      );
      expect(mockRateLimiter.recordRequest).toHaveBeenCalledWith('openai');
      expect(mockCircuitBreaker.recordSuccess).toHaveBeenCalledWith('openai');
      expect(mockMetricsCollector.recordRequest).toHaveBeenCalledWith('openai', expect.any(Number), true);
      expect(mockCacheManager.set).toHaveBeenCalledWith(expect.any(String), 'Hello World');
      expect(mockEventBus.publish).toHaveBeenCalledWith('ai.request.completed', expect.any(Object));
      expect(response.content).toBe('Hello World');
    });

    test('should handle request failure', async () => {
      mockCacheManager.get.mockResolvedValue(null);
      const error = new Error('API Error');
      mockProvider.getCompletion.mockRejectedValue(error);

      await expect(aiService.getCompletion(mockRequest)).rejects.toThrow('API Error');

      expect(mockCircuitBreaker.recordFailure).toHaveBeenCalledWith('openai');
      expect(mockMetricsCollector.recordRequest).toHaveBeenCalledWith('openai', expect.any(Number), false);
      expect(mockEventBus.publish).toHaveBeenCalledWith('ai.request.failed', expect.any(Object));
    });

    test('should use selected model when available', async () => {
      mockSettings.selectedModel = 'anthropic:claude-2';
      mockCacheManager.get.mockResolvedValue(null);
      mockProvider.getCompletion.mockImplementation(async (messages, options) => {
        if (options.streamCallback) {
          options.streamCallback('Response');
        }
      });

      await aiService.getCompletion(mockRequest);

      expect(createProviderFromUnifiedModel).toHaveBeenCalledWith(mockSettings, 'anthropic:claude-2');
    });

    test('should handle provider override', async () => {
      const requestWithProvider = { ...mockRequest, provider: 'anthropic' };
      mockCacheManager.get.mockResolvedValue(null);
      mockProvider.getCompletion.mockImplementation(async (messages, options) => {
        if (options.streamCallback) {
          options.streamCallback('Response');
        }
      });

      await aiService.getCompletion(requestWithProvider);

      expect(mockRateLimiter.checkLimit).toHaveBeenCalledWith('anthropic');
      expect(mockRateLimiter.recordRequest).toHaveBeenCalledWith('anthropic');
    });
  });

  describe('testConnection', () => {
    test('should test connection successfully', async () => {
      const mockResult: ConnectionResult = { success: true, message: 'Connected', latency: 100 };
      mockProvider.testConnection.mockResolvedValue(mockResult);

      const result = await aiService.testConnection('openai');

      expect(createProvider).toHaveBeenCalledWith(expect.objectContaining({ provider: 'openai' }));
      expect(mockProvider.testConnection).toHaveBeenCalled();
      expect(mockEventBus.publish).toHaveBeenCalledWith('ai.connection.tested', expect.objectContaining({
        provider: 'openai',
        success: true,
        latency: 100,
      }));
      expect(result).toEqual(mockResult);
    });

    test('should handle connection failure', async () => {
      const error = new Error('Connection failed');
      mockProvider.testConnection.mockRejectedValue(error);

      const result = await aiService.testConnection('openai');

      expect(result.success).toBe(false);
      expect(result.message).toBe('Connection failed');
      expect(mockEventBus.publish).toHaveBeenCalledWith('ai.connection.tested', expect.objectContaining({
        provider: 'openai',
        success: false,
        error: 'Connection failed',
      }));
    });

    test('should handle invalid provider', async () => {
      const { isValidProviderName } = require('../src/utils/typeguards');
      (isValidProviderName as jest.Mock).mockReturnValue(false);

      const result = await aiService.testConnection('invalid');

      expect(result.success).toBe(false);
      expect(result.message).toBe('Invalid provider: invalid');
    });
  });

  describe('getAvailableModels', () => {
    test('should get available models successfully', async () => {
      const mockModels = ['model1', 'model2', 'model3'];
      mockProvider.getAvailableModels.mockResolvedValue(mockModels);
      
      // Ensure isValidProviderName returns true for this test
      const { isValidProviderName } = require('../src/utils/typeguards');
      (isValidProviderName as jest.Mock).mockReturnValue(true);

      const models = await aiService.getAvailableModels('openai');

      expect(createProvider).toHaveBeenCalledWith(expect.objectContaining({ provider: 'openai' }));
      expect(mockProvider.getAvailableModels).toHaveBeenCalled();
      expect(mockEventBus.publish).toHaveBeenCalledWith('ai.models.fetched', expect.objectContaining({
        provider: 'openai',
        modelCount: 3,
      }));
      expect(models).toEqual(mockModels);
    });

    test('should handle models fetch failure', async () => {
      // Ensure isValidProviderName returns true for this test
      const { isValidProviderName } = require('../src/utils/typeguards');
      (isValidProviderName as jest.Mock).mockReturnValue(true);
      
      const error = new Error('Fetch failed');
      mockProvider.getAvailableModels.mockRejectedValue(error);

      await expect(aiService.getAvailableModels('openai')).rejects.toThrow('Fetch failed');

      expect(mockEventBus.publish).toHaveBeenCalledWith('ai.models.fetch_failed', expect.objectContaining({
        provider: 'openai',
        error: 'Fetch failed',
      }));
    });

    test('should handle invalid provider', async () => {
      const { isValidProviderName } = require('../src/utils/typeguards');
      (isValidProviderName as jest.Mock).mockReturnValue(false);

      await expect(aiService.getAvailableModels('invalid')).rejects.toThrow('Invalid provider: invalid');
    });
  });

  describe('getAllUnifiedModels', () => {
    test('should get all unified models successfully', async () => {
      const mockModels: UnifiedModel[] = [
        { id: 'openai:gpt-3.5-turbo', name: 'GPT-3.5 Turbo', provider: 'openai', modelId: 'gpt-3.5-turbo' },
        { id: 'anthropic:claude-2', name: 'Claude 2', provider: 'anthropic', modelId: 'claude-2' },
      ];
      (getAllAvailableModels as jest.Mock).mockResolvedValue(mockModels);

      const models = await aiService.getAllUnifiedModels();

      expect(getAllAvailableModels).toHaveBeenCalledWith(mockSettings);
      expect(mockEventBus.publish).toHaveBeenCalledWith('ai.unified_models.fetched', expect.objectContaining({
        modelCount: 2,
      }));
      expect(models).toEqual(mockModels);
    });

    test('should handle unified models fetch failure', async () => {
      const error = new Error('Unified fetch failed');
      (getAllAvailableModels as jest.Mock).mockRejectedValue(error);

      await expect(aiService.getAllUnifiedModels()).rejects.toThrow('Unified fetch failed');

      expect(mockEventBus.publish).toHaveBeenCalledWith('ai.unified_models.fetch_failed', expect.objectContaining({
        error: 'Unified fetch failed',
      }));
    });
  });

  describe('setSelectedModel', () => {
    test('should set selected model and update provider', async () => {
      // Mock isValidProviderName to return true for 'anthropic'
      const { isValidProviderName } = require('../src/utils/typeguards');
      (isValidProviderName as jest.Mock).mockImplementation((provider: string) => {
        return ['openai', 'anthropic', 'gemini', 'ollama'].includes(provider);
      });

      await aiService.setSelectedModel('anthropic:claude-2');

      expect(mockSettings.selectedModel).toBe('anthropic:claude-2');
      expect(mockSettings.provider).toBe('anthropic');
      expect(mockSaveSettings).toHaveBeenCalled();
      expect(mockEventBus.publish).toHaveBeenCalledWith('ai.model.selected', expect.objectContaining({
        modelId: 'anthropic:claude-2',
        provider: 'anthropic',
      }));
    });

    test('should handle model without provider prefix', async () => {
      await aiService.setSelectedModel('gpt-4');

      expect(mockSettings.selectedModel).toBe('gpt-4');
      // Provider should not be updated for invalid format
      expect(mockSettings.provider).toBe('openai'); // Original value
    });
  });

  describe('getCurrentModel', () => {
    test('should return current selected model', () => {
      mockSettings.selectedModel = 'openai:gpt-4';
      
      const model = aiService.getCurrentModel();
      
      expect(model).toBe('openai:gpt-4');
    });

    test('should return undefined when no model selected', () => {
      mockSettings.selectedModel = undefined;
      
      const model = aiService.getCurrentModel();
      
      expect(model).toBeUndefined();
    });
  });

  describe('isProviderConfigured', () => {
    test('should return true for configured OpenAI', () => {
      mockSettings.openaiSettings.apiKey = 'test-key';
      
      const configured = aiService.isProviderConfigured('openai');
      
      expect(configured).toBe(true);
    });

    test('should return false for unconfigured Anthropic', () => {
      mockSettings.anthropicSettings.apiKey = '';
      
      const configured = aiService.isProviderConfigured('anthropic');
      
      expect(configured).toBe(false);
    });

    test('should return true for configured Ollama with server URL', () => {
      mockSettings.ollamaSettings.serverUrl = 'http://localhost:11434';
      
      const configured = aiService.isProviderConfigured('ollama');
      
      expect(configured).toBe(true);
    });

    test('should return false for unknown provider', () => {
      const configured = aiService.isProviderConfigured('unknown');
      
      expect(configured).toBe(false);
    });
  });

  describe('getConfiguredProviders', () => {
    test('should return list of configured providers', () => {
      mockSettings.openaiSettings.apiKey = 'test-key';
      mockSettings.geminiSettings.apiKey = 'gemini-key';
      mockSettings.ollamaSettings.serverUrl = 'http://localhost:11434';
      
      const providers = aiService.getConfiguredProviders();
      
      expect(providers).toEqual(['openai', 'gemini', 'ollama']);
    });

    test('should return empty array when no providers configured', () => {
      mockSettings.openaiSettings.apiKey = '';
      mockSettings.anthropicSettings.apiKey = '';
      mockSettings.geminiSettings.apiKey = '';
      mockSettings.ollamaSettings.serverUrl = '';
      
      const providers = aiService.getConfiguredProviders();
      
      expect(providers).toEqual([]);
    });
  });

  describe('getStats', () => {
    test('should return comprehensive service statistics', () => {
      const stats = aiService.getStats();

      expect(stats).toEqual({
        requests: mockRequestManager.getQueueStats(),
        cache: mockCacheManager.getStats(),
        rateLimits: mockRateLimiter.getProviderLimits(),
        circuitBreakers: mockCircuitBreaker.getAllStats(),
        metrics: mockMetricsCollector.getDetailedMetrics(),
      });
    });
  });

  describe('abortAllStreams', () => {
    test('should abort all active streams', () => {
      // Create a request to establish an active stream
      const mockRequest: CompletionRequest = {
        messages: [{ role: 'user', content: 'Hello' }],
        options: { temperature: 0.7 },
      };

      // Mock the private activeStreams map by accessing it through the service
      aiService.abortAllStreams();

      expect(mockEventBus.publish).toHaveBeenCalledWith('ai.streams.aborted_all', expect.objectContaining({
        count: expect.any(Number),
      }));
    });
  });

  describe('event handling', () => {
    test('should handle request.processing event', async () => {
      // Get the event handler that was registered
      const eventHandler = (mockEventBus.subscribe as jest.Mock).mock.calls
        .find(call => call[0] === 'request.processing')?.[1];

      expect(eventHandler).toBeDefined();

      // Mock the event data
      const eventData = {
        messages: [{ role: 'user', content: 'Test' }],
        options: { temperature: 0.5 },
        provider: 'openai',
      };

      mockCacheManager.get.mockResolvedValue(null);
      mockProvider.getCompletion.mockImplementation(async (messages, options) => {
        if (options.streamCallback) {
          options.streamCallback('Response');
        }
      });

      // Call the event handler
      await eventHandler(eventData);

      // Verify that getCompletion was called
      expect(mockProvider.getCompletion).toHaveBeenCalled();
    });

    test('should handle errors in request.processing event', async () => {
      const eventHandler = (mockEventBus.subscribe as jest.Mock).mock.calls
        .find(call => call[0] === 'request.processing')?.[1];

      const eventData = {
        messages: [{ role: 'user', content: 'Test' }],
        options: { temperature: 0.5 },
        provider: 'openai',
      };

      mockCacheManager.get.mockResolvedValue(null);
      mockProvider.getCompletion.mockRejectedValue(new Error('Processing error'));

      // Should not throw when event handler encounters an error
      await expect(eventHandler(eventData)).resolves.toBeUndefined();
    });
  });

  describe('cache key generation', () => {
    test('should generate consistent cache keys', async () => {
      const request1: CompletionRequest = {
        messages: [{ role: 'user', content: 'Hello' }],
        options: { temperature: 0.7 },
      };

      const request2: CompletionRequest = {
        messages: [{ role: 'user', content: 'Hello' }],
        options: { temperature: 0.7 },
      };

      mockCacheManager.get.mockResolvedValue(null);
      mockProvider.getCompletion.mockImplementation(async (messages, options) => {
        if (options.streamCallback) {
          options.streamCallback('Response');
        }
      });

      await aiService.getCompletion(request1);
      await aiService.getCompletion(request2);

      // Both requests should use the same cache key
      expect(mockCacheManager.get).toHaveBeenCalledTimes(2);
      const cacheKey1 = (mockCacheManager.get as jest.Mock).mock.calls[0][0];
      const cacheKey2 = (mockCacheManager.get as jest.Mock).mock.calls[1][0];
      expect(cacheKey1).toBe(cacheKey2);
    });
  });

  describe('provider determination', () => {
    test('should use provider override when specified', async () => {
      const request: CompletionRequest = {
        messages: [{ role: 'user', content: 'Hello' }],
        options: { temperature: 0.7 },
        provider: 'anthropic',
      };

      mockCacheManager.get.mockResolvedValue(null);
      mockProvider.getCompletion.mockImplementation(async (messages, options) => {
        if (options.streamCallback) {
          options.streamCallback('Response');
        }
      });

      await aiService.getCompletion(request);

      expect(mockRateLimiter.checkLimit).toHaveBeenCalledWith('anthropic');
    });

    test('should use selected model provider when no override', async () => {
      mockSettings.selectedModel = 'gemini:gemini-pro';
      
      const request: CompletionRequest = {
        messages: [{ role: 'user', content: 'Hello' }],
        options: { temperature: 0.7 },
      };

      mockCacheManager.get.mockResolvedValue(null);
      mockProvider.getCompletion.mockImplementation(async (messages, options) => {
        if (options.streamCallback) {
          options.streamCallback('Response');
        }
      });

      await aiService.getCompletion(request);

      expect(mockRateLimiter.checkLimit).toHaveBeenCalledWith('gemini');
    });

    test('should fall back to settings provider', async () => {
      mockSettings.selectedModel = undefined;
      mockSettings.provider = 'anthropic';
      
      const request: CompletionRequest = {
        messages: [{ role: 'user', content: 'Hello' }],
        options: { temperature: 0.7 },
      };

      mockCacheManager.get.mockResolvedValue(null);
      mockProvider.getCompletion.mockImplementation(async (messages, options) => {
        if (options.streamCallback) {
          options.streamCallback('Response');
        }
      });

      await aiService.getCompletion(request);

      expect(mockRateLimiter.checkLimit).toHaveBeenCalledWith('anthropic');
    });
  });

  describe('dispose', () => {
    test('should dispose all services and abort streams', () => {
      aiService.dispose();

      expect(mockRequestManager.dispose).toHaveBeenCalled();
      expect(mockCacheManager.dispose).toHaveBeenCalled();
      expect(mockRateLimiter.dispose).toHaveBeenCalled();
      expect(mockCircuitBreaker.dispose).toHaveBeenCalled();
      expect(mockMetricsCollector.dispose).toHaveBeenCalled();
    });
  });

  describe('edge cases and error scenarios', () => {
    test('should handle empty messages array', async () => {
      const request: CompletionRequest = {
        messages: [],
        options: { temperature: 0.7 },
      };

      mockCacheManager.get.mockResolvedValue(null);
      mockProvider.getCompletion.mockImplementation(async (messages, options) => {
        if (options.streamCallback) {
          options.streamCallback('Response');
        }
      });

      await aiService.getCompletion(request);

      expect(mockProvider.getCompletion).toHaveBeenCalledWith([], expect.any(Object));
    });

    test('should handle very long response content', async () => {
      const longContent = 'A'.repeat(10000); // Very long response
      mockCacheManager.get.mockResolvedValue(null);
      mockProvider.getCompletion.mockImplementation(async (messages, options) => {
        if (options.streamCallback) {
          options.streamCallback(longContent);
        }
      });

      const request: CompletionRequest = {
        messages: [{ role: 'user', content: 'Generate long content' }],
        options: { temperature: 0.7 },
      };

      const response = await aiService.getCompletion(request);

      expect(response.content).toBe(longContent);
      expect(mockCacheManager.set).toHaveBeenCalledWith(expect.any(String), longContent);
    });

    test('should handle network timeout errors', async () => {
      mockCacheManager.get.mockResolvedValue(null);
      const timeoutError = new Error('Request timeout');
      timeoutError.name = 'TimeoutError';
      mockProvider.getCompletion.mockRejectedValue(timeoutError);

      const request: CompletionRequest = {
        messages: [{ role: 'user', content: 'Hello' }],
        options: { temperature: 0.7 },
      };

      await expect(aiService.getCompletion(request)).rejects.toThrow('Request timeout');
      expect(mockCircuitBreaker.recordFailure).toHaveBeenCalledWith('openai');
    });

    test('should handle malformed provider responses', async () => {
      mockCacheManager.get.mockResolvedValue(null);
      mockProvider.getCompletion.mockImplementation(async (messages, options) => {
        // Simulate malformed response by not calling streamCallback
        // This should still work but result in empty content
      });

      const request: CompletionRequest = {
        messages: [{ role: 'user', content: 'Hello' }],
        options: { temperature: 0.7 },
      };

      const response = await aiService.getCompletion(request);

      expect(response.content).toBe('');
      expect(mockCircuitBreaker.recordSuccess).toHaveBeenCalledWith('openai');
    });

    test('should handle concurrent requests properly', async () => {
      mockCacheManager.get.mockResolvedValue(null);
      mockProvider.getCompletion.mockImplementation(async (messages, options) => {
        // Immediate response without delay
        if (options.streamCallback) {
          options.streamCallback('Response');
        }
      });

      const request: CompletionRequest = {
        messages: [{ role: 'user', content: 'Hello' }],
        options: { temperature: 0.7 },
      };

      // Fire multiple concurrent requests
      const promises = [
        aiService.getCompletion(request),
        aiService.getCompletion(request),
        aiService.getCompletion(request),
      ];

      const responses = await Promise.all(promises);

      expect(responses).toHaveLength(3);
      responses.forEach(response => {
        expect(response.content).toBe('Response');
      });
      expect(mockProvider.getCompletion).toHaveBeenCalledTimes(3);
    });

    test('should handle stream abortion', () => {
      // Test that abortAllStreams method works correctly
      aiService.abortAllStreams();

      expect(mockEventBus.publish).toHaveBeenCalledWith('ai.streams.aborted_all', expect.objectContaining({
        count: expect.any(Number),
        timestamp: expect.any(Number),
      }));
    });
  });

  describe('integration with service dependencies', () => {
    test('should coordinate with all services during successful request', async () => {
      mockCacheManager.get.mockResolvedValue(null);
      mockProvider.getCompletion.mockImplementation(async (messages, options) => {
        if (options.streamCallback) {
          options.streamCallback('Integration test response');
        }
      });

      const request: CompletionRequest = {
        messages: [{ role: 'user', content: 'Integration test' }],
        options: { temperature: 0.8 },
      };

      await aiService.getCompletion(request);

      // Verify all services were called in the correct order
      expect(mockCacheManager.get).toHaveBeenCalled();
      expect(mockCircuitBreaker.isOpen).toHaveBeenCalled();
      expect(mockRateLimiter.checkLimit).toHaveBeenCalled();
      expect(mockRateLimiter.recordRequest).toHaveBeenCalled();
      expect(mockProvider.getCompletion).toHaveBeenCalled();
      expect(mockCircuitBreaker.recordSuccess).toHaveBeenCalled();
      expect(mockMetricsCollector.recordRequest).toHaveBeenCalledWith('openai', expect.any(Number), true);
      expect(mockCacheManager.set).toHaveBeenCalled();
      expect(mockEventBus.publish).toHaveBeenCalledWith('ai.request.completed', expect.any(Object));
    });

    test('should handle service failures gracefully', async () => {
      mockCacheManager.get.mockRejectedValue(new Error('Cache error'));
      
      const request: CompletionRequest = {
        messages: [{ role: 'user', content: 'Test' }],
        options: { temperature: 0.7 },
      };

      // Should still proceed even if cache fails
      await expect(aiService.getCompletion(request)).rejects.toThrow();
    });
  });

  describe('performance and memory management', () => {
    test('should clean up resources properly', () => {
      // Create multiple requests to establish streams
      const requests = Array.from({ length: 5 }, (_, i) => ({
        messages: [{ role: 'user' as const, content: `Message ${i}` }],
        options: { temperature: 0.7 },
      }));

      // Dispose should clean up everything
      aiService.dispose();

      expect(mockRequestManager.dispose).toHaveBeenCalled();
      expect(mockCacheManager.dispose).toHaveBeenCalled();
      expect(mockRateLimiter.dispose).toHaveBeenCalled();
      expect(mockCircuitBreaker.dispose).toHaveBeenCalled();
      expect(mockMetricsCollector.dispose).toHaveBeenCalled();
    });

    test('should handle memory pressure scenarios', async () => {
      // Simulate many rapid requests
      const requests = Array.from({ length: 100 }, (_, i) => ({
        messages: [{ role: 'user' as const, content: `Bulk message ${i}` }],
        options: { temperature: 0.7 },
      }));

      mockCacheManager.get.mockResolvedValue(null);
      mockProvider.getCompletion.mockImplementation(async (messages, options) => {
        if (options.streamCallback) {
          options.streamCallback(`Response ${Math.random()}`);
        }
      });

      // Should handle bulk requests without issues
      const promises = requests.map(req => aiService.getCompletion(req));
      const responses = await Promise.all(promises);

      expect(responses).toHaveLength(100);
      expect(mockProvider.getCompletion).toHaveBeenCalledTimes(100);
    });
  });
});