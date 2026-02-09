import { z } from 'zod';

/**
 * Flexible schema for discovery - uses passthrough to capture unknown fields
 * from UniFi Protect webhook payloads.
 */
export const webhookPayloadSchema = z.object({
    alarm: z.object({
        name: z.string(),
        sources: z.array(z.unknown()).optional(),
        conditions: z.array(z.unknown()).optional(),
        triggers: z.array(z.object({
            key: z.string(),
            device: z.string(),
        })).optional(),
    }).passthrough(),
    timestamp: z.number(),
}).passthrough();

export type WebhookPayload = z.infer<typeof webhookPayloadSchema>;
