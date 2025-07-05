import { NotificationType } from "./types";
import { CONSTANTS } from "./constants";

/**
 * Manages task-related notifications and progress indicators for the agent.
 */
export class TaskNotificationManager {
    // Context containing plugin instance and settings.
    private context: any;

    /**
     * Constructs a TaskNotificationManager with the given context.
     * @param context The plugin context, including settings.
     */
    constructor(context: any) {
        this.context = context;
    }

    /**
     * Creates a DOM element representing a task completion notification.
     * @param message The message to display.
     * @param type The notification type ("success", "error", "warning").
     * @returns The notification HTMLElement.
     */
    createTaskCompletionNotification(
        message: string,
        type: NotificationType = "success"
    ): HTMLElement {
        const notification = document.createElement("div");
        notification.className = `task-completion-notification ${type}`;

        const icon = this.getNotificationIcon(type);
        notification.innerHTML = `
            <div style="display: flex; align-items: center; gap: 8px;">
                <span>${icon}</span>
                <span>${message}</span>
            </div>
        `;

        // Automatically remove the notification after a delay.
        this.setupNotificationAutoRemoval(notification);
        return notification;
    }

    /**
     * Shows a task completion notification if enabled in settings.
     * @param message The message to display.
     * @param type The notification type.
     */
    showTaskCompletionNotification(
        message: string,
        type: NotificationType = "success"
    ): void {
        // Only show notification if enabled in plugin settings.
        if (!this.context.plugin.settings.uiBehavior?.showCompletionNotifications) {
            return;
        }
        const notification = this.createTaskCompletionNotification(message, type);
        document.body.appendChild(notification);
    }

    /**
     * Updates the task progress indicator (not implemented).
     * @param current The current progress value.
     * @param total The total value for completion (optional).
     * @param description Optional description of the progress.
     */
    updateTaskProgress(current: number, total?: number, description?: string): void {
        
    }

    /**
     * Hides the task progress indicator (not implemented).
     */
    hideTaskProgress(): void {
        
    }

    /**
     * Returns an icon string for the given notification type.
     * @param type The notification type.
     * @returns The icon as a string.
     */
    private getNotificationIcon(type: NotificationType): string {
        const icons = {
            success: "✅",
            error: "❌",
            warning: "⚠️"
        };
        return icons[type];
    }

    /**
     * Sets up automatic removal of the notification element after a delay,
     * including a fade-out effect.
     * @param notification The notification HTMLElement.
     */
    private setupNotificationAutoRemoval(notification: HTMLElement): void {
        // Show the notification after a short delay for animation.
        setTimeout(() => {
            notification.classList.add("show");
        }, CONSTANTS.NOTIFICATION_DISPLAY_DELAY);

        // Remove the notification after the auto-remove delay.
        setTimeout(() => {
            notification.classList.remove("show");
            setTimeout(() => notification.remove(), CONSTANTS.NOTIFICATION_FADE_DELAY);
        }, CONSTANTS.NOTIFICATION_AUTO_REMOVE_DELAY);
    }
}
