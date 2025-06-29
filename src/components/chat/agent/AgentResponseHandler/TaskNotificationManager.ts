import { NotificationType } from "./types";
import { CONSTANTS } from "./constants";

export class TaskNotificationManager {
    private context: any;

    constructor(context: any) {
        this.context = context;
    }

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

        this.setupNotificationAutoRemoval(notification);
        return notification;
    }

    showTaskCompletionNotification(
        message: string,
        type: NotificationType = "success"
    ): void {
        if (!this.context.plugin.settings.uiBehavior?.showCompletionNotifications) {
            return;
        }
        const notification = this.createTaskCompletionNotification(message, type);
        document.body.appendChild(notification);
    }

    updateTaskProgress(current: number, total?: number, description?: string): void {
        // Progress indicator removed
    }

    hideTaskProgress(): void {
        // Progress indicator removed
    }

    private getNotificationIcon(type: NotificationType): string {
        const icons = {
            success: "✅",
            error: "❌",
            warning: "⚠️"
        };
        return icons[type];
    }

    private setupNotificationAutoRemoval(notification: HTMLElement): void {
        setTimeout(() => {
            notification.classList.add("show");
        }, CONSTANTS.NOTIFICATION_DISPLAY_DELAY);

        setTimeout(() => {
            notification.classList.remove("show");
            setTimeout(() => notification.remove(), CONSTANTS.NOTIFICATION_FADE_DELAY);
        }, CONSTANTS.NOTIFICATION_AUTO_REMOVE_DELAY);
    }
}
