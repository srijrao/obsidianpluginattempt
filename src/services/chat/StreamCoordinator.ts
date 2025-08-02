/**
 * @file StreamCoordinator.ts
 * 
 * Stream Coordinator service for managing streaming AI responses.
 * Extracted from ChatView to follow single responsibility principle.
 */

import { IStreamCoordinator, IEventBus } from '../interfaces';
import { Message } from '../../types';
import { AIService } from '../core/AIService';
import { buildContextMessages } from '../../utils/contextBuilder';
import type MyPlugin from '../../main';

export interface StreamOptions {
    temperature?: number;
    maxTokens?: number;
    stopSequences?: string[];
    timeout?: number;
    uiContainer?: HTMLElement;
    onChunk?: (chunk: string, fullContent: string) => Promise<void>;
}

export interface StreamState {
    isStreaming: boolean;
    currentStreamId?: string;
    startTime?: number;
    totalChunks: number;
    totalCharacters: number;
}

/**
 * Coordinates streaming AI responses and manages stream lifecycle
 */
export class StreamCoordinator implements IStreamCoordinator {
    private activeStreams = new Map<string, AbortController>();
    private streamState: StreamState = {
        isStreaming: false,
        totalChunks: 0,
        totalCharacters: 0
    };
    private uiUpdateCallbacks = new Set<(isStreaming: boolean) => void>();
    private activeContainer: HTMLElement | null = null;

    constructor(
        private plugin: MyPlugin,
        private eventBus: IEventBus,
        private aiService: AIService
    ) {
        // Validate dependencies during construction
        this.validateDependencies();
        this.setupEventListeners();
        
        this.plugin.debugLog('info', '[StreamCoordinator] Initialized successfully with all dependencies');
    }

    /**
     * Validate that all required dependencies are available
     */
    private validateDependencies(): void {
        if (!this.plugin) {
            throw new Error('StreamCoordinator: Plugin instance is required');
        }
        
        if (!this.plugin.aiDispatcher) {
            throw new Error('StreamCoordinator: AIDispatcher is not available on plugin instance');
        }
        
        if (!this.eventBus) {
            throw new Error('StreamCoordinator: EventBus is required');
        }
        
        if (!this.aiService) {
            throw new Error('StreamCoordinator: AIService is required');
        }
        
        this.plugin.debugLog('debug', '[StreamCoordinator] All dependencies validated successfully');
    }

    /**
     * Register a UI update callback for stream state changes
     */
    onUIStateChange(callback: (isStreaming: boolean) => void): void {
        this.uiUpdateCallbacks.add(callback);
    }

    /**
     * Unregister a UI update callback
     */
    offUIStateChange(callback: (isStreaming: boolean) => void): void {
        this.uiUpdateCallbacks.delete(callback);
    }

    /**
     * Set the active UI container for stream updates
     */
    setActiveContainer(container: HTMLElement | null): void {
        this.activeContainer = container;
    }

    /**
     * Get the current active container
     */
    getActiveContainer(): HTMLElement | null {
        return this.activeContainer;
    }

    /**
     * Notify all UI callbacks of stream state change
     */
    private notifyUIStateChange(): void {
        const isStreaming = this.streamState.isStreaming;
        this.uiUpdateCallbacks.forEach(callback => {
            try {
                callback(isStreaming);
            } catch (error) {
                console.error('Error in UI state change callback:', error);
            }
        });
    }

