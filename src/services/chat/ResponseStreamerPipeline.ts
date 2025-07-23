/**
 * @file ResponseStreamerPipeline.ts
 * 
 * Refactored Response Streamer Pipeline using focused services.
 * Replaces the monolithic ResponseStreamer with a clean, modular pipeline.
 */

import { IEventBus } from '../interfaces';
import { Message } from '../../types';
import { AIService } from '../core/AIService';
import { StreamCoordinator } from './StreamCoordinator';
import { AgentResponseHandler } from '../../components/agent/AgentResponseHandler/AgentResponseHandler';
import { ChatMessage } from '../../components/chat/ChatHistoryManager';
import type MyPlugin from '../../main';

export interface PipelineStage {
    name: string;
    process(context: PipelineContext): Promise<PipelineContext>;
}

export interface PipelineContext {
    messages: Message[];
    container: HTMLElement;
    originalTimestamp?: string;
    originalContent?: string;
    chatHistory: ChatMessage[];
    responseContent: string;
    toolResults?: any[];
    reasoning?: any;
    taskStatus?: any;
    metadata: Record<string, any>;
    aborted: boolean;
    error?: Error;
}

export interface PipelineConfig {
    enableAgentProcessing?: boolean;
    enableToolExecution?: boolean;
    enableContinuation?: boolean;
    maxContinuations?: number;
    timeoutMs?: number;
}

/**
 * Modular response streaming pipeline with pluggable stages
 */
export class ResponseStreamerPipeline {
    private stages: PipelineStage[] = [];
    private config: PipelineConfig;

    constructor(
        private plugin: MyPlugin,
        private eventBus: IEventBus,
        private aiService: AIService,
        private streamCoordinator: StreamCoordinator,
        private agentResponseHandler?: AgentResponseHandler,
        config: PipelineConfig = {}
    ) {
        this.config = {
            enableAgentProcessing: true,
            enableToolExecution: true,
            enableContinuation: true,
            maxContinuations: 3,
            timeoutMs: 30000,
            ...config
        };

        this.initializePipeline();
    }

    /**
     * Processes a streaming response through the pipeline
     */
    async processResponse(
        messages: Message[],
        container: HTMLElement,
        originalTimestamp?: string,
        originalContent?: string,
        chatHistory: ChatMessage[] = []
    ): Promise<string> {
        const context: PipelineContext = {
            messages,
            container,
            originalTimestamp,
            originalContent,
            chatHistory,
            responseContent: '',
            metadata: {},
            aborted: false
        };

        try {
            this.eventBus.publish('pipeline.started', {
                stageCount: this.stages.length,
                messageCount: messages.length,
                timestamp: Date.now()
            });

            // Execute pipeline stages
            let currentContext = context;
            for (const stage of this.stages) {
                if (currentContext.aborted) {
                    break;
                }

                try {
                    this.eventBus.publish('pipeline.stage.started', {
                        stageName: stage.name,
                        timestamp: Date.now()
                    });

                    currentContext = await stage.process(currentContext);

                    this.eventBus.publish('pipeline.stage.completed', {
                        stageName: stage.name,
                        responseLength: currentContext.responseContent.length,
                        timestamp: Date.now()
                    });

                } catch (error: any) {
                    this.eventBus.publish('pipeline.stage.failed', {
                        stageName: stage.name,
                        error: error.message,
                        timestamp: Date.now()
                    });

                    currentContext.error = error;
                    break;
                }
            }

            this.eventBus.publish('pipeline.completed', {
                responseLength: currentContext.responseContent.length,
                hasToolResults: !!currentContext.toolResults?.length,
                timestamp: Date.now()
            });

            return currentContext.responseContent;

        } catch (error: any) {
            this.eventBus.publish('pipeline.failed', {
                error: error.message,
                timestamp: Date.now()
            });
            throw error;
        }
    }

    /**
     * Adds a custom stage to the pipeline
     */
    addStage(stage: PipelineStage, position?: number): void {
        if (position !== undefined) {
            this.stages.splice(position, 0, stage);
        } else {
            this.stages.push(stage);
        }

        this.eventBus.publish('pipeline.stage.added', {
            stageName: stage.name,
            position: position ?? this.stages.length - 1,
            totalStages: this.stages.length,
            timestamp: Date.now()
        });
    }

    /**
     * Removes a stage from the pipeline
     */
    removeStage(stageName: string): boolean {
        const index = this.stages.findIndex(stage => stage.name === stageName);
        if (index !== -1) {
            this.stages.splice(index, 1);
            
            this.eventBus.publish('pipeline.stage.removed', {
                stageName,
                totalStages: this.stages.length,
                timestamp: Date.now()
            });
            
            return true;
        }
        return false;
    }

    /**
     * Gets pipeline configuration
     */
    getConfig(): PipelineConfig {
        return { ...this.config };
    }

    /**
     * Updates pipeline configuration
     */
    updateConfig(newConfig: Partial<PipelineConfig>): void {
        this.config = { ...this.config, ...newConfig };
        
        this.eventBus.publish('pipeline.config.updated', {
            config: this.config,
            timestamp: Date.now()
        });
    }

    /**
     * Gets pipeline statistics
     */
    getStats(): {
        stageCount: number;
        stages: string[];
        config: PipelineConfig;
    } {
        return {
            stageCount: this.stages.length,
            stages: this.stages.map(stage => stage.name),
            config: this.getConfig()
        };
    }

