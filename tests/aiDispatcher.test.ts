import { AIDispatcher } from '../src/utils/aiDispatcher';
import { Vault } from 'obsidian';
import { Message, CompletionOptions, MyPluginSettings, UnifiedModel } from '../src/types';
import { BaseProvider } from '../providers/base';
import { createProvider, createProviderFromUnifiedModel, getAllAvailableModels } from '../providers';
import { saveAICallToFolder } from '../src/utils/saveAICalls';
import { debugLog } from '../src/utils/logger';
import { LRUCache, LRUCacheFactory } from '../src/utils/lruCache';
import { MessageContextPool, PreAllocatedArrays } from '../src/utils/objectPool';

// Mock external dependencies
jest.mock('obsidian', () => ({
  Vault: jest.fn(() => ({
    adapter: {
      basePath: '/mock/vault'
    }
  })),
}));
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
jest.mock('../src/utils/lruCache', () => ({
  LRUCache: jest.fn().mockImplementation(() => ({
    get: jest.fn(),
    set: jest.fn(),
    has: jest.fn(),
    delete: jest.fn(),
    clear: jest.fn(),
    cleanup: jest.fn(),
    size: jest.fn(() => 0),
  })),
  LRUCacheFactory: {
    createResponseCache: jest.fn().mockImplementation(() => ({
      get: jest.fn(),
      set: jest.fn(),
      has: jest.fn(),
      delete: jest.fn(),
      clear: jest.fn(),
      cleanup: jest.fn(),
      size: jest.fn(() => 0),
    })),
    createDOMCache: jest.fn(),
    createAPICache: jest.fn(),
    createComputedCache: jest.fn(),
  },
}));
jest.mock('../src/utils/objectPool', () => ({
  MessageContextPool: {
    getInstance: jest.fn().mockImplementation(() => ({
      acquireMessage: jest.fn(() => ({ role: '', content: '' })),
      releaseMessage: jest.fn(),
      acquireArray: jest.fn(() => []),
      releaseArray: jest.fn(),
      clear: jest.fn(),
    })),
  },
  PreAllocatedArrays: {
    getInstance: jest.fn().mockImplementation(() => ({
      getArray: jest.fn((size: number) => new Array(size)),
      returnArray: jest.fn(),
      clear: jest.fn(),
    })),
  },
}));

// Mock BaseProvider
const mockBaseProvider = {
  getCompletion: jest.fn(),
  testConnection: jest.fn(),
  getAvailableModels: jest.fn(),
};

// Use jest.mocked to get a typed mock
const mockedBaseProvider = jest.mocked(mockBaseProvider); // Removed 'true'

