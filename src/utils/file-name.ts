import type { WebhookPayload } from '../schemas/webhook.schema.js';

/**
 * Generates a safe, descriptive filename for a video clip from a webhook payload.
 * Format: {alarm_name}_{trigger_key}_{ISO_timestamp}.mp4
 */
export function generateClipFilename(payload: WebhookPayload): string {
    const alarmName = payload.alarm.name
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '') // strip special chars
        .trim()
        .replace(/\s+/g, '-'); // replace spaces with -

    const triggerKey = payload.alarm.triggers?.[0]?.key
        .toLowerCase()
        .replace(/_/g, '-') || 'unknown';

    const timestamp = new Date(payload.timestamp)
        .toISOString()
        .replace(/[:.]/g, '-') // filesystem safe
        .slice(0, 19) + 'Z'; // keep up to seconds + Z

    return `${alarmName}_${triggerKey}_${timestamp}.mp4`;
}