    /**
     * Initializes the default pipeline stages
     */
    private initializePipeline(): void {
        // Stage 1: Stream Generation
        this.addStage(new StreamGenerationStage(
            this.streamCoordinator,
            this.eventBus
        ));

        // Stage 2: Agent Processing (if enabled)
        if (this.config.enableAgentProcessing && this.agentResponseHandler) {
            this.addStage(new AgentProcessingStage(
                this.agentResponseHandler,
                this.eventBus
            ));
        }

        // Stage 3: Tool Execution (if enabled)
        if (this.config.enableToolExecution && this.agentResponseHandler) {
            this.addStage(new ToolExecutionStage(
                this.agentResponseHandler,
                this.eventBus
            ));
        }

        // Stage 4: Continuation Handling (if enabled)
        if (this.config.enableContinuation) {
            this.addStage(new ContinuationStage(
                this.plugin,
                this.eventBus,
                this.config.maxContinuations || 3
            ));
        }

        // Stage 5: Finalization
        this.addStage(new FinalizationStage(this.eventBus));
    }
}

/**
 * Stage 1: Stream Generation
 */
class StreamGenerationStage implements PipelineStage {
    name = 'stream-generation';

    constructor(
        private streamCoordinator: StreamCoordinator,
        private eventBus: IEventBus
    ) {}

    async process(context: PipelineContext): Promise<PipelineContext> {
        try {
            const responseContent = await this.streamCoordinator.startStream(context.messages);
            
            return {
                ...context,
                responseContent
            };
        } catch (error: any) {
            if (error.name === 'AbortError') {
                return { ...context, aborted: true };
            }
            throw error;
        }
    }
}

/**
 * Stage 2: Agent Processing
 */
class AgentProcessingStage implements PipelineStage {
    name = 'agent-processing';

    constructor(
        private agentResponseHandler: AgentResponseHandler,
        private eventBus: IEventBus
    ) {}

    async process(context: PipelineContext): Promise<PipelineContext> {
        if (!context.responseContent.trim()) {
            return context;
        }

        try {
            const result = await this.agentResponseHandler.processResponseWithUI(
                context.responseContent,
                'pipeline',
                context.chatHistory
            );

            return {
                ...context,
                responseContent: result.processedText,
                toolResults: result.toolResults,
                reasoning: result.reasoning,
                taskStatus: result.taskStatus
            };
        } catch (error: any) {
            this.eventBus.publish('pipeline.agent.processing_failed', {
                error: error.message,
                timestamp: Date.now()
            });
            
            // Continue with original content if agent processing fails
            return context;
        }
    }
}

/**
 * Stage 3: Tool Execution
 */
class ToolExecutionStage implements PipelineStage {
    name = 'tool-execution';

    constructor(
        private agentResponseHandler: AgentResponseHandler,
        private eventBus: IEventBus
    ) {}

    async process(context: PipelineContext): Promise<PipelineContext> {
        if (!context.toolResults?.length) {
            return context;
        }

        try {
            // Tool execution is already handled in agent processing
            // This stage can be used for additional tool-related processing
            
            this.eventBus.publish('pipeline.tools.executed', {
                toolCount: context.toolResults.length,
                timestamp: Date.now()
            });

            return context;
        } catch (error: any) {
            this.eventBus.publish('pipeline.tools.execution_failed', {
                error: error.message,
                timestamp: Date.now()
            });
            throw error;
        }
    }
}

/**
 * Stage 4: Continuation Handling
 */
class ContinuationStage implements PipelineStage {
    name = 'continuation';

    constructor(
        private plugin: MyPlugin,
        private eventBus: IEventBus,
        private maxContinuations: number
    ) {}

    async process(context: PipelineContext): Promise<PipelineContext> {
        // Check if continuation is needed based on task status
        if (context.taskStatus?.canContinue && context.taskStatus?.status === 'running') {
            const continuationCount = context.metadata.continuationCount || 0;
            
            if (continuationCount < this.maxContinuations) {
                this.eventBus.publish('pipeline.continuation.available', {
                    continuationCount,
                    maxContinuations: this.maxContinuations,
                    timestamp: Date.now()
                });

                context.metadata.continuationCount = continuationCount + 1;
                context.metadata.canContinue = true;
            } else {
                this.eventBus.publish('pipeline.continuation.limit_reached', {
                    continuationCount,
                    maxContinuations: this.maxContinuations,
                    timestamp: Date.now()
                });

                context.metadata.canContinue = false;
            }
        }

        return context;
    }
}

/**
 * Stage 5: Finalization
 */
class FinalizationStage implements PipelineStage {
    name = 'finalization';

    constructor(private eventBus: IEventBus) {}

    async process(context: PipelineContext): Promise<PipelineContext> {
        // Store enhanced message data in container
        if (context.container && (context.toolResults || context.reasoning || context.taskStatus)) {
            const enhancedData = {
                toolResults: context.toolResults,
                reasoning: context.reasoning,
                taskStatus: context.taskStatus
            };
            
            context.container.dataset.messageData = JSON.stringify(enhancedData);
        }

        this.eventBus.publish('pipeline.finalized', {
            responseLength: context.responseContent.length,
            hasEnhancedData: !!(context.toolResults || context.reasoning || context.taskStatus),
            timestamp: Date.now()
        });

        return context;
    }
}