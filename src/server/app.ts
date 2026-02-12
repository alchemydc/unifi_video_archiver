import express, { type Request, type Response } from 'express';
import { logger } from '../config/logger.js';
import { webhookPayloadSchema } from '../schemas/webhook.schema.js';
import type { CaptureOrchestrator } from '../orchestrator/capture-orchestrator.js';

/**
 * Creates and configures the Express application.
 * The orchestrator is injected to keep the app testable.
 */
export function createApp(orchestrator: CaptureOrchestrator): express.Application {
    const app = express();

    // --- Middleware ---
    app.use(express.json());

    // --- Routes ---

    // Health check
    app.get('/health', (_req: Request, res: Response) => {
        res.status(200).json({ status: 'ok', uptime: process.uptime() });
    });

    // Webhook receiver
    app.post('/webhook', async (req: Request, res: Response) => {
        const parseResult = webhookPayloadSchema.safeParse(req.body);

        if (!parseResult.success) {
            logger.warn('Invalid webhook payload received', {
                errors: parseResult.error.flatten(),
            });
            res.status(400).json({ error: 'Invalid payload', details: parseResult.error.flatten() });
            return;
        }

        const payload = parseResult.data;
        logger.info(`Webhook received: ${payload.alarm.name}`, {
            triggers: payload.alarm.triggers?.length ?? 0,
            timestamp: payload.timestamp,
        });

        try {
            const result = await orchestrator.handleWebhook(payload);
            res.status(200).json({
                status: 'archived',
                location: result.location,
                sizeBytes: result.sizeBytes,
            });
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Unknown error';
            logger.error(`Pipeline failed: ${message}`, { error: err });
            res.status(500).json({ error: 'Pipeline failed', message });
        }
    });

    return app;
}