    /**
     * Starts a new streaming response
     */
    async startStream(messages: Message[], options: StreamOptions = {}): Promise<string> {
        if (this.streamState.isStreaming) {
            // Defensive: If a stream is still cleaning up, prevent new streams (agent mode safety)
            this.eventBus.publish('stream.start_blocked', {
                reason: 'A stream is already active or cleaning up.',
                timestamp: Date.now()
            });
            throw new Error('A stream is already active. Stop the current stream before starting a new one.');
        }

        const streamId = this.generateStreamId();
        const abortController = new AbortController();
        let aborted = false;

        // Set UI container if provided
        if (options.uiContainer) {
            this.setActiveContainer(options.uiContainer);
        }

        this.activeStreams.set(streamId, abortController);
        this.updateStreamState({
            isStreaming: true,
            currentStreamId: streamId,
            startTime: Date.now(),
            totalChunks: 0,
            totalCharacters: 0
        });

        // Notify UI of stream start
        this.notifyUIStateChange();

        // Defensive: mark aborted if abortController is triggered
        abortController.signal.addEventListener('abort', () => {
            aborted = true;
        });

        try {
            this.eventBus.publish('stream.started', {
                streamId,
                provider: this.determineProvider(),
                messageCount: messages.length,
                timestamp: Date.now()
            });

            // Build context messages
            const contextMessages = await this.buildContextMessages();
            const allMessages = [...contextMessages, ...messages];

            // Start the streaming request
            let fullResponse = '';
            let chunkCount = 0;

            const streamCallback = async (chunk: string) => {
                if (aborted) return; // Defensive: ignore chunks after abort
                fullResponse += chunk;
                chunkCount++;
                this.updateStreamState({
                    ...this.streamState,
                    totalChunks: chunkCount,
                    totalCharacters: fullResponse.length
                });

                // Call custom UI update callback if provided
                if (options.onChunk) {
                    try {
                        await options.onChunk(chunk, fullResponse);
                    } catch (error) {
                        console.error('Error in custom chunk callback:', error);
                    }
                }

                this.eventBus.publish('stream.chunk', {
                    streamId,
                    chunk,
                    totalLength: fullResponse.length,
                    chunkIndex: chunkCount,
                    timestamp: Date.now()
                });
            };

            // Make the AI request
            const response = await this.aiService.getCompletion({
                messages: allMessages,
                options: {
                    temperature: options.temperature,
                    streamCallback,
                    abortController
                }
            });

            const duration = Date.now() - this.streamState.startTime!;

            this.eventBus.publish('stream.completed', {
                streamId,
                content: fullResponse,
                duration,
                chunkCount,
                characterCount: fullResponse.length,
                timestamp: Date.now()
            });

            return fullResponse;

        } catch (error: any) {
            const duration = this.streamState.startTime ? Date.now() - this.streamState.startTime : 0;
            if (error.name === 'AbortError') {
                this.eventBus.publish('stream.aborted', {
                    streamId,
                    reason: 'user_requested',
                    duration,
                    timestamp: Date.now()
                });
            } else {
                this.eventBus.publish('stream.error', {
                    streamId,
                    error: error.message,
                    duration,
                    timestamp: Date.now()
                });
            }
            throw error;
        } finally {
            this.cleanupStream(streamId);
        }
    }

    /**
     * Stops the current stream
     */
    stopStream(): void {
        if (!this.streamState.isStreaming || !this.streamState.currentStreamId) {
            return;
        }

        const streamId = this.streamState.currentStreamId;
        const abortController = this.activeStreams.get(streamId);
        
        if (abortController) {
            abortController.abort();
            this.cleanupStream(streamId);
            
            this.eventBus.publish('stream.stopped', {
                streamId,
                reason: 'user_requested',
                timestamp: Date.now()
            });
        }
    }

    /**
     * Checks if currently streaming
     */
    isStreaming(): boolean {
        return this.streamState.isStreaming;
    }

    /**
     * Gets all active stream IDs
     */
    getActiveStreams(): string[] {
        return Array.from(this.activeStreams.keys());
    }

    /**
     * Aborts a specific stream
     */
    abortStream(streamId: string): void {
        const abortController = this.activeStreams.get(streamId);
        
        if (abortController) {
            abortController.abort();
            this.cleanupStream(streamId);
            
            this.eventBus.publish('stream.aborted', {
                streamId,
                reason: 'manual_abort',
                timestamp: Date.now()
            });
        }
    }

    /**
     * Gets current stream state
     */
    getStreamState(): StreamState {
        return { ...this.streamState };
    }

