import { logger } from './config/logger.js';
import { env } from './config/env.schema.js';
import { createUnifiClient } from './clients/unifi-protect-client.js';
import { createStorageProvider } from './storage/index.js';
import { createOrchestrator } from './orchestrator/index.js';
import { createApp } from './server/index.js';
import type { Server } from 'node:http';

async function main(): Promise<void> {
    // 1. Initialize dependencies
    const client = createUnifiClient();
    logger.info('Connecting to UniFi Protect NVR...');
    await client.connect();

    const storage = createStorageProvider();
    const orchestrator = createOrchestrator(client, storage);

    // 2. Create and start Express server
    const app = createApp(orchestrator);
    const server: Server = app.listen(env.WEBHOOK_PORT, () => {
        logger.info(`Server listening on port ${env.WEBHOOK_PORT}`, {
            storage: env.STORAGE_TYPE,
            outputDir: env.OUTPUT_DIR,
        });
    });

    // 3. Graceful shutdown
    const shutdown = async (signal: string) => {
        logger.info(`Received ${signal}, shutting down gracefully...`);
        server.close(() => {
            logger.info('HTTP server closed');
        });
        client.disconnect();
        logger.info('Disconnected from NVR');
        process.exit(0);
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
    logger.error('Fatal startup error', { error: err });
    process.exit(1);
});