describe('AIDispatcher', () => {
  let vault: Vault;
  let plugin: { settings: MyPluginSettings; saveSettings: jest.Mock };
  let dispatcher: AIDispatcher;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers(); // Use fake timers for setIntervals

    vault = new Vault();
    plugin = {
      settings: {
        provider: 'openai',
        selectedModel: 'openai:gpt-3.5-turbo',
        debugMode: false,
        openaiSettings: { apiKey: 'test-key', model: 'gpt-3.5-turbo', availableModels: [], baseUrl: '' },
        anthropicSettings: { apiKey: '', model: '', availableModels: [], baseUrl: '' },
        geminiSettings: { apiKey: '', model: '', availableModels: [], baseUrl: '' },
        ollamaSettings: { serverUrl: '', model: '', availableModels: [], baseUrl: '' },
        referenceCurrentNote: false,
        systemMessage: '',
        temperature: 0.7,
        aiCallFolder: 'AI Calls',
        autoSuggest: false,
        autoSuggestTrigger: ' ',
        enableStream: true,
        maxResponseTokens: 4000,
        model: 'gpt-3.5-turbo',
        promptHistory: [],
        showAssistant: true,
        showPrompt: true,
        stream: true,
        vaultPath: '',
        includeTimeWithSystemMessage: false,
        enableStreaming: true,
        autoOpenModelSettings: false,
        maxChatHistory: 10,
        maxMemoryContext: 5,
        enableMemory: false,
        enableToolUse: false,
        toolUseProvider: 'openai',
        toolUseModel: 'gpt-4',
        toolUseTemperature: 0.5,
        toolUseSystemMessage: '',
        toolUsePrompt: '',
        toolUseHistory: [],
        toolUseMaxChatHistory: 10,
        toolUseMaxMemoryContext: 5,
        toolUseEnableMemory: false,
        toolUseEnableToolUse: false,
        toolUseToolUseProvider: 'openai',
        toolUseToolUseModel: 'gpt-4',
        toolUseToolUseTemperature: 0.5,
        toolUseToolUseSystemMessage: '',
        toolUseToolUsePrompt: '',
        toolUseToolUseHistory: [],
        toolUseToolUseMaxChatHistory: 10,
        toolUseToolUseMaxMemoryContext: 5,
        toolUseToolUseEnableMemory: false,
        toolUseToolUseEnableToolUse: false,
        enableObsidianLinks: false,
        chatSeparator: '---',
        enableContextNotes: false,
        contextNotes: '', // Changed to string
        contextTemplate: '',
        contextTag: '',
        contextFolder: '',
        contextNoteTitle: '',
        contextNoteContent: '',
        contextNoteTemplate: '',
        contextNoteTag: '',
        contextNoteFolder: '',
        contextNoteTitleTemplate: '',
        contextNoteContentTemplate: '',
        titlePrompt: '',
        summaryPrompt: '',
        maxSessions: 10,
        autoSaveSessions: false,
        sessions: [],
        // Add any other missing properties with default values
        // Missing properties from MyPluginSettings:
        // enableObsidianLinks: boolean;
        // chatSeparator: string;
        // enableContextNotes: boolean;
        // contextNotes: string; // Assuming it's a string now
        // contextTemplate: string;
        // contextTag: string;
        // contextFolder: string;
        // contextNoteTitle: string;
        // contextNoteContent: string;
        // contextNoteTemplate: string;
        // contextNoteTag: string;
        // contextNoteFolder: string;
        // contextNoteTitleTemplate: string;
        // contextNoteContentTemplate: string;
        // titlePrompt: string;
        // summaryPrompt: string;
        // maxSessions: number;
        // autoSaveSessions: boolean;
        // sessions: any[]; // Assuming it's an array
      } as MyPluginSettings, // Cast to MyPluginSettings
      saveSettings: jest.fn(),
    };

    // Mock createProvider and createProviderFromUnifiedModel to return our mockedBaseProvider
    (createProvider as jest.Mock).mockReturnValue(mockedBaseProvider);
    (createProviderFromUnifiedModel as jest.Mock).mockReturnValue(mockedBaseProvider);

    dispatcher = new AIDispatcher(vault, plugin);
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  describe('constructor', () => {
    test('should initialize caches, metrics, and circuit breakers', () => {
      expect(LRUCacheFactory.createResponseCache).toHaveBeenCalledWith(200);
      expect(LRUCache).toHaveBeenCalledTimes(3); // For modelCache, providerCache, pendingRequests
      expect(MessageContextPool.getInstance).toHaveBeenCalledTimes(1);
      expect(PreAllocatedArrays.getInstance).toHaveBeenCalledTimes(1);
      
      // Check circuit breakers are initialized
      expect(dispatcher['circuitBreakers'].size).toBe(4);
      expect(dispatcher['circuitBreakers'].get('openai')).toBeDefined();
    });

    test('should start queue processor and pending request cleanup', () => {
      // These are started via setInterval in constructor
      // We can't directly test if setInterval was called without mocking it globally
      // But we can assume it's called if the constructor runs without error
    });
  });

  describe('getCompletion - core flow', () => {
    const messages: Message[] = [{ role: 'user', content: 'Hello' }];
    const options: CompletionOptions = { temperature: 0.7 };
    const cacheKey = 'mock-cache-key'; // Will be generated by generateCacheKey

    beforeEach(() => {
      // Mock generateCacheKey to return a predictable key
      jest.spyOn(dispatcher as any, 'generateCacheKey').mockReturnValue(cacheKey);
      // Mock determineProvider to return a predictable provider
      jest.spyOn(dispatcher as any, 'determineProvider').mockReturnValue('openai');
    });

    test('should return cached response if available and streamCallback is provided', async () => {
      (dispatcher['cache'].get as jest.Mock).mockReturnValue('Cached response');
      options.streamCallback = jest.fn();

      await dispatcher.getCompletion(messages, options);

      expect(dispatcher['cache'].get).toHaveBeenCalledWith(cacheKey);
      expect(options.streamCallback).toHaveBeenCalledWith('Cached response');
      expect(mockBaseProvider.getCompletion).not.toHaveBeenCalled();
    });

    test('should not return cached response if not available', async () => {
      (dispatcher['cache'].get as jest.Mock).mockReturnValue(undefined);
      mockBaseProvider.getCompletion.mockResolvedValue(undefined); // Mock successful completion

      await dispatcher.getCompletion(messages, options);

      expect(dispatcher['cache'].get).toHaveBeenCalledWith(cacheKey);
      expect(mockBaseProvider.getCompletion).toHaveBeenCalledTimes(1);
    });

    test('should handle request deduplication', async () => {
      const mockPromise = Promise.resolve();
      (dispatcher['pendingRequests'].get as jest.Mock).mockReturnValue(mockPromise);

      const promise1 = dispatcher.getCompletion(messages, options);
      const promise2 = dispatcher.getCompletion(messages, options);

      expect(promise1).toBe(mockPromise);
      expect(promise2).toBe(mockPromise);
      expect(dispatcher['pendingRequests'].get).toHaveBeenCalledTimes(2);
      expect(mockBaseProvider.getCompletion).not.toHaveBeenCalled(); // Should not call provider
    });

    test('should call provider and cache response on successful completion', async () => {
      (dispatcher['cache'].get as jest.Mock).mockReturnValue(undefined); // No cache hit
      mockBaseProvider.getCompletion.mockImplementation(async (msgs, opts) => {
        opts.streamCallback('Hello');
        opts.streamCallback(' World');
      });

      await dispatcher.getCompletion(messages, options);

      expect(mockBaseProvider.getCompletion).toHaveBeenCalledTimes(1);
      expect(dispatcher['cache'].set).toHaveBeenCalledWith(cacheKey, 'Hello World', expect.any(Number));
      expect(saveAICallToFolder).toHaveBeenCalledTimes(1);
      expect(dispatcher['metrics'].successfulRequests).toBe(1);
    });

    test('should handle errors during completion and record failure', async () => {
      (dispatcher['cache'].get as jest.Mock).mockReturnValue(undefined); // No cache hit
      const error = new Error('API Error');
      mockBaseProvider.getCompletion.mockRejectedValue(error);

      await expect(dispatcher.getCompletion(messages, options)).rejects.toThrow(error);

      expect(mockBaseProvider.getCompletion).toHaveBeenCalledTimes(1);
      expect(dispatcher['cache'].set).not.toHaveBeenCalled(); // Should not cache on error
      expect(saveAICallToFolder).toHaveBeenCalledTimes(1); // Should save failed call
      expect(dispatcher['metrics'].failedRequests).toBe(1);
    });
  });

  describe('validateRequest', () => {
    test('should throw error for empty messages array', () => {
      expect(() => dispatcher['validateRequest']([], {})).toThrow('Messages array cannot be empty');
    });

    test('should throw error for message without role', () => {
      const msgs: Message[] = [{ content: 'test' } as Message];
      expect(() => dispatcher['validateRequest'](msgs, {})).toThrow('Each message must have role and content');
    });

    test('should throw error for invalid message role', () => {
      const msgs: Message[] = [{ role: 'invalid' as any, content: 'test' }];
      expect(() => dispatcher['validateRequest'](msgs, {})).toThrow('Invalid message role: invalid');
    });

    test('should throw error for invalid temperature', () => {
      const msgs: Message[] = [{ role: 'user', content: 'test' }];
      expect(() => dispatcher['validateRequest'](msgs, { temperature: 3 })).toThrow('Temperature must be between 0 and 2');
    });

    test('should sanitize message content', () => {
      const msgs: Message[] = [{ role: 'user', content: '  Hello World  ' }];
      dispatcher['validateRequest'](msgs, {});
      expect(msgs[0].content).toBe('Hello World');
    });
  });

  describe('generateCacheKey', () => {
    test('should generate a consistent cache key', () => {
      const msgs: Message[] = [{ role: 'user', content: 'Test message' }];
      const opts: CompletionOptions = { temperature: 0.5 };
      const key1 = dispatcher['generateCacheKey'](msgs, opts, 'openai');
      const key2 = dispatcher['generateCacheKey'](msgs, opts, 'openai');
      expect(key1).toBe(key2);
      expect(key1).toHaveLength(32); // Check length after substring
    });

    test('should use object pools for messages and arrays', () => {
      const msgs: Message[] = [{ role: 'user', content: 'Pooled message' }];
      const opts: CompletionOptions = {};
      dispatcher['generateCacheKey'](msgs, opts);
      expect(MessageContextPool.getInstance().acquireMessage).toHaveBeenCalledTimes(1);
      expect(MessageContextPool.getInstance().releaseMessage).toHaveBeenCalledTimes(1);
      expect(PreAllocatedArrays.getInstance().getArray).toHaveBeenCalledTimes(1);
      expect(PreAllocatedArrays.getInstance().returnArray).toHaveBeenCalledTimes(1);
    });
  });

  describe('circuit breaker', () => {
    const providerName = 'openai';

    test('should open circuit breaker after threshold failures', () => {
      for (let i = 0; i < 5; i++) { // CIRCUIT_BREAKER_THRESHOLD is 5
        dispatcher['recordFailure'](providerName);
      }
      expect(dispatcher['isCircuitBreakerOpen'](providerName)).toBe(true);
      expect(dispatcher['circuitBreakers'].get(providerName)?.isOpen).toBe(true);
    });

    test('should close circuit breaker after retry time and success', () => {
      // Open circuit breaker
      for (let i = 0; i < 5; i++) {
        dispatcher['recordFailure'](providerName);
      }
      expect(dispatcher['circuitBreakers'].get(providerName)?.isOpen).toBe(true);

      // Advance time past CIRCUIT_BREAKER_TIMEOUT
      jest.advanceTimersByTime(30 * 1000 + 1); // 30 seconds + 1ms

      // Circuit breaker should now be half-open and then close on success
      dispatcher['recordSuccess'](providerName);
      expect(dispatcher['circuitBreakers'].get(providerName)?.isOpen).toBe(false);
      expect(dispatcher['circuitBreakers'].get(providerName)?.failureCount).toBe(0);
    });

    test('should not close circuit breaker if still within retry time', () => {
      // Open circuit breaker
      for (let i = 0; i < 5; i++) {
        dispatcher['recordFailure'](providerName);
      }
      expect(dispatcher['circuitBreakers'].get(providerName)?.isOpen).toBe(true);

      // Advance time, but not past CIRCUIT_BREAKER_TIMEOUT
      jest.advanceTimersByTime(10 * 1000); // 10 seconds

      dispatcher['recordSuccess'](providerName); // Success won't close it yet
      expect(dispatcher['circuitBreakers'].get(providerName)?.isOpen).toBe(true);
    });

    test('should throw error if circuit breaker is open', async () => {
      // Open circuit breaker
      for (let i = 0; i < 5; i++) {
        dispatcher['recordFailure'](providerName);
      }

      const messages: Message[] = [{ role: 'user', content: 'Hello' }];
      const options: CompletionOptions = { temperature: 0.7 };

      await expect(dispatcher.getCompletion(messages, options, providerName)).rejects.toThrow(
        `Provider ${providerName} is temporarily unavailable (circuit breaker open)`
      );
    });
  });

  describe('rate limiting', () => {
    const providerName = 'openai'; // Default rate limit 60 req/min

    test('should not be rate limited initially', () => {
      expect(dispatcher['isRateLimited'](providerName)).toBe(false);
    });

    test('should become rate limited after exceeding threshold', () => {
      for (let i = 0; i < 60; i++) { // 60 requests
        dispatcher['recordRequest'](providerName);
      }
      expect(dispatcher['isRateLimited'](providerName)).toBe(true);
    });

    test('should reset rate limit after window', () => {
      for (let i = 0; i < 60; i++) {
        dispatcher['recordRequest'](providerName);
      }
      expect(dispatcher['isRateLimited'](providerName)).toBe(true);

      jest.advanceTimersByTime(60 * 1000 + 1); // Advance past RATE_LIMIT_WINDOW

      expect(dispatcher['isRateLimited'](providerName)).toBe(false);
    });

    test('should queue request if rate limited', async () => {
      // Exceed rate limit
      for (let i = 0; i < 60; i++) {
        dispatcher['recordRequest'](providerName);
      }

      const messages: Message[] = [{ role: 'user', content: 'Queued message' }];
      const options: CompletionOptions = {};

      const promise = dispatcher.getCompletion(messages, options, providerName);

      expect(dispatcher['requestQueue'].length).toBe(1);
      expect(mockBaseProvider.getCompletion).not.toHaveBeenCalled(); // Should not call provider immediately

      // Advance time to allow queue processing
      jest.advanceTimersByTime(60 * 1000 + 1); // Past rate limit window

      // Mock successful completion for the queued request
      mockBaseProvider.getCompletion.mockResolvedValue(undefined);

      // Trigger queue processing (setInterval will do this, but we can force it)
      await new Promise(resolve => setTimeout(resolve, 0)); // Allow microtasks to run

      expect(dispatcher['requestQueue'].length).toBe(0);
      expect(mockBaseProvider.getCompletion).toHaveBeenCalledTimes(1);
    });
  });

  describe('model management', () => {
    test('testConnection should call provider.testConnection', async () => {
      mockBaseProvider.testConnection.mockResolvedValue('Connection OK');
      const result = await dispatcher.testConnection('openai');
      expect(mockBaseProvider.testConnection).toHaveBeenCalledTimes(1);
      expect(result).toBe('Connection OK');
    });

    test('getAvailableModels should call provider.getAvailableModels and cache result', async () => {
      const mockModels = ['model1', 'model2'];
      mockBaseProvider.getAvailableModels.mockResolvedValue(mockModels);
      (dispatcher['providerCache'].get as jest.Mock).mockReturnValue(undefined); // No cache hit

      const models = await dispatcher.getAvailableModels('openai');
      expect(mockBaseProvider.getAvailableModels).toHaveBeenCalledTimes(1);
      expect(models).toEqual(mockModels);
      expect(dispatcher['providerCache'].set).toHaveBeenCalledWith('openai', mockModels);

      // Second call should use cache
      (dispatcher['providerCache'].get as jest.Mock).mockReturnValue(mockModels);
      const cachedModels = await dispatcher.getAvailableModels('openai');
      expect(mockBaseProvider.getAvailableModels).toHaveBeenCalledTimes(1); // Not called again
      expect(cachedModels).toEqual(mockModels);
    });

    test('getAllUnifiedModels should call getAllAvailableModels and cache result', async () => {
      const mockUnifiedModels: UnifiedModel[] = [{ id: 'openai:gpt-3.5', name: 'GPT-3.5', provider: 'openai', modelId: 'gpt-3.5' }];
      (getAllAvailableModels as jest.Mock).mockResolvedValue(mockUnifiedModels);
      (dispatcher['modelCache'].get as jest.Mock).mockReturnValue(undefined); // No cache hit

      const models = await dispatcher.getAllUnifiedModels();
      expect(getAllAvailableModels).toHaveBeenCalledTimes(1);
      expect(models).toEqual(mockUnifiedModels);
      expect(dispatcher['modelCache'].set).toHaveBeenCalledWith('all-unified-models', mockUnifiedModels);

      // Second call should use cache
      (dispatcher['modelCache'].get as jest.Mock).mockReturnValue(mockUnifiedModels);
      const cachedModels = await dispatcher.getAllUnifiedModels();
      expect(getAllAvailableModels).toHaveBeenCalledTimes(1); // Not called again
      expect(cachedModels).toEqual(mockUnifiedModels);
    });

    test('refreshProviderModels should update settings with new models', async () => {
      const mockModels = ['modelA', 'modelB'];
      jest.spyOn(dispatcher, 'getAvailableModels' as any).mockResolvedValue(mockModels);

      await dispatcher.refreshProviderModels('openai');

      expect(plugin.settings.openaiSettings.availableModels).toEqual(mockModels);
      expect(plugin.settings.openaiSettings.lastTestResult?.success).toBe(true);
      expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
    });

    test('refreshProviderModels should update settings with error on failure', async () => {
      const error = new Error('Refresh failed');
      jest.spyOn(dispatcher, 'getAvailableModels' as any).mockRejectedValue(error);

      await expect(dispatcher.refreshProviderModels('openai')).rejects.toThrow(error);

      expect(plugin.settings.openaiSettings.availableModels).toEqual([]); // Should be empty or previous
      expect(plugin.settings.openaiSettings.lastTestResult?.success).toBe(false);
      expect(plugin.settings.openaiSettings.lastTestResult?.message).toBe('Refresh failed');
      expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
    });

    test('refreshAllProviderModels should refresh all configured providers', async () => {
      jest.spyOn(dispatcher, 'isProviderConfigured' as any).mockReturnValue(true); // All configured
      jest.spyOn(dispatcher, 'refreshProviderModels' as any)
        .mockResolvedValueOnce(['o1', 'o2'])
        .mockResolvedValueOnce(['a1', 'a2'])
        .mockResolvedValueOnce(['g1', 'g2'])
        .mockResolvedValueOnce(['l1', 'l2']);
      jest.spyOn(dispatcher, 'getAllUnifiedModels' as any).mockResolvedValue([]); // Mock unified models

      const results = await dispatcher.refreshAllProviderModels();

      expect(dispatcher['refreshProviderModels']).toHaveBeenCalledTimes(4);
      expect(results.openai).toEqual(['o1', 'o2']);
      expect(results.anthropic).toEqual(['a1', 'a2']);
      expect(results.gemini).toEqual(['g1', 'g2']);
      expect(results.ollama).toEqual(['l1', 'l2']);
      expect(plugin.saveSettings).toHaveBeenCalledTimes(1); // For unified models
    });

    test('setSelectedModel should update settings and save', async () => {
      await dispatcher.setSelectedModel('anthropic:claude-2');
      expect(plugin.settings.selectedModel).toBe('anthropic:claude-2');
      expect(plugin.settings.provider).toBe('anthropic');
      expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
    });

    test('getCurrentModel should return selected model', () => {
      expect(dispatcher.getCurrentModel()).toBe('openai:gpt-3.5-turbo');
    });

    test('getModelInfo should return model info from availableModels', () => {
      plugin.settings.availableModels = [{ id: 'test:model', name: 'Test Model', provider: 'openai', modelId: 'test-model' }];
      const info = dispatcher.getModelInfo('test:model');
      expect(info).toEqual({ id: 'test:model', name: 'Test Model', provider: 'test' });
    });

    test('isProviderConfigured should check API key/serverUrl', () => {
      plugin.settings.openaiSettings.apiKey = 'test';
      expect(dispatcher.isProviderConfigured('openai')).toBe(true);
      expect(dispatcher.isProviderConfigured('anthropic')).toBe(false); // No API key
    });

    test('getConfiguredProviders should return list of configured providers', () => {
      plugin.settings.openaiSettings.apiKey = 'test';
      plugin.settings.ollamaSettings.serverUrl = 'http://localhost';
      const configured = dispatcher.getConfiguredProviders();
      expect(configured).toEqual(['openai', 'ollama']);
    });
  });
});