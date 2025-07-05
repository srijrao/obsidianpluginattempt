/**
 * @file This file provides a utility function for constructing the system message
 * that is sent to the AI model. It allows for dynamic inclusion of the current date
 * and time based on plugin settings, enhancing the AI's contextual awareness.
 */

import { MyPluginSettings } from '../types';

/**
 * Generate the system message with optional date and time information
 */
export function getSystemMessage(settings: MyPluginSettings): string {
    let systemMessage = settings.systemMessage;

    if (settings.includeTimeWithSystemMessage) {
        const now = new Date();
        const currentDate = now.toISOString().split('T')[0];
        const timeZoneOffset = now.getTimezoneOffset();
        const offsetHours = Math.abs(Math.floor(timeZoneOffset / 60));
        const offsetMinutes = Math.abs(timeZoneOffset) % 60;
        const sign = timeZoneOffset > 0 ? '-' : '+';

        const currentTime = now.toLocaleTimeString();
        const timeZoneString = `UTC${sign}${offsetHours.toString().padStart(2, '0')}:${offsetMinutes.toString().padStart(2, '0')}`;
        systemMessage = `${systemMessage}\n\nThe current time is ${currentDate} ${currentTime} ${timeZoneString}.`;
    }

    return systemMessage;
}
