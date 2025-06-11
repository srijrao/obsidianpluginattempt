import { App, MarkdownRenderer, Notice, Component } from 'obsidian';
import { Message as MessageType, ReasoningData, ReasoningStep, TaskStatus } from '../../types';
import { createActionButton, copyToClipboard } from './Buttons';
import { ConfirmationModal } from './ConfirmationModal';

/**
 * Base Message interface for chat messages
 */
export interface IMessage {
    role: MessageType['role'];
    content: string;
    render(): Promise<void>;
    setContent(content: string): void;
    getContent(): string;
    delete(): void;
    edit(): void;
    copy(): Promise<void>;
    regenerate(): Promise<void>;
}

/**
 * Base Message class implementing shared functionality
 */
export abstract class Message extends Component implements IMessage {
    protected element: HTMLElement;
    protected contentElement: HTMLElement;
    protected actionsElement: HTMLElement;
    protected rawContent: string;
    protected app: App;
    public role: MessageType['role'];
    public content: string;

    constructor(
        app: App,
        role: MessageType['role'],
        content: string
    ) {
        super();
        this.app = app;
        this.role = role;
        this.content = content;
        this.rawContent = content;
        
        // Create base message structure
        this.element = document.createElement('div');
        this.element.addClass('ai-chat-message', role);
        
        // Create container for content and actions
        const container = this.element.createDiv('message-container');
        
        // Create content element
        this.contentElement = container.createDiv('message-content');
        
        // Create actions container
        this.actionsElement = container.createDiv('message-actions');
        
        // Add hover behavior
        this.element.addEventListener('mouseenter', () => {
            this.actionsElement.removeClass('hidden');
            this.actionsElement.addClass('visible');
        });
        this.element.addEventListener('mouseleave', () => {
            this.actionsElement.removeClass('visible');
            this.actionsElement.addClass('hidden');
        });
    }

    abstract regenerate(): Promise<void>;

    /**
     * Get the DOM element for this message
     */
    getElement(): HTMLElement {
        return this.element;
    }

    /**
     * Get the raw content of the message
     */
    getContent(): string {
        return this.rawContent;
    }

    /**
     * Update the message content
     */
    setContent(content: string): void {
        this.rawContent = content;
        this.render();
    }

    /**
     * Render the message content with Markdown
     */
    async render(): Promise<void> {
        this.contentElement.empty();
        await MarkdownRenderer.render(
            this.app,
            this.rawContent,
            this.contentElement,
            '',
            this
        ).catch((error) => {
            console.error('Markdown rendering error:', error);
            this.contentElement.textContent = this.rawContent;
        });
    }

    /**
     * Delete this message
     */
    delete(): void {
        this.element.remove();
    }

    /**
     * Enable editing of the message
     */
    edit(): void {
        if (this.contentElement.hasClass('editing')) {
            // Save edits
            const textarea = this.contentElement.querySelector('textarea');
            if (textarea) {
                this.setContent(textarea.value);
                this.contentElement.removeClass('editing');
            }
        } else {
            // Switch to edit mode
            const textarea = document.createElement('textarea');
            textarea.value = this.rawContent;
            this.contentElement.empty();
            this.contentElement.appendChild(textarea);
            textarea.focus();
            this.contentElement.addClass('editing');
        }
    }

    /**
     * Copy message content to clipboard
     */
    async copy(): Promise<void> {
        if (this.rawContent.trim() === '') {
            new Notice('No content to copy');
            return;
        }
        try {
            await navigator.clipboard.writeText(this.rawContent);
            new Notice('Copied to clipboard');
        } catch (error) {
            new Notice('Failed to copy to clipboard');
            console.error('Clipboard error:', error);
        }
    }
}

/**
 * Create a message element for the chat with enhanced reasoning and status support
 */
