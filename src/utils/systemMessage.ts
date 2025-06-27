import { MyPluginSettings } from '../types';

/**
 * Generate the system message with optional date and time information
 */
export function getSystemMessage(settings: MyPluginSettings): string {
    let systemMessage = settings.systemMessage;

    if (settings.includeDateWithSystemMessage) {
        const currentDate = new Date().toISOString().split('T')[0];
        systemMessage = `${systemMessage}\n\nThe current date is ${currentDate}.`;
    }

    if (settings.includeTimeWithSystemMessage) {
        const now = new Date();
        const timeZoneOffset = now.getTimezoneOffset();
        const offsetHours = Math.abs(timeZoneOffset) / 60;
        const offsetMinutes = Math.abs(timeZoneOffset) % 60;
        const sign = timeZoneOffset > 0 ? '-' : '+';

        const currentTime = now.toLocaleTimeString();
        const timeZoneString = `UTC${sign}${offsetHours.toString().padStart(2, '0')}:${offsetMinutes.toString().padStart(2, '0')}`;
        systemMessage = `${systemMessage}\n\nThe current time is ${currentTime} ${timeZoneString}.`;
    }

    return systemMessage;
}
