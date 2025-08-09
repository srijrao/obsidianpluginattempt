/**
 * @file RequestManager.test.ts
 * @description Comprehensive test suite for RequestManager
 */

import { RequestManager, QueuedRequest } from '../src/services/core/RequestManager';
import { IEventBus, AIRequest, QueueStatus } from '../src/services/interfaces';
import { Message, CompletionOptions } from '../src/types';

describe('RequestManager', () => {
  let requestManager: RequestManager;
  let mockEventBus: jest.Mocked<IEventBus>;
  let originalSetInterval: typeof setInterval;
  let originalClearInterval: typeof clearInterval;
  let originalDateNow: typeof Date.now;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    // Store original functions
    originalSetInterval = global.setInterval;
    originalClearInterval = global.clearInterval;
    originalDateNow = Date.now;

    // Create mock event bus
    mockEventBus = {
      publish: jest.fn().mockResolvedValue(undefined),
      subscribe: jest.fn().mockReturnValue(() => {}),
      subscribeOnce: jest.fn().mockReturnValue(() => {}),
      unsubscribe: jest.fn(),
      clear: jest.fn(),
      getSubscriptionCount: jest.fn().mockReturnValue(0),
    };

    // Create RequestManager instance
    requestManager = new RequestManager(mockEventBus);
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    
    // Restore original functions
    global.setInterval = originalSetInterval;
    global.clearInterval = originalClearInterval;
    Date.now = originalDateNow;
  });

  describe('constructor and initialization', () => {
    test('should initialize with empty queue and default settings', () => {
      expect(requestManager).toBeInstanceOf(RequestManager);
      
      const status = requestManager.getQueueStatus();
      expect(status.queueLength).toBe(0);
      expect(status.processing).toBe(false);
      expect(status.averageWaitTime).toBe(0);
      expect(status.totalProcessed).toBe(0);
    });

    test('should start queue processor on initialization', () => {
      const setIntervalSpy = jest.spyOn(global, 'setInterval');
      new RequestManager(mockEventBus);
      expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 1000);
    });

    test('should initialize with correct queue statistics', () => {
      const stats = requestManager.getQueueStats();
      expect(stats).toEqual({
        currentSize: 0,
        maxSize: 100,
        totalProcessed: 0,
        averageProcessingTime: 0,
        isProcessing: false
      });
    });
  });

  describe('request queuing', () => {
    const createMockRequest = (id: string, priority: number = 0): AIRequest => ({
      id,
      messages: [{ role: 'user', content: 'Test message' }] as Message[],
      options: { temperature: 0.7 } as CompletionOptions,
      provider: 'openai',
      priority,
      timestamp: Date.now()
    });

    test('should queue request successfully', async () => {
      const mockNow = 1000000;
      Date.now = jest.fn().mockReturnValue(mockNow);

      const request = createMockRequest('req-1', 1);
      
      // Don't await the promise since it won't resolve until processing
      requestManager.queueRequest(request);

      expect(requestManager.getQueueStatus().queueLength).toBe(1);
      expect(mockEventBus.publish).toHaveBeenCalledWith('request.queued', {
        requestId: 'req-1',
        queueSize: 1,
        priority: 1,
        timestamp: mockNow
      });
    });

    test('should sort requests by priority (higher priority first)', async () => {
      const lowPriorityRequest = createMockRequest('low', 1);
      const highPriorityRequest = createMockRequest('high', 5);
      const mediumPriorityRequest = createMockRequest('medium', 3);

      requestManager.queueRequest(lowPriorityRequest);
      requestManager.queueRequest(highPriorityRequest);
      requestManager.queueRequest(mediumPriorityRequest);

      expect(requestManager.getQueueStatus().queueLength).toBe(3);

      // Verify queue is sorted by priority by checking event publications
      const queuedEvents = (mockEventBus.publish as jest.Mock).mock.calls
        .filter(call => call[0] === 'request.queued');
      
      expect(queuedEvents).toHaveLength(3);
      expect(queuedEvents[0][1].priority).toBe(1);
      expect(queuedEvents[1][1].priority).toBe(5);
      expect(queuedEvents[2][1].priority).toBe(3);
    });

    test('should reject requests when queue is full', async () => {
      const mockNow = 1000000;
      Date.now = jest.fn().mockReturnValue(mockNow);

      // Fill queue to capacity (100 requests)
      for (let i = 0; i < 100; i++) {
        requestManager.queueRequest(createMockRequest(`req-${i}`));
      }

      // 101st request should be rejected
      const overflowRequest = createMockRequest('overflow');
      await expect(requestManager.queueRequest(overflowRequest))
        .rejects.toThrow('Request queue is full. Please try again later.');

      expect(mockEventBus.publish).toHaveBeenCalledWith('request.queue.full', {
        queueSize: 100,
        maxSize: 100,
        timestamp: mockNow
      });
    });

    test('should handle requests with same priority', async () => {
      const request1 = createMockRequest('req-1', 2);
      const request2 = createMockRequest('req-2', 2);
      const request3 = createMockRequest('req-3', 2);

      requestManager.queueRequest(request1);
      requestManager.queueRequest(request2);
      requestManager.queueRequest(request3);

      expect(requestManager.getQueueStatus().queueLength).toBe(3);
    });

    test('should handle zero priority requests', async () => {
      const request = createMockRequest('zero-priority', 0);
      requestManager.queueRequest(request);

      expect(requestManager.getQueueStatus().queueLength).toBe(1);
      expect(mockEventBus.publish).toHaveBeenCalledWith('request.queued', 
        expect.objectContaining({ priority: 0 })
      );
    });

    test('should handle negative priority requests', async () => {
      const request = createMockRequest('negative-priority', -1);
      requestManager.queueRequest(request);

      expect(requestManager.getQueueStatus().queueLength).toBe(1);
      expect(mockEventBus.publish).toHaveBeenCalledWith('request.queued', 
        expect.objectContaining({ priority: -1 })
      );
    });
  });

  describe('queue processing', () => {
    const createMockRequest = (id: string, priority: number = 0): AIRequest => ({
      id,
      messages: [{ role: 'user', content: 'Test message' }] as Message[],
      options: { temperature: 0.7 } as CompletionOptions,
      provider: 'openai',
      priority,
      timestamp: Date.now()
    });

    test('should process queue when not already processing', async () => {
      const mockNow = 1000000;
      Date.now = jest.fn().mockReturnValue(mockNow);

      const request = createMockRequest('req-1');
      requestManager.queueRequest(request);

      // Clear previous event calls
      mockEventBus.publish.mockClear();

      // Process the queue
      await requestManager.processQueue();

      expect(mockEventBus.publish).toHaveBeenCalledWith('request.processing', {
        requestId: 'req-1',
        messages: request.messages,
        options: request.options,
        provider: 'openai',
        timestamp: expect.any(Number)
      });

      expect(mockEventBus.publish).toHaveBeenCalledWith('request.processed', {
        requestId: 'req-1',
        processingTime: expect.any(Number),
        queueSize: 0,
        timestamp: expect.any(Number)
      });

      expect(requestManager.getQueueStatus().queueLength).toBe(0);
      expect(requestManager.getQueueStatus().totalProcessed).toBe(1);
    });

    test('should not process when queue is empty', async () => {
      await requestManager.processQueue();

      const processingEvents = (mockEventBus.publish as jest.Mock).mock.calls
        .filter(call => call[0] === 'request.processing');
      expect(processingEvents).toHaveLength(0);
    });

    test('should process requests in priority order', async () => {
      const lowPriorityRequest = createMockRequest('low', 1);
      const highPriorityRequest = createMockRequest('high', 5);
      const mediumPriorityRequest = createMockRequest('medium', 3);

      requestManager.queueRequest(lowPriorityRequest);
      requestManager.queueRequest(highPriorityRequest);
      requestManager.queueRequest(mediumPriorityRequest);

      // Clear previous event calls
      mockEventBus.publish.mockClear();

      await requestManager.processQueue();

      const processingEvents = (mockEventBus.publish as jest.Mock).mock.calls
        .filter(call => call[0] === 'request.processing');

      expect(processingEvents).toHaveLength(3);
      expect(processingEvents[0][1].requestId).toBe('high');
      expect(processingEvents[1][1].requestId).toBe('medium');
      expect(processingEvents[2][1].requestId).toBe('low');
    });

    test('should handle processing errors gracefully', async () => {
      const mockNow = 1000000;
      Date.now = jest.fn().mockReturnValue(mockNow);

      const request = createMockRequest('error-req');
      requestManager.queueRequest(request);

      // Mock processRequest to throw an error
      const originalProcessRequest = (requestManager as any).processRequest;
      (requestManager as any).processRequest = jest.fn().mockRejectedValue(new Error('Processing failed'));

      await requestManager.processQueue();

      expect(mockEventBus.publish).toHaveBeenCalledWith('request.failed', {
        requestId: 'error-req',
        error: 'Processing failed',
        queueSize: 0,
        timestamp: expect.any(Number)
      });

      // Restore original method
      (requestManager as any).processRequest = originalProcessRequest;
    });

    test('should track processing times correctly', async () => {
      const mockNow = 1000000;
      Date.now = jest.fn()
        .mockReturnValueOnce(mockNow) // Initial timestamp
        .mockReturnValueOnce(mockNow) // Queue timestamp
        .mockReturnValueOnce(mockNow) // Process start
        .mockReturnValueOnce(mockNow + 150); // Process end

      const request = createMockRequest('timed-req');
      requestManager.queueRequest(request);
      await requestManager.processQueue();

      expect(mockEventBus.publish).toHaveBeenCalledWith('request.processed', 
        expect.objectContaining({
          processingTime: 150
        })
      );

      const stats = requestManager.getQueueStats();
      expect(stats.averageProcessingTime).toBe(150);
    });

    test('should update queue statistics after processing', async () => {
      const request1 = createMockRequest('req-1');
      const request2 = createMockRequest('req-2');

      requestManager.queueRequest(request1);
      requestManager.queueRequest(request2);

      let stats = requestManager.getQueueStats();
      expect(stats.currentSize).toBe(2);
      expect(stats.totalProcessed).toBe(0);

      await requestManager.processQueue();

      stats = requestManager.getQueueStats();
      expect(stats.currentSize).toBe(0);
      expect(stats.totalProcessed).toBe(2);
    });
  });

  describe('request abortion', () => {
    const createMockRequest = (id: string): AIRequest => ({
      id,
      messages: [{ role: 'user', content: 'Test message' }] as Message[],
      options: { temperature: 0.7 } as CompletionOptions,
      provider: 'openai',
      priority: 0,
      timestamp: Date.now()
    });

    test('should abort specific request by ID', async () => {
      const mockNow = 1000000;
      Date.now = jest.fn().mockReturnValue(mockNow);

      const request1 = createMockRequest('req-1');
      const request2 = createMockRequest('req-2');
      const request3 = createMockRequest('req-3');

      const promise1 = requestManager.queueRequest(request1);
      const promise2 = requestManager.queueRequest(request2);
      const promise3 = requestManager.queueRequest(request3);

      expect(requestManager.getQueueStatus().queueLength).toBe(3);

      requestManager.abortRequest('req-2');

      expect(requestManager.getQueueStatus().queueLength).toBe(2);
      expect(mockEventBus.publish).toHaveBeenCalledWith('request.aborted', {
        requestId: 'req-2',
        queueSize: 2,
        timestamp: mockNow
      });

      // The aborted request promise should be rejected
      await expect(promise2).rejects.toThrow('Request aborted');

      // Other requests should still be in queue
      expect(requestManager.getQueueStatus().queueLength).toBe(2);
    });

    test('should handle abortion of non-existent request', () => {
      requestManager.abortRequest('non-existent');

      // Should not throw error or publish events
      const abortedEvents = (mockEventBus.publish as jest.Mock).mock.calls
        .filter(call => call[0] === 'request.aborted');
      expect(abortedEvents).toHaveLength(0);
    });

    test('should abort all pending requests', async () => {
      const mockNow = 1000000;
      Date.now = jest.fn().mockReturnValue(mockNow);

      const request1 = createMockRequest('req-1');
      const request2 = createMockRequest('req-2');
      const request3 = createMockRequest('req-3');

      const promise1 = requestManager.queueRequest(request1);
      const promise2 = requestManager.queueRequest(request2);
      const promise3 = requestManager.queueRequest(request3);

      expect(requestManager.getQueueStatus().queueLength).toBe(3);

      requestManager.abortAllRequests();

      expect(requestManager.getQueueStatus().queueLength).toBe(0);
      expect(mockEventBus.publish).toHaveBeenCalledWith('request.all_aborted', {
        abortedCount: 3,
        timestamp: mockNow
      });

      // All request promises should be rejected
      await expect(promise1).rejects.toThrow('All requests aborted');
      await expect(promise2).rejects.toThrow('All requests aborted');
      await expect(promise3).rejects.toThrow('All requests aborted');
    });

    test('should handle aborting all requests when queue is empty', () => {
      const mockNow = 1000000;
      Date.now = jest.fn().mockReturnValue(mockNow);

      requestManager.abortAllRequests();

      expect(mockEventBus.publish).toHaveBeenCalledWith('request.all_aborted', {
        abortedCount: 0,
        timestamp: mockNow
      });
    });
  });

  describe('queue status and statistics', () => {
    const createMockRequest = (id: string, priority: number = 0): AIRequest => ({
      id,
      messages: [{ role: 'user', content: 'Test message' }] as Message[],
      options: { temperature: 0.7 } as CompletionOptions,
      provider: 'openai',
      priority,
      timestamp: Date.now()
    });

    test('should provide accurate queue status', async () => {
      const request1 = createMockRequest('req-1');
      const request2 = createMockRequest('req-2');

      requestManager.queueRequest(request1);
      requestManager.queueRequest(request2);

      const status = requestManager.getQueueStatus();
      expect(status).toEqual({
        queueLength: 2,
        processing: false,
        averageWaitTime: 0,
        totalProcessed: 0
      });
    });

    test('should provide detailed queue statistics', async () => {
      const request1 = createMockRequest('req-1');
      const request2 = createMockRequest('req-2');

      requestManager.queueRequest(request1);
      requestManager.queueRequest(request2);

      const stats = requestManager.getQueueStats();
      expect(stats).toEqual({
        currentSize: 2,
        maxSize: 100,
        totalProcessed: 0,
        averageProcessingTime: 0,
        isProcessing: false
      });
    });

    test('should calculate average processing time correctly', async () => {
      const mockNow = 1000000;
      let timeOffset = 0;
      Date.now = jest.fn().mockImplementation(() => {
        const currentTime = mockNow + timeOffset;
        timeOffset += 100; // Each call advances time by 100ms
        return currentTime;
      });

      const request1 = createMockRequest('req-1');
      const request2 = createMockRequest('req-2');
      const request3 = createMockRequest('req-3');

      requestManager.queueRequest(request1);
      requestManager.queueRequest(request2);
      requestManager.queueRequest(request3);

      await requestManager.processQueue();

      const stats = requestManager.getQueueStats();
      // Each request should take 100ms (mocked processing time)
      expect(stats.averageProcessingTime).toBe(100);
      expect(stats.totalProcessed).toBe(3);
    });
  });

  describe('memory management and cleanup', () => {
    const createMockRequest = (id: string): AIRequest => ({
      id,
      messages: [{ role: 'user', content: 'Test message' }] as Message[],
      options: { temperature: 0.7 } as CompletionOptions,
      provider: 'openai',
      priority: 0,
      timestamp: Date.now()
    });

    test('should dispose and clean up resources', async () => {
      const request1 = createMockRequest('req-1');
      const request2 = createMockRequest('req-2');

      const promise1 = requestManager.queueRequest(request1);
      const promise2 = requestManager.queueRequest(request2);

      expect(requestManager.getQueueStatus().queueLength).toBe(2);

      requestManager.dispose();

      // All pending requests should be aborted
      await expect(promise1).rejects.toThrow('All requests aborted');
      await expect(promise2).rejects.toThrow('All requests aborted');

      // Queue should be empty and stats reset
      expect(requestManager.getQueueStatus().queueLength).toBe(0);
      
      const stats = requestManager.getQueueStats();
      expect(stats.totalProcessed).toBe(0);
      expect(stats.averageProcessingTime).toBe(0);
    });
  });

  describe('edge cases and error scenarios', () => {
    const createMockRequest = (id: string, priority: number = 0): AIRequest => ({
      id,
      messages: [{ role: 'user', content: 'Test message' }] as Message[],
      options: { temperature: 0.7 } as CompletionOptions,
      provider: 'openai',
      priority,
      timestamp: Date.now()
    });

    test('should handle requests with empty messages', async () => {
      const request: AIRequest = {
        id: 'empty-messages',
        messages: [],
        options: { temperature: 0.7 } as CompletionOptions,
        provider: 'openai',
        priority: 0,
        timestamp: Date.now()
      };

      requestManager.queueRequest(request);
      await requestManager.processQueue();

      expect(mockEventBus.publish).toHaveBeenCalledWith('request.processing', 
        expect.objectContaining({
          messages: [],
          requestId: 'empty-messages'
        })
      );
    });

    test('should handle requests with undefined provider', async () => {
      const request: AIRequest = {
        id: 'no-provider',
        messages: [{ role: 'user', content: 'Test' }] as Message[],
        options: { temperature: 0.7 } as CompletionOptions,
        provider: undefined as any,
        priority: 0,
        timestamp: Date.now()
      };

      requestManager.queueRequest(request);
      await requestManager.processQueue();

      expect(mockEventBus.publish).toHaveBeenCalledWith('request.processing', 
        expect.objectContaining({
          provider: undefined,
          requestId: 'no-provider'
        })
      );
    });

    test('should handle very large priority values', async () => {
      const request = createMockRequest('large-priority', Number.MAX_SAFE_INTEGER);
      requestManager.queueRequest(request);

      expect(requestManager.getQueueStatus().queueLength).toBe(1);
      expect(mockEventBus.publish).toHaveBeenCalledWith('request.queued', 
        expect.objectContaining({ priority: Number.MAX_SAFE_INTEGER })
      );
    });

    test('should handle very small priority values', async () => {
      const request = createMockRequest('small-priority', Number.MIN_SAFE_INTEGER);
      requestManager.queueRequest(request);

      expect(requestManager.getQueueStatus().queueLength).toBe(1);
      expect(mockEventBus.publish).toHaveBeenCalledWith('request.queued', 
        expect.objectContaining({ priority: Number.MIN_SAFE_INTEGER })
      );
    });

    test('should handle requests with very long IDs', async () => {
      const longId = 'a'.repeat(1000);
      const request = createMockRequest(longId);
      requestManager.queueRequest(request);

      expect(requestManager.getQueueStatus().queueLength).toBe(1);
      expect(mockEventBus.publish).toHaveBeenCalledWith('request.queued', 
        expect.objectContaining({ requestId: longId })
      );
    });

    test('should handle requests with special characters in IDs', async () => {
      const specialId = 'req-with-special@chars!#$%^&*()';
      const request = createMockRequest(specialId);
      requestManager.queueRequest(request);

      expect(requestManager.getQueueStatus().queueLength).toBe(1);
      expect(mockEventBus.publish).toHaveBeenCalledWith('request.queued', 
        expect.objectContaining({ requestId: specialId })
      );
    });

    test('should handle duplicate request IDs', async () => {
      const request1 = createMockRequest('duplicate-id');
      const request2 = createMockRequest('duplicate-id');

      requestManager.queueRequest(request1);
      requestManager.queueRequest(request2);

      expect(requestManager.getQueueStatus().queueLength).toBe(2);

      // Aborting by ID should only abort the first matching request
      requestManager.abortRequest('duplicate-id');
      expect(requestManager.getQueueStatus().queueLength).toBe(1);
    });
  });

  describe('event bus interactions', () => {
    const createMockRequest = (id: string, priority: number = 0): AIRequest => ({
      id,
      messages: [{ role: 'user', content: 'Test message' }] as Message[],
      options: { temperature: 0.7 } as CompletionOptions,
      provider: 'openai',
      priority,
      timestamp: Date.now()
    });

    test('should publish request queued events', async () => {
      const mockNow = 1000000;
      Date.now = jest.fn().mockReturnValue(mockNow);

      const request = createMockRequest('event-req', 2);
      requestManager.queueRequest(request);

      expect(mockEventBus.publish).toHaveBeenCalledWith('request.queued', {
        requestId: 'event-req',
        queueSize: 1,
        priority: 2,
        timestamp: mockNow
      });
    });

    test('should publish request processing events', async () => {
      const request = createMockRequest('processing-req');
      requestManager.queueRequest(request);

      // Clear previous event calls
      mockEventBus.publish.mockClear();

      await requestManager.processQueue();

      expect(mockEventBus.publish).toHaveBeenCalledWith('request.processing', {
        requestId: 'processing-req',
        messages: request.messages,
        options: request.options,
        provider: 'openai',
        timestamp: expect.any(Number)
      });
    });

    test('should publish request processed events', async () => {
      const request = createMockRequest('processed-req');
      requestManager.queueRequest(request);

      // Clear previous event calls
      mockEventBus.publish.mockClear();

      await requestManager.processQueue();

      expect(mockEventBus.publish).toHaveBeenCalledWith('request.processed', {
        requestId: 'processed-req',
        processingTime: expect.any(Number),
        queueSize: 0,
        timestamp: expect.any(Number)
      });
    });

    test('should publish request failed events', async () => {
      const request = createMockRequest('failed-req');
      requestManager.queueRequest(request);

      // Mock processRequest to fail
      const originalProcessRequest = (requestManager as any).processRequest;
      (requestManager as any).processRequest = jest.fn().mockRejectedValue(new Error('Processing failed'));

      await requestManager.processQueue();

      expect(mockEventBus.publish).toHaveBeenCalledWith('request.failed', {
        requestId: 'failed-req',
        error: 'Processing failed',
        queueSize: 0,
        timestamp: expect.any(Number)
      });

      // Restore original method
      (requestManager as any).processRequest = originalProcessRequest;
    });

    test('should publish request aborted events', async () => {
      const mockNow = 1000000;
      Date.now = jest.fn().mockReturnValue(mockNow);

      const request = createMockRequest('aborted-req');
      requestManager.queueRequest(request);

      requestManager.abortRequest('aborted-req');

      expect(mockEventBus.publish).toHaveBeenCalledWith('request.aborted', {
        requestId: 'aborted-req',
        queueSize: 0,
        timestamp: mockNow
      });
    });

    test('should publish all requests aborted events', async () => {
      const mockNow = 1000000;
      Date.now = jest.fn().mockReturnValue(mockNow);

      const request1 = createMockRequest('req-1');
      const request2 = createMockRequest('req-2');
      requestManager.queueRequest(request1);
      requestManager.queueRequest(request2);

      requestManager.abortAllRequests();

      expect(mockEventBus.publish).toHaveBeenCalledWith('request.all_aborted', {
        abortedCount: 2,
        timestamp: mockNow
      });
    });

    test('should publish queue full events', async () => {
      const mockNow = 1000000;
      Date.now = jest.fn().mockReturnValue(mockNow);

      // Fill queue to capacity
      for (let i = 0; i < 100; i++) {
        requestManager.queueRequest(createMockRequest(`req-${i}`));
      }

      // Try to add one more
      const overflowRequest = createMockRequest('overflow');
      await expect(requestManager.queueRequest(overflowRequest))
        .rejects.toThrow('Request queue is full. Please try again later.');

      expect(mockEventBus.publish).toHaveBeenCalledWith('request.queue.full', {
        queueSize: 100,
        maxSize: 100,
        timestamp: mockNow
      });
    });
  });

  describe('integration scenarios', () => {
    const createMockRequest = (id: string, priority: number = 0): AIRequest => ({
      id,
      messages: [{ role: 'user', content: 'Test message' }] as Message[],
      options: { temperature: 0.7 } as CompletionOptions,
      provider: 'openai',
      priority,
      timestamp: Date.now()
    });

    test('should handle realistic request lifecycle', async () => {
      const mockNow = 1000000;
      Date.now = jest.fn().mockReturnValue(mockNow);

      // Queue multiple requests with different priorities
      const highPriorityRequest = createMockRequest('urgent', 10);
      const normalRequest1 = createMockRequest('normal-1', 5);
      const normalRequest2 = createMockRequest('normal-2', 5);
      const lowPriorityRequest = createMockRequest('background', 1);

      requestManager.queueRequest(normalRequest1);
      requestManager.queueRequest(lowPriorityRequest);
      requestManager.queueRequest(highPriorityRequest);
      requestManager.queueRequest(normalRequest2);

      expect(requestManager.getQueueStatus().queueLength).toBe(4);

      // Process some requests
      await requestManager.processQueue();

      // Verify all requests were processed in priority order
      const processingEvents = (mockEventBus.publish as jest.Mock).mock.calls
        .filter(call => call[0] === 'request.processing');

      expect(processingEvents).toHaveLength(4);
      expect(processingEvents[0][1].requestId).toBe('urgent');
      expect(processingEvents[3][1].requestId).toBe('background');

      expect(requestManager.getQueueStatus().queueLength).toBe(0);
      expect(requestManager.getQueueStatus().totalProcessed).toBe(4);
    });

    test('should handle mixed success and failure scenarios', async () => {
      const successRequest = createMockRequest('success');
      const failureRequest = createMockRequest('failure');

      requestManager.queueRequest(successRequest);
      requestManager.queueRequest(failureRequest);

      // Mock processRequest to succeed for first request, fail for second
      const originalProcessRequest = (requestManager as any).processRequest;
      (requestManager as any).processRequest = jest.fn().mockImplementation((request: QueuedRequest) => {
        if (request.id === 'failure') {
          return Promise.reject(new Error('Simulated failure'));
        }
        return Promise.resolve();
      });

      await requestManager.processQueue();

      // Both should be processed
      expect(requestManager.getQueueStatus().totalProcessed).toBe(2);

      // Restore original method
      (requestManager as any).processRequest = originalProcessRequest;
    });

    test('should handle disposal during active operations', async () => {
      const request1 = createMockRequest('dispose-1');
      const request2 = createMockRequest('dispose-2');

      const promise1 = requestManager.queueRequest(request1);
      const promise2 = requestManager.queueRequest(request2);

      // Dispose while operations are active
      requestManager.dispose();

      // All promises should be rejected
      await expect(promise1).rejects.toThrow('All requests aborted');
      await expect(promise2).rejects.toThrow('All requests aborted');

      // Queue should be clean
      expect(requestManager.getQueueStatus().queueLength).toBe(0);
    });
  });

  describe('data consistency and integrity', () => {
    const createMockRequest = (id: string, priority: number = 0): AIRequest => ({
      id,
      messages: [{ role: 'user', content: 'Test message' }] as Message[],
      options: { temperature: 0.7 } as CompletionOptions,
      provider: 'openai',
      priority,
      timestamp: Date.now()
    });

    test('should maintain queue size consistency', async () => {
      // Queue requests
      requestManager.queueRequest(createMockRequest('req-1'));
      requestManager.queueRequest(createMockRequest('req-2'));
      requestManager.queueRequest(createMockRequest('req-3'));

      expect(requestManager.getQueueStatus().queueLength).toBe(3);
      expect(requestManager.getQueueStats().currentSize).toBe(3);

      // Abort one request
      requestManager.abortRequest('req-2');

      expect(requestManager.getQueueStatus().queueLength).toBe(2);
      expect(requestManager.getQueueStats().currentSize).toBe(2);

      // Process remaining requests
      await requestManager.processQueue();

      expect(requestManager.getQueueStatus().queueLength).toBe(0);
      expect(requestManager.getQueueStats().currentSize).toBe(0);
      expect(requestManager.getQueueStats().totalProcessed).toBe(2);
    });

    test('should maintain processing statistics consistency', async () => {
      const mockNow = 1000000;
      let timeOffset = 0;
      Date.now = jest.fn().mockImplementation(() => {
        const currentTime = mockNow + timeOffset;
        timeOffset += 50; // Each call advances time by 50ms
        return currentTime;
      });

      // Process multiple requests
      for (let i = 0; i < 5; i++) {
        requestManager.queueRequest(createMockRequest(`stats-${i}`));
      }

      await requestManager.processQueue();

      const status = requestManager.getQueueStatus();
      const stats = requestManager.getQueueStats();

      expect(status.totalProcessed).toBe(stats.totalProcessed);
      expect(status.averageWaitTime).toBe(stats.averageProcessingTime);
      expect(stats.totalProcessed).toBe(5);
      expect(stats.averageProcessingTime).toBeGreaterThan(0);
    });

    test('should handle state consistency during concurrent operations', async () => {
      const requests = [];
      const promises = [];

      // Queue multiple requests
      for (let i = 0; i < 10; i++) {
        const request = createMockRequest(`concurrent-${i}`);
        requests.push(request);
        promises.push(requestManager.queueRequest(request));
      }

      // Abort some requests while others are queued
      requestManager.abortRequest('concurrent-3');
      requestManager.abortRequest('concurrent-7');

      expect(requestManager.getQueueStatus().queueLength).toBe(8);

      // Process remaining requests
      await requestManager.processQueue();

      expect(requestManager.getQueueStatus().queueLength).toBe(0);
      expect(requestManager.getQueueStats().totalProcessed).toBe(8);

      // Verify aborted requests were rejected
      await expect(promises[3]).rejects.toThrow('Request aborted');
      await expect(promises[7]).rejects.toThrow('Request aborted');
    });
  });
});