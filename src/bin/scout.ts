import express from 'express';
import { logger } from '../config/logger.js';
import { env } from '../config/env.schema.js';
import { webhookPayloadSchema } from '../schemas/webhook.schema.js';
import { saveFixture } from '../utils/fixture-writer.js';

const app = express();
app.use(express.json());

app.post('/webhook', async (req, res) => {
    logger.debug('Raw payload received', { body: req.body });

    const result = webhookPayloadSchema.safeParse(req.body);

    if (!result.success) {
        logger.warn('Validation failed', { errors: result.error.flatten() });
        return res.status(400).json({
            error: 'Invalid payload',
            details: result.error.flatten()
        });
    }

    logger.info('Valid webhook received', { alarmName: result.data.alarm.name });

    try {
        const filepath = await saveFixture(result.data);
        res.status(200).json({ status: 'ok', fixture: filepath });
    } catch (error) {
        logger.error('Failed to save fixture', { error });
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.listen(env.WEBHOOK_PORT, () => {
    logger.info(`Scout listening on port ${env.WEBHOOK_PORT}`);
});
