/**
 * @file transitionStateIntegration.test.ts
 * @description Integration tests for system transition states and performance scenarios
 * 
 * This test suite focuses on:
 * - Gradual migration scenarios between old and new systems
 * - Fallback mechanisms when new services fail
 * - Mixed usage patterns during transition
 * - Performance impact of running both systems
 * - System stability during architectural evolution
 */

import { AIDispatcher } from '../src/utils/aiDispatcher';
import { AIService } from '../src/services/core/AIService';
import { RequestManager } from '../src/services/core/RequestManager';
import { CacheManager } from '../src/services/core/CacheManager';
import { RateLimiter } from '../src/services/core/RateLimiter';
import { CircuitBreaker } from '../src/services/core/CircuitBreaker';
import { MetricsCollector } from '../src/services/core/MetricsCollector';
import { Priority3IntegrationManager } from '../src/integration/priority3Integration';
import { EventBus, globalEventBus } from '../src/utils/eventBus';
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
  Plugin: jest.fn(),
}));

describe('Transition State Integration Tests', () => {
  let oldAIDispatcher: AIDispatcher;
  let newAIService: AIService;
  let priority3Manager: Priority3IntegrationManager;
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
      manifest: {
        id: 'ai-assistant',
        name: 'AI Assistant',
        version: '1.0.0'
      },
      app: {
        vault: mockVault,
        workspace: {},
      },
      register: jest.fn(),
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

    priority3Manager = new Priority3IntegrationManager(mockPlugin);
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    eventBus.clear();
    globalEventBus.clear();
    if (priority3Manager) {
      priority3Manager.dispose();
    }
  });

  describe('Gradual Migration Scenarios', () => {
    test('should handle progressive feature migration', async () => {
      // Initialize Priority 3 Integration Manager
      await priority3Manager.initialize();
      
      const messages: Message[] = [{ role: 'user', content: 'Migration test' }];
      const options: CompletionOptions = { temperature: 0.7 };

      mockProvider.getCompletion.mockImplementation(async (msgs, opts) => {
        if (opts.streamCallback) {
          opts.streamCallback('Migration response');
        }
      });

      // Phase 1: Old system only
      await oldAIDispatcher.getCompletion(messages, options);

      // Phase 2: Both systems active
      const request: CompletionRequest = {
        messages,
        options,
        provider: 'openai',
      };

      await newAIService.getCompletion(request);

      // Phase 3: Verify integration manager status
      const status = priority3Manager.getStatus();
      expect(status.initialized).toBe(true);
      expect(status.services.length).toBeGreaterThan(0);

      // Both systems should work independently
      expect(mockProvider.getCompletion).toHaveBeenCalledTimes(2);
    });

    test('should handle feature flag-based migration', async () => {
      const messages: Message[] = [{ role: 'user', content: 'Feature flag test' }];
      const options: CompletionOptions = { temperature: 0.7 };

      // Simulate feature flags
      const useNewSystem = Math.random() > 0.5;

      mockProvider.getCompletion.mockImplementation(async (msgs, opts) => {
        if (opts.streamCallback) {
          opts.streamCallback(`${useNewSystem ? 'New' : 'Old'} system response`);
        }
      });

      if (useNewSystem) {
        const request: CompletionRequest = {
          messages,
          options,
          provider: 'openai',
        };
        const response = await newAIService.getCompletion(request);
        expect(response.content).toContain('New system');
      } else {
        await oldAIDispatcher.getCompletion(messages, options);
      }

      expect(mockProvider.getCompletion).toHaveBeenCalledTimes(1);
    });

    test('should handle user-based rollout', async () => {
      const messages: Message[] = [{ role: 'user', content: 'User rollout test' }];
      const options: CompletionOptions = { temperature: 0.7 };

      // Simulate user-based rollout (e.g., based on user ID hash)
      const userId = 'test-user-123';
      const userHash = userId.split('').reduce((a, b) => a + b.charCodeAt(0), 0);
      const useNewSystem = userHash % 100 < 50; // 50% rollout

      mockProvider.getCompletion.mockImplementation(async (msgs, opts) => {
        if (opts.streamCallback) {
          opts.streamCallback(`User ${userId} on ${useNewSystem ? 'new' : 'old'} system`);
        }
      });

      if (useNewSystem) {
        const request: CompletionRequest = {
          messages,
          options,
          provider: 'openai',
        };
        await newAIService.getCompletion(request);
      } else {
        await oldAIDispatcher.getCompletion(messages, options);
      }

      expect(mockProvider.getCompletion).toHaveBeenCalledTimes(1);
    });
  });

  describe('Fallback Mechanisms', () => {
    test('should fallback to old system when new system fails', async () => {
      const messages: Message[] = [{ role: 'user', content: 'Fallback test' }];
      const options: CompletionOptions = { temperature: 0.7 };

      // Mock new system failure
      const newSystemError = new Error('New system unavailable');
      
      let callCount = 0;
      mockProvider.getCompletion.mockImplementation(async (msgs, opts) => {
        callCount++;
        if (callCount === 1) {
          // First call (new system) fails
          throw newSystemError;
        } else {
          // Second call (fallback to old system) succeeds
          if (opts.streamCallback) {
            opts.streamCallback('Fallback response from old system');
          }
        }
      });

      // Try new system first
      const request: CompletionRequest = {
        messages,
        options,
        provider: 'openai',
      };

      try {
        await newAIService.getCompletion(request);
      } catch (error) {
        // Expected failure, now fallback to old system
        expect(error).toBe(newSystemError);
        
        // Fallback to old system
        await oldAIDispatcher.getCompletion(messages, options);
      }

      expect(mockProvider.getCompletion).toHaveBeenCalledTimes(2);
    });

    test('should handle partial service failures gracefully', async () => {
      const messages: Message[] = [{ role: 'user', content: 'Partial failure test' }];
      const options: CompletionOptions = { temperature: 0.7 };

      // Mock cache failure but other services work
      jest.spyOn(cacheManager, 'get').mockRejectedValue(new Error('Cache service down'));
      jest.spyOn(cacheManager, 'set').mockRejectedValue(new Error('Cache service down'));

      mockProvider.getCompletion.mockImplementation(async (msgs, opts) => {
        if (opts.streamCallback) {
          opts.streamCallback('Response despite cache failure');
        }
      });

      const request: CompletionRequest = {
        messages,
        options,
        provider: 'openai',
      };

      // Should still work despite cache failure
      const response = await newAIService.getCompletion(request);
      expect(response.content).toBe('Response despite cache failure');
    });

    test('should handle circuit breaker fallback', async () => {
      const messages: Message[] = [{ role: 'user', content: 'Circuit breaker test' }];
      const options: CompletionOptions = { temperature: 0.7 };

      // Mock circuit breaker open state
      jest.spyOn(circuitBreaker, 'isOpen').mockReturnValue(true);

      const request: CompletionRequest = {
        messages,
        options,
        provider: 'openai',
      };

      // Should throw circuit breaker error
      await expect(newAIService.getCompletion(request)).rejects.toThrow(
        'Provider openai is temporarily unavailable (circuit breaker open)'
      );

      // Fallback to old system should work
      mockProvider.getCompletion.mockImplementation(async (msgs, opts) => {
        if (opts.streamCallback) {
          opts.streamCallback('Old system fallback');
        }
      });

      await oldAIDispatcher.getCompletion(messages, options);
      expect(mockProvider.getCompletion).toHaveBeenCalledTimes(1);
    });
  });

  describe('Mixed Usage Patterns', () => {
    test('should handle alternating system usage', async () => {
      const messages: Message[] = [{ role: 'user', content: 'Alternating test' }];
      const options: CompletionOptions = { temperature: 0.7 };

      mockProvider.getCompletion.mockImplementation(async (msgs, opts) => {
        if (opts.streamCallback) {
          opts.streamCallback('Alternating response');
        }
      });

      // Alternate between systems
      for (let i = 0; i < 10; i++) {
        if (i % 2 === 0) {
          // Use old system
          await oldAIDispatcher.getCompletion(messages, options);
        } else {
          // Use new system
          const request: CompletionRequest = {
            messages,
            options,
            provider: 'openai',
          };
          await newAIService.getCompletion(request);
        }
      }

      expect(mockProvider.getCompletion).toHaveBeenCalledTimes(10);
    });

    test('should handle concurrent mixed usage', async () => {
      const baseMessage = 'Concurrent mixed test';
      const options: CompletionOptions = { temperature: 0.7 };

      mockProvider.getCompletion.mockImplementation(async (msgs, opts) => {
        // Simulate variable processing time
        const delay = Math.random() * 50;
        await new Promise(resolve => setTimeout(resolve, delay));
        
        if (opts.streamCallback) {
          opts.streamCallback(`Response: ${msgs[0].content}`);
        }
      });

      // Create mixed concurrent requests
      const promises = [];
      
      for (let i = 0; i < 20; i++) {
        const messages: Message[] = [{ role: 'user', content: `${baseMessage} ${i}` }];
        
        if (i % 3 === 0) {
          // Old system
          promises.push(oldAIDispatcher.getCompletion(messages, options));
        } else {
          // New system
          const request: CompletionRequest = {
            messages,
            options,
            provider: 'openai',
          };
          promises.push(newAIService.getCompletion(request));
        }
      }

      const results = await Promise.all(promises);
      expect(results).toHaveLength(20);
    });

    test('should handle load balancing between systems', async () => {
      const messages: Message[] = [{ role: 'user', content: 'Load balancing test' }];
      const options: CompletionOptions = { temperature: 0.7 };

      let oldSystemCalls = 0;
      let newSystemCalls = 0;

      mockProvider.getCompletion.mockImplementation(async (msgs, opts) => {
        if (opts.streamCallback) {
          opts.streamCallback('Load balanced response');
        }
      });

      // Simulate load balancing logic
      for (let i = 0; i < 100; i++) {
        const useNewSystem = Math.random() > 0.3; // 70% new system, 30% old system
        
        if (useNewSystem) {
          newSystemCalls++;
          const request: CompletionRequest = {
            messages,
            options,
            provider: 'openai',
          };
          await newAIService.getCompletion(request);
        } else {
          oldSystemCalls++;
          await oldAIDispatcher.getCompletion(messages, options);
        }
      }

      // Verify load distribution
      expect(oldSystemCalls + newSystemCalls).toBe(100);
      expect(newSystemCalls).toBeGreaterThan(oldSystemCalls); // Should favor new system
      expect(mockProvider.getCompletion).toHaveBeenCalledTimes(100);
    });
  });

  describe('Performance Impact Analysis', () => {
    test('should measure performance impact of running both systems', async () => {
      const messages: Message[] = [{ role: 'user', content: 'Performance impact test' }];
      const options: CompletionOptions = { temperature: 0.7 };

      mockProvider.getCompletion.mockImplementation(async (msgs, opts) => {
        // Simulate processing time
        await new Promise(resolve => setTimeout(resolve, 10));
        if (opts.streamCallback) {
          opts.streamCallback('Performance test response');
        }
      });

      // Measure old system performance
      const oldSystemStart = Date.now();
      for (let i = 0; i < 10; i++) {
        await oldAIDispatcher.getCompletion(messages, options);
      }
      const oldSystemTime = Date.now() - oldSystemStart;

      // Measure new system performance
      const newSystemStart = Date.now();
      for (let i = 0; i < 10; i++) {
        const request: CompletionRequest = {
          messages,
          options,
          provider: 'openai',
        };
        await newAIService.getCompletion(request);
      }
      const newSystemTime = Date.now() - newSystemStart;

      // Both systems should complete within reasonable time
      expect(oldSystemTime).toBeLessThan(5000); // 5 seconds
      expect(newSystemTime).toBeLessThan(5000); // 5 seconds
      
      // Log performance comparison
      console.log(`Old system: ${oldSystemTime}ms, New system: ${newSystemTime}ms`);
    });

    test('should handle memory pressure during transition', async () => {
      const largeContent = 'A'.repeat(10000); // Large content
      const messages: Message[] = [{ role: 'user', content: largeContent }];
      const options: CompletionOptions = { temperature: 0.7 };

      mockProvider.getCompletion.mockImplementation(async (msgs, opts) => {
        if (opts.streamCallback) {
          opts.streamCallback('B'.repeat(10000)); // Large response
        }
      });

      // Process large requests in both systems
      const promises = [];
      
      for (let i = 0; i < 20; i++) {
        if (i % 2 === 0) {
          promises.push(oldAIDispatcher.getCompletion(messages, options));
        } else {
          const request: CompletionRequest = {
            messages,
            options,
            provider: 'openai',
          };
          promises.push(newAIService.getCompletion(request));
        }
      }

      // Should handle memory pressure gracefully
      await expect(Promise.all(promises)).resolves.not.toThrow();
    });

    test('should monitor resource usage during transition', async () => {
      const messages: Message[] = [{ role: 'user', content: 'Resource monitoring test' }];
      const options: CompletionOptions = { temperature: 0.7 };

      mockProvider.getCompletion.mockImplementation(async (msgs, opts) => {
        if (opts.streamCallback) {
          opts.streamCallback('Resource test response');
        }
      });

      // Execute requests and monitor resources
      const initialMemory = process.memoryUsage();
      
      for (let i = 0; i < 50; i++) {
        if (i % 2 === 0) {
          await oldAIDispatcher.getCompletion(messages, options);
        } else {
          const request: CompletionRequest = {
            messages,
            options,
            provider: 'openai',
          };
          await newAIService.getCompletion(request);
        }
      }

      const finalMemory = process.memoryUsage();
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;
      
      // Memory increase should be reasonable
      expect(memoryIncrease).toBeLessThan(100 * 1024 * 1024); // Less than 100MB
    });
  });

  describe('System Stability During Evolution', () => {
    test('should maintain stability during service updates', async () => {
      const messages: Message[] = [{ role: 'user', content: 'Stability test' }];
      const options: CompletionOptions = { temperature: 0.7 };

      mockProvider.getCompletion.mockImplementation(async (msgs, opts) => {
        if (opts.streamCallback) {
          opts.streamCallback('Stable response');
        }
      });

      // Simulate service updates during operation
      const promises = [];
      
      for (let i = 0; i < 30; i++) {
        const request: CompletionRequest = {
          messages,
          options,
          provider: 'openai',
        };
        
        promises.push(newAIService.getCompletion(request));
        
        // Simulate service restart/update every 10 requests
        if (i % 10 === 9) {
          // Simulate brief service interruption
          await new Promise(resolve => setTimeout(resolve, 10));
        }
      }

      // All requests should complete successfully
      const results = await Promise.all(promises);
      expect(results).toHaveLength(30);
      results.forEach(result => {
        expect(result.content).toBe('Stable response');
      });
    });

    test('should handle configuration changes during transition', async () => {
      const messages: Message[] = [{ role: 'user', content: 'Config change test' }];
      const options: CompletionOptions = { temperature: 0.7 };

      mockProvider.getCompletion.mockImplementation(async (msgs, opts) => {
        if (opts.streamCallback) {
          opts.streamCallback(`Response with temp ${opts.temperature}`);
        }
      });

      // Change configuration during operation
      for (let i = 0; i < 10; i++) {
        const currentTemp = 0.5 + (i * 0.1); // Gradually increase temperature
        const currentOptions = { ...options, temperature: currentTemp };
        
        const request: CompletionRequest = {
          messages,
          options: currentOptions,
          provider: 'openai',
        };

        const response = await newAIService.getCompletion(request);
        expect(response.content).toContain(currentTemp.toString());
      }
    });

    test('should maintain data consistency during system evolution', async () => {
      const messages: Message[] = [{ role: 'user', content: 'Consistency test' }];
      const options: CompletionOptions = { temperature: 0.7 };

      const responses: string[] = [];
      
      mockProvider.getCompletion.mockImplementation(async (msgs, opts) => {
        const response = `Consistent response ${responses.length + 1}`;
        responses.push(response);
        
        if (opts.streamCallback) {
          opts.streamCallback(response);
        }
      });

      // Mix of old and new system calls
      const promises = [];
      
      for (let i = 0; i < 20; i++) {
        if (i % 3 === 0) {
          promises.push(oldAIDispatcher.getCompletion(messages, options));
        } else {
          const request: CompletionRequest = {
            messages,
            options,
            provider: 'openai',
          };
          promises.push(newAIService.getCompletion(request));
        }
      }

      await Promise.all(promises);

      // Verify all responses are unique and consistent
      expect(responses).toHaveLength(20);
      expect(new Set(responses).size).toBe(20); // All unique
    });
  });
});