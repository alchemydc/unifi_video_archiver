import { describe, it, expect } from 'vitest';
import { webhookPayloadSchema } from './webhook.schema.js';

describe('webhookPayloadSchema', () => {
    it('should validate a correct payload', () => {
        const validPayload = {
            alarm: {
                name: 'Barking Dog Alert',
                triggers: [{ key: 'motion', device: 'DEVICE_ID_HEX' }]
            },
            timestamp: 1722526793954
        };

        const result = webhookPayloadSchema.safeParse(validPayload);
        expect(result.success).toBe(true);
    });

    it('should fail if timestamp is missing', () => {
        const invalidPayload = {
            alarm: {
                name: 'Barking Dog Alert'
            }
        };

        const result = webhookPayloadSchema.safeParse(invalidPayload);
        expect(result.success).toBe(false);
    });

    it('should fail if alarm name is missing', () => {
        const invalidPayload = {
            alarm: {},
            timestamp: 123456789
        };

        const result = webhookPayloadSchema.safeParse(invalidPayload);
        expect(result.success).toBe(false);
    });

    it('should passthrough unknown fields', () => {
        const payloadWithExtra = {
            alarm: {
                name: 'Test',
                extraField: 'value'
            },
            timestamp: 123,
            rootExtra: 'data'
        };

        const result = webhookPayloadSchema.safeParse(payloadWithExtra);
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data).toMatchObject(payloadWithExtra);
        }
    });
});
