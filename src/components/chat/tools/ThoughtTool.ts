import { App } from 'obsidian';
import { Tool, ToolResult } from '../ToolRegistry';

export interface ThoughtParams {
    thought: string;
    step?: number;
    totalSteps?: number;
    category?: 'analysis' | 'planning' | 'problem-solving' | 'reflection' | 'conclusion';
    confidence?: number; // 1-10 scale
}

export class ThoughtTool implements Tool {
    name = 'thought';
    description = 'Record and display AI reasoning steps and thought processes';
    parameters = {
        thought: {
            type: 'string',
            description: 'The thought or reasoning step to record',
            required: true
        },
        step: {
            type: 'number',
            description: 'Current step number in the thought process',
            required: false
        },
        totalSteps: {
            type: 'number',
            description: 'Total expected steps in the thought process',
            required: false
        },
        category: {
            type: 'string',
            enum: ['analysis', 'planning', 'problem-solving', 'reflection', 'conclusion'],
            description: 'Category of thought for better organization',
            default: 'analysis'
        },
        confidence: {
            type: 'number',
            description: 'Confidence level in this thought (1-10 scale)',
            default: 7,
            minimum: 1,
            maximum: 10
        }
    };

    constructor(private app: App) {}

    async execute(params: ThoughtParams, context: any): Promise<ToolResult> {
        const { 
            thought, 
            step, 
            totalSteps, 
            category = 'analysis', 
            confidence = 7 
        } = params;

        if (!thought || thought.trim().length === 0) {
            return {
                success: false,
                error: 'Thought content cannot be empty'
            };
        }

        try {
            // Format the thought for display
            const timestamp = new Date().toLocaleTimeString();
            const stepInfo = step && totalSteps ? `Step ${step}/${totalSteps}` : step ? `Step ${step}` : '';
            const confidenceBar = '●'.repeat(Math.floor(confidence)) + '○'.repeat(10 - Math.floor(confidence));
            
            // Create structured thought data
            const thoughtData = {
                timestamp,
                thought: thought.trim(),
                step,
                totalSteps,
                category,
                confidence,
                formattedThought: this.formatThought(thought.trim(), stepInfo, category, confidence, timestamp)
            };

            console.log('ThoughtTool: Recording thought:', thoughtData);

            return {
                success: true,
                data: thoughtData
            };
        } catch (error: any) {
            return {
                success: false,
                error: `Failed to record thought: ${error.message}`
            };
        }
    }

    private formatThought(thought: string, stepInfo: string, category: string, confidence: number, timestamp: string): string {
        const categoryEmoji = this.getCategoryEmoji(category);
        const confidenceDisplay = `${confidence}/10`;
        
        let formatted = `${categoryEmoji} **${category.toUpperCase()}**`;
        
        if (stepInfo) {
            formatted += ` | ${stepInfo}`;
        }
        
        formatted += ` | Confidence: ${confidenceDisplay} | ${timestamp}\n`;
        formatted += `> ${thought}`;
        
        return formatted;
    }

    private getCategoryEmoji(category: string): string {
        switch (category) {
            case 'analysis': return '🔍';
            case 'planning': return '📋';
            case 'problem-solving': return '🧩';
            case 'reflection': return '🤔';
            case 'conclusion': return '✅';
            default: return '💭';
        }
    }

    /**
     * Helper method to validate confidence range
     */
    private validateConfidence(confidence: number): number {
        return Math.max(1, Math.min(10, Math.floor(confidence)));
    }
}