    /**
     * Gets stream statistics
     */
    getStreamStats(): {
        totalStreams: number;
        activeStreams: number;
        averageStreamDuration: number;
        totalCharactersStreamed: number;
        totalChunksProcessed: number;
    } {
        // This would be enhanced with persistent statistics
        return {
            totalStreams: 0, // Would track across sessions
            activeStreams: this.activeStreams.size,
            averageStreamDuration: 0, // Would calculate from historical data
            totalCharactersStreamed: this.streamState.totalCharacters,
            totalChunksProcessed: this.streamState.totalChunks
        };
    }

    /**
     * Sets stream options for future streams
     */
    setDefaultStreamOptions(options: StreamOptions): void {
        // Store default options for future use
        this.eventBus.publish('stream.options_updated', {
            options,
            timestamp: Date.now()
        });
    }

    /**
     * Pauses the current stream (if supported by provider)
     */
    pauseStream(): void {
        if (!this.streamState.isStreaming) {
            return;
        }

        // Note: Most AI providers don't support pausing streams
        // This is a placeholder for future implementation
        this.eventBus.publish('stream.pause_requested', {
            streamId: this.streamState.currentStreamId,
            timestamp: Date.now()
        });
    }

    /**
     * Resumes a paused stream (if supported by provider)
     */
    resumeStream(): void {
        if (!this.streamState.isStreaming) {
            return;
        }

        // Note: Most AI providers don't support resuming streams
        // This is a placeholder for future implementation
        this.eventBus.publish('stream.resume_requested', {
            streamId: this.streamState.currentStreamId,
            timestamp: Date.now()
        });
    }

    /**
     * Generates a unique stream ID
     */
    private generateStreamId(): string {
        return `stream_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Updates the stream state
     */
    private updateStreamState(newState: Partial<StreamState>): void {
        this.streamState = { ...this.streamState, ...newState };
    }

    /**
     * Cleans up a stream
     */
    private cleanupStream(streamId: string): void {
        this.activeStreams.delete(streamId);
        
        if (this.streamState.currentStreamId === streamId) {
            this.updateStreamState({
                isStreaming: false,
                currentStreamId: undefined,
                startTime: undefined
            });
            // Notify UI of stream end
            this.notifyUIStateChange();
        }
    }

    /**
     * Builds context messages for the request
     */
    private async buildContextMessages(): Promise<Message[]> {
        try {
            return await buildContextMessages({
                app: this.plugin.app,
                plugin: this.plugin
            });
        } catch (error) {
            console.warn('Failed to build context messages:', error);
            return [];
        }
    }

    /**
     * Determines the current provider
     */
    private determineProvider(): string {
        if (this.plugin.settings.selectedModel) {
            return this.plugin.settings.selectedModel.split(':')[0];
        }
        return this.plugin.settings.provider;
    }

    /**
     * Sets up event listeners
     */
    private setupEventListeners(): void {
        // Listen for global stream abort requests
        this.eventBus.subscribe('stream.abort_all', () => {
            this.abortAllStreams();
        });

        // Listen for settings changes that might affect streaming
        this.eventBus.subscribe('settings.changed', (data: any) => {
            if (data.key === 'selectedModel' || data.key === 'provider') {
                // Provider changed during streaming - might need to handle this
                if (this.streamState.isStreaming) {
                    this.eventBus.publish('stream.provider_changed', {
                        streamId: this.streamState.currentStreamId,
                        newProvider: this.determineProvider(),
                        timestamp: Date.now()
                    });
                }
            }
        });
    }

    /**
     * Aborts all active streams
     */
    private abortAllStreams(): void {
        const streamIds = Array.from(this.activeStreams.keys());
        
        for (const streamId of streamIds) {
            this.abortStream(streamId);
        }

        // Ensure UI is notified even if no streams were active
        this.notifyUIStateChange();

        this.eventBus.publish('stream.all_aborted', {
            abortedCount: streamIds.length,
            timestamp: Date.now()
        });
    }

    /**
     * Cleanup method for disposing the service
     */
    dispose(): void {
        this.abortAllStreams();
        this.updateStreamState({
            isStreaming: false,
            currentStreamId: undefined,
            startTime: undefined,
            totalChunks: 0,
            totalCharacters: 0
        });
    }
}