export function createMessageElement(
    app: App,
    role: 'user' | 'assistant',
    content: string,
    chatHistoryManager: any,
    plugin: any,
    regenerateCallback: (messageEl: HTMLElement) => void,
    parentComponent: Component,
    messageData?: MessageType // Accepts full message object
): HTMLElement {
    const messageEl = document.createElement('div');
    messageEl.addClass('ai-chat-message', role);
    const messageContainer = messageEl.createDiv('message-container');
    
    // Store enhanced message data
    messageEl.dataset.rawContent = content;
    messageEl.dataset.timestamp = new Date().toISOString();
    if (messageData) {
        messageEl.dataset.messageData = JSON.stringify(messageData);
    }

    // Add reasoning section for assistant messages if present
    if (role === 'assistant' && messageData?.reasoning) {
        const reasoningEl = createReasoningSection(messageData.reasoning, plugin);
        messageContainer.appendChild(reasoningEl);
    }

    // Add task status section if present
    if (role === 'assistant' && messageData?.taskStatus) {
        const statusEl = createTaskStatusSection(messageData.taskStatus);
        messageContainer.appendChild(statusEl);
    }

    // Add tool results section if present (optional, for future use)
    // if (role === 'assistant' && messageData?.toolResults) {
    //     // Render tool results if needed
    // }

    // Create main content element
    const contentEl = messageContainer.createDiv('message-content');
    MarkdownRenderer.render(app, content, contentEl, '', parentComponent).catch((error) => {
        contentEl.textContent = content;
    });

    // Create actions container
    const actionsEl = messageContainer.createDiv('message-actions');
    actionsEl.classList.add('hidden');
    
    // Add hover behavior
    messageEl.addEventListener('mouseenter', () => {
        actionsEl.classList.remove('hidden');
        actionsEl.classList.add('visible');
    });
    messageEl.addEventListener('mouseleave', () => {
        actionsEl.classList.remove('visible');
        actionsEl.classList.add('hidden');
    });

    // Enhanced copy button that includes reasoning
    actionsEl.appendChild(createActionButton('Copy', 'Copy message (including reasoning)', () => {
        const fullContent = getFullMessageContent(messageEl, plugin);
        if (fullContent.trim() === '') {
            new Notice('No content to copy');
            return;
        }
        copyToClipboard(fullContent);
    }));

    // Edit button
    actionsEl.appendChild(createActionButton('Edit', 'Edit message', async () => {
        if (!contentEl.hasClass('editing')) {
            const textarea = document.createElement('textarea');
            textarea.value = messageEl.dataset.rawContent || '';
            textarea.className = 'message-content editing';
            contentEl.empty();
            contentEl.appendChild(textarea);
            textarea.focus();
            contentEl.addClass('editing');
            textarea.addEventListener('keydown', async (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    textarea.blur();
                }
            });
            textarea.addEventListener('blur', async () => {
                const oldContent = messageEl.dataset.rawContent;
                const newContent = textarea.value;
                let enhancedData = undefined;
                if (messageEl.dataset.messageData) {
                    try {
                        enhancedData = JSON.parse(messageEl.dataset.messageData);
                    } catch {}
                }
                try {
                    await chatHistoryManager.updateMessage(
                        messageEl.dataset.timestamp || new Date().toISOString(),
                        messageEl.classList.contains('user') ? 'user' : 'assistant',
                        oldContent || '',
                        newContent,
                        enhancedData // Pass enhanced data if present
                    );
                    messageEl.dataset.rawContent = newContent;
                    contentEl.empty();
                    await MarkdownRenderer.render(app, newContent, contentEl, '', parentComponent);
                    contentEl.removeClass('editing');
                } catch (e) {
                    new Notice('Failed to save edited message.');
                    messageEl.dataset.rawContent = oldContent || '';
                    contentEl.empty();
                    await MarkdownRenderer.render(app, oldContent || '', contentEl, '', parentComponent);
                    contentEl.removeClass('editing');
                }
            });
        }
    }));

    // Delete button
    actionsEl.appendChild(createActionButton('Delete', 'Delete message', () => {
        const modal = new ConfirmationModal(app, 'Delete message', 'Are you sure you want to delete this message?', (confirmed: boolean) => {
            if (confirmed) {
                chatHistoryManager.deleteMessage(
                    messageEl.dataset.timestamp || new Date().toISOString(),
                    messageEl.classList.contains('user') ? 'user' : 'assistant',
                    messageEl.dataset.rawContent || ''
                ).then(() => {
                    messageEl.remove();
                }).catch(() => {
                    new Notice('Failed to delete message from history.');
                });
            }
        });
        modal.open();
    }));

    // Regenerate button
    actionsEl.appendChild(createActionButton('Regenerate', 'Regenerate this response', () => {
        regenerateCallback(messageEl);
    }));
    
    messageContainer.appendChild(actionsEl);
    return messageEl;
}

/**
 * Create a collapsible reasoning section
 */
