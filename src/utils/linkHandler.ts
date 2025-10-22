import { App } from 'obsidian';

/**
 * Makes all links in a rendered message clickable and opens them in new tabs.
 * This processes both regular markdown links and external URLs.
 * @param container The container element that contains rendered markdown
 * @param app The Obsidian app instance
 */
export function makeLinksClickable(container: HTMLElement, app: App): void {
    // Find all anchor tags (links) in the rendered content
    const links = container.querySelectorAll('a[href]');
    
    links.forEach((link) => {
        const anchor = link as HTMLAnchorElement;
        const href = anchor.getAttribute('href');
        
        if (!href) return;
        
        // Add click handler to open in new tab/workspace
        anchor.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            
            if (href.startsWith('http://') || href.startsWith('https://')) {
                // External URL - open in default browser
                window.open(href, '_blank');
            } else if (href.startsWith('obsidian://')) {
                // Obsidian URI - handle with app
                window.open(href, '_blank');
            } else {
                // Internal link - try to open in new tab/pane
                try {
                    // Check if it's a valid note path
                    const file = app.vault.getAbstractFileByPath(href);
                    if (file && 'stat' in file) {
                        // Open in new tab (cast to TFile since we checked it has stat)
                        app.workspace.getLeaf('tab').openFile(file as any);
                    } else {
                        // Try as obsidian link format [[Note Name]]
                        const noteName = href.replace(/^\[\[|\]\]$/g, '');
                        const noteFile = app.vault.getFiles().find(f => 
                            f.basename === noteName || f.path === noteName
                        );
                        
                        if (noteFile) {
                            app.workspace.getLeaf('tab').openFile(noteFile);
                        } else {
                            // Fallback - try opening as external URL
                            window.open(href, '_blank');
                        }
                    }
                } catch (error) {
                    console.error('Failed to open link:', href, error);
                    // Fallback - try opening as external URL
                    window.open(href, '_blank');
                }
            }
        });
        
        // Add visual indicator that this is clickable
        anchor.style.cursor = 'pointer';
        anchor.style.textDecoration = 'underline';
        anchor.setAttribute('title', `Click to open: ${href}`);
    });
}

/**
 * Makes links clickable in message content after rendering.
 * This is a convenience function that can be called from message rendering code.
 * @param messageElement The message DOM element
 * @param app The Obsidian app instance
 */
export function enableClickableLinksInMessage(messageElement: HTMLElement, app: App): void {
    // Find the message content container
    const contentElement = messageElement.querySelector('.message-content');
    if (contentElement) {
        makeLinksClickable(contentElement as HTMLElement, app);
    }
}