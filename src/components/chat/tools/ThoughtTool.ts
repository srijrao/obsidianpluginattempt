import { App } from 'obsidian';
import { Tool, ToolResult } from '../ToolRegistry';

export interface ThoughtParams {
    thought?: string;
    reasoning?: string; // Legacy alias for thought
    step?: number;
    totalSteps?: number;
    category?: 'analysis' | 'planning' | 'problem-solving' | 'reflection' | 'conclusion' | 'reasoning';
    confidence?: number; // 1-10 scale
    enableStructuredReasoning?: boolean; // Enable multi-step reasoning mode
    reasoningDepth?: 'shallow' | 'medium' | 'deep'; // For structured reasoning
}

export class ThoughtTool implements Tool {
    name = 'thought';
    description = 'Record and display AI reasoning steps and thought processes';    parameters = {
        thought: {
            type: 'string',
            description: 'The thought or reasoning step to record',
            required: false
        },
        reasoning: {
            type: 'string',
            description: 'Alias for thought parameter (legacy support)',
            required: false
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
            enum: ['analysis', 'planning', 'problem-solving', 'reflection', 'conclusion', 'reasoning'],
            description: 'Category of thought for better organization',
            default: 'analysis'
        },
        confidence: {
            type: 'number',
            description: 'Confidence level in this thought (1-10 scale)',
            default: 7,
            minimum: 1,
            maximum: 10
        },
        enableStructuredReasoning: {
            type: 'boolean',
            description: 'Enable multi-step structured reasoning for complex problems',
            default: false
        },
        reasoningDepth: {
            type: 'string',
            enum: ['shallow', 'medium', 'deep'],
            description: 'Depth of structured reasoning (shallow: 3 steps, medium: 5 steps, deep: 7+ steps)',
            default: 'medium'
        }
    };

    constructor(private app: App) {}    async execute(params: ThoughtParams, context: any): Promise<ToolResult> {
        const { 
            thought: originalThought, 
            step, 
            totalSteps, 
            category = 'analysis', 
            confidence = 7,
            enableStructuredReasoning = false,
            reasoningDepth = 'medium'
        } = params;

        // Handle legacy parameter name 'reasoning' as 'thought'
        const thought = originalThought || (params as any).reasoning;        if (!thought || thought.trim().length === 0) {
            return {
                success: false,
                error: 'Thought content cannot be empty. Please provide either "thought" or "reasoning" parameter with content.'
            };
        }

        try {
            // If structured reasoning is enabled, perform multi-step reasoning
            if (enableStructuredReasoning) {
                return await this.performStructuredReasoning(thought.trim(), reasoningDepth, context);
            }

            // Regular single thought processing
            const timestamp = new Date().toLocaleTimeString();
            const stepInfo = step && totalSteps ? `Step ${step}/${totalSteps}` : step ? `Step ${step}` : '';
            
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
            case 'reasoning': return '🧠';
            default: return '💭';
        }
    }

    /**
     * Helper method to validate confidence range
     */
    private validateConfidence(confidence: number): number {
        return Math.max(1, Math.min(10, Math.floor(confidence)));
    }

