/**
 * @file This file provides a utility function for constructing the system message
 * that is sent to the AI model. It allows for dynamic inclusion of the current date
 * and time based on plugin settings, enhancing the AI's contextual awareness.
 */

import { MyPluginSettings } from '../types';

/**
 * Generate the system message with optional date and time information
 * @param settings - The plugin settings containing options and the base system message
 * @returns The system message string, possibly including the current date and time
 */
export function getSystemMessage(settings: MyPluginSettings): string {
    // Start with the base system message from settings
    let systemMessage = settings.systemMessage;

    // If the user wants to include the current time in the system message
    if (settings.includeTimeWithSystemMessage) {
        // Get the current date and time
        const now = new Date();
        // Format the date as YYYY-MM-DD (e.g., 2024-06-10)
        const currentDate = now.toLocaleDateString('en-CA');
        // Get the timezone offset in minutes (difference from UTC)
        const timeZoneOffset = now.getTimezoneOffset();
        // Calculate the offset hours and minutes
        const offsetHours = Math.abs(Math.floor(timeZoneOffset / 60));
        const offsetMinutes = Math.abs(timeZoneOffset) % 60;
        // Determine if the offset is positive or negative
        const sign = timeZoneOffset > 0 ? '-' : '+';
        // Format the current time as a readable string (e.g., 3:45:12 PM)
        const currentTime = now.toLocaleTimeString();
        // Build the timezone string (e.g., UTC+05:30 or UTC-04:00)
        const timeZoneString = `UTC${sign}${offsetHours.toString().padStart(2, '0')}:${offsetMinutes.toString().padStart(2, '0')}`;
        // Append the date, time, and timezone info to the system message
        systemMessage = `${systemMessage}\n\nThe current time is ${currentDate} ${currentTime} ${timeZoneString}.`;
    }

    // Return the final system message
    return systemMessage;
}
