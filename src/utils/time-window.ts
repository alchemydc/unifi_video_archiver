export interface TimeWindow {
    start: number; // epoch ms
    end: number;   // epoch ms
}

/**
 * Computes the video export time window from a webhook event timestamp and configurable buffers.
 * @param eventTimestamp Unix epoch ms from the webhook payload.
 * @param preBufferSeconds Seconds to capture before the event.
 * @param postBufferSeconds Seconds to capture after the event.
 * @returns TimeWindow with start and end epoch ms.
 */
export function computeTimeWindow(
    eventTimestamp: number,
    preBufferSeconds: number,
    postBufferSeconds: number
): TimeWindow {
    if (eventTimestamp <= 0) {
        throw new Error('Invalid event timestamp');
    }

    return {
        start: eventTimestamp - preBufferSeconds * 1000,
        end: eventTimestamp + postBufferSeconds * 1000,
    };
}
