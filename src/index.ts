import { logger } from './config/logger.js';
import { env } from './config/env.schema.js';

logger.info('UniFi Video Archiver starting...', {
    port: env.WEBHOOK_PORT,
    storage: env.STORAGE_TYPE,
    outputDir: env.OUTPUT_DIR,
});

// Register graceful shutdown
process.on('SIGINT', () => {
    logger.info('Shutting down...');
    process.exit(0);
});