function createReasoningSection(reasoning: ReasoningData, plugin: any): HTMLElement {
    const reasoningContainer = document.createElement('div');
    reasoningContainer.className = 'reasoning-container';
    reasoningContainer.dataset.reasoningId = reasoning.id;

    // Create collapsible header
    const header = document.createElement('div');
    header.className = 'reasoning-summary';
    
    const toggle = document.createElement('span');
    toggle.className = 'reasoning-toggle';
    toggle.textContent = reasoning.isCollapsed ? '▶' : '▼';

    const headerText = document.createElement('span');
    const typeLabel = reasoning.type === 'structured' ? 'STRUCTURED REASONING' : 'REASONING';
    const stepCount = reasoning.steps?.length || 0;
    headerText.innerHTML = `<strong>🧠 ${typeLabel}</strong>`;
    if (stepCount > 0) {
        headerText.innerHTML += ` (${stepCount} steps)`;
    }
    if (reasoning.confidence) {
        headerText.innerHTML += ` | Confidence: ${reasoning.confidence}/10`;
    }
    headerText.innerHTML += ` - <em>Click to ${reasoning.isCollapsed ? 'expand' : 'collapse'}</em>`;

    header.appendChild(toggle);
    header.appendChild(headerText);

    // Create details container
    const details = document.createElement('div');
    details.className = 'reasoning-details';
    if (!reasoning.isCollapsed) {
        details.classList.add('expanded');
    }

    // Add problem statement if present
    if (reasoning.problem) {
        const problemDiv = document.createElement('div');
        problemDiv.className = 'reasoning-problem';
        problemDiv.innerHTML = `<strong>Problem:</strong> ${reasoning.problem}`;
        details.appendChild(problemDiv);
    }

    // Add reasoning steps
    if (reasoning.steps && reasoning.steps.length > 0) {
        reasoning.steps.forEach((step: ReasoningStep) => {
            const stepEl = createReasoningStepElement(step);
            details.appendChild(stepEl);
        });
    }

    // Add summary if present
    if (reasoning.summary) {
        const summaryDiv = document.createElement('div');
        summaryDiv.className = 'reasoning-completion';
        summaryDiv.textContent = reasoning.summary;
        details.appendChild(summaryDiv);
    }

    // Add click handler for toggle
    header.addEventListener('click', () => {
        const isExpanded = details.classList.contains('expanded');
        if (isExpanded) {
            details.classList.remove('expanded');
            toggle.textContent = '▶';
            headerText.innerHTML = headerText.innerHTML.replace('collapse', 'expand');
            reasoning.isCollapsed = true;
        } else {
            details.classList.add('expanded');
            toggle.textContent = '▼';
            headerText.innerHTML = headerText.innerHTML.replace('expand', 'collapse');
            reasoning.isCollapsed = false;
        }
        
        // Update the stored message data
        updateStoredMessageData(reasoningContainer, reasoning);
    });

    reasoningContainer.appendChild(header);
    reasoningContainer.appendChild(details);
    
    return reasoningContainer;
}

/**
 * Create a reasoning step element
 */
function createReasoningStepElement(step: ReasoningStep): HTMLElement {
    const stepDiv = document.createElement('div');
    stepDiv.className = `reasoning-step ${step.category}`;

    const categoryEmoji = getStepEmoji(step.category);
    const confidenceBar = '●'.repeat(Math.floor(step.confidence)) + '○'.repeat(10 - Math.floor(step.confidence));

    stepDiv.innerHTML = `
        <div class="step-header">
            ${categoryEmoji} Step ${step.step}: ${step.title.toUpperCase()}
        </div>
        <div class="step-confidence">
            Confidence: ${step.confidence}/10 <span class="confidence-bar">${confidenceBar}</span>
        </div>
        <div class="step-content">
            ${step.content}
        </div>
    `;

    return stepDiv;
}

/**
 * Create a task status section
 */
function createTaskStatusSection(taskStatus: TaskStatus): HTMLElement {
    const statusContainer = document.createElement('div');
    statusContainer.className = 'task-status-container';
    statusContainer.dataset.taskStatus = taskStatus.status;

    const statusText = getTaskStatusText(taskStatus);
    const statusIcon = getTaskStatusIcon(taskStatus.status);

    statusContainer.innerHTML = `
        <div class="task-status-header">
            ${statusIcon} <strong>${statusText}</strong>
        </div>
    `;

    // Add progress bar if progress information is available
    if (taskStatus.progress) {
        const progressContainer = document.createElement('div');
        progressContainer.className = 'task-progress-container';
        
        if (taskStatus.progress.total) {
            const progressBar = document.createElement('div');
            progressBar.className = 'task-progress-bar';
            const progressFill = document.createElement('div');
            progressFill.className = 'task-progress-fill';
            const progressPercent = (taskStatus.progress.current / taskStatus.progress.total) * 100;
            progressFill.style.width = `${progressPercent}%`;
            progressBar.appendChild(progressFill);
            progressContainer.appendChild(progressBar);
            
            const progressText = document.createElement('div');
            progressText.className = 'task-progress-text';
            progressText.textContent = `${taskStatus.progress.current}/${taskStatus.progress.total}`;
            if (taskStatus.progress.description) {
                progressText.textContent += ` - ${taskStatus.progress.description}`;
            }
            progressContainer.appendChild(progressText);
        } else if (taskStatus.progress.description) {
            const progressText = document.createElement('div');
            progressText.className = 'task-progress-text';
            progressText.textContent = taskStatus.progress.description;
            progressContainer.appendChild(progressText);
        }
        
        statusContainer.appendChild(progressContainer);
    }

    // Add tool execution count
    if (taskStatus.toolExecutionCount > 0) {
        const toolInfo = document.createElement('div');
        toolInfo.className = 'task-tool-info';
        toolInfo.textContent = `Tools used: ${taskStatus.toolExecutionCount}/${taskStatus.maxToolExecutions}`;
        statusContainer.appendChild(toolInfo);
    }

    return statusContainer;
}

