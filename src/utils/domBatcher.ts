/**
 * Priority 1 Optimization: DOM Batching Utilities
 * 
 * This module provides utilities for batching DOM operations to improve performance
 * by reducing reflows and repaints when adding multiple elements to the DOM.
 */

export interface BatchedDOMOperation {
    element: HTMLElement;
    parent: HTMLElement;
    insertBefore?: HTMLElement | null;
}

/**
 * DOM Batcher for efficient bulk DOM operations
 */
export class DOMBatcher {
    private operations: BatchedDOMOperation[] = [];
    private scheduledFlush = false;

    /**
     * Add an element to be inserted in the next batch
     */
    addElement(element: HTMLElement, parent: HTMLElement, insertBefore?: HTMLElement | null): void {
        this.operations.push({ element, parent, insertBefore });
        this.scheduleFlush();
    }

    /**
     * Add multiple elements to be inserted in the next batch
     */
    addElements(operations: BatchedDOMOperation[]): void {
        this.operations.push(...operations);
        this.scheduleFlush();
    }

    /**
     * Schedule a flush operation using requestAnimationFrame for optimal timing
     */
    private scheduleFlush(): void {
        if (!this.scheduledFlush) {
            this.scheduledFlush = true;
            requestAnimationFrame(() => {
                this.flush();
                this.scheduledFlush = false;
            });
        }
    }

    /**
     * Immediately flush all pending operations
     */
    flush(): void {
        if (this.operations.length === 0) return;

        // Group operations by parent to minimize DOM access
        const operationsByParent = new Map<HTMLElement, BatchedDOMOperation[]>();
        
        for (const operation of this.operations) {
            if (!operationsByParent.has(operation.parent)) {
                operationsByParent.set(operation.parent, []);
            }
            operationsByParent.get(operation.parent)!.push(operation);
        }

        // Process each parent's operations using DocumentFragment
        for (const [parent, parentOperations] of operationsByParent) {
            this.flushForParent(parent, parentOperations);
        }

        // Clear operations
        this.operations.length = 0;
    }

    /**
     * Flush operations for a specific parent using DocumentFragment
     */
    private flushForParent(parent: HTMLElement, operations: BatchedDOMOperation[]): void {
        // Separate operations that need specific insertion points
        const appendOperations: BatchedDOMOperation[] = [];
        const insertOperations: BatchedDOMOperation[] = [];

        for (const operation of operations) {
            if (operation.insertBefore) {
                insertOperations.push(operation);
            } else {
                appendOperations.push(operation);
            }
        }

        // Handle append operations with DocumentFragment
        if (appendOperations.length > 0) {
            const fragment = document.createDocumentFragment();
            for (const operation of appendOperations) {
                fragment.appendChild(operation.element);
            }
            parent.appendChild(fragment);
        }

        // Handle insert operations individually (can't batch these efficiently)
        for (const operation of insertOperations) {
            parent.insertBefore(operation.element, operation.insertBefore!);
        }
    }

    /**
     * Get the number of pending operations
     */
    getPendingCount(): number {
        return this.operations.length;
    }

    /**
     * Clear all pending operations without executing them
     */
    clear(): void {
        this.operations.length = 0;
    }
}

/**
 * Singleton DOM batcher for global use
 */
export const globalDOMBatcher = new DOMBatcher();

/**
 * Utility function to batch append multiple elements to a parent
 */
export function batchAppendElements(parent: HTMLElement, elements: HTMLElement[]): void {
    const fragment = document.createDocumentFragment();
    for (const element of elements) {
        fragment.appendChild(element);
    }
    parent.appendChild(fragment);
}

/**
 * Utility function to create and batch append multiple elements
 */
export function createAndBatchElements(
    parent: HTMLElement,
    elementConfigs: Array<{
        tagName: string;
        className?: string;
        textContent?: string;
        attributes?: Record<string, string>;
    }>
): HTMLElement[] {
    const fragment = document.createDocumentFragment();
    const elements: HTMLElement[] = [];

    for (const config of elementConfigs) {
        const element = document.createElement(config.tagName);
        
        if (config.className) {
            element.className = config.className;
        }
        
        if (config.textContent) {
            element.textContent = config.textContent;
        }
        
        if (config.attributes) {
            for (const [key, value] of Object.entries(config.attributes)) {
                element.setAttribute(key, value);
            }
        }
        
        elements.push(element);
        fragment.appendChild(element);
    }

    parent.appendChild(fragment);
    return elements;
}