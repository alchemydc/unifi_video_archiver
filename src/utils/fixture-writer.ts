import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { WebhookPayload } from '../schemas/webhook.schema.js';
import { logger } from '../config/logger.js';

const FIXTURES_DIR = 'test/fixtures';

/**
 * Saves a validated webhook payload to a timestamped JSON file in the test/fixtures directory.
 */
export async function saveFixture(payload: WebhookPayload): Promise<string> {
    await mkdir(FIXTURES_DIR, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `webhook-${timestamp}.json`;
    const filepath = join(FIXTURES_DIR, filename);

    await writeFile(filepath, JSON.stringify(payload, null, 2));
    logger.info(`Fixture saved: ${filepath}`);

    return filepath;
}