/**
 * Get full message content including reasoning for copy operations
 */
function getFullMessageContent(messageEl: HTMLElement, plugin: any): string {
    const includeReasoning = plugin?.settings?.uiBehavior?.includeReasoningInExports !== false;
    let content = messageEl.dataset.rawContent || '';
    
    if (includeReasoning) {
        const messageData = messageEl.dataset.messageData;
        if (messageData) {
            try {
                const parsed: MessageType = JSON.parse(messageData);
                if (parsed.reasoning) {
                    content = formatReasoningForExport(parsed.reasoning) + '\n\n' + content;
                }
            } catch (e) {
                // Ignore parsing errors
            }
        }
    }
    
    return content;
}

/**
 * Format reasoning data for export/copy
 */
function formatReasoningForExport(reasoning: ReasoningData): string {
    let formatted = `## 🧠 ${reasoning.type === 'structured' ? 'STRUCTURED REASONING' : 'REASONING'}\n\n`;
    
    if (reasoning.problem) {
        formatted += `**Problem:** ${reasoning.problem}\n\n`;
    }
    
    if (reasoning.steps && reasoning.steps.length > 0) {
        formatted += `### Reasoning Steps\n\n`;
        reasoning.steps.forEach((step: ReasoningStep) => {
            const emoji = getStepEmoji(step.category);
            formatted += `${emoji} **Step ${step.step}: ${step.title}**\n`;
            formatted += `*Confidence: ${step.confidence}/10*\n\n`;
            formatted += `${step.content}\n\n`;
            formatted += `---\n\n`;
        });
    }
    
    if (reasoning.summary) {
        formatted += `**Summary:** ${reasoning.summary}\n\n`;
    }
    
    return formatted;
}

/**
 * Update stored message data in the DOM
 */
function updateStoredMessageData(container: HTMLElement, reasoning: ReasoningData): void {
    const messageEl = container.closest('.ai-chat-message') as HTMLElement;
    if (messageEl && messageEl.dataset.messageData) {
        try {
            const messageData: MessageType = JSON.parse(messageEl.dataset.messageData);
            messageData.reasoning = reasoning;
            messageEl.dataset.messageData = JSON.stringify(messageData);
        } catch (e) {
            // Ignore parsing errors
        }
    }
}

/**
 * Get emoji for reasoning step categories
 */
function getStepEmoji(category: string): string {
    switch (category) {
        case 'analysis': return '🔍';
        case 'planning': return '📋';
        case 'problem-solving': return '🧩';
        case 'reflection': return '🤔';
        case 'conclusion': return '✅';
        case 'reasoning': return '🧠';
        case 'information': return '📊';
        case 'approach': return '🎯';
        case 'evaluation': return '⚖️';
        case 'synthesis': return '🔗';
        case 'validation': return '✅';
        case 'refinement': return '⚡';
        default: return '💭';
    }
}

/**
 * Get task status text
 */
function getTaskStatusText(taskStatus: TaskStatus): string {
    switch (taskStatus.status) {
        case 'idle': return 'Task Ready';
        case 'running': return 'Task In Progress';
        case 'stopped': return 'Task Stopped';
        case 'completed': return 'Task Completed';
        case 'limit_reached': return 'Tool Limit Reached';
        case 'waiting_for_user': return 'Waiting for User Input';
        default: return 'Unknown Status';
    }
}

/**
 * Get task status icon
 */
function getTaskStatusIcon(status: string): string {
    switch (status) {
        case 'idle': return '⏸️';
        case 'running': return '🔄';
        case 'stopped': return '⏹️';
        case 'completed': return '✅';
        case 'limit_reached': return '⚠️';
        case 'waiting_for_user': return '⏳';
        default: return '❓';
    }
}