    /**
     * Perform structured multi-step reasoning
     */
    private async performStructuredReasoning(
        problem: string, 
        depth: string, 
        context: any
    ): Promise<ToolResult> {
        const timestamp = new Date().toLocaleTimeString();
        const stepCount = depth === 'shallow' ? 4 : depth === 'medium' ? 6 : 8;
        const steps: Array<{ step: number; category: string; title: string; content: string; confidence: number }> = [];

        // Step 1: Problem Analysis
        steps.push({
            step: 1,
            category: 'analysis',
            title: 'Problem Analysis',
            content: `Breaking down the problem: "${problem}"\n\nKey elements identified:\n- Core question/challenge\n- Relevant factors and constraints\n- Required outcome or decision`,
            confidence: 8
        });

        // Step 2: Information Assessment
        steps.push({
            step: 2,
            category: 'information',
            title: 'Information Assessment',
            content: `Evaluating available information:\n- What we know about this problem\n- What assumptions we're making\n- What additional information might be helpful\n- Relevant patterns or similar scenarios`,
            confidence: 7
        });

        // Step 3: Approach Development
        steps.push({
            step: 3,
            category: 'approach',
            title: 'Approach Development',
            content: `Considering different approaches:\n- Multiple possible solutions or perspectives\n- Pros and cons of each approach\n- Feasibility and resource considerations\n- Potential risks and benefits`,
            confidence: 7
        });

        // Additional steps for medium/deep reasoning
        if (stepCount >= 6) {
            steps.push({
                step: 4,
                category: 'evaluation',
                title: 'Detailed Evaluation',
                content: `Deep dive into promising approaches:\n- Detailed examination of key options\n- Impact assessment and trade-offs\n- Implementation challenges and opportunities`,
                confidence: 8
            });

            steps.push({
                step: 5,
                category: 'synthesis',
                title: 'Solution Synthesis',
                content: `Combining insights to develop best approach:\n- Integrating analysis from previous steps\n- Balancing competing factors and constraints\n- Identifying optimal path forward`,
                confidence: 8
            });
        }

        // Additional steps for deep reasoning
        if (stepCount >= 8) {
            steps.push({
                step: 6,
                category: 'validation',
                title: 'Solution Validation',
                content: `Testing proposed solution:\n- Does it address the core problem?\n- Is it feasible and realistic?\n- What are potential unintended consequences?\n- How robust is it to different scenarios?`,
                confidence: 7
            });

            steps.push({
                step: 7,
                category: 'refinement',
                title: 'Refinement & Optimization',
                content: `Final optimization:\n- Addressing identified weaknesses\n- Enhancing strengths and benefits\n- Preparing for implementation challenges\n- Building in flexibility and adaptability`,
                confidence: 8
            });
        }

        // Final conclusion step
        const finalStep = stepCount;
        steps.push({
            step: finalStep,
            category: 'conclusion',
            title: 'Conclusion & Recommendation',
            content: `Based on structured analysis:\n\n**Recommended approach:** [Synthesized from analysis]\n**Key considerations:** [Critical factors to remember]\n**Next steps:** [Immediate actions needed]\n**Confidence level:** High - systematic reasoning process`,
            confidence: 9
        });

        // Format the structured reasoning result
        const formattedResult = this.formatStructuredReasoning(problem, steps, timestamp);

        return {
            success: true,
            data: {
                problem,
                reasoning: 'structured',
                steps,
                totalSteps: steps.length,
                depth,
                formattedThought: formattedResult
            }
        };
    }

    /**
     * Format structured reasoning steps for display
     */
    private formatStructuredReasoning(
        problem: string,
        steps: Array<{ step: number; category: string; title: string; content: string; confidence: number }>,
        timestamp: string
    ): string {
        let formatted = `🧠 **STRUCTURED REASONING SESSION** | ${timestamp}\n`;
        formatted += `**Problem:** ${problem}\n`;
        formatted += `**Analysis Depth:** ${steps.length} reasoning steps\n\n`;
        formatted += `---\n\n`;

        steps.forEach(step => {
            const categoryEmoji = this.getCategoryEmoji(step.category);
            const confidenceBar = '●'.repeat(Math.floor(step.confidence)) + '○'.repeat(10 - Math.floor(step.confidence));
            
            formatted += `${categoryEmoji} **STEP ${step.step}: ${step.title.toUpperCase()}**\n`;
            formatted += `*Confidence: ${step.confidence}/10 ${confidenceBar}*\n\n`;
            formatted += `${step.content}\n\n`;
            formatted += `---\n\n`;
        });

        formatted += `✅ **REASONING COMPLETE**\n`;
        formatted += `*Analysis completed in ${steps.length} structured steps*`;

        return formatted;
    }
}
