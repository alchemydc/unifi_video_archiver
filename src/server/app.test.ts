import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { type Application } from 'express';
import { createApp } from './app.js';
import type { CaptureOrchestrator } from '../orchestrator/capture-orchestrator.js';
import type { WebhookPayload } from '../schemas/webhook.schema.js';

// Build a valid webhook payload
const makePayload = (): WebhookPayload => ({
    alarm: {
        name: 'Test Alarm',
        triggers: [{ key: 'motion', device: 'AABBCCDDEE11' }],
    },
    timestamp: Date.now(),
});

describe('Express App', () => {
    let mockOrchestrator: { handleWebhook: ReturnType<typeof vi.fn> };
    let app: Application;

    beforeEach(() => {
        mockOrchestrator = {
            handleWebhook: vi.fn().mockResolvedValue({
                location: '/clips/2026-02-12/test.mp4',
                sizeBytes: 1024,
            }),
        };
        app = createApp(mockOrchestrator as unknown as CaptureOrchestrator);
    });

    describe('GET /health', () => {
        it('should return 200 with ok status', async () => {
            const res = await request(app).get('/health');
            expect(res.status).toBe(200);
            expect(res.body.status).toBe('ok');
            expect(res.body.uptime).toBeTypeOf('number');
        });
    });

    describe('POST /webhook', () => {
        it('should return 200 on valid payload', async () => {
            const payload = makePayload();
            const res = await request(app)
                .post('/webhook')
                .send(payload);

            expect(res.status).toBe(200);
            expect(res.body.status).toBe('archived');
            expect(res.body.location).toBeDefined();
            expect(mockOrchestrator.handleWebhook).toHaveBeenCalledWith(
                expect.objectContaining({ timestamp: payload.timestamp }),
            );
        });

        it('should return 400 on invalid payload (missing timestamp)', async () => {
            const res = await request(app)
                .post('/webhook')
                .send({ alarm: { name: 'Test' } });

            expect(res.status).toBe(400);
            expect(res.body.error).toBe('Invalid payload');
        });

        it('should return 400 on empty body', async () => {
            const res = await request(app)
                .post('/webhook')
                .send({});

            expect(res.status).toBe(400);
        });

        it('should return 500 when orchestrator throws', async () => {
            mockOrchestrator.handleWebhook.mockRejectedValue(
                new Error('NVR connection lost'),
            );

            const res = await request(app)
                .post('/webhook')
                .send(makePayload());

            expect(res.status).toBe(500);
            expect(res.body.error).toBe('Pipeline failed');
            expect(res.body.message).toBe('NVR connection lost');
        });
    });
});